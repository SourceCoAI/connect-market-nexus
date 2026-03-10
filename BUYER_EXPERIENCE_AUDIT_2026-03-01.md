# SourceCo Buyer Experience Audit Report

**Date:** March 1, 2026
**Scope:** Complete buyer journey from registration to active deal engagement
**Method:** Static code analysis of all buyer-facing pages, components, hooks, edge functions, and database schema
**Audit Rule:** Diagnostic only — no changes made

---

## EXECUTIVE SUMMARY

The SourceCo buyer experience is **substantially built and functional** across most journey phases. The core marketplace, deal pipeline, messaging, PandaDoc NDA integration, and connection request flows work end-to-end. However, there are **2 critical issues** (auth bypass, missing buyer document access), **several high-priority gaps** (no email notifications on admin messages, no rejection email idempotency, AI recommendations not buyer-facing), and a set of UX improvements that would meaningfully increase buyer engagement and reduce support burden.

**Overall buyer journey completion rate: ~72%** of steps work end-to-end without friction.

---

## BROKEN (Not Working At All)

### 1. ProtectedRoute Auth Bypass — ALL AUTH CHECKS DISABLED
**File:** `src/components/ProtectedRoute.tsx:12-16`
**What's broken:** The `ProtectedRoute` component has a `// TEMPORARY BYPASS: All auth checks disabled for development page editing` comment and returns `<>{children}</>` unconditionally. The `requireAdmin`, `requireApproved`, and `requireRole` props are accepted but completely ignored.
**Impact on buyer:** Any unauthenticated or unapproved user can access the full marketplace, deal details, messaging, and profile pages by navigating directly to those URLs. This bypasses the entire approval workflow.
**Severity:** CRITICAL — Must restore before production.

### 2. Rejection Email Has No Idempotency Check
**File:** `supabase/functions/notify-buyer-rejection/index.ts`; triggered from `src/components/admin/ConnectionRequestActions.tsx`
**What's broken:** When admin clicks "Decline," three operations fire sequentially: status update, decision message, and email send. If the function is invoked twice (accidental double-click, retry, race condition), the buyer receives duplicate rejection emails. A `correlationId` is logged but not checked for uniqueness before sending.
**Impact on buyer:** Receiving two identical rejection emails is unprofessional and erodes trust in the platform.

---

## MISSING (Never Built or Only Partially Built)

### 3. Buyer-Facing AI Deal Explanations — NOT EXPOSED TO BUYERS
**Files:** `src/hooks/admin/use-recommended-buyers.ts`, `src/components/admin/pipeline/tabs/recommended-buyers/BuyerNarrativePanel.tsx`
**What should exist:** Buyers should see AI-generated explanations of why a deal was matched to them (e.g., "Matches your thesis: B2B services, SE region, $2-5M EBITDA"). The feature is fully built in the admin interface — composite scores, fit reasoning, tier classification, and AI-generated strategy narratives all exist.
**Where needed:** Marketplace deal cards and deal detail pages. Currently, buyers only see a basic client-side `InvestmentFitScore` percentage (`src/components/listing-detail/InvestmentFitScore.tsx`) calculated from their profile, not the richer AI match data.

### 4. Email Notification When Admin Sends a Message — NOT BUILT
**Files:** `src/hooks/use-connection-messages.ts`, `src/pages/BuyerMessages/`
**What should exist:** When SourceCo sends a message in a deal thread, the buyer should receive an email notification. Currently, only rejection status changes trigger email. Regular admin messages generate in-app badge/unread indicators only.
**Where needed:** Every buyer message thread. Buyers may not check the platform daily; email is the reliable notification channel.

### 5. Response Time SLA Communication — NOT SHOWN
**Files:** `src/pages/BuyerMessages/MessageThread.tsx`, `src/components/connection/ConnectionRequestDialog.tsx`
**What should exist:** After submitting a connection request or message, buyers should see expected response time (e.g., "We typically respond within 1 business day").
**Where needed:** Connection request confirmation, message compose area, deal thread header.

