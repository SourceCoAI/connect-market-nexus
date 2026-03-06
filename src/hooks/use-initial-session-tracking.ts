import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessionContext } from '@/contexts/SessionContext';
import { useVisitorIdentity, getGA4ClientIdAsync } from './useVisitorIdentity';

// Helper functions
function getBrowserName(): string {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
  if (userAgent.includes('Edg')) return 'Edge';
  if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera';
  return 'Unknown';
}

function getOSName(): string {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac')) return 'macOS';
  if (userAgent.includes('Linux') && !userAgent.includes('Android')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  return 'Unknown';
}

function getDeviceType(): string {
  const userAgent = navigator.userAgent;
  if (/Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
    return /iPad/i.test(userAgent) ? 'tablet' : 'mobile';
  }
  return 'desktop';
}

// Get first-touch attribution from localStorage (supports both old and new key)
function getFirstTouchAttribution(): {
  first_touch_source: string | null;
  first_touch_medium: string | null;
  first_touch_campaign: string | null;
  first_touch_term: string | null;
  first_touch_content: string | null;
  first_touch_timestamp: string | null;
  first_touch_landing_page: string | null;
  first_touch_referrer: string | null;
} {
  try {
    // Try new key first, then legacy key
    const stored =
      localStorage.getItem('sourceco_first_touch') ||
      localStorage.getItem('first_touch_attribution');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        first_touch_source: parsed.utm_source || null,
        first_touch_medium: parsed.utm_medium || null,
        first_touch_campaign: parsed.utm_campaign || null,
        first_touch_term: parsed.utm_term || null,
        first_touch_content: parsed.utm_content || null,
        first_touch_timestamp: parsed.timestamp || null,
        first_touch_landing_page: parsed.landing_page || null,
        first_touch_referrer: parsed.referrer || null,
      };
    }
  } catch {
    // Ignore localStorage errors
  }
  return {
    first_touch_source: null,
    first_touch_medium: null,
    first_touch_campaign: null,
    first_touch_term: null,
    first_touch_content: null,
    first_touch_timestamp: null,
    first_touch_landing_page: null,
    first_touch_referrer: null,
  };
}

