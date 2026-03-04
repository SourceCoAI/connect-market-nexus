import { supabase } from '@/integrations/supabase/client';
import {
  SizeCriteria,
  GeographyCriteria,
  ServiceCriteria,
  BuyerTypesCriteria,
  ScoringBehavior,
} from '@/types/remarketing';
import { toast } from 'sonner';
import type { UseUniverseDataReturn } from './useUniverseData';

/**
 * T33 FIX: Sync key fields from marketplace firm_agreements to buyers
 * so the same buyer shows consistent data across both views.
 */
async function syncBuyerFromMarketplace(client: typeof supabase, buyerId: string, firmId: string) {
  try {
    const { data: firmAgreement } = await client
      .from('firm_agreements')
      .select('*')
      .eq('firm_id', firmId)
      .maybeSingle();

    if (firmAgreement) {
      const fa = firmAgreement as any;
      const updates: Record<string, unknown> = {};
      if (fa.company_name) {
        updates.company_name = fa.company_name;
      }
      if (fa.buyer_type) {
        updates.buyer_type = fa.buyer_type;
      }
      if (Object.keys(updates).length > 0) {
        await client.from('buyers').update(updates).eq('id', buyerId);
      }
    }
  } catch (err) {
    // Non-blocking: log but don't fail the main operation
    console.warn('[T33] Failed to sync buyer fields from marketplace:', err);
  }
}

