/**
 * Route constants — single source of truth for all application paths.
 *
 * Usage:
 *   import { ROUTES, buildRoute } from '@/config/routes';
 *
 *   <Link to={ROUTES.marketplace.root} />
 *   <Link to={buildRoute('listingDetail', { id: '123' })} />
 *   navigate(ROUTES.admin.deals.root);
 */

// ─── Public Routes ───────────────────────────────────────────────────────────

export const ROUTES = {
  // Public / Auth
  welcome: '/welcome',
  login: '/login',
  signup: '/signup',
  signupSuccess: '/signup-success',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  pendingApproval: '/pending-approval',
  authCallback: '/auth/callback',
  unauthorized: '/unauthorized',

  // Owner / Seller
  sell: '/sell',
  sellSuccess: '/sell/success',

  // Public portals
  referralTracker: '/referrals/:shareToken',
  dataRoomPortal: '/dataroom/:accessToken',
  trackedDocumentViewer: '/view/:linkToken',

  // ─── Buyer-Facing (Marketplace) ──────────────────────────────────────────
  marketplace: {
    root: '/',
    profile: '/profile',
    listingDetail: '/listing/:id',
    myDeals: '/my-deals',
    messages: '/messages',
    savedListings: '/saved-listings',
  },

  // ─── Admin ───────────────────────────────────────────────────────────────
  admin: {
    root: '/admin',

    deals: {
      root: '/admin/deals',
      detail: '/admin/deals/:dealId',
      pipeline: '/admin/deals/pipeline',
    },

    buyers: {
      root: '/admin/buyers',
      detail: '/admin/buyers/:id',
      universes: '/admin/buyers/universes',
      universeDetail: '/admin/buyers/universes/:id',
      peFirmDetail: '/admin/buyers/pe-firms/:id',
      dealSourcing: '/admin/buyers/deal-sourcing',
      contacts: '/admin/buyers/contacts',
    },

    lists: {
      root: '/admin/lists',
      detail: '/admin/lists/:id',
    },

    marketplace: {
      queue: '/admin/marketplace/queue',
      requests: '/admin/marketplace/requests',
      messages: '/admin/marketplace/messages',
      users: '/admin/marketplace/users',
    },

    remarketing: {
      root: '/admin/remarketing',
      activityQueue: '/admin/remarketing/activity-queue',
      captarget: '/admin/remarketing/leads/captarget',
      captargetDetail: '/admin/remarketing/leads/captarget/:dealId',
      gpPartners: '/admin/remarketing/leads/gp-partners',
      gpPartnersDetail: '/admin/remarketing/leads/gp-partners/:dealId',
      sourceco: '/admin/remarketing/leads/sourceco',
      sourcecoDetail: '/admin/remarketing/leads/sourceco/:dealId',
      valuation: '/admin/remarketing/leads/valuation',
      referrals: '/admin/remarketing/leads/referrals',
      referralDetail: '/admin/remarketing/leads/referrals/:partnerId',
      matching: '/admin/remarketing/matching/:listingId',
      introductions: '/admin/remarketing/introductions/:listingId',
    },

    approvals: '/admin/approvals',

    analytics: {
      root: '/admin/analytics',
      website: '/admin/analytics/website',
      remarketing: '/admin/analytics/remarketing',
      transcripts: '/admin/analytics/transcripts',
    },

    smartlead: {
      campaigns: '/admin/smartlead/campaigns',
      settings: '/admin/smartlead/settings',
    },

    phoneburner: {
      sessions: '/admin/phoneburner/sessions',
      settings: '/admin/phoneburner/settings',
    },

    settings: {
      team: '/admin/settings/team',
      ownerLeads: '/admin/settings/owner-leads',
      notifications: '/admin/settings/notifications',
      webhooks: '/admin/settings/webhooks',
      enrichmentQueue: '/admin/settings/enrichment-queue',
      enrichmentTest: '/admin/settings/enrichment-test',
      remarketing: '/admin/settings/remarketing',
      dataRecovery: '/admin/settings/data-recovery',
      formMonitoring: '/admin/settings/form-monitoring',
      security: '/admin/settings/security',
    },

    systemTest: '/admin/system-test',

  },
} as const;

// ─── Route Builder ───────────────────────────────────────────────────────────

type RouteParams = Record<string, string | number>;

/**
 * Build a route path by replacing :param placeholders with actual values.
 *
 * @example
 *   buildRoute('/listing/:id', { id: '123' })           // '/listing/123'
 *   buildRoute('/admin/deals/:dealId', { dealId: '42' }) // '/admin/deals/42'
 */
export function buildRoute(path: string, params: RouteParams = {}): string {
  let result = path;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`:${key}`, String(value));
  }
  return result;
}

// ─── Named route builders for the most common parameterised routes ───────────

export const routeBuilders = {
  listingDetail: (id: string) => buildRoute(ROUTES.marketplace.listingDetail, { id }),
  dealDetail: (dealId: string) => buildRoute(ROUTES.admin.deals.detail, { dealId }),
  buyerDetail: (id: string) => buildRoute(ROUTES.admin.buyers.detail, { id }),
  universeDetail: (id: string) => buildRoute(ROUTES.admin.buyers.universeDetail, { id }),
  peFirmDetail: (id: string) => buildRoute(ROUTES.admin.buyers.peFirmDetail, { id }),
  referralTracker: (shareToken: string) => buildRoute(ROUTES.referralTracker, { shareToken }),
  dataRoomPortal: (accessToken: string) => buildRoute(ROUTES.dataRoomPortal, { accessToken }),
  trackedDocument: (linkToken: string) => buildRoute(ROUTES.trackedDocumentViewer, { linkToken }),
  captargetDetail: (dealId: string) =>
    buildRoute(ROUTES.admin.remarketing.captargetDetail, { dealId }),
  gpPartnerDetail: (dealId: string) =>
    buildRoute(ROUTES.admin.remarketing.gpPartnersDetail, { dealId }),
  sourcecoDetail: (dealId: string) =>
    buildRoute(ROUTES.admin.remarketing.sourcecoDetail, { dealId }),
  referralPartnerDetail: (partnerId: string) =>
    buildRoute(ROUTES.admin.remarketing.referralDetail, { partnerId }),
  dealMatching: (listingId: string) => buildRoute(ROUTES.admin.remarketing.matching, { listingId }),
  dealIntroductions: (listingId: string) =>
    buildRoute(ROUTES.admin.remarketing.introductions, { listingId }),
  contactListDetail: (id: string) => buildRoute(ROUTES.admin.lists.detail, { id }),
} as const;
