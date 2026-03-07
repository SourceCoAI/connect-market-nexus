/**
 * AI Command Center - Intent Router
 * Uses Haiku for fast intent classification (< 500ms).
 * Context bypass: skips LLM when page context makes intent obvious.
 */

import { callClaude, CLAUDE_MODELS } from '../_shared/claude-client.ts';

// ---------- Router output ----------

export interface RouterResult {
  category: string;
  tier: 'QUICK' | 'STANDARD' | 'DEEP';
  tools: string[];
  confidence: number;
  bypassed: boolean;
}

// ---------- Context bypass rules ----------

interface PageContext {
  page?: string; // Current page: 'deal_detail', 'buyers_list', 'pipeline', 'remarketing', etc.
  entity_id?: string; // Current deal/buyer ID if on a detail page
  entity_type?: string; // 'deal', 'buyer', 'universe'
  tab?: string; // Current tab within the page
}

const BYPASS_RULES: Array<{
  test: (query: string, ctx: PageContext) => boolean;
  result: Omit<RouterResult, 'bypassed'>;
}> = [
  // Pipeline overview questions / daily briefing
  {
    test: (q) =>
      /\b(pipeline summary|pipeline overview|how.?s the pipeline|daily briefing|morning briefing|good morning|what.?s new|catch me up|give me a.*briefing|start.?of.?day|daily update)\b/i.test(
        q,
      ) || /^(pipeline|summary|overview|briefing|daily)\b(?!.{0,20}\b(deal|buyer|universe|listing|company|score|contact|lead))/i.test(q),
    result: {
      category: 'DAILY_BRIEFING',
      tier: 'STANDARD',
      tools: ['get_follow_up_queue', 'get_analytics'],
      confidence: 0.9,
    },
  },
  // Industry-specific deal count — "how many hvac deals", "total plumbing deals", "count of collision deals"
  {
    test: (q) =>
      /\b(how many|total|count|number of)\b.*\b(deals?|listings?)\b/i.test(q) &&
      /\b(hvac|plumbing|collision|auto|roofing|electrical|landscaping|pest|home service|restoration|mechanical|industrial|manufacturing|construction|fire|security|cleaning|staffing|healthcare|dental|veterinary|fitness)/i.test(
        q,
      ),
    result: {
      category: 'PIPELINE_ANALYTICS',
      tier: 'STANDARD',
      tools: ['get_pipeline_summary', 'query_deals'],
      confidence: 0.95,
    },
  },
  // Aggregate / count / breakdown questions — "how many deals", "total deals", "breakdown of deals by status"
  {
    test: (q) =>
      /\b(how many|total|count|number of)\b.*\b(deals?|listings?|active deals?|pipeline deals?)\b/i.test(
        q,
      ) ||
      /\b(deals?|listings?)\b.*\b(how many|total|count)\b/i.test(q) ||
      /\b(breakdown|distribution|split)\b.*\b(deals?|listings?)\b/i.test(q) ||
      /\b(deals?|listings?)\b.*\b(breakdown|distribution|by status|by stage|by industry)\b/i.test(
        q,
      ),
    result: {
      category: 'PIPELINE_ANALYTICS',
      tier: 'STANDARD',
      tools: ['get_pipeline_summary', 'query_deals'],
      confidence: 0.92,
    },
  },
  // Industry-level pipeline analysis — "which industries have the most deals"
  {
    test: (q) =>
      /\b(which|what)\s+(industries|verticals|sectors)\b.*\b(most|deals|pipeline)\b/i.test(q) ||
      /\b(deals?|listings?)\b.*\b(by industry|per industry|by vertical|by sector)\b/i.test(q),
    result: {
      category: 'PIPELINE_ANALYTICS',
      tier: 'STANDARD',
      tools: ['get_pipeline_summary', 'query_deals'],
      confidence: 0.9,
    },
  },
  // Deal lookup by name — "what kind of company is X", "tell me about [deal name]", "what is [company]"
  {
    test: (q) =>
      /\b(what kind of|what type of|tell me about|what is|info on|details on|look up|pull up)\b.*(company|deal|business|firm|listing)/i.test(
        q,
      ) ||
      /\b(company|deal|business|firm|listing)\b.*(what kind|what type|tell me|what is)/i.test(q),
    result: {
      category: 'DEAL_STATUS',
      tier: 'STANDARD',
      tools: ['query_deals', 'get_deal_details'],
      confidence: 0.9,
    },
  },
  // Deal filtering — "show me deals in [industry/stage]", "which deals are in [stage]", "deals in screening"
  // NOTE: excludes queries about contacts, platform features, content creation, and engagement —
  //       these should route to their specific categories instead.
  {
    test: (q) =>
      // Skip platform guide questions ("how do I", "what does X do", "explain")
      !/\b(how (do|does|can|should) I|what does|what is the\b.{0,30}\b(system|feature|tool|method))\b/i.test(
        q,
      ) &&
      // Skip contact queries ("who is the contact for", "main contact for")
      !/\bcontacts?\s+(at|for)\b/i.test(q) &&
      !/\b(who.?s the|main contact|find contacts?|list.*contacts?)\b/i.test(q) &&
      // Skip content creation ("create a memo", "write a teaser", "generate a list")
      !/\b(create|write|draft|compose|generate)\s+(a|an|the|my)\b/i.test(q) &&
      // Skip engagement queries
      !/\b(interest|engaged|engagement|most interest)\b/i.test(q) &&
      // Skip enrichment queries ("enrichment data", "enrichment status")
      !/\benrichment\b/i.test(q) &&
      // Skip analytics-level "deal flow" queries
      !/\bdeal flow\b/i.test(q) &&
      // Skip action intent ("add a note", "add a task", "create a task")
      !/\b(add\s+(a\s+)?note|add\s+(a\s+)?task|create\s+(a\s+)?task)\b/i.test(q) &&
      (/\b(show|list|which|what)\b.*\bdeals?\b.*\b(in|at|in the)\b/i.test(q) ||
        /\bdeals?\b.*\b(in|at)\s+(the\s+)?(screening|active marketing|loi|under loi|closed|dead|prospect|due diligence)\b/i.test(
          q,
        ) ||
        /\b(our|the|most|latest|recent|newest)\b.*\bdeals?\b/i.test(q)),
    result: {
      category: 'DEAL_STATUS',
      tier: 'STANDARD',
      tools: ['query_deals', 'get_pipeline_summary'],
      confidence: 0.88,
    },
  },
  // Deal-specific questions when on a deal page
  {
    test: (q, ctx) =>
      !!ctx.entity_id &&
      ctx.entity_type === 'deal' &&
      /^(status|where|stage|update|what.?s happening)/i.test(q),
    result: {
      category: 'DEAL_STATUS',
      tier: 'QUICK',
      tools: ['get_deal_details'],
      confidence: 0.95,
    },
  },
  // Task inbox — "what's on my plate", "my tasks", "task inbox", "what do I need to do"
  {
    test: (q) =>
      /\b(my tasks|task inbox|what.?s on my plate|what do I need|what should I|show me my|my to.?do)\b/i.test(
        q,
      ),
    result: {
      category: 'TASK_INBOX',
      tier: 'STANDARD',
      tools: ['get_task_inbox', 'get_daily_briefing', 'get_overdue_tasks'],
      confidence: 0.92,
    },
  },
  // Buyer spotlight / overdue contacts
  {
    test: (q) =>
      /\b(buyer spotlight|which buyers need|buyers? overdue|who haven.?t we contacted|buyer follow.?up)\b/i.test(
        q,
      ),
    result: {
      category: 'TASK_INBOX',
      tier: 'STANDARD',
      tools: ['get_buyer_spotlight', 'get_task_inbox'],
      confidence: 0.9,
    },
  },
  // Deal signals / risks
  {
    test: (q) =>
      /\b(deal signals?|deal risks?|what should I be worried|critical signals?|warning signals?)\b/i.test(
        q,
      ),
    result: {
      category: 'TASK_INBOX',
      tier: 'STANDARD',
      tools: ['get_deal_signals_summary', 'get_task_inbox'],
      confidence: 0.9,
    },
  },
  // Complete task — "mark task done", "I finished the task", "task is done", "complete the task"
  {
    test: (q) =>
      /\b(mark.*done|mark.*complete|finished.*task|task.*done|complete.*task|completed)\b/i.test(q),
    result: {
      category: 'TASK_INBOX',
      tier: 'QUICK',
      tools: ['complete_task', 'get_task_inbox'],
      confidence: 0.92,
    },
  },
  // Bulk task creation — "set a task for every", "create tasks for all", "add a follow-up for each"
  {
    test: (q) =>
      /\b(task|follow.?up|reminder)\b.*\b(every|all|each)\b/i.test(q) ||
      /\b(every|all|each)\b.*\b(task|follow.?up|reminder)\b/i.test(q) ||
      /\b(set|create|add)\b.*\btask\b.*\b(every|all|each|every single)\b/i.test(q),
    result: {
      category: 'TASK_INBOX',
      tier: 'STANDARD',
      tools: ['query_deals', 'search_buyers', 'bulk_create_tasks'],
      confidence: 0.9,
    },
  },
  // Snooze task
  {
    test: (q) => /\b(snooze|snooze task|snooze this)\b/i.test(q),
    result: {
      category: 'TASK_INBOX',
      tier: 'QUICK',
      tools: ['snooze_task'],
      confidence: 0.95,
    },
  },
  // Tasks / follow-ups (general)
  {
    test: (q) =>
      // Skip calling/contact list queries — those route to CONTACT_ENRICHMENT
      !/\b(calling list|contact list|outreach list|prospect list|call list)\b/i.test(q) &&
      /\b(task|todo|to-do|follow.?up|overdue|pending|assigned)\b/i.test(q),
    result: {
      category: 'FOLLOW_UP',
      tier: 'QUICK',
      tools: ['get_deal_tasks', 'get_current_user_context', 'get_task_inbox'],
      confidence: 0.85,
    },
  },
  // Buyer search
  // NOTE: excludes "engagement" queries which should route to ENGAGEMENT instead
  {
    test: (q) =>
      !/\bengagement\b/i.test(q) &&
      // Skip engagement-intent interest queries — those route to ENGAGEMENT
      // (but allow "interested in X" which is a search filter, not engagement)
      !/\b(most interest|shown.*interest|expressed.*interest|interest.*recently)\b/i.test(q) &&
      // Skip calling list / phone number queries — those route to CONTACT_ENRICHMENT
      !/\b(calling list|contact list|phone numbers?|with phones?)\b/i.test(q) &&
      /\b(buyers?|acquirers?|PE firms?|strategics?|search buyer|find buyer)\b/i.test(q) &&
      /\b(search|find|show|list|who|which|located|based)\b/i.test(q),
    result: {
      category: 'BUYER_SEARCH',
      tier: 'STANDARD',
      tools: ['search_buyers', 'search_buyer_universes'],
      confidence: 0.85,
    },
  },
  // Buyer intel — "what do we know about X as a buyer", "tell me about X buyer"
  {
    test: (q) =>
      /\b(what do we know|what do you know|background on|intel on|research on)\b.*\b(buyer|acquirer|firm|investor)\b/i.test(
        q,
      ) ||
      /\b(buyer|acquirer|firm|investor)\b.*\b(what do we know|background|intel|research)\b/i.test(
        q,
      ),
    result: {
      category: 'BUYER_SEARCH',
      tier: 'STANDARD',
      tools: ['search_buyers', 'get_buyer_profile', 'search_contacts'],
      confidence: 0.88,
    },
  },
  // Score questions and "best buyer for X" — includes search_buyers for hypothetical deals without a deal_id
  {
    test: (q) =>
      !/\bhow does\b.*\b(work|function)\b/i.test(q) &&
      !/\bwhat (does|is)\b.*\b(system|feature|methodology)\b/i.test(q) &&
      /\b(score|scoring|rank|top buyer|best buyer|fit)\b/i.test(q),
    result: {
      category: 'BUYER_ANALYSIS',
      tier: 'STANDARD',
      tools: ['search_buyers', 'get_top_buyers_for_deal', 'get_score_breakdown', 'query_deals'],
      confidence: 0.85,
    },
  },
  // Transcript / meeting questions
  // NOTE: Excluded bare "call" — it's too ambiguous (matches "call history", "did we call X", "call me back").
  // PhoneBurner call history and semantic search rules handle those cases with higher specificity.
  // Also excluded bare "said"/"mentioned" to avoid blocking semantic search rule ("what did X say about").
  {
    test: (q) =>
      // Skip queries about call history/logs (these route to ENGAGEMENT)
      !/\b(call history|call log|call activity|did we call|have we called)\b/i.test(q) &&
      // Skip queries better served by semantic search ("what did X say about Y")
      !/\bwhat did\b.*\bsay\b/i.test(q) &&
      !/\banyone\b.*\bmention/i.test(q) &&
      /\b(transcripts?|call recording|meeting notes?|meeting with|fireflies|recording|said|mentions?|mentioned|discussed)\b/i.test(
        q,
      ),
    result: {
      category: 'MEETING_INTEL',
      tier: 'STANDARD',
      tools: ['semantic_transcript_search', 'search_transcripts'],
      confidence: 0.8,
    },
  },
  // Universe buyer fit selection — "select not fits", "check the non-fits", "select passed/disqualified buyers"
  {
    test: (q, ctx) =>
      (ctx.entity_type === 'universe' || /\buniverse\b/i.test(q)) &&
      (/\b(not\s*fits?|non.?fits?|passed|disqualified|bad fits?|poor fits?|weak fits?)\b/i.test(
        q,
      ) ||
        /\b(select|check|pick)\b.*\b(not|non|bad|poor|weak|passed|disqualified)\b/i.test(q)),
    result: {
      category: 'BUYER_UNIVERSE',
      tier: 'STANDARD',
      tools: ['get_universe_buyer_fits', 'select_table_rows', 'search_buyer_universes'],
      confidence: 0.95,
    },
  },
  // Push to dialer / smartlead / heyreach — "push selected to dialer", "send these to smartlead"
  {
    test: (q) =>
      /\b(push|send|export|add)\b.*\b(dialer|phoneburner|phone\s*burner|smartlead|smart\s*lead|heyreach|hey\s*reach|email campaign)\b/i.test(
        q,
      ) || /\b(dialer|phoneburner|smartlead|heyreach)\b/i.test(q),
    result: {
      category: 'REMARKETING',
      tier: 'STANDARD',
      tools: ['search_buyers', 'query_deals', 'select_table_rows', 'trigger_page_action'],
      confidence: 0.92,
    },
  },
  // Remove from universe — "remove selected from universe", "take these out of the universe"
  {
    test: (q, ctx) =>
      ctx.entity_type === 'universe' &&
      /\b(remove|delete|take out|drop)\b.*\b(from|selected|buyers?)\b/i.test(q),
    result: {
      category: 'BUYER_UNIVERSE',
      tier: 'STANDARD',
      tools: ['get_universe_buyer_fits', 'select_table_rows', 'trigger_page_action'],
      confidence: 0.92,
    },
  },
  // Select / filter / sort on UNIVERSE page → route to BUYER_UNIVERSE so tools stay scoped
  {
    test: (q, ctx) =>
      (ctx.entity_type === 'universe' || ctx.page === 'universe_detail' || /\buniverse\b/i.test(q)) &&
      /\b(select|check|pick|highlight|filter|show only|narrow|within \d+ miles|sort|order by|arrange|sort by)\b/i.test(
        q,
      ),
    result: {
      category: 'BUYER_UNIVERSE',
      tier: 'STANDARD',
      tools: [
        'search_buyers',
        'get_universe_buyer_fits',
        'search_buyer_universes',
        'select_table_rows',
        'apply_table_filter',
        'sort_table_column',
        'trigger_page_action',
      ],
      confidence: 0.9,
    },
  },
  // Select / filter / sort / action on table rows (non-universe pages)
  {
    test: (q) =>
      /\b(select|check|pick|highlight|filter|show only|narrow|within \d+ miles|sort|order by|arrange|sort by)\b/i.test(
        q,
      ),
    result: {
      category: 'REMARKETING',
      tier: 'STANDARD',
      tools: [
        'search_buyers',
        'query_deals',
        'select_table_rows',
        'apply_table_filter',
        'sort_table_column',
        'trigger_page_action',
      ],
      confidence: 0.85,
    },
  },
  // Create task / add note
  {
    test: (q) =>
      /\b(create\s+(a\s+)?task|add\s+(a\s+)?task|new task|add\s+(a\s+)?note|log|remind me)\b/i.test(
        q,
      ),
    result: {
      category: 'ACTION',
      tier: 'STANDARD',
      tools: ['create_task', 'create_deal_task', 'add_deal_note'],
      confidence: 0.9,
    },
  },
  // Stage change
  {
    test: (q) => /\b(update stage|change stage|move to|advance|promote)\b/i.test(q),
    result: { category: 'ACTION', tier: 'STANDARD', tools: ['update_deal_stage'], confidence: 0.9 },
  },
  // Data room access
  {
    test: (q) => /\b(data room|grant access|give access|open data room)\b/i.test(q),
    result: {
      category: 'ACTION',
      tier: 'STANDARD',
      tools: ['grant_data_room_access'],
      confidence: 0.9,
    },
  },
  // Analytics / reports
  {
    test: (q) =>
      /\b(analytics|report|metrics|performance|trend|chart|dashboard|deal flow|month over month|year over year|week over week|compare.*month)\b/i.test(
        q,
      ),
    result: {
      category: 'PIPELINE_ANALYTICS',
      tier: 'STANDARD',
      tools: ['get_analytics', 'get_pipeline_summary'],
      confidence: 0.8,
    },
  },
  // Meeting prep / content generation
  {
    test: (q) => /\b(prep|prepare|meeting prep|brief me|briefing|get me ready)\b/i.test(q),
    result: {
      category: 'MEETING_PREP',
      tier: 'DEEP',
      tools: [
        'get_deal_details',
        'get_top_buyers_for_deal',
        'search_transcripts',
        'get_deal_tasks',
      ],
      confidence: 0.85,
    },
  },
  // Outreach drafting — matches intent to compose/send a message.
  // NOTE: bare "outreach" removed to avoid catching "outreach status/campaigns" (tracking queries).
  // NOTE: bare "email" removed to avoid catching "find email for X" (contact lookups).
  // Drafting intent is captured by draft/write/compose + optional "email/message".
  {
    test: (q) =>
      /\b(draft|write|compose)\b/i.test(q) ||
      /\b(create|generate)\s+(a\s+|an?\s+|the\s+)?(cim|teaser|memo|executive summary|outreach|email|message|proposal|template|pitch|one[- ]?pager)\b/i.test(
        q,
      ) ||
      /\b(send\s+(a\s+)?message|send\s+(an?\s+)?email)\b/i.test(q),
    result: {
      category: 'OUTREACH_DRAFT',
      tier: 'DEEP',
      tools: ['get_deal_details', 'get_buyer_profile'],
      confidence: 0.8,
    },
  },
  // Lead source queries — captarget, valuation calculator leads, go partners, etc.
  {
    test: (q) =>
      /\b(cp target|captarget|go partners|marketplace|lead source|lead sources|valuation lead|calculator lead|leads tracker)\b/i.test(
        q,
      ),
    result: {
      category: 'BUYER_SEARCH',
      tier: 'STANDARD',
      tools: ['search_lead_sources', 'search_valuation_leads', 'query_deals'],
      confidence: 0.85,
    },
  },
  // Buyer universe geographic questions — "how many buyers in X universe are in [state]"
  // NOTE: excludes "how do I" questions about universes which should route to PLATFORM_GUIDE
  {
    test: (q) =>
      !/\b(how (do|does|can|should) I|how to|create|set up|build)\b/i.test(q) &&
      // Skip enrichment queries — those route to CONTACT_ENRICHMENT
      !/\benrich\b/i.test(q) &&
      /\b(buyer universe|universe|how many buyer|buyers.*locat|location.*buyer)\b/i.test(q),
    result: {
      category: 'BUYER_UNIVERSE',
      tier: 'STANDARD',
      tools: [
        'search_buyer_universes',
        'get_universe_details',
        'get_top_buyers_for_deal',
        'search_buyers',
      ],
      confidence: 0.87,
    },
  },
  // Outreach tracking — NDA, contacted, meeting, follow-up pipeline, outreach campaigns
  {
    test: (q) =>
      /\b(outreach status|outreach campaigns?|status of.*outreach|nda|contacted|who.?ve we|who have we|follow.?up pipeline|overdue action|next action|meeting scheduled|cim sent)\b/i.test(
        q,
      ),
    result: {
      category: 'FOLLOW_UP',
      tier: 'STANDARD',
      tools: ['get_outreach_records', 'get_deal_tasks', 'get_outreach_status'],
      confidence: 0.85,
    },
  },
  // Smartlead email campaigns — campaign status, email outreach, cold email
  {
    test: (q) =>
      /\b(smartlead|smart.?lead|email campaign|cold email|email outreach|email sequence|campaign stats|campaign performance|how.?s the email|email history|outreach email|drip campaign|email cadence)\b/i.test(
        q,
      ),
    result: {
      category: 'SMARTLEAD_OUTREACH',
      tier: 'STANDARD',
      tools: [
        'get_smartlead_campaigns',
        'get_smartlead_campaign_stats',
        'get_smartlead_email_history',
      ],
      confidence: 0.9,
    },
  },
  // Push to Smartlead — add to email campaign
  {
    test: (q) =>
      /\b(push.*(smartlead|smart.?lead|email campaigns?)|add.*(email campaigns?|smartlead)|email.*(these|them|buyer)|start emailing|cold email.*(these|them|push))\b/i.test(
        q,
      ),
    result: {
      category: 'SMARTLEAD_OUTREACH',
      tier: 'STANDARD',
      tools: ['push_to_smartlead', 'get_smartlead_campaigns', 'search_buyers', 'search_contacts'],
      confidence: 0.92,
    },
  },
  // PhoneBurner call history — call activity, call logs, calling questions
  {
    test: (q) =>
      /\b(call history|call log|call activity|phone.?burner|have we called|been called|how many calls|calling session|last call|call outcome|call.?disposition|did.+call|who called|dialing|dial.?session|cold call|talk time)\b/i.test(
        q,
      ),
    result: {
      category: 'ENGAGEMENT',
      tier: 'STANDARD',
      tools: ['get_call_history', 'get_buyer_signals'],
      confidence: 0.88,
    },
  },
  // Engagement signals — buyer engagement events, interest signals
  {
    test: (q) =>
      /\b(engagement signal|buyer signal|how engaged|site visit|ioi|loi|letter of intent|indication of interest|ceo involved|financial request)\b/i.test(
        q,
      ) ||
      /\b(engagement)\b.*\b(activity|feed|history|latest|recent|update)\b/i.test(q) ||
      /\b(latest|recent)\b.*\b(engagement|buyer activity)\b/i.test(q) ||
      /\b(most interest|shown.*interest|expressed.*interest|interest.*recently)\b/i.test(q),
    result: {
      category: 'ENGAGEMENT',
      tier: 'STANDARD',
      tools: ['get_buyer_signals', 'get_buyer_history'],
      confidence: 0.87,
    },
  },
  // Buyer decisions — approved, passed, pass reasons
  {
    test: (q) =>
      /\b(pass.?reason|passed on|why.?pass|approve.?decision|declined|rejected|pass categor)\b/i.test(
        q,
      ),
    result: {
      category: 'ENGAGEMENT',
      tier: 'STANDARD',
      tools: ['get_buyer_signals'],
      confidence: 0.85,
    },
  },
  // Inbound leads — website leads, form submissions
  {
    test: (q) =>
      /\b(inbound lead|website lead|form lead|lead status|lead source|new lead|pending lead|converted lead)\b/i.test(
        q,
      ),
    result: {
      category: 'LEAD_INTEL',
      tier: 'STANDARD',
      tools: ['search_inbound_leads', 'get_referral_data'],
      confidence: 0.85,
    },
  },
  // Referral partners / broker submissions
  {
    test: (q) =>
      /\b(referral partner|broker partner|referral submission|deal submission|advisor partner|submitted deal)\b/i.test(
        q,
      ),
    result: {
      category: 'LEAD_INTEL',
      tier: 'STANDARD',
      tools: ['get_referral_data', 'search_inbound_leads'],
      confidence: 0.87,
    },
  },
  // LinkedIn URL pasted — enrich that person's contact info via Prospeo + Clay
  {
    test: (q) => /linkedin\.com\/in\//i.test(q),
    result: {
      category: 'CONTACTS',
      tier: 'STANDARD',
      tools: ['enrich_contact', 'clay_find_email', 'search_contacts', 'save_contacts_to_crm'],
      confidence: 0.95,
    },
  },
  // PE / platform contacts — find who to call, email at a firm, person email lookups
  // NOTE: Skip if query starts with "enrich" — those go to CONTACT_ENRICHMENT rule instead
  {
    test: (q) =>
      !/\benrich\b/i.test(q) &&
      // Skip "find N contacts at X" — those route to CONTACT_ENRICHMENT
      !/\bfind\s+(\d+\s+)?contacts?\s+(at|for|from)\b/i.test(q) &&
      (/\bcontacts?\s+(at|for)\b/i.test(q) ||
        /\b(who.?s the|find contacts?|emails? for|phones? for|partner at|principal at|deal team|pe contacts?|platform contacts?)\b/i.test(
          q,
        ) ||
        /\b(what.?s|what is|do we have|get me|look up|find).{0,60}\b(emails?|phones?|contact info)\b/i.test(
          q,
        ) ||
        // "[person]'s email" or "email for [person/company]"
        /\b\w+.?s\s+emails?\b/i.test(q) ||
        /\b(emails?|phones?)\s+(address(es)?\s+)?(for|of)\b/i.test(q) ||
        /\bemails?\b.*\b(address)\b/i.test(q) ||
        /\b(show me|list|who are)\b.*\bcontacts?\b/i.test(q) ||
        /\b(recently|most recent|newest|latest)\b.*\bcontacts?\b/i.test(q)),
    result: {
      category: 'CONTACTS',
      tier: 'STANDARD',
      tools: [
        'find_contact',
        'search_contacts',
        'search_pe_contacts',
        'enrich_contact',
        'clay_find_email',
        'get_buyer_profile',
      ],
      confidence: 0.87,
    },
  },
  // Clay email lookup — explicit "clay" keyword or "use clay"
  {
    test: (q) => /\bclay\b/i.test(q),
    result: {
      category: 'CONTACT_ENRICHMENT',
      tier: 'STANDARD',
      tools: ['clay_find_email', 'enrich_contact', 'search_contacts'],
      confidence: 0.95,
    },
  },
  // Deal documents and memos — looking up existing docs
  // NOTE: excludes content creation ("create a memo", "write a teaser") → OUTREACH_DRAFT
  {
    test: (q) =>
      !/\b(create|write|draft|compose|generate|build)\s+(a|an|the|my)\b/i.test(q) &&
      /\b(document|data room file|teaser|memo|investment memo|cim|anonymous teaser|full memo)\b/i.test(
        q,
      ),
    result: {
      category: 'DEAL_STATUS',
      tier: 'STANDARD',
      tools: ['get_deal_documents', 'get_deal_memos', 'get_deal_details'],
      confidence: 0.85,
    },
  },
  // Score history
  {
    test: (q) =>
      /\b(score history|score change|score over time|historical score|score trend)\b/i.test(q),
    result: {
      category: 'ENGAGEMENT',
      tier: 'STANDARD',
      tools: ['get_buyer_history', 'get_score_breakdown'],
      confidence: 0.87,
    },
  },
  // Why did buyer score X — explainable scoring
  {
    test: (q) =>
      /\b(why.*score|explain.*score|score.*because|score.*breakdown|how.*score.*calculated)\b/i.test(
        q,
      ),
    result: {
      category: 'BUYER_ANALYSIS',
      tier: 'STANDARD',
      tools: ['get_score_breakdown'],
      confidence: 0.92,
    },
  },
  // Cross-deal / cross-universe analytics
  {
    test: (q) =>
      /\b(cross.?deal|compare.*universe|compare.*deal|conversion rate|which universe|best.*universe|worst.*universe|across.*deal)\b/i.test(
        q,
      ),
    result: {
      category: 'CROSS_DEAL',
      tier: 'STANDARD',
      tools: ['get_analytics'],
      confidence: 0.9,
    },
  },
  // Semantic transcript search — intent-based
  {
    test: (q) =>
      /\b(what did.*say|what was said|anyone.*mention|discuss.*about|talk.*about|sentiment|intent)\b/i.test(
        q,
      ),
    result: {
      category: 'SEMANTIC_SEARCH',
      tier: 'STANDARD',
      tools: ['semantic_transcript_search'],
      confidence: 0.88,
    },
  },
  // Enrichment status
  {
    test: (q) =>
      /\b(enrichment|enrich status|data enrich|enrichment job|enrichment queue)\b/i.test(q),
    result: {
      category: 'PIPELINE_ANALYTICS',
      tier: 'QUICK',
      tools: ['get_enrichment_status'],
      confidence: 0.9,
    },
  },
  // Connection requests — buyer intake pipeline
  {
    test: (q) =>
      /\b(connection requests?|buyer requests?|connect requests?|who requested|requested access|request.*deal|buyer.*connect|intake)\b/i.test(
        q,
      ),
    result: {
      category: 'CONNECTION',
      tier: 'STANDARD',
      tools: ['get_connection_requests', 'get_connection_messages'],
      confidence: 0.87,
    },
  },
  // Conversation / messages on a deal
  {
    test: (q) =>
      /\b(message|conversation|thread|what.?did.*say|chat|correspondence|communication)\b/i.test(q),
    result: {
      category: 'CONNECTION',
      tier: 'STANDARD',
      tools: ['get_connection_messages', 'get_deal_communication', 'get_connection_requests'],
      confidence: 0.82,
    },
  },
  // NDA logs / fee agreement audit
  {
    test: (q) =>
      /\b(nda log|fee agreement|fee log|agreement signed|who signed|firm agreement|agreement status)\b/i.test(
        q,
      ),
    result: {
      category: 'CONTACTS',
      tier: 'STANDARD',
      tools: ['get_firm_agreements', 'get_nda_logs'],
      confidence: 0.87,
    },
  },
  // Deal referrals
  {
    test: (q) =>
      /\b(deal referral|referral email|shared.*deal|referred.*deal|referral.*convert|deal.*share)\b/i.test(
        q,
      ),
    result: {
      category: 'LEAD_INTEL',
      tier: 'STANDARD',
      tools: ['get_deal_referrals', 'get_referral_data'],
      confidence: 0.85,
    },
  },
  // Buyer learning history
  {
    test: (q) =>
      /\b(learning history|buyer learning|decision history|what.*buyer.*decision|score.*when.*pass|score.*when.*approv)\b/i.test(
        q,
      ),
    result: {
      category: 'ENGAGEMENT',
      tier: 'STANDARD',
      tools: ['get_buyer_history', 'get_buyer_signals'],
      confidence: 0.85,
    },
  },
  // Industry research — "tell me about X industry", "prep me for a call with X"
  {
    test: (q) =>
      /\b(tell me about|what should I know about|prep me for|don.?t know anything about|research the|industry overview|industry primer|what do PE buyers look for in)\b/i.test(
        q,
      ) && /\b(industry|vertical|sector|space|market|company|business)\b/i.test(q),
    result: {
      category: 'INDUSTRY',
      tier: 'DEEP',
      tools: [
        'research_industry',
        'google_search_companies',
        'semantic_transcript_search',
        'retrieve_knowledge',
      ],
      confidence: 0.88,
    },
  },
  // Industry research — "I have a call with a X company and don't know the space"
  {
    test: (q) =>
      /\b(have a call|meeting with|call with|prepping for)\b/i.test(q) &&
      /\b(don.?t know|no idea|not familiar|never dealt|first time|new to)\b/i.test(q),
    result: {
      category: 'INDUSTRY',
      tier: 'DEEP',
      tools: [
        'research_industry',
        'google_search_companies',
        'semantic_transcript_search',
        'retrieve_knowledge',
      ],
      confidence: 0.85,
    },
  },
  // Industry research — "what questions should I ask a X company"
  {
    test: (q) =>
      /\b(what questions|due diligence questions|diligence questions|questions.*ask|questions.*call)\b/i.test(
        q,
      ) && /\b(industry|company|business|firm|shop|vertical|sector)\b/i.test(q),
    result: {
      category: 'INDUSTRY',
      tier: 'DEEP',
      tools: ['research_industry', 'retrieve_knowledge'],
      confidence: 0.85,
    },
  },
  // Industry trackers (narrow — just tracker/config lookups)
  {
    test: (q) =>
      /\b(industry tracker|tracker|which industries|industry vertical|vertical.*deal|scoring config)\b/i.test(
        q,
      ),
    result: {
      category: 'INDUSTRY',
      tier: 'QUICK',
      tools: ['get_industry_trackers', 'search_buyer_universes'],
      confidence: 0.85,
    },
  },
  // Deal comments
  {
    test: (q) =>
      /\b(comments?|internal notes?|deal notes?|team comments?|who comment|what.*comments?)\b/i.test(
        q,
      ),
    result: {
      category: 'DEAL_STATUS',
      tier: 'QUICK',
      tools: ['get_deal_communication', 'get_deal_details'],
      confidence: 0.85,
    },
  },
  // Scoring adjustments
  {
    test: (q) =>
      /\b(scoring adjustment|weight multiplier|custom.*scoring|scoring instruction|why.*score.*different)\b/i.test(
        q,
      ),
    result: {
      category: 'DEAL_STATUS',
      tier: 'STANDARD',
      tools: ['get_deal_scoring_adjustments', 'get_deal_details'],
      confidence: 0.85,
    },
  },
  // Contacts missing email/phone — "find contacts without email", "contacts missing email"
  {
    test: (q) =>
      /\b(contacts?\s+(missing|without|no|lacking)\s+(emails?|phones?))\b/i.test(q) ||
      /\b(missing\s+emails?|no\s+emails?|without\s+emails?)\b.*\bcontacts?\b/i.test(q) ||
      /\b(find|get|show|list)\s+.{0,50}\bcontacts?\b.{0,50}\b(missing|without|no)\s+(emails?|phones?)\b/i.test(
        q,
      ),
    result: {
      category: 'CONTACTS',
      tier: 'STANDARD',
      tools: ['search_contacts', 'enrich_contact'],
      confidence: 0.92,
    },
  },
  // Contact finder — find people at a company, get emails/phones
  // Routes to both internal search AND enrichment for new contacts
  {
    test: (q) =>
      /\b(find\s+(me\s+)?(contacts?|people|employees?|associates?|principals?|vps?|directors?|partners?|executives?|ceos?|cfos?|coos?|founders?|owners?|managing directors?|analysts?)\s+(at|for|from))\b/i.test(
        q,
      ) ||
      /\b(get\s+(me\s+)?(contact\s+info|email|phone|linkedin)\s+(for|at|of))\b/i.test(q) ||
      /\b(who\s+(works?|is)\s+at)\b/i.test(q) ||
      /\b(find\s+\d+.*\b(at|from)\b)/i.test(q),
    result: {
      category: 'CONTACT_ENRICHMENT',
      tier: 'STANDARD',
      tools: ['search_pe_contacts', 'search_contacts', 'enrich_contact', 'get_buyer_profile'],
      confidence: 0.92,
    },
  },
  // Find LinkedIn profiles for contacts
  {
    test: (q) =>
      /\b(find.*(linkedin|linked in)|search.*(linkedin|linked in)|linkedin.*(url|profile|search)|missing.*(linkedin|linked in))\b/i.test(
        q,
      ) && !/linkedin\.com\/in\//i.test(q),
    result: {
      category: 'CONTACT_ENRICHMENT',
      tier: 'STANDARD',
      tools: ['find_contact', 'search_contacts', 'enrich_contact', 'save_contacts_to_crm'],
      confidence: 0.92,
    },
  },
  // Enrich contacts / Prospeo / LinkedIn enrichment
  {
    test: (q) =>
      /\b(enrich|prospeo|linkedin scrape|find emails?|find phones?|discover contact|import contact|scrape)\b/i.test(
        q,
      ),
    result: {
      category: 'CONTACT_ENRICHMENT',
      tier: 'STANDARD',
      tools: [
        'enrich_contact',
        'clay_find_email',
        'search_contacts',
        'search_pe_contacts',
        'find_contact',
      ],
      confidence: 0.9,
    },
  },
  // Send NDA / fee agreement / DocuSeal
  {
    test: (q) =>
      /\b(send.*(nda|fee agreement|fee.?agree|non.?disclosure)|nda.*(send|deliver|email)|fee agreement.*(send|deliver|email))\b/i.test(
        q,
      ),
    result: {
      category: 'DOCUMENT_ACTION',
      tier: 'STANDARD',
      tools: ['send_document', 'get_firm_agreements', 'search_contacts', 'search_buyers'],
      confidence: 0.92,
    },
  },
  // Push to PhoneBurner / dialer
  {
    test: (q) =>
      /\b(push.*(phone.?burner|dialer|pb)|phone.?burner.*(push|add|load)|add.*(dialer|phone.?burner)|load.*(dialer|phone.?burner))\b/i.test(
        q,
      ),
    result: {
      category: 'ACTION',
      tier: 'STANDARD',
      tools: ['push_to_phoneburner', 'search_buyers', 'search_contacts'],
      confidence: 0.92,
    },
  },
  // Stale deals / inactive deals / gone quiet
  {
    test: (q) =>
      /\b(stale deal|inactive deal|gone quiet|no activity|dead deal|dormant deal|deals?.*(stale|inactive|quiet|dormant)|which deal.*(no|without).*(activity|update))\b/i.test(
        q,
      ),
    result: {
      category: 'FOLLOW_UP',
      tier: 'STANDARD',
      tools: ['get_stale_deals', 'get_follow_up_queue'],
      confidence: 0.9,
    },
  },
  // Document engagement / data room views / teaser opens
  {
    test: (q) =>
      /\b(who (opened|viewed|accessed)|data room.*(view|open|engage)|teaser.*(view|open)|document.*(engage|view|open|track)|viewed.*(teaser|memo|data room))\b/i.test(
        q,
      ),
    result: {
      category: 'ENGAGEMENT',
      tier: 'STANDARD',
      tools: ['get_document_engagement', 'get_buyer_signals'],
      confidence: 0.9,
    },
  },
  // Company/deal discovery — search deals/leads matching criteria
  {
    test: (q) =>
      /\b(find\s+(me\s+)?(companies|shops|businesses|firms|platforms)\s+(that|with|in|near|within))\b/i.test(
        q,
      ) ||
      /\b(discover\s+companies?|search\s+for\s+companies?|who\s+owns)\b/i.test(q) ||
      /\b(collision\s+repair|hvac|home\s+service|plumbing)\s+(shops?|companies?|businesses?).*\b(with|near|within|in)\b/i.test(
        q,
      ),
    result: {
      category: 'BUYER_SEARCH',
      tier: 'STANDARD',
      tools: ['query_deals', 'search_lead_sources', 'search_valuation_leads'],
      confidence: 0.9,
    },
  },
  // Google search — search google, search the web, look up
  {
    test: (q) =>
      /\b(google|search the web|search google|look up.*online|web search|search.*internet)\b/i.test(
        q,
      ),
    result: {
      category: 'GOOGLE_SEARCH',
      tier: 'STANDARD',
      tools: ['google_search_companies'],
      confidence: 0.92,
    },
  },
  // Save / add contacts — approval flow
  {
    test: (q) =>
      /\b(save|add|import|approve).*(contact|person|people|them|those|these).*(crm|system|database|to our)\b/i.test(
        q,
      ) ||
      /\b(add (them|those|these|the first|all)|save (them|those|these|the first|all))\b/i.test(q),
    result: {
      category: 'ACTION',
      tier: 'STANDARD',
      tools: ['save_contacts_to_crm'],
      confidence: 0.9,
    },
  },
  // Data quality — quality report, data gaps, incomplete profiles
  {
    test: (q) =>
      /\b(data quality|data gap|incomplete.*profile|profile completeness|data health|missing data|data audit)\b/i.test(
        q,
      ),
    result: {
      category: 'PROACTIVE',
      tier: 'STANDARD',
      tools: ['get_data_quality_report'],
      confidence: 0.9,
    },
  },
  // Buyer conflicts — overlap, conflict, multiple deals
  {
    test: (q) =>
      /\b(buyer conflict|buyer overlap|competing buyer|same buyer|multi.*deal buyer|cross.*deal.*buyer|buyer.*multiple deal)\b/i.test(
        q,
      ),
    result: {
      category: 'PROACTIVE',
      tier: 'STANDARD',
      tools: ['detect_buyer_conflicts'],
      confidence: 0.9,
    },
  },
  // Deal health — risk, health check, going cold, at risk
  {
    test: (q) =>
      /\b(deal health|health check|at risk|going cold|risk.*deal|deals? at risk|which deals?.*(risk|danger|trouble))\b/i.test(
        q,
      ),
    result: {
      category: 'PROACTIVE',
      tier: 'STANDARD',
      tools: ['get_deal_health', 'get_stale_deals'],
      confidence: 0.9,
    },
  },
  // Lead matching — match leads, lead matches, matching leads
  {
    test: (q) =>
      /\b(match.*lead|lead.*match|matching lead|lead.*fit|new lead.*deal|lead.*pipeline)\b/i.test(
        q,
      ),
    result: {
      category: 'PROACTIVE',
      tier: 'STANDARD',
      tools: ['match_leads_to_deals'],
      confidence: 0.88,
    },
  },
  // End of day recap / weekly recap
  {
    test: (q) =>
      /\b(end of day|eod|recap|what did I do|daily recap|weekly recap|end of week|eow|wrap up|summary of.*day|summary of.*week|what.*accomplish)\b/i.test(
        q,
      ),
    result: {
      category: 'EOD_RECAP',
      tier: 'STANDARD',
      tools: ['generate_eod_recap'],
      confidence: 0.9,
    },
  },
  // Reassign task
  {
    test: (q) =>
      /\b(reassign|re-assign|give.*task.*to|assign.*task.*to|transfer.*task|hand off.*task|delegate)\b/i.test(
        q,
      ),
    result: {
      category: 'ACTION',
      tier: 'STANDARD',
      tools: ['reassign_deal_task'],
      confidence: 0.9,
    },
  },
  // Convert to pipeline deal
  {
    test: (q) =>
      /\b(convert to.*deal|convert.*pipeline|move.*pipeline|create.*deal.*for|pipeline.*convert|make.*pipeline deal)\b/i.test(
        q,
      ),
    result: {
      category: 'DEAL_CONVERSION',
      tier: 'STANDARD',
      tools: ['convert_to_pipeline_deal', 'search_buyers', 'get_deal_details'],
      confidence: 0.9,
    },
  },
  // Platform help / "how do I" / "what is" questions about SourceCo features
  {
    test: (q) =>
      (/\b(how (do|does|can|should) I|how to|what is|what are|what does|explain|help me|teach me|show me how|guide|tutorial|walkthrough|what can you do|what tools|capabilities)\b/i.test(
        q,
      ) &&
        /\b(platform|sourceco|captarget|cap target|gp partner|go partner|marketplace|remarketing|universe|scoring|enrichment|data room|nda|fee agreement|phoneburner|phone burner|smartlead|smart lead|pipeline|outreach|chatbot|ai command|command center|this tool|this app|lead source|tracker|valuation|calling list|prospeo|apify|linkedin|memo|teaser|deal|buyer|contact)\b/i.test(
          q,
        )) ||
      /\b(what can (you|the (bot|chatbot|ai|assistant)) (do|help))\b/i.test(q) ||
      /\b(what can you help)\b/i.test(q) ||
      /\b(help|how does (this|it|the (platform|system|tool|chatbot|ai)) work)\b/i.test(q) ||
      /\bhow does\b.*\b(work|function)\b/i.test(q),
    result: {
      category: 'PLATFORM_GUIDE',
      tier: 'STANDARD',
      tools: ['get_current_user_context'],
      confidence: 0.95,
    },
  },
  // Building lists / compiling contacts — multi-step workflow
  {
    test: (q) =>
      /\b(build|compile|create|make|generate|put together|assemble)\b.*\b(list|roster|spreadsheet|report|directory)\b.*\b(owner|contact|phone|email|call)\b/i.test(
        q,
      ) || /\b(calling list|contact list|outreach list|prospect list|call list)\b/i.test(q),
    result: {
      category: 'CONTACT_ENRICHMENT',
      tier: 'STANDARD',
      tools: [
        'search_lead_sources',
        'search_valuation_leads',
        'query_deals',
        'search_contacts',
        'enrich_contact',
        'google_search_companies',
        'save_contacts_to_crm',
        'push_to_phoneburner',
      ],
      confidence: 0.92,
    },
  },
];

