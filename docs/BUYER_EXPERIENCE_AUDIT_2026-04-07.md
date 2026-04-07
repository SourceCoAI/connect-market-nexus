# Buyer Experience & Marketplace — Comprehensive Audit
**Date:** April 7, 2026 | **Auditor:** Claude Code | **Depth:** 10/10 | **Scope:** Signup → Onboarding → Browse → Request → Messaging → Documents

---

## EXECUTIVE SUMMARY

The buyer experience has a solid foundation — the signup flow is multi-step and thorough, the marketplace has proper gating, and the agreement system works end-to-end. However, there are **critical data issues** (5 approved buyers with no firm, 96% empty profiles), **broken flows** (businessOwner silently converted to searchFund, stuck-in-limbo post-approval), and **significant UX gaps** (no deal alerts, duplicate request confusion, hardcoded emails). 

**Live data findings paint a stark picture:**
- 238 of 620 buyers (38%) still pending approval
- 96% of approved buyers have no bio, 94% have no ideal target, 93% have no deal size preferences
- 266 of 491 connection requests (54%) are still pending
- 411 of 494 firms (83%) have neither agreement signed
- Only 64 listings visible to buyers on the marketplace
- 5 approved buyers have NO firm record (can't get agreements)
- 16 approved buyers haven't verified their email

---

## SECTION 1: LIVE DATA AUDIT

### Buyer Profiles (620 total non-admin)

| Metric | Count | % | Status |
|--------|-------|---|--------|
| Approved | 382 | 62% | — |
| Pending approval | 238 | 38% | ⚠️ High pending rate |
| Rejected | 0 | 0% | ⚠️ Nobody ever rejected? |
| Email verified | 366 | 96% of approved | — |
| NOT email verified but approved | 16 | 4% | ❌ Shouldn't be possible |
| Onboarding completed | 305 | 80% of approved | — |
| Linked to remarketing_buyer | 365 | 96% of approved | ✅ |
| Has NO firm record | 5 | 1.3% of approved | ❌ Can't get agreements |
| No bio | 367 | 96% | ❌ Profile almost never filled |
| No ideal target | 359 | 94% | ❌ |
| No deal size preferences | 355 | 93% | ❌ |
| No job title | 207 | 54% | ⚠️ |
| No geographic focus | 202 | 53% | ⚠️ |
| No LinkedIn | 122 | 32% | ⚠️ |
| No website | 71 | 19% | — |

### Buyer Type Distribution

| Type | Count | % |
|------|-------|---|
| Private Equity | 192 | 31% |
| Individual | 109 | 18% |
| Search Fund | 91 | 15% |
| Independent Sponsor | 87 | 14% |
| Family Office | 61 | 10% |
| Corporate | 38 | 6% |
| Business Owner | 22 | 4% |
| Advisor | 20 | 3% |

### Connection Requests (491 total)

| Status | Count | % |
|--------|-------|---|
| Pending | 266 | 54% |
| Approved | 122 | 25% |
| Rejected | 101 | 21% |
| On hold | 2 | 0.4% |
| No user_message | 7 | 1.4% |
| NDA signed | 106 | 22% |
| Fee Agreement signed | 202 | 41% |
| Has firm linked | 483 | 98% |

### Firm Agreements (494 total)

| Status | Count | % |
|--------|-------|---|
| NDA signed | 26 | 5% |
| Fee Agreement signed | 60 | 12% |
| Both signed | 21 | 4% |
| Either signed | 65 | 13% |
| Neither signed | 411 | 83% |
| No members | 14 | 3% |

### Marketplace Listings

| Metric | Count |
|--------|-------|
| Total listings in DB | 8,958 |
| Active | 1,612 |
| Pending review | 7,291 |
| Internal deals (remarketing) | 8,891 |
| Marketplace-visible (buyer can see) | 64 |
| Pushed to marketplace | 62 |
| No hero description | 8,952 (99.9%) |
| No image | 8,878 (99.1%) |
| Has buyer-type visibility rules | 1 |

---

## SECTION 2: SIGNUP & ONBOARDING BUGS

### CRIT-1: businessOwner Type Silently Converted to searchFund
**File:** `src/pages/Signup/useSignupSubmit.ts:51`
```typescript
buyer_type: (buyerType === 'businessOwner' ? 'searchFund' : buyerType)
```
**Impact:** 22 business owners in the DB — were they converted? Their profile data may be under wrong type-specific fields.

### CRIT-2: Approved Buyer Stuck on Pending Page if No Agreement Signed
**File:** `src/pages/PendingApproval.tsx:47-51`
**Cause:** Auto-redirect requires BOTH `approval_status === 'approved'` AND `hasAnyAgreement`. If buyer never clicks "Request Documents", they're stuck indefinitely.
**Impact:** Buyer sees "approved" status but can't proceed to marketplace.

### CRIT-3: 5 Approved Buyers Have No Firm Record
**Evidence:** DB query found 5 approved non-admin profiles with no `firm_members` entry.
**Cause:** `auto-create-firm-on-signup` is fire-and-forget. If it failed, no retry mechanism exists.
**Impact:** These buyers can't request agreements, can't get NDA/Fee signed, effectively locked out.

### CRIT-4: 16 Approved Buyers Haven't Verified Email
**Evidence:** `email_verified = false` but `approval_status = 'approved'`
**Cause:** No enforcement that email must be verified before admin can approve.
**Impact:** Unverified users could potentially access marketplace if redirect logic doesn't check.

### CRIT-5: No Rejection Email Sent
**File:** `src/pages/admin/GlobalApprovalsPage.tsx:145-157`
**Issue:** When admin rejects a user, the DB is updated but NO email notification is sent.
**Impact:** Rejected users have no idea they were rejected or why.

### HIGH-1: Firm Creation Fire-and-Forget
**File:** `src/hooks/use-nuclear-auth.ts:345-357`
**Issue:** `auto-create-firm-on-signup` called without await, errors silently caught.
**Impact:** If it fails, buyer gets approved but has no firm → can't sign agreements.

### HIGH-2: Profile Step 4 Entirely Optional
**File:** `src/pages/Signup/useSignupValidation.ts:94-120`
**Issue:** Target description, categories, locations, deal size — ALL optional at signup.
**Impact:** 93-96% of buyers have empty profiles. Deal matching/recommendations have no data to work with.

### HIGH-3: Deal Attribution Stored as Pipe-Separated String
**File:** `src/pages/Signup/useSignupSubmit.ts:110-128`
**Issue:** `referral_source_detail` stores `deal:uuid|first:uuid|landing_page_referral` as text.
**Impact:** Fragile, hard to query, not structured.

---

## SECTION 3: MARKETPLACE BROWSING BUGS

### HIGH-4: Only 64 Listings Visible to Buyers
**Evidence:** DB query confirms only 64 active, non-internal, non-deleted listings.
**Impact:** Buyers see a very small marketplace. 8,891 internal deals exist but aren't visible.

### HIGH-5: Fee Agreement is Hard Gate on Connection Request
**File:** `src/components/listing/ListingCardActions.tsx:114-116`
**Issue:** Buyer MUST have fee agreement to request access. NDA alone is not enough for connection requests.
**Contradicts:** The "either doc" rule used elsewhere in the platform.

### HIGH-6: Tier 3 Buyer Filtering Shows Wrong Count
**File:** `src/hooks/use-simple-listings.ts:131-156`
**Issue:** Tier 3 buyers fetch 200 listings then client-side filter. The displayed count may not match actual filtered results.

### HIGH-7: Deal Alerts Feature Incomplete
**File:** `src/pages/Marketplace.tsx:349-351`
**Issue:** Button exists for "Create Deal Alert" but the feature appears incomplete.

### MED-1: Hardcoded Email in Agreement Modals
**Files:** `AgreementSigningModal.tsx:169`, `FeeAgreementGate.tsx`, `NdaGateModal.tsx`
**Issue:** `adam.haile@sourcecodeals.com` hardcoded in 3 places. Not configurable.

### MED-2: Saved Listing Notes Lost on Logout
**File:** `src/pages/SavedListings.tsx:22-34`
**Issue:** Annotations stored in localStorage, not backend. Lost on browser clear.

### MED-3: No Real-Time Profile → Marketplace Refresh
**Issue:** After completing profile, marketplace cards still show "Complete Profile" gate until manual refresh.

### MED-4: Duplicate Connection Request UX Confusing
**File:** `src/hooks/marketplace/use-connections.ts:155-169`
**Issue:** When buyer resubmits, toast says "Request Updated" or "Request Merged" with no explanation.

### MED-5: No "Already Requested" State Visible on Card
**Issue:** Card doesn't distinguish between fresh pending request and resubmitted one.

### MED-6: Closed/Sold Listings Have No Badge on Card
**Issue:** Marketplace cards don't show "Sold" or "Closed" status. Only visible in detail view.

### MED-7: No Location Hierarchy Hint in Filters
**Issue:** `expandLocations()` function exists but UI shows flat dropdown. Buyer doesn't know "SF" includes "Bay Area".

---

## SECTION 4: CONNECTION REQUEST & MESSAGING BUGS

### CRIT-6: Approval Email Says "Data Room Access" But Only Teaser Granted
**File:** `src/components/admin/connection-request-actions/useConnectionRequestActions.ts:104-114`
**Issue:** Email says "You now have access to the data room" but if buyer only has NDA (not Fee), data room is locked. `can_view_full_memo` and `can_view_data_room` are only true when Fee Agreement is signed.
**Impact:** Buyer feels misled when they log in and find documents locked.

### HIGH-11: No Attachments in Deal-Specific Message Threads
**File:** `src/pages/BuyerMessages/MessageThread.tsx`
**Issue:** Buyers can attach files in general chat (GeneralChatView) but NOT in deal threads (MessageThread). Can't send LOI, financial summaries, or supporting docs in the active deal thread.

### HIGH-12: Duplicate Rejection Emails Possible
**File:** `src/components/admin/connection-request-actions/useConnectionRequestActions.ts:200-209`
**Issue:** No idempotency check. If admin double-clicks "Decline" or race condition occurs, two rejection emails sent.

### HIGH-13: No Email When Admin Messages in Deal Thread
**File:** `src/hooks/use-connection-messages.ts:225-235`
**Issue:** When buyer sends message, only `notify-support-inbox` is called. No email to other admins or assigned team members. Multi-admin teams may miss buyer messages.

### MED-12: No Buyer Withdrawal Mechanism
**Issue:** Once a connection request is submitted, buyer cannot withdraw it. Must contact support.

### MED-13: No Email When Request Status Reverted
**Issue:** When admin clicks "Undo" on an approved request (reverting to pending), no email sent to buyer. Buyer may have already acted on the approval.

### MED-14: Read Receipts Only in General Chat, Not Deal Threads
**File:** `src/pages/BuyerMessages/GeneralChatView.tsx:255-259` vs `MessageThread.tsx`
**Issue:** General chat shows checkmark when admin reads message. Deal threads do not. Inconsistent UX.

### MED-15: Unread Badges 30s Stale
**File:** `src/hooks/use-connection-messages.ts:381`
**Issue:** `staleTime: 30000` means unread badges may be up to 30 seconds behind.

### MED-16: No Real-Time Approval Status Updates
**Issue:** Realtime channel subscribes to `connection_messages` table only, not `connection_requests` status changes. Buyer must refresh to see approval badge.

### Data Quality from DB:
- Duplicate connection requests with null user_id (anonymous landing page submissions)
- 266 pending requests (54%) — extremely high pending rate
- 7 requests with no user_message

---

## SECTION 5: PROFILE & DOCUMENTS BUGS

### HIGH-8: Inconsistent Support Email Addresses
**Files:** Multiple
- `ProfileDocuments.tsx:155` → `support@sourcecodeals.com`
- `ProfileForm.tsx:104,133` → `support@sourceco.com`
- `AgreementSigningModal.tsx:169` → `adam.haile@sourcecodeals.com`
**Impact:** Buyer doesn't know which email to contact.

### HIGH-9: No Agreement History Visible to Buyers
**Issue:** Buyers can see current status but not when it was requested, by whom, what version.
**Data exists:** `agreement_audit_log` table has history but no UI exposes it.

### HIGH-10: No Agreement Document Download
**Issue:** Buyers must find the email to re-read their agreement. No self-serve document retrieval.

### MED-8: Buyer Type Cannot Be Changed
**File:** `src/pages/Profile/ProfileForm.tsx:115`
**Issue:** Disabled with "Contact support" note. No self-service change.

### MED-9: No Agreement Expiration Warnings
**Issue:** DB has `nda_expires_at`, `fee_agreement_expires_at` but no warning banner or renewal flow.

### MED-10: Team Member Invite Requires Manual Admin Action
**File:** `src/pages/Profile/ProfileTeamMembers.tsx`
**Issue:** Sends request to admin inbox. No self-service add.

### MED-11: Buyers Without Firm See Empty Documents Tab
**Issue:** Tab is visible but shows error when they try to request. Should either hide tab or self-heal firm.

---

## SECTION 6: RLS & SECURITY AUDIT

### Listings RLS
- Anonymous: Can view `active`, non-deleted, non-internal listings ✅
- Approved buyers: Can view same + buyer-type visibility filtering ✅
- Admins: Can view all ✅
- **Issue:** Multiple overlapping SELECT policies — `Approved users can view active listings based on buyer type` AND `Approved users can view listings` (broader, no buyer_type check). The broader policy may override the buyer-type restriction.

### Connection Requests RLS
- Buyers can only see own requests ✅
- Two duplicate SELECT policies exist (lines with same qual) — `Users can view own connection requests` and `Users can view their own connection requests`
- Buyers can INSERT their own requests ✅
- **Issue:** Two duplicate INSERT policies too — `Users can create their own connection requests` and `Users can insert own connection requests`

### Profiles RLS
- Users can view/update own profile ✅
- Users can insert own profile ✅
- **Issue:** No restriction on what fields a user can UPDATE. They could theoretically update `approval_status`, `is_admin`, `buyer_quality_score` via direct API calls if they know the column names.

---

## SECTION 7: 50+ USE CASES

### Signup & Account (1-12)

| # | Use Case | Status | Notes |
|---|----------|--------|-------|
| 1 | New buyer signs up with PE firm email | ✅ Works | Auto-firm-linking shows banner |
| 2 | New buyer signs up with gmail | ✅ Works | No firm linking, generic domain blocked |
| 3 | Business owner signs up | ❌ CRIT-1 | Silently converted to searchFund |
| 4 | Buyer signs up, doesn't verify email | ✅ Handled | Pending page shows verification prompt |
| 5 | Buyer verifies email | ✅ Works | Auto-detects via 30s polling |
| 6 | Admin approves buyer | ✅ Works | Email sent, status updated |
| 7 | Admin rejects buyer | ❌ CRIT-5 | No rejection email sent |
| 8 | Approved buyer with no firm | ❌ CRIT-3 | 5 real cases, stuck |
| 9 | Buyer tries to access marketplace while pending | ✅ Redirected | Goes to /pending-approval |
| 10 | Approved buyer never signs agreement | ❌ CRIT-2 | Stuck on pending page |
| 11 | Two buyers from same company sign up | ⚠️ Partial | May get separate firms |
| 12 | Buyer tries to change email | ❌ Blocked | Must contact support |

### Marketplace Browsing (13-25)

| # | Use Case | Status | Notes |
|---|----------|--------|-------|
| 13 | Browse marketplace listings | ✅ Works | 64 visible listings |
| 14 | Filter by category | ✅ Works | Dropdown filter |
| 15 | Filter by location | ✅ Works | With hierarchy expansion |
| 16 | Filter by revenue range | ✅ Works | Preset ranges |
| 17 | Filter by EBITDA range | ✅ Works | Preset ranges |
| 18 | Search listings by text | ✅ Works | Full-text search |
| 19 | Save a listing | ✅ Works | Persisted to DB |
| 20 | View saved listings | ✅ Works | Separate page |
| 21 | Add notes to saved listing | ⚠️ MED-2 | localStorage only |
| 22 | View listing detail (no connection) | ✅ Works | Limited data shown |
| 23 | View listing detail (approved connection) | ✅ Works | Full financials visible |
| 24 | View closed/sold listing | ✅ Handled | Shows "no longer accepting requests" |
| 25 | Tier 3 buyer browsing | ⚠️ HIGH-6 | Wrong count displayed |

### Connection Requests (26-37)

| # | Use Case | Status | Notes |
|---|----------|--------|-------|
| 26 | Request access to listing | ✅ Works | 20-500 char message required |
| 27 | Request access without fee agreement | ❌ HIGH-5 | Blocked (hard gate) |
| 28 | Request access with only NDA | ❌ HIGH-5 | Also blocked |
| 29 | Request access with fee agreement | ✅ Works | — |
| 30 | Re-request after rejection | ✅ Works | "Request again" button |
| 31 | Duplicate request same listing | ✅ Handled | Merged, but UX confusing |
| 32 | View pending request status | ✅ Works | My Deals page |
| 33 | Receive approval notification | ⚠️ Partial | Email sent, but no in-app notification |
| 34 | Receive rejection notification | ⚠️ Partial | No clear reason shown |
| 35 | View data room after approval | ✅ Works | Behind MFA gate |
| 36 | Send message on approved connection | ✅ Works | Message editor available |
| 37 | Seller account tries to request | ✅ Blocked | "Seller accounts cannot request access" |

### Agreements (38-45)

| # | Use Case | Status | Notes |
|---|----------|--------|-------|
| 38 | Request NDA via email | ✅ Works | Email sent with PDF |
| 39 | Request Fee Agreement via email | ✅ Works | Email sent with PDF |
| 40 | View agreement status on profile | ✅ Works | Documents tab |
| 41 | Resend agreement email | ✅ Works | Button available |
| 42 | Agreement signed → status updates | ✅ Works | Admin toggles status |
| 43 | View agreement document | ❌ HIGH-10 | No download link |
| 44 | Agreement expires | ⚠️ MED-9 | No warning to buyer |
| 45 | Buyer from same firm inherits agreement | ✅ Works | Domain matching |

### Messaging (46-50+)

| # | Use Case | Status | Notes |
|---|----------|--------|-------|
| 46 | View conversation list | ✅ Works | Two-column layout |
| 47 | Send message to admin | ✅ Works | On approved connections |
| 48 | Receive message notification | ⚠️ Partial | Email notification exists |
| 49 | Search conversations | ✅ Works | Search bar available |
| 50 | View unread count | ✅ Works | Per-thread count |
| 51 | General chat with SourceCo | ✅ Works | "General" channel option |
| 52 | Send attachment | ⚠️ Not verified | May not be implemented |

### Profile Management (53-60)

| # | Use Case | Status | Notes |
|---|----------|--------|-------|
| 53 | Edit profile information | ✅ Works | All fields editable except email/type |
| 54 | View profile completion % | ✅ Works | Progress bar shown |
| 55 | Complete missing profile fields | ✅ Works | Form validates on save |
| 56 | Change password | ✅ Works | Security tab |
| 57 | View team members | ✅ Works | Shows firm members |
| 58 | Invite team member | ⚠️ MED-10 | Manual admin process |
| 59 | Set deal alerts | ⚠️ HIGH-7 | Feature appears incomplete |
| 60 | Change buyer type | ❌ MED-8 | Disabled, contact support |

---

## SECTION 8: PRIORITY FIX LIST

### P0 — Critical (Blocking Users)
1. Fix 5 approved buyers with no firm (create firms manually)
2. Fix pending-approval redirect to NOT require agreement (let approved users access marketplace)
3. Fix businessOwner→searchFund conversion (remove the conversion)
4. Add rejection email notification

### P1 — High (Major Gaps)
5. Fix fee-agreement-only gate on connection requests (should be "either doc")
6. Resolve 16 unverified-but-approved profiles
7. Add retry mechanism for firm creation failures
8. Make profile Step 4 partially required (at least buyer target/industry)
9. Complete deal alerts feature

### P2 — Medium (UX Issues)
10. Standardize support email to one address
11. Make agreement email configurable (not hardcoded)
12. Persist saved listing notes to backend
13. Add real-time profile→marketplace refresh
14. Improve duplicate request UX
15. Add agreement document download link
16. Add agreement expiration warnings
17. Fix overlapping RLS policies
18. Protect profile sensitive fields from direct API update

### P3 — Low (Polish)
19. Add location hierarchy hints to filters
20. Add "Sold" badge on marketplace cards
21. Remove duplicate RLS policies
22. Add CAPTCHA/rate limiting on signup
23. Add phone number format validation
24. Improve Tier 3 result count display

---

## SECTION 9: ARCHITECTURE NOTES

### Data Flow: Signup → Marketplace Access

```
1. User fills signup form (4 steps)
   └─ Creates: auth.users + profiles (approval_status='pending')
   └─ Fires (async): welcome email, admin notification, firm creation, quality score

2. Email verification
   └─ User clicks link → /auth/callback → sets email_verified=true

3. Admin approval
   └─ Sets approval_status='approved'
   └─ Sends approval email
   └─ Calculates buyer quality score (async)

4. Agreement signing
   └─ Buyer requests via AgreementSigningModal → email sent
   └─ Admin marks as signed → firm_agreements updated
   └─ check_agreement_coverage() RPC returns coverage

5. Marketplace access
   └─ ProtectedRoute checks approval_status='approved'
   └─ Listings filtered by: active, non-internal, buyer-type visibility
   └─ Connection requests gated by: fee agreement signed + profile complete
```

### Key RPCs
- `resolve_user_firm_id(user_id)` → finds firm for buyer
- `get_my_agreement_status()` → returns NDA/Fee coverage
- `check_agreement_coverage(firm_id, type)` → checks specific agreement
- `enhanced_merge_or_create_connection_request()` → handles dedup

### Key Edge Functions
- `auto-create-firm-on-signup` → creates firm_agreements + firm_members
- `request-agreement-email` → sends NDA/Fee PDF via Brevo
- `approve-marketplace-buyer` → handles post-approval setup
- `send-templated-approval-email` → sends approval notification
- `notify-buyer-inquiry-received` → notifies buyer of admin response
- `send-onboarding-day2` / `send-onboarding-day7` → drip emails
