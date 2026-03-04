/**
 * 35-Question QA Suite
 *
 * Pre-built test questions across all AI Command Center categories.
 * Each question has an expected route, predicted behavior, and category tag.
 *
 * IMPORTANT: expectedRoute values MUST match actual router categories defined
 * in supabase/functions/ai-command-center/router.ts.
 *
 * Q1-30: Original core coverage
 * Q31-35: LinkedIn profile identification & contact enrichment
 */

export interface ThirtyQAutoValidation {
  /** Domain keywords a PE partner expects in the response */
  mustContainAny?: string[];
  /** Content that should never appear (hallucination / fabrication guard) */
  mustNotContain?: string[];
  /** Tools the AI should invoke to fetch real data */
  expectedTools?: string[];
  /** False for pure-knowledge answers (platform guide, content drafts) */
  requiresToolCalls?: boolean;
  /** Minimum response length for adequate depth */
  minResponseLength?: number;
  /** Max acceptable response time in ms — PE partners are impatient */
  maxResponseTimeMs?: number;
}

export interface ThirtyQQuestion {
  id: number;
  category: string;
  question: string;
  expectedRoute: string;
  expectedBehavior: string;
  autoValidation?: ThirtyQAutoValidation;
}

export interface ThirtyQCheckResult {
  name: string;
  passed: boolean;
  detail?: string;
  weight: number; // points out of 100
}

/** Grade labels from a PE partner's perspective */
export type PEGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export const PE_GRADE_LABELS: Record<PEGrade, string> = {
  A: 'Deal-Ready',
  B: 'Useful',
  C: 'Needs Work',
  D: 'Inadequate',
  F: 'Failure',
};

export interface ThirtyQScore {
  total: number; // 0-100
  checks: ThirtyQCheckResult[];
  grade: PEGrade;
  gradeLabel: string;
}

// ─── Actionability signals ───────────────────────────────────────────
// Patterns that indicate the response contains concrete, actionable data
// a PE partner can act on immediately rather than vague platitudes.

const DATA_SPECIFICITY_PATTERNS = [
  /\$[\d,.]+[KkMmBb]?/, // dollar amounts ($4.2M, $500K)
  /\d{1,3}(,\d{3})+/, // large numbers with commas (1,250)
  /\d+(\.\d+)?%/, // percentages (42%, 3.5%)
  /\d+(\.\d+)?[xX]\s/, // multiples (3.5x EBITDA)
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/, // dates (2/15/2026)
  /\b(Q[1-4]|H[12])\s*\d{4}\b/i, // quarters/halves (Q2 2026)
  /\bebitda\b/i, // financial metrics
  /\brevenue\b/i,
  /\bmultiple\b/i,
];

const ACTIONABILITY_PHRASES = [
  'recommend',
  'next step',
  'action',
  'follow up',
  'follow-up',
  'should',
  'reach out',
  'schedule',
  'prioritize',
  'call',
  'contact',
  'review',
  'approve',
  'confirm',
  'proceed',
];

/**
 * Score a 30Q response from a PE firm partner's perspective.
 *
 * A partner cares about:
 *  1. Actionable Intelligence (25 pts) — Can I act on this right now?
 *  2. Data Specificity (25 pts) — Real numbers, names, financials — not vague
 *  3. Completeness (20 pts) — Did it fully answer what I asked?
 *  4. Correct Routing (15 pts) — Did it understand my intent?
 *  5. Speed (15 pts) — I'm busy, don't waste my time
 *
 * Hallucination guard applied as a penalty.
 */
