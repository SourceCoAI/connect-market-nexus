import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { logDealActivity } from '@/lib/deal-activity-logger';
import { findIntroductionContacts } from '@/lib/remarketing/findIntroductionContacts';
import type {
  BuyerIntroduction,
  CreateBuyerIntroductionInput,
  UpdateBuyerIntroductionInput,
  ScoreSnapshot,
} from '@/types/buyer-introductions';

export function useBuyerIntroductions(listingId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const queryKey = ['buyer-introductions', listingId];

  const { data: introductions = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buyer_introductions' as never)
        .select('*')
        .eq('listing_id', listingId!)
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const intros = (data || []) as unknown as BuyerIntroduction[];
      const unresolvedCompanyNames = Array.from(
        new Set(
          intros
            .filter((intro) => !intro.remarketing_buyer_id)
            .flatMap((intro) => [intro.buyer_firm_name, intro.buyer_name])
            .filter((value): value is string => !!value?.trim())
            .map((value) => value.trim()),
        ),
      );

      let resolvedBuyerIdsByCompany: Record<string, string> = {};
      let resolvedPeFirmByCompany: Record<string, string> = {};

      if (unresolvedCompanyNames.length > 0) {
        const { data: buyers, error: buyersError } = await supabase
          .from('buyers')
          .select('id, company_name, pe_firm_name')
          .eq('archived', false)
          .in('company_name', unresolvedCompanyNames);

        if (buyersError) throw buyersError;

        resolvedBuyerIdsByCompany = Object.fromEntries(
          (buyers || [])
            .filter((buyer) => !!buyer.company_name)
            .map((buyer) => [buyer.company_name.trim().toLowerCase(), buyer.id]),
        );
        resolvedPeFirmByCompany = Object.fromEntries(
          (buyers || [])
            .filter((buyer) => !!buyer.company_name && !!buyer.pe_firm_name)
            .map((buyer) => [
              buyer.company_name.trim().toLowerCase(),
              buyer.pe_firm_name as string,
            ]),
        );
      }

      return intros.map((intro) => {
        const key = intro.buyer_firm_name?.trim().toLowerCase() || '';
        const nameKey = intro.buyer_name?.trim().toLowerCase() || '';
        return {
          ...intro,
          resolved_buyer_id:
            intro.remarketing_buyer_id ||
            resolvedBuyerIdsByCompany[key] ||
            resolvedBuyerIdsByCompany[nameKey] ||
            null,
          resolved_pe_firm_name:
            (intro.score_snapshot as ScoreSnapshot | null)?.pe_firm_name ||
            resolvedPeFirmByCompany[key] ||
            resolvedPeFirmByCompany[nameKey] ||
            null,
        };
      }) as unknown as BuyerIntroduction[];
    },
    enabled: !!listingId,
  });

  const notIntroduced = introductions.filter(
    (i) =>
      i.introduction_status === 'need_to_show_deal' ||
      i.introduction_status === 'outreach_initiated' ||
      i.introduction_status === 'meeting_scheduled',
  );

  const introducedAndPassed = introductions.filter(
    (i) => i.introduction_status === 'fit_and_interested' || i.introduction_status === 'not_a_fit',
  );

  const createMutation = useMutation({
    mutationFn: async (input: CreateBuyerIntroductionInput) => {
      if (!user?.id) {
        throw new Error('You must be signed in to add a buyer');
      }

      const { data, error } = await supabase
        .from('buyer_introductions' as never)
        .insert({
          ...input,
          introduction_status: 'need_to_show_deal',
          created_by: user.id,
        } as never)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as BuyerIntroduction;
    },
    onSuccess: (data, input) => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Buyer added to introduction pipeline');

      // Log the creation event to introduction_status_log
      if (data?.id) {
        supabase
          .from('introduction_status_log' as never)
          .insert({
            buyer_introduction_id: data.id,
            old_status: null,
            new_status: 'need_to_show_deal',
            changed_by: user?.id,
          } as never)
          .then(() => {});
      }

      // Fire-and-forget: auto-discover contacts for this buyer
      if (input.remarketing_buyer_id) {
        findIntroductionContacts(input.remarketing_buyer_id)
          .then((result) => {
            if (result && result.total_saved > 0) {
              queryClient.invalidateQueries({ queryKey: ['remarketing', 'contacts'] });
              toast.success(
                `${result.total_saved} contact${result.total_saved !== 1 ? 's' : ''} found at ${result.firmName} — see Contacts tab`,
              );
            } else if (result && result.total_saved === 0 && !result.message) {
              toast.info(`No contacts found for ${result.firmName} — try manual search`);
            }
          })
          .catch((err) => {
            console.error('[findIntroductionContacts] Error:', err);
            toast.error('Contact discovery failed — try manual search in the AI Command Center');
          });
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add buyer');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateBuyerIntroductionInput }) => {
      const oldRecord = introductions.find((i) => i.id === id);

      const { data, error } = await supabase
        .from('buyer_introductions' as never)
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Log status change if status was updated
      if (updates.introduction_status && oldRecord) {
        await supabase.from('introduction_status_log' as never).insert({
          buyer_introduction_id: id,
          old_status: oldRecord.introduction_status,
          new_status: updates.introduction_status,
          changed_by: user?.id,
        } as never);
      }

      const updatedRecord = data as unknown as BuyerIntroduction;

      // When status changes to fit_and_interested, create a deal pipeline opportunity
      let pipelineCreated = false;
      if (
        updates.introduction_status === 'fit_and_interested' &&
        oldRecord?.introduction_status !== 'fit_and_interested'
      ) {
        pipelineCreated = await createDealFromIntroduction(updatedRecord);
      }

      return { record: updatedRecord, pipelineCreated };
    },
    onSuccess: (result, { updates }) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deal-stages'] });

      if (updates.introduction_status === 'fit_and_interested') {
        if (result.pipelineCreated) {
          toast.success('Buyer marked as Fit & Interested — opportunity created in deal pipeline');
        } else {
          toast.warning(
            'Buyer marked as Fit & Interested, but pipeline opportunity could not be created. Please create it manually.',
          );
        }
      } else {
        toast.success('Introduction status updated');
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update status');
    },
  });

  /**
   * Creates a deal in the deal_pipeline when a buyer is marked as Fit & Interested.
   * Finds the first active deal stage and creates the opportunity there.
   * Returns true if pipeline entry was created successfully, false otherwise.
   */
  async function createDealFromIntroduction(buyer: BuyerIntroduction): Promise<boolean> {
    try {
      // Phase 5 (F-B1): Use the server-side RPC which wraps contact upsert +
      // deal_pipeline insert + introduction status advance in one transaction.
      const { data: newDealId, error: rpcError } = await (supabase as any).rpc(
        'create_deal_from_introduction',
        { p_introduction_id: buyer.id },
      );

      if (rpcError) throw rpcError;

      if (!newDealId) {
        console.error('create_deal_from_introduction returned null');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to create deal from introduction:', error);
      return false;
    }
  }

  // ── LEGACY CLIENT-SIDE PATH (kept for reference, no longer called) ──────
  // The 3-step client write has been replaced by the create_deal_from_introduction
  // RPC above. Keeping the old function body commented out as documentation of
  // what the RPC consolidates.
  //
   
  // @ts-ignore -- dead code kept for reference
  async function _legacyCreateDealFromIntroduction_DEAD(
    buyer: BuyerIntroduction,
  ): Promise<boolean> {
    try {
      const { data: stages, error: stageError } = await supabase
        .from('deal_stages')
        .select('id, name')
        .eq('is_active', true)
        .order('position', { ascending: true })
        .limit(1);

      if (stageError) throw stageError;

      const firstStage = stages?.[0];
      if (!firstStage) {
        console.error('No active deal stages found for opportunity creation');
        return false;
      }

      let listingTitle = '';
      if (buyer.listing_id) {
        const { data: listing } = await supabase
          .from('listings')
          .select('title')
          .eq('id', buyer.listing_id)
          .single();
        listingTitle = listing?.title || '';
      }

      const dealTitle = `${buyer.buyer_firm_name} — ${listingTitle || buyer.company_name}`;

      let buyerContactId: string | null = null;
      if (buyer.buyer_email) {
        const sanitizedEmail = buyer.buyer_email.toLowerCase().trim().replace(/\/+$/, '');

        const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail);
        if (isValidEmail) {
          const { data: existing } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', sanitizedEmail)
            .eq('contact_type', 'buyer')
            .eq('archived', false)
            .maybeSingle();

          if (existing) {
            buyerContactId = existing.id;
          } else {
            const { data: newContact } = await supabase
              .from('contacts')
              .insert({
                first_name: buyer.buyer_name || '',
                last_name: '',
                email: sanitizedEmail,
                phone: buyer.buyer_phone || null,
                contact_type: 'buyer',
                source: 'remarketing_fit_interested',
                remarketing_buyer_id: buyer.remarketing_buyer_id || null,
              })
              .select('id')
              .single();

            if (newContact) {
              buyerContactId = newContact.id;
            }
          }
        } else {
          console.warn(
            `[createDealFromIntroduction] Invalid email skipped: "${buyer.buyer_email}"`,
          );
        }
      }

      const { data: newDeal, error: dealError } = await supabase
        .from('deal_pipeline')
        .insert({
          title: dealTitle,
          description: `Auto-created from remarketing: ${buyer.buyer_name} at ${buyer.buyer_firm_name} marked as Fit & Interested.${buyer.buyer_feedback ? `\n\nBuyer feedback: ${buyer.buyer_feedback}` : ''}${buyer.next_step ? `\nNext step: ${buyer.next_step}` : ''}`,
          stage_id: firstStage.id,
          listing_id: buyer.listing_id,
          source: 'remarketing',
          nda_status: 'not_sent',
          fee_agreement_status: 'not_sent',
          buyer_contact_id: buyerContactId,
          remarketing_buyer_id: buyer.remarketing_buyer_id || null,
          buyer_introduction_id: buyer.id,
          value: buyer.expected_deal_size_low || 0,
          probability: 10, // Aligned with DB default (see 20260626000000 migration)
          priority: 'medium',
        } as never)
        .select()
        .single();

      if (dealError) throw dealError;

      // Log the deal creation activity
      if (newDeal?.id) {
        await logDealActivity({
          dealId: newDeal.id,
          activityType: 'deal_created',
          title: 'Opportunity Created from Remarketing',
          description: `Deal created automatically when ${buyer.buyer_name} (${buyer.buyer_firm_name}) was marked as Fit & Interested`,
          metadata: {
            buyer_introduction_id: buyer.id,
            buyer_name: buyer.buyer_name,
            buyer_firm: buyer.buyer_firm_name,
            source: 'remarketing_fit_interested',
          },
        });

        // Update introduction status to deal_created now that pipeline deal exists
        await supabase
          .from('buyer_introductions' as never)
          .update({ introduction_status: 'deal_created' } as never)
          .eq('id', buyer.id);
      }

      return true;
    } catch (error) {
      console.error('Failed to create deal from introduction:', error);
      return false;
    }
  }

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('buyer_introductions' as never)
        .update({ archived_at: new Date().toISOString() } as never)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Introduction archived');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to archive');
    },
  });

  const batchArchiveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('buyer_introductions' as never)
        .update({ archived_at: new Date().toISOString() } as never)
        .in('id', ids);

      if (error) throw error;
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(`${ids.length} buyer${ids.length === 1 ? '' : 's'} removed from deal`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to remove buyers');
    },
  });

  const sendToUniverseMutation = useMutation({
    mutationFn: async ({ buyer, universeId }: { buyer: BuyerIntroduction; universeId: string }) => {
      // Check if this buyer already exists in the universe (by remarketing_buyer_id)
      if (buyer.remarketing_buyer_id) {
        const { data: existingBuyer } = await supabase
          .from('buyers')
          .select('id, universe_id')
          .eq('id', buyer.remarketing_buyer_id)
          .single();

        if (existingBuyer?.universe_id === universeId) {
          throw new Error('This buyer is already in the buyer universe');
        }
      }

      // Check for duplicate by company name in this universe
      const { data: duplicates } = await supabase
        .from('buyers')
        .select('id, company_name')
        .eq('universe_id', universeId)
        .eq('archived', false)
        .ilike('company_name', buyer.buyer_name);

      if (duplicates && duplicates.length > 0) {
        throw new Error(
          `A buyer named "${duplicates[0].company_name}" already exists in this universe`,
        );
      }

      // Create the buyer in the universe
      const { data: newBuyer, error } = await supabase
        .from('buyers')
        .insert({
          universe_id: universeId,
          company_name: buyer.buyer_name,
          company_website: (buyer.score_snapshot as ScoreSnapshot | null)?.company_website || null,
          pe_firm_name: buyer.buyer_firm_name !== buyer.buyer_name ? buyer.buyer_firm_name : null,
          buyer_type: (buyer.score_snapshot as ScoreSnapshot | null)?.buyer_type || 'corporate',
          hq_city: (buyer.score_snapshot as ScoreSnapshot | null)?.hq_city || null,
          hq_state: (buyer.score_snapshot as ScoreSnapshot | null)?.hq_state || null,
          has_fee_agreement:
            (buyer.score_snapshot as ScoreSnapshot | null)?.has_fee_agreement || false,
          notes: buyer.targeting_reason || null,
        } as never)
        .select('id')
        .single();

      if (error) throw error;

      // Update the introduction to link to the new remarketing buyer
      if (newBuyer?.id) {
        await supabase
          .from('buyer_introductions' as never)
          .update({ remarketing_buyer_id: newBuyer.id } as never)
          .eq('id', buyer.id);
      }

      // Queue scoring for the new buyer against all deals in this universe
      const { data: universeDeals } = await supabase
        .from('remarketing_universe_deals')
        .select('listing_id')
        .eq('universe_id', universeId);

      if (universeDeals && universeDeals.length > 0) {
        const { queueDealScoring } = await import('@/lib/remarketing/queueScoring');
        await queueDealScoring({ universeId, listingIds: universeDeals.map((d) => d.listing_id) });
      }

      return newBuyer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['remarketing'] });
      toast.success('Buyer added to buyer universe');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add buyer to universe');
    },
  });

  return {
    introductions,
    notIntroduced,
    introducedAndPassed,
    isLoading,
    createIntroduction: createMutation.mutate,
    isCreating: createMutation.isPending,
    updateStatus: updateStatusMutation.mutate,
    isUpdating: updateStatusMutation.isPending,
    archiveIntroduction: archiveMutation.mutate,
    batchArchiveIntroductions: batchArchiveMutation.mutate,
    isBatchArchiving: batchArchiveMutation.isPending,
    sendBuyerToUniverse: sendToUniverseMutation.mutate,
    isSendingToUniverse: sendToUniverseMutation.isPending,
  };
}
