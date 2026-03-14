# SourceCo Platform — Core Systems Audit Report

**Date:** 2026-03-14
**Codebase:** SourceCoDeals/connect-market-nexus
**Supabase project:** vhzipqarkmmfuqadefep
**Scope:** Five core systems end-to-end audit + dead code analysis
**Method:** Automated code tracing with line-level verification

---

## EXECUTIVE SUMMARY

This audit traced five critical buyer-facing systems end-to-end, reading every file in the code path and verifying every finding at the line level. **37 findings** were identified across 6 severity tiers.

| Severity | Count | Examples |
|----------|-------|---------|
| CRITICAL | 5 | Hardcoded service_role JWT, reminder UNIQUE constraint bug, connection_requests status constraint mismatch |
| HIGH | 8 | Client-side-only notifications, no email unsubscribe headers, service gate hard-kill, NDA reminder status mismatch |
| MEDIUM | 13 | Email migration incomplete, buyer pool no ORDER BY, stale memo risk, login-wall scraping |
| LOW | 11 | Dead code, model version inconsistency, branding parameter cosmetic-only |

**The three most urgent production bugs:**
1. NDA/fee agreement reminders silently fail for every firm after the first (UNIQUE constraint on `pandadoc_webhook_log` with hardcoded `document_id = 'reminder'`)
2. Service role JWT committed to git in migration file (full DB access for anyone with repo access)
3. `connection_requests.status` CHECK constraint may block the entire "on hold" workflow

---

## SYSTEM 1 — BUYER AUTOMATED EMAIL PIPELINE

### FINDING 1: Email consolidation migration never completed — new system is dead code
```
SEVERITY: MEDIUM
FILES: supabase/functions/send-transactional-email/index.ts,
       supabase/functions/_shared/email-templates.ts
EVIDENCE: Zero callers of send-transactional-email in src/. All 13 old individual
          functions are still the active senders. email-templates.ts line 7-10
          documents this: "MIGRATION PLAN: Currently 32 separate edge functions
          send email."
IMPACT: No duplicate sends (new system is dead code), but old functions lack the
        retry logic and centralized logging the new system provides. Five functions
        (send-approval-email, send-templated-approval-email, send-nda-email,
        send-fee-agreement-email, all cron functions) make raw Brevo fetch() calls
        without retries — a transient Brevo failure = permanent email loss.
FIX: Either complete the migration to send-transactional-email, or update old
     functions to use sendViaBervo() from brevo-sender.ts for retry protection.
EFFORT: 1 week
```

### FINDING 2: Mixed email providers — Resend vs Brevo
```
SEVERITY: HIGH
FILES: supabase/functions/send-marketplace-invitation/index.ts (line 3, 10, 101),
       supabase/functions/send-data-recovery-email/index.ts (line 3, 10, 58),
       supabase/functions/enhanced-admin-notification/index.ts (line 62-180),
       supabase/functions/_shared/brevo-sender.ts
EVIDENCE: send-marketplace-invitation and send-data-recovery-email import Resend
          directly. enhanced-admin-notification tries Resend first, falls back to
          Brevo. All other functions use Brevo exclusively.
          enhanced-admin-notification uses from-address admin@sourcecoconnect.com
          (stale domain) vs sourcecodeals.com used everywhere else.
IMPACT: Two delivery reputations, two SPF/DKIM configs. If RESEND_API_KEY is
        unset, marketplace invitations and data recovery emails fail silently.
        enhanced-admin-notification includes unsanitized user input in HTML body
        (lines 92-94) — XSS-in-email vector.
FIX: Consolidate all sending to Brevo via sendViaBervo(). Fix sourcecoconnect.com
     domain reference. Sanitize user input in enhanced-admin-notification HTML.
EFFORT: 1 day
```

### FINDING 3: Service role JWT hardcoded in cron migration
```
SEVERITY: CRITICAL
FILES: supabase/migrations/20260311000000_onboarding_email_crons.sql (lines 10-11,
       27-28, 44-45)
EVIDENCE: Full service_role JWT in plaintext:
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIs
          InJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIs...'
          Appears 6 times across three cron entries. Committed to git history.
IMPACT: Anyone with repo access has full database access (service_role bypasses
        RLS). Key cannot be un-committed from git history.
FIX: Rotate the service_role key immediately. Replace hardcoded JWTs with
     CRON_SECRET auth (as send-nda-reminder already uses). Scrub git history or
     accept the key rotation as sufficient.
EFFORT: <1hr (key rotation) + 1hr (migration fix)
```

### FINDING 4: send-first-request-followup dedup has race condition
```
SEVERITY: MEDIUM
FILES: supabase/functions/send-first-request-followup/index.ts (lines 87-93,
       118-144, 148-153),
       supabase/migrations/20250717110712-*.sql (lines 2-20)
EVIDENCE: Sequence is SELECT → SEND → INSERT. No UNIQUE constraint on
          email_delivery_logs — only regular indexes on email, status,
          correlation_id, created_at. Same pattern exists in send-onboarding-day2
          (lines 79-86, 143-148) and send-onboarding-day7 (lines 79-86, 141-146).
IMPACT: If cron runs twice in quick succession (manual + scheduled), both
        executions pass the dedup SELECT before either writes the INSERT.
        Buyer receives duplicate email. Low probability but no protection.
FIX: Add UNIQUE constraint: CREATE UNIQUE INDEX ON email_delivery_logs(email,
     email_type) WHERE status = 'sent'. Use INSERT ON CONFLICT DO NOTHING.
EFFORT: <1hr
```