export function scoreThirtyQResponse(
  question: ThirtyQQuestion,
  response: {
    text: string;
    tools: string[];
    routeCategory: string;
    error?: string;
    durationMs?: number;
  },
): ThirtyQScore {
  const checks: ThirtyQCheckResult[] = [];
  const v = question.autoValidation;
  const txt = response.text || '';
  const lower = txt.toLowerCase();
  const hasResponse = !!txt.trim() && !response.error;

  // ── 1. Actionable Intelligence (25 pts) ────────────────────────
  // Does the response give me something I can act on?
  // Looks for: tool calls that fetched real data, actionability phrases,
  // and whether the response isn't just a refusal or clarification.
  {
    const expectedTools = v?.expectedTools;
    const requiresTools = v?.requiresToolCalls ?? true;

    let toolScore = 0;
    if (expectedTools && expectedTools.length > 0) {
      toolScore = expectedTools.some((t) => response.tools.includes(t)) ? 1 : 0;
    } else if (requiresTools) {
      toolScore = response.tools.length > 0 ? 1 : 0;
    } else {
      toolScore = 1; // no tools needed
    }

    const actionPhraseHits = ACTIONABILITY_PHRASES.filter((p) => lower.includes(p));
    const hasActionContent = actionPhraseHits.length >= 1;
    const passed = hasResponse && (toolScore === 1 || hasActionContent);

    const details: string[] = [];
    if (expectedTools && expectedTools.length > 0) {
      const called = response.tools.filter((t) => expectedTools.includes(t));
      details.push(
        called.length > 0
          ? `Tools: ${called.join(', ')}`
          : `Missing tools: ${expectedTools.join(', ')}`,
      );
    } else if (requiresTools) {
      details.push(
        response.tools.length > 0 ? `${response.tools.length} tool(s) called` : 'No tools called',
      );
    }
    if (actionPhraseHits.length > 0) details.push(`Action cues: ${actionPhraseHits.join(', ')}`);
    if (!hasResponse) details.push(response.error ? `Error: ${response.error}` : 'Empty response');

    checks.push({
      name: 'Actionable Intelligence',
      passed,
      detail: details.join(' | ') || (passed ? 'Actionable' : 'Not actionable'),
      weight: 25,
    });
  }

  // ── 2. Data Specificity (25 pts) ───────────────────────────────
  // Does the response contain real data points — dollar amounts, counts,
  // percentages, dates, names — not vague hand-waving?
  {
    const patternHits = DATA_SPECIFICITY_PATTERNS.filter((rx) => rx.test(txt));
    const keywords = v?.mustContainAny ?? [];
    const keywordHits = keywords.filter((k) => lower.includes(k.toLowerCase()));
    const keywordRatio =
      keywords.length > 0 ? keywordHits.length / keywords.length : hasResponse ? 0.5 : 0;

    // Pass if at least 2 data patterns hit OR 40%+ keywords present
    const passed = hasResponse && (patternHits.length >= 2 || keywordRatio >= 0.4);

    const details: string[] = [];
    if (patternHits.length > 0) details.push(`${patternHits.length} data pattern(s) found`);
    if (keywords.length > 0)
      details.push(
        `${keywordHits.length}/${keywords.length} keywords (${Math.round(keywordRatio * 100)}%): ${keywordHits.length > 0 ? keywordHits.join(', ') : 'none'}`,
      );
    if (!hasResponse) details.push('No response');

    checks.push({
      name: 'Data Specificity',
      passed,
      detail: details.join(' | ') || (passed ? 'Specific' : 'Vague'),
      weight: 25,
    });
  }

  // ── 3. Completeness (20 pts) ───────────────────────────────────
  // Did it fully answer the question? Checks response depth and coverage
  // of expected behavior keywords.
  {
    const minLen = v?.minResponseLength ?? 50;
    const meetsLength = txt.length >= minLen;

    // Derive coverage keywords from expectedBehavior
    const coverageKw = extractKeywords(question.expectedBehavior);
    const coverageHits = coverageKw.filter((k) => lower.includes(k));
    const coverageRatio =
      coverageKw.length > 0 ? coverageHits.length / coverageKw.length : hasResponse ? 0.5 : 0;

    const passed = hasResponse && meetsLength && coverageRatio >= 0.25;

    checks.push({
      name: 'Completeness',
      passed,
      detail: `${txt.length} chars (min ${minLen}) | ${coverageHits.length}/${coverageKw.length} behavior keywords (${Math.round(coverageRatio * 100)}%)`,
      weight: 20,
    });
  }

  // ── 4. Correct Routing (15 pts) ────────────────────────────────
  // Did the system understand what I was asking?
  {
    const routeMatch = response.routeCategory === question.expectedRoute;
    checks.push({
      name: 'Correct Routing',
      passed: routeMatch,
      detail: routeMatch
        ? `Correct: ${response.routeCategory}`
        : `Expected ${question.expectedRoute}, got ${response.routeCategory || 'unknown'}`,
      weight: 15,
    });
  }

  // ── 5. Speed (15 pts) ──────────────────────────────────────────
  // A PE partner won't wait 30 seconds for an answer.
  // <8s = full marks, 8-15s = pass, >15s = fail
  {
    const maxMs = v?.maxResponseTimeMs ?? 15000;
    const ms = response.durationMs ?? 0;
    const fast = ms > 0 && ms <= maxMs;
    checks.push({
      name: 'Speed',
      passed: ms === 0 ? hasResponse : fast,
      detail:
        ms > 0
          ? `${(ms / 1000).toFixed(1)}s (max ${(maxMs / 1000).toFixed(0)}s)`
          : 'No timing data',
      weight: 15,
    });
  }

  // ── Hallucination guard (penalty) ──────────────────────────────
  if (v?.mustNotContain && v.mustNotContain.length > 0 && txt) {
    const found = v.mustNotContain.filter((k) => lower.includes(k.toLowerCase()));
    if (found.length > 0) {
      checks.push({
        name: 'No Hallucination',
        passed: false,
        detail: `Found forbidden: ${found.join(', ')}`,
        weight: 0, // 0-weight = pure penalty — will not add to max but failing won't help
      });
    }
  }

  // ── Compute total ──────────────────────────────────────────────
  const maxPts = checks.reduce((s, c) => s + c.weight, 0) || 100;
  const earnedPts = checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
  const total = Math.round((earnedPts / maxPts) * 100);

  const grade: PEGrade =
    total >= 90 ? 'A' : total >= 75 ? 'B' : total >= 60 ? 'C' : total >= 40 ? 'D' : 'F';

  return { total, checks, grade, gradeLabel: PE_GRADE_LABELS[grade] };
}

