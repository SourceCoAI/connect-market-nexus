

## Problem

Three issues need fixing:

1. **Website analytics (Datafast) is buried**: The comprehensive website analytics dashboard (visitors, geography map, sources, conversion funnel, tech stack) is hidden inside Dashboard > Marketplace > Analytics tab -- 2 clicks deep. Meanwhile `/admin/analytics` shows Remarketing scoring analytics, which is confusing.

2. **No clear separation** in the sidebar between **user-facing** features (Marketplace) and **internal/operational** features (Remarketing, Lists, Admin tools).

3. **Analytics section in sidebar** has only 2 items and doesn't distinguish between website analytics and remarketing analytics.

## Solution

### 1. Restructure the Analytics sidebar section into clear sub-items

Expand the Analytics section to clearly label what each analytics page covers:

- **Website Analytics** (`/admin/analytics/website`) -- the Datafast dashboard (visitors, globe map, sources, geography, pages, tech, conversion)
- **Remarketing Analytics** (`/admin/analytics/remarketing`) -- the existing ReMarketingAnalytics (scoring, funnels, calibration)
- **Transcript Analytics** (`/admin/analytics/transcripts`) -- already exists

The current `/admin/analytics` route will redirect to `/admin/analytics/website` so the default landing is the website dashboard.

### 2. Add visual section dividers in the sidebar

Group sidebar sections with subtle labeled dividers:

```text
Dashboard
Messages
Daily Tasks
────────── USER-FACING ──────────
  Marketplace
────────── OPERATIONS ───────────
  Deals
  Buyers
  Remarketing
  Lists
────────── INSIGHTS ─────────────
  Analytics
────────── SYSTEM ───────────────
  Admin
```

This uses small uppercase text dividers between logical groups -- no structural changes to the nav sections, just visual separators rendered between them.

### 3. Create a dedicated Website Analytics page

A new route component at `/admin/analytics/website` that renders the existing `DatafastAnalyticsDashboard` component (currently only accessible via the Dashboard Marketplace tab). This is a thin wrapper -- no new logic needed.

## Files to Change

| File | Change |
|------|--------|
| `src/components/admin/UnifiedAdminSidebar.tsx` | (1) Add visual group dividers ("User-Facing", "Operations", "Insights", "System") rendered between section groups. (2) Update Analytics section items to: Website Analytics, Remarketing Analytics, Transcript Analytics with new paths. |
| `src/routes/admin-routes.tsx` | Add route for `/admin/analytics/website` rendering the Datafast dashboard. Change `/admin/analytics` to either render a new landing or redirect to `/admin/analytics/website`. Add `/admin/analytics/remarketing` route for the existing ReMarketingAnalytics. |
| `src/App.tsx` | Mirror the same route changes (website has duplicate route definitions). |
| `src/pages/admin/analytics/WebsiteAnalytics.tsx` | **New file** -- thin wrapper that renders `DatafastAnalyticsDashboard` with a page header. |

## What stays the same

- The Dashboard page (`AdminDashboard.tsx`) keeps its Marketplace > Analytics tab as-is (no deletion)
- All existing components (Datafast, ReMarketing, Transcript) remain untouched
- The globe map, interactive geography, sources, KPI strip -- all preserved and now directly accessible from the sidebar