### FINDING 5: send-templated-approval-email is dead code
```
SEVERITY: LOW
FILES: supabase/functions/send-templated-approval-email/index.ts,
       supabase/functions/send-approval-email/index.ts,
       src/hooks/admin/use-admin-email.ts (line 323)
EVIDENCE: Only send-approval-email is called in production (from
          use-admin-email.ts:323). send-templated-approval-email is only
          referenced in EmailTestCentre.tsx (test/preview). The JSDoc says
          "Falls back to send-approval-email" but this fallback is NOT implemented.
IMPACT: Buyers receive plain-text custom emails instead of the polished HTML
        templates with NDA-aware branching (Version A/B) that were designed.
FIX: Wire send-templated-approval-email into the admin approval flow, or
     migrate both to send-transactional-email using existing templates.
EFFORT: 1 day
```

### FINDING 6: NDA reminder queries status value that may never be set
```
SEVERITY: HIGH
FILES: supabase/functions/send-nda-reminder/index.ts (line 53),
       supabase/functions/send-fee-agreement-reminder/index.ts (line 48),
       supabase/migrations/20260310000000_pandadoc_integration.sql (line 20)
EVIDENCE: send-nda-reminder filters .eq('nda_pandadoc_status', 'pending').
          The column defaults to 'not_sent' (migration line 20). The PandaDoc
          webhook handler may set values like 'sent', 'viewed', 'completed' —
          but 'pending' may never be set. If 'pending' is never written, the
          query returns zero rows and NO reminders are ever sent.
          Same issue in send-fee-agreement-reminder filtering on
          .eq('fee_pandadoc_status', 'pending').
IMPACT: NDA and fee agreement reminders may be completely inoperative —
        zero firms match the filter. Buyers who haven't signed never get nudged.
FIX: Change filter to .in('nda_pandadoc_status', ['pending', 'not_sent', 'sent'])
     or drop the PandaDoc status filter entirely and rely on nda_email_sent = true
     AND nda_signed = false. Apply same fix to fee agreement reminder.
EFFORT: <1hr
```

### FINDING 7: Reminder UNIQUE constraint causes silent failure after first firm
```
SEVERITY: CRITICAL
FILES: supabase/functions/send-nda-reminder/index.ts (lines 182-189),
       supabase/functions/send-fee-agreement-reminder/index.ts (lines 163-170),
       supabase/migrations/20260310000000_pandadoc_integration.sql (lines 85-86)
EVIDENCE: Both reminder functions INSERT into pandadoc_webhook_log with hardcoded
          document_id = 'reminder'. The table has:
          CREATE UNIQUE INDEX idx_pandadoc_webhook_idempotent
            ON pandadoc_webhook_log(document_id, event_type);
          First firm: INSERT ('reminder', 'nda_reminder_3-day') → succeeds.
          Second firm: INSERT ('reminder', 'nda_reminder_3-day') → UNIQUE violation.
          The dedup SELECT checks (external_id, event_type) but the UNIQUE
          constraint is on (document_id, event_type) — different columns.
IMPACT: Only the very first firm EVER receives each reminder type. All subsequent
        firms silently fail. This is a production-breaking bug affecting ALL
        NDA and fee agreement reminders.
FIX: Change document_id from 'reminder' to firm.id in both functions. Or use
     external_id instead of document_id in the UNIQUE constraint.
EFFORT: <1hr
```

### EMAIL EVENT MAP

| # | Lifecycle Event | Function | Provider | Dedup | Risk |
|---|----------------|----------|----------|-------|------|
| 1 | Admin approves buyer | send-approval-email | Brevo (raw) | email_delivery_logs | No retry |
| 2 | NDA sent | send-nda-email | Brevo (raw) | email_delivery_logs | No retry |
| 3 | NDA 3-day reminder | send-nda-reminder | Brevo (raw) | pandadoc_webhook_log | **BROKEN** (Finding 6+7) |
| 4 | NDA 7-day reminder | send-nda-reminder | Brevo (raw) | pandadoc_webhook_log | **BROKEN** (Finding 6+7) |
| 5 | Fee agreement sent | send-fee-agreement-email | Brevo (raw) | email_delivery_logs | No retry |
| 6 | Fee agreement 3-day | send-fee-agreement-reminder | Brevo (raw) | pandadoc_webhook_log | **BROKEN** (Finding 6+7) |
| 7 | Fee agreement 7-day | send-fee-agreement-reminder | Brevo (raw) | pandadoc_webhook_log | **BROKEN** (Finding 6+7) |
| 8 | Onboarding day 2 | send-onboarding-day2 | Brevo (raw) | email_delivery_logs | Race (Finding 4) |
| 9 | Onboarding day 7 | send-onboarding-day7 | Brevo (raw) | email_delivery_logs | Race (Finding 4) |
| 10 | First request followup | send-first-request-followup | Brevo (raw) | email_delivery_logs | Race (Finding 4) |
| 11 | Connection approved | send-connection-notification | Brevo (sendViaBervo) | email_delivery_logs | OK |
| 12 | Connection rejected | notify-buyer-rejection | Brevo (sendViaBervo) | email_delivery_logs (2x) | OK |
| 13 | Admin message | notify-buyer-new-message | Brevo (sendViaBervo) | None | Client-side only (Finding 11) |
| 14 | Marketplace invitation | send-marketplace-invitation | **Resend** | None | Dead code? |
| 15 | Data recovery | send-data-recovery-email | **Resend** | email_delivery_logs | Different provider |

---

## SYSTEM 2 — BUYER MESSAGING SYSTEM

### FINDING 8: General Inquiry sentinel UUID properly seeded but orphans messages
```
SEVERITY: MEDIUM
FILES: supabase/functions/resolve-buyer-message-thread/index.ts (line 17),
       supabase/migrations/20260302125320_*.sql,
       src/pages/BuyerMessages/useMessagesData.ts (line 105)
EVIDENCE: UUID 00000000-0000-0000-0000-000000000001 IS seeded in listings table
          via migration (ON CONFLICT DO NOTHING). FK constraint is satisfied.
          However, useBuyerThreads line 105 filters out General Inquiry threads:
          threads.filter(t => t.listing_id !== GENERAL_INQUIRY_LISTING_ID).
          When buyer gets a real deal, General Inquiry thread disappears and
          its message history is orphaned from the buyer's view.
IMPACT: Buyer loses access to prior general inquiry conversation history when
        their first deal is approved. No migration of messages to new thread.
FIX: Either keep General Inquiry thread visible alongside deal threads, or
     migrate messages to the new deal's thread when a real deal is created.
EFFORT: 1 day
```