// ---------- LLM-based routing ----------

const ROUTER_SYSTEM_PROMPT = `You are an intent classifier for an M&A deal management platform. Classify the user's message into exactly one category and select the minimum tools needed.

Categories:
- DEAL_STATUS: Questions about specific deal details, status, stage, financials, documents, memos
- FOLLOW_UP: Tasks, to-dos, follow-ups, assignments, reminders, outreach tracking (NDA, meetings, next actions)
- BUYER_SEARCH: Finding or searching for buyers, leads, acquirers
- BUYER_ANALYSIS: Score breakdowns, rankings, fit analysis, comparisons, buyer contacts, explainable scoring
- BUYER_UNIVERSE: Buyer universe queries, universe details, geographic counts within a universe
- MEETING_INTEL: Call transcripts, meeting notes, what was discussed, semantic transcript search
- PIPELINE_ANALYTICS: Pipeline overview, metrics, trends, reports, enrichment status
- CROSS_DEAL: Cross-deal/universe comparisons, conversion rates, buyer type analysis, source quality
- SEMANTIC_SEARCH: Intent-based transcript search, "what did X say about Y"
- DAILY_BRIEFING: Morning briefing, what's happening, daily summary
- ACTION: Creating tasks, adding notes, updating stages, granting access
- REMARKETING: Selecting rows, filtering tables, remarketing operations
- UI_ACTION: Navigating to pages, applying filters to UI tables
- MEETING_PREP: Meeting preparation, briefings for specific meetings
- OUTREACH_DRAFT: Drafting emails, outreach messages, communications
- LEAD_INTEL: Inbound leads, referral partners, referral submissions, deal referrals, lead sources
- ENGAGEMENT: Engagement signals, buyer decisions (approve/pass), score history, interest signals, buyer learning history, PhoneBurner call history/call activity, document engagement/views
- CONNECTION: Buyer connection requests, deal conversation messages, buyer intake pipeline
- CONTACTS: PE contacts, platform contacts, firm agreements, NDA logs
- CONTACT_ENRICHMENT: Find and enrich new contacts at a company via LinkedIn/Prospeo, import contacts, discover emails, Google search for companies
- DOCUMENT_ACTION: Send NDA or fee agreement for signing, check agreement status
- PROACTIVE: Data quality audits, buyer conflict detection, deal health analysis, lead-to-deal matching
- EOD_RECAP: End-of-day/week recaps, daily summaries, "what did I do today"
- GOOGLE_SEARCH: Search Google for companies, websites, LinkedIn pages, research
- DEAL_CONVERSION: Convert remarketing match to pipeline deal
- SMARTLEAD_OUTREACH: Smartlead cold email campaigns, email outreach history, push contacts to email campaigns, campaign stats
- INDUSTRY: Industry research, vertical deep-dives, PE due diligence prep, "tell me about X industry", call prep for unfamiliar verticals, M&A trends in a sector, industry trackers, vertical scoring configs
- TASK_INBOX: Task inbox, "what's on my plate", create tasks, snooze tasks, confirm/dismiss AI tasks, buyer spotlight, deal signals, bulk reassign
- PLATFORM_GUIDE: Questions about how to use the platform, what features do, how workflows work, what the chatbot can do
- GENERAL: Other / unclear intent

Available tools: query_deals, get_deal_details, get_deal_activities, get_deal_tasks, get_deal_documents, get_deal_memos, get_deal_communication, get_deal_scoring_adjustments, get_deal_referrals, get_pipeline_summary, search_buyers, get_buyer_profile, get_score_breakdown, get_top_buyers_for_deal, get_buyer_signals, get_buyer_history, search_lead_sources, search_valuation_leads, search_inbound_leads, get_referral_data, search_pe_contacts, get_firm_agreements, get_nda_logs, get_connection_requests, get_connection_messages, search_buyer_universes, get_universe_details, get_outreach_records, search_transcripts, get_meeting_action_items, get_outreach_status, get_analytics, get_enrichment_status, get_industry_trackers, get_current_user_context, create_deal_task, complete_deal_task, add_deal_note, log_deal_activity, update_deal_stage, grant_data_room_access, select_table_rows, apply_table_filter, sort_table_column, navigate_to_page, semantic_transcript_search, get_follow_up_queue, get_call_history, search_contacts, get_stale_deals, get_document_engagement, enrich_contact, find_contact, push_to_phoneburner, push_to_smartlead, send_document, google_search_companies, save_contacts_to_crm, reassign_deal_task, convert_to_pipeline_deal, get_data_quality_report, detect_buyer_conflicts, get_deal_health, match_leads_to_deals, generate_eod_recap, get_smartlead_campaigns, get_smartlead_campaign_stats, get_smartlead_email_history, retrieve_knowledge, research_industry

Respond with JSON only:
{"category":"CATEGORY","tier":"QUICK|STANDARD|DEEP","tools":["tool1","tool2"],"confidence":0.0-1.0}

Rules:
- Tier QUICK: Simple lookups, single tool, clear intent
- Tier STANDARD: Multi-tool queries, search + analysis
- Tier DEEP: Content generation, complex analysis, meeting prep
- Select 1-4 tools maximum
- Prefer fewer tools when intent is clear
- DEAL_STATUS is ONLY for questions about a specific deal's details, stage, or financials — NOT for contact lookups, content creation, platform guidance, or engagement queries
- "How do I" / "what does X do" / "explain X" = PLATFORM_GUIDE, even if the topic mentions deals, buyers, scoring, etc.
- "Create a memo" / "write a teaser" / "draft an email" = OUTREACH_DRAFT, not DEAL_STATUS
- "Who is the contact for" / "find contacts at" = CONTACTS, not DEAL_STATUS
- "Find [person]'s email" / "find [person] from [company] email" / "[person] email at [company]" = CONTACTS — always use search_contacts with search and company_name params
- "Which buyers showed interest" / "most engaged" = ENGAGEMENT, not BUYER_SEARCH`;

