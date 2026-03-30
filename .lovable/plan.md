

# Marketplace Testing Strategy: Remaining Untested Areas

## What We've Already Tested (Phases 67-100)

- Listing publishing pipeline (creation, validation, publish/unpublish)
- Connection request lifecycle (submit, approve, reject, on_hold, undo, bulk)
- Notification system (admin bell, buyer bell, emails, realtime)
- Document signing gates (PandaDoc NDA/fee flow)
- Rejection/approval copy consistency

## Untested Areas — Organized by Priority

---

### AREA 1: Marketplace Search, Filters & Pagination (HIGH)

The `FilterPanel` and `Marketplace.tsx` page have significant untested surface area:

- **Search**: Full-text search via `fts` column — does it handle special characters, empty queries, partial matches, accented names?
- **Category/Location filters**: Use `STANDARDIZED_CATEGORIES` and `STANDARDIZED_LOCATIONS` — are these in sync with what listings actually have? Orphaned categories showing zero results?
- **Revenue/EBITDA range filters**: Do min/max boundaries work correctly (edge: exactly $1M, exactly $50M)?
- **Filter persistence**: Filters reset on navigation? URL params preserved on back button?
- **Pagination**: Edge cases — page beyond total, page 0, perPage=0, single result, empty results
- **Sort order**: Currently hardcoded `created_at desc` — no user-facing sort option exists. Should there be one?
- **Mobile filter sheet**: Does the Sheet drawer open/close properly? Do applied filters persist when sheet closes?

### AREA 2: Matched Deals / Investment Fit Scoring (HIGH)

`MatchedDealsSection` and `InvestmentFitScore` are buyer-facing AI-like features:

- **Match scoring accuracy**: `computeMatchScore` uses category (3pts), location (2pts), revenue fit (2pts), EBITDA fit (2pts), deal intent (1pt), recency (1pt) — are weights appropriate?
- **Buyer criteria extraction**: `extractBuyerCriteria` pulls from user profile — what happens with incomplete profiles? Users with zero criteria see nothing (good) but is threshold (`criteriaCount < 2`) correct?
- **MatchedDealsSection**: Fetches ALL 50 listings then filters client-side — performance concern at scale. Excludes saved/connected listings — verified?
- **InvestmentFitScore on detail page**: Shows per-listing match breakdown — does it handle missing revenue/EBITDA gracefully?
- **Collapsible section**: Default closed (`useState(false)`) — is this the right UX for a feature meant to drive engagement?

### AREA 3: Buyer Messaging System (HIGH)

`BuyerMessages/` is a full messaging center with threads, general chat, and document sharing:

- **Thread routing**: URL param `?deal=<id>` or `?deal=general` — what happens with invalid IDs?
- **General chat**: Separate non-deal thread — how does admin see/respond to these?
- **Message delivery**: Are messages real-time? Is there a realtime subscription?
- **Unread counts**: `useUnreadBuyerMessageCounts` — do counts update on read? Cross-tab?
- **Document sharing in messages**: `DocumentDialog` and `ReferencePicker` — can buyers attach files? Size limits?
- **Message input**: Character limits? XSS sanitization? Empty message prevention?
- **Agreement section**: `AgreementSection.tsx` in messages — what does this show and when?

### AREA 4: Deal Alerts System (MEDIUM-HIGH)

Full CRUD for buyer deal alerts (`deal_alerts` table):

- **Alert creation**: Categories, locations, revenue/EBITDA ranges, frequency (instant/daily/weekly) — all validated?
- **Alert matching**: `match_deal_alerts_with_listing` RPC called on publish — does it actually send notifications? What mechanism delivers alerts?
- **Alert management**: Edit, delete, toggle active/inactive — all working?
- **Alert preview**: `AlertPreview` component — does it show accurate preview of what would match?
- **Success onboarding**: `AlertSuccessOnboarding` — shown once after first alert creation?
- **Edge cases**: Duplicate alerts, alerts with impossible criteria, alerts after account deactivation

### AREA 5: Saved Listings (MEDIUM)

`SavedListings.tsx` page with annotations:

- **Save/unsave toggle**: Does `useSaveListingMutation` properly toggle? Optimistic updates?
- **Annotations**: Stored in `localStorage` (`sourceco_saved_listing_notes`) — lost on device switch. Should this be server-side?
- **Saved listings filters**: Page has category/search but uses `useSavedListings` hook with different filter logic than main marketplace
- **Empty state**: What shows when no listings saved?
- **Stale saved listings**: What happens when a saved listing gets unpublished/deleted? Still shows? Shows error?

### AREA 6: Deal Landing Pages (MEDIUM)

Public-facing pages at `/deal/:slug` for external marketing:

- **Public access**: No auth required — does it properly gate sensitive data?
- **Email capture**: `EmailCapture` component — where do submissions go? Is there spam protection?
- **Deal request form**: `DealRequestForm` — submits connection request without auth? Creates anonymous lead?
- **Related deals**: `RelatedDeals` component — uses `useRelatedDeals` — similar listings logic?
- **Mobile sticky bar**: Intersection observer pattern — works on all devices?
- **SEO/meta**: Does the page set proper meta tags for sharing?
- **Analytics**: Page view tracking for landing page visits?

### AREA 7: Buyer Data Room Access (MEDIUM)

`BuyerDataRoom.tsx` — document access for approved buyers:

- **Access control**: Checks `buyer-data-room-access` query — does it properly gate by connection status?
- **Document categories**: Only shows documents matching enabled categories — is this enforced server-side or client-side only?
- **Download vs view**: `allow_download` flag per document — enforced?
- **Tracked document viewer**: `/view/:linkToken` page — does link tracking work? Expiration?
- **Orientation flow**: `DataRoomOrientation` — first-time guidance for new data room users

### AREA 8: Listing Detail Page UX (MEDIUM)

`ListingDetail.tsx` — 457 lines of the most important buyer page:

- **Click tracking**: `useClickTracking` with flush on unmount — does it reliably capture engagement?
- **Similar listings carousel**: Performance with many similar listings? Empty state?
- **Executive summary generator**: `ExecutiveSummaryGenerator` — AI-generated? What triggers it?
- **Editable fields**: `EditableTitle`, `EditableDescription` — admin-only editing on live pages? Proper auth gates?
- **Deal advisor card**: `DealAdvisorCard` — what info does this show? Is it always relevant?
- **Deal sourcing criteria dialog**: `DealSourcingCriteriaDialog` — what is this? When shown?
- **NDA gate modal**: Shows when `hasFirm && !ndaSigned` — correct behavior for users without a firm?
- **Blurred financial teaser**: Security — can the real data be seen in network tab despite blur?

### AREA 9: Tier 3 Time-Gating (LOW-MEDIUM)

- **Logic**: Tier 3 buyers only see deals 14+ days old OR with <3 Tier 1/2 requests
- **Implementation**: Client-side filtering after fetch — data still sent over network (potential leak)
- **Admin bypass**: Admins skip tier gating — verified
- **Edge**: What tier are new users before scoring? Default tier?

### AREA 10: Listing Preview Page (LOW)

`ListingPreview.tsx` — admin preview of unpublished listings:

- **Admin gate**: Returns "Access Denied" for non-admins — proper, but could it leak data in the query before the gate renders?
- **Parity with ListingDetail**: Does preview accurately represent what buyers will see?
- **BlurredFinancialTeaser in preview**: Shows connection request UI in a preview context — confusing?

---

## Recommended Execution Order

| Response | Areas | Effort |
|----------|-------|--------|
| 1 | Area 1 (Filters/Search/Pagination) + Area 5 (Saved Listings) | Investigation + fixes |
| 2 | Area 3 (Messaging) + Area 4 (Deal Alerts) | Investigation + fixes |
| 3 | Area 2 (Match Scoring) + Area 8 (Listing Detail UX) | Investigation + fixes |
| 4 | Area 6 (Landing Pages) + Area 7 (Data Room) + Area 9 (Tier Gating) | Investigation + fixes |
| 5 | Area 10 (Preview) + cross-cutting cleanup | Final sweep |

## Technical Details

- **Files involved**: ~40+ component files, ~15 hooks, 3-4 edge functions
- **Key data flows**: `useSimpleListings` → Marketplace, `useSavedListings` → SavedListings, `useBuyerThreads` → Messages, `useDealAlerts` → Alerts, `useBuyerDataRoom` → Data Room
- **Security surfaces**: Tier gating (network leak), data room access (client-side category filter), landing page (public data exposure), blurred teaser (DOM inspection)