### 6. Buyer Team Member Management — NOT BUILT (Buyer-Facing)
**Files:** Database `firm_members` table exists; admin team UI at `src/pages/admin/InternalTeamPage.tsx`
**What should exist:** Buyers should be able to invite colleagues from their firm to access the same deals and threads. The database infrastructure (`firm_members`, `firm_agreements` cascading) fully supports this, but no buyer-facing UI exists.
**Where needed:** Profile page — new "Team Members" tab.

### 7. Account Deactivation / Data Deletion Request — NOT BUILT
**What should exist:** GDPR/CCPA-compliant account closure flow — deactivate account, request data deletion, export personal data.
**Where needed:** Profile > Account Settings section.

### 8. Notification Preferences — NOT BUILT
**What should exist:** Email frequency settings (instant, daily digest, weekly), deal alert preferences, connection request notifications, announcement opt-in/out.
**Where needed:** Profile page — new "Notifications" tab.

### 9. Typing Indicators & Read Receipts — NOT BUILT
**Files:** `src/pages/BuyerMessages/MessageThread.tsx`
**What should exist:** Typing indicator when admin is composing; read receipts so buyers know messages were seen.
**Where needed:** Deal thread messaging interface.

### 10. File Attachment Support in Messages — NOT BUILT
**Files:** `src/pages/BuyerMessages/MessageThread.tsx`
**What should exist:** Buyers should be able to attach documents (LOIs, financial summaries) to messages.
**Where needed:** Message compose bar.

### 11. Save/Bookmark Feature — BUILT
**Previous audit flagged as missing.** Confirmed: Save/bookmark IS implemented. `ListingCardActions.tsx` has bookmark toggle; `SavedListings.tsx` page exists at `/saved-listings`. Saved IDs batch-fetched via `useAllSavedListingIds`.

---

## INCONSISTENT (Works But Confuses Buyers)

### 12. Fee Agreement Appears Only at Connection Request Time
**Files:** `src/components/docuseal/FeeAgreementGate.tsx` (modal gate), `src/pages/PendingApproval.tsx` (NDA only)
**What's inconsistent:** NDA is presented during onboarding (PendingApproval page), but fee agreement only appears when buyer submits their first connection request. Buyer has no advance education about the fee structure during onboarding, then hits a blocking modal at the moment of highest engagement intent.
**How to standardize:** Either (a) present fee agreement summary during onboarding (non-blocking education), or (b) include fee agreement signing alongside NDA on PendingApproval page. The OnboardingPopup (`src/components/onboarding/OnboardingPopup.tsx`) step 3 mentions "You Only Pay if a Deal Closes" but this is a walkthrough step, not a signing step.

### 13. Post-Approval Redirect Has No Confirmation
**Files:** `src/pages/PendingApproval.tsx:116-123`
**What's inconsistent:** When admin approves a buyer, the PendingApproval page silently redirects to marketplace (`navigate('/', { replace: true })`). No toast, no welcome message, no confirmation that approval happened. An approval email is sent (`send-approval-email` edge function) but no in-app indicator.
**How to standardize:** Add a welcome toast on first marketplace load after approval. The OnboardingPopup component exists and shows a 4-step walkthrough — confirm it triggers for newly approved buyers.

### 14. Messaging Lives in Two Places
**Files:** `src/pages/BuyerMessages/` (standalone messages page), `src/components/deals/DealMessagesTab.tsx` (within My Deals)
**What's inconsistent:** Buyers can access messages from `/messages` page OR from the Messages tab within each deal on `/my-deals`. Both use the same `useConnectionMessages` hook and show the same data, but the UI and navigation differ. A buyer could be confused about where to find their messages.
**How to standardize:** This is acceptable dual-access, but add a "View in Messages" link from My Deals messages tab, and "View in My Deals" link from Messages page (the latter exists at `MessageThread.tsx:135-141`).

