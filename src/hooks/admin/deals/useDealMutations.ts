import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Deal } from './types';

export function useUpdateDealStage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      dealId,
      stageId,
      currentAdminId,
      skipOwnerCheck,
    }: {
      dealId: string;
      stageId: string;
      fromStage?: string;
      toStage?: string;
      currentAdminId?: string;
      skipOwnerCheck?: boolean;
    }) => {
      // If not skipping owner check, verify ownership first
      if (!skipOwnerCheck && currentAdminId) {
        const { data: dealData, error: dealDataError } = await supabase
          .from('deal_pipeline')
          .select(
            'assigned_to, title, assigned_admin:profiles!deals_assigned_to_fkey(first_name, last_name)',
          )
          .eq('id', dealId)
          .single();
        if (dealDataError) throw dealDataError;

        // Check if someone else owns this deal
        if (dealData?.assigned_to && dealData.assigned_to !== currentAdminId) {
          const ownerName = dealData.assigned_admin
            ? `${dealData.assigned_admin.first_name} ${dealData.assigned_admin.last_name}`.trim()
            : 'Another admin';

          // Return a special error that will trigger the warning dialog
          throw {
            type: 'OWNER_WARNING',
            ownerName,
            dealTitle: dealData.title,
            ownerId: dealData.assigned_to,
            dealId,
            stageId,
          };
        }
      }

      // Use new RPC function with ownership logic
      const { data, error } = await supabase.rpc('move_deal_stage_with_ownership', {
        p_deal_id: dealId,
        p_new_stage_id: stageId,
        p_current_admin_id: currentAdminId ?? '',
      });

      if (error) throw error;
      return data;
    },
    onMutate: async ({ dealId, stageId, toStage }) => {
      // cancel ongoing refetches
      await queryClient.cancelQueries({ queryKey: ['deals'] });
      const previousDeals = queryClient.getQueryData<Deal[]>(['deals']);
      const nowIso = new Date().toISOString();
      if (previousDeals) {
        queryClient.setQueryData<Deal[]>(['deals'], (old) =>
          (old || []).map((d) =>
            d.deal_id === dealId
              ? {
                  ...d,
                  stage_id: stageId,
                  stage_name: toStage ?? d.stage_name,
                  deal_stage_entered_at: nowIso,
                  deal_updated_at: nowIso,
                }
              : d,
          ),
        );
      }
      return { previousDeals };
    },
    onSuccess: async (data: unknown, variables) => {
      const result = data as Record<string, unknown> | null;
      // Handle ownership assignment notifications
      if (result?.owner_assigned) {
        toast({
          title: 'Deal Assigned',
          description: 'You have been assigned as the owner of this deal.',
        });
      }

      if (result?.different_owner_warning) {
        toast({
          title: 'Different Owner',
          description: `This deal is owned by ${result.previous_owner_name || 'another admin'}. They will be notified of this change.`,
          variant: 'default',
        });

        // Send email notification to original owner
        const deals = queryClient.getQueryData<Deal[]>(['deals']);
        const deal = deals?.find((d) => d.deal_id === variables.dealId);

        if (deal && result.previous_owner_id && result.previous_owner_name) {
          try {
            // Get current admin info
            const {
              data: { user },
              error: authError,
            } = await supabase.auth.getUser();
            if (authError) throw authError;
            const { data: currentAdmin, error: currentAdminError } = await supabase
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', user?.id ?? '')
              .single();
            if (currentAdminError) throw currentAdminError;

            const currentAdminName = currentAdmin
              ? `${currentAdmin.first_name} ${currentAdmin.last_name}`.trim()
              : 'Another admin';

            await supabase.functions.invoke('notify-deal-owner-change', {
              body: {
                dealId: deal.deal_id,
                dealTitle: deal.title,
                previousOwnerId: result.previous_owner_id,
                previousOwnerName: result.previous_owner_name,
                modifyingAdminId: user?.id,
                modifyingAdminName: currentAdminName,
                oldStageName: result.old_stage_name,
                newStageName: result.new_stage_name,
                listingTitle: deal.listing_title,
                companyName: deal.listing_real_company_name,
              },
            });
          } catch (error) {
            console.error('Failed to send owner change notification:', error);
            // Don't fail the stage move, just log
          }
        }
      }

      // H-5 FIX: Use stage type instead of hardcoded name string for triggering
      // owner intro notification. The stage type is set in the DB and won't break if renamed.
      // Fetch the target stage's type to decide behavior.
      const newStageName = result?.new_stage_name as string | undefined;
      const newStageType = result?.new_stage_type as string | undefined;
      // Support both: stage type 'owner_intro' (preferred) or legacy name match (fallback)
      if (newStageType === 'owner_intro' || newStageName === 'Owner intro requested') {
        const deals = queryClient.getQueryData<Deal[]>(['deals']);
        const deal = deals?.find((d) => d.deal_id === variables.dealId);

        if (deal && deal.listing_id) {
          try {
            // Get deal owner info
            const { data: ownerData, error: ownerDataError } = await supabase
              .from('profiles')
              .select('first_name, last_name, email')
              .eq('id', deal.assigned_to ?? '')
              .single();
            if (ownerDataError) throw ownerDataError;

            const dealOwnerName = ownerData
              ? `${ownerData.first_name} ${ownerData.last_name}`.trim()
              : undefined;
            const dealOwnerEmail = ownerData?.email;

            const result = await supabase.functions.invoke('send-owner-intro-notification', {
              body: {
                dealId: deal.deal_id,
                listingId: deal.listing_id,
                buyerName: deal.buyer_name || deal.contact_name || 'Unknown',
                buyerEmail: deal.buyer_email || deal.contact_email || '',
                buyerCompany: deal.buyer_company || deal.contact_company,
                dealValue: deal.deal_value,
                dealTitle: deal.title,
                dealOwnerName,
                dealOwnerEmail,
              },
            });

            if (result.error) {
              toast({
                title: 'Notification Failed',
                description:
                  'The owner intro email could not be sent. Please notify the owner manually.',
                variant: 'destructive',
              });
            } else if (result.data?.success) {
              if (result.data?.duplicate) {
                toast({
                  title: 'Already Notified',
                  description: 'This owner was recently notified about this introduction.',
                });
              } else {
                const ownerName = result.data.primary_owner_name || 'the primary owner';
                toast({
                  title: 'Owner Notified',
                  description: `${ownerName} has been notified of this introduction request via email.`,
                });
              }
            } else {
              toast({
                title: 'Stage Updated',
                description: 'The stage was moved but notification status is unknown.',
              });
            }
          } catch (error) {
            console.error('Failed to send owner intro notification:', error);
            // Don't fail the stage move, just log
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deal-activities'] });

      if (!result?.owner_assigned && !result?.different_owner_warning) {
        toast({
          title: 'Deal Updated',
          description: 'Deal stage has been updated successfully.',
        });
      }
    },
    onError: (error: unknown, _vars, context) => {
      // Don't show error toast for OWNER_WARNING - that's handled by the dialog
      if (
        error &&
        typeof error === 'object' &&
        'type' in error &&
        (error as Record<string, unknown>).type === 'OWNER_WARNING'
      ) {
        return;
      }

      if (context?.previousDeals) {
        queryClient.setQueryData(['deals'], context.previousDeals);
      }
      toast({
        title: 'Error',
        description: `Failed to update deal stage: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateDeal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      dealId,
      updates,
    }: {
      dealId: string;
      updates: Record<string, unknown>;
    }) => {
      // Special handling for owner changes - use dedicated RPC to avoid view/column issues
      const isOwnerChangeOnly =
        updates.assigned_to !== undefined && Object.keys(updates).length === 1;

      if (isOwnerChangeOnly) {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabase.rpc('update_deal_owner', {
          p_deal_id: dealId,
          p_assigned_to:
            updates.assigned_to === 'unassigned' || updates.assigned_to === ''
              ? ''
              : String(updates.assigned_to),
          p_actor_id: user.id,
        });

        if (error) {
          throw error;
        }

        // Parse JSONB response if it's a string
        return typeof data === 'string' ? JSON.parse(data) : data;
      }

      // For other updates, use standard update with field filtering
      const readOnlyFields = [
        'listing_real_company_name',
        'real_company_name',
        'listing_title',
        'listing_revenue',
        'listing_ebitda',
        'listing_location',
        'listing_category',
        'stage_name',
        'stage_color',
        'stage_position',
        'assigned_admin_name',
        'assigned_admin_email',
        'primary_owner_name',
        'primary_owner_email',
        'buyer_name',
        'buyer_email',
        'buyer_company',
        'buyer_type',
        'buyer_phone',
        'buyer_id',
        'total_tasks',
        'pending_tasks',
        'completed_tasks',
        'pending_tasks_count',
        'completed_tasks_count',
        'activity_count',
        'total_activities_count',
        'company_deal_count',
        'listing_deal_count',
        'buyer_connection_count',
        'buyer_priority_score',
        'deal_id',
        'deal_description',
        'deal_value',
        'deal_priority',
        'deal_probability',
        'deal_expected_close_date',
        'deal_source',
        'deal_created_at',
        'deal_updated_at',
        'deal_stage_entered_at',
        'deal_followed_up',
        'deal_followed_up_at',
        'deal_followed_up_by',
        'deal_negative_followed_up',
        'deal_negative_followed_up_at',
        'deal_negative_followed_up_by',
      ];

      // Sanitize updates
      const safeUpdates = Object.fromEntries(
        Object.entries(updates || {})
          .filter(([key, v]) => v !== undefined && !readOnlyFields.includes(key))
          .map(([k, v]) => {
            if (v === 'undefined') return [k, null];
            if (k === 'assigned_to' && (v === '' || v === undefined || v === 'unassigned'))
              return [k, null];
            return [k, v];
          }),
      );

      const { data, error } = await supabase
        .from('deal_pipeline')
        .update(safeUpdates)
        .eq('id', dealId)
        .select(
          'id, assigned_to, stage_id, updated_at, nda_status, fee_agreement_status, followed_up, negative_followed_up',
        )
        .single();

      if (error) {
        throw error;
      }
      return data;
    },
    onMutate: async ({ dealId, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['deals'] });

      // Snapshot previous value
      const previousDeals = queryClient.getQueryData<Deal[]>(['deals']);

      // Optimistically update the cache
      if (previousDeals) {
        queryClient.setQueryData<Deal[]>(
          ['deals'],
          (old) =>
            old?.map((deal) => (deal.deal_id === dealId ? { ...deal, ...updates } : deal)) ?? [],
        );
      }

      return { previousDeals };
    },
    onSuccess: async (data: unknown, { dealId, updates }) => {
      const ownerResult = data as Record<string, unknown> | null;
      // Note: Assignment logging is now handled by the update_deal_owner RPC
      const isOwnerChangeOnly =
        updates.assigned_to !== undefined && Object.keys(updates).length === 1;

      // If owner was changed (not just stage move), notify the previous owner
      if (isOwnerChangeOnly && ownerResult?.owner_changed && ownerResult.previous_owner_id) {
        try {
          const deals = queryClient.getQueryData<Deal[]>(['deals']);
          const deal = deals?.find((d) => d.deal_id === dealId);

          if (deal) {
            // Get current admin info
            const {
              data: { user },
              error: authError,
            } = await supabase.auth.getUser();
            if (authError) throw authError;
            const { data: currentAdmin, error: currentAdminError } = await supabase
              .from('profiles')
              .select('first_name, last_name, email')
              .eq('id', user?.id ?? '')
              .single();
            if (currentAdminError) throw currentAdminError;

            const currentAdminName = currentAdmin
              ? `${currentAdmin.first_name} ${currentAdmin.last_name}`.trim()
              : 'Another admin';

            await supabase.functions.invoke('notify-deal-owner-change', {
              body: {
                dealId: deal.deal_id,
                dealTitle: deal.title,
                previousOwnerId: ownerResult.previous_owner_id,
                previousOwnerName: ownerResult.previous_owner_name,
                modifyingAdminId: user?.id,
                modifyingAdminName: currentAdminName,
                modifyingAdminEmail: currentAdmin?.email,
                oldStageName: (ownerResult.stage_name as string) || deal.stage_name,
                newStageName: (ownerResult.stage_name as string) || deal.stage_name, // Same stage, just owner change
                listingTitle: deal.listing_title,
                companyName: deal.listing_real_company_name,
              },
            });
          }
        } catch (error) {
          console.error('Failed to send owner change notification:', error);
          // Don't fail the update, just log
        }
      }

      toast({
        title: isOwnerChangeOnly ? 'Owner Updated' : 'Deal Updated',
        description: isOwnerChangeOnly
          ? 'The deal owner has been changed successfully.'
          : 'Deal has been updated successfully.',
      });
    },
    onError: (error: unknown, _, context) => {
      // Don't show error toast for OWNER_WARNING - that's handled by the dialog
      if (
        error &&
        typeof error === 'object' &&
        'type' in error &&
        (error as Record<string, unknown>).type === 'OWNER_WARNING'
      ) {
        return;
      }

      // Rollback on error
      if (context?.previousDeals) {
        queryClient.setQueryData(['deals'], context.previousDeals);
      }

      toast({
        title: 'Error',
        description: `Failed to update deal: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    },
    onSettled: async () => {
      // Refetch to ensure consistency
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['deals'], type: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['deal-activities'] }),
        queryClient.invalidateQueries({ queryKey: ['connection-request-details'] }),
        queryClient.refetchQueries({ queryKey: ['admin-profiles'] }),
      ]);
    },
  });
}

export function useCreateDeal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (deal: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from('deal_pipeline')
        .insert(deal as never)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      // Toast is now handled in CreateDealModal for better control
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to create deal: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
}

// Soft delete deal
export function useSoftDeleteDeal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ dealId, reason }: { dealId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('soft_delete_deal', {
        deal_id: dealId,
        deletion_reason: reason ?? undefined,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast({
        title: 'Deal Deleted',
        description: 'Deal has been moved to deleted items.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to delete deal: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
}

// Restore deleted deal
export function useRestoreDeal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (dealId: string) => {
      const { data, error } = await supabase.rpc('restore_deal', {
        deal_id: dealId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast({
        title: 'Deal Restored',
        description: 'Deal has been restored successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to restore deal: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
}