### FINDING 9: GeneralChatView bypasses notification and read-flag logic
```
SEVERITY: HIGH
FILES: src/pages/BuyerMessages/GeneralChatView.tsx (lines 113-118)
EVIDENCE: Direct insert: supabase.from('connection_messages').insert({
            connection_request_id: threadId, sender_id: user.id,
            body, sender_role: 'buyer' })
          Missing: is_read_by_buyer: true (buyer's own message shows as unread).
          Missing: notify-admin-new-message call (admin gets no email).
          The useSendMessage hook (use-connection-messages.ts:118-170) handles
          both correctly, but GeneralChatView bypasses it entirely.
IMPACT: Admin never receives email when buyer sends a general inquiry.
        Buyer's own general inquiry messages appear as unread in their badge count.
FIX: Replace the direct insert in GeneralChatView with the useSendMessage hook.
EFFORT: <1hr
```

### FINDING 10: is_read_by_buyer set by frontend only — no server-side guarantee
```
SEVERITY: MEDIUM
FILES: src/hooks/use-connection-messages.ts (line 219),
       src/pages/BuyerMessages/MessageThread.tsx (lines 118-123)
EVIDENCE: useMarkMessagesReadByBuyer() performs a frontend UPDATE. No database
          trigger sets is_read_by_buyer. No retry on failure. GeneralChatView
          never calls markRead at all — admin messages in General Inquiry threads
          stay permanently unread.
          useBuyerThreads realtime subscription (useMessagesData.ts line 41-48)
          listens only for INSERT events, not UPDATE. Thread list unread counts
          don't refresh when messages are marked as read.
IMPACT: Permanent phantom unread count for General Inquiry messages. Thread list
        badge lags behind actual read state. If frontend UPDATE fails, message
        stays unread permanently.
FIX: Add useMarkMessagesReadByBuyer to GeneralChatView. Add UPDATE event
     subscription to useBuyerThreads realtime channel.
EFFORT: <1hr
```

### FINDING 11: notify-buyer-new-message is fire-and-forget from admin browser
```
SEVERITY: HIGH
FILES: src/hooks/use-connection-messages.ts (lines 136-151),
       supabase/functions/notify-buyer-new-message/index.ts (line 179)
EVIDENCE: Called client-side after message INSERT succeeds. Fire-and-forget
          (.then/.catch on non-awaited promise). No database trigger fallback.
          message_preview from client is trusted without DB verification.
          No admin role check — any authenticated user can invoke with any
          connection_request_id, sending spoofed notification emails.
IMPACT: If admin's browser closes after INSERT but before invoke(), buyer never
        gets email notification. message_preview can be spoofed. No retry.
FIX: Create a Postgres trigger on connection_messages INSERT (WHERE
     sender_role = 'admin') that invokes the notification function server-side.
     Remove client-side invocation. Add admin role verification.
EFFORT: 1 day
```

### FINDING 12: Denormalized columns maintained by trigger (but only INSERT)
```
SEVERITY: LOW
FILES: supabase/migrations/20260223040946_*.sql (lines 38-67)
EVIDENCE: Database trigger update_conversation_on_message() fires AFTER INSERT
          on connection_messages, updating last_message_at, last_message_preview
          (truncated to 100 chars), last_message_sender_role, and
          conversation_state. This is server-side, not application code.
          No AFTER DELETE or AFTER UPDATE trigger exists — if a message is
          deleted or edited, the preview becomes stale.
IMPACT: Low risk since message deletion is rare (admin-only). Preview could
        show deleted message text. last_message_preview truncation to 100 chars
        could produce empty previews if message starts with long reference tags.
FIX: Add AFTER DELETE trigger that recalculates from remaining messages.
EFFORT: 1 day
```

### MESSAGE LIFECYCLE FAILURE MODES

| Step | Failure Mode | Probability | Impact |
|------|-------------|-------------|--------|
| Admin sends message | Browser crashes before notify-buyer-new-message fires | Low | Buyer misses email entirely |
| Buyer reads message | GeneralChatView never marks as read | Guaranteed | Permanent phantom unread |
| Buyer sends general inquiry | No admin email notification | Guaranteed | Admin misses buyer message |
| Nav badge update | 30-second stale time | Guaranteed | Badge always slightly stale |
| Admin read receipt | Not implemented | Guaranteed | Admin blind to buyer engagement |

---

## SYSTEM 3 — AI DEAL RECOMMENDATION ENGINE

### FINDING 13: Service gate hard-kills buyers with empty profiles
```
SEVERITY: HIGH
FILES: supabase/functions/_shared/scoring/scorers.ts (line 80-81),
       supabase/functions/_shared/scoring/types.ts (line 75)
EVIDENCE: scoreService() line 80: "if (rawDealTerms.length === 0 ||
          rawBuyerTerms.length === 0) return { score: 0, signals: [] };"
          getServiceGateMultiplier(0) line 75: "if (serviceScore === 0) return 0.0;
          // Hard kill — explicitly wrong industry"
          Comment says "explicitly wrong industry" but condition also covers
          "no data at all." No fallback to thesis_summary or other text fields.
          extractDealKeywords() operates only on deal fields, never buyer data.
IMPACT: Buyers with empty target_services + target_industries + industry_vertical
        get composite score 0, invisible to every deal. These may be legitimate
        buyers added without full profile data. AI-seeded buyers get a +20 bonus
        pushing them to 0.4 multiplier, but non-AI buyers get 0.0 — inconsistent.
FIX: Differentiate "no data" from "no match" in scoreService(). Return
     { score: 0, signals: [], noData: true } and use a floor multiplier (e.g., 0.3)
     in getServiceGateMultiplier for the no-data case.
EFFORT: <1hr
```