export async function routeIntent(query: string, pageContext?: PageContext): Promise<RouterResult> {
  // 1. Try context bypass rules first (no LLM call needed)
  // Always run bypass rules — most are query-only and don't need page context
  const ctx: PageContext = pageContext || {};
  for (const rule of BYPASS_RULES) {
    if (rule.test(query, ctx)) {
      console.log(
        `[ai-cc] Router bypassed → ${rule.result.category} (confidence: ${rule.result.confidence})`,
      );

      // Inject entity_id context into tool args hint
      const tools = [...rule.result.tools];

      return {
        ...rule.result,
        tools,
        bypassed: true,
      };
    }
  }

  // 2. Fall back to LLM classification (Haiku for speed)
  try {
    const response = await callClaude({
      model: CLAUDE_MODELS.haiku,
      maxTokens: 200,
      systemPrompt: ROUTER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: pageContext
            ? `Page context: ${pageContext.page || 'unknown'}, entity: ${pageContext.entity_id || 'none'} (${pageContext.entity_type || 'none'})\n\nUser query: ${query}`
            : query,
        },
      ],
      timeoutMs: 3000,
    });

    // Extract JSON from response
    const text = response.content.find((b) => b.type === 'text')?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error('No JSON in router response');

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      category: parsed.category || 'GENERAL',
      tier: parsed.tier || 'STANDARD',
      tools: parsed.tools || [],
      confidence: parsed.confidence || 0.5,
      bypassed: false,
    };
  } catch (err) {
    console.error(`[ai-cc] Router LLM failed: ${err instanceof Error ? err.message : err}`);

    // Fallback to general category
    return {
      category: 'GENERAL',
      tier: 'STANDARD',
      tools: ['get_current_user_context'],
      confidence: 0.3,
      bypassed: false,
    };
  }
}
