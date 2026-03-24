import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface PublishResponse {
  success: boolean;
  message: string;
  listing?: Record<string, unknown>;
  error?: string;
  validationErrors?: string[];
  remarketingLinked?: boolean;
}

/**
 * Hook for publishing/unpublishing a listing to the marketplace
 */
export function usePublishListing() {
  const queryClient = useQueryClient();

  const publishMutation = useMutation({
    mutationFn: async ({
      listingId,
      action,
    }: {
      listingId: string;
      action: 'publish' | 'unpublish';
    }) => {
      const { data, error } = await supabase.functions.invoke<PublishResponse>('publish-listing', {
        body: { listingId, action },
      });

      if (error) {
        throw new Error(error.message || 'Failed to update listing');
      }

      if (data && !data.success) {
        // Handle validation errors
        if (data.validationErrors && data.validationErrors.length > 0) {
          throw new Error(`Quality requirements not met:\n${data.validationErrors.join('\n')}`);
        }
        // Handle remarketing conflict
        if (data.remarketingLinked) {
          throw new Error(
            'Cannot publish: listing is linked to remarketing systems. Remove from universes first.',
          );
        }
        throw new Error(data.error || 'Failed to update listing');
      }

      return data;
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-listings'] });
      queryClient.invalidateQueries({ queryKey: ['simple-listings'] });

      // H-4 FIX: Trigger deal alerts on publication, not creation.
      // This ensures buyers are only alerted about listings that are actually live.
      if (variables.action === 'publish' && data?.listing) {
        try {
          const listing = data.listing;
          const { data: matchingAlerts } = await supabase.rpc('match_deal_alerts_with_listing', {
            listing_data: listing as unknown as Record<string, never>,
          });
          if (matchingAlerts?.length) {
            for (const alert of matchingAlerts) {
              if (alert.alert_frequency === 'instant') {
                await supabase.functions.invoke('send-deal-alert', {
                  body: { alertId: alert.alert_id, listingId: variables.listingId, listing },
                });
              }
            }
            toast({
              title: 'Deal Alerts Sent',
              description: `${matchingAlerts.length} matching buyer alert(s) triggered.`,
            });
          }
        } catch (alertError) {
          console.error('Failed to send deal alerts on publish:', alertError);
          // Don't fail publish for alert errors
        }
      }

      toast({
        title:
          variables.action === 'publish' ? 'Published to Marketplace' : 'Removed from Marketplace',
        description:
          data?.message ||
          `Listing has been ${variables.action === 'publish' ? 'published' : 'unpublished'} successfully.`,
      });
    },
    onError: (error: Error, variables) => {
      toast({
        variant: 'destructive',
        title: variables.action === 'publish' ? 'Publish Failed' : 'Unpublish Failed',
        description: error.message,
      });
    },
  });

  return {
    publishListing: (listingId: string) => publishMutation.mutate({ listingId, action: 'publish' }),
    unpublishListing: (listingId: string) =>
      publishMutation.mutate({ listingId, action: 'unpublish' }),
    isPublishing: publishMutation.isPending,
  };
}
