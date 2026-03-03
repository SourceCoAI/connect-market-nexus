/**
 * AI Command Center - Knowledge Base
 * Extractable domain knowledge for on-demand retrieval via retrieve_knowledge tool.
 * Keeps the system prompt lean while preserving full context depth.
 */

export interface KnowledgeArticle {
  title: string;
  content: string;
}

export const KNOWLEDGE_BASE: Record<string, KnowledgeArticle> = {
  field_meanings: {
    title: 'Field Meanings & Business Context',
    content: `Deal/Listing Fields:
- owner_goals: the seller's strategic objectives — NOT financial metrics. Examples: "retain existing management", "grow EBITDA 20%", "stay independent post-close". Drives owner_goals_score matching.
- seller_motivation: why the owner wants to sell — "retirement", "health", "burnout", "tax optimization", "market timing". Affects urgency and deal structure.
- transition_preferences: how the seller expects the ownership/management change to work — "want to stay as CEO for 2 years", "prefer strategic over PE", "clean break at close". Critical for buyer-seller fit.
- key_risks: identified vulnerabilities — "customer concentration 60% to 3 clients", "owner-dependent operations", "outdated equipment". Surface proactively.
- growth_drivers: what supports future growth — "market tailwinds", "pricing power", "geographic expansion". Buyers look for these to justify multiples.
- management_depth: quality and independence of the management team. Low = owner-dependent = risk. High = runs without owner = premium.
- customer_concentration: percentage of revenue from top clients. >20% from one client is a red flag. >50% is serious concern for institutional buyers.
- deal_source: where the deal originated — "marketplace", "captarget", "gp_partners", "inbound", "valuation_calculator", "referral", "internal".
- remarketing_status: whether the deal is being actively marketed to buyers.
- need_buyer_universe / universe_build_flagged: flags indicating the deal needs a buyer universe built.

Buyer Fields:
- acquisition_appetite: how aggressively pursuing deals — "aggressive" (quick decisions, deploying now), "active" (standard process), "selective" (very picky), "opportunistic" (only if perfect fit).
- acquisition_timeline: when ready to deploy — "Q1-Q2 2026" (specific window), "ongoing" (always buying), "selective", "paused" (not active — do NOT outreach).
- geographic_footprint: array of state codes where buyer has operations (DIFFERENT from hq_state). A buyer HQ'd in NY with footprint ["NY","TX","FL"] matches deals in all three.
- target_services / target_industries: industries/services the buyer SEEKS to acquire. NOT what they currently do.
- services_offered: what the buyer's existing company does. Different from target_services.
- thesis_summary: the buyer's investment thesis — most context-rich buyer field.
- Deal breakers: no single field. Check pass history via get_buyer_signals(signal_source: "decisions") — patterns in pass_category reveal consistent rejections.
- Data quality: no explicit field. Assess by checking: thesis_summary present? target_revenue_min/max populated? geographic_footprint set? data_quality_bonus reflects enrichment completeness.
- fee_agreement_status: whether the buyer has signed SourceCo's fee agreement.`,
  },

  scoring_dimensions: {
    title: 'Scoring Dimensions & Modifiers',
    content: `All dimensions scored 0-100, higher = better fit:
- composite_score: overall match quality combining all dimensions with weights.
- geography_score: deal location vs buyer HQ and/or operating footprint.
- service_score: deal industry/services vs buyer targets.
- size_score: deal revenue/EBITDA vs buyer target range.
- owner_goals_score: seller wants vs buyer acquisition model. Example: seller wants "management retention" + PE buyer installing new management = low score.
- portfolio_score: deal fit with buyer's existing portfolio — portfolio_conflict risk and strategic alignment.
- business_model_score: deal model (recurring vs project, B2B vs B2C) vs buyer preferences.
- acquisition_score: buyer readiness based on appetite, timeline, recent activity.
- tier: A (80-100, strong — prioritize), B (60-79, good — pursue), C (40-59, moderate), D (20-39, weak), F (0-19, poor/disqualified).
- is_disqualified: boolean flag — check disqualification_reason.
- geography_mode: set on industry_trackers — "hq" (match HQ only), "footprint" (any state in footprint), "both".
- learning_penalty: points deducted based on buyer's pass history on similar deals.

Score Modifiers:
- thesis_alignment_bonus / thesis_bonus: bonus for strong thesis alignment.
- kpi_bonus: matching specific KPI targets.
- data_quality_bonus: rich, well-enriched data = more reliable scoring.
- custom_bonus: manually set by admin for deal-specific adjustments.
- service_multiplier / size_multiplier / geography_mode_factor: custom weight multipliers per deal via deal_scoring_adjustments.
- Use get_score_breakdown for per-dimension breakdown and human-readable explanation.`,
  },

  pass_categories: {
    title: 'Pass Categories (Why a Buyer Was Rejected)',
    content: `- geographic_mismatch: deal location doesn't match buyer's target geography.
- size_mismatch: deal revenue/EBITDA outside buyer's target range.
- service_mismatch: deal industry/services don't align with buyer's targets.
- acquisition_timing: buyer not actively buying right now.
- portfolio_conflict: buyer already has a similar company in portfolio.
- competition: internal conflict with other active buyers.
- other: custom reason — check pass_reason text for details.`,
  },

  engagement_signals: {
    title: 'Engagement Signal Types & Ranking',
    content: `Buyer interest indicators, ranked by strength:
1. loi_submitted: Letter of Intent — very strong, near-term deal likely.
2. ioi_submitted: Indication of Interest — strong buying signal.
3. management_presentation: buyer met seller's management — deep diligence.
4. nda_signed: buyer executed NDA — committed to evaluating.
5. financial_request: buyer asked for teaser/memo/financials — serious interest.
6. ceo_involvement: CEO/owner in a call/meeting — decision-maker level.
7. data_room_access: buyer accessed data room documents.
8. site_visit: buyer viewed data room or deal page.`,
  },

  call_dispositions: {
    title: 'PhoneBurner Call Dispositions',
    content: `- connected: actual conversation — highest value.
- voicemail: left a voicemail message.
- no_answer: phone rang, no pickup.
- busy: line was busy.
- wrong_number: incorrect contact info — flag for data cleanup.
- do_not_call: contact requested removal — STOP all outreach.`,
  },

  business_model: {
    title: 'SourceCo Business Model',
    content: `SourceCo is a B2B M&A deal marketplace platform connecting business sellers with qualified institutional buyers through a curated marketplace, AI-powered buyer-deal matching, and a full remarketing pipeline.

Two-sided marketplace: sellers list their business, buyers browse and express interest. SourceCo facilitates introductions, NDAs, deal management, and data room access.

Value prop for sellers: access to a large network of active remarketing buyers without hiring a traditional M&A advisor. AI-powered ReMarketing Engine proactively matches deals to best-fit buyers using scoring across geography, size, services, and owner goals.

Value prop for buyers: proprietary deal flow of off-market and lightly marketed businesses, pre-screened with financials and owner goals. Advanced filtering by industry, location, revenue, EBITDA.

Buyer types: PE firms, family offices, independent sponsors, strategic acquirers, platform companies (PE-backed roll-ups), search funds, corporate acquirers.

Fee structure: success fee on completed transactions tracked via firm_agreements. For specific details, refer to the SourceCo team.

Key components: Buyer Marketplace, Admin Dashboard, ReMarketing Engine (outbound matching + outreach + industry trackers + research), Data Room (per-deal with granular access), Lead Memos (AI-generated summaries).`,
  },

  terminology: {
    title: 'SourceCo Terminology',
    content: `- Deal/Listing: a business being marketed for acquisition (listings table).
- Remarketing Buyer: external buyer (PE/strategic/platform) tracked in remarketing_buyers. Not a platform user.
- Marketplace Buyer: registered platform user who browses deals (profiles table).
- Universe: named buyer grouping for targeted outreach (remarketing_buyer_universes) with geography, size, services criteria.
- Score: composite buyer-deal fit score (0-100) across geography, size, service, owner goals, thesis alignment.
- Tier: A (80-100), B (60-79), C (40-59), D (20-39), F (0-19).
- Pipeline Stage: Lead, NDA, LOI, Due Diligence, Closed (and others as configured).
- Outreach: contact attempt to a buyer tracked in outreach_records and remarketing_outreach.
- CapTarget: external lead source for PE-backed acquisition targets, synced via Google Sheets.
- GP Partners: General Partner referral deal source.
- Fee Agreement: contractual agreement between SourceCo and buyer firm regarding success fees.
- NDA: Non-Disclosure Agreement required before sharing confidential deal details.
- Data Room: secure per-deal document storage with tiered access (anonymous teaser, full memo, full data room).
- Enrichment: AI data enhancement using web scraping (Firecrawl/Apify) and LLM extraction.
- Fireflies: Fireflies.ai meeting recording/transcription service. Rich business context.`,
  },

  credibility_framework: {
    title: 'Knowledge Credibility Framework',
    content: `TIER 1 — SOURCECO DATA (highest authority):
- Fireflies call transcripts: real conversations about deals, valuations, preferences, market conditions. Use semantic_transcript_search or search_transcripts.
- SourceCo pipeline data: actual deals, scores, outcomes, buyer engagement via query_deals, search_buyers, get_analytics (cross-deal analysis types).
- Industry trackers: get_industry_trackers for tracked verticals.
- When citing: "Based on SourceCo's experience..." or "From our call on [date]..."

TIER 2 — SOURCECO-PROVIDED MATERIALS:
- Internal training decks, playbooks, documentation provided by team.
- Content in this system prompt. Present as SourceCo's position without caveat.

TIER 3 — GENERAL M&A KNOWLEDGE:
- Widely accepted M&A concepts from reputable sources (textbooks, established firms).
- ALWAYS label: "In general M&A practice..." or "Standard industry guidance suggests..."
- Acceptable for foundational concepts. NOT for specific multiples or market predictions.

NEVER CREDIBLE: speculation, unverified claims, specific market multiples without cited source, predictions without transcript-backed discussion.

SOURCING RULES: For deal-specific questions, ALWAYS use Tier 1 first. For general M&A, Tier 3 acceptable but search Tier 1 first. When mixing tiers, clearly separate SourceCo data from general knowledge.`,
  },

  business_signals: {
    title: 'Reading Business Signals for Sourcing & Matching',
    content: `Size & Scale Proxies:
- google_review_count: for consumer-facing businesses, more reviews = bigger. 500+ reviews = significantly larger than 50.
- google_rating: 4.5+ with high reviews = strong brand. Below 3.5 = potential issues.
- full_time_employees / linkedin_employee_count: 5-10 employees ~ $500K-$2M rev, 20-50 ~ $2M-$10M, 50+ ~ $10M+.
- number_of_locations: multi-location = more attractive to PE roll-up buyers.

Deal Quality Scoring:
- deal_total_score (0-100): A (80+) priority, B (60-79) good, C (40-59) moderate, D (<40) weak.
- revenue_score (0-60): $1-5M = 15-40, $5-10M = 40-54, $10M+ = 54-60.
- ebitda_score (0-40): $300K-1M = 5-20, $1-3M = 20-35, $3M+ = 35-40.
- industry_tier (1-4): 1 = high demand, 4 = niche/emerging.

What Makes a Deal Attractive:
- Recurring revenue (service contracts, subscriptions) — buyers pay premiums.
- Management depth (runs without owner = worth more).
- Multiple locations (scalability, diversification).
- Strong margins (above industry average).
- Growth trajectory + customer diversification (no single customer >20%).
- Clean financials and industry tailwinds (verify with transcripts).`,
  },

  buyer_deal_matching: {
    title: 'Buyer-Deal Matching Guide',
    content: `Match from the BUYER's perspective:
- PE roll-up / platform buyers: bolt-ons in target industry + geography + size range.
- Strategic acquirers: competitors or adjacent businesses for market share/expansion.
- Family offices / independent sponsors: flexible on thesis, focused on EBITDA and returns.
- Search funds: first-time buyers, smaller deals, management depth matters.

How to recommend buyers for a deal:
1. Start with deal industry, geography (address_state), revenue, EBITDA.
2. get_top_buyers_for_deal(deal_id) for pre-scored, ranked matches.
3. get_score_breakdown for per-dimension analysis on specific pairs.
4. Check composite_score and tier — A/B tier = best fit.
5. Read thesis_summary to understand WHY buyer wants this deal.
6. Check pass history via get_buyer_signals(signal_source: "decisions") — learning_penalty reflects patterns.
7. Prioritize "aggressive"/"ongoing" appetite. Exclude "paused" buyers.
8. Check fee_agreement_status — signed = can move faster.
9. Search transcripts for prior conversations about this buyer or similar deals.
10. If no universe exists (need_buyer_universe=true), fall back to search_buyers with filters.

What to highlight: why they fit, score breakdown (geography? service? size?), thesis alignment, flags (pass history, paused timeline, data gaps).`,
  },

  general_ma_knowledge: {
    title: 'General M&A Knowledge (Tier 3)',
    content: `Key Concepts:
- EBITDA: standard earnings metric for lower middle market valuations. Buyers/sellers talk in EBITDA multiples.
- SDE (Seller's Discretionary Earnings): EBITDA + owner compensation. For smaller owner-operated businesses.
- Addbacks: owner expenses normalized (above-market salary, personal expenses, one-time costs).
- Revenue multiples: used in some industries (e.g., CPA firms). "1.2x revenue" = price is 1.2x annual revenue.
- Deal structures: all-cash, seller note, earnout, equity rollover.
- Platform vs bolt-on: "platform" = first/anchor company in PE roll-up. "Bolt-ons" = add-on acquisitions.
- LOI (Letter of Intent): non-binding agreement outlining deal terms. Major milestone.
- DRP (Direct Repair Program): in collision repair, insurance referral relationships. Key value driver.

Industry Context for Sourcing:
- Collision repair: MSO consolidation. DRP relationships, OEM certifications, locations, equipment.
- HVAC / home services: PE roll-up darling. Recurring maintenance contracts, technician workforce, residential-commercial mix.
- Accounting / CPA firms: succession-driven M&A. Sticky clients, recurring tax/audit, valued on revenue not EBITDA.
- IT / managed services (MSPs): recurring revenue play. High MRR/ARR, low churn, sticky contracts.
- Healthcare services: payor mix, provider retention, regulatory compliance.
- Always search transcripts and industry_trackers first for SourceCo-specific views.`,
  },

  contact_discovery_flow: {
    title: 'Contact Discovery Workflow',
    content: `When user asks to "find contacts at [company]":
1. FIRST check internal data: search_pe_contacts and search_contacts for existing contacts.
2. If not found OR missing email/phone, AUTOMATICALLY use enrich_contact(mode: "company") or find_contact(mode: "person"). Never ask "would you like me to enrich?" — just do it.
3. Present discovered contacts: name, title, email, phone, LinkedIn URL.
4. Only for SAVING to CRM (write operation): wait for user to specify which contacts. Use save_contacts_to_crm with confirmation.

If user wants Google first: google_search_companies → then step 2.

For person name + company: search_contacts(company_name, search) → if no email, auto find_contact(mode: "person").
For person name only: immediately find_contact(mode: "person") (handles full pipeline).
For bulk missing emails: search_contacts(has_email=false) → auto-enrich each.
For LinkedIn discovery: find_contact(mode: "linkedin_search") → review → auto_update → enrich_contact(mode: "linkedin").`,
  },

  multi_step_workflows: {
    title: 'Multi-Step Workflow Patterns',
    content: `**Building a Calling/Contact List**
1. Search ALL lead sources in parallel: captarget, gp_partners, query_deals, valuation_leads, inbound_leads.
2. Compile unique companies.
3. Check contacts exist for each: search_contacts(company_name).
4. Report: "Found N companies. M have contacts, K need enrichment."
5. AUTO-enrich missing contacts. Do not ask permission.
6. Present structured list: Company, Contact, Title, Phone, Email, Source.
7. Suggest pushing to PhoneBurner.

**Finding a Specific Person's Contact Info**
1. Search internal: search_contacts(company_name, search) + search_pe_contacts(firm_name).
2. If found WITH email: present immediately.
3. If found WITHOUT email: auto find_contact(mode: "person").
4. If NOT found: auto enrich_contact(mode: "company") or find_contact(mode: "person").
5. Present results. Only ask confirmation for save_contacts_to_crm.

**Industry Research Across All Sources**
1. Search ALL sources simultaneously — never stop after one.
2. Always check: CapTarget, GP Partners, Active Deals, Valuation Leads, Inbound Leads.
3. Present breakdown by source with counts.

**Comprehensive Deal + Buyer Analysis**
1. get_deal_details for full profile.
2. get_top_buyers_for_deal for scored matches.
3. search_transcripts(deal_name) for call insights.
4. get_outreach_records for outreach status.
5. Synthesize into concise briefing.`,
  },

  error_recovery: {
    title: 'Error Recovery Instructions',
    content: `When google_search_companies fails:
- Tell user exactly what failed with status code.
- AUTO try alternatives (find_contact with Prospeo fallback).
- Only after all automated options fail, suggest user paste a LinkedIn URL.

When enrich_contact(mode: "company") fails:
- AUTO try find_contact(mode: "person") (different pipeline: Google -> LinkedIn -> Prospeo).
- Present partial data AND try alternative enrichment.
- Only after all fallbacks fail, say enrichment is temporarily unavailable.

When push_to_phoneburner fails:
- Tell user what failed and which contacts affected.
- Offer retry or suggest manual PhoneBurner add.

General:
- NEVER leave user with just "an error occurred" — explain what happened and what to do next.
- If API consistently failing, suggest checking API keys in Supabase dashboard.
- If partial results, present them clearly and note what's missing.`,
  },

  buyer_onboarding: {
    title: 'Buyer Onboarding Process',
    content: `Step 1: Buyer submits connection request expressing interest in a deal or platform.
Step 2: SourceCo reviews credentials: firm type, investment thesis, deal history, AUM/funding, geographic/industry focus.
Step 3: NDA execution via DocuSeal before accessing confidential deal information.
Step 4: Fee agreement — buyer acknowledges SourceCo's fee structure.
Step 5: Profile activation — buyer profile created in remarketing system with initial scoring.
Step 6: Deal matching — buyer scored against active deals by geography, industry, size, services, owner goals.

Timeline: typically 1-3 business days from request to deal access.
Track via connection_requests (NDA/fee status) and firm_agreements.`,
  },

  sourcing_process: {
    title: 'SourceCo Sourcing Process',
    content: `Core workflow: source deals -> enrich profiles -> build buyer universes -> score/rank buyers -> outreach to best-fit -> facilitate introductions -> track through pipeline.

- Deal sourcing: marketplace listings, CapTarget, GP Partners, valuation calculator, inbound leads, referrals. Check deal_source.
- Deal enrichment: AI scrapes company data (Firecrawl), LinkedIn (Apify), Google (reviews/ratings). Check enrichment_status/enriched_at.
- Universe building: each deal gets a buyer universe matched by industry, geography, size. Use get_universe_details.
- Scoring: every buyer scored 0-100 across dimensions. Use get_score_breakdown for breakdowns.
- Outreach: email, calls (PhoneBurner), memo distribution. Track via outreach_records and remarketing_outreach.
- Pipeline tracking: Lead -> NDA -> LOI -> Due Diligence -> Closed. Monitor with get_deal_health and get_follow_up_queue.`,
  },

  outreach_tracking: {
    title: 'Outreach Tracking Guide',
    content: `Tools:
- get_outreach_records: full history per deal (who contacted, when, NDA, meeting, next actions).
- get_outreach_records(source: "remarketing_outreach"): campaign-level status per buyer.
- get_document_engagement: who viewed teasers, memos, data room docs.

Key milestones: contacted_at, nda_sent_at, nda_signed_at, memo_sent (cim_sent_at in DB), meeting_scheduled_at, next_action, next_action_date, outcome.

Reporting format: "Buyer X: NDA signed Jan 15, memo sent Jan 20, meeting pending."
Flag stale outreach (no activity in 5+ business days) and overdue next actions.`,
  },

  tool_limitations: {
    title: 'Known Tool Limitations',
    content: `- get_analytics scoring_distribution: max 500 records. Note: "Based on [N] scored records."
- get_analytics(analysis_type: "conversion_funnel"): total_scored is ALL-TIME while other metrics are period-filtered. Conversion rates are understated.
- get_stale_deals: days_inactive from listing updated_at, NOT actual last activity. Cross-reference with get_outreach_records.
- get_deal_health: completed tasks previously overdue may still count as risk factors.
- match_leads_to_deals: simplified word matching. May miss related industries. Treat as suggestions, not definitive.
- search_transcripts: keyword substring matching, no relevance scoring. Use semantic_transcript_search for meaning-based search.
- get_buyer_profile: top 10 deal scores only. Note: "Showing top 10 scored deals."
- query_deals: default 25 results. If count = 25, actual may be higher — use get_pipeline_summary for accurate counts.`,
  },

  data_sources: {
    title: 'Data Sources Reference',
    content: `- listings: deals/sellers, captarget leads, marketplace listings.
- remarketing_buyers: buyer universe, PE firms, platform companies with scores.
- remarketing_scores: buyer-deal scoring data.
- remarketing_buyer_universes: named universes with criteria and weights.
- call_transcripts + deal_transcripts + buyer_transcripts: meeting recordings.
- valuation_leads: HVAC, collision, auto shop, general calculator leads.
- deal_activities: deal activity log. daily_standup_tasks: unified task system (entity_type='deal' for deal tasks).
- contacts: UNIFIED buyer+seller+advisor+internal table. Source of truth since Feb 28, 2026.
- data_room_access: data room access and NDA tracking.
- outreach_records: comprehensive outreach pipeline.
- remarketing_outreach: campaign outreach status per buyer.
- engagement_signals: buyer engagement events.
- score_snapshots: historical score snapshots.
- buyer_approve_decisions + buyer_pass_decisions: decision history with reasons.
- inbound_leads: website/form/referral leads.
- referral_partners + referral_submissions: broker/advisor partners.
- data_room_documents: deal data room files by category.
- lead_memos: AI-generated deal teasers and memos.
- enrichment_jobs + buyer_enrichment_queue: enrichment progress.
- connection_requests: buyer intake pipeline.
- connection_messages: message threads between admins and buyers.
- listing_conversations: deal-level conversation threads.
- deal_comments: internal admin discussion (threaded, with mentions).
- deal_referrals: email referrals with open/conversion tracking.
- deal_scoring_adjustments: custom weight multipliers per deal.
- buyer_learning_history: approve/pass decisions with scores at time of decision.
- firm_agreements: NDA and fee agreement status per company.
- nda_logs: full NDA action audit trail.
- contact_activities: PhoneBurner call history (attempts, dispositions, recordings, callbacks).
- enriched_contacts: contacts from Apify/Prospeo enrichment.
- contact_search_cache: 7-day enrichment search cache.
- phoneburner_sessions: dialing session logs.
- phoneburner_oauth_tokens: per-user PB access tokens.
- remarketing_buyer_contacts: FROZEN legacy data.
- industry_trackers: named verticals with deal/buyer counts and scoring configs.
- smartlead_campaigns: cold email campaigns linked to deals/universes.
- smartlead_campaign_leads: contacts mapped to campaign leads.
- smartlead_campaign_stats: periodic stat snapshots per campaign.
- smartlead_webhook_events: incoming Smartlead events.`,
  },

  platform_guide: {
    title: 'SourceCo Platform Features Guide',
    content: `**Data Sources (where deals come from):**
- CapTarget: external PE-backed acquisition targets from Google Sheets. Admin > ReMarketing > CapTarget Deals.
- GP Partners: General Partner referral network. Admin > ReMarketing > GP Partner Deals.
- Marketplace: public-facing deal marketplace. Admin > Marketplace.
- Inbound Leads: website forms, referral partners, manual entry. Admin > Inbound Leads.
- Valuation Leads: high-intent sellers via valuation calculator (HVAC, collision, auto shop, general). Admin > ReMarketing > Valuation Leads.
- Active Deals (Pipeline): deals actively marketed. Admin > Active Deals.

**Key Workflows:**
- Building a Buyer Universe: deal page > "Build Universe" or ask AI. Curated buyers matched by industry, geography, size. Scored 0-100.
- Sending an NDA: deal detail > select buyer > "Send NDA". Managed via firm_agreements. Track in firm_agreements and nda_logs.
- Sending a Fee Agreement: similar to NDA. Required before full deal access.
- Enriching Contacts: ask AI "find contacts at [company]" or Admin > Enrichment Queue.
- Building a Calling List: ask AI "build a calling list of [industry] owners". Searches all sources, finds contacts, compiles list.
- Pushing to PhoneBurner: after finding contacts with phones, "push to PhoneBurner". Creates dialing session.
- Running Email Campaign: set up in SmartLead (Settings > SmartLead). Link to deals/universes. Track in Admin > Campaigns.
- Scoring Buyers: automatic when added to universe. Geography, size, service, owner goals (all 0-100). Tiers: A (80+), B (60-79), C (40-59), D (<40).
- Uploading Documents: deal > Data Room > Upload. Categories: anonymous teaser, full memo, data room. Access controlled per buyer.
- Tracking Outreach: deal detail > Outreach tab. Shows contacted, NDA sent/signed, memo sent, meeting scheduled, outcome. Overdue flagged.

**What AI Can Do:** Search/analyze deals across all sources. Find/enrich contacts via LinkedIn+Prospeo. Build calling lists. Search transcripts. Score/rank buyers. Track outreach, tasks, pipeline health. Push to PhoneBurner/Smartlead. Generate memos/emails. Navigate/filter/sort UI.

**What AI Cannot Do:** Access external websites in real time (uses API integrations). Predict future market conditions. Access other companies' data. Send emails directly (drafts only). Delete data without confirmation.`,
  },

  task_system: {
    title: 'Task Management System Guide',
    content: `The Task Management System tracks M&A workflow actions tied to specific deals and buyers.

**CRITICAL RULE: Every task MUST be linked to a real entity.** Tasks are NOT generic to-dos — they are M&A actions for specific deals, listings, buyers, or contacts. Never create tasks without an entity link.

**Entity Types:**
- listing: A sellside engagement (company being sold). Primary deal entity. Most tasks link here.
- deal: A buyer-deal pipeline entry (specific buyer's pursuit of a listing). Links buyer to listing.
- buyer: A remarketing buyer (PE firm, strategic, etc.). For buyer-specific follow-ups.
- contact: A unified contact record. For individual outreach tasks.

**Task Sources:**
- manual: Created by a user through the UI or chatbot
- ai: Auto-extracted from call transcripts by the AI extraction pipeline
- template: Generated from deal process templates (e.g., "Start NDA Process")
- system: Auto-created by lifecycle triggers (listing status/deal stage changes)
- chatbot: Created via AI Command Center conversation

**Task Statuses:** pending, pending_approval, in_progress, completed, overdue, snoozed, cancelled, listing_closed

**Priority:** high, medium, low — affects sort order and aging tier classification

**Task Types (M&A-specific):**
- buyer_outreach: Initial buyer contact, introduction, follow-up calls
- nda_execution: NDA/fee agreement preparation, send, follow-up on signature
- meeting_prep: Prepare for buyer meetings, management presentations
- document_request: Deal memo distribution, data room setup, financial package
- ioi_loi_process: IOI/LOI review, negotiation, counter-offer tracking
- due_diligence: Due diligence coordination, Q&A management
- buyer_qualification: Buyer screening, fit assessment, scoring review
- seller_relationship: Seller communication, status updates, expectation management
- buyer_ic_followup: Investment committee follow-up, decision tracking
- follow_up: General follow-up action
- other: Miscellaneous deal-related task

**AI Task Constraints:**
- AI-generated tasks require entity_id (enforced by database constraint)
- AI tasks start as pending review (confirmed_at IS NULL) — user must confirm or dismiss
- AI tasks expire after 7 days if not reviewed (configurable via platform_settings)
- Relevance score threshold: 7/10 minimum (configurable)
- Only "high" or "medium" confidence tasks are saved; low confidence is discarded

**Deal Process Templates:**
Pre-built task sets for deal stages: Intake, Build Buyer Universe, NDA Execution, Deal Memo Distribution, IOI Phase, LOI Negotiation. Each creates 3-5 linked tasks with dependencies and due date offsets.

**Snooze:** Tasks can be snoozed for 1-30 days. A nightly pg_cron job wakes them up. Use for tasks that are valid but not actionable yet.

**Deal Lifecycle Automation:**
- Listing → sold: all open tasks auto-closed (status='listing_closed')
- Listing → inactive: all open tasks auto-snoozed (30 days)
- Listing → active (from inactive): snoozed tasks auto-woken
- Deal → Closed Won: tasks auto-completed
- Deal → Closed Lost: tasks auto-cancelled

**Buyer Spotlight:** Tracks contact cadence per buyer-deal pair. Flags buyers overdue for contact based on expected_contact_days. Never-contacted buyers are highest priority.

**Deal Signals:** AI-detected intelligence from call transcripts. Types: critical (deal risk), warning (attention needed), positive (good news), neutral (informational). Must be acknowledged by a team member.`,
  },
};

/** List available topics with titles. */
export function listTopics(): { slug: string; title: string }[] {
  return Object.entries(KNOWLEDGE_BASE).map(([slug, article]) => ({
    slug,
    title: article.title,
  }));
}

/** Retrieve a knowledge article by slug. */
export function getArticle(slug: string): KnowledgeArticle | null {
  return KNOWLEDGE_BASE[slug] ?? null;
}

/** Search articles by keyword in title or content. */
export function searchArticles(query: string): { slug: string; title: string }[] {
  const q = query.toLowerCase();
  return Object.entries(KNOWLEDGE_BASE)
    .filter(
      ([, article]) =>
        article.title.toLowerCase().includes(q) || article.content.toLowerCase().includes(q),
    )
    .map(([slug, article]) => ({ slug, title: article.title }));
}
