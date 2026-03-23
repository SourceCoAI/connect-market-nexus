import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { generateAnonymousName } from "@/lib/anonymousNames";
import {
  getSessionStatus,
  normalizeReferrer,
} from "./useRealTimeGeolocation";
import {
  deduplicateSessions,
  buildPageViewMaps,
  buildVisitorHistory,
  buildEnhancedActiveUser,
  createDefaultUser,
} from "./useRealTimeSessions";
import type { SessionRow, ProfileRow, EngagementRow } from "./useRealTimeSessions";

// Re-export extracted utilities for backward compatibility
export {
  getSessionStatus,
  calculateDuration,
  getDefaultCoordinates,
  normalizeReferrer,
  extractExternalReferrer,
  resolveSessionCoordinates,
} from "./useRealTimeGeolocation";
export {
  deduplicateSessions,
  buildPageViewMaps,
  buildVisitorHistory,
  buildEnhancedActiveUser,
  createDefaultUser,
} from "./useRealTimeSessions";
export type { SessionRow, ProfileRow, EngagementRow } from "./useRealTimeSessions";

export interface EnhancedActiveUser {
  // Identity - REAL DATA
  sessionId: string;
  visitorId: string | null; // NEW: Persistent visitor identity
  userId: string | null;
  userName: string | null;
  displayName: string;
  companyName: string | null;
  buyerType: string | null;
  jobTitle: string | null;
  isAnonymous: boolean;

  // Location
  country: string | null;
  countryCode: string | null;
  city: string | null;
  coordinates: { lat: number; lng: number } | null;

  // Tech Stack
  deviceType: 'mobile' | 'desktop' | 'tablet';
  browser: string | null;
  os: string | null;

  // Traffic Source
  referrer: string | null;
  utmSource: string | null;

  // Entry/Attribution Data - NEW
  entrySource: string;             // Normalized: "Google", "LinkedIn", "Direct", etc.
  firstPagePath: string | null;    // Landing page path
  pageSequence: string[];          // All pages visited this session
  ga4ClientId: string | null;      // For GA4 data stitching
  firstTouchSource: string | null; // Original acquisition source
  firstTouchMedium: string | null; // Original acquisition medium
  externalReferrer: string | null; // NEW: External referrer (e.g., blog)

  // Current Session
  sessionDurationSeconds: number;
  lastActiveAt: string;
  currentPage: string | null;

  // Session Status (for display in activity feed)
  sessionStatus: 'active' | 'idle' | 'ended';

  // Real Engagement Metrics
  listingsViewed: number;
  listingsSaved: number;
  connectionsSent: number;
  totalVisits: number;
  totalTimeSpent: number;
  searchCount: number;

  // Trust Signals
  feeAgreementSigned: boolean;
  ndaSigned: boolean;

  // Cross-session journey data (NEW)
  visitorFirstSeen: string | null;       // When they first visited
  visitorTotalSessions: number;          // Sessions across all time
  visitorTotalTime: number;              // Total time on site ever
}

export interface EnhancedRealTimeData {
  activeUsers: EnhancedActiveUser[];
  totalActiveUsers: number;

  // Aggregates for summary panel
  byCountry: Array<{ country: string; countryCode: string | null; count: number }>;
  byDevice: Array<{ device: string; count: number }>;
  byReferrer: Array<{ referrer: string; count: number }>;
  byEntrySource: Array<{ source: string; count: number }>; // NEW: Entry source breakdown

  // Recent activity events
  recentEvents: Array<{
    id: string;
    type: 'page_view' | 'save' | 'connection_request';
    user: EnhancedActiveUser;
    pagePath?: string;
    listingTitle?: string;
    timestamp: string;
  }>;
}