export function useUniverseActions(data: UseUniverseDataReturn) {
  const {
    id,
    queryClient,
    formData,
    setFormData,
    setSizeCriteria,
    setGeographyCriteria,
    setServiceCriteria,
    setBuyerTypesCriteria,
    setScoringBehavior,
    setIsParsing,
    buyers,
    queueProgress: _queueProgress,
    queueBuyers,
    resetQueueEnrichment,
    setShowBuyerEnrichDialog,
    selectedBuyerIds,
    setSelectedBuyerIds,
    setIsRemovingSelected,
  } = data;

  // Handle template application
  const handleApplyTemplate = (templateConfig: {
    name: string;
    description: string;
    fit_criteria: string;
    size_criteria: SizeCriteria;
    geography_criteria: GeographyCriteria;
    service_criteria: ServiceCriteria;
    buyer_types_criteria: BuyerTypesCriteria;
    scoring_behavior: ScoringBehavior;
    geography_weight: number;
    size_weight: number;
    service_weight: number;
    owner_goals_weight: number;
  }) => {
    setFormData({
      name: templateConfig.name,
      description: templateConfig.description,
      fit_criteria: templateConfig.fit_criteria,
      geography_weight: templateConfig.geography_weight,
      size_weight: templateConfig.size_weight,
      service_weight: templateConfig.service_weight,
      owner_goals_weight: templateConfig.owner_goals_weight,
    });
    setSizeCriteria(templateConfig.size_criteria);
    setGeographyCriteria(templateConfig.geography_criteria);
    setServiceCriteria(templateConfig.service_criteria);
    setBuyerTypesCriteria(templateConfig.buyer_types_criteria);
    setScoringBehavior(templateConfig.scoring_behavior);
  };

  // Parse natural language criteria using AI
  const parseCriteria = async () => {
    if (!formData.fit_criteria.trim()) {
      toast.error('Please enter fit criteria text first');
      return;
    }

    setIsParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-fit-criteria', {
        body: {
          fit_criteria_text: formData.fit_criteria,
          universe_name: formData.name,
        },
      });

      if (error) throw error;

      if (data) {
        if (data.size_criteria) setSizeCriteria((prev) => ({ ...prev, ...data.size_criteria }));
        if (data.geography_criteria)
          setGeographyCriteria((prev) => ({ ...prev, ...data.geography_criteria }));
        if (data.service_criteria)
          setServiceCriteria((prev) => ({ ...prev, ...data.service_criteria }));
        if (data.buyer_types_criteria)
          setBuyerTypesCriteria((prev) => ({ ...prev, ...data.buyer_types_criteria }));
        if (data.scoring_behavior)
          setScoringBehavior((prev) => ({ ...prev, ...data.scoring_behavior }));

        toast.success(
          `Parsed criteria with ${Math.round((data.confidence || 0.5) * 100)}% confidence`,
        );
      }
    } catch (error) {
      toast.error('Failed to parse criteria');
    } finally {
      setIsParsing(false);
    }
  };

  // Handler for removing buyers from this universe (sets universe_id to null)
  // They remain in the all buyers list - just unlinked from this universe
  const handleRemoveBuyersFromUniverse = async (buyerIds: string[]) => {
    if (!buyerIds.length) return;

    const { error } = await supabase
      .from('buyers')
      .update({ universe_id: null })
      .in('id', buyerIds);

    if (error) {
      toast.error('Failed to remove buyers from universe');
      throw error;
    }

    toast.success(
      `Removed ${buyerIds.length} buyer${buyerIds.length > 1 ? 's' : ''} from universe`,
    );
    queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyers', 'universe', id] });
  };

  // Handler for single buyer enrichment via row dropdown
  const handleEnrichSingleBuyer = async (buyerId: string) => {
    const buyer = buyers?.find((b) => b.id === buyerId);
    if (!buyer) return;
    await queueBuyers([
      {
        id: buyer.id,
        company_website: buyer.company_website ?? null,
        platform_website: buyer.platform_website ?? null,
        pe_firm_website: buyer.pe_firm_website ?? null,
      },
    ]);
  };

  // Handler for single buyer removal from universe via row dropdown
  // Just unlinks from universe - buyer remains in All Buyers
  const handleDeleteBuyer = async (buyerId: string) => {
    const { error } = await supabase.from('buyers').update({ universe_id: null }).eq('id', buyerId);

    if (error) {
      toast.error('Failed to remove buyer');
      return;
    }

    toast.success('Buyer removed from universe');
    queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyers', 'universe', id] });
  };

  const handleToggleFeeAgreement = async (buyerId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;

    // Fetch the buyer to get website/firm info for marketplace bridging
    const { data: buyer, error: buyerError } = await supabase
      .from('buyers')
      .select(
        'id, company_name, company_website, pe_firm_name, pe_firm_website, buyer_type, marketplace_firm_id, fee_agreement_source',
      )
      .eq('id', buyerId)
      .single();
    if (buyerError) throw buyerError;

    if (!buyer) {
      toast.error('Buyer not found');
      return;
    }

    if (newStatus) {
      // TURNING ON: Write to both buyers AND firm_agreements
      let firmId = buyer.marketplace_firm_id;

      if (!firmId) {
        // Try to find or create the firm in marketplace via get_or_create_firm()
        const firmName = buyer.pe_firm_name || buyer.company_name;
        const firmWebsite = buyer.pe_firm_website || buyer.company_website;

        if (firmName) {
          const { data: createdFirmId, error: createdFirmIdError } = await supabase.rpc(
            'get_or_create_firm',
            {
              p_company_name: firmName,
              p_website: firmWebsite ?? undefined,
              p_email: undefined,
            },
          );
          if (createdFirmIdError) throw createdFirmIdError;

          if (createdFirmId) {
            firmId = createdFirmId;
            // Link the buyer to the marketplace firm
            await supabase.from('buyers').update({ marketplace_firm_id: firmId }).eq('id', buyerId);

            // T33 FIX: Sync key fields from firm_agreements to buyers
            // so the same buyer shows consistent data across marketplace and remarketing views
            await syncBuyerFromMarketplace(supabase, buyerId, firmId);
          }
        }
      }

      if (firmId) {
        // T33 FIX: Always sync key fields when marketplace_firm_id link exists
        // (covers the case where firmId was already set on the buyer)
        await syncBuyerFromMarketplace(supabase, buyerId, firmId);

        // Sign the fee agreement on the marketplace side (uses existing cascading function)
        await supabase.rpc('update_fee_agreement_firm_status', {
          p_firm_id: firmId,
          p_is_signed: true,
          p_signed_by_user_id: undefined,
          p_signed_at: new Date().toISOString(),
        });
      }

      // Update remarketing buyer directly (the trigger may also fire, but this ensures it)
      const { error } = await supabase
        .from('buyers')
        .update({
          has_fee_agreement: true,
          fee_agreement_source: firmId ? 'marketplace_synced' : 'manual_override',
        })
        .eq('id', buyerId);

      if (error) {
        toast.error('Failed to update fee agreement');
        return;
      }

      toast.success('Fee agreement marked — synced to marketplace');
    } else {
      // TURNING OFF: Only allow removal of manual overrides
      if (
        buyer.fee_agreement_source === 'marketplace_synced' ||
        buyer.fee_agreement_source === 'pe_firm_inherited'
      ) {
        toast.error(
          'This fee agreement comes from the marketplace. Remove it from the Firm Agreements page instead.',
        );
        return;
      }

      const { error } = await supabase
        .from('buyers')
        .update({
          has_fee_agreement: false,
          fee_agreement_source: null,
        })
        .eq('id', buyerId);

      if (error) {
        toast.error('Failed to remove fee agreement');
        return;
      }

      toast.success('Fee agreement removed');
    }

    queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyers', 'universe', id] });
    queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
  };

  // Handler for bulk removal of selected buyers from universe
  const handleRemoveSelectedBuyers = async () => {
    if (!selectedBuyerIds.length) return;

    setIsRemovingSelected(true);
    try {
      await handleRemoveBuyersFromUniverse(selectedBuyerIds);
      setSelectedBuyerIds([]);
    } finally {
      setIsRemovingSelected(false);
    }
  };

  // Handler for buyer enrichment with mode selection - uses queue for background processing
  const handleBuyerEnrichment = async (_mode: 'all' | 'unenriched') => {
    setShowBuyerEnrichDialog(false);

    if (!buyers?.length) {
      toast.error('No buyers to enrich');
      return;
    }

    resetQueueEnrichment();

    // Filter based on mode
    const buyersToEnrich = buyers;

    if (buyersToEnrich.length === 0) {
      toast.info('All buyers are already enriched');
      return;
    }

    // Queue for background processing (persists even when navigating away)
    await queueBuyers(
      buyersToEnrich.map((b) => ({
        id: b.id,
        company_website: b.company_website,
        platform_website: b.platform_website,
        pe_firm_website: b.pe_firm_website,
      })),
    );
  };

  return {
    handleApplyTemplate,
    parseCriteria,
    handleRemoveBuyersFromUniverse,
    handleEnrichSingleBuyer,
    handleDeleteBuyer,
    handleToggleFeeAgreement,
    handleRemoveSelectedBuyers,
    handleBuyerEnrichment,
  };
}