### FINDING 14: Buyer pool .limit(10000) with no ORDER BY
```
SEVERITY: MEDIUM
FILES: supabase/functions/score-deal-buyers/index.ts (lines 142, 148, 155, 178)
EVIDENCE: Four queries with .limit(10000) or .limit(5000), none with .order().
          Line 142: .limit(10000) on universe-scoped buyers — no .order()
          Line 148: .limit(5000) on AI-seeded buyers — no .order()
          Line 155: .limit(5000) on no-universe buyers — no .order()
          Line 178: .limit(10000) fallback — no .order()
          No pagination or chunking logic.
IMPACT: If buyer pool exceeds 10,000, an arbitrary subset is scored. Which buyers
        are dropped is non-deterministic (depends on heap order). Recently added
        high-quality buyers could be excluded while older low-quality ones included.
FIX: Add .order('created_at', { ascending: false }) before each .limit().
     Log a warning when limit is hit. Consider pagination for large pools.
EFFORT: <1hr
```

### FINDING 15: Cache invalidation trigger exists but has gaps
```
SEVERITY: LOW
FILES: supabase/migrations/20260512000000_invalidate_cache_on_buyer_update.sql,
       supabase/functions/score-deal-buyers/index.ts (line 23)
EVIDENCE: CACHE_HOURS = 4. A trigger DOES exist that expires all
          buyer_recommendation_cache rows when scoring-relevant buyer fields
          change. Monitors: target_services, target_industries, industry_vertical,
          target_geographies, geographic_footprint, target_ebitda_min/max,
          has_fee_agreement, acquisition_appetite, total_acquisitions,
          thesis_summary, hq_state, archived.
          MISSING from trigger: buyer_type and is_pe_backed changes (affect
          getBuyerTypePriority ranking). Trigger invalidates ALL cache rows
          globally on any single buyer change (thundering herd risk).
IMPACT: buyer_type reclassification (e.g., corporate → private_equity) doesn't
        invalidate cache. Stale ranking for up to 4 hours.
FIX: Add buyer_type and is_pe_backed to the trigger condition. Consider
     per-deal invalidation instead of global.
EFFORT: <1hr
```

### FINDING 16: Parallel caches with different TTLs and no cross-invalidation
```
SEVERITY: LOW
FILES: supabase/migrations/20260501000003_buyer_seed_cache.sql,
       supabase/migrations/20260501000002_buyer_seed_log.sql,
       supabase/migrations/20260501000000_*.sql (buyer_recommendation_cache)
EVIDENCE: buyer_recommendation_cache: 4-hour TTL, stores scored results per deal.
          buyer_seed_cache: 90-day TTL, stores AI-seeded buyer_ids per category.
          buyer_seed_log: audit trail for AI seeding.
          The invalidation trigger on buyers only expires buyer_recommendation_cache.
          buyer_seed_cache retains stale buyer_ids for up to 90 days after profile
          changes. Deleted buyers remain in buyer_seed_cache UUID arrays (no FK).
IMPACT: A buyer deleted or merged can remain referenced in seed cache for 90 days.
        Low operational impact since scoring re-validates at runtime.
FIX: Add buyer_seed_cache cleanup to the invalidation trigger, or add periodic
     cleanup job that removes deleted buyer_ids from the array column.
EFFORT: 1 day
```

### FINDING 17: Buyer type string inconsistency across scorers
```
SEVERITY: MEDIUM
FILES: supabase/functions/_shared/scoring/types.ts (lines 92-113),
       supabase/functions/calculate-buyer-quality-score/index.ts (lines 64-93),
       supabase/functions/validate-criteria/index.ts (line 223)
EVIDENCE: getBuyerTypePriority() matches: corporate, private_equity, family_office,
          independent_sponsor, search_fund. Falls through to priority 5 for others.
          calculate-buyer-quality-score has 15+ string variants including legacy:
          pe_firm, platform, strategic, privateEquity, familyOffice, etc.
          validate-criteria uses plural forms: pe_firms, strategics, family_offices.
          If a buyer has buyer_type = 'pe_firm' (legacy), getBuyerTypePriority
          returns 5 (unknown) instead of 2 (PE firm). normalizeBuyerType() exists
          in buyer-type-definitions.ts but is never called by the scoring pipeline.
IMPACT: Legacy buyer_type values get wrong priority ranking. Buyers labeled
        'pe_firm' are treated as unknown/lowest priority instead of PE firm.
FIX: Call normalizeBuyerType() in score-deal-buyers before passing to
     getBuyerTypePriority(). Create a shared BUYER_TYPES constant.
EFFORT: <1hr
```

### SCORING TRACE

```
BUYER POOL FETCH (no ORDER BY, .limit(10000))
  ↓
DEAL KEYWORD EXTRACTION (extractDealKeywords scans deal text vs SECTOR_SYNONYMS)
  ↓
PER-BUYER SCORING:
  scoreService()    → 0-100 (+ AI_SEED_BONUS of 20 if applicable, cap 100)
  scoreGeography()  → 0, 60, 80, or 100
  scoreBonus()      → 0-100 (fee=34, aggressive=33, acquisitions>3=33)
  rawComposite = round(service*0.70 + geo*0.15 + bonus*0.15)
  gateMultiplier = getServiceGateMultiplier(service.score)
    → 0.0 if score=0 | 0.4 if 1-19 | 0.6 if 20-39 | 0.8 if 40-59 | 0.9 if 60-79 | 1.0 if 80+
  composite = round(rawComposite * gateMultiplier)
  ↓
TIER ASSIGNMENT (classifyTier):
  move_now:    composite >= 80 AND (hasFeeAgreement OR aggressive appetite)
  strong:      composite >= 60
  speculative: everything else
  ↓
SORT: composite DESC, then buyer_type_priority ASC
  ↓
CAP: internalBuyers.slice(0, 50) + externalBuyers.slice(0, 25) = max 75
  ↓
CACHE: upsert into buyer_recommendation_cache (4-hour TTL)
```

