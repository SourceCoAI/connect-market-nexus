import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SmartAlert {
  id: string;
  type: 'performance' | 'opportunity' | 'churn_risk' | 'market_trend' | 'urgent_action';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action_required: string;
  created_at: string;
  metadata: {
    listing_id?: string;
    user_id?: string;
    category?: string;
    metrics?: Record<string, number>;
  };
  auto_dismiss_at?: string;
}

export function useSmartAlerts() {
  return useQuery({
    queryKey: ['smart-alerts'],
    queryFn: async (): Promise<SmartAlert[]> => {
      const alerts: SmartAlert[] = [];
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // 1. Underperforming listings alert
      const { data: listings, error: listingsError } = await supabase
        .from('listings')
        .select('id, title, category, created_at')
        .eq('status', 'active')
        .is('deleted_at', null)
        .gte('created_at', sevenDaysAgo.toISOString());
      if (listingsError) throw listingsError;

      if (listings && listings.length > 0) {
        const listingIds = listings.map(l => l.id);
        
        // Get analytics for all listings
        const { data: listingAnalytics, error: laError } = await supabase
          .from('listing_analytics')
          .select('listing_id, action_type, created_at')
          .in('listing_id', listingIds);
        if (laError) throw laError;

        const { data: listingSaves, error: lsError } = await supabase
          .from('saved_listings')
          .select('listing_id, created_at')
          .in('listing_id', listingIds);
        if (lsError) throw lsError;

        const { data: listingConnections, error: lcError } = await supabase
          .from('connection_requests')
          .select('listing_id, created_at')
          .in('listing_id', listingIds);
        if (lcError) throw lcError;

        // Group data by listing
        const listingDataMap = new Map<string, {
          analytics: { listing_id: string | null; action_type: string | null; created_at: string | null }[];
          saves: { listing_id: string; created_at: string | null }[];
          connections: { listing_id: string; created_at: string | null }[];
        }>();
        listingIds.forEach(listingId => {
          listingDataMap.set(listingId, {
            analytics: [],
            saves: [],
            connections: []
          });
        });

        listingAnalytics?.forEach(analytics => {
          if (analytics.listing_id && listingDataMap.has(analytics.listing_id)) {
            listingDataMap.get(analytics.listing_id)!.analytics.push(analytics);
          }
        });

        listingSaves?.forEach(save => {
          if (listingDataMap.has(save.listing_id)) {
            listingDataMap.get(save.listing_id)!.saves.push(save);
          }
        });

        listingConnections?.forEach(connection => {
          if (connection.listing_id && listingDataMap.has(connection.listing_id)) {
            listingDataMap.get(connection.listing_id)!.connections.push(connection as { listing_id: string; created_at: string | null });
          }
        });

        listings.forEach(listing => {
          const listingData = listingDataMap.get(listing.id);
          if (!listingData) return;

          const daysSinceListed = Math.floor((now.getTime() - new Date(listing.created_at).getTime()) / (1000 * 60 * 60 * 24));
          const views = listingData.analytics.filter(a => a.action_type === 'view').length;
          const saves = listingData.saves.length;
          const connections = listingData.connections.length;

          // Alert for listings with very low engagement after 3+ days
          if (daysSinceListed >= 3 && views < 5) {
            alerts.push({
              id: `underperform-${listing.id}`,
              type: 'performance',
              priority: 'medium',
              title: `Low engagement on "${listing.title}"`,
              description: `Only ${views} views in ${daysSinceListed} days. Consider optimizing the listing.`,
              action_required: 'Review and optimize listing content, pricing, or keywords',
              created_at: now.toISOString(),
              metadata: {
                listing_id: listing.id,
                metrics: { views, days_listed: daysSinceListed }
              }
            });
          }

          // Alert for high views but no saves (pricing issue?)
          if (views >= 20 && saves === 0) {
            alerts.push({
              id: `no-saves-${listing.id}`,
              type: 'opportunity',
              priority: 'high',
              title: `High views, no saves: "${listing.title}"`,
              description: `${views} views but no saves suggests pricing or business metrics might be off.`,
              action_required: 'Review pricing strategy and business financials',
              created_at: now.toISOString(),
              metadata: {
                listing_id: listing.id,
                metrics: { views, saves }
              }
            });
          }

          // Alert for saves but no connections (follow-up opportunity)
          if (saves >= 3 && connections === 0) {
            alerts.push({
              id: `follow-up-${listing.id}`,
              type: 'opportunity',
              priority: 'high',
              title: `Multiple saves, no connections: "${listing.title}"`,
              description: `${saves} users saved this listing but haven't connected yet.`,
              action_required: 'Proactively reach out to interested users',
              created_at: now.toISOString(),
              metadata: {
                listing_id: listing.id,
                metrics: { saves, connections }
              }
            });
          }
        });
      }

      // 2. Churn risk users alert
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, created_at')
        .eq('approval_status', 'approved');
      if (usersError) throw usersError;

      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo2 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get user activity data separately
      if (users && users.length > 0) {
        const userIds = users.map(u => u.id);
        
        const { data: userAnalytics, error: uaError } = await supabase
          .from('listing_analytics')
          .select('user_id, created_at')
          .in('user_id', userIds)
          .gte('created_at', sevenDaysAgo2.toISOString());
        if (uaError) throw uaError;

        const { data: userSessions, error: usError } = await supabase
          .from('user_sessions')
          .select('user_id, started_at')
          .in('user_id', userIds)
          .gte('started_at', sevenDaysAgo2.toISOString());
        if (usError) throw usError;

        const { data: userSaves, error: usvError } = await supabase
          .from('saved_listings')
          .select('user_id, created_at')
          .in('user_id', userIds)
          .gte('created_at', sevenDaysAgo2.toISOString());
        if (usvError) throw usvError;

        // Group activity by user
        const userActivityMap = new Map<string, {
          analytics: { user_id: string | null; created_at: string | null }[];
          sessions: { user_id: string | null; started_at: string | null }[];
          saves: { user_id: string; created_at: string | null }[];
        }>();
        userIds.forEach(userId => {
          userActivityMap.set(userId, {
            analytics: [],
            sessions: [],
            saves: []
          });
        });

        userAnalytics?.forEach(activity => {
          if (activity.user_id && userActivityMap.has(activity.user_id)) {
            userActivityMap.get(activity.user_id)!.analytics.push(activity);
          }
        });

        userSessions?.forEach(session => {
          if (session.user_id && userActivityMap.has(session.user_id)) {
            userActivityMap.get(session.user_id)!.sessions.push(session);
          }
        });

        userSaves?.forEach(save => {
          if (userActivityMap.has(save.user_id)) {
            userActivityMap.get(save.user_id)!.saves.push(save);
          }
        });

        users.forEach(user => {
          const userActivity = userActivityMap.get(user.id);
          if (!userActivity) return;

          const recentActivity = [
            ...userActivity.analytics.filter(a => new Date(a.created_at ?? 0) > threeDaysAgo),
            ...userActivity.sessions.filter(s => new Date(s.started_at ?? 0) > threeDaysAgo),
            ...userActivity.saves.filter(s => new Date(s.created_at ?? 0) > threeDaysAgo)
          ];

          const weeklyActivity = [
            ...userActivity.analytics,
            ...userActivity.sessions,
            ...userActivity.saves
          ];

          // High-value user who went quiet
          if (weeklyActivity.length >= 10 && recentActivity.length === 0) {
            alerts.push({
              id: `churn-risk-${user.id}`,
              type: 'churn_risk',
              priority: 'high',
              title: `High-value user inactive: ${user.first_name} ${user.last_name}`,
              description: `Active user with ${weeklyActivity.length} weekly activities has been quiet for 3+ days.`,
              action_required: 'Send re-engagement email or call',
              created_at: now.toISOString(),
              metadata: {
                user_id: user.id,
                metrics: { weekly_activity: weeklyActivity.length, recent_activity: recentActivity.length }
              },
              auto_dismiss_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
            });
          }
        });
      }

      // 3. Pending approvals alert
      const { data: pendingUsers, error: puError } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, created_at')
        .eq('approval_status', 'pending');
      if (puError) throw puError;

      const { data: pendingConnections, error: pcError } = await supabase
        .from('connection_requests')
        .select('id, created_at')
        .eq('status', 'pending');
      if (pcError) throw pcError;

      const urgentUserApprovals = pendingUsers?.filter(user => 
        new Date(user.created_at) < new Date(now.getTime() - 24 * 60 * 60 * 1000)
      ) || [];

      const urgentConnectionApprovals = pendingConnections?.filter(connection =>
        new Date(connection.created_at) < new Date(now.getTime() - 48 * 60 * 60 * 1000)
      ) || [];

      if (urgentUserApprovals.length > 0) {
        alerts.push({
          id: 'urgent-user-approvals',
          type: 'urgent_action',
          priority: 'high',
          title: `${urgentUserApprovals.length} pending user approvals`,
          description: `Users waiting over 24 hours for approval. This affects user experience.`,
          action_required: 'Review and approve/reject pending users',
          created_at: now.toISOString(),
          metadata: {
            metrics: { count: urgentUserApprovals.length }
          }
        });
      }

      if (urgentConnectionApprovals.length > 0) {
        alerts.push({
          id: 'urgent-connection-approvals',
          type: 'urgent_action',
          priority: 'high',
          title: `${urgentConnectionApprovals.length} pending connection requests`,
          description: `Connection requests waiting over 48 hours. Users expect faster responses.`,
          action_required: 'Review and approve/reject connection requests',
          created_at: now.toISOString(),
          metadata: {
            metrics: { count: urgentConnectionApprovals.length }
          }
        });
      }

      // 4. Market trend alerts
      const { data: recentSearches, error: rsError } = await supabase
        .from('search_analytics')
        .select('search_query, results_count')
        .gte('created_at', threeDaysAgo.toISOString());
      if (rsError) throw rsError;

      const searchMap = new Map<string, { count: number; noResults: number }>();
      recentSearches?.forEach((search: { search_query: string | null; results_count: number | null }) => {
        const query = (search.search_query ?? '').toLowerCase();
        if (!searchMap.has(query)) {
          searchMap.set(query, { count: 0, noResults: 0 });
        }
        const data = searchMap.get(query)!;
        data.count++;
        if (search.results_count === 0) data.noResults++;
      });

      // Alert for trending searches with no results
      Array.from(searchMap.entries()).forEach(([query, data]: [string, { count: number; noResults: number }]) => {
        if (data.count >= 5 && data.noResults === data.count) {
          alerts.push({
            id: `market-gap-${query.replace(/\s+/g, '-')}`,
            type: 'market_trend',
            priority: 'medium',
            title: `High demand, no supply: "${query}"`,
            description: `${data.count} searches for "${query}" with zero results in 3 days.`,
            action_required: 'Consider acquiring listings in this category',
            created_at: now.toISOString(),
            metadata: {
              category: query,
              metrics: { search_count: data.count }
            }
          });
        }
      });

      return alerts
        .sort((a, b) => {
          // Sort by priority (high -> medium -> low) then by creation time
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
          }
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })
        .slice(0, 20); // Limit to 20 most important alerts
    },
    refetchInterval: 300000, // Refetch every 5 minutes
  });
}