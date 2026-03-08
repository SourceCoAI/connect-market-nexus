import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
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
      return (data || []) as unknown as BuyerIntroduction[];
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
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Buyer added to introduction pipeline');

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
      if (
        updates.introduction_status === 'fit_and_interested' &&
        oldRecord?.introduction_status !== 'fit_and_interested'
      ) {
        await createDealFromIntroduction(updatedRecord);
      }

      return updatedRecord;
    },
    onSuccess: (_data, { updates }) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deal-stages'] });

      if (updates.introduction_status === 'fit_and_interested') {
        toast.success('Buyer marked as Fit & Interested — opportunity created in deal pipeline');
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
   */
  async function createDealFromIntroduction(buyer: BuyerIntroduction) {
    try {
      // Get the first (default) deal stage
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
        return;
      }

      // Look up listing title for the deal title
      let listingTitle = '';
      if (buyer.listing_id) {
        const { data: listing } = await supabase
          .from('listings')
          .select('title')
          .eq('id', buyer.listing_id)
          .single();
        listingTitle = listing?.title || '';
      }

      // Create the deal in the pipeline
      const dealTitle = `${buyer.buyer_firm_name} — ${listingTitle || buyer.company_name}`;

      // Upsert buyer contact if we have email
      let buyerContactId: string | null = null;
      if (buyer.buyer_email) {
        const nameParts = buyer.buyer_name.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const { data: contact } = await supabase
          .from('contacts')
          .upsert(
            {
              first_name: firstName,
              last_name: lastName,
              email: buyer.buyer_email.toLowerCase().trim(),
              phone: buyer.buyer_phone || null,
              contact_type: 'buyer',
              source: 'remarketing_fit_interested',
            },
            { onConflict: 'email' },
          )
          .select('id')
          .single();

        if (contact) {
          buyerContactId = contact.id;
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
          remarketing_buyer_id: buyer.id,
          value: buyer.expected_deal_size_low || 0,
          probability: 25,
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
      }
    } catch (error) {
      console.error('Failed to create deal from introduction:', error);
      // Don't fail the status update, just log and show a warning
      toast.error(
        'Status updated but failed to create deal pipeline opportunity. Please create it manually.',
      );
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
