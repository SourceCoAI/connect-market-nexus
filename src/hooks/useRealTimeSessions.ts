import { generateAnonymousName } from "@/lib/anonymousNames";
import { getCountryCode } from "@/lib/flagEmoji";
import type { EnhancedActiveUser } from "./useEnhancedRealTimeAnalytics";
import {
  getSessionStatus,
  calculateDuration,
  normalizeReferrer,
  extractExternalReferrer,
  resolveSessionCoordinates,
} from "./useRealTimeGeolocation";

/** Session row shape from the user_sessions select query */
export interface SessionRow {
  id: string;
  session_id: string;
  user_id: string | null;
  visitor_id: string | null;
  country: string | null;
  country_code: string | null;
  city: string | null;
  region: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  referrer: string | null;
  utm_source: string | null;
  user_agent: string | null;
  session_duration_seconds: number | null;
  last_active_at: string | null;
  started_at: string;
  is_active: boolean | null;
  ga4_client_id: string | null;
  first_touch_source: string | null;
  first_touch_medium: string | null;
  first_touch_campaign: string | null;
  first_touch_landing_page: string | null;
  first_touch_referrer: string | null;
  is_bot: boolean | null;
  lat: number | null;
  lon: number | null;
}

/** Profile row shape from engagement lookup */
export interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  company_name: string | null;
  buyer_type: string | null;
  job_title: string | null;
  // NOTE: These are synced from firm_agreements via webhook cascade.
  // Canonical source of truth is firm_agreements.nda_status / fee_agreement_status.
  fee_agreement_signed: boolean | null;
  nda_signed: boolean | null;
}

/** Engagement row shape */
export interface EngagementRow {
  user_id: string;
  listings_viewed: number | null;
  listings_saved: number | null;
  connections_requested: number | null;
  session_count: number | null;
  total_session_time: number | null;
  search_count: number | null;
}

/**
 * Deduplicate session rows by session_id, applying client-side bot filtering.
 * Prefers rows with geo data and more recent activity.
 */
export function deduplicateSessions(sessionsRaw: SessionRow[]): SessionRow[] {
  const sessionMap = new Map<string, SessionRow>();

  sessionsRaw.forEach(session => {
    // Additional client-side bot filtering for any that slip through
    const userAgent = session.user_agent || '';
    const isLikelyBot =
      /Chrome\/11[0-9]\./.test(userAgent) ||
      /HeadlessChrome/i.test(userAgent) ||
      /bot\b/i.test(userAgent);

    if (isLikelyBot) return; // Skip bot sessions

    const existing = sessionMap.get(session.session_id);
    if (!existing) {
      sessionMap.set(session.session_id, session);
    } else if (!existing.country && session.country) {
      // Prefer the row with geo data
      sessionMap.set(session.session_id, session);
    } else if (existing.last_active_at && session.last_active_at &&
               new Date(session.last_active_at) > new Date(existing.last_active_at)) {
      // Or prefer more recent activity
      sessionMap.set(session.session_id, session);
    }
  });

  return Array.from(sessionMap.values());
}

/**
 * Build page view maps: current page, page sequence, and first page per session.
 */
export function buildPageViewMaps(pageViews: Array<{ page_path: string; session_id: string | null; created_at: string | null }>) {
  const sessionCurrentPage: Record<string, string> = {};
  const sessionPageSequence: Record<string, string[]> = {};
  const sessionFirstPage: Record<string, string> = {};

  // Process page views in reverse chronological order to build sequences
  pageViews.forEach(pv => {
    if (pv.session_id) {
      // Track current page (most recent)
      if (!sessionCurrentPage[pv.session_id]) {
        sessionCurrentPage[pv.session_id] = pv.page_path;
      }
      // Build page sequence (will be in reverse order, we'll reverse later)
      if (!sessionPageSequence[pv.session_id]) {
        sessionPageSequence[pv.session_id] = [];
      }
      // Add to sequence if not already present (dedup consecutive same pages)
      const seq = sessionPageSequence[pv.session_id];
      if (seq.length === 0 || seq[seq.length - 1] !== pv.page_path) {
        seq.push(pv.page_path);
      }
    }
  });

  // Reverse sequences to be in chronological order, first page is the landing page
  Object.keys(sessionPageSequence).forEach(sid => {
    sessionPageSequence[sid] = sessionPageSequence[sid].reverse();
    sessionFirstPage[sid] = sessionPageSequence[sid][0] || '';
  });

  return { sessionCurrentPage, sessionPageSequence, sessionFirstPage };
}

/**
 * Build visitor history map from historical session data.
 */
export function buildVisitorHistory(
  historicalSessions: Array<{
    visitor_id: string | null;
    started_at: string | null;
    session_duration_seconds: number | null;
  }>,
): Record<string, { totalSessions: number; firstSeen: string; totalTime: number }> {
  const visitorHistory: Record<string, {
    totalSessions: number;
    firstSeen: string;
    totalTime: number;
  }> = {};

  historicalSessions.forEach(hs => {
    const vid = hs.visitor_id;
    if (!vid) return;

    if (!visitorHistory[vid]) {
      visitorHistory[vid] = {
        totalSessions: 0,
        firstSeen: hs.started_at ?? new Date().toISOString(),
        totalTime: 0,
      };
    }

    visitorHistory[vid].totalSessions++;
    visitorHistory[vid].totalTime += hs.session_duration_seconds || 0;

    // Track earliest session
    if (hs.started_at && new Date(hs.started_at) < new Date(visitorHistory[vid].firstSeen)) {
      visitorHistory[vid].firstSeen = hs.started_at;
    }
  });

  return visitorHistory;
}

