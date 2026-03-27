

# Mega Audit Round 4: Fresh Angles — UX Quality, UI Polish, Data Integrity

## What's Been Fully Tested (Phases 1-46)
Security gates, RPC resilience, document signing, messaging, deals, public pages, realtime, analytics, mobile responsive, data isolation, popup handling, share email privacy, and BlurredFinancialTeaser gate bypass.

## New Findings from Fresh Investigation

### Phase 47: MatchedDealsSection "Complete Profile" Links to Wrong Page
**Severity: Medium — UX bug**

`MatchedDealsSection.tsx` line 101 links incomplete-profile users to `/welcome` — which is the **pre-auth landing page** that redirects authenticated users away (Welcome.tsx line 17-21: `if (authChecked && user) navigate(redirectPath)`). The user gets bounced back to `/` without completing anything.

Should link to `/profile` instead.

### Phase 48: Notification Preferences Are localStorage-Only (Not Persisted to DB)
**Severity: Medium — Feature gap**

Profile > Notifications tab stores preferences in `localStorage` only (line 76 of `Profile/index.tsx`). The disclaimer says "may not affect all email notifications" — but in reality these preferences affect **nothing** server-side. They are purely cosmetic toggles that reset on browser change/clear.

**Fix options:**
- A) Persist to a `notification_preferences` column on `profiles` table
- B) Add a clear disclaimer that these are display-only placeholders (honest UX)
- C) Remove the tab entirely until backend support exists

### Phase 49: SimilarListingsCarousel Exposes Financial Data Without NDA Check
**Severity: Low-Medium**

`SimilarListingsCarousel.tsx` shows Revenue, EBITDA, EBITDA margin %, and revenue multiple for every similar listing — regardless of whether the user has signed an NDA or has a connection. The main listing page blurs financials behind `BlurredFinancialTeaser`, but similar listings at the bottom show everything openly.

This may be intentional (teaser data to drive engagement), but creates inconsistency with the financial gating on the primary listing.

### Phase 50: Saved Listings Annotations Are localStorage-Only
**Severity: Low**

`SavedListings.tsx` stores per-listing notes in `localStorage` (line 21-33). Notes are lost on browser change, device switch, or cache clear. If annotations are a real feature, they should persist to DB.

### Phase 51: "Results per page" Resets Search/Filter State Inconsistently
**Severity: Low — UX**

On the Marketplace page, changing "Results per page" (Select on line 297) calls `pagination.setPerPage()` which may or may not reset to page 1. On SavedListings, the same action explicitly resets to page 1 (line 178). Verify consistency.

### Phase 52: DealDocumentsCard — "View Documents" Button Never Wired
**Severity: Low — UX gap**

`DealDocumentsCard.tsx` accepts `onViewDocuments` prop (line 32), but in `MyRequests.tsx` the component is rendered without passing this prop (line 406-412). So even when documents are unlocked, the "View Documents" button never appears. The user has no way to navigate to the data room from the My Deals page.

### Phase 53: PostRejectionPanel Fetches All 50 Listings Unnecessarily
**Severity: Low — Performance**

`PostRejectionPanel.tsx` line 16-26 fetches 50 listings via `useSimpleListings` just to find 3 similar ones client-side. This could be a targeted query instead. Not a bug but wasteful — and the query runs for every rejected deal.

### Phase 54: Onboarding Popup — Double Supabase Call Pattern
**Severity: Low**

`OnboardingPopup.tsx` first SELECT's the profile, then UPDATE's it (lines 24-58). This could be a single UPDATE with a WHERE clause. Also, if the popup fails to update, the user sees it again on every visit — no graceful fallback.

### Phase 55: DealMessagesTab — No "Scroll to Bottom" on New Messages
**Severity: Low — UX**

`DealMessagesTab.tsx` auto-scrolls on mount but if a new message arrives via realtime subscription while the user is scrolled up, there's no indicator or scroll-to-bottom button. Standard chat UX expectation.

### Phase 56: Marketplace Welcome Toast Fires Only Once Per Browser (Not Per Account)
**Severity: Low**

`Marketplace.tsx` line 93 uses `localStorage.getItem('sourceco_shown_welcome')` — this is browser-scoped, not user-scoped. If a user logs out and a new user logs in on the same browser, the second user never sees the welcome message. Should key by user ID.

### Phase 57: DealPipelineCard — No Visual Distinction for `on_hold` Status
**Severity: Low — UX**

Verify that `DealPipelineCard.tsx` renders a visually distinct state for `on_hold` status in the My Deals sidebar. Previous phases confirmed `DealActionCard` handles it, but the sidebar card list may not show a differentiated badge/color.

---

## Summary

| Phase | Area | Severity | Type |
|-------|------|----------|------|
| 47 | MatchedDealsSection links to wrong page | **Medium** | UX bug |
| 48 | Notification preferences not persisted | **Medium** | Feature gap |
| 49 | Similar listings expose financials without NDA | Low-Medium | Consistency |
| 50 | Saved listing annotations localStorage-only | Low | Data persistence |
| 51 | Per-page change pagination reset inconsistency | Low | UX |
| 52 | DealDocumentsCard "View Documents" never wired | Low | UX gap |
| 53 | PostRejectionPanel fetches 50 listings | Low | Performance |
| 54 | Onboarding popup double query | Low | Efficiency |
| 55 | No scroll-to-bottom in deal messages | Low | UX |
| 56 | Welcome toast not user-scoped | Low | UX bug |
| 57 | DealPipelineCard on_hold visual distinction | Low | UX |

## Proposed Execution Order

| Priority | Phases | Rationale |
|----------|--------|-----------|
| High | 47, 52 | Broken navigation + missing feature wiring |
| Medium | 48, 56 | localStorage bugs affecting multi-user scenarios |
| Lower | 49, 50, 51, 53, 54, 55, 57 | Polish, performance, UX enhancements |

## Implementation Plan

**Phase 47** — Change `to="/welcome"` to `to="/profile"` in `MatchedDealsSection.tsx` line 101.

**Phase 48** — Add disclaimer text to notifications tab clarifying preferences are browser-local only, until DB persistence is built.

**Phase 52** — Wire `onViewDocuments` prop in `MyRequests.tsx` to navigate to the listing detail data room tab or switch inner tab.

**Phase 56** — Change welcome toast localStorage key to include `user.id`: `sourceco_shown_welcome_${user.id}`.

**Phases 49-51, 53-55, 57** — Audit and fix as needed (mostly minor tweaks).