### 15. Connection Request Statuses Use Different Labels
**Files:** `src/components/deals/DealProcessSteps.tsx` (6-stage: Interested → Sign Docs → Under Review → IOI → LOI → Closed), `src/pages/BuyerMessages/helpers.ts` (status labels: Pending Review → Under Review → Connected → Not Selected)
**What's inconsistent:** The pipeline progress in My Deals shows a 6-stage view, while message thread headers use simpler 4-state labels. These don't map 1:1 and could confuse buyers about actual deal stage.
**How to standardize:** Unify status labels across all buyer-facing surfaces.

---

## FRICTION POINTS (Works But Creates Unnecessary Effort)

### 16. No "What's New" Dashboard Section
**Files:** `src/components/buyer/BuyerDashboard.tsx`, `src/pages/MyRequests.tsx`
**What creates friction:** When buyers log in, they see their deal pipeline (My Deals) or marketplace. There's no consolidated "here's what changed since your last visit" — new matched deals, status updates, unread messages, pending actions.
**Recommended fix:** Add a "What's New" section above deal cards in My Deals, showing: new matched deals count, status changes since last login, unread messages count.

### 17. No Sorting/Filtering Within My Deals
**Files:** `src/pages/MyRequests.tsx:281-313`
**What creates friction:** Deal cards in the sidebar are displayed in a flat list with no sort options. Buyers with many active deals cannot sort by recency, status, or action required.
**Recommended fix:** Add sort dropdown (Recent Activity, Status, Action Required) to deal sidebar header.

### 18. Match Scores Don't Auto-Update When Profile Changes
**Files:** `src/hooks/admin/use-recommended-buyers.ts`, `src/components/marketplace/MatchedDealsSection.tsx`
**What creates friction:** Admin-side match scores (`remarketing_scores`) are only recalculated when admin clicks "Recalculate All Scores." If a buyer updates their profile, old scores persist. The buyer-facing `MatchedDealsSection` uses a simpler client-side algorithm that does refresh on profile load, but the richer AI scores do not.
**Recommended fix:** Trigger score recalculation when buyer updates investment criteria. At minimum, show "scores may be outdated" indicator.

### 19. Email Address Cannot Be Changed
**Files:** `src/pages/Profile/ProfileForm.tsx:44`
**What creates friction:** Email field is disabled with "Email cannot be changed." Buyers who change firms or email providers are stuck. No guidance on what to do (create new account? contact support?).
**Recommended fix:** Add help text: "Need to change your email? Contact support@sourceco.com" or implement an email change flow with verification.

### 20. PandaDoc Error Has No Retry Button
**Files:** `src/pages/PendingApproval.tsx:440-452`, `src/components/docuseal/PandaDocSigningPanel.tsx`
**What creates friction:** If `get-buyer-nda-embed` fails (timeout, PandaDoc unavailable), buyer sees "Failed to prepare NDA signing form" with no retry button. Must refresh the entire page.
**Recommended fix:** Add "Try Again" button that re-invokes the embed fetch. Add fallback: "Having trouble? Email support@sourceco.com and we'll send the NDA directly."

### 21. No Explanation of Why Business Identity Is Hidden
**Files:** `src/pages/ListingDetail.tsx`
**What creates friction:** Anonymous listings show company details but don't explicitly explain that the business name/identity is hidden intentionally and how to unlock it (request connection → get approved → see full identity).
**Recommended fix:** Add a subtle banner: "Business identity is confidential until you're connected. Request access to learn more."

---

## QUICK WINS (Small Changes, High Buyer Impact)

### QW-1: Add Welcome Toast After Approval
**Change:** In marketplace page load, detect if user was just approved (e.g., check `approval_status` transition or flag) and show toast: "Welcome to SourceCo! Browse deals and request access when you see a fit."
**Expected impact:** Eliminates confusion about silent redirect; confirms approval happened.

### QW-2: Add "Expected Response Time" to Connection Request Confirmation
**Change:** After buyer submits connection request, show: "We'll review your request within 1-2 business days. You'll be notified by email."
**Expected impact:** Sets expectations; reduces "did they get my request?" anxiety and support emails.