/**
 * Build an EnhancedActiveUser from session, profile, engagement, and visitor data.
 */
export function buildEnhancedActiveUser(
  session: SessionRow,
  profile: ProfileRow | null,
  engagement: EngagementRow | null,
  vHistory: { totalSessions: number; firstSeen: string; totalTime: number } | null,
  pageViewData: {
    sessionCurrentPage: Record<string, string>;
    sessionPageSequence: Record<string, string[]>;
    sessionFirstPage: Record<string, string>;
  },
): EnhancedActiveUser {
  const visitorId = session.visitor_id || null;
  const isAnonymous = !profile;
  const realName = profile
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
    : null;
  const displayName = realName || generateAnonymousName(session.session_id);

  // Get coordinates
  const coordinates = resolveSessionCoordinates(
    session.lat,
    session.lon,
    session.city,
    session.country,
    session.session_id,
  );

  const lastActiveAt = session.last_active_at || session.started_at;
  const sessionStatus = getSessionStatus(lastActiveAt);

  // Entry source - use first-touch if available, otherwise derive from referrer
  const entrySource = normalizeReferrer(
    session.first_touch_referrer || session.referrer,
    session.first_touch_source || session.utm_source,
  );

  // Page sequence for this session
  const pageSequence = pageViewData.sessionPageSequence[session.session_id] || [];
  const firstPagePath = session.first_touch_landing_page || pageViewData.sessionFirstPage[session.session_id] || null;

  // External referrer
  const externalReferrer = extractExternalReferrer(session.first_touch_referrer || session.referrer);

  return {
    sessionId: session.session_id,
    visitorId,
    userId: session.user_id,
    userName: realName,
    displayName,
    companyName: profile?.company || profile?.company_name || null,
    buyerType: profile?.buyer_type || null,
    jobTitle: profile?.job_title || null,
    isAnonymous,
    country: session.country,
    countryCode: session.country_code || getCountryCode(session.country),
    city: session.city,
    coordinates,
    deviceType: (session.device_type as 'mobile' | 'desktop' | 'tablet') || 'desktop',
    browser: session.browser,
    os: session.os,
    referrer: session.referrer,
    utmSource: session.utm_source,
    // Entry/Attribution
    entrySource,
    firstPagePath,
    pageSequence,
    ga4ClientId: session.ga4_client_id || null,
    firstTouchSource: session.first_touch_source || null,
    firstTouchMedium: session.first_touch_medium || null,
    externalReferrer,
    // Current session
    sessionDurationSeconds: calculateDuration(session),
    lastActiveAt,
    currentPage: pageViewData.sessionCurrentPage[session.session_id] || null,
    sessionStatus,
    // Real engagement metrics
    listingsViewed: engagement?.listings_viewed || 0,
    listingsSaved: engagement?.listings_saved || 0,
    connectionsSent: engagement?.connections_requested || 0,
    totalVisits: vHistory?.totalSessions || engagement?.session_count || 1,
    totalTimeSpent: vHistory?.totalTime || engagement?.total_session_time || 0,
    searchCount: engagement?.search_count || 0,
    // Trust signals
    feeAgreementSigned: profile?.fee_agreement_signed || false,
    ndaSigned: profile?.nda_signed || false,
    // Cross-session journey data
    visitorFirstSeen: vHistory?.firstSeen || session.started_at,
    visitorTotalSessions: vHistory?.totalSessions || 1,
    visitorTotalTime: vHistory?.totalTime || 0,
  };
}

/**
 * Create a default anonymous user for page views without matching sessions.
 */
export function createDefaultUser(sessionId: string, pagePath: string | null, timestamp: string): EnhancedActiveUser {
  return {
    sessionId,
    visitorId: null,
    userId: null,
    userName: null,
    displayName: generateAnonymousName(sessionId),
    companyName: null,
    buyerType: null,
    jobTitle: null,
    isAnonymous: true,
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
    firstPagePath: pagePath,
    pageSequence: pagePath ? [pagePath] : [],
    ga4ClientId: null,
    firstTouchSource: null,
    firstTouchMedium: null,
    externalReferrer: null,
    // Session
    sessionDurationSeconds: 0,
    lastActiveAt: timestamp,
    currentPage: pagePath,
    sessionStatus: getSessionStatus(timestamp),
    listingsViewed: 0,
    listingsSaved: 0,
    connectionsSent: 0,
    totalVisits: 1,
    totalTimeSpent: 0,
    searchCount: 0,
    feeAgreementSigned: false,
    ndaSigned: false,
    // Cross-session journey data
    visitorFirstSeen: timestamp,
    visitorTotalSessions: 1,
    visitorTotalTime: 0,
  };
}
