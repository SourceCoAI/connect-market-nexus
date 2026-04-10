import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDealStages, useCreateDeal } from '@/hooks/admin/use-deals';
import { useListingsQuery } from '@/hooks/admin/listings/use-listings-query';
import { useAdminProfiles } from '@/hooks/admin/use-admin-profiles';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logDealActivity } from '@/lib/deal-activity-logger';
import { useToast } from '@/hooks/use-toast';
import { createPairingSchema, CreatePairingFormData, DuplicatePairing } from './schema';

function useBuyersForPairing(enabled: boolean) {
  return useQuery({
    queryKey: ['buyers-for-pairing'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buyers')
        .select('id, company_name, buyer_type, archived')
        .eq('archived', false)
        .order('company_name', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled,
  });
}

export function useCreateDealForm(
  open: boolean,
  onOpenChange: (open: boolean) => void,
  prefilledStageId?: string,
  onDealCreated?: (dealId: string) => void,
) {
  const { data: stages } = useDealStages();
  const { data: listings } = useListingsQuery('active', open);
  const { data: adminProfilesMap } = useAdminProfiles();
  const { data: buyers } = useBuyersForPairing(open);
  const adminUsers = adminProfilesMap ? Object.values(adminProfilesMap) : [];
  const createDealMutation = useCreateDeal();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [duplicates, setDuplicates] = useState<DuplicatePairing[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [pendingData, setPendingData] = useState<CreatePairingFormData | null>(null);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  const form = useForm<CreatePairingFormData>({
    resolver: zodResolver(createPairingSchema as never),
    defaultValues: {
      title: '',
      description: '',
      stage_id: prefilledStageId || stages?.[0]?.id || '',
      listing_id: '',
      buyer_id: '',
      priority: 'medium',
      value: undefined,
      probability: 50,
      expected_close_date: undefined,
      assigned_to: undefined,
    },
  });

  // Update stage when prefilledStageId changes
  useEffect(() => {
    if (prefilledStageId) {
      form.setValue('stage_id', prefilledStageId);
    }
  }, [prefilledStageId, form]);

  // Watch for stage changes to auto-populate probability
  const selectedStageId = form.watch('stage_id');

  useEffect(() => {
    if (selectedStageId && stages) {
      const selectedStage = stages.find((stage) => stage.id === selectedStageId);
      if (selectedStage && selectedStage.default_probability !== undefined) {
        form.setValue('probability', selectedStage.default_probability);
      }
    }
  }, [selectedStageId, stages, form]);

  // Check for duplicate pairings — same buyer + listing already in pipeline
  const checkDuplicates = async (buyerId: string, listingId: string): Promise<DuplicatePairing[]> => {
    try {
      const { data, error } = await supabase
        .from('deal_pipeline')
        .select('id, title, created_at, remarketing_buyer_id')
        .eq('remarketing_buyer_id', buyerId)
        .eq('listing_id', listingId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      const buyer = buyers?.find((b) => b.id === buyerId);

      return (data || []).map((deal) => ({
        id: deal.id,
        title: deal.title || '',
        buyer_name: buyer?.company_name || null,
        created_at: deal.created_at,
      }));
    } catch (error) {
      console.error('Error checking duplicates:', error);
      return [];
    }
  };

  const handleFormSubmit = async (data: CreatePairingFormData) => {
    setIsCheckingDuplicates(true);
    const foundDuplicates = await checkDuplicates(data.buyer_id, data.listing_id);
    setIsCheckingDuplicates(false);

    if (foundDuplicates.length > 0) {
      setDuplicates(foundDuplicates);
      setPendingData(data);
      setShowDuplicateWarning(true);
      return;
    }

    await createPairing(data);
  };

  const createPairing = async (data: CreatePairingFormData) => {
    try {
      // Find primary contact for the buyer if one exists
      let buyerContactId: string | null = null;
      const { data: buyerContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('remarketing_buyer_id', data.buyer_id)
        .eq('contact_type', 'buyer')
        .eq('archived', false)
        .limit(1)
        .maybeSingle();

      if (buyerContact) {
        buyerContactId = buyerContact.id;
      }

      const { buyer_id, ...dealFields } = data;

      const payload: Record<string, unknown> = {
        ...dealFields,
        remarketing_buyer_id: buyer_id,
        buyer_contact_id: buyerContactId,
        source: 'manual',
        nda_status: 'not_sent',
        fee_agreement_status: 'not_sent',
        buyer_priority_score: 0,
        assigned_to: data.assigned_to && data.assigned_to !== '' ? data.assigned_to : null,
      };

      const newDeal = await createDealMutation.mutateAsync(payload);

      // Log activity
      if (newDeal?.id) {
        await logDealActivity({
          dealId: newDeal.id,
          activityType: 'deal_created',
          title: 'Pairing Created',
          description: `Pairing "${data.title}" was created manually`,
        });
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deal-stages'] });

      toast({
        title: 'Pairing Created',
        description: `"${data.title}" has been added to your pipeline.`,
      });

      // Auto-select the newly created deal
      if (newDeal?.id && onDealCreated) {
        onDealCreated(newDeal.id);
      }

      // Reset and close
      form.reset();
      onOpenChange(false);
    } catch (error) {
      // Error toast already shown by useCreateDeal
    }
  };

  const handleCreateAnyway = async () => {
    if (pendingData) {
      setShowDuplicateWarning(false);
      await createPairing(pendingData);
      setPendingData(null);
      setDuplicates([]);
    }
  };

  const handleCancelDuplicate = () => {
    setShowDuplicateWarning(false);
    setPendingData(null);
    setDuplicates([]);
  };

  // Format buyer options for combobox
  const buyerOptions = React.useMemo(() => {
    if (!buyers || buyers.length === 0) return [];

    return buyers.map((buyer) => {
      const buyerType = buyer.buyer_type ? ` - ${buyer.buyer_type}` : '';

      const searchParts = [
        buyer.company_name,
        buyer.buyer_type || '',
        ...(buyer.company_name ? buyer.company_name.split(/\s+/) : []),
      ].filter(Boolean);

      // Generate progressive prefixes for better search
      const terms = new Set<string>();
      searchParts.forEach((word) => {
        const cleaned = word.toLowerCase().trim();
        if (!cleaned) return;
        terms.add(cleaned);
        for (let i = 1; i <= cleaned.length; i++) {
          terms.add(cleaned.substring(0, i));
        }
      });

      return {
        value: buyer.id,
        label: `${buyer.company_name}${buyerType}`,
        searchTerms: Array.from(terms).join(' '),
      };
    });
  }, [buyers]);

  return {
    form,
    stages,
    listings,
    adminUsers,
    buyers,
    buyerOptions,
    createDealMutation,
    duplicates,
    showDuplicateWarning,
    setShowDuplicateWarning,
    isCheckingDuplicates,
    handleFormSubmit,
    handleCreateAnyway,
    handleCancelDuplicate,
  };
}