### QW-3: Add Retry Button to PandaDoc Error State
**Change:** Replace static error message with: error message + "Try Again" button + support email link.
**Expected impact:** Unblocks buyers when PandaDoc has transient issues.

### QW-4: Add Unload Warning During PandaDoc Signing
**Change:** Add `beforeunload` event listener when PandaDoc form is in `ready` state to prevent accidental navigation.
**Expected impact:** Prevents lost signing progress from accidental refresh.

### QW-5: Show Sold/Closed Deal Status Clearly
**Change:** When a buyer views a listing that is no longer active, show a prominent banner: "This opportunity has been closed. Browse similar deals." Currently `ListingStatusTag` exists but the CTA still says "Request Access."
**Expected impact:** Prevents wasted effort and confusion.

### QW-6: Expose Signed Agreement Downloads to Buyers
**Change:** The `ProfileDocuments.tsx` component already fetches and displays signed documents from `firm_agreements`. Verify it's working and the `nda_signed_document_url` / `fee_signed_document_url` fields are populated by the PandaDoc webhook handler.
**Expected impact:** Compliance benefit; buyers can access their signed agreements for records.

---

## PHASE 10 — BUYER JOURNEY INTEGRITY CHECK

### End-to-End Walkthrough

| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| 1 | Receive invite link / navigate to /welcome | ⚠ Partial | No invite link flow; self-registration only via /welcome → /signup |
| 2 | Register / create account | ✓ Working | 5-step form with draft persistence, validation, and buyer-type-specific fields |
| 3 | Complete firm profile | ✓ Working | Step 4-5 of signup; can skip and complete later at /profile |
| 4 | Complete PandaDoc fee agreement | ⚠ Not in onboarding | Fee agreement only shown at first connection request, not during signup |
| 5 | Land on dashboard | ⚠ Partial | Lands on marketplace (/), not a dedicated dashboard. No welcome message. |
| 6 | Browse marketplace listings | ✓ Working | FilterPanel with category, location, revenue, EBITDA. Analytics tracked. |
| 7 | Filter listings by industry/geography | ✓ Working | Filters functional; URL state may not persist visibly in address bar |
| 8 | View a deal detail page (anonymous) | ✓ Working | Shows title, category, location, revenue/EBITDA, description. Seller identity protected. |
| 9 | Submit connection request | ✓ Working | Dialog with message (20-500 chars), AI draft option, helpful guidance text |
| 10 | See connection request status | ✓ Working | Pending/Approved/Rejected badges on deal cards and in My Deals pipeline |
| 11 | Receive admin message in deal thread | ✓ Working | Messages appear in thread with realtime updates; system messages visually distinct |
| 12 | Reply to message | ✓ Working | Text input with Enter-to-send; rejected deals disable compose |
| 13 | Sign NDA via PandaDoc | ✓ Working | Embedded PandaDoc form on PendingApproval page; immediate webhook confirmation |
| 14 | Access full CIM/deal materials after NDA | ✓ Working | DealDocumentsTab filters by access flags; data room enforced server-side |
| 15 | View deal status progress | ✓ Working | 6-stage pipeline progress in DealDetailHeader; DealProcessSteps component |

**Steps that fail, are broken, or are missing:**
- Step 1: No invite link mechanism exists (self-registration only)
- Step 4: Fee agreement not in onboarding flow — appears only at first connection request
- Step 5: No dedicated buyer dashboard or welcome message after approval
- ProtectedRoute bypass means steps 5-15 are technically accessible without authentication

---

## SUMMARY SCORECARD

