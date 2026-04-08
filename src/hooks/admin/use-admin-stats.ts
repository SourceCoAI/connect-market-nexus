import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AdminStats, AdminActivity } from '@/types/admin';
import { toast } from '@/hooks/use-toast';

// TODO: Phase 6 — migrate count queries to data access layer.
// useStats() runs 6 separate .from() count queries against profiles, listings, and
// connection_requests. These could be consolidated into a single getAdminDashboardStats()
// data access function (or an RPC) for better performance and centralization.
// useRecentActivities() similarly batch-fetches from profiles, connection_requests, and
// listings — consider a getRecentAdminActivity() data access function.

/**
 * Hook for fetching admin dashboard statistics and activities
 */
export function useAdminStats() {
  const { user, authChecked, isAdmin } = useAuth();

  // Get admin dashboard stats
  const useStats = () => {
    return useQuery({
      queryKey: ['admin-stats'],
      queryFn: async () => {
        try {
          // Get total users count
          const { count: totalUsers, error: usersError } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true });

          if (usersError) throw usersError;

          // Get pending users count
          const { count: pendingUsers, error: pendingError } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('approval_status', 'pending');

          if (pendingError) throw pendingError;

          // Get approved users count
          const { count: approvedUsers, error: approvedError } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('approval_status', 'approved');

          if (approvedError) throw approvedError;

          // Get total listings count
          const { count: totalListings, error: listingsError } = await supabase
            .from('listings')
            .select('id', { count: 'exact', head: true });

          if (listingsError) throw listingsError;

          // Get pending connection requests count
          const { count: pendingConnections, error: pendingConnError } = await supabase
            .from('connection_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending');

          if (pendingConnError) throw pendingConnError;

          // Get approved connection requests count
          const { count: approvedConnections, error: approvedConnError } = await supabase
            .from('connection_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'approved');

          if (approvedConnError) throw approvedConnError;

          return {
            totalUsers: totalUsers || 0,
            pendingUsers: pendingUsers || 0,
            approvedUsers: approvedUsers || 0,
            totalListings: totalListings || 0,
            pendingConnections: pendingConnections || 0,
            approvedConnections: approvedConnections || 0,
          } as AdminStats;
        } catch (error: unknown) {
          toast({
            variant: 'destructive',
            title: 'Error loading stats',
            description: (error as Error).message,
          });

          return {
            totalUsers: 0,
            pendingUsers: 0,
            approvedUsers: 0,
            totalListings: 0,
            pendingConnections: 0,
            approvedConnections: 0,
          } as AdminStats;
        }
      },
      enabled: authChecked && !!user && isAdmin,
    });
  };

  // Get recent activities
  const useRecentActivities = () => {
    return useQuery({
      queryKey: ['admin-recent-activities'],
      queryFn: async () => {
        try {
          const activities: AdminActivity[] = [];

          // Recent user signups - fetch directly without joins to avoid foreign key issues
          const { data: signups, error: signupsError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, created_at')
            .order('created_at', { ascending: false })
            .limit(5);

          if (signupsError) throw signupsError;

          if (signups && signups.length > 0) {
            activities.push(
              ...signups.map((signup) => ({
                id: `signup-${signup.id}`,
                type: 'signup' as const,
                description: `New user registered: ${signup.first_name} ${signup.last_name}`,
                timestamp: signup.created_at,
                user_id: signup.id,
              })),
            );
          }

          // Recent connection requests - fetch separately to avoid foreign key issues
          const { data: connections, error: connectionsError } = await supabase
            .from('connection_requests')
            .select('id, created_at, user_id, listing_id')
            .order('created_at', { ascending: false })
            .limit(5);

          if (connectionsError) throw connectionsError;

          if (connections && connections.length > 0) {
            // Batch-fetch user and listing details instead of N+1 queries
            const userIds = [...new Set(connections.map((c) => c.user_id))].filter(
              (id): id is string => id !== null,
            );
            const listingIds = [...new Set(connections.map((c) => c.listing_id))].filter(
              (id): id is string => id !== null,
            );

            const [{ data: users }, { data: listings }] = await Promise.all([
              supabase.from('profiles').select('id, first_name, last_name').in('id', userIds),
              supabase.from('listings').select('id, title').in('id', listingIds),
            ]);

            const userMap = new Map((users || []).map((u) => [u.id, u]));
            const listingMap = new Map((listings || []).map((l) => [l.id, l]));

            const connectionActivities = connections.map((connection) => {
              const userData = connection.user_id ? userMap.get(connection.user_id) : undefined;
              const listingData = connection.listing_id ? listingMap.get(connection.listing_id) : undefined;
              const userName = userData
                ? `${userData.first_name} ${userData.last_name}`
                : 'Unknown User';
              const listingTitle = listingData?.title || 'Unknown Listing';

              return {
                id: `connection-${connection.id}`,
                type: 'connection_request' as const,
                description: `New connection request for ${listingTitle} from ${userName}`,
                timestamp: connection.created_at,
                user_id: connection.user_id ?? undefined,
              };
            });

            activities.push(...connectionActivities);
          }

          // Recent listing creations
          const { data: listings, error: listingsError } = await supabase
            .from('listings')
            .select('id, title, created_at')
            .order('created_at', { ascending: false })
            .limit(5);

          if (listingsError) throw listingsError;

          if (listings && listings.length > 0) {
            activities.push(
              ...listings.map((listing) => ({
                id: `listing-${listing.id}`,
                type: 'listing_creation' as const,
                description: `New listing created: ${listing.title}`,
                timestamp: listing.created_at,
              })),
            );
          }

          // Sort by timestamp, newest first
          activities.sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          );

          return activities.slice(0, 10); // Return 10 most recent activities
        } catch (error: unknown) {
          toast({
            variant: 'destructive',
            title: 'Error loading activities',
            description: (error as Error).message,
          });
          return [];
        }
      },
      enabled: authChecked && !!user && isAdmin,
    });
  };

  return {
    useStats,
    useRecentActivities,
  };
}