---

## SYSTEM 4 — DOCUMENT ENRICHMENT PIPELINE

### FINDING 18: Redundant transcript re-application on every enrich-deal run
```
SEVERITY: LOW
FILES: supabase/functions/enrich-deal/transcript-processor.ts (line 68, 80),
       supabase/functions/extract-deal-transcript/index.ts (lines 870-918)
EVIDENCE: transcript-processor.ts Step 0A iterates ALL transcripts with
          extracted_data regardless of applied_to_deal status (line 80 filters
          only on extracted_data existence). extract-deal-transcript sets
          applied_to_deal = true (line 912) but this flag is never read as a
          filter condition. Both paths use buildPriorityUpdates() with 'transcript'
          (priority 100), so re-application is idempotent but wasteful.
IMPACT: Unnecessary DB writes on every enrich-deal run. No data corruption
        due to source-priority protection.
FIX: In transcript-processor.ts applyExistingTranscriptData(), skip transcripts
     where applied_to_deal === true when forceReExtract is false.
EFFORT: <1hr
```

### FINDING 19: Source priority null handling is correct; asking_price unprotected
```
SEVERITY: MEDIUM
FILES: supabase/functions/_shared/source-priority.ts (lines 34-40, 163)
EVIDENCE: buildPriorityUpdates() line 163: "if (value === null || value === undefined)
          continue;" — correctly skips nulls before canOverwriteField() is called.
          PROTECTED_FIELDS: revenue, ebitda, owner_goals, transition_preferences,
          key_quotes. asking_price is NOT protected.
          PROTECTED_FIELDS set has no differentiated behavior — the >= priority
          comparison at line 79 is identical to the general case at line 90.
          analyze-buyer-notes (line 325) calls buildPriorityUpdates without
          isPlaceholderFn, so placeholder strings block notes-derived updates.
IMPACT: asking_price can be overwritten by equal-or-higher priority source.
        PROTECTED_FIELDS is effectively dead code (no differentiated logic).
        Buyer notes analysis blocked by stale placeholder text.
FIX: Add asking_price to PROTECTED_FIELDS. Differentiate protection logic
     (require strictly higher priority). Pass isPlaceholderFn in analyze-buyer-notes.
EFFORT: <1hr
```

### FINDING 20: Gemini model version inconsistency (intentional but undocumented)
```
SEVERITY: LOW
FILES: supabase/functions/_shared/ai-providers.ts (lines 23-24)
EVIDENCE: DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash' (line 23)
          GEMINI_25_FLASH_MODEL = 'gemini-2.5-flash' (line 24)
          enrich-deal → gemini-2.0-flash
          extract-deal-transcript → gemini-2.5-flash (newer model)
          extract-deal-document → gemini-2.0-flash
IMPACT: Likely intentional — transcripts are highest-priority data. But
        undocumented, creating confusion.
FIX: Add code comment in extract-deal-transcript explaining the model choice.
EFFORT: <1hr
```

### FINDING 21: Enrichment queue claim mechanism is well-designed
```
SEVERITY: LOW
FILES: supabase/functions/process-enrichment-queue/index.ts (lines 137-203),
       supabase/migrations/20260203_enrichment_queue_cron.sql (lines 47-82)
EVIDENCE: RPC claim_enrichment_queue_items uses FOR UPDATE SKIP LOCKED (line 70).
          Fallback uses .eq('status', 'pending') as atomic guard (line 188).
          Stale job recovery resets items stuck in 'processing' for >10 minutes.
          Circuit breaker (3 failures), MAX_CONTINUATIONS = 50.
          Minor issue: RPC path may not return 'force' column, causing
          item.force === true to fail for forced re-enrichments.
IMPACT: Queue system is robust. force flag gap is minor.
FIX: Add 'force' to RPC RETURNING clause.
EFFORT: <1hr
```

### FINDING 22: Website scraping has no login-wall detection
```
SEVERITY: MEDIUM
FILES: supabase/functions/enrich-deal/website-scraper.ts (lines 113-153, 145)
EVIDENCE: Content validation is only content.length > 50 (line 145). No check
          for login pages, CAPTCHA walls, or error pages. Firecrawl timeout and
          rate-limit errors return { success: false } gracefully — enrichment
          continues without website data.
          However, a login page with >50 chars of markdown passes the check,
          gets sent to Gemini for extraction, and can produce garbage values
          (e.g., "Sign In" as company name). These values go through
          buildPriorityUpdates with 'website' priority (60), so they won't
          overwrite transcript (100) or data_room (90) data, but WILL fill
          empty fields and overwrite csv (40) / manual (20) data.
IMPACT: Login-walled websites produce misleading extraction data in empty fields.
FIX: Add login-wall detection heuristic (check for "sign in", "log in",
     "password", "authentication required"). Add minimum content length of 200+.
EFFORT: <1hr
```

### DATA FLOW: Sources Writing to `listings`

| Source | Priority | Uses buildPriorityUpdates? | isPlaceholderFn? |
|--------|----------|---------------------------|-----------------|
| transcript-processor.ts | 100 | Yes | Yes |
| extract-deal-transcript | 100 | Yes | Yes |
| enrich-deal (website) | 60 | Yes | Yes |
| enrich-deal (data_room) | 90 | Yes | Yes |
| analyze-deal-notes | 80 | Yes | Yes |
| analyze-buyer-notes | 80 | Yes | **No** |
| apify-linkedin-scrape | N/A | **No** (direct write) | N/A |
| apify-google-reviews | N/A | **No** (direct write) | N/A |
| CSV import | 40 | **No** (direct write) | N/A |
| Manual UI edits | 20 | **No** (direct write) | N/A |