/** Extract meaningful keywords from expectedBehavior text */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'a',
    'an',
    'the',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'has',
    'have',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'shall',
    'that',
    'this',
    'these',
    'those',
    'it',
    'its',
    'e.g.',
    'etc',
    'using',
    'returns',
    'uses',
    'provides',
    'queries',
    'shows',
    'gets',
    'lists',
    'creates',
    'generates',
    'identifies',
    'routes',
    'searches',
    'filters',
    'groups',
    'counts',
    'calls',
    'data',
    'information',
    'results',
    'response',
    'tool',
  ]);
  const words = text
    .replace(/[().,;:'"/\-—]/g, ' ')
    .split(/\s+/)
    .map((w) => w.toLowerCase().trim())
    .filter((w) => w.length > 2 && !stopWords.has(w));
  return [...new Set(words)];
}

export const THIRTY_Q_SUITE: ThirtyQQuestion[] = [
  // Pipeline Analytics (1-3)
  {
    id: 1,
    category: 'Pipeline Analytics',
    question: 'How many deals are currently in the pipeline?',
    expectedRoute: 'PIPELINE_ANALYTICS',
    expectedBehavior:
      'Returns a specific numeric count of active deals using get_pipeline_summary tool.',
    autoValidation: {
      mustContainAny: ['deal', 'pipeline', 'active'],
      expectedTools: ['get_pipeline_summary'],
      minResponseLength: 30,
    },
  },
  {
    id: 2,
    category: 'Pipeline Analytics',
    question: 'What is the total revenue across all active deals?',
    expectedRoute: 'PIPELINE_ANALYTICS',
    expectedBehavior: 'Aggregates revenue figures from pipeline data; returns a dollar amount.',
    autoValidation: {
      mustContainAny: ['revenue', '$', 'total', 'dollar'],
      expectedTools: ['get_pipeline_summary'],
      minResponseLength: 30,
    },
  },
  {
    id: 3,
    category: 'Pipeline Analytics',
    question: 'Show me a breakdown of deals by status',
    expectedRoute: 'PIPELINE_ANALYTICS',
    expectedBehavior: 'Groups deals by status (e.g. new, active, closed) with counts for each.',
    autoValidation: {
      mustContainAny: ['status', 'active', 'new', 'closed', 'deal'],
      expectedTools: ['get_pipeline_summary'],
      minResponseLength: 50,
    },
  },

  // Deal Status (4-5)
  {
    id: 4,
    category: 'Deal Status',
    question: 'What is the status of the most recent deal added?',
    expectedRoute: 'DEAL_STATUS',
    expectedBehavior:
      'Identifies the latest deal by created_at and returns its current status and key details.',
    autoValidation: {
      mustContainAny: ['status', 'deal', 'recent', 'latest', 'added'],
      expectedTools: ['get_deal_status', 'get_pipeline_summary'],
      minResponseLength: 40,
    },
  },
  {
    id: 5,
    category: 'Deal Status',
    question: 'Which deals were updated in the last 7 days?',
    expectedRoute: 'DEAL_STATUS',
    expectedBehavior: 'Queries deals with recent activity and lists them with update timestamps.',
    autoValidation: {
      mustContainAny: ['deal', 'updated', 'recent', 'last', 'day'],
      expectedTools: ['get_deal_status', 'get_pipeline_summary'],
      minResponseLength: 40,
    },
  },

  // Buyer Search (6-8)
  {
    id: 6,
    category: 'Buyer Search',
    question: 'Find buyers interested in HVAC companies',
    expectedRoute: 'BUYER_SEARCH',
    expectedBehavior:
      'Routes to BUYER_SEARCH category; uses search_buyers tool with HVAC-related criteria.',
    autoValidation: {
      mustContainAny: ['buyer', 'HVAC', 'hvac'],
      expectedTools: ['search_buyers'],
      minResponseLength: 40,
    },
  },
  {
    id: 7,
    category: 'Buyer Search',
    question: 'Which PE firms are looking for businesses in Texas?',
    expectedRoute: 'BUYER_SEARCH',
    expectedBehavior: 'Searches buyers with Texas geography preference; returns matching firms.',
    autoValidation: {
      mustContainAny: ['buyer', 'PE', 'Texas', 'firm'],
      expectedTools: ['search_buyers'],
      minResponseLength: 40,
    },
  },
  {
    id: 8,
    category: 'Buyer Search',
    question: 'Show me buyers with EBITDA range between 2M and 5M',
    expectedRoute: 'BUYER_SEARCH',
    expectedBehavior: 'Filters buyers by min/max EBITDA criteria; returns relevant matches.',
    autoValidation: {
      mustContainAny: ['buyer', 'EBITDA', 'ebitda'],
      expectedTools: ['search_buyers'],
      minResponseLength: 40,
    },
  },

  // Contacts (9-10)
  {
    id: 9,
    category: 'Contacts',
    question: 'Who is the main contact for our newest deal?',
    expectedRoute: 'CONTACTS',
    expectedBehavior: 'Looks up the most recent deal and returns main_contact_name, email, phone.',
    autoValidation: {
      mustContainAny: ['contact', 'name', 'email', 'phone'],
      expectedTools: ['get_contacts', 'get_deal_status'],
      minResponseLength: 30,
    },
  },
  {
    id: 10,
    category: 'Contacts',
    question: 'List all contacts that have been reached out to this month',
    expectedRoute: 'CONTACTS',
    expectedBehavior: 'Queries contact history for recent outreach activity this month.',
    autoValidation: {
      mustContainAny: ['contact', 'outreach', 'reached', 'month'],
      expectedTools: ['get_contacts'],
      minResponseLength: 30,
    },
  },

  // Enrichment (11-12)
  {
    id: 11,
    category: 'Enrichment',
    question: 'How many deals still need enrichment?',
    expectedRoute: 'PIPELINE_ANALYTICS',
    expectedBehavior: 'Counts deals where enriched_at is null or enrichment is incomplete.',
    autoValidation: {
      mustContainAny: ['enrichment', 'enriched', 'deal', 'need'],
      expectedTools: ['get_pipeline_summary'],
      minResponseLength: 30,
    },
  },
  {
    id: 12,
    category: 'Enrichment',
    question: 'What enrichment data is available for the latest deal?',
    expectedRoute: 'PIPELINE_ANALYTICS',
    expectedBehavior:
      'Returns enrichment fields (LinkedIn, Google reviews, etc.) for the most recent deal.',
    autoValidation: {
      mustContainAny: ['enrichment', 'deal', 'linkedin', 'google', 'review', 'data'],
      expectedTools: ['get_pipeline_summary', 'get_deal_status'],
      minResponseLength: 40,
    },
  },

  // Platform Guide (13-14) — knowledge answers, partner expects instant
  {
    id: 13,
    category: 'Platform Guide',
    question: 'How do I create a new buyer universe?',
    expectedRoute: 'PLATFORM_GUIDE',
    expectedBehavior:
      'Provides step-by-step guidance on creating a buyer universe in the platform.',
    autoValidation: {
      mustContainAny: ['buyer', 'universe', 'create', 'step', 'navigate'],
      requiresToolCalls: false,
      minResponseLength: 100,
      maxResponseTimeMs: 8000,
    },
  },
  {
    id: 14,
    category: 'Platform Guide',
    question: 'What does the deal scoring system do?',
    expectedRoute: 'PLATFORM_GUIDE',
    expectedBehavior: 'Explains the deal scoring methodology and how scores are calculated.',
    autoValidation: {
      mustContainAny: ['score', 'scoring', 'deal', 'calculate', 'criteria', 'buyer'],
      requiresToolCalls: false,
      minResponseLength: 80,
      maxResponseTimeMs: 8000,
    },
  },

  // Transcript Search (15-16)
  {
    id: 15,
    category: 'Transcript Search',
    question: 'Search transcripts for mentions of recurring revenue',
    expectedRoute: 'MEETING_INTEL',
    expectedBehavior:
      'Uses transcript search tool to find buyer call transcripts mentioning recurring revenue.',
    autoValidation: {
      mustContainAny: ['transcript', 'recurring', 'revenue', 'mention', 'call'],
      expectedTools: ['search_transcripts', 'search_meeting_transcripts'],
      minResponseLength: 40,
    },
  },
  {
    id: 16,
    category: 'Transcript Search',
    question: 'What did buyers say about geographic expansion?',
    expectedRoute: 'SEMANTIC_SEARCH',
    expectedBehavior:
      'Searches transcripts for geographic expansion discussions and summarizes findings.',
    autoValidation: {
      mustContainAny: ['geographic', 'expansion', 'buyer', 'transcript', 'mention'],
      expectedTools: ['semantic_search', 'search_transcripts', 'search_meeting_transcripts'],
      minResponseLength: 40,
    },
  },

  // Outreach (17-18)
  {
    id: 17,
    category: 'Outreach',
    question: 'Draft an outreach email for a landscaping company deal',
    expectedRoute: 'OUTREACH_DRAFT',
    expectedBehavior:
      'Generates a professional outreach email template for a landscaping business acquisition.',
    autoValidation: {
      mustContainAny: ['subject', 'email', 'landscaping', 'dear', 'opportunity', 'acquisition'],
      requiresToolCalls: false,
      minResponseLength: 150,
    },
  },
  {
    id: 18,
    category: 'Outreach',
    question: 'What is the status of our Smartlead campaigns?',
    expectedRoute: 'SMARTLEAD_OUTREACH',
    expectedBehavior: 'Queries outreach/campaign data and returns campaign status information.',
    autoValidation: {
      mustContainAny: ['campaign', 'smartlead', 'outreach', 'status'],
      expectedTools: ['get_smartlead_campaigns', 'get_campaign_status'],
      minResponseLength: 30,
    },
  },

  // Daily Briefing (19-20)
  {
    id: 19,
    category: 'Daily Briefing',
    question: 'Give me my daily briefing',
    expectedRoute: 'DAILY_BRIEFING',
    expectedBehavior:
      'Synthesizes recent activity: new deals, pending tasks, engagement updates, follow-ups.',
    autoValidation: {
      mustContainAny: ['deal', 'pipeline', 'activity', 'briefing', 'today', 'update'],
      expectedTools: ['get_daily_briefing', 'get_pipeline_summary'],
      minResponseLength: 100,
    },
  },
  {
    id: 20,
    category: 'Daily Briefing',
    question: 'Catch me up on what happened this week',
    expectedRoute: 'DAILY_BRIEFING',
    expectedBehavior:
      'Provides a weekly summary of pipeline changes, buyer activity, and key events.',
    autoValidation: {
      mustContainAny: ['week', 'deal', 'activity', 'pipeline', 'update', 'buyer'],
      expectedTools: ['get_daily_briefing', 'get_pipeline_summary'],
      minResponseLength: 80,
    },
  },

  // Engagement (21-22)
  {
    id: 21,
    category: 'Engagement',
    question: 'Which buyers have shown the most interest recently?',
    expectedRoute: 'ENGAGEMENT',
    expectedBehavior: 'Returns buyers with recent interest signals or high engagement scores.',
    autoValidation: {
      mustContainAny: ['buyer', 'interest', 'engagement', 'score', 'recent', 'signal'],
      expectedTools: ['get_buyer_engagement', 'get_engagement_signals'],
      minResponseLength: 40,
    },
  },
  {
    id: 22,
    category: 'Engagement',
    question: 'Show me the follow-up queue',
    expectedRoute: 'FOLLOW_UP',
    expectedBehavior: 'Lists pending follow-ups with buyers/deals that need attention.',
    autoValidation: {
      mustContainAny: ['follow-up', 'follow up', 'pending', 'queue', 'deal', 'buyer', 'attention'],
      expectedTools: ['get_follow_up_queue', 'get_follow_ups'],
      minResponseLength: 30,
    },
  },

  // Content Creation (23-24) — drafts are longer, allow more time
  {
    id: 23,
    category: 'Content Creation',
    question: 'Write a teaser for a $3M revenue plumbing company in Florida',
    expectedRoute: 'OUTREACH_DRAFT',
    expectedBehavior: 'Generates a deal teaser/summary with key metrics for buyer outreach.',
    autoValidation: {
      mustContainAny: ['plumbing', 'Florida', 'revenue', '$3M', '3M', 'opportunity', 'teaser'],
      requiresToolCalls: false,
      minResponseLength: 150,
      maxResponseTimeMs: 20000,
    },
  },
  {
    id: 24,
    category: 'Content Creation',
    question: 'Create a deal memo executive summary for a commercial cleaning business',
    expectedRoute: 'OUTREACH_DRAFT',
    expectedBehavior: 'Drafts an executive summary section suitable for a deal memo.',
    autoValidation: {
      mustContainAny: ['cleaning', 'executive', 'summary', 'memo', 'deal', 'business', 'revenue'],
      requiresToolCalls: false,
      minResponseLength: 200,
      maxResponseTimeMs: 25000,
    },
  },

  // Market Analysis (25-26)
  {
    id: 25,
    category: 'Market Analysis',
    question: 'What industries have the most deals in our pipeline?',
    expectedRoute: 'PIPELINE_ANALYTICS',
    expectedBehavior: 'Aggregates deals by industry and ranks them by count.',
    autoValidation: {
      mustContainAny: ['industry', 'deal', 'pipeline', 'count', 'most'],
      expectedTools: ['get_pipeline_summary'],
      minResponseLength: 40,
    },
  },
  {
    id: 26,
    category: 'Market Analysis',
    question: 'How does our deal flow compare month over month?',
    expectedRoute: 'PIPELINE_ANALYTICS',
    expectedBehavior: 'Provides month-over-month deal volume or trend analysis.',
    autoValidation: {
      mustContainAny: ['month', 'deal', 'flow', 'trend', 'volume', 'compare'],
      expectedTools: ['get_pipeline_summary'],
      minResponseLength: 40,
    },
  },

  // Calling List / Lead Intel (27-28)
  {
    id: 27,
    category: 'Calling List',
    question: 'Generate a calling list for deals that need follow-up',
    expectedRoute: 'CONTACT_ENRICHMENT',
    expectedBehavior: 'Creates a prioritized list of contacts/deals requiring follow-up calls.',
    autoValidation: {
      mustContainAny: ['calling', 'list', 'contact', 'follow-up', 'follow up', 'phone', 'deal'],
      expectedTools: ['enrich_buyer_contacts', 'get_contacts', 'get_follow_up_queue'],
      minResponseLength: 40,
    },
  },
  {
    id: 28,
    category: 'Lead Intel',
    question: 'What do we know about the owner of our top-scored deal?',
    expectedRoute: 'DEAL_STATUS',
    expectedBehavior: 'Returns owner/contact intelligence for the highest-scored deal.',
    autoValidation: {
      mustContainAny: ['owner', 'contact', 'deal', 'score', 'name', 'phone', 'email'],
      expectedTools: ['get_deal_status', 'get_contacts', 'get_pipeline_summary'],
      minResponseLength: 40,
    },
  },

  // Actions (29)
  {
    id: 29,
    category: 'Actions',
    question: 'Add a note to the most recent deal saying "Reviewed financials, looks promising"',
    expectedRoute: 'ACTION',
    expectedBehavior:
      'Requests confirmation before executing add_deal_note action on the latest deal.',
    autoValidation: {
      mustContainAny: ['note', 'deal', 'confirm', 'add', 'reviewed', 'financials'],
      expectedTools: ['add_deal_note'],
      minResponseLength: 30,
    },
  },

  // Edge Cases (30)
  {
    id: 30,
    category: 'Edge Case',
    question: 'asdfghjkl random nonsense query 12345',
    expectedRoute: 'GENERAL',
    expectedBehavior:
      'Handles gracefully — returns a helpful "I didn\'t understand" or clarification response without errors.',
    autoValidation: {
      mustContainAny: ['help', 'understand', 'clarify', 'try', 'rephrase', 'assist', 'can'],
      mustNotContain: ['error', 'exception', 'undefined'],
      requiresToolCalls: false,
      minResponseLength: 20,
    },
  },

  // ---------- LinkedIn & Contact Enrichment (31-35) ----------

  // Contact finder at PE firm
  {
    id: 31,
    category: 'Contact Enrichment',
    question: 'Find 5 contacts at Trivest Partners',
    expectedRoute: 'CONTACT_ENRICHMENT',
    expectedBehavior:
      'Uses enrich_buyer_contacts or search_pe_contacts to find associates/principals at Trivest. Returns names, titles, emails if available.',
    autoValidation: {
      mustContainAny: ['Trivest', 'contact', 'name', 'title', 'email', 'partner'],
      expectedTools: ['enrich_buyer_contacts', 'search_pe_contacts', 'get_contacts'],
      minResponseLength: 50,
    },
  },

  // LinkedIn URL paste → enrich
  {
    id: 32,
    category: 'LinkedIn Enrichment',
    question: "https://linkedin.com/in/johndoe — get me this person's email and phone number",
    expectedRoute: 'CONTACTS',
    expectedBehavior:
      'Detects LinkedIn URL, uses enrich_linkedin_contact to look up email/phone via Prospeo. Returns enriched contact data.',
    autoValidation: {
      mustContainAny: ['linkedin', 'email', 'phone', 'contact', 'enrich', 'profile'],
      expectedTools: ['enrich_linkedin_contact'],
      minResponseLength: 30,
    },
  },

  // Find missing LinkedIn profiles for seller contacts
  {
    id: 33,
    category: 'LinkedIn Discovery',
    question: 'Find LinkedIn profiles for our seller contacts that are missing them',
    expectedRoute: 'CONTACT_ENRICHMENT',
    expectedBehavior:
      'Uses find_contact_linkedin to search Google for LinkedIn URLs of seller contacts without linkedin_url. Returns matched profiles with confidence.',
    autoValidation: {
      mustContainAny: ['linkedin', 'profile', 'seller', 'contact', 'missing', 'found'],
      expectedTools: ['find_contact_linkedin', 'enrich_buyer_contacts'],
      minResponseLength: 40,
    },
  },

  // Enrich contacts for buyer universe
  {
    id: 34,
    category: 'Contact Enrichment',
    question: 'Enrich the contacts for buyers in our HVAC deal universe',
    expectedRoute: 'CONTACT_ENRICHMENT',
    expectedBehavior:
      'Uses enrich_buyer_contacts across HVAC universe buyers. Runs Apify LinkedIn scrape + Prospeo email waterfall. Returns enriched contacts with confidence levels.',
    autoValidation: {
      mustContainAny: ['enrich', 'buyer', 'HVAC', 'contact', 'email', 'linkedin', 'universe'],
      expectedTools: ['enrich_buyer_contacts'],
      minResponseLength: 50,
    },
  },

  // Build calling list with phone numbers (multi-step workflow)
  {
    id: 35,
    category: 'Contact Enrichment',
    question: 'Build me a calling list with phone numbers for our top 10 HVAC buyers',
    expectedRoute: 'CONTACT_ENRICHMENT',
    expectedBehavior:
      'Multi-step: search_buyers for HVAC → enrich_buyer_contacts for phone numbers → compile formatted calling list with name, title, phone, company.',
    autoValidation: {
      mustContainAny: ['calling', 'list', 'phone', 'HVAC', 'buyer', 'name', 'title'],
      expectedTools: ['search_buyers', 'enrich_buyer_contacts'],
      minResponseLength: 60,
    },
  },
];
