// ── Centralized application constants ─────────────────────────────────
// Avoid magic strings and numbers scattered throughout the codebase.

// Re-export sibling constant modules
export { STATUS_TAGS, STATUS_TAG_LABELS, type StatusTagValue } from './statusTags';

// ── Route paths ──────────────────────────────────────────────────────

export const ROUTES = {
  // Public
  WELCOME: '/welcome',
  LOGIN: '/login',
  SIGNUP: '/signup',
  SIGNUP_SUCCESS: '/signup-success',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  PENDING_APPROVAL: '/pending-approval',
  AUTH_CALLBACK: '/auth/callback',
  UNAUTHORIZED: '/unauthorized',
  SELL: '/sell',
  SELL_SUCCESS: '/sell/success',

  // Buyer-facing (authenticated)
  MARKETPLACE: '/',
  PROFILE: '/profile',
  LISTING_DETAIL: '/listing/:id',
  MY_DEALS: '/my-deals',
  MESSAGES: '/messages',
  SAVED_LISTINGS: '/saved-listings',

  // Admin
  ADMIN: '/admin',
  ADMIN_DEALS: '/admin/deals',
  ADMIN_BUYERS: '/admin/buyers',
  ADMIN_REQUESTS: '/admin/marketplace/requests',
  ADMIN_USERS: '/admin/marketplace/users',
  ADMIN_PIPELINE: '/admin/deals/pipeline',
  ADMIN_APPROVALS: '/admin/approvals',
  ADMIN_ANALYTICS: '/admin/analytics',
  ADMIN_SETTINGS: '/admin/settings',
  ADMIN_MESSAGES: '/admin/marketplace/messages',

  // ReMarketing
  REMARKETING: '/admin/remarketing',
  REMARKETING_ACTIVITY_QUEUE: '/admin/remarketing/activity-queue',

} as const;

// ── Pagination ───────────────────────────────────────────────────────

/** Default number of items per page for paginated lists. */
export const DEFAULT_PAGE_SIZE = 50;

/** Default number of items per page for marketplace listing grids. */
export const MARKETPLACE_PAGE_SIZE = 12;

// ── Query / cache timing (milliseconds) ──────────────────────────────

export const CACHE_TIMES = {
  /** Default stale time for react-query (5 minutes). */
  STALE_DEFAULT: 5 * 60 * 1000,
  /** Default garbage-collection time (10 minutes). */
  GC_DEFAULT: 10 * 60 * 1000,
  /** Short stale time for frequently changing data (30 seconds). */
  STALE_SHORT: 30 * 1000,
  /** Long stale time for rarely changing data (10 minutes). */
  STALE_LONG: 10 * 60 * 1000,
  /** Real-time polling interval (10 seconds). */
  REALTIME_POLL: 10 * 1000,
} as const;

// ── Approval & connection statuses ───────────────────────────────────

export const APPROVAL_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export const CONNECTION_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ON_HOLD: 'on_hold',
} as const;

export const LISTING_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

// ── Buyer types (display labels) ─────────────────────────────────────
// Supports both marketplace profile (camelCase) and remarketing DB (snake_case) values

export const BUYER_TYPE_LABELS: Record<string, string> = {
  // Marketplace profile values (camelCase - used in signup/profile forms)
  corporate: 'Corporate Development',
  privateEquity: 'Private Equity',
  familyOffice: 'Family Office',
  searchFund: 'Search Fund',
  individual: 'Individual',
  independentSponsor: 'Independent Sponsor',
  advisor: 'Advisor / Banker',
  businessOwner: 'Business Owner',
  // Canonical DB values (snake_case - used in remarketing_buyers)
  private_equity: 'Private Equity Firm',
  family_office: 'Family Office',
  search_fund: 'Search Fund',
  independent_sponsor: 'Independent Sponsor',
  individual_buyer: 'Individual / Wealth Buyer',
} as const;

// ── Error handling ───────────────────────────────────────────────────

export const CIRCUIT_BREAKER = {
  /** Number of consecutive failures before opening the circuit. */
  THRESHOLD: 5,
  /** Milliseconds to wait before retrying after circuit opens. */
  TIMEOUT: 30_000,
  /** Maximum retry attempts for failed operations. */
  MAX_RETRIES: 3,
} as const;

// ── Polling intervals (milliseconds) ─────────────────────────────────

export const POLL_INTERVALS = {
  /** Session heartbeat ping (30 s). */
  HEARTBEAT: 30_000,
  /** Enrichment queue status poll (5 s). */
  ENRICHMENT_QUEUE: 5_000,
  /** Enrichment batch processing cycle (30 s). */
  ENRICHMENT_PROCESS: 30_000,
  /** Data quality metrics refresh (5 min). */
  DATA_QUALITY: 300_000,
  /** Pending-approval page status check (30 s). */
  APPROVAL_STATUS: 30_000,
  /** Mobile performance measurement (30 s). */
  PERFORMANCE: 30_000,
} as const;

// ── Batch / chunk sizes ──────────────────────────────────────────────

export const BATCH_SIZES = {
  /** Supabase query batch to avoid row limit (1 000). */
  QUERY_LARGE: 1_000,
  /** Upsert / mutation chunk size (500). */
  MUTATION_CHUNK: 500,
  /** Enrichment queue batch (200). */
  ENRICHMENT: 200,
  /** Default display page size (50). */
  PAGE: 50,
} as const;

// ── Query limits ─────────────────────────────────────────────────────

export const QUERY_LIMITS = {
  /** Contact history items (100). */
  CONTACT_HISTORY: 100,
  /** Connection messages ceiling (2 000). */
  CONNECTION_MESSAGES: 2_000,
  /** Analytics query ceiling (1 000). */
  ANALYTICS: 1_000,
} as const;

// ── File upload limits ───────────────────────────────────────────────

export const FILE_LIMITS = {
  /** CSV import max file size (5 MB). */
  CSV_MAX_BYTES: 5 * 1024 * 1024,
  /** CSV import max row count. */
  CSV_MAX_ROWS: 5_000,
  /** Bulk deal import max file size (10 MB). */
  DEAL_IMPORT_MAX_MB: 10,
} as const;

// ── AI / retry settings ──────────────────────────────────────────────

export const AI_SETTINGS = {
  /** Client-side request timeout (2 min). */
  CLIENT_TIMEOUT_MS: 120_000,
  /** Max client-side retries. */
  MAX_CLIENT_RETRIES: 3,
  /** Max batch retries for AI research. */
  MAX_BATCH_RETRIES: 5,
  /** Parse error threshold before abort. */
  PARSE_ERROR_THRESHOLD: 5,
  /** Rate-limit back-off cap (30 s). */
  RATE_LIMIT_BACKOFF_CAP_MS: 30_000,
  /** Base backoff multiplier (5 s). */
  BACKOFF_BASE_MS: 5_000,
  /** Max enrichment polling duration (4 h). */
  MAX_POLLING_DURATION_MS: 4 * 60 * 60 * 1_000,
} as const;

// ── Platform identifiers ─────────────────────────────────────────────

/** SourceCo platform admin user ID (for admin notifications and messaging). */
export const OZ_ADMIN_ID = 'ea1f0064-52ef-43fb-bec4-22391b720328';

// ── Miscellaneous ────────────────────────────────────────────────────

/** Maximum error queue size in the ErrorManager. */
export const MAX_ERROR_QUEUE_SIZE = 100;

/** Toast display duration in milliseconds (non-critical). */
export const TOAST_DURATION_MS = 5_000;
