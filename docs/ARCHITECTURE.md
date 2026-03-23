# Architecture Overview

Connect Market Nexus is a B2B M&A deal marketplace platform built on React + TypeScript for the frontend and Supabase for the backend. This document describes the high-level system architecture, frontend organization, backend design, state management, routing, and key data flows.

---

## Table of Contents

- [High-Level System Architecture](#high-level-system-architecture)
- [Frontend Architecture](#frontend-architecture)
- [Supabase Backend](#supabase-backend)
- [State Management](#state-management)
- [Routing Structure](#routing-structure)
- [Key Data Flows](#key-data-flows)
- [Performance Optimizations](#performance-optimizations)

---

## High-Level System Architecture

```
                          +-------------------+
                          |   Browser (SPA)   |
                          |  React + Vite     |
                          +--------+----------+
                                   |
                    +--------------+--------------+
                    |                             |
           +-------v--------+          +---------v----------+
           |  Supabase Auth |          | Supabase PostgREST |
           |  (JWT + MFA)   |          |  (RLS-enforced)    |
           +----------------+          +--------------------+
                                              |
                                    +---------v----------+
                                    |  PostgreSQL 15     |
                                    |  (70+ tables, RLS) |
                                    +--------------------+
                                              |
                    +-------------------------+-------------------------+
                    |                         |                         |
           +--------v--------+     +---------v--------+     +---------v--------+
           | Supabase Storage|     | Edge Functions    |     | Supabase Realtime|
           | (Data Room docs)|     | (113+ Deno fns)   |     | (Live updates)   |
           +-----------------+     +--------+----------+     +------------------+
                                            |
                              +-------------+-------------+
                              |             |             |
                       +------v---+  +------v---+  +-----v------+
                       | Gemini   |  | Brevo    |  | Firecrawl  |
                       | AI API   |  | Email    |  | Scraping   |
                       +----------+  +----------+  +------------+
```

### Data flow summary

1. The **browser SPA** communicates with Supabase using the JavaScript client library.
2. **Supabase Auth** handles user authentication (email/password, JWT tokens, optional TOTP MFA for admins).
3. **PostgREST** exposes the PostgreSQL database as a REST API. All queries pass through Row Level Security (RLS) policies.
4. **Edge Functions** (Deno-based) handle operations that require server-side logic: AI calls, email delivery, document generation, web scraping, and enrichment pipelines.
5. **Supabase Storage** stores data room documents, with signed URL access controlled by edge functions.
6. **Supabase Realtime** powers live updates for admin dashboard counters, connection request status changes, and notification badges.

---

## Frontend Architecture

### Directory organization

```
src/
├── pages/           # Route-level components (one file per route)
├── components/      # Reusable UI components (organized by feature domain)
├── hooks/           # Custom React hooks (data fetching, business logic)
├── lib/             # Pure utility functions and business logic
├── context/         # React Context providers (global state)
├── contexts/        # Additional context providers
├── types/           # TypeScript type definitions
├── integrations/    # Third-party client configuration (Supabase)
├── config/          # Feature flags and runtime configuration
├── constants/       # Static application constants
├── features/        # Feature module entry points
└── utils/           # Lightweight utility helpers
```

### Pages (`src/pages/`)

Each file represents a route-level component. Pages are lazy-loaded using `React.lazy()` with a retry wrapper (`lazyWithRetry`) that automatically reloads on stale chunk failures.

**Public pages**: Welcome, Login, Signup, ForgotPassword, ResetPassword, OwnerInquiry, ReferralTracker, DataRoomPortal, TrackedDocumentViewer.

**Buyer-facing pages** (require authentication + approved status): Marketplace, ListingDetail, Profile, MyRequests (deals), BuyerMessages, SavedListings.

**Admin pages** (require admin role): AdminDashboard, Deals, Buyers, Pipeline, Analytics, Settings, and many more. Admin pages are rendered inside `AdminLayout` which provides the unified sidebar navigation.

**ReMarketing pages**: Dashboard, Deals, Buyers, Universes, CapTarget, GP Partners, Valuation Leads, Referral Partners, Activity Queue. These are rendered inside `ReMarketingLayout` within the admin layout.

**M&A Intelligence pages**: Dashboard, Trackers, Buyers. These use a separate `MAIntelligenceLayout`.

### Components (`src/components/`)

Components are organized by feature domain:

| Directory | Purpose |
|---|---|
| `ui/` | Base shadcn/ui components (Button, Dialog, Input, etc.) |
| `admin/` | Admin dashboard components (sidebar, data room, MFA) |
| `listing/` | Deal cards, grids, and list views |
| `listing-detail/` | Sections of the deal detail page |
| `marketplace/` | Buyer marketplace (data room view, deal browsing) |
| `remarketing/` | ReMarketing system (buyer tables, deal matching) |
| `ma-intelligence/` | M&A Intelligence (tracker views, buyer research) |
| `filters/` | Filter panel and filter chip components |
| `navbar/` | Top navigation bar |
| `onboarding/` | Multi-step buyer onboarding flow |
| `deals/` | Deal management components |
| `buyers/` | Buyer profile components |
| `deal-alerts/` | Deal alert configuration and display |
| `pandadoc/` | E-signature integration (PandaDoc) |
| `shared/` | Cross-feature shared components |
| `security/` | Security-related components (MFA) |
| `settings/` | Settings page components |

### Hooks (`src/hooks/`)

Custom hooks encapsulate data fetching, business logic, and side effects. They follow two naming conventions (both are used in the codebase):

- `use-kebab-case.ts` (e.g., `use-filter-engine.ts`, `use-nuclear-auth.ts`)
- `useCamelCase.ts` (e.g., `useUnifiedAnalytics.ts`, `useListingHealth.ts`)

Key hooks by category:

| Category | Examples |
|---|---|
| Authentication | `use-nuclear-auth`, `use-mfa` |
| Data fetching | `use-simple-listings`, `use-connection-messages`, `use-user-notifications` |
| Analytics | `useUnifiedAnalytics`, `useEnhancedRealTimeAnalytics`, `useTrafficAnalytics` |
| Enrichment | `useBuyerEnrichment`, `useDealEnrichment`, `useBuyerEnrichmentQueue` |
| Scoring | `useAlignmentScoring`, `use-listing-intelligence` |
| UI | `use-filter-engine`, `use-mobile`, `use-mobile-gestures` |
| Realtime | `use-realtime-listings`, `use-realtime-connections`, `use-realtime-admin` |

### Lib (`src/lib/`)

Pure utility functions and business logic modules. These have no React dependencies and are the primary target for unit testing.

Key modules:

| Module | Purpose |
|---|---|
| `auth-helpers.ts` | Authentication utility functions |
| `deal-scoring-v5.ts` | Multi-dimensional buyer-deal scoring algorithm |
| `financial-parser.ts` | Parse financial strings ("$1.5M", "2-3x EBITDA") |
| `currency-utils.ts` | Currency formatting and conversion |
| `criteriaSchema.ts` | Zod schema for buyer investment criteria |
| `criteriaValidation.ts` | Criteria validation logic |
| `error-handler.ts` | Centralized error reporting |
| `error-logger.ts` | Error logging to database |
| `query-keys.ts` | React Query key factory functions |
| `storage-utils.ts` | Supabase Storage helpers |
| `password-security.ts` | Password strength validation |
| `performance-monitor.ts` | Client-side performance tracking |
| `ga4.ts` | Google Analytics 4 integration |

### Context Providers

The application wraps the component tree in a nested provider hierarchy (defined in `App.tsx`):

```
QueryClientProvider          # TanStack React Query cache
  TabVisibilityProvider      # Track tab focus/blur
    NavigationStateProvider  # Track navigation state
      AuthProvider           # User authentication state
        SessionTrackingProvider  # Session analytics
          AnalyticsProvider      # Page analytics
            SimpleToastProvider  # Toast notifications
              <App Routes />
```

---

## Supabase Backend

### Auth

- Email/password authentication via Supabase Auth.
- JWT tokens with 1-hour expiry and automatic refresh.
- Optional TOTP-based MFA enrollment for admin users.
- `AuthProvider` in the frontend subscribes to auth state changes and maintains the `user` object (fetched from the `profiles` table).

### Database (PostgreSQL 15)

- **70+ tables** across 590+ migrations.
- All tables have Row Level Security (RLS) enabled.
- Key patterns:
  - `profiles` extends `auth.users` with application-specific fields.
  - `is_admin(user_id)` function is the canonical admin check, used across RLS policies and edge functions.
  - Soft deletes via `deleted_at` timestamp columns.
  - Audit logging via trigger functions.
  - `handle_new_user()` trigger auto-creates a profile row when a user signs up.

See [DATABASE.md](DATABASE.md) for the full schema reference.

### RLS Policies

Common RLS patterns used across tables:

| Pattern | Example |
|---|---|
| Users see own data | `auth.uid() = user_id` |
| Admins see everything | `public.is_admin(auth.uid())` |
| Buyers see active, non-internal data | `status = 'active' AND (is_internal_deal IS NULL OR is_internal_deal = false)` |
| Service role bypasses RLS | Used by edge functions with service role key |

### Edge Functions

113+ Deno-based TypeScript functions in `supabase/functions/`. They share 24 common modules in `_shared/`:

| Shared Module | Purpose |
|---|---|
| `auth.ts` | `requireAuth()`, `requireAdmin()` auth guards |
| `cors.ts` | CORS header management |
| `security.ts` | Rate limiting, SSRF protection, input sanitization |
| `validation.ts` | Anti-hallucination guards, placeholder detection |
| `ai-providers.ts` | Gemini 2.0 Flash integration with retry logic |
| `brevo-sender.ts` | Transactional email via Brevo API |
| `rate-limiter.ts` | Provider-level concurrency coordination |
| `provenance.ts` | Data ownership rules and source priorities |
| `buyer-extraction.ts` | AI prompts for buyer data extraction |
| `deal-extraction.ts` | AI prompts for deal data extraction |
| `cost-tracker.ts` | AI operation cost logging |
| `enrichment-events.ts` | Enrichment pipeline status tracking |
| `geography.ts` | State normalization, geographic utilities |
| `geography-utils.ts` | Proximity scoring, state-to-tier mappings |
| `edge-timeout.ts` | Deno timeout signal helpers |

JWT verification is configured per-function in `supabase/config.toml`. Functions that accept service-to-service calls (e.g., scoring queue processors) have `verify_jwt = false` and rely on internal auth checks.

### Storage

Supabase Storage is used for data room documents. File size limit is 50 MiB. Access is controlled through edge functions that generate signed download URLs after verifying access permissions.

---

## State Management

### Server State: TanStack React Query

All data fetched from Supabase is managed through React Query with these global defaults:

```typescript
{
  queries: {
    refetchOnWindowFocus: true,
    staleTime: 5 * 60 * 1000,      // 5 minutes
    gcTime: 10 * 60 * 1000,        // 10 minutes garbage collection
    retry: 3,
    refetchOnReconnect: true,
  },
  mutations: { retry: 1 },
}
```

Query key factories in `src/lib/query-keys.ts` ensure consistent cache key management across the application.

### Client State: React Context

Global client-side state is managed through React Context providers:

| Context | Purpose |
|---|---|
| `AuthContext` | Current user, login/logout/signup functions, role checks (`isAdmin`, `isBuyer`) |
| `AnalyticsContext` | Page view and event tracking |
| `NavigationStateContext` | Navigation transitions and scroll restoration |
| `TabVisibilityContext` | Tab focus/blur state for pausing/resuming queries |
| `SessionContext` | Current session ID and metadata |
| `SearchSessionContext` | Search query persistence across navigation |
| `AnalyticsFiltersContext` | Admin analytics filter state |

### Local State

Component-level state uses `useState` and `useReducer`. Form state is managed by React Hook Form with Zod schema validation.

---

## Routing Structure

The application uses React Router DOM v6 with nested layouts. All routes are defined in `src/App.tsx`.

### Public Routes (no auth required)

| Path | Page | Description |
|---|---|---|
| `/welcome` | Welcome | Landing page |
| `/login` | Login | Authentication |
| `/signup` | Signup | Multi-step registration |
| `/signup-success` | SignupSuccess | Post-registration confirmation |
| `/forgot-password` | ForgotPassword | Password reset request |
| `/reset-password` | ResetPassword | Password reset form |
| `/pending-approval` | PendingApproval | Waiting for admin approval |
| `/sell` | OwnerInquiry | Seller inquiry form |
| `/sell/success` | OwnerInquirySuccess | Seller inquiry confirmation |
| `/auth/callback` | AuthCallback | OAuth/email verification callback |
| `/unauthorized` | Unauthorized | Access denied |
| `/referrals/:shareToken` | ReferralTrackerPage | Public referral tracking |
| `/dataroom/:accessToken` | DataRoomPortal | External data room access |
| `/view/:linkToken` | TrackedDocumentViewer | Tracked document viewing |

### Buyer-Facing Routes (authenticated + approved)

Wrapped in `<ProtectedRoute requireApproved={true}>` with `MainLayout`.

| Path | Page | Description |
|---|---|---|
| `/` | Marketplace | Deal browsing with filters |
| `/listing/:id` | ListingDetail | Individual deal details |
| `/profile` | Profile | Buyer profile management |
| `/my-deals` | MyRequests | User's connection requests |
| `/messages` | BuyerMessages | Messaging with admin |
| `/saved-listings` | SavedListings | Bookmarked deals |

### Admin Routes (admin role required)

Wrapped in `<ProtectedRoute requireAdmin={true}>` with `AdminLayout`.

| Path | Page | Description |
|---|---|---|
| `/admin` | AdminDashboard | Admin home |
| `/admin/deals` | ReMarketingDeals | All deals (unified view) |
| `/admin/deals/:dealId` | ReMarketingDealDetail | Deal detail |
| `/admin/deals/pipeline` | AdminPipeline | Deal pipeline board |
| `/admin/buyers` | ReMarketingBuyers | All buyers |
| `/admin/buyers/:id` | ReMarketingBuyerDetail | Buyer detail |
| `/admin/buyers/universes` | ReMarketingUniverses | Buyer universes |
| `/admin/marketplace/requests` | AdminRequests | Connection requests |
| `/admin/marketplace/users` | MarketplaceUsersPage | Marketplace users |
| `/admin/marketplace/messages` | MessageCenter | Admin message center |
| `/admin/analytics` | ReMarketingAnalytics | Analytics dashboard |
| `/admin/approvals` | GlobalApprovalsPage | Pending approvals |
| `/admin/settings/*` | Various | Team, notifications, security, etc. |

### ReMarketing Routes (nested under admin)

Wrapped in `ReMarketingLayout` for the activity status bar.

| Path | Page |
|---|---|
| `/admin/remarketing` | ReMarketingDashboard |
| `/admin/remarketing/activity-queue` | Activity queue |
| `/admin/remarketing/leads/captarget` | CapTarget deals |
| `/admin/remarketing/leads/gp-partners` | GP Partner deals |
| `/admin/remarketing/leads/valuation` | Valuation leads |
| `/admin/remarketing/leads/referrals` | Referral partners |
| `/admin/remarketing/matching/:listingId` | Deal-buyer matching |
| `/admin/remarketing/introductions/:listingId` | Introduction management |

### M&A Intelligence Routes (separate layout)

| Path | Page |
|---|---|
| `/admin/ma-intelligence` | MA Dashboard |
| `/admin/ma-intelligence/trackers` | Tracker list |
| `/admin/ma-intelligence/trackers/:id` | Tracker detail |
| `/admin/ma-intelligence/buyers` | All buyers |
| `/admin/ma-intelligence/buyers/:id` | Buyer detail |

---

## Key Data Flows

### 1. Buyer Registration and Approval

```
User fills Signup form
  -> Supabase Auth creates auth.users entry
  -> handle_new_user() trigger creates profiles row
  -> Verification email sent via edge function
  -> User verifies email
  -> Admin sees pending user in dashboard
  -> Admin approves -> profile.approval_status = 'approved'
  -> Approval email sent via send-approval-email edge function
  -> User can now access marketplace
```

### 2. Connection Request (Buyer to Deal)

```
Buyer clicks "Express Interest" on a listing
  -> connection_requests INSERT (status: 'pending')
  -> Admin notification created
  -> Admin reviews and approves/rejects
  -> On approval:
    - deal auto-created via auto_create_deal_from_connection_request()
    - Buyer notification sent
    - NDA/fee agreement workflow begins
```

### 3. AI Deal Enrichment

```
New listing created or enrichment triggered
  -> queue_listing_enrichment() adds to enrichment_queue
  -> process-enrichment-queue edge function claims batch
  -> For each deal:
    - firecrawl-scrape fetches company website
    - enrich-deal calls Gemini AI to extract/enhance data
    - Results written back to listings table
    - enrichment_events logged
```

### 4. Buyer-Deal Scoring

```
Admin triggers scoring for a listing
  -> score-buyer-deal edge function called for each buyer
  -> Calculates multi-dimensional score:
    - Geography alignment (state/region proximity)
    - Size alignment (revenue/EBITDA range overlap)
    - Service/industry alignment
  -> Composite score (0-100) and tier (A/B/C/D/F) saved to remarketing_scores
  -> Admin views ranked buyer list for the deal
```

### 5. Data Room Access

```
Admin uploads document to data room
  -> data-room-upload edge function stores in Supabase Storage
  -> data_room_documents row created
  -> Admin grants access to buyer (data-room-access function)
  -> data_room_access row with toggle flags (teaser/memo/data_room)
  -> Buyer requests document download
  -> data-room-download verifies access + generates signed URL
  -> data_room_audit_log records every view/download
```

---

## Performance Optimizations

### Code Splitting

All pages are lazy-loaded using `React.lazy()` with a retry wrapper for stale chunk recovery. The Vite config manually splits large vendor libraries:

```typescript
manualChunks: {
  recharts: ['recharts'],
  tiptap: ['@tiptap/react', '@tiptap/starter-kit'],
  mapbox: ['mapbox-gl'],
}
```

### Production Build

- `console.log` calls are stripped in production builds (using `esbuild.pure`).
- `debugger` statements are dropped.
- `console.error` and `console.warn` are preserved for error reporting.

### Query Optimization

- Stale time of 5 minutes reduces unnecessary refetches.
- `refetchOnWindowFocus: true` keeps data current when users return to the tab.
- Tab visibility context pauses background queries when the tab is hidden.
- React Query garbage collection after 10 minutes frees memory.

### Database Performance

- GIN indexes on `TEXT[]` array columns for category filtering.
- Composite indexes on frequently queried column pairs.
- Materialized views for dashboard aggregate metrics (refreshed via cron).
- Soft deletes avoid expensive cascading hard deletes.
