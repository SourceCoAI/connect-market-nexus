# CTO Audit Framework — Codebase Findings Report

**Date:** February 24, 2026
**Method:** Static analysis of system prompt, router, tool definitions, and knowledge base against all 27 CTO audit test cases
**Files Audited:** `system-prompt.ts` (440 lines), `router.ts` (851 lines), 18 tool modules (47 tools), chatbot test scenarios, knowledge articles

---

## Executive Summary

**14 gaps identified: 6 blocking, 5 important, 3 nice-to-have.**

The chatbot's **data query layer** (Section 4) is excellent — 47 tools with strong coverage. The **critical weakness** is that the system prompt contains zero business/domain knowledge: no SourceCo model explanation, no valuation guidance, no M&A process timelines, no buyer onboarding steps, no seller assessment framework. The bot is a powerful data engine with no business brain.

**All 14 fixes are system prompt text additions — no new tools or code required.**

---

## SECTION 1: PROSPEO INTEGRATION & CONTACT DISCOVERY

### What Exists (Working)

| Component | Status | Details |
|-----------|--------|---------|
| `enrich_buyer_contacts` tool | Working | LinkedIn scraping (Apify) + Prospeo email enrichment. Returns `confidence`, `source`, `enriched_at` per contact. |
| `google_search_companies` tool | Working | Google search via Apify for company/LinkedIn discovery. |
| `save_contacts_to_crm` tool | Working | Saves contacts to unified contacts table with buyer linkage. |
| Contact discovery flow | Documented | 5-step interactive flow in system prompt (check internal → enrich → present → wait for approval → save). |
| Router: CONTACT_ENRICHMENT | Working | Bypass rules match "find contacts at [company]", "enrich", "prospeo", "find email". |

### Test Case Predictions

| Test Case | Prediction | Root Cause |
|-----------|------------|------------|
| **1.1.1** Simple company lookup | PARTIAL FAIL | Tool returns contacts but bot won't show confidence scores or data quality indicators — system prompt has no instructions to surface them. |
| **1.1.2** Multi-filter combination | PARTIAL FAIL | Can apply filters but won't explain filtering logic, deal potential angle, or PE backing signals — no business context. |
| **1.2.1** ICP matching | FAIL | System prompt has zero concept of ICP, thesis matching, bootstrapped vs VC-backed, or founder vs hired CEO distinction. |
| **1.2.2** Competitor intelligence | FAIL | No guidance to interpret "competitors" as competing acquirers vs industry competitors. Will likely return wrong type. |
| **1.3.3** Confidence/accuracy | FAIL | Tool returns confidence field but system prompt never instructs bot to explain it, discuss data freshness, or recommend verification. |
| **1.3.4** Handling limitations | PARTIAL FAIL | Prompt says "it cannot search Google, LinkedIn, or Prospeo directly" which is outdated — it CAN via enrich_buyer_contacts. No coverage limitation heuristics. |

### Gaps

**GAP 1.1 — No confidence scoring instructions (BLOCKING)**
- System prompt never tells bot to surface the `confidence` field from Prospeo results
- No guidance on interpreting confidence levels or recommending verification
- Fix: Add ~15 lines to CONTACT_ENRICHMENT category instructions

**GAP 1.2 — No coverage limitation awareness (IMPORTANT)**
- No heuristics for when enrichment will return poor results (rural areas, small companies, uncommon titles)
- Fix: Add ~10 lines about rural coverage, small company gaps, title reliability

**GAP 1.3 — No ICP/thesis framework (IMPORTANT)**
- Zero concept of evaluating potential sellers against acquisition criteria
- Fix: Add ~15 lines mapping thesis criteria to searchable filters

**GAP 1.4 — No competitor intelligence framing (NICE-TO-HAVE)**
- Fix: Add ~5 lines to BUYER_ANALYSIS disambiguating "competitors" in deal context

---

## SECTION 2: M&A DOMAIN EXPERTISE

### What Exists

| Component | Status | Details |
|-----------|--------|---------|
| System prompt identity | Minimal | "You are the AI Command Center for SourceCo, an M&A deal management platform" — that's it. |
| Requirements doc glossary | Not in prompt | 23 M&A terms defined in `docs/ai-command-center/01-REQUIREMENTS.md` but NOT injected into system prompt. |
| Buyer scoring | Working | Composite, geography, service, size, owner goals — fully explainable via `explain_buyer_score`. |
| Deal pipeline tracking | Working | Stages, tasks, activities, outreach all tracked. |

### Test Case Predictions