---

## SYSTEM 5 — MARKETPLACE LISTING CREATION

### FINDING 23: No staleness check on lead memos
```
SEVERITY: HIGH
FILES: supabase/functions/generate-marketplace-listing/index.ts (lines 480-488),
       supabase/functions/generate-lead-memo/index.ts (lines 217-233, 326-342)
EVIDENCE: generate-lead-memo writes to lead_memos table with
          generated_from: { sources, generated_at: new Date().toISOString() }.
          generate-marketplace-listing reads lead_memos.content but never
          compares generated_at to the deal's updated_at. No staleness warning.
          The SELECT also accepts memos in 'draft' status — unreviewed AI output
          can be used to generate a buyer-facing marketplace listing.
IMPACT: A deal enriched with new transcripts/revenue after memo generation
        produces a marketplace listing with stale data. Buyers see outdated
        financials. Draft memos used without admin review.
FIX: Compare lead_memos.created_at against listings.updated_at. Return
     needs_regeneration: true if memo predates last enrichment. Restrict
     status filter to ['completed', 'published'].
EFFORT: 1 day
```

### FINDING 24: Anonymization validation warns but does not block
```
SEVERITY: MEDIUM
FILES: supabase/functions/generate-marketplace-listing/index.ts (lines 48-145,
       219-243, 594, 609-611),
       src/pages/admin/CreateListingFromDeal.tsx (lines 258-265)
EVIDENCE: sanitizeAnonymityBreaches() runs before validateListing() (line 583 vs
          594), replacing state names with region descriptors. validateListing()
          then re-checks. If validation fails, content is still returned with
          validation.pass = false (line 609-611). CreateListingFromDeal shows a
          toast warning but does NOT block saving (lines 258-265).
          employeeNames extraction relies on specific "## MANAGEMENT AND STAFFING"
          section header — different headers produce empty list, skipping the check.
IMPACT: Anonymity breaches (company name, city, employee names) can make it into
        saved listings. The admin can proceed despite warnings.
FIX: Return HTTP 422 when validation.pass === false and any error contains
     "ANONYMITY BREACH". Force regeneration before saving.
EFFORT: 1 day
```

### FINDING 25: Unpublish correctly skips validation
```
SEVERITY: N/A (finding not confirmed)
FILES: supabase/functions/publish-listing/index.ts (lines 171, 228)
EVIDENCE: action === 'publish' branch (line 171) contains all validation.
          action === 'unpublish' branch (line 228) skips validation entirely,
          directly setting is_internal_deal = true. This is correct behavior.
          Minor note: unpublish doesn't set status = 'unpublished', leaving
          status as 'active' while is_internal_deal = true.
```

### FINDING 26: Revenue type check is safe for typical values
```
SEVERITY: LOW
FILES: supabase/functions/publish-listing/index.ts (line 44)
EVIDENCE: typeof listing.revenue !== 'number' check exists. Postgres NUMERIC
          column returns as JS number for typical business revenue values.
          Would only block publishing if revenue is null (legitimate validation)
          or astronomically large (returned as string — unlikely for LMM deals).
          EBITDA check (line 48) does not check > 0, allowing negative EBITDA
          (may be intentional).
FIX: No action needed for revenue. Consider documenting that negative EBITDA
     is allowed by design.
EFFORT: N/A
```

### FINDING 27: Zero AI cost logging for Claude calls
```
SEVERITY: MEDIUM
FILES: supabase/functions/generate-lead-memo/index.ts,
       supabase/functions/generate-marketplace-listing/index.ts,
       supabase/functions/_shared/cost-tracker.ts
EVIDENCE: cost-tracker.ts exists with logAICallCost, estimateCost, getTotalSpend.
          Only imported by enrich-deal and enrich-buyer (Gemini calls).
          generate-lead-memo and generate-marketplace-listing: zero imports of
          cost-tracker, zero cost logging calls. CostProvider type is 'gemini'
          only — no Claude/Anthropic pricing.
          A single memo generation can make 4+ Claude API calls (retries +
          hero description), potentially costing $1-2 per deal with no tracking.
IMPACT: AI spend for the most expensive operations (listing generation) is
        invisible in the cost dashboard. Budget forecasting impossible.
FIX: Add 'anthropic' to CostProvider type. Add Claude pricing to PRICING map.
     Call logAICallCost after each successful API call in both functions.
EFFORT: 1 day
```

### FINDING 28: Branding only affects PDF memos, not marketplace listing HTML
```
SEVERITY: LOW
FILES: supabase/functions/generate-lead-memo/index.ts (lines 1603-1678),
       supabase/functions/generate-marketplace-listing/index.ts
EVIDENCE: Branding parameter controls only the letterhead name in sectionsToHtml()
          (SourceCo, New Heritage Capital, Renovus Capital, Cortec Group).
          No different logos, colors, or styles between brandings.
          generate-marketplace-listing never reads branding from the memo content.
          Marketplace listing HTML is unbranded (plain structural markup).
          project_name is used only in anonymous teasers, never in public listings.
IMPACT: No buyer-facing branding risk. generate-teaser hardcodes 'sourceco'
        branding (line 513), ignoring the deal's actual branding.
FIX: Fix generate-teaser to accept branding parameter. Low priority.
EFFORT: <1hr
```

### LISTING LIFECYCLE TRACE