| Journey Phase | Status | Issues Found |
|---|---|---|
| Onboarding | ⚠ Partial | ProtectedRoute disabled (CRITICAL); fee agreement not in flow; no guided orientation; PandaDoc error has no retry |
| Dashboard | ⚠ Partial | No dedicated dashboard; no "What's New" section; no sorting within My Deals |
| Marketplace Browsing | ✓ Working | Filters, search, deal cards, save/bookmark all functional; memo gate enforced server-side |
| Connection Request | ✓ Working | Form with AI draft, status visibility, professional rejection emails; missing confirmation email to buyer and response SLA |
| Messaging | ✓ Working | Per-deal threads, system messages distinct, realtime updates; missing email notifications for admin messages, no file attachments, no typing indicators |
| NDA & Documents | ✓ Working | PandaDoc embedded signing, immediate webhook confirmation, data room gating; buyer document download needs verification |
| AI Recommendations | ⚠ Partial | Fully built for admin; NOT exposed to buyers; client-side match scoring exists but uses simpler algorithm |
| Profile & Settings | ⚠ Partial | Full profile editing works; missing team members, notification preferences, account deletion, email change |

**Overall buyer journey completion rate: ~72%** — Core deal discovery through pipeline management works, but onboarding gates, post-approval experience, AI surfacing, and account management have significant gaps.

---

## DETAILED PHASE-BY-PHASE FINDINGS

### PHASE 1 — BUYER ONBOARDING

| Item | Status | File Location | Finding |
|------|--------|---------------|---------|
| Self-registration flow | ✓ | `src/pages/Signup/index.tsx` | 5-step form (Account → Personal → Referral → Buyer Type → Profile); draft persists to localStorage; passwords excluded from storage |
| URL param pre-population | ✓ | `src/pages/Signup/index.tsx:93-103` | Landing pages can pass name, email, phone, company via URL params |
| Deal context tracking | ✓ | `src/pages/Signup/index.tsx:67-80` | Captures which deal buyer viewed before signup; stored in localStorage |
| Email verification | ✓ | `src/pages/SignupSuccess.tsx` | Supabase auth email verification; resend with rate limiting |
| Pending approval page | ✓ | `src/pages/PendingApproval.tsx` | Shows 3-state UI (email not verified / under review / rejected); auto-polls every 30s |
| NDA during pending approval | ✓ | `src/pages/PendingApproval.tsx:408-482` | PandaDoc NDA embedded while waiting; "Sign before approval for immediate access" |
| Firm auto-creation | ✓ | `src/pages/PendingApproval.tsx:46-69` | Fallback: if firm doesn't exist (edge function failed), creates on PendingApproval load |
| Onboarding walkthrough | ✓ | `src/components/onboarding/OnboardingPopup.tsx` | 4-step walkthrough: Deal Types → Sourcing → Fees → How to Get Selected |
| Post-approval redirect | ⚠ | `src/pages/PendingApproval.tsx:116-123` | Silent redirect to marketplace; no welcome toast or confirmation |
| ProtectedRoute enforcement | ✗ CRITICAL | `src/components/ProtectedRoute.tsx:12-16` | ALL auth checks bypassed; returns children unconditionally |

### PHASE 2 — BUYER DASHBOARD

| Item | Status | File Location | Finding |
|------|--------|---------------|---------|
| Deal pipeline (My Deals) | ✓ | `src/pages/MyRequests.tsx` | Left sidebar with deal cards; right panel with detail tabs; unread badges |
| BuyerDashboard panel | ✓ | `src/components/buyer/BuyerDashboard.tsx` | Profile completeness %, match count, saved count, unread messages |
| Matched deals section | ✓ | `src/components/marketplace/MatchedDealsSection.tsx` | Client-side scoring (category +3, location +2, revenue +2, EBITDA +2, type +1); minimum threshold: score >= 2 |
| Match explanations | ✓ | `src/components/marketplace/MatchedDealsSection.tsx:271-289` | Purple "Why matched" tooltip per deal with reason breakdown |
| Action hub | ✓ | `src/components/deals/ActionHub.tsx` | Navy bar: "N Actions Required Across Your Deals"; prioritized chips (NDA → Fee → Messages) |
| Pending signing banner | ✓ | `src/components/deals/PendingSigningBanner.tsx` | Prominent banner on marketplace for unsigned NDA/fee agreement |
| Empty states | ✓ | `src/pages/MyRequests.tsx:225-250` | "No deals yet" with CTA to browse marketplace |
| "What's New" section | ✗ | N/A | Not built; no consolidated "changes since last login" view |
| Deal sorting in sidebar | ✗ | `src/pages/MyRequests.tsx:281-313` | Flat list; no sort by recency, status, or action required |