| Test Case | Prediction | Root Cause |
|-----------|------------|------------|
| **2.1.1** Value prop explanation | FAIL | System prompt has zero knowledge of SourceCo's business model, value proposition, fee structure, or why founders should use it. |
| **2.1.2** Buyer universe & scoring | PARTIAL PASS | Scoring system is documented and tools work. But no guidance on explaining buyer types for a specific deal scenario (roll-up PE vs strategic vs franchise). |
| **2.2.1** Valuation context | FAIL | Zero valuation knowledge — no EBITDA multiples, no market context, no factors affecting valuation. Word "valuation" only appears as "valuation_leads". |
| **2.2.2** Deal structure/earnout | FAIL | Zero knowledge of deal structures, earnouts, escrow, indemnification, or tax implications. |
| **2.3.1** Collision repair context | FAIL | No industry-specific M&A knowledge. Router knows "collision" as a deal filter keyword, not as an industry with consolidation dynamics. |
| **2.3.2** Accounting firm dynamics | FAIL | No knowledge that accounting firms sell on revenue multiples (not EBITDA), have regulatory constraints, or have unique client concentration risks. |

### Gaps

**GAP 2.1 — No SourceCo business model knowledge (BLOCKING)**
- The entire 440-line system prompt is operational ("how to use tools") with zero business model context
- Cannot explain: value prop, two-sided model, buyer types, speed advantage, fee structure
- Fix: Add ~50 lines covering SourceCo's model, value prop for sellers and buyers, fee structure overview

**GAP 2.2 — No valuation knowledge (BLOCKING)**
- Cannot provide EBITDA multiples by industry, factors affecting multiples, market headwinds, size discounts
- Fix: Add ~40 lines with general multiple ranges by sector, key factors, current market caveats

**GAP 2.3 — No deal structure knowledge (IMPORTANT)**
- Cannot discuss earnouts, seller notes, equity rollovers, escrow, or tax implications
- Fix: Add ~20 lines covering common deal structures and when to recommend professional counsel

**GAP 2.4 — No industry-specific knowledge (IMPORTANT)**
- Cannot explain industry consolidation dynamics for core verticals (collision repair, HVAC, accounting, home services)
- Fix: Add ~40 lines with 2-3 sentences per vertical covering buyer types, valuation norms, and market dynamics

---

## SECTION 3: PLATFORM FUNCTIONALITY & OPERATIONS

### What Exists

| Component | Status | Details |
|-----------|--------|---------|
| Deal stages tracking | Working | `query_deals`, `get_deal_details`, `update_deal_stage` all functional. |
| Buyer scoring system | Working | 5 dimensions, fully explainable, historical snapshots. |
| PandaDoc integration | Working | `send_document` for NDA/fee agreements with confirmation flow. |
| Follow-up queue | Working | `get_follow_up_queue` surfaces overdue tasks, stale outreach, unsigned NDAs, unread messages. |
| Connection requests | Working | Buyer intake pipeline with NDA/fee status tracking. |

### Test Case Predictions

| Test Case | Prediction | Root Cause |
|-----------|------------|------------|
| **3.1.1** Buyer onboarding | FAIL | System prompt has zero knowledge of buyer onboarding steps, timelines, documentation requirements, or fee model. |
| **3.1.2** Troubleshoot no deals | PARTIAL PASS | Can check profile and scoring via tools, but no diagnostic framework guiding systematic troubleshooting. |
| **3.2.1** Seller profile assessment | FAIL | No seller readiness framework. Cannot assess fitness for institutional buyers, identify red flags, or suggest deal prep. |
| **3.2.2** Valuation misalignment | FAIL | Blocked by GAP 2.2 — cannot calculate realistic multiples or explain why $4M for $200K EBITDA is unrealistic. |
| **3.3.1** Deal status timeline | FAIL | No M&A timeline knowledge. Cannot explain typical durations for interest → diligence → LOI → close. |
| **3.3.2** Closing docs coordination | PARTIAL PASS | PandaDoc tools work (`get_firm_agreements`, `get_nda_logs`). Can track document status. May miss explaining the broader closing process. |

### Gaps

**GAP 3.1 — No buyer onboarding process (BLOCKING)**
- Cannot describe credentials review, profile setup, scoring initialization, deal matching timeline, or fee structure
- Fix: Add ~20 lines to system prompt with step-by-step onboarding process and timelines