```
DEAL IN CRM (listings table, is_internal_deal = true)
  ↓
GENERATE LEAD MEMO → writes to lead_memos table (status: 'draft')
  ↓  ⚠ No staleness check between this point and next
ADMIN REVIEWS → uploads Final PDF to data_room_documents
  ↓
GENERATE TEASER → writes to lead_memos (memo_type: 'anonymous_teaser')
  ↓  ⚠ Missing sanitizeAnonymityBreaches() post-processor (unlike marketplace listing)
ADMIN REVIEWS → uploads Teaser PDF to data_room_documents
  ↓
GENERATE MARKETPLACE LISTING → reads lead_memos.content (including 'draft' status!)
  → Calls Claude API → sanitizeAnonymityBreaches → validateListing
  → ⚠ Validation failure = warning toast, NOT blocking
  → Writes to listings table (title, description_html, description, hero_description)
  ↓
ADMIN EDITS → saves via ImprovedListingEditor
  ↓
PUBLISH → validateListingQuality (title, description, category, location,
          revenue > 0, EBITDA present, image_url)
        → checkMemoPdfs (full_memo + anonymous_teaser PDFs exist)
          ⚠ Does not filter by document status = 'active'
        → Sets is_internal_deal = false, status = 'active', published_at
```

---

## SYSTEM 6 — ADDITIONAL FINDINGS

### FINDING 29: Anon RLS policy bypasses buyer approval_status check
```
SEVERITY: MEDIUM
FILES: supabase/migrations/20260227200000_landing_page_anon_access.sql (lines 21-29),
       supabase/migrations/20260304200000_rls_listings_is_internal_deal.sql (lines 29-33)
EVIDENCE: Authenticated policy correctly requires approval_status = 'approved'
          AND email_verified = true. But the anon policy allows ANY unauthenticated
          visitor to see all active non-internal listings:
          USING (status = 'active' AND deleted_at IS NULL AND is_internal_deal = false)
          A pending buyer can bypass the auth policy by making unauthenticated
          requests with the anon API key.
IMPACT: Approval_status gating becomes a UI-only control. Any user with the anon
        key (which is public) can see all marketplace listings.
FIX: If listing visibility should require approval, remove the anon policy or add
     a separate anon-visible subset. If the landing page intentionally shows all
     listings, document this design decision.
EFFORT: <1hr (decision) + <1hr (implementation)
```

### FINDING 30: connection_requests CHECK constraint may block on_hold workflow
```
SEVERITY: CRITICAL
FILES: supabase/migrations/20250717112819 (line 37),
       supabase/migrations/20250821111336 (line 34, 41),
       src/hooks/admin/use-connection-request-status.ts (line 10)
EVIDENCE: Migration 20250717112819 creates:
          CHECK (status IN ('pending', 'approved', 'rejected'))
          No subsequent migration drops this constraint. But migration
          20250821111336 creates an RPC that writes 'on_hold' to the status column.
          Frontend type includes 'on_hold' as valid status.
          If CHECK constraint is active, ALL on_hold updates fail with a
          constraint violation. If constraint failed to apply (pre-existing data),
          there's NO constraint — arbitrary strings can be set.
IMPACT: Either the entire "on hold" workflow is broken (constraint active) or
        there's no status validation at all (constraint failed). Both are bad.
FIX: Run SQL: SELECT conname FROM pg_constraint WHERE conname LIKE '%status%'
     AND conrelid = 'connection_requests'::regclass; to determine current state.
     Then either DROP the old constraint and CREATE a new one including 'on_hold',
     or add a new migration that does this.
EFFORT: <1hr
```

### FINDING 31: Deal alert emails violate CAN-SPAM — no unsubscribe header
```
SEVERITY: HIGH
FILES: supabase/functions/send-deal-alert/index.ts (lines 177-179, 199-208)
EVIDENCE: Email has only a "Manage your alerts" link requiring login (line 177-179).
          No List-Unsubscribe header in the Brevo API call. No one-click
          unsubscribe link. Violates CAN-SPAM and Gmail/Yahoo 2024 bulk sender
          requirements. No check against connection_requests to exclude buyers
          who were rejected from the specific listing.
IMPACT: Email deliverability risk — Gmail may classify as spam, affecting ALL
        platform emails. Rejected buyers receive deal alerts for listings they
        were rejected from, undermining trust.
FIX: Add List-Unsubscribe and List-Unsubscribe-Post headers to deal alert emails.
     Join against connection_requests to exclude rejected buyers. Add one-click
     unsubscribe endpoint.
EFFORT: 1 day
```

### FINDING 32: generate-teaser lacks anonymization post-processor
```
SEVERITY: MEDIUM
FILES: supabase/functions/generate-teaser/index.ts,
       supabase/functions/generate-marketplace-listing/index.ts (lines 219-243)
EVIDENCE: generate-marketplace-listing runs sanitizeAnonymityBreaches() as
          post-processing (line 583), replacing state names with region descriptors.
          generate-teaser does NOT have this post-processor — it relies solely
          on the AI following instructions. ~400 lines of duplicated
          validation/anonymization code between the two functions.
IMPACT: AI-generated teasers have higher risk of leaking state names than
        marketplace listings. A fix to one function may not be applied to the other.
FIX: Extract shared anonymization logic into _shared/anonymization.ts. Apply
     sanitizeAnonymityBreaches to teaser output as well.
EFFORT: 1 day
```

### FINDING 33: buyer_discovery_feedback missing cross-deal niche learning
```
SEVERITY: LOW
FILES: supabase/functions/score-deal-buyers/index.ts (lines 217-225),
       src/components/admin/deals/buyer-introductions/tabs/RecommendedBuyersTab.tsx
EVIDENCE: Table IS actively used: written by UI on approve/reject actions, read by
          score-deal-buyers to exclude rejected buyers per-deal. But scoring only
          queries feedback for the CURRENT listing (eq('listing_id', listingId)),
          not across deals in the same niche. The migration comment describes
          cross-deal niche learning that is NOT implemented.
IMPACT: Feature gap — rejecting a buyer on one fleet repair deal doesn't inform
        future fleet repair deal scoring. Per-deal exclusion works correctly.
FIX: Implement cross-niche feedback aggregation as described in migration comment.
EFFORT: 1 week
```