### PHASE 3 — MARKETPLACE BROWSING

| Item | Status | File Location | Finding |
|------|--------|---------------|---------|
| Listing visibility | ✓ | `src/pages/ListingDetail.tsx` | Shows title, category, location, revenue, EBITDA, description, team size |
| Seller identity protection | ✓ | RLS + frontend | Company name visible; no seller contact info; identity confirmed only after approval |
| Filtering | ✓ | `src/components/FilterPanel.tsx` | Category, location, revenue range (7 presets), EBITDA range (7 presets) |
| Search | ✓ | `src/components/FilterPanel.tsx:150-158` | Text search functional |
| Deal cards | ✓ | `src/components/ListingCard.tsx` | Grid/list view; image + status tag + badges + financials + actions |
| Save/bookmark | ✓ | `src/components/ListingCardActions.tsx` | Bookmark toggle; SavedListings page at /saved-listings |
| Memo gate (server-side) | ✓ | `src/components/deals/BuyerDataRoom.tsx` + RLS | `data_room_access` table with `can_view_teaser`, `can_view_full_memo`, `can_view_data_room` flags |
| Sold/paused deal visibility | ⚠ | `src/components/listing-detail/ListingStatusTag.tsx` | Status tag shown but no hard filter preventing browsing of inactive listings; CTA may still show "Request Access" |

### PHASE 4 — CONNECTION REQUEST & APPROVAL FLOW

| Item | Status | File Location | Finding |
|------|--------|---------------|---------|
| Connection request form | ✓ | `src/components/connection/ConnectionRequestDialog.tsx` | Modal with textarea (20-500 chars); AI "Draft with AI" button; guidance text |
| Post-submission confirmation | ⚠ | Same file | Toast notification only; no email confirmation to buyer; no "what happens next" with timeline |
| Status visibility | ✓ | `src/pages/MyRequests.tsx`, `src/components/deals/DealProcessSteps.tsx` | Pending → Under Review → Approved/Rejected; 6-stage pipeline progress |
| Rejection email | ✓ | `supabase/functions/notify-buyer-rejection/index.ts` | Professional tone; uses listing title (not real company name) |
| Rejection idempotency | ✗ | Same function | `correlationId` logged but not checked before sending; duplicate sends possible |
| Status updates in thread | ✓ | `src/components/deals/DealActivityLog.tsx` | System messages appear in Activity Log; visually distinct (italic, centered, cream background) |
| Fee agreement gate | ✓ | `src/components/docuseal/FeeAgreementGate.tsx` | Full-screen modal blocks connection request if firm hasn't signed; inline PandaDoc signing |

### PHASE 5 — MESSAGING & DEAL THREADS

