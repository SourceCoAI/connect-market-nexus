import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { ConnectionRequest } from '@/types';
import { createQueryKey } from '@/lib/query-keys';
import { invalidateConnectionRequests } from '@/lib/query-client-helpers';

const VISITOR_ID_KEY = 'sourceco_visitor_id';

// Request connection to a listing
export const useRequestConnection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingId, message }: { listingId: string; message?: string }) => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) throw new Error('You must be logged in to request a connection');

      // Block business owners (sellers) from creating deal connections
      // TODO: Phase 6 — migrate to data access layer: getContactByProfileId() from '@/lib/data-access'
      // This reads profiles.buyer_type to enforce buyer/seller gating. Once the data access layer
      // exposes a profile-level buyer_type lookup (e.g. via getBuyerWithProfile() or a dedicated
      // getProfileBuyerType() function), this raw .from('profiles') call can be replaced.
      const { data: profile } = await supabase
        .from('profiles')
        .select('buyer_type')
        .eq('id', authUser.id)
        .single();

      if (profile?.buyer_type === 'businessOwner' || profile?.buyer_type === 'business_owner') {
        throw new Error(
          'Business owners cannot request deal connections. If you are looking to sell your business, please visit our Sell page.',
        );
      }

      // Enforce message requirement
      if (!message || message.trim().length < 20) {
        throw new Error(
          'A detailed message (minimum 20 characters) is required to request a connection',
        );
      }

      // Use the enhanced RPC function to handle conflicts and merging
      const { data: result, error } = await supabase.rpc(
        'enhanced_merge_or_create_connection_request',
        {
          p_listing_id: listingId,
          p_user_message: message.trim(),
        },
      );

      if (error) throw error;

      // Parse the result
      const parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      const requestId = parsedResult.request_id;

      const userId = authUser.id;

      // Log activity
      await supabase.from('user_activity').insert({
        user_id: userId,
        activity_type: 'connection_request',
        metadata: { listing_id: listingId, request_id: requestId },
      });

      // Record milestone for user journey tracking
      const visitorId = localStorage.getItem(VISITOR_ID_KEY);
      if (visitorId) {
        supabase
          .rpc('update_journey_milestone', {
            p_visitor_id: visitorId,
            p_milestone_key: 'first_connection_at',
            p_milestone_time: new Date().toISOString(),
          })
          .then(({ error }) => {
            if (error) console.error('Failed to record connection milestone:', error);
          });
      }

      // Calculate deal-specific buyer quality score (fire-and-forget)
      import("@/lib/remarketing/queueScoring")
        .then(({ queueBuyerQualityScoring }) =>
          queueBuyerQualityScoring([userId], {
            deal_request_message: message?.trim() || null,
            connection_request_id: requestId,
          })
        )
        .catch((err) => console.error('Buyer quality score calc failed:', err));

      // Send notification email to user
      try {
        // Get user data - include all required fields
        const { data: userData, error: userError } = await supabase
          .from('profiles')
          .select('first_name, last_name, email, company')
          .eq('id', userId)
          .single();

        if (userError) throw userError;

        // Get listing data - include all required fields
        const { data: listingData, error: listingError } = await supabase
          .from('listings')
          .select('id, title, category, location')
          .eq('id', listingId)
          .single();

        if (listingError) throw listingError;

        // Send user confirmation email
        const userConfirmationPayload = {
          type: 'user_confirmation',
          recipientEmail: userData.email,
          recipientName: `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
          requesterName: `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
          requesterEmail: userData.email,
          listingTitle: listingData.title,
          listingId: listingData.id,
          message: message || '',
          requestId: requestId,
        };

        await supabase.functions.invoke('send-connection-notification', {
          body: userConfirmationPayload,
        });

        // Send admin notification about new connection request
        try {
          const adminNotificationPayload = {
            type: 'admin_notification',
            requesterName: `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
            requesterEmail: userData.email,
            listingTitle: listingData.title,
            listingId: listingData.id,
            message: message || '',
            requestId: requestId,
          };

          await supabase.functions.invoke('send-connection-notification', {
            body: adminNotificationPayload,
          });
        } catch (adminNotifError) {
          console.error('Failed to send admin notification:', adminNotifError);
        }
      } catch (notificationError) {
        // Log the error but don't fail the whole request
        console.error('Failed to send notification:', notificationError);
      }

      return parsedResult;
    },
    onSuccess: (data: { is_duplicate?: boolean; duplicate_type?: string; request_id?: string }) => {
      if (data.is_duplicate) {
        if (data.duplicate_type === 'same_user_same_listing') {
          toast({
            title: 'Request Updated',
            description:
              "Your connection request has been updated with your new message. We'll review both versions.",
          });
        } else if (data.duplicate_type === 'channel_merge') {
          toast({
            title: 'Request Merged',
            description:
              "Your marketplace request has been combined with your previous inquiry. We'll review both messages.",
          });
        }
      } else {
        toast({
          title: 'Request sent.',
          description:
            "We'll review your request within 1-2 business days. You'll be notified by email. Track your request in My Deals.",
        });
      }

      // PHASE 2: Use centralized cache invalidation
      invalidateConnectionRequests(queryClient);
    },
    onError: (error: unknown) => {
      let message = 'Failed to request connection';
      if (error instanceof Error) {
        message = error.message;
      } else if (error && typeof error === 'object') {
        const e = error as Record<string, unknown>;
        message = String(e.message || e.details || e.hint || message);
      }
      toast({
        variant: 'destructive',
        title: 'Error',
        description: message,
      });
    },
  });
};

// TODO: Phase 6 — migrate to data access layer once connection_requests queries are centralized.
// This hook queries .from('connection_requests') for batch status lookup. A new data access
// function (e.g. getConnectionStatusesForUser()) would consolidate this pattern.

// Batch fetch all connection statuses for the current user (single query)
export const useAllConnectionStatuses = () => {
  return useQuery({
    queryKey: ['all-connection-statuses'],
    queryFn: async () => {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (!authUser) return new Map<string, { exists: boolean; status: string; id: string }>();

        const { data, error } = await supabase
          .from('connection_requests')
          .select('id, status, listing_id')
          .eq('user_id', authUser.id);

        if (error) throw error;

        const map = new Map<string, { exists: boolean; status: string; id: string }>();
        for (const row of data || []) {
          map.set(row.listing_id, { exists: true, status: row.status, id: row.id });
        }
        return map;
      } catch (error: unknown) {
        console.error('Error fetching all connection statuses:', error);
        return new Map<string, { exists: boolean; status: string; id: string }>();
      }
    },
    staleTime: 1000 * 60,
  });
};

// Get connection status for a listing - uses batch map when provided, falls back to individual query
export const useConnectionStatus = (
  listingId: string | undefined,
  connectionMap?: Map<string, { exists: boolean; status: string; id: string }>,
) => {
  const skip = !!connectionMap;
  const query = useQuery({
    queryKey: createQueryKey.connectionStatus(listingId),
    queryFn: async () => {
      if (!listingId) return { exists: false, status: '', id: '' };

      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (!authUser) return { exists: false, status: '', id: '' };

        const { data, error } = await supabase
          .from('connection_requests')
          .select('id, status')
          .eq('listing_id', listingId)
          .eq('user_id', authUser.id)
          .maybeSingle();

        if (error) throw error;

        return {
          exists: !!data,
          status: data?.status || '',
          id: data?.id || '',
        };
      } catch (error: unknown) {
        console.error('Error checking connection status:', error);
        return { exists: false, status: '', id: '' };
      }
    },
    enabled: !!listingId && !skip,
    staleTime: 1000 * 60,
  });

  if (skip && listingId) {
    const cached = connectionMap.get(listingId) ?? { exists: false, status: '', id: '' };
    return { ...query, data: cached };
  }
  return query;
};

// Get user connection requests with full listing details including acquisition type
export const useUserConnectionRequests = () => {
  return useQuery({
    queryKey: createQueryKey.userConnectionRequests(),
    queryFn: async () => {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (!authUser) return [];

        const { data, error } = await supabase
          .from('connection_requests')
          .select(
            `
            id, created_at, updated_at, listing_id, status, user_id, user_message,
            listing:listing_id (
              id,
              title,
              category,
              location,
              description,
              image_url,
              revenue,
              ebitda,
              full_time_employees,
              part_time_employees,
              acquisition_type
            )
          `,
          )
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        return data as ConnectionRequest[];
      } catch (error: unknown) {
        console.error('Error fetching user connection requests:', error);
        return [];
      }
    },
    staleTime: 1000 * 60, // 1 minute
  });
};