export function useEnhancedRealTimeAnalytics() {
  return useQuery({
    queryKey: ['enhanced-realtime-analytics'],
    queryFn: async (): Promise<EnhancedRealTimeData> => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Fetch active sessions with profile data - include new GA4, first-touch fields, and visitor_id
      const [sessionsResult, pageViewsResult] = await Promise.all([
        supabase
          .from('user_sessions')
          .select(`
            id, session_id, user_id, visitor_id, country, country_code, city, region,
            device_type, browser, os, referrer, utm_source, user_agent,
            session_duration_seconds, last_active_at, started_at, is_active,
            ga4_client_id, first_touch_source, first_touch_medium, first_touch_campaign,
            first_touch_landing_page, first_touch_referrer, is_bot, lat, lon
          `)
          .eq('is_bot', false)  // Filter out detected bots
          .or(`last_active_at.gte.${oneHourAgo},started_at.gte.${oneHourAgo}`)
          .order('last_active_at', { ascending: false, nullsFirst: false })
          .limit(100),

        supabase
          .from('page_views')
          .select('page_path, session_id, created_at')
          .gte('created_at', oneHourAgo)
          .order('created_at', { ascending: false })
          .limit(500),
      ]);

      // Deduplicate sessions by session_id
      const sessionsRaw = (sessionsResult.data || []) as unknown as SessionRow[];
      const sessions = deduplicateSessions(sessionsRaw);
      const pageViews = pageViewsResult.data || [];

      // Get unique session IDs from page views to fetch their user_ids
      const pageViewSessionIds = [...new Set(pageViews.map(pv => pv.session_id).filter((id): id is string => id !== null))];

      // Fetch sessions for page views to get their user_ids
      let pageViewSessions: Record<string, string | null> = {};
      if (pageViewSessionIds.length > 0) {
        const { data: pvSessions, error: pvSessionsError } = await supabase
          .from('user_sessions')
          .select('session_id, user_id')
          .in('session_id', pageViewSessionIds);
        if (pvSessionsError) throw pvSessionsError;

        pageViewSessions = (pvSessions || []).reduce((acc, s) => {
          acc[s.session_id] = s.user_id;
          return acc;
        }, {} as Record<string, string | null>);
      }

      // Get all user IDs - from active sessions AND from page view sessions
      const sessionUserIds = sessions.filter(s => s.user_id).map(s => s.user_id as string);
      const pageViewUserIds = Object.values(pageViewSessions).filter(Boolean) as string[];
      const userIds = [...new Set([...sessionUserIds, ...pageViewUserIds])];

      // Fetch profiles for logged-in users with real fields
      let profiles: Record<string, ProfileRow> = {};
      if (userIds.length > 0) {
        const { data: profileData, error: profileDataError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, company, company_name, buyer_type, job_title, fee_agreement_signed, nda_signed')
          .in('id', userIds);
        if (profileDataError) throw profileDataError;

        profiles = ((profileData || []) as unknown as ProfileRow[]).reduce((acc, p) => {
          acc[p.id] = p;
          return acc;
        }, {} as Record<string, ProfileRow>);
      }

      // Fetch engagement data for users
      let engagementData: Record<string, EngagementRow> = {};
      if (userIds.length > 0) {
        const { data: engagement, error: engagementError } = await supabase
          .from('engagement_scores')
          .select('user_id, listings_viewed, listings_saved, connections_requested, session_count, total_session_time, search_count')
          .in('user_id', userIds);
        if (engagementError) throw engagementError;

        engagementData = ((engagement || []) as unknown as EngagementRow[]).reduce((acc, e) => {
          acc[e.user_id] = e;
          return acc;
        }, {} as Record<string, EngagementRow>);
      }

      // Build page view maps
      const pageViewData = buildPageViewMaps(pageViews);

      // Fetch cross-session visitor history for anonymous users
      const visitorIds = sessions
        .map(s => s.visitor_id)
        .filter(Boolean) as string[];

      let visitorHistory: Record<string, { totalSessions: number; firstSeen: string; totalTime: number }> = {};

      if (visitorIds.length > 0) {
        const { data: historicalSessions, error: historicalSessionsError } = await supabase
          .from('user_sessions')
          .select('visitor_id, started_at, session_duration_seconds')
          .in('visitor_id', visitorIds);
        if (historicalSessionsError) throw historicalSessionsError;

        visitorHistory = buildVisitorHistory(historicalSessions || []);
      }

      // Build enhanced user objects with REAL data
      const activeUsers: EnhancedActiveUser[] = sessions.map(session => {
        const profile = session.user_id ? profiles[session.user_id] : null;
        const engagement = session.user_id ? engagementData[session.user_id] : null;
        const visitorId = session.visitor_id || null;
        const vHistory = visitorId ? visitorHistory[visitorId] : null;

        return buildEnhancedActiveUser(session, profile, engagement, vHistory, pageViewData);
      });

      // Calculate aggregates
      const countryCounts: Record<string, { count: number; code: string | null }> = {};
      const deviceCounts: Record<string, number> = {};
      const referrerCounts: Record<string, number> = {};
      const entrySourceCounts: Record<string, number> = {};

      activeUsers.forEach(user => {
        // Country
        const country = user.country || 'Unknown';
        if (!countryCounts[country]) {
          countryCounts[country] = { count: 0, code: user.countryCode };
        }
        countryCounts[country].count++;

        // Device
        const device = user.deviceType || 'unknown';
        deviceCounts[device] = (deviceCounts[device] || 0) + 1;

        // Referrer - use improved normalizer
        const normalizedRef = normalizeReferrer(user.referrer, user.utmSource);
        referrerCounts[normalizedRef] = (referrerCounts[normalizedRef] || 0) + 1;

        // Entry source
        entrySourceCounts[user.entrySource] = (entrySourceCounts[user.entrySource] || 0) + 1;
      });

      // Recent events - look up user by session's user_id, not just active sessions
      const recentEvents = pageViews.slice(0, 30).map((pv, i) => {
        // First try to find in active users
        let matchingUser = activeUsers.find(u => u.sessionId === pv.session_id);

        // If not found but session has a user_id, create user from profile data
        if (!matchingUser && pv.session_id) {
          const userId = pageViewSessions[pv.session_id];
          if (userId && profiles[userId]) {
            const profile = profiles[userId];
            const engagement = engagementData[userId];
            const realName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

            matchingUser = {
              sessionId: pv.session_id,
              visitorId: null,
              userId,
              userName: realName || null,
              displayName: realName || generateAnonymousName(pv.session_id),
              companyName: profile.company || profile.company_name || null,
              buyerType: profile.buyer_type || null,
              jobTitle: profile.job_title || null,
              isAnonymous: !realName,
              country: null,
              countryCode: null,
              city: null,
              coordinates: null,
              deviceType: 'desktop',
              browser: null,
              os: null,
              referrer: null,
              utmSource: null,
              // Entry/Attribution
              entrySource: 'Direct',
              firstPagePath: pv.page_path,
              pageSequence: [pv.page_path],
              ga4ClientId: null,
              firstTouchSource: null,
              firstTouchMedium: null,
              externalReferrer: null,
              // Session
              sessionDurationSeconds: 0,
              lastActiveAt: pv.created_at ?? new Date().toISOString(),
              currentPage: pv.page_path ?? '',
              sessionStatus: getSessionStatus(pv.created_at),
              listingsViewed: engagement?.listings_viewed || 0,
              listingsSaved: engagement?.listings_saved || 0,
              connectionsSent: engagement?.connections_requested || 0,
              totalVisits: engagement?.session_count || 1,
              totalTimeSpent: engagement?.total_session_time || 0,
              searchCount: engagement?.search_count || 0,
              // APPROXIMATE — stale profile-level booleans for performance; canonical source is firm_agreements
              feeAgreementSigned: profile.fee_agreement_signed || false,
              ndaSigned: profile.nda_signed || false,
              // Cross-session journey data
              visitorFirstSeen: pv.created_at,
              visitorTotalSessions: 1,
              visitorTotalTime: 0,
            };
          }
        }

        return {
          id: `event-${i}`,
          type: 'page_view' as const,
          user: matchingUser || createDefaultUser(pv.session_id || `anon-${i}`, pv.page_path ?? '', pv.created_at ?? new Date().toISOString()),
          pagePath: pv.page_path ?? '',
          timestamp: pv.created_at ?? new Date().toISOString(),
        };
      });

      return {
        activeUsers,
        totalActiveUsers: activeUsers.length,
        byCountry: Object.entries(countryCounts)
          .map(([country, data]) => ({ country, countryCode: data.code, count: data.count }))
          .sort((a, b) => b.count - a.count),
        byDevice: Object.entries(deviceCounts)
          .map(([device, count]) => ({ device, count }))
          .sort((a, b) => b.count - a.count),
        byReferrer: Object.entries(referrerCounts)
          .map(([referrer, count]) => ({ referrer, count }))
          .sort((a, b) => b.count - a.count),
        byEntrySource: Object.entries(entrySourceCounts)
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count),
        recentEvents,
      };
    },
    // Long staleTime ensures instant cache hits when toggling globe
    // Background refetch keeps data fresh without blocking UI
    staleTime: 30000, // 30 seconds - serve cached data instantly
    refetchInterval: 60000, // Background refresh every 60s (was 10s)
    refetchOnMount: 'always', // Always refetch on mount but use stale data immediately
  });
}