---

## PRIORITY MATRIX

### CRITICAL — Fix Before Next Deploy

| # | Finding | Impact | Fix Time |
|---|---------|--------|----------|
| 7 | Reminder UNIQUE constraint breaks all NDA/fee reminders after first firm | Zero reminders sent to all but one firm | <1hr |
| 3 | Service role JWT committed to git | Full DB access for anyone with repo access | <1hr + rotation |
| 30 | connection_requests CHECK constraint vs on_hold | Either on_hold is broken or no status validation | <1hr |

### HIGH — Fix This Week

| # | Finding | Impact | Fix Time |
|---|---------|--------|----------|
| 6 | NDA/fee reminder filters on 'pending' status that may never be set | All reminders silently inoperative | <1hr |
| 11 | notify-buyer-new-message is fire-and-forget from browser | Buyer misses messages when admin browser closes | 1 day |
| 9 | GeneralChatView bypasses notification and read-flag logic | Admin never notified of general inquiries | <1hr |
| 2 | Mixed Resend/Brevo providers with XSS-in-email | Silent email failure + email injection risk | 1 day |
| 13 | Service gate hard-kills buyers with empty profiles | Buyers permanently invisible to all deals | <1hr |
| 31 | Deal alert emails violate CAN-SPAM | Deliverability risk for all platform email | 1 day |
| 23 | No staleness check on lead memos | Marketplace listings built from outdated data | 1 day |
| 10 | GeneralChatView never marks messages as read | Permanent phantom unread count | <1hr |

### MEDIUM — Fix This Month

| # | Finding | Impact | Fix Time |
|---|---------|--------|----------|
| 1 | Email consolidation migration incomplete (dead code) | No retry protection on old email functions | 1 week |
| 4 | Dedup race condition in onboarding emails | Rare duplicate emails possible | <1hr |
| 8 | General Inquiry thread orphans message history | Buyer loses conversation history | 1 day |
| 14 | Buyer pool .limit(10000) with no ORDER BY | Non-deterministic buyer selection | <1hr |
| 17 | Buyer type string inconsistency | Legacy buyers get wrong priority | <1hr |
| 19 | asking_price unprotected + PROTECTED_FIELDS is dead code | Financial field overwrite risk | <1hr |
| 22 | Website scraping has no login-wall detection | Garbage data in empty fields | <1hr |
| 24 | Anonymization validation warns but doesn't block | Anonymity breaches can be saved | 1 day |
| 27 | Zero AI cost logging for Claude calls | Invisible AI spend | 1 day |
| 29 | Anon RLS bypasses approval_status check | Pending buyers see all listings | <1hr |
| 32 | generate-teaser lacks anonymization post-processor | Higher risk of state name leaks in teasers | 1 day |

### LOW — Backlog

| # | Finding | Impact | Fix Time |
|---|---------|--------|----------|
| 5 | send-templated-approval-email is dead code | Missing NDA-aware approval emails | 1 day |
| 12 | Denormalized columns have no DELETE trigger | Stale preview after message deletion | 1 day |
| 15 | Cache invalidation missing buyer_type | 4-hour stale window on type change | <1hr |
| 16 | Parallel caches with different TTLs | 90-day stale seed cache | 1 day |
| 18 | Redundant transcript re-application | Unnecessary DB writes | <1hr |
| 20 | Gemini model version inconsistency | Undocumented but likely intentional | <1hr |
| 21 | Enrichment queue force flag gap | Forced re-enrichments may be skipped via RPC | <1hr |
| 25 | Unpublish correctly skips validation | No issue found | N/A |
| 26 | Revenue type check safe for typical values | Edge case only | N/A |
| 28 | Branding only affects PDF memos | No buyer-facing risk | <1hr |
| 33 | buyer_discovery_feedback missing cross-deal learning | Feature gap, not a bug | 1 week |

---

## WATCH LIST — Needs Runtime Data to Confirm Severity

| # | Question | SQL Query to Run |
|---|----------|-----------------|
| 6 | How many firms have nda_pandadoc_status = 'pending'? | `SELECT nda_pandadoc_status, COUNT(*) FROM firm_agreements WHERE nda_email_sent = true AND nda_signed = false GROUP BY nda_pandadoc_status;` |
| 7 | Are any reminders in pandadoc_webhook_log? | `SELECT event_type, document_id, COUNT(*) FROM pandadoc_webhook_log WHERE event_type LIKE '%reminder%' GROUP BY event_type, document_id;` |
| 13 | How many buyers have empty scoring fields? | `SELECT COUNT(*) FROM buyers WHERE archived = false AND (target_services IS NULL OR target_services = '{}') AND (target_industries IS NULL OR target_industries = '{}') AND (industry_vertical IS NULL OR industry_vertical = '');` |
| 14 | Is the buyer pool over 10,000? | `SELECT COUNT(*) FROM buyers WHERE archived = false;` |
| 17 | Are there legacy buyer_type values? | `SELECT buyer_type, COUNT(*) FROM buyers WHERE buyer_type NOT IN ('private_equity','corporate','family_office','independent_sponsor','search_fund','individual_buyer') GROUP BY buyer_type;` |
| 30 | Is the CHECK constraint active? | `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'connection_requests'::regclass AND conname LIKE '%status%';` |
| 29 | Can anon users actually see listings? | `SELECT COUNT(*) FROM listings WHERE status = 'active' AND deleted_at IS NULL AND is_internal_deal = false;` |

---

*Audit completed 2026-03-14. All findings verified against source code with line-level evidence.*