| Item | Status | File Location | Finding |
|------|--------|---------------|---------|
| Per-deal threads | ✓ | `src/pages/BuyerMessages/index.tsx` | One thread per connection_request_id; conversation list + thread view |
| General inquiry chat | ✓ | `src/pages/BuyerMessages/MessageThread.tsx:280-483` | Non-deal-specific messaging with SourceCo team |
| System message distinction | ✓ | `src/pages/BuyerMessages/MessageThread.tsx:170-183` | System messages: italic, centered, cream background (#F7F4DD) |
| Human message styling | ✓ | Same file, lines 186-224 | Buyer: right-aligned, navy background; Admin: left-aligned, white background |
| Realtime updates | ✓ | `src/hooks/use-connection-messages.ts` | Supabase channel subscribes to INSERT events on `connection_messages` |
| Unread badges | ✓ | `src/pages/BuyerMessages/index.tsx:69` | Total unread count in header; per-thread highlighting |
| Email on admin message | ✗ | Not implemented | No email notification when admin sends a regular message |
| File attachments | ✗ | Not implemented | Text-only messaging |
| Typing indicator | ✗ | Not implemented | No typing indicators |
| Read receipts | ✗ | Not implemented | `is_read_by_buyer`/`is_read_by_admin` flags exist but not surfaced to users |
| Duplicate message prevention | ⚠ | PandaDoc webhook has idempotency; general sends do not | `pandadoc_webhook_log` checks for duplicates; regular message creation has no dedup |
| Document signing from messages | ✓ | `src/pages/BuyerMessages/MessageThread.tsx:527-805` | PendingAgreementBanner shows NDA/fee status with inline signing, download, and "Questions?" dialog |

### PHASE 6 — NDA & DOCUMENT ACCESS

| Item | Status | File Location | Finding |
|------|--------|---------------|---------|
| NDA delivery | ✓ | `src/pages/PendingApproval.tsx` + `supabase/functions/get-buyer-nda-embed/` | Embedded PandaDoc form; auto-creates submission if none exists |
| NDA confirmation | ✓ | `supabase/functions/pandadoc-webhook-handler/` | Webhook fires on completion; updates `firm_agreements` + all firm members |
| Deal thread update | ✓ | Same webhook handler | System message posted: "Your NDA has been signed successfully" |
| Re-access signed NDA | ⚠ | `src/pages/Profile/ProfileDocuments.tsx` | Component exists to show signed docs; depends on `nda_signed_document_url` being populated |
| Document access after NDA | ✓ | `src/components/deals/DealDocumentsTab.tsx` | Filters by `can_view_teaser`, `can_view_full_memo`, `can_view_data_room` |
| Download vs view-only | ✓ | Same file | `allow_download` flag per document; admin configurable |
| Document access log | ⚠ | `supabase/functions/record-data-room-view/` | Edge function logs doc access; not exposed to buyer |
| Empty data room state | ✓ | `src/components/deals/DealDocumentsTab.tsx` | "The SourceCo team will share documents as the deal progresses" |
| Self-healing NDA status | ✓ | `supabase/functions/get-buyer-nda-embed/index.ts:127-162` | Detects if PandaDoc says signed but DB doesn't, and corrects |

### PHASE 7 — AI RECOMMENDATIONS

| Item | Status | File Location | Finding |
|------|--------|---------------|---------|
| AI deal recommendations (admin) | ✓ | `src/hooks/admin/use-recommended-buyers.ts` | Composite scores, fit reasoning, tier classification, transcript insights |
| AI buyer narrative (admin) | ✓ | `src/components/admin/pipeline/tabs/recommended-buyers/BuyerNarrativePanel.tsx` | 3-5 sentence strategy brief per buyer with transcript quotes |
| AI explanations (buyer) | ✗ | Not exposed | Buyers don't see any AI-generated match explanations |
| Client-side match scoring | ✓ | `src/components/marketplace/MatchedDealsSection.tsx:19-118` | Simpler algorithm: category +3, location +2, revenue +2, EBITDA +2, type +1 |
| InvestmentFitScore (buyer) | ✓ | `src/components/listing-detail/InvestmentFitScore.tsx` | Shows buyer's fit % to specific deal (weighted: Revenue 30%, Location 25%, Industry 25%, Size 20%) |
| Auto-refresh on profile update | ✗ | Not implemented | Admin must manually click "Recalculate All Scores" |
| Match score on deal cards | ✗ | Not implemented | No "Match: 82%" badge visible to buyers on marketplace cards |

### PHASE 8 — BUYER PROFILE & SETTINGS

| Item | Status | File Location | Finding |
|------|--------|---------------|---------|
| Profile editing | ✓ | `src/pages/Profile/ProfileForm.tsx` | Full editing: name, company, buyer type, investment criteria, deal preferences, exclusions, keywords |
| Buyer-type-specific fields | ✓ | `src/pages/Profile/ProfileSettings.tsx` | Conditional fields per buyer type (PE: fund size, deploying status; Search: equity band, financing) |
| Document viewing | ✓ | `src/pages/Profile/ProfileDocuments.tsx` | Shows signed NDA and fee agreement with download links |
| Deal alerts | ✓ | `src/components/deal-alerts/DealAlertsTab.tsx` | Create/edit/toggle deal alerts based on criteria |
| Password change | ✓ | `src/pages/Profile/ProfileSecurity.tsx` | Current password required; signs out other sessions |
| Email change | ✗ | `src/pages/Profile/ProfileForm.tsx:44` | Disabled with "Email cannot be changed" |
| Notification preferences | ✗ | Not implemented | No email frequency settings, digest options, or opt-out management |
| Team member management | ✗ | Not built for buyers | `firm_members` DB infrastructure exists; no buyer UI |
| Account deactivation | ✗ | Not implemented | No deactivate/delete flow |
| Buyer type access control | ✓ | RLS + `visible_to_buyer_types` | Server-side enforcement; business owners blocked from marketplace |

### PHASE 9 — EDGE CASES & ERROR STATES

| Scenario | Status | Finding |
|----------|--------|---------|
| Unauthorized URL access | ✓ (DB) / ✗ (Route) | RLS prevents data access; but ProtectedRoute bypass lets UI render |
| Connection request for sold deal | ⚠ | ListingStatusTag shows status but ConnectionButton may still be active |
| PandaDoc down during NDA | ⚠ | Generic error message; no retry button; no fallback |
| Refresh mid-PandaDoc signing | ⚠ | No `beforeunload` warning; PandaDoc session may be lost |
| Session expiry during deal view | ⚠ | Session monitoring exists (`use-session-monitoring.ts`); no graceful "session expired" modal |
| Mobile responsiveness | ✓ | Tailwind responsive grid; mobile detection hook; proper column stacking |
| Deal cards on mobile | ✓ | No horizontal scrolling; proper text wrapping |
| PandaDoc on mobile | ⚠ | Embedded iframe should scale; untested for touch interactions |
| Messaging on mobile | ✓ | Two-pane collapses to single pane; back button on mobile; touch-friendly |

---

## PERFORMANCE ASSESSMENT

| Buyer Action | Target | Assessment | Notes |
|---|---|---|---|
| Dashboard/marketplace load | < 2s | ✓ Likely | React Query caching (15min staleTime); explicit column selection; no SELECT * |
| Deal detail page load | < 2s | ✓ Likely | Single listing fetch + connection status check |
| Connection request submission | < 1s | ✓ Likely | Single RPC call with fire-and-forget scoring |
| Message send and display | < 1s | ✓ Likely | Supabase realtime subscription; optimistic UI possible |
| PandaDoc signing frame load | < 3s | ⚠ External | Depends on PandaDoc API; 15s timeout configured in edge function |

---

## PREVIOUS AUDIT ISSUES — STATUS CHECK

| Previous Finding | Current Status |
|---|---|
| Deal tabs were truncated text with colored dots — no status, no next action | ✓ FIXED — DealProcessSteps shows 6-stage pipeline with clear status and next actions |
| Connection requests and messaging were two disconnected systems | ✓ FIXED — Unified into deal threads; messages and status updates share `connection_messages` table |
| Same NDA and fee agreement notification sent twice in same thread | ⚠ PARTIALLY FIXED — PandaDoc webhook has dedup check; but rejection emails and general system messages lack idempotency |
| No consolidated action hub | ✓ FIXED — ActionHub component aggregates pending NDA, fee agreement, and unread messages |
| No in-app guided orientation | ✓ EXISTS — OnboardingPopup with 4-step walkthrough (Deal Types → Sourcing → Fees → How to Get Selected) |
| Save/bookmark feature not built | ✓ BUILT — Full save/unsave with SavedListings page |

---

*SourceCo Internal — Buyer Experience Audit v1.0 — March 1, 2026*
*Generated via static code analysis of 120+ components, 150+ edge functions, 715 database migrations*
