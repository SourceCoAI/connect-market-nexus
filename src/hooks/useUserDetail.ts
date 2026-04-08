import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subDays, format, differenceInSeconds } from 'date-fns';
import { generateAnonymousName } from '@/lib/anonymousNames';

export interface UserEvent {
  id: string;
  type: 'page_view' | 'event';
  timestamp: string;
  title: string;
  description?: string;
  path?: string;
  metadata?: Record<string, unknown>;
}

export interface UserActivityDay {
  date: string;
  pageViews: number;
  level: 'none' | 'low' | 'medium' | 'high';
}

export interface UserDetailData {
  profile: {
    id: string;
    name: string;
    email?: string;
    company?: string;
    buyerType?: string;
    avatarUrl?: string;
    isAnonymous: boolean;
  };
  geo: {
    country: string;
    city: string;
    region?: string;
  };
  tech: {
    device: string;
    os: string;
    browser: string;
    resolution?: string;
  };
  stats: {
    totalPageviews: number;
    totalSessions: number;
    totalTimeOnSite: number; // seconds
    firstSeen: string;
    lastSeen: string;
    timeToConvert?: number; // seconds
    connections: number;
    convertedAt?: string;
  };
  events: UserEvent[];
  activityLast7Days: UserActivityDay[];
  activityHeatmap: UserActivityDay[]; // Last 6 months
  source: {
    referrer?: string;
    landingPage?: string;
    channel?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    // Cross-domain journey tracking
    originalExternalReferrer?: string; // True discovery source (e.g., google.com)
    blogLandingPage?: string; // Entry page on main site (e.g., /marketplace)
    // Full session history for complete journey visibility
    allSessions?: Array<{
      referrer: string | null;
      landingPage: string | null;
      startedAt: string;
      channel: string;
      utmSource?: string | null;
      utmMedium?: string | null;
      utmCampaign?: string | null;
      originalExternalReferrer?: string | null;
      blogLandingPage?: string | null;
    }>;
  };
}

// Anonymous name generation is now centralized in @/lib/anonymousNames

// Discovery source priority: original_external_referrer > utm_source > referrer
function getDiscoverySource(
  session: {
    original_external_referrer?: string | null;
    utm_source?: string | null;
    referrer?: string | null;
  } | null,
): string | null {
  if (!session) return null;
  if (session.original_external_referrer) return session.original_external_referrer;
  if (session.utm_source) return session.utm_source;
  return session.referrer || null;
}

// Find the first session with meaningful attribution data
// Priority: original_external_referrer > utm_source > referrer > any session
// This handles race conditions where the chronologically first session may have no referrer
interface SessionRecord {
  session_id: string;
  started_at: string | null;
  last_active_at: string | null;
  session_duration_seconds: number | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  original_external_referrer: string | null;
  blog_landing_page: string | null;
  first_touch_landing_page: string | null;
  country: string | null;
  city: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  [key: string]: unknown;
}

interface PageViewRecord {
  id: string;
  created_at: string | null;
  page_path: string | null;
  [key: string]: unknown;
}

interface ConnectionRecord {
  id: string;
  created_at: string | null;
  listing_id: string;
  [key: string]: unknown;
}

function getFirstMeaningfulSession(sessions: SessionRecord[]): SessionRecord | null {
  if (!sessions || sessions.length === 0) return null;

  // Sessions come sorted DESC (most recent first), reverse for chronological
  const chronological = [...sessions].reverse();

  // Priority 1: First session with cross-domain tracking
  const withCrossDomain = chronological.find((s) => s.original_external_referrer);
  if (withCrossDomain) return withCrossDomain;

  // Priority 2: First session with UTM source
  const withUtm = chronological.find((s) => s.utm_source);
  if (withUtm) return withUtm;

  // Priority 3: First session with any referrer
  const withReferrer = chronological.find((s) => s.referrer);
  if (withReferrer) return withReferrer;

  // Fallback: actual first session (truly direct)
  return chronological[0];
}