export const useInitialSessionTracking = () => {
  const { sessionId, utmParams, referrer } = useSessionContext();
  const { visitorId, getCurrentGA4ClientId } = useVisitorIdentity();
  const hasTracked = useRef(false);

  useEffect(() => {
    // Only track once per app load
    if (hasTracked.current) return;

    const trackInitialSession = async () => {
      try {
        // Check if user is authenticated — gracefully handle missing session
        // (anonymous visitors won't have a session, and on initial load there
        // may be a race where the session hasn't been restored yet)
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) {
          // AuthSessionMissingError is expected for anonymous visitors —
          // continue tracking without a user_id
          if (authError.message?.includes('Auth session missing') ||
              authError.name === 'AuthSessionMissingError') {
            // Proceed with user = null
          } else {
            throw authError;
          }
        }

        // Get GA4 client ID - try sync first, then async
        let ga4ClientId = getCurrentGA4ClientId();
        if (!ga4ClientId) {
          ga4ClientId = await getGA4ClientIdAsync();
        }

        // Get first-touch attribution data from localStorage
        const firstTouchData = getFirstTouchAttribution();

        // Calculate time on page since navigation started for accurate initial duration
        const timeOnPage =
          typeof performance !== 'undefined' && performance.timing
            ? Math.max(0, Math.floor((Date.now() - performance.timing.navigationStart) / 1000))
            : 0;

        // Extract ALL cross-domain tracking params (passed from sourcecodeals.com)
        const SCO_SEARCH_STORAGE_KEY = 'sco_cross_domain_search';
        const currentSearch = window.location.search || '';
        const hasCrossDomainParams =
          currentSearch.includes('sco_ref_host=') ||
          currentSearch.includes('sco_landing=') ||
          currentSearch.includes('sco_entry_time=') ||
          currentSearch.includes('sco_ga4_cid=') ||
          currentSearch.includes('original_referrer=') ||
          currentSearch.includes('blog_landing=');

        // Persist first seen cross-domain params so attribution survives internal redirects
        if (hasCrossDomainParams) {
          try {
            sessionStorage.setItem(SCO_SEARCH_STORAGE_KEY, currentSearch);
          } catch {
            // Ignore sessionStorage errors
          }
        }

        let effectiveSearch = currentSearch;
        if (!hasCrossDomainParams) {
          try {
            const stored = sessionStorage.getItem(SCO_SEARCH_STORAGE_KEY);
            if (stored) effectiveSearch = stored;
          } catch {
            // Ignore sessionStorage errors
          }
        }

        const searchParams = new URLSearchParams(effectiveSearch);
        // Support both full URL (legacy) and hostname-only (hardened/recommended)
        const originalReferrer = searchParams.get('original_referrer');
        const scoRefHost = searchParams.get('sco_ref_host'); // Hardened version - hostname only
        const scoLanding = searchParams.get('sco_landing') || searchParams.get('blog_landing');
        const scoEntryTime = searchParams.get('sco_entry_time');
        const scoGa4Cid = searchParams.get('sco_ga4_cid');
        const gclid = searchParams.get('gclid');
        const fbclid = searchParams.get('fbclid');
        const liFatId = searchParams.get('li_fat_id'); // LinkedIn ad tracking

        // Prepare tracking data for edge function with enhanced journey tracking
        const trackingData = {
          session_id: sessionId,
          visitor_id: visitorId,
          user_id: user?.id || null,
          user_agent: navigator.userAgent,
          referrer: referrer || document.referrer || null,
          device_type: getDeviceType(),
          browser: getBrowserName(),
          os: getOSName(),
          utm_source: utmParams.utm_source || null,
          utm_medium: utmParams.utm_medium || null,
          utm_campaign: utmParams.utm_campaign || null,
          utm_term: utmParams.utm_term || null,
          utm_content: utmParams.utm_content || null,
          // Enhanced landing page tracking
          landing_url: window.location.href,
          landing_path: window.location.pathname,
          landing_search: window.location.search,
          // GA4 integration - prefer cross-domain CID if passed from website
          ga4_client_id: scoGa4Cid || ga4ClientId,
          // Initial time on page for accurate session duration from start
          time_on_page: timeOnPage,
          // Cross-domain attribution (passed from sourcecodeals.com)
          // Prefer hostname-only (sco_ref_host) over full URL for privacy
          original_referrer: originalReferrer || undefined,
          original_referrer_host: scoRefHost || undefined,
          blog_landing: scoLanding || undefined,
          sco_entry_time: scoEntryTime || undefined,
          // Ad tracking IDs
          gclid: gclid || undefined,
          fbclid: fbclid || undefined,
          li_fat_id: liFatId || undefined,
          // First-touch attribution for historical analysis
          ...firstTouchData,
        };

        // Call edge function for IP geolocation and session creation
        const { error } = await supabase.functions.invoke('track-session', {
          body: trackingData,
        });

        if (error) {
          console.error('❌ Error tracking session via edge function:', error);
          // Fallback: create session directly without geo data
          await createSessionDirectly(trackingData);
          return;
        }

        // Also track initial session for first-touch attribution (for authenticated users)
        if (user?.id) {
          await trackInitialSessionForUser(user.id, trackingData);
        }

        hasTracked.current = true;
      } catch (error) {
        console.error('❌ Unexpected error in session tracking:', error);
      }
    };

    // Track first-touch attribution for authenticated users
    const trackInitialSessionForUser = async (userId: string, data: Record<string, unknown>) => {
      try {
        const { error } = await supabase.functions.invoke('track-initial-session', {
          body: {
            user_id: userId,
            session_id: data.session_id,
            referrer: data.referrer,
            landing_page: data.landing_path,
            landing_page_query: data.landing_search,
            utm_source: data.first_touch_source || data.utm_source,
            utm_medium: data.first_touch_medium || data.utm_medium,
            utm_campaign: data.first_touch_campaign || data.utm_campaign,
            utm_term: data.first_touch_term || data.utm_term,
            utm_content: data.first_touch_content || data.utm_content,
            user_agent: data.user_agent,
            ga4_client_id: data.ga4_client_id,
          },
        });

        if (error) {
          console.error('❌ Error tracking initial session:', error);
        }
      } catch (error) {
        console.error('❌ Error in trackInitialSessionForUser:', error);
      }
    };

    // Removed fallback session creation - track-session edge function is the single source of truth
    // This prevents race conditions that skip journey upsert logic
    const createSessionDirectly = async (_data: Record<string, unknown>) => {
      hasTracked.current = true;
    };

    // Track after a short delay to ensure visitor identity is initialized
    const timeoutId = setTimeout(trackInitialSession, 800);

    return () => clearTimeout(timeoutId);
  }, [sessionId, utmParams, referrer, visitorId, getCurrentGA4ClientId]);
};