**GAP 3.2 — No seller assessment framework (BLOCKING)**
- Cannot evaluate seller readiness, identify red flags (customer concentration, owner dependency), or suggest positioning work
- Fix: Add ~30 lines covering fitness factors, red flag checklist, and deal prep conversation topics

**GAP 3.3 — No M&A timeline knowledge (IMPORTANT)**
- Cannot explain typical M&A process durations or what happens at each stage
- Fix: Add ~20 lines with stage durations, buyer activities during diligence, and red flag signals

---

## SECTION 4: DATA QUERY TRANSLATION & VALUE-ADD

### What Exists (STRONG)

| Component | Status | Details |
|-----------|--------|---------|
| Pipeline queries | Excellent | `get_pipeline_summary` with `group_by` (status, industry, state, source). `query_deals` with 10+ filters. |
| Buyer segment analytics | Good | `get_cross_deal_analytics` with 6 analysis types including buyer_type_analysis and conversion_funnel. |
| Fireflies transcripts | Good | `search_transcripts`, `search_fireflies`, `semantic_transcript_search` for intent-based search. |
| Follow-up queue | Excellent | Unified view of overdue tasks, stale outreach, unsigned NDAs, unread messages, upcoming dates. |
| Scoring explanation | Excellent | `explain_buyer_score` with per-dimension breakdowns, citations, confidence assessment, missing data flags. |
| Formatting rules | Strong | No tables, no emoji, concise bullets, inline data points, max 250 words simple / 400 words complex. |

### Test Case Predictions

| Test Case | Prediction | Root Cause |
|-----------|------------|------------|
| **4.1.1** Simple pipeline query | PASS | `get_pipeline_summary` handles this perfectly. Router bypasses to PIPELINE_ANALYTICS. |
| **4.1.2** Buyer segment analytics | PARTIAL PASS | `get_cross_deal_analytics` returns data but system prompt lacks guidance on interpreting results for business action. |
| **4.2.1** Call intelligence | PASS | `search_transcripts` / `semantic_transcript_search` handle timeline extraction. MEETING_INTEL category instructions cover quote extraction. |
| **4.2.2** Buyer motivation signals | PARTIAL PASS | Can pull multiple transcripts but no framework for ranking interest signals (high/medium/low). |
| **4.3.1** Deal velocity by vertical | PARTIAL PASS | Tools return data but no industry context explaining WHY home services takes longer than SaaS. |
| **4.3.2** Buyer-seller fit | PASS | `get_buyer_profile`, `get_score_breakdown`, `explain_buyer_score` all work. Scoring explanation provides fit reasoning. |

### Gaps

**GAP 4.1 — No business interpretation guidance (NICE-TO-HAVE)**
- Tools return raw data excellently but system prompt doesn't guide actionable interpretation
- Fix: Add ~10 lines to PIPELINE_ANALYTICS and CROSS_DEAL instructions about recommending actions from findings

**GAP 4.2 — No interest signal ranking framework (NICE-TO-HAVE)**
- No heuristics for differentiating high/medium/low buyer interest from transcript analysis
- Fix: Add ~10 lines to MEETING_INTEL with signal interpretation (financial questions = high, "maybe" = low)

---

## SECTION 5: QUALITY STANDARDS & WORKFLOWS

### What Exists (STRONG)

- Zero hallucination policy with explicit guardrails (never fabricate names, IDs, data)
- Confirmation required for 7 destructive actions
- Data provenance attribution ("Source: Enriched via Prospeo on Jan 15, 2026")
- Error handling with recovery options
- Multi-source transparency (label each source separately)
- Response formatting rules (no tables, no emoji, concise, bullets)
- Stale data flagging (>90 days)

### Test Case Predictions

| Test Case | Prediction | Root Cause |
|-----------|------------|------------|
| **5.2A** Buyer inquiry response | FAIL | Blocked by GAP 2.1 (no SourceCo model) + GAP 3.1 (no onboarding process). Cannot explain how SourceCo works or onboarding steps. |
| **5.2B** Seller counseling | FAIL | Blocked by GAP 2.2 (no valuation knowledge) + GAP 3.2 (no seller assessment). Cannot discuss valuation methodology or comparable sales. |
| **5.2C** Deal status inquiry | PARTIAL FAIL | Can pull deal data from Supabase but blocked by GAP 3.3 (no timeline knowledge). Cannot benchmark against typical M&A timelines or explain what's normal. |

### No additional gaps beyond Sections 1-4.

---

## ROUTER ANALYSIS

The router uses 40+ regex bypass rules for fast intent classification, falling back to Haiku LLM for unmatched queries.

