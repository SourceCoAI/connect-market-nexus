# SourceCo Platform — Complete Workflow & User Story Audit

**Date:** 2026-03-22
**Auditor:** Senior Associate, SourceCo
**Scope:** Every user-facing workflow in the connect-market-nexus platform
**Method:** Direct source code reading of 1,264+ TypeScript/TSX files, edge functions, migrations, and hooks

---

## Table of Contents

1. [Deal Management](#1-deal-management)
2. [Buyer Management](#2-buyer-management)
3. [Buyer Discovery & Universe Building](#3-buyer-discovery--universe-building)
4. [Referral Partners](#4-referral-partners)
5. [Marketplace Listings](#5-marketplace-listings)
6. [Landing Pages & Buyer Experience](#6-landing-pages--buyer-experience)
7. [Email Program & Buyer Outreach](#7-email-program--buyer-outreach)
8. [Admin & System Config](#8-admin--system-config)
9. [End-to-End Deal Lifecycle](#9-end-to-end-deal-lifecycle)
10. [Master Gap Registry](#10-master-gap-registry)

---

## 1. Deal Management

### 1.1 Creating a New Deal (Admin Pipeline)

**Why:** Admins manually add deals to track buyer interest in a specific listing through the pipeline.

**Steps:**

1. Open `CreateDealModal` from the pipeline view.
2. Fill in the Zod-validated form:
   - **Title** (required, 1-200 chars) — free text name
   - **Listing** (required, UUID) — must select from active listings
   - **Pipeline Stage** (required, UUID) — defaults to first stage
   - **Contact Name** (required, 1-100 chars)
   - **Contact Email** (required, valid email) — used for duplicate detection
   - **Contact Company** (optional, max 150 chars)
   - **Contact Phone** (optional, max 50 chars)
   - **Contact Role** (optional, max 100 chars)
   - **Priority** (enum: low/medium/high/urgent, default medium)
   - **Deal Value** (optional, number >= 0)
   - **Win Probability** (optional, 0-100%, auto-populated from stage's `default_probability`)
   - **Expected Close Date** (optional, must be today or future)
   - **Assigned To** (optional, admin UUID)
3. Contact can be populated from an existing marketplace user (auto-fills fields) or entered manually.
4. On submit, duplicate check queries `connection_requests` for matching `lead_email` + `listing_id`. If found, `DuplicateWarningDialog` appears.
5. If marketplace user selected, a `connection_request` is created (status: approved, source: manual). Otherwise, a `contacts` record is upserted.
6. Deal inserted into `deal_pipeline` with `source: 'manual'`, `nda_status: 'not_sent'`, `fee_agreement_status: 'not_sent'`.
7. `deal_created` activity logged to `deal_activities`. Caches invalidated.

**Expected output:** Deal appears in pipeline board at selected stage. Toast: "Deal Created".

**Gaps/Issues:**

- No value validation beyond >= 0. A $0 deal is functionally meaningless.
- Duplicate detection only checks `connection_requests`, not `deal_pipeline` directly.
- No "deal source" dropdown — hardcoded to `'manual'`.
- `primary_owner_id` is optional — deals can be created with no owner.
- Category normalization absent — free-text strings with no canonical list enforced.

---

### 1.2 Creating a Deal (Remarketing / Sourced Context)

**Why:** Deals in the remarketing module are tracked as `listings` with `is_internal_deal = true`. They represent seller-side opportunities being sourced.

**Steps:**

1. Open `AddDealDialog` or `AddDealForm` from the remarketing module.
2. Enter: Company Name (required), Website (required for enrichment), contact info, transcript files.
3. A `listings` row is created with `is_internal_deal = true`, `status = 'active'`.

**Expected output:** New listing in the remarketing deals table.

**Gaps/Issues:**

- Two entirely different "deal" concepts share the word "deal" — `deal_pipeline` (buyer deals) vs `listings` with `is_internal_deal=true` (sourced deals). Extremely confusing.
- Website required for enrichment but no format validation in the form UI.

---

### 1.3 Converting Remarketing Buyer to Pipeline Deal

**Why:** When a buyer identified through remarketing should enter the formal deal pipeline.

**Steps:**

1. Admin triggers conversion from the remarketing buyer detail page.
2. Calls `convert-to-pipeline-deal` edge function.
3. Edge function validates auth, checks for existing `deal_pipeline` entry (dedup by `remarketing_buyer_id` + `listing_id`).
4. Fetches buyer, primary contact, looks up target stage ("Qualified" default, then default stage, then first active).
5. Auto-creates `firm_agreements` record if buyer has no `marketplace_firm_id`.
6. Creates `deal_pipeline` row with title: `"{BuyerCompany} -> {ListingTitle}"`.

**Expected output:** 200 response with `deal_id`, `deal_title`, `stage_id`, `firm_id`. Deal appears in pipeline.

**Gaps/Issues:**

- No activity log entry created — missing `deal_created` activity.
- Hardcoded stage name "Qualified" — breaks silently if renamed.
- No notification sent to deal owner on conversion.
- Edge function writes to deprecated contact columns on `deal_pipeline`.

---

### 1.4 Pipeline Stages

**Why:** Stages define where a deal sits in the M&A lifecycle.

**Current Active Stages:**

| Position | Stage Name            | Type        |
| -------- | --------------------- | ----------- |
| 0        | Approved              | active      |
| 1        | Info Sent             | active      |
| 2        | Owner intro requested | active      |
| 3        | Buyer/Seller Call     | active      |
| 4        | Due Diligence         | active      |
| 5        | LOI Submitted         | active      |
| 6        | Closed Won            | closed_won  |
| 7        | Closed Lost           | closed_lost |

**Gaps/Issues:**

- 10 deactivated stages remain in DB. Deals in those stages are in limbo with no UI path to reassign.
- At least 3 automations depend on exact string matches ("Owner intro requested", "Closed Won", "Closed Lost"). Renaming breaks them silently.
- No stage transition rules — any deal can jump to any stage in any direction.
- No maximum number of stages enforced.

---

### 1.5 Moving a Deal Through Stages

**Why:** Tracks progression of buyer interest through the M&A lifecycle.

**Steps:**

1. Admin drags deal card or clicks to change stage.
2. `useUpdateDealStage` fires with ownership check.
3. If another admin owns the deal, `DealOwnerWarningDialog` appears.
4. Calls `move_deal_stage_with_ownership` RPC (moves stage, records `deal_stage_entered_at`, auto-assigns owner if unassigned).
5. Post-move: if owner overridden, notification email sent. If stage = "Owner intro requested", `send-owner-intro-notification` fires.

**Expected output:** Deal card moves. Toast confirms. Owner intro email sent if applicable.

**Gaps/Issues:**

- "Owner intro requested" trigger is a hardcoded string comparison — renaming the stage silently breaks it.
- No validation preventing backward movement.
- Owner auto-assignment happens silently on any stage move.
- No audit trail for who confirmed the owner warning dialog.

---

### 1.6 NDA and Fee Agreement Lifecycle

**Why:** Legal documents must be executed before confidential information can be shared.

**Steps:**

1. Deal starts with `nda_status: 'not_sent'` and `fee_agreement_status: 'not_sent'`.
2. Admin sends NDA → status 'sent'. Buyer signs → 'signed'. Or declines → 'declined'.
3. Same flow for Fee Agreement.
4. Data room access gated on NDA/fee agreement status.

**Expected output:** Status badges update. Data room unlocks after signing.

**Gaps/Issues:**

- No automatic stage advancement when NDA or fee agreement is signed.
- No enforcement that NDA must be signed before fee agreement.
- No expiration tracking for NDAs or fee agreements.
- Buyer-facing `DealStatusSection` has 4 hardcoded stages completely separate from admin pipeline stages.

---

### 1.7 AI Label Generation (Single and Batch)

**Why:** Automatically classify deals to identify the right buyer universe.

**Steps:**

1. Admin triggers via universe management page or batch queue.
2. `generate-buyer-universe` edge function (Gemini AI) generates a `buyer_universe_label` (3-6 words, e.g., "HVAC Services Add-On") and `buyer_universe_description` (2 sentences).
3. Batch: "Generate Universes" button triggers `process-buyer-universe-queue` which processes flagged deals sequentially.
4. Results stored on the `listings` table.

**Expected output:** Deal tagged with buyer universe label for matching.

**Gaps/Issues:**

- Caches permanently after first generation — no way to regenerate without clearing the timestamp field.
- Does not actually match buyers to the universe — only generates the label.
- Duplicate code: `generateForListing()` in the queue duplicates the full logic of the single function.

---

### 1.8 Deal Activity Log

**Why:** Auditable history of all deal events.

**Steps:**

1. Admin-side: queries `deal_activities` table. Shows type badge, admin name, timestamp, description.
2. Supports adding manual "follow_up" notes and deleting them.
3. Activity types: `stage_change`, `nda_status_changed`, `assignment_changed`, `deal_created`, `deal_deleted`, `follow_up`, etc.

**Expected output:** Chronological list of all deal events with admin attribution.

**Gaps/Issues:**

- Two completely separate activity log implementations (admin vs buyer) querying different tables.
- `logDealActivity` is fire-and-forget — failures only logged to console.
- Manual notes use same `follow_up` type as real follow-ups, making filtering impossible.
- Delete on notes has no confirmation dialog.
- @mentions (`mentioned_admins`) stored but no notification system triggered.

---

### 1.9 Archiving / Closing a Deal

**Why:** Remove deals from active pipeline without losing data.

**Steps:**

1. Open `DeleteDealDialog`. Type exact deal title to confirm.
2. Optional deletion reason.
3. Calls `soft_delete_deal` RPC — sets `deleted_at` timestamp.
4. All queries filter by `deleted_at IS NULL`.
5. Restore via `useRestoreDeal` hook.

**Expected output:** Deal disappears from pipeline. Restorable.

**Gaps/Issues:**

- No "archive" status separate from "delete".
- Deletion reason is optional — should be required for audit trail.
- No UI for viewing/restoring deleted deals is apparent in the main pipeline.
- Closing (Closed Won/Lost) doesn't trigger cleanup — no auto-archive, no data room closure, no buyer notification.
- Closed listings remain active on the marketplace.

---

### 1.10 Deal Scoring (v5)

**Why:** Automatically score deals for prioritization.

**Steps:**

1. Scoring in `deal-scoring-v5.ts` takes financial metrics, employee counts, location, industry.
2. Produces `deal_total_score` and `is_priority_target`.
3. Financial normalization: values < 1000 treated as millions, < 100000 as thousands.
4. Major metro location boost applied.

**Expected output:** Deals have a score and priority flag visible in the pipeline.

**Gaps/Issues:**

- Dual implementation (client-side + edge function) with no automated parity test.
- Financial normalization is dangerous: $500 becomes $500M with no warning.
- Scoring is listing-level, not deal-level — multiple deals on the same listing share the same score.

---

## 2. Buyer Management

### 2.1 Adding a Buyer Manually

**Why:** Create buyer records for companies encountered through deal-sourcing calls, conferences, or inbound inquiries.

**Steps:**

1. Navigate to `/admin/buyers`. Click "Add Buyer".
2. Fill in: Company Name (required), Website (required by business logic), Buyer Type (optional dropdown: PE, Corporate, Family Office, Search Fund, Independent Sponsor, Individual), Buyer Universe (optional), Investment Thesis (optional), Notes (optional).
3. Frontend normalizes website via `normalizeDomain()`, checks for duplicate domains.
4. DB unique index `idx_buyers_unique_domain` enforces dedup.

**Expected output:** New buyer row. Toast: "[Company Name] has been added."

**Gaps/Issues:**

- Only 6 fields collected. Critical fields (HQ location, target revenue, target geographies, PE firm) missing.
- Website labeled as optional in UI but required by business logic — confusing.
- No URL format validation.
- Null buyer_type flags record for "Needs Review" queue, creating triage work.

---

### 2.2 Buyer Scoring Tiers (Deal-Level Match)

**Why:** Rank buyers by fit for a specific deal.

**Steps:**

1. Scoring engine computes per buyer-per-listing: Service (45%), Size (30%), Geography (20%), Owner Goals (5%).
2. Modifiers: Size/Service multipliers, Thesis Alignment Bonus, Data Quality Bonus, Learning Penalty.
3. Tier assignment: A (80+), B (65-79), C (50-64), D (35-49), F (<35), DQ (disqualified).

**Expected output:** Each buyer shows score ring with letter tier, sub-scores, fit reasoning.

**Gaps/Issues:**

- `needs_review` flag has no automated workflow to route borderline scores to analysts.
- No manual score override UI (field exists in type but no form).
- `learning_penalty` references `buyer_learning_history` but no frontend workflow populates it.

---

### 2.3 Buyer Quality Scoring (Marketplace Tier)

**Why:** Tier buyers by credibility for the marketplace.

**Steps:**

1. `compute_buyer_priority()` SQL function scores 0-100 based on buyer type, revenue range, thesis, geographies, industries.
2. `buyer_tier` (1-4) set by `calculate-buyer-quality-score` edge function.
3. Admin can set `admin_tier_override`.

**Expected output:** Each marketplace buyer has quality score and tier.

**Gaps/Issues:**

- Two completely separate scoring systems (marketplace quality vs deal match) with no cross-reference.
- Frontend defines 5 tiers but DB CHECK constraint only allows 1-4.
- No audit trail for admin tier overrides.

---

### 2.4 Duplicate Handling

**Why:** Prevent fragmented deal intelligence and embarrassing double-contacts.

**Steps:**

1. Application layer: checks all active buyer domains on create.
2. Database layer: unique index on `extract_domain(company_website)`.
3. CSV import: `dedupe-buyers` edge function with domain + fuzzy name matching.
4. Detection view: `v_duplicate_buyers` (should always be empty).
5. Resolution: SQL merge procedure re-points 20+ FK references.

**Expected output:** No active duplicates.

**Gaps/Issues:**

- Merge procedure is a SQL migration script — no admin "Merge Buyers" button.
- Application dedup fetches ALL buyers for domain scan — won't scale past 10K.
- No fuzzy name matching for manual creation (only CSV import has it).

---

### 2.5 Buyer Status Lifecycle

**Why:** Track buyers through stages from creation to active engagement.

Three simultaneous state machines:

- **Record-level:** Active (`archived=false`) / Archived (`archived=true`)
- **Introduction-level** (per deal): `need_to_show_deal` → `outreach_initiated` → `meeting_scheduled` → `fit_and_interested` / `not_a_fit`
- **Score-level** (per deal): `pending` → `approved` / `passed` / `hidden`

**Gaps/Issues:**

- No "inactive" or "do not contact" status. Archiving is the only way to remove.
- No firm-level relationship status (prospect, active, cold, past buyer).
- Schema drift: original migration and TypeScript types define different status sets.

---

### 2.6 Filtering and Searching Buyers

**Why:** Quickly narrow to relevant buyer subsets.

**Steps:**

1. Tab filtering: all, private_equity, corporate, needs_review, needs_agreements, unsigned_agreements, needs_pe_link.
2. Filter engine: Company Name, PE Firm, Buyer Type, HQ State, Geographic Footprint, Alignment Score, Fee Agreement, Thesis.
3. Universe filter dropdown.
4. Sorting on Company Name, PE Firm, Universe.
5. Pagination: 50 per page.

**Expected output:** Table updates instantly with filtered results.

**Gaps/Issues:**

- All filtering is client-side — fetches ALL buyers into memory.
- No saved filter presets.
- No filter on `buyer_tier`, `buyer_quality_score`, or `data_completeness`.
- No full-text search against thesis or business summary.

---

### 2.7 Bulk Operations

**Steps:** Checkboxes with shift-select. Available: Export CSV, Remove from Universe, Enrich All, Score Alignment, Push to Dialer, Push to Smartlead.

**Gaps/Issues:**

- Per-row delete is a **hard delete** (not soft delete/archive). Dangerous.
- No bulk type reassignment, bulk universe assignment, or bulk fee agreement marking.
- No undo/rollback for any bulk operation.

---

### 2.8 PE Firm Relationship System

**Why:** Link platform companies to parent PE firms for fee agreement inheritance and portfolio visibility.

**Steps:**

1. `parent_pe_firm_id` self-referencing FK. Max 1 level depth.
2. Triggers auto-set `parent_pe_firm_name` and `is_pe_backed`.
3. PE Link Queue for auto-matching.

**Gaps/Issues:**

- PE link queue and backfill review queue have tables but NO frontend admin UI.
- Fee agreement inheritance exists in tests but production cascade logic is unclear.

---

## 3. Buyer Discovery & Universe Building

### 3.1 External Tab (AI-Discovered PE-Backed Platforms)

**Why:** Discover buyers beyond SourceCo's existing pool — PE-backed platforms, niche funds, strategic acquirers.

**Steps:**

1. Navigate to a deal's Buyer Introductions page → "Recommended Buyers" tab.
2. `useNewRecommendedBuyers(listingId)` calls `score-deal-buyers` edge function.
3. Buyers split into Internal (marketplace/scored source) and External (`ai_seeded` source).
4. Click "AI Search Buyers" → `seed-buyers` edge function:
   - Fetches full deal context, checks `buyer_seed_cache` (90-day TTL).
   - Calls Claude Opus — returns up to 15 buyers per call with company info, thesis, relevance.
   - Deduplicates by domain, inserts with `ai_seeded=true`, `verification_status='pending'`.
   - Auto-creates PE firm parent records.
5. After seeding, scoring re-runs. Buyers appear with composite scores and fit reasons.

**Expected output:** 5-15 AI-discovered buyers per seed run, cached 90 days.

**Gaps/Issues:**

- `buyerCategory` parameter (sponsors vs operating_companies) supported in backend but **no UI to select** — dead code.
- `discover-companies` edge function exists (Google-powered) but NOT wired to any frontend.
- No cost tracking or budget cap on Claude Opus calls.
- `forceRefresh: true` is hardcoded — clicking always re-runs Claude, defeating the cache.
- No way to delete bad AI suggestions from the Recommended tab.

---

### 3.2 Unified Scoring Weights

**Why:** Standardized scoring ensures consistent buyer-deal evaluation.

**Steps:**

1. Fixed weights: Service 40%, Geography 30%, Size 20%, Bonus 10%.
2. Tiers: `move_now` (>=80 + fee agreement/aggressive), `strong` (>=60), `speculative` (rest).
3. Service scoring uses `SECTOR_SYNONYMS` for semantic matching.
4. `fit_reason` generated from AI seeding, thesis analysis, or scoring signals.

**Expected output:** Each buyer-deal pair has 0-100 composite score, four sub-scores, tier, and fit reason.

**Gaps/Issues:**

- **Weights are hardcoded.** The Universe Detail page has configurable weight sliders but they are **never used by the scoring pipeline**. This is the most significant architectural gap.
- `owner_goals_score` field exists but maps to `bonus_score` — no actual owner goals dimension.
- Synonym map is manually maintained — new industries won't match until someone adds them.

---

### 3.3 Building a Curated Buyer Universe

**Why:** Group buyers by vertical for systematic deal-buyer matching at scale.

**Steps:**

1. Flag deals via `universe_build_flagged_at` on `listings`.
2. Generate AI labels via `generate-buyer-universe` (Gemini).
3. Create universe with name, description, fit criteria, structured criteria, scoring weights, supporting docs.
4. Add buyers manually, via CSV import, or via AI search.
5. Add deals, then "Score All Deals" to queue scoring.

**Expected output:** Fully configured universe with scored buyers and deals.

**Gaps/Issues:**

- Universe-level configurable weights stored in DB but **never used by scoring pipeline**.
- Inconsistent AI providers: Gemini for labels, Claude Opus for seeding.
- Empty universes persist with no readiness indicator.
- No notification when scoring completes.

---

### 3.4 Reviewing and Approving/Rejecting Discovered Buyers

**Why:** Human review before contacting AI-suggested buyers.

**Steps:**

1. Click "Add to Pipeline" on buyer cards (single or batch).
2. Creates `buyer_introductions` record with `introduction_status: 'need_to_show_deal'` and `score_snapshot`.
3. Kanban board: To Introduce → Introduced (requires channel selection) → Interested → Passed (requires reason).
4. When status reaches `fit_and_interested`, auto-creates `deal_pipeline` entry, upserts contact, logs activity.

**Expected output:** Kanban board tracks all buyer introductions. Pipeline deals auto-created on fit confirmation.

**Gaps/Issues:**

- `fit_and_interested` status is irreversible — no confirmation dialog before auto-creating pipeline deal.
- `introduction_status_log` exists but no UI to view status change history.
- No bulk status changes — each buyer must be dragged individually.
- `IntroductionActivity` types defined but the feature is unimplemented.

---

### 3.5 Exporting a Buyer Universe

**Steps:**

1. Select buyers on All Buyers page → "Export CSV".
2. CSV includes: Company Name, Buyer Type, PE Firm, Website, Location, Thesis, Fee Agreement, NDA.

**Gaps/Issues:**

- Export only available from All Buyers page, not from within a specific universe.
- No composite scores, fit signals, or tier in export.
- No Excel (.xlsx) export option.

---

## 4. Referral Partners

### 4.1 Adding a Referral Partner

**Why:** Onboard individuals or firms who refer deal opportunities. Each gets a password-protected external portal.

**Steps:**

1. Navigate to `/admin/remarketing/leads/referrals`. Click "Add Partner".
2. Select Partner Type: "Person" or "Business".
3. Person: Name (required), LinkedIn, Email. Business: Company Name (required), Website, Contact Name, Email.
4. System auto-generates 12-char password, bcrypt-hashes it, inserts into `referral_partners`.
5. Toast shows plaintext password for 15 seconds.

**Profile fields:** id, name, company, email, phone, notes, deal_count, is_active, share_token, share_password_hash, share_password_plaintext, last_viewed_at, timestamps.

**Expected output:** Partner in list. Share URL available.

**Gaps/Issues:**

- `partner_type`, `linkedin`, `website`, `contact_name` collected in UI but **silently discarded** — never saved to DB.
- `phone` field missing from the Person form entirely.
- `share_password_plaintext` stored in the clear — security concern.
- Password displayed in toast for 15 seconds — if missed, must reset.

---

### 4.2 Linking a Partner to a Deal

Five distinct mechanisms:

1. **Manual from detail page** — `AddDealDialog` creates listing with `referral_partner_id`.
2. **CSV import** — `DealImportDialog` bulk-links.
3. **Partner submission via portal** — `ReferralSubmissionForm` inserts into `referral_submissions`.
4. **Partner CSV upload via portal** — Batch submissions (50/hour rate limit, 100/batch cap).
5. **Admin approval** — `approve-referral-submission` creates `listing` with `status='active'`.

**Gaps/Issues:**

- No partial approval workflow — all-or-nothing per submission.
- Approved submissions bypass `pending_referral_review` status, going straight to `active`.
- No notification to admins when partners submit new referrals.
- No link from approved submission to its resulting listing.

---

### 4.3 Fee / Commission Tracking

**Steps:** None exist.

**Gaps/Issues:**

- **Zero fee or commission tracking.** No fields for fee percentage, flat fee, commission structure, payment status, or payment history. This is a significant operational gap.

---

### 4.4 Partner Status Lifecycle

| Action     | Effect                                         |
| ---------- | ---------------------------------------------- |
| Create     | `is_active = true`                             |
| Deactivate | `is_active = false`, portal blocked            |
| Archive    | `is_active = false` AND `notes = '[ARCHIVED]'` |
| Delete     | Hard delete, cascades                          |

**Gaps/Issues:**

- **Archive destructively overwrites notes** with `'[ARCHIVED]'` — data loss bug.
- No soft-delete pattern — deletion is permanent.
- No "Archived" status distinct from "Inactive" in UI.
- Deactivation has no confirmation dialog.

---

### 4.5 External Partner Tracker Portal

**Why:** Self-service view for partners to see referral status and submit new ones.

**Steps:**

1. Partner visits `/referrals/{shareToken}`, enters password.
2. Sees: header with name/company, referrals table (listings + submissions), search/filters, CSV upload, single submission form.

**Gaps/Issues:**

- No session management — plaintext password held in React state for entire session.
- Data capped at 500 listings + 500 submissions with no warning.
- Quality scores and contact details visible to partner — potentially sensitive.
- No ability for partner to edit or withdraw a submission.

---

## 5. Marketplace Listings

### 5.1 Creating a Listing from a Deal

**Why:** Separate confidential deal data from the public-facing marketplace listing.

**Steps:**

1. Admin navigates to `/admin/marketplace/create-listing?fromDeal={dealId}`.
2. Deal data run through `anonymizeDealToListing()` — strips company names, contacts, PII.
3. AI content auto-triggers: `generate-lead-memo` edge function with `memo_type: 'anonymous_teaser'`.
4. Admin reviews/edits in `ImprovedListingEditor`.
5. On save, new `listings` row with `is_internal_deal: true` and `source_deal_id`.

**Expected output:** Draft listing linked to source deal, anonymized content.

**Gaps/Issues:**

- AI generation requires a `full_memo` PDF to exist. If missing, silently fails.
- Anonymizer's regex stripping is fragile — short company names could cause false positives.
- `source_deal_id` linkage is one-way — source deal has no column pointing to its marketplace listing.

---

### 5.2 The Rich Text Editor (5 Sections)

1. **Company Overview** (internal card) — deal identifier, internal company name, deal owner, marketplace fields (title, geography, type, industry, team size, contact, status, visibility).
2. **Financial Card** — Revenue, EBITDA (locked when source deal linked), auto-calculated margin.
3. **Visuals** — Featured image upload.
4. **Hero Description** — Short teaser (max 500 chars).
5. **Body Description** — Rich text editor with HTML, JSON, and plain text representations.
6. **Live Preview** — Quality score (7 criteria, 0-100%) + card preview.

**Gaps/Issues:**

- "Generate with AI" buttons on Hero and Body sections are **dead code** — `onAiGenerate` is never passed, `isGenerating` hardcoded to `false`.
- Quality score criteria differ from the actual publishing gate — creates false confidence.
- Custom metrics (metric 3, metric 4) have no editor UI — only populated from anonymizer.

---

### 5.3 AI Auto-Generation of Listing Content

**Why:** AI produces structured, anonymized teaser content from deal data and transcripts.

**Steps:**

1. Auto-triggered during listing creation when `custom_sections` is empty.
2. Calls `generate-lead-memo` with `memo_type: 'anonymous_teaser'`.
3. Requires `full_memo` PDF in `data_room_documents`.
4. Builds context from deal, transcripts (up to 10, 25K chars each), valuations, enrichment.
5. Claude Sonnet generates sections: Business Overview, Deal Snapshot, Key Facts, Growth Context, Owner Objectives.
6. Post-processing: banned word removal, anonymization enforcement, section validation (retries up to 3x).

**Expected output:** AI content populates listing description with structured sections.

**Gaps/Issues:**

- If full memo PDF doesn't exist, generic toast shown — no retry mechanism.
- `enforceAnonymization` replaces state abbreviations globally, could break non-geographic 2-letter codes.
- Title "AI Generate" button uses a simple client-side function, not an LLM call.

---

### 5.4 The Publishing Gate (9 Requirements)

**Requirements:**

1. Title >= 5 characters
2. Description >= 50 characters
3. At least one category
4. Location present
5. Revenue > 0
6. EBITDA present (number type)
7. Image URL present and non-empty
8. Lead Memo PDF exists in `data_room_documents`
9. Teaser PDF exists in `data_room_documents`

**Gaps/Issues:**

- No `hero_description` validation — landing page header could be empty.
- No `internal_company_name` check — no internal tracking.
- No `primary_owner_id` check — published listings without an owner.
- No `visible_to_buyer_types` check — listing could be visible to nobody.
- Teaser PDF must be manually uploaded — no auto-generation from AI teaser content.

---

### 5.5 Publishing / Unpublishing

**Publishing steps:** Click "Publish to Marketplace" → edge function validates → sets `is_internal_deal = false`, `published_at`, `status = 'active'`.

**Unpublishing steps:** Click "Remove from Marketplace" → sets `is_internal_deal = true`. Preserves `published_at` for audit.

**Gaps/Issues:**

- No confirmation dialog for either action.
- No "schedule publish" feature.
- Publishing forces `status = 'active'` unconditionally — could resurrect deactivated listings.
- No deal alert trigger on publish — alerts fire on listing creation (when invisible), not publication.
- Unpublish doesn't warn about active buyer connections.

---

### 5.6 Editing a Published Listing

**Steps:** Edit via `ListingForm` (legacy), modify fields, save. Changes go live immediately.

**Gaps/Issues:**

- **No re-validation on edit.** Published listings can be edited to violate the publishing gate.
- No "save as draft" vs "save and publish" distinction.
- Edit flow uses legacy `ListingForm`, not `ImprovedListingEditor` — fewer features.
- Financial edits on source deal do NOT propagate to marketplace listing — no sync mechanism.

---

### 5.7 Listing Status Lifecycle

```
DRAFT (is_internal=true) → PUBLISHED (is_internal=false, published_at set) → UNPUBLISHED (is_internal=true, published_at retained)
```

Orthogonal: `status: 'active' | 'inactive'` operates independently.

**Gaps/Issues:**

- Two independent visibility dimensions + soft delete, but UI presents as single state.
- Publishing forces `status='active'` but unpublishing doesn't change it — asymmetry.
- Marketplace query requires `image_url IS NOT NULL` — hidden third visibility condition.

---

## 6. Landing Pages & Buyer Experience

### 6.1 Anonymous Deal Landing Page

**Why:** Top-of-funnel entry point for deal-specific outbound campaigns.

**Steps:**

1. Buyer navigates to `/deals/:id` (public, no auth required).
2. Data fetched from `listings` table — ~30 fields.
3. Text run through `stripIdentifyingInfo()`.
4. Renders: LandingHeader, DealHero, MetricsStrip, ContentSections, DealRequestForm, DealSidebar, RelatedDeals, EmailCapture.
5. Page view tracked in `page_views` table with session dedup.

**Expected output:** Anonymized deal page with financials, description, CTAs — no login required.

**Gaps/Issues:**

- **No status gating.** Inactive/sold/draft listings render identically to active ones.
- **`internal_company_name` and `website` exposed in browser network tab** — information leak.
- **No OG/meta tags** for social sharing.
- **No mobile hamburger menu** — nav items hidden on mobile with no replacement.

---

### 6.2 NDA Execution via DocuSeal (NOT PandaDoc)

**Why:** NDA required before full deal content access. Platform uses **DocuSeal**, not PandaDoc.

**Steps:**

1. Authenticated buyer on `/listing/:id` triggers `useBuyerNdaStatus()` check.
2. If firm exists but NDA unsigned → `NdaGateModal` renders (full-screen, non-dismissible).
3. Modal calls `get-buyer-nda-embed` edge function → creates or retrieves DocuSeal submission.
4. DocuSeal signing form embedded inline via `@docuseal/react`.
5. On completion → `confirm-agreement-signed` called → caches invalidated → modal dismisses.

**Expected output:** Full-screen DocuSeal NDA form. After signing, listing content revealed. Firm-level — one signature covers all members.

**Gaps/Issues:**

- NDA is per-firm, not per-deal — single NDA covers all platform deals.
- No NDA on the anonymous landing page — only on authenticated listing detail.
- NDA signing does NOT immediately unlock confidential content — real content gated behind connection request approval.

---

### 6.3 Post-NDA Content Unlock

**Three disclosure tiers:**

1. **Anonymous teaser** (landing page `/deals/:id`) — anonymized, no NDA required.
2. **Authenticated listing** (`/listing/:id`) — same content + engagement tools. NDA modal dismissed.
3. **Post-approval** (connected buyer) — blurred section removed, data room access if admin-granted.

**Gaps/Issues:**

- **NDA signing doesn't unlock additional content.** Buyer experience unchanged except modal disappears.
- **Approved buyers don't see company name** — `InternalCompanyInfoDisplay` is admin-only.
- **Executive Summary URL publicly downloadable** without NDA check — confidentiality risk.
- **Email captures promise alerts that don't exist** in the codebase.

---

### 6.4 Buyer Interest Submission

**Anonymous (landing page):**

1. Fill DealRequestForm (Name, Email, Company, Phone, Role, Message).
2. Inserts into `connection_requests` with `source='landing_page'`.

**Authenticated (marketplace):**

1. Fee agreement gate checked first.
2. ConnectionRequestDialog with AI-assisted pitch drafting (min 20 chars).
3. Calls `enhanced_merge_or_create_connection_request` RPC for dedup.
4. Triggers emails, quality scoring, journey tracking.

**Gaps/Issues:**

- **No spam protection** on anonymous form — no CAPTCHA or rate limiting.
- **Anonymous submissions don't trigger admin email notifications.**
- **No duplicate detection** for anonymous submissions.
- **No explicit `source` field** set on authenticated submissions.

---

### 6.5 How Interest Surfaces Internally

**Steps:**

1. Email notifications via `send-connection-notification`.
2. Real-time badge counts via `useUnviewedConnectionRequests`.
3. Admin notification bell with popover.
4. Connection Requests Table with filters.
5. Landing Page Analytics (views, submissions, captures, conversion rate).

**Gaps/Issues:**

- **Landing page submissions do NOT trigger email notifications** — admins only see them in the requests table.
- **No push notifications or Slack integration.**
- **Landing page analytics are count-only** — no time series, UTM breakdown, or referrer analysis.

---

## 7. Email Program & Buyer Outreach

### 7.1 Complete Email Inventory

The platform has **32+ email-sending edge functions** and **21 template types** in the centralized registry. Key emails:

| #   | Email Type                  | Trigger                              | Provider     |
| --- | --------------------------- | ------------------------------------ | ------------ |
| 1   | Approval (2 versions)       | Admin approves buyer                 | Brevo        |
| 2   | Marketplace Invitation      | Admin invites external contact       | Resend       |
| 3   | NDA Email (with attachment) | Admin sends NDA                      | Brevo        |
| 4   | NDA Reminder (3-day, 7-day) | Cron job                             | Brevo        |
| 5   | Fee Agreement Email         | Admin sends fee agreement            | Brevo        |
| 6   | Fee Agreement Reminder      | Cron job                             | Brevo        |
| 7   | Deal Alert                  | Listing matches buyer criteria       | Brevo        |
| 8   | Connection Notification     | Buyer submits connection request     | Brevo        |
| 9   | Memo Distribution           | Admin emails lead memo               | Brevo        |
| 10  | Owner Intro Notification    | Admin introduces buyer to owner      | Brevo        |
| 11  | Task Notification           | Task assigned                        | Brevo        |
| 12  | Password Reset              | User requests reset                  | Brevo        |
| 13  | User Journey (4 stages)     | Signup → Verify → Approve/Reject     | Brevo        |
| 14  | Admin Digest                | Daily/weekly aggregation             | Brevo        |
| 15  | AI-Drafted Outreach         | Admin requests draft (does NOT send) | N/A (Gemini) |
| 16  | Data Recovery               | Admin sends to affected users        | Resend       |

---

### 7.2 Email Test Centre

**Steps:** Admin clicks "Send Test Email" → sends one test `send-user-notification` email to own address.

**Gaps/Issues:**

- Only tests ONE email type.
- No dedicated test page — single button component.
- No preview/render of email HTML before sending.
- Cannot test with different template variables.

---

### 7.3 Bulk Outreach

**SmartLead:** Campaign CRUD, lead push, multi-step sequences, stats tracking. Proxy-only — no native campaign builder.

**HeyReach:** LinkedIn outreach campaigns, lead push, stats sync. Same proxy pattern.

**Gaps/Issues:**

- No native sequence builder in the SourceCo platform.
- No integration between SmartLead and HeyReach for multi-channel orchestration.
- SmartLead/HeyReach replies do NOT update buyer introduction pipeline status.

---

### 7.4 Email Engagement Tracking

**Gaps/Issues:**

- Brevo open tracking enabled but **data does NOT flow back** to SourceCo DB.
- Click tracking intentionally disabled (`trackClicks: false`).
- `email_engagement` signal type exists (10 pts) but never auto-populated.
- SmartLead stats are campaign-level only, not per-buyer.

---

### 7.5 Managing Unsubscribes

**Gaps/Issues:**

- **No unified unsubscribe list.** SmartLead unsubscribes don't propagate to Brevo.
- **No unsubscribe link in transactional email templates.**
- **No `unsubscribed` flag** on buyers or contacts table.
- **CAN-SPAM compliance risk** for deal alerts and memo distributions.

---

### 7.6 Cross-Cutting Email Gaps

1. **Provider fragmentation:** 30+ functions use Brevo, 2 use Resend. Split sender reputation.
2. **Consolidation incomplete:** `send-transactional-email` designed to replace all 32 functions — migration stalled.
3. **Retry logic inconsistent:** `sendViaBervo()` has 3-retry backoff, but 6+ functions call Brevo directly without retry.
4. **AI draft disconnected from send:** `draft-outreach-email` generates content but no "review and send" integration.
5. **Duplicate code:** `send-nda-email` and `send-fee-agreement-email` are nearly identical (500+ lines each).

---

## 8. Admin & System Config

### 8.1 User Roles and Permissions

**Role Hierarchy:**
| Role | Weight | Capabilities |
|------|--------|-------------|
| owner | 4 | Full system access. Single hardcoded user. |
| admin | 3 | Full admin. Can assign moderator. |
| moderator | 2 | "Team Member". Read + limited mutations. Gets `is_admin=true`. |
| viewer | 1 | Read-only. Cannot mutate. |

**Gaps/Issues:**

- Owner role hardcoded to single email (`ahaile14@gmail.com`) — no transfer mechanism.
- `viewer` role cannot be assigned from invite dialog.
- `usePermissions()` capability checks don't match `<RoleGate>` enforcement in several places.
- `PAGE_PERMISSIONS` map and actual `<RoleGate>` usage maintained separately — no runtime linking.

---

### 8.2 Inviting Team Members

**Steps:** Admin → Settings → Team → "Invite Team Member" → email, name, role → creates auth user, profile, role, magic link.

**Gaps/Issues:**

- No custom invitation email template — uses Supabase default magic link.
- No bulk invite capability.
- No invitation expiry or revocation mechanism.

---

### 8.3 MFA / Two-Factor Authentication

**Steps:** Settings → Security → Enable MFA → scan QR → verify TOTP code.

**Gaps/Issues:**

- MFA is opt-in per user. No admin toggle to require MFA for all team members.
- No recovery codes generated during enrollment.
- Only TOTP supported — no WebAuthn/FIDO2.

---

### 8.4 Feature Flags

All flags hardcoded in `src/config/app.ts`: `remarketing`, `realTimeAnalytics`, `buyerEnrichment`, `dataRoom`, `dealAlerts`, `mfaPrompt` — all `true`.

**Gaps/Issues:**

- No admin UI to toggle flags. Requires code deployment.
- `app_settings` DB table exists but is underutilized (only 1 setting).

---

### 8.5 System Health & Error Visibility

**Steps:**

1. Analytics Health Dashboard: checks 5 tables for data freshness (healthy/warning/error).
2. Error logging: `ErrorManager` → toasts + `user_activity` table entries.
3. System Test Runner: 9+ test suites runnable from `/admin/testing`.

**Gaps/Issues:**

- Error logs written to `user_activity` (mixed with normal activity) — no dedicated `error_logs` table.
- No admin UI to view error logs.
- No error aggregation, trending, or alerting.
- Errors from unauthenticated pages are lost.
- No environment indicator (staging vs production) in admin panel.

---

### 8.6 Integration Settings

- **Smartlead:** Connection status, campaign sync, webhook URL display. No API key management UI.
- **PhoneBurner:** Session stats, connected users, manual token entry. No test connection.
- **Fireflies:** Transcript stats, auto-pair, bulk sync. No API key configuration UI.
- **Webhooks:** Custom webhook endpoints with event type filtering. Uses `as any` casting — no type safety.

---

## 9. End-to-End Deal Lifecycle

### Step 1: Deal Created

Internal listing created → `is_internal_deal = true`, not visible on marketplace.
**Gap:** No required owner. No duplicate deal detection on company name.

### Step 2: Deal Details Populated

Manual entry + AI enrichment (website scraping, LinkedIn, Google reviews). Deal scoring computes `deal_total_score`.
**Gap:** No "readiness" indicator. Enrichment completion has no notification.

### Step 3: Buyer Universe Built

Universe created manually. Buyers added via AI discovery, manual add, or CSV. Buyers scored per deal.
**Gap:** No automatic universe creation from deal data. Scoring not triggered automatically for new buyers.

### Step 4: Marketplace Listing Created

`anonymizeDealToListing()` strips PII. New listing linked via `source_deal_id`.
**Gap:** No bidirectional link. Financial data not synced.

### Step 5: Content Authored

AI generates teaser from transcripts + deal data. Admin reviews/edits. PDFs uploaded.
**Gap:** Memo generation and listing content are disconnected — manual sync required.

### Step 6: Publishing Gate Satisfied

9 requirements checked. All must pass.
**Gap:** No hero_description or owner assignment validation.

### Step 7: Listing Published

`is_internal_deal = false`, `published_at` set, `status = 'active'`.
**Gap:** Landing page has NO `is_internal_deal` filter — drafts accessible by UUID. Deal alerts fire on creation, not publication.

### Step 8: Buyer Outreach Sent

Introduce via Kanban pipeline, AI email drafts, SmartLead/HeyReach campaigns.
**Gap:** No automatic outreach trigger. SmartLead/HeyReach replies don't update introduction pipeline.

### Step 9: Buyer Views Landing Page

Anonymous page with anonymized content, tracked via `page_views`.
**Gap:** `internal_company_name` exposed in network tab. No auth check — any UUID accessible.

### Step 10: Buyer Signs NDA

DocuSeal embedded signing. Firm-level NDA.
**Gap:** Landing page leads have no user account link. NDA tracked at 3 separate levels (profile, firm, lead).

### Step 11: CIM / Full Content Delivered

Admin approves connection → grants data room access manually.
**Gap:** Fee agreement gate is client-side only. No auto-access on approval. No buyer notification on access grant.

### Step 12: Buyer Expresses Interest

Admin moves buyer to "Fit & Interested" → auto-creates pipeline deal.
**Gap:** Marketplace connection requests do NOT auto-create pipeline deals. Double-entry risk between marketplace and remarketing paths.

### Step 13: Interest Surfaces Internally

Admin notifications (email + in-app), pipeline view, activity log.
**Gap:** No push notifications. No SLA tracking on unreviewed requests.

### Step 14: Deal Moves Through Stages

Drag-and-drop Kanban. Ownership checks. Owner intro notification on specific stage.
**Gap:** No stage transition rules. No automatic NDA/fee checks on progression.

### Step 15: Deal Closed

Move to Closed Won / Closed Lost stage.
**Gap:** No close reason required. No post-close buyer notification. Listing remains active on marketplace. Buyer introductions not updated.

---

### Critical Handoff Gaps (Data That Should Flow Automatically But Doesn't)

| #   | Gap                                              | Impact                                               |
| --- | ------------------------------------------------ | ---------------------------------------------------- |
| 1   | Landing page lead → user account                 | Anonymous submissions orphaned on signup             |
| 2   | Deal creation → buyer universe                   | No auto-link to matching universe                    |
| 3   | Marketplace connection request → pipeline deal   | Manual pipeline deal creation required               |
| 4   | Listing publication → deal alerts                | Alerts fire on creation (invisible), not publication |
| 5   | SmartLead/HeyReach replies → buyer introductions | Outreach responses not reflected in pipeline         |
| 6   | NDA signature → pipeline deal NDA status         | Firm NDA doesn't propagate to individual deals       |
| 7   | Fee agreement → data room access                 | Signing doesn't auto-grant document access           |
| 8   | Source deal financials → marketplace listing     | Financial data diverges silently                     |
| 9   | Pipeline deal close → listing status             | Closed deals remain active on marketplace            |
| 10  | Pipeline deal close → buyer introduction status  | Buyers stuck in "Fit & Interested" indefinitely      |
| 11  | Connection approval → teaser access              | Approval doesn't auto-grant data room view           |
| 12  | Buyer quality score → pipeline deal priority     | Quality score never updates deal priority            |
| 13  | Internal company name → landing page query       | Real name in browser network payload                 |
| 14  | Remarketing buyer → marketplace firm             | Link only created during conversion, not before      |

---

## 10. Master Gap Registry

### Critical (Data Loss / Security / Compliance)

| ID   | Area         | Gap                                                                  |
| ---- | ------------ | -------------------------------------------------------------------- |
| C-1  | Landing Page | `internal_company_name` and `website` exposed in browser network tab |
| C-2  | Landing Page | No `is_internal_deal` filter — draft listings accessible by UUID     |
| C-3  | Landing Page | Executive Summary URL publicly downloadable without NDA              |
| C-4  | Email        | No unified unsubscribe list — CAN-SPAM compliance risk               |
| C-5  | Referral     | `share_password_plaintext` stored in database                        |
| C-6  | Referral     | Archive destructively overwrites `notes` field                       |
| C-7  | Buyer        | Per-row delete is a hard delete — no soft delete/archive             |
| C-8  | Admin        | Owner role hardcoded to single email — no transfer mechanism         |
| C-9  | Admin        | "Clear Analytics Data" has no role check beyond admin                |
| C-10 | Auth         | Hardcoded Supabase fallback credentials could mask misconfiguration  |

### High (Broken Flows / Missing Automation)

| ID   | Area      | Gap                                                                   |
| ---- | --------- | --------------------------------------------------------------------- |
| H-1  | Discovery | Universe weight sliders exist but scoring pipeline ignores them       |
| H-2  | Listings  | "Generate with AI" buttons are dead code                              |
| H-3  | Listings  | Published listings can be edited to violate publishing gate           |
| H-4  | Listings  | Deal alerts fire on creation, not publication                         |
| H-5  | Pipeline  | 3 automations depend on hardcoded stage name strings                  |
| H-6  | Pipeline  | No stage transition rules — any deal can jump to any stage            |
| H-7  | Pipeline  | 10 deactivated stages leave deals in limbo                            |
| H-8  | Email     | Consolidation to `send-transactional-email` is stalled — 32 functions |
| H-9  | Email     | Brevo open/click data doesn't flow back to DB                         |
| H-10 | Lifecycle | Marketplace connection requests don't auto-create pipeline deals      |
| H-11 | Lifecycle | Source deal financial changes don't sync to marketplace listing       |
| H-12 | Lifecycle | Pipeline close doesn't update listing status or buyer introductions   |
| H-13 | Landing   | Anonymous form submissions don't trigger admin email notifications    |
| H-14 | Landing   | No spam protection on anonymous form                                  |

### Medium (UX / Efficiency)

| ID   | Area     | Gap                                                                      |
| ---- | -------- | ------------------------------------------------------------------------ |
| M-1  | Buyer    | All filtering is client-side — won't scale past 10K                      |
| M-2  | Buyer    | No tags/labels system                                                    |
| M-3  | Buyer    | No merge UI for duplicates (SQL-only)                                    |
| M-4  | Buyer    | Two disconnected scoring systems                                         |
| M-5  | Referral | No fee/commission tracking                                               |
| M-6  | Referral | `partner_type`, `linkedin`, `website`, `contact_name` silently discarded |
| M-7  | Listings | Quality score criteria differ from publishing gate                       |
| M-8  | Listings | Admin previews inflate landing page view counts                          |
| M-9  | Pipeline | No SLA tracking on review times                                          |
| M-10 | Pipeline | @mention notifications unimplemented                                     |
| M-11 | Email    | AI draft disconnected from send flow                                     |
| M-12 | Email    | Retry logic inconsistent across 32 functions                             |
| M-13 | Admin    | No admin UI to view error logs                                           |
| M-14 | Admin    | Feature flags hardcoded — no runtime toggle                              |
| M-15 | Admin    | Form monitoring uses synthetic/estimated data                            |
| M-16 | Deal     | "Deal" means two different things (`deal_pipeline` vs `listings`)        |
| M-17 | Scoring  | Financial normalization: $500 becomes $500M                              |
| M-18 | Landing  | No mobile navigation menu                                                |
| M-19 | Landing  | Email captures promise alerts that don't exist                           |
| M-20 | Admin    | No environment indicator (staging vs production)                         |

---

_Audit completed 2026-03-22. All findings based on direct source code analysis._