function categorizeChannel(
  referrer: string | null,
  utmSource: string | null,
  utmMedium: string | null,
): string {
  if (!referrer && !utmSource) return 'Direct';

  const source = (referrer || utmSource || '').toLowerCase();
  const medium = (utmMedium || '').toLowerCase();

  if (
    source.includes('chatgpt') ||
    source.includes('openai') ||
    source.includes('claude') ||
    source.includes('anthropic')
  )
    return 'AI';
  if (
    source.includes('linkedin') ||
    source.includes('twitter') ||
    source.includes('x.com') ||
    source.includes('facebook')
  )
    return 'Organic Social';
  if (source.includes('google') && !medium.includes('cpc')) return 'Organic Search';
  if (medium.includes('cpc') || medium.includes('paid')) return 'Paid';
  if (medium.includes('email') || medium.includes('newsletter')) return 'Newsletter';
  if (referrer) return 'Referral';

  return 'Direct';
}

function getActivityLevel(pageViews: number): 'none' | 'low' | 'medium' | 'high' {
  if (pageViews === 0) return 'none';
  if (pageViews <= 2) return 'low';
  if (pageViews <= 5) return 'medium';
  return 'high';
}

export function useUserDetail(visitorId: string | null) {
  return useQuery({
    queryKey: ['user-detail', visitorId],
    queryFn: async (): Promise<UserDetailData | null> => {
      if (!visitorId) return null;

      const sixMonthsAgo = subDays(new Date(), 180).toISOString();

      // First, determine if this is a user_id or visitor_id by checking profiles
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', visitorId)
        .maybeSingle();
      if (profileError) throw profileError;

      const isUserId = !!profile;

      // Fetch sessions based on identifier type
      // Filter out bot sessions
      const sessionsQuery = isUserId
        ? supabase
            .from('user_sessions')
            .select('*')
            .eq('user_id', visitorId)
            .eq('is_bot', false)
            .gte('started_at', sixMonthsAgo)
            .order('started_at', { ascending: false })
        : supabase
            .from('user_sessions')
            .select('*')
            .eq('visitor_id', visitorId)
            .eq('is_bot', false)
            .gte('started_at', sixMonthsAgo)
            .order('started_at', { ascending: false });

      // First fetch sessions to get session IDs for anonymous users
      const sessionsResult = await sessionsQuery;
      if (sessionsResult.error) throw sessionsResult.error;
      const sessions = sessionsResult.data || [];

      // Fetch page views - for anonymous users, query by session_id
      let pageViews: PageViewRecord[] = [];
      if (isUserId) {
        const { data, error: pageViewsError } = await supabase
          .from('page_views')
          .select('*')
          .eq('user_id', visitorId)
          .gte('created_at', sixMonthsAgo)
          .order('created_at', { ascending: true });
        if (pageViewsError) throw pageViewsError;
        pageViews = data || [];
      } else if (sessions.length > 0) {
        // For anonymous visitors, fetch page views by session IDs
        const sessionIds = sessions.map((s) => s.session_id).filter(Boolean);
        if (sessionIds.length > 0) {
          const { data, error: pageViewsError } = await supabase
            .from('page_views')
            .select('*')
            .in('session_id', sessionIds)
            .gte('created_at', sixMonthsAgo)
            .order('created_at', { ascending: true });
          if (pageViewsError) throw pageViewsError;
          pageViews = data || [];
        }
      }

      // Only fetch connections for registered users
      let connections: ConnectionRecord[] = [];
      if (isUserId) {
        const { data, error: connectionsError } = await supabase
          .from('connection_requests')
          .select('id, created_at, listing_id')
          .eq('user_id', visitorId)
          .order('created_at', { ascending: true });
        if (connectionsError) throw connectionsError;
        connections = (data || []).map(d => ({ ...d, listing_id: d.listing_id || '' }));
      }

      // Determine if anonymous
      const isAnonymous = !profile || (!profile.first_name && !profile.last_name);
      const name = isAnonymous
        ? generateAnonymousName(visitorId)
        : [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Anonymous';

      // Get latest session for geo/tech data
      const latestSession = sessions[0];

      // Calculate stats
      const totalPageviews = pageViews.length;
      const totalSessions = new Set(sessions.map((s) => s.session_id)).size;
      const totalTimeOnSite = sessions.reduce(
        (sum, s) => sum + (s.session_duration_seconds || 0),
        0,
      );

      const actualFirstSession = sessions[sessions.length - 1]; // Chronologically first, for timestamps
      const attributionSession = getFirstMeaningfulSession(sessions); // Smart first-touch attribution
      const firstSeen = actualFirstSession?.started_at || new Date().toISOString();
      const lastSeen =
        latestSession?.last_active_at || latestSession?.started_at || new Date().toISOString();

      // Time to convert (first session to first connection)
      let timeToConvert: number | undefined;
      let convertedAt: string | undefined;
      if (connections.length > 0 && actualFirstSession) {
        const firstConnectionDate = new Date(connections[0].created_at!);
        const firstSessionDate = new Date(actualFirstSession.started_at ?? Date.now());
        timeToConvert = differenceInSeconds(firstConnectionDate, firstSessionDate);
        convertedAt = connections[0].created_at ?? undefined;
      }

      // Build event timeline
      const events: UserEvent[] = [];

      // Add page views
      pageViews.forEach((pv) => {
        events.push({
          id: pv.id,
          type: 'page_view',
          timestamp: pv.created_at ?? '',
          title: `Viewed page`,
          path: pv.page_path ?? undefined,
          description: pv.page_path ?? undefined,
        });
      });

      // Add connection events
      connections.forEach((c) => {
        events.push({
          id: c.id,
          type: 'event',
          timestamp: c.created_at ?? '',
          title: 'Sent connection request',
          description: `Connection request submitted`,
          metadata: { listingId: c.listing_id },
        });
      });

      // Sort by timestamp
      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Build activity for last 7 days
      const last7Days: UserActivityDay[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayViews = pageViews.filter((pv) =>
          pv.created_at ? format(new Date(pv.created_at), 'yyyy-MM-dd') === dateStr : false,
        ).length;
        last7Days.push({
          date: dateStr,
          pageViews: dayViews,
          level: getActivityLevel(dayViews),
        });
      }

      // Build activity heatmap for last 6 months
      const activityHeatmap: UserActivityDay[] = [];
      for (let i = 180; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayViews = pageViews.filter((pv) =>
          pv.created_at ? format(new Date(pv.created_at), 'yyyy-MM-dd') === dateStr : false,
        ).length;
        activityHeatmap.push({
          date: dateStr,
          pageViews: dayViews,
          level: getActivityLevel(dayViews),
        });
      }

      return {
        profile: {
          id: visitorId,
          name,
          email: profile?.email,
          company: profile?.company ?? undefined,
          buyerType: profile?.buyer_type ?? undefined,
          isAnonymous,
        },
        geo: {
          country: latestSession?.country || 'Unknown',
          city: latestSession?.city || 'Unknown',
        },
        tech: {
          device: latestSession?.device_type || 'Desktop',
          os: latestSession?.os || 'Unknown',
          browser: latestSession?.browser || 'Unknown',
          resolution: undefined, // Not tracked in current schema
        },
        stats: {
          totalPageviews,
          totalSessions,
          totalTimeOnSite,
          firstSeen,
          lastSeen,
          timeToConvert,
          connections: connections.length,
          convertedAt,
        },
        events,
        activityLast7Days: last7Days,
        activityHeatmap,
        source: {
          // Use smart first-touch: find first session with meaningful attribution
          referrer:
            getDiscoverySource(attributionSession) || attributionSession?.referrer || undefined,
          landingPage:
            attributionSession?.first_touch_landing_page ||
            actualFirstSession?.first_touch_landing_page ||
            undefined,
          channel: categorizeChannel(
            getDiscoverySource(attributionSession),
            attributionSession?.utm_source ?? null,
            attributionSession?.utm_medium ?? null,
          ),
          utmSource: attributionSession?.utm_source || actualFirstSession?.utm_source || undefined,
          utmMedium: attributionSession?.utm_medium || actualFirstSession?.utm_medium || undefined,
          utmCampaign:
            attributionSession?.utm_campaign || actualFirstSession?.utm_campaign || undefined,
          // Cross-domain journey tracking
          originalExternalReferrer:
            attributionSession?.original_external_referrer ||
            actualFirstSession?.original_external_referrer ||
            undefined,
          blogLandingPage:
            attributionSession?.blog_landing_page ||
            actualFirstSession?.blog_landing_page ||
            undefined,
          // Full journey history - all sessions with their referrers
          allSessions: sessions.map((s) => ({
            referrer: s.referrer,
            landingPage: s.first_touch_landing_page,
            startedAt: s.started_at ?? new Date().toISOString(),
            channel: categorizeChannel(getDiscoverySource(s), s.utm_source, s.utm_medium),
            utmSource: s.utm_source,
            utmMedium: s.utm_medium,
            utmCampaign: s.utm_campaign,
            originalExternalReferrer: s.original_external_referrer,
            blogLandingPage: s.blog_landing_page,
          })),
        },
      };
    },
    enabled: !!visitorId,
    staleTime: 30000,
  });
}