**Problem:** Many CTO audit queries are about **domain knowledge** (not data lookups) and won't match any bypass rule. They'll fall through to the LLM router, which will classify them as GENERAL. This is acceptable IF the system prompt has the knowledge — but it doesn't.

| Test Query | Bypass Match? | Likely Route |
|------------|--------------|--------------|
| "Explain how SourceCo works..." | No match | LLM → GENERAL |
| "What should they expect to get for it in this market?" | No match | LLM → GENERAL |
| "60/40 structure with a 2-year earnout..." | No match | LLM → GENERAL |
| "What's the onboarding process?" | No match | LLM → GENERAL |
| "Are they a good fit? What questions should we ask?" | No match | LLM → GENERAL |
| "What's happening in collision repair right now?" | No match | LLM → GENERAL |
| "How do we actually value it?" | No match | LLM → GENERAL |

**Impact:** These all route to GENERAL category which uses minimal tools. This is fine for knowledge questions IF the system prompt contains the answers. The router itself doesn't need changes — the system prompt does.

---

## FULL GAP REGISTRY

| ID | Severity | Description | Test Cases | Fix Size |
|----|----------|-------------|------------|----------|
| 2.1 | **BLOCKING** | No SourceCo business model knowledge | 2.1.1, 5.2A | ~50 lines |
| 2.2 | **BLOCKING** | No valuation knowledge | 2.2.1, 2.3.2, 3.2.2, 5.2B | ~40 lines |
| 3.1 | **BLOCKING** | No buyer onboarding process | 3.1.1, 5.2A | ~20 lines |
| 3.2 | **BLOCKING** | No seller assessment framework | 3.2.1, 3.2.2 | ~30 lines |
| 1.1 | **BLOCKING** | No Prospeo confidence scoring display | 1.1.1, 1.3.3 | ~15 lines |
| 1.2 | IMPORTANT | No Prospeo coverage limitations | 1.3.4 | ~10 lines |
| 1.3 | IMPORTANT | No ICP/thesis framework | 1.2.1 | ~15 lines |
| 2.3 | IMPORTANT | No deal structure/earnout knowledge | 2.2.2 | ~20 lines |
| 2.4 | IMPORTANT | No industry-specific M&A context | 2.3.1, 2.3.2 | ~40 lines |
| 3.3 | IMPORTANT | No M&A timeline knowledge | 3.3.1, 5.2C | ~20 lines |
| 1.4 | Nice-to-have | No competitor intelligence framing | 1.2.2 | ~5 lines |
| 4.1 | Nice-to-have | No business interpretation guidance | 4.1.2, 4.3.1 | ~10 lines |
| 4.2 | Nice-to-have | No interest signal ranking | 4.2.2 | ~10 lines |

**Total fix: ~285 lines of system prompt additions. Zero code changes required.**

---

## PREDICTED PASS RATES

| Section | Total Tests | Predicted Pass | Predicted Partial | Predicted Fail |
|---------|-------------|----------------|-------------------|----------------|
| 1. Prospeo | 6 | 0 | 2 | 4 |
| 2. M&A Domain | 6 | 0 | 1 | 5 |
| 3. Platform Ops | 6 | 0 | 2 | 4 |
| 4. Data Queries | 6 | 3 | 3 | 0 |
| 5. Quality Standards | 3 | 0 | 1 | 2 |
| **TOTAL** | **27** | **3 (11%)** | **9 (33%)** | **15 (56%)** |

**After fixing all gaps: predicted 22-25 passes (81-93%).**

---

## RECOMMENDED FIX ORDER

1. Add SourceCo business model to system prompt (unlocks 2.1.1, 5.2A)
2. Add valuation context (unlocks 2.2.1, 2.3.2, 3.2.2, 5.2B)
3. Add buyer onboarding process (unlocks 3.1.1, 5.2A)
4. Add seller assessment framework (unlocks 3.2.1, 3.2.2)
5. Add Prospeo confidence instructions (unlocks 1.1.1, 1.3.3)
6. Add M&A timeline knowledge (unlocks 3.3.1, 5.2C)
7. Add industry-specific context (unlocks 2.3.1, 2.3.2)
8. Add Prospeo coverage limitations (unlocks 1.3.4)
9. Add deal structure knowledge (unlocks 2.2.2)
10. Add ICP framework (unlocks 1.2.1)
11. Add business interpretation guidance (improves 4.1.2, 4.3.1)
12. Add signal ranking heuristics (improves 4.2.2)
13. Add competitor intelligence framing (improves 1.2.2)
