import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface RecentActivityItem {
  id: string;
  timestamp: string;
  user_email: string;
  user_name: string;
  activity_type: 'signup' | 'listing_view' | 'save' | 'connection_request' | 'search' | 'session';
  description: string;
  metadata?: {
    listing_title?: string;
    listing_id?: string;
    search_query?: string;
    page_path?: string;
    session_duration?: number;
  };
}

export function useRecentActivity(limit: number = 50) {
  return useQuery({
    queryKey: ['recent-activity', limit],
    queryFn: async (): Promise<RecentActivityItem[]> => {
      const activities: RecentActivityItem[] = [];
      
      // Get recent signups
      const { data: signups, error: signupsError } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      if (signupsError) throw signupsError;

      // Get recent listing views
      const { data: listingViews, error: listingViewsError } = await supabase
        .from('listing_analytics')
        .select(`
          id, created_at, user_id, listing_id, action_type,
          listings!listing_analytics_listing_id_fkey(title)
        `)
        .eq('action_type', 'view')
        .not('user_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(15);
      if (listingViewsError) throw listingViewsError;

      // Get recent saves
      const { data: saves, error: savesError } = await supabase
        .from('saved_listings')
        .select(`
          id, created_at, user_id, listing_id,
          listings!saved_listings_listing_id_fkey(title)
        `)
        .order('created_at', { ascending: false })
        .limit(10);
      if (savesError) throw savesError;

      // Get recent connection requests
      const { data: connections, error: connectionsError } = await supabase
        .from('connection_requests')
        .select(`
          id, created_at, user_id, listing_id,
          listings!connection_requests_listing_id_fkey(title)
        `)
        .order('created_at', { ascending: false })
        .limit(10);
      if (connectionsError) throw connectionsError;

      // Get recent searches
      const { data: searches, error: searchesError } = await supabase
        .from('search_analytics')
        .select('id, created_at, user_id, search_query, results_count')
        .not('user_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);
      if (searchesError) throw searchesError;

      // Get user profiles for all activities
      const allUserIds = [
        ...(listingViews?.map(l => l.user_id) || []),
        ...(saves?.map(s => s.user_id) || []),
        ...(connections?.map(c => c.user_id) || []),
        ...(searches?.map(s => s.user_id) || [])
      ].filter((id): id is string => id !== null && id !== undefined);

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name')
        .in('id', [...new Set(allUserIds)]);
      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Process signups
      signups?.forEach(signup => {
        activities.push({
          id: `signup-${signup.id}`,
          timestamp: signup.created_at ?? new Date().toISOString(),
          user_email: signup.email ?? '',
          user_name: (`${signup.first_name ?? ''} ${signup.last_name ?? ''}`.trim()) || (signup.email ?? ''),
          activity_type: 'signup',
          description: `New user registered: ${signup.first_name ?? ''} ${signup.last_name ?? ''}`
        });
      });

      // Process listing views
      listingViews?.forEach(view => {
        const profile = view.user_id ? profileMap.get(view.user_id) : undefined;
        if (profile) {
          activities.push({
            id: `view-${view.id}`,
            timestamp: view.created_at ?? new Date().toISOString(),
            user_email: profile.email ?? '',
            user_name: (`${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()) || (profile.email ?? ''),
            activity_type: 'listing_view',
            description: `Viewed listing: ${view.listings?.title || 'Unknown listing'}`,
            metadata: {
              listing_title: view.listings?.title ?? undefined,
              listing_id: view.listing_id ?? undefined
            }
          });
        }
      });

      // Process saves
      saves?.forEach(save => {
        const profile = profileMap.get(save.user_id);
        if (profile) {
          activities.push({
            id: `save-${save.id}`,
            timestamp: save.created_at ?? new Date().toISOString(),
            user_email: profile.email ?? '',
            user_name: (`${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()) || (profile.email ?? ''),
            activity_type: 'save',
            description: `Saved listing: ${save.listings?.title || 'Unknown listing'}`,
            metadata: {
              listing_title: save.listings?.title ?? undefined,
              listing_id: save.listing_id
            }
          });
        }
      });

      // Process connection requests
      connections?.forEach(connection => {
        if (!connection.user_id) return;
        const profile = profileMap.get(connection.user_id);
        if (profile) {
          activities.push({
            id: `connection-${connection.id}`,
            timestamp: connection.created_at ?? new Date().toISOString(),
            user_email: profile.email ?? '',
            user_name: (`${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()) || (profile.email ?? ''),
            activity_type: 'connection_request',
            description: `Requested connection for: ${connection.listings?.title || 'Unknown listing'}`,
            metadata: {
              listing_title: connection.listings?.title ?? undefined,
              listing_id: connection.listing_id ?? undefined
            }
          });
        }
      });

      // Process searches
      searches?.forEach(search => {
        if (!search.user_id) return;
        const profile = profileMap.get(search.user_id);
        if (profile) {
          activities.push({
            id: `search-${search.id}`,
            timestamp: search.created_at ?? new Date().toISOString(),
            user_email: profile.email ?? '',
            user_name: (`${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()) || (profile.email ?? ''),
            activity_type: 'search',
            description: `Searched for: "${search.search_query}" (${search.results_count} results)`,
            metadata: {
              search_query: search.search_query ?? undefined
            }
          });
        }
      });

      // Sort by timestamp and return limited results
      return activities
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes (was 30s)
  });
}