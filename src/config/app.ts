/**
 * Centralized application configuration.
 *
 * Single source of truth for app-wide constants.
 * Avoid scattering magic numbers and strings across components.
 *
 * Usage:
 *   import { APP_CONFIG } from '@/config/app';
 *   console.log(APP_CONFIG.name); // "Connect Market Nexus"
 */

const EMAIL_DOMAIN = import.meta.env.VITE_EMAIL_DOMAIN || 'sourcecodeals.com';

export const APP_CONFIG = {
  /** Display name shown in headers, emails, etc. */
  name: 'SourceCo Marketplace',

  /** Semantic version — keep in sync with package.json */
  version: '0.0.0',

  /** Support / contact email */
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL || `support@${EMAIL_DOMAIN}`,

  /** Default admin email (used for mailto links, reply-to, etc.) */
  adminEmail: import.meta.env.VITE_ADMIN_EMAIL || `adam.haile@${EMAIL_DOMAIN}`,

  /** No-reply sender email for transactional emails */
  noreplyEmail: `noreply@${EMAIL_DOMAIN}`,

  /** Deals inbox email */
  dealsEmail: `deals@${EMAIL_DOMAIN}`,
} as const;

// ─── Feature Flags ───────────────────────────────────────────────────────────

export const FEATURE_FLAGS = {
  /** Enable the ReMarketing module */
  remarketing: true,

  /** Enable real-time analytics dashboard */
  realTimeAnalytics: true,

  /** Show buyer enrichment features */
  buyerEnrichment: true,

  /** Enable data room portal */
  dataRoom: true,

  /** Enable deal alerts for buyers */
  dealAlerts: true,

  /** Enable MFA enrollment prompt */
  mfaPrompt: true,
} as const;

// ─── Pagination ──────────────────────────────────────────────────────────────

export const PAGINATION = {
  /** Default items per page for tables */
  defaultPageSize: 25,

  /** Default items per page for marketplace grid */
  marketplacePageSize: 12,

  /** Default items per page for admin lists */
  adminPageSize: 50,

  /** Maximum items per page (safety limit) */
  maxPageSize: 100,

  /** Available page size options */
  pageSizeOptions: [10, 25, 50, 100] as const,
} as const;

// ─── Date Formats ────────────────────────────────────────────────────────────

export const DATE_FORMATS = {
  /** Display format: Jan 15, 2025 */
  display: 'MMM d, yyyy',

  /** Display with time: Jan 15, 2025 3:30 PM */
  displayWithTime: 'MMM d, yyyy h:mm a',

  /** Short format: 01/15/25 */
  short: 'MM/dd/yy',

  /** ISO format for API calls */
  iso: "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",

  /** Date only ISO: 2025-01-15 */
  isoDate: 'yyyy-MM-dd',

  /** Time only: 3:30 PM */
  time: 'h:mm a',

  /** Relative time thresholds (in ms) */
  relativeThreshold: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;

// ─── Currency / Numbers ──────────────────────────────────────────────────────

export const CURRENCY = {
  /** Default currency code */
  code: 'USD',

  /** Currency symbol */
  symbol: '$',

  /** Locale for number formatting */
  locale: 'en-US',

  /** Compact notation thresholds */
  compactThresholds: {
    billion: 1_000_000_000,
    million: 1_000_000,
    thousand: 1_000,
  },
} as const;

// ─── Stale Times / Cache ────────────────────────────────────────────────────

export const CACHE = {
  /** Default stale time for React Query (5 min) */
  defaultStaleTime: 5 * 60 * 1000,

  /** Stale time for rarely-changing data (30 min) */
  longStaleTime: 30 * 60 * 1000,

  /** Stale time for frequently-changing data (30 sec) */
  shortStaleTime: 30 * 1000,

  /** GC time for React Query (10 min) */
  defaultGcTime: 10 * 60 * 1000,
} as const;

// ─── Limits ──────────────────────────────────────────────────────────────────

export const LIMITS = {
  /** Max file upload size in bytes (10 MB) */
  maxFileUploadSize: 10 * 1024 * 1024,

  /** Allowed image types for upload */
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const,

  /** Max tags per listing */
  maxTagsPerListing: 10,

  /** Max length for text fields */
  maxDescriptionLength: 5000,
  maxBioLength: 1000,
  maxNotesLength: 2000,

  /** Toast auto-dismiss time (ms) */
  toastDuration: 5000,
} as const;
