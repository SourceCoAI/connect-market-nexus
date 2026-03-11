/* eslint-disable no-console */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { fetchWithAutoRetry } from '../_shared/ai-providers.ts';

// ─── Helpers ───

/** Validate that a string is a proper YYYY-MM-DD date (not just a time like "22:51") */
function isValidDateString(value: string | null | undefined): boolean {
  if (!value) return false;
  // Must match YYYY-MM-DD pattern
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

// ─── Types ───

interface ExtractRequest {
  fireflies_transcript_id?: string;
  // Batch mode: process multiple Fireflies transcript IDs at once
  fireflies_transcript_ids?: string[];
  // Manual trigger: pass transcript text directly
  transcript_text?: string;
  meeting_title?: string;
  meeting_date?: string;
  // When true, skip AI and parse Fireflies built-in action_items from the summary
  use_fireflies_actions?: boolean;
}

interface ExtractedTask {
  title: string;
  description: string;
  assignee_name: string;
  task_type: string;
  task_category: 'deal_task' | 'platform_task' | 'operations_task';
  due_date: string;
  source_timestamp: string;
  deal_reference: string;
  confidence: 'high' | 'medium' | 'low';
}

// ─── Constants ───

const TASK_TYPES = [
  'contact_owner',
  'build_buyer_universe',
  'follow_up_with_buyer',
  'send_materials',
  'schedule_call',
  'nda_execution',
  'ioi_loi_process',
  'due_diligence',
  'buyer_qualification',
  'seller_relationship',
  'buyer_ic_followup',
  'find_buyers',
  'contact_buyers',
  // Legacy types kept for DB compatibility but no longer extracted
  'update_pipeline',
  'call',
  'email',
  'other',
];

const DEAL_STAGE_SCORES: Record<string, number> = {
  // Match actual deal_stages table values (case-insensitive lookup)
  sourced: 20,
  qualified: 30,
  'nda sent': 40,
  'nda signed': 50,
  'fee agreement sent': 55,
  'fee agreement signed': 60,
  'due diligence': 70,
  'loi submitted': 90,
  'under contract': 80,
  'closed won': 100,
  'closed lost': 0,
};

const TASK_TYPE_SCORES: Record<string, number> = {
  contact_owner: 90,
  ioi_loi_process: 88,
  due_diligence: 85,
  nda_execution: 82,
  schedule_call: 80,
  call: 80,
  buyer_ic_followup: 78,
  follow_up_with_buyer: 75,
  seller_relationship: 72,
  send_materials: 70,
  email: 68,
  contact_buyers: 65,
  buyer_qualification: 60,
  find_buyers: 55,
  build_buyer_universe: 50,
  other: 40,
  update_pipeline: 30,
};

const FIREFLIES_API_TIMEOUT_MS = 15_000;

// ─── Fireflies API ───

async function firefliesGraphQL(query: string, variables?: Record<string, unknown>) {
  const apiKey = Deno.env.get('FIREFLIES_API_KEY');
  if (!apiKey) throw new Error('FIREFLIES_API_KEY not configured');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FIREFLIES_API_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 3000));
      const retryResponse = await fetch('https://api.fireflies.ai/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query, variables }),
      });
      if (!retryResponse.ok) throw new Error(`Fireflies API error: ${retryResponse.status}`);
      const retryResult = await retryResponse.json();
      if (retryResult.errors) throw new Error(retryResult.errors[0]?.message);
      return retryResult.data;
    }

    if (!response.ok) throw new Error(`Fireflies API error: ${response.status}`);
    const result = await response.json();
    if (result.errors) throw new Error(result.errors[0]?.message);
    return result.data;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Fetch transcript from Fireflies ───

async function fetchTranscript(transcriptId: string) {
  const data = await firefliesGraphQL(
    `query GetTranscript($id: String!) {
      transcript(id: $id) {
        id
        title
        date
        duration
        transcript_url
        sentences {
          speaker_name
          text
          start_time
          end_time
        }
        summary {
          short_summary
        }
      }
    }`,
    { id: transcriptId },
  );
  return data.transcript;
}

// ─── Fetch summary (with action_items) from Fireflies ───

async function fetchSummary(transcriptId: string) {
  const data = await firefliesGraphQL(
    `query GetSummary($id: String!) {
      transcript(id: $id) {
        id
        title
        date
        duration
        transcript_url
        summary {
          action_items
          short_summary
          keywords
        }
      }
    }`,
    { id: transcriptId },
  );
  return data.transcript;
}

// ─── Fireflies Action Item Parser ───

/**
 * Parses Fireflies' built-in action_items text into structured tasks.
 *
 * Fireflies format:
 *   **Speaker Name**
 *   Action item text (MM:SS)
 *   Another action item (MM:SS)
 *
 *   **Another Speaker**
 *   Their action item (MM:SS)
 */
function parseFirefliesActionItems(
  actionItemsText: string,
  defaultDueDate: string,
): ExtractedTask[] {
  if (!actionItemsText?.trim()) return [];

  const tasks: ExtractedTask[] = [];
  let currentSpeaker = 'Unassigned';

  const lines = actionItemsText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // Check for speaker header: **Speaker Name**
    const speakerMatch = line.match(/^\*\*(.+?)\*\*$/);
    if (speakerMatch) {
      currentSpeaker = speakerMatch[1].trim();
      continue;
    }

    // Skip empty lines or non-task lines
    if (!line || line.startsWith('#') || line.startsWith('---')) continue;

    // Parse action item — optionally with timestamp (MM:SS) at end
    const timestampMatch = line.match(/\((\d{1,2}:\d{2})\)\s*$/);
    const timestamp = timestampMatch ? timestampMatch[1] : '';
    const taskText = timestampMatch
      ? line.replace(/\(\d{1,2}:\d{2}\)\s*$/, '').trim()
      : line.trim();

    if (!taskText || taskText.length < 5) continue;

    const taskType = inferTaskType(taskText);
    const dealRef = extractDealReference(taskText);

    tasks.push({
      title: taskText,
      description: `From Fireflies action items. Speaker: ${currentSpeaker}`,
      assignee_name: currentSpeaker,
      task_type: taskType,
      task_category: inferTaskCategory(taskText, taskType),
      due_date: defaultDueDate,
      source_timestamp: timestamp,
      deal_reference: dealRef,
      confidence: 'high', // Fireflies explicitly identified these as action items
    });
  }

  return tasks;
}

/** Infer task_type from action item text using keyword matching */
function inferTaskType(text: string): string {
  const lower = text.toLowerCase();

  // Contact/call patterns
  if (
    /\b(call|phone|reach out to.*owner|contact.*owner|leave message|follow.?up.*owner)\b/.test(
      lower,
    )
  ) {
    return 'contact_owner';
  }
  if (/\b(schedule.*call|set up.*call|arrange.*meeting|book.*call)\b/.test(lower)) {
    return 'schedule_call';
  }
  if (/\b(follow.?up|check.?in|reconnect|circle back|touch base)\b/.test(lower)) {
    return 'follow_up_with_buyer';
  }

  // Buyer-related
  if (
    /\b(buyer universe|buyer list|find.*buyer|identify.*buyer|source.*buyer|build.*buyer)\b/.test(
      lower,
    )
  ) {
    return 'build_buyer_universe';
  }
  if (/\b(contact.*buyer|reach out.*buyer|intro.*buyer|buyer.*outreach)\b/.test(lower)) {
    return 'contact_buyers';
  }
  if (/\b(qualify|vet|evaluate.*buyer|buyer.*fit)\b/.test(lower)) {
    return 'buyer_qualification';
  }
  if (/\b(buyer.*ic|investment committee|ic follow)\b/.test(lower)) {
    return 'buyer_ic_followup';
  }

  // Documents/materials
  if (
    /\b(send|share|forward|distribute|email.*teaser|email.*cim|email.*memo|email.*nda)\b/.test(
      lower,
    )
  ) {
    if (/\bnda\b/.test(lower)) return 'nda_execution';
    return 'send_materials';
  }
  if (/\b(nda|non.?disclosure)\b/.test(lower)) {
    return 'nda_execution';
  }

  // Deal process
  if (/\b(ioi|loi|letter of intent|indication of interest)\b/.test(lower)) {
    return 'ioi_loi_process';
  }
  if (/\b(due diligence|data room|diligence)\b/.test(lower)) {
    return 'due_diligence';
  }
  if (
    /\b(update.*pipeline|update.*crm|update.*status|update.*system|update.*deal|update.*data|build.*data)\b/.test(
      lower,
    )
  ) {
    return 'update_pipeline';
  }
  if (
    /\b(seller|owner.*relationship|maintain.*relationship)\b/.test(lower) &&
    !/contact|call|reach/.test(lower)
  ) {
    return 'seller_relationship';
  }

  // Email about a deal → send_materials; about a buyer → follow_up_with_buyer
  if (/\b(email|send.*email|write.*email)\b/.test(lower)) {
    if (/\b(buyer|firm|capital|group|partner|fund)\b/.test(lower)) return 'follow_up_with_buyer';
    if (/\b(teaser|cim|memo|nda|materials|data room)\b/.test(lower)) return 'send_materials';
    return 'send_materials';
  }

  // Call about owner → contact_owner; about buyer → follow_up_with_buyer; else schedule_call
  if (/\b(call|phone|dial)\b/.test(lower)) {
    if (/\b(owner|seller)\b/.test(lower)) return 'contact_owner';
    if (/\b(buyer|firm|capital|group|partner|fund)\b/.test(lower)) return 'follow_up_with_buyer';
    return 'schedule_call';
  }

  return 'other';
}

/** Check if a name is a team member (should not be treated as a deal) */
function isTeamMemberName(name: string): boolean {
  const lower = name.toLowerCase().trim();
  // Check against dynamically loaded team member names
  if (_teamMemberNames.has(lower)) return true;
  // Check against static NON_DEAL_TERMS
  for (const term of NON_DEAL_TERMS) {
    if (term.toLowerCase() === lower) return true;
  }
  return false;
}

/** Try to extract a deal/company reference from action item text */
function extractDealReference(text: string): string {
  // First: check against known deal names from DB (supports single-word names like "Supernova")
  // _knownDealNames is sorted longest-first to prefer "Smith Manufacturing" over "Smith"
  if (_knownDealNames.length > 0) {
    const textLower = text.toLowerCase();
    for (const name of _knownDealNames) {
      if (name.length < 3) continue; // skip very short names
      // Skip if the "deal name" is actually a team member name
      if (isTeamMemberName(name)) continue;
      const nameLower = name.toLowerCase();
      // For short names (≤4 chars like "CES"), require word boundary to avoid
      // substring false positives (e.g. "sequences" containing "ces")
      if (name.length <= 4) {
        const wordBoundaryRegex = new RegExp(
          `\\b${nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          'i',
        );
        if (wordBoundaryRegex.test(text)) {
          return name;
        }
      } else if (textLower.includes(nameLower)) {
        return name;
      }
    }
  }

  // Fallback: regex patterns for capitalized multi-word names
  // Only match after prepositions that strongly indicate a company name follows
  const patterns = [
    /(?:owner of|regarding)\s+([A-Z][A-Za-z'']+(?:\s+[A-Z&][A-Za-z'']*)*)/,
    /([A-Z][A-Za-z'']+(?:\s+[A-Z&][A-Za-z'']*){1,4})\s+(?:deal|listing|company|business)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const ref = match[1]?.trim();
      if (!ref) continue;
      // Reject if it matches a non-deal term or team member name
      if (isTeamMemberName(ref)) continue;
      if (NON_DEAL_TERMS.has(ref)) continue;
      // Also reject each word individually for multi-word matches
      const words = ref.split(/\s+/);
      if (words.some((w) => NON_DEAL_TERMS.has(w) || isTeamMemberName(w))) continue;
      // Reject generic verbs/adjectives that got captured
      if (/^(Enrich|Follow|Start|Build|Create|Update|Check|Get|Go|Meet|Show)\b/i.test(ref))
        continue;
      return ref;
    }
  }

  return '';
}

/** Infer task_category from text and task_type */
function inferTaskCategory(
  text: string,
  taskType: string,
): 'deal_task' | 'platform_task' | 'operations_task' {
  const lower = text.toLowerCase();
  // Platform/dev tasks
  if (
    /\b(fix|bug|deploy|push|merge|code|api|endpoint|database|migration|integration|upload|enrichment|smartleads|data warehouse|platform|technical|dev|developer)\b/.test(
      lower,
    )
  ) {
    return 'platform_task';
  }
  // Operations tasks
  if (
    /\b(invoice|billing|payroll|hr|onboard|training|license|compliance|accounting|admin|operations|office)\b/.test(
      lower,
    )
  ) {
    return 'operations_task';
  }
  // update_pipeline could be either
  if (taskType === 'update_pipeline' && /\b(system|crm|data|enrich|upload)\b/.test(lower)) {
    return 'platform_task';
  }
  return 'deal_task';
}

// ─── Title Standardization ───

/**
 * Standardize task titles into consistent, professional format.
 * Examples:
 *   "find a buyer for acme corp" → "Find Buyers for Acme Corp"
 *   "call the owner of smith manufacturing" → "Call Owner of Smith Manufacturing"
 *   "follow up with the MPG buyer" → "Follow Up with MPG Buyer"
 *   "send data room to patrick" → "Send Data Room to Patrick"
 *   "reconnect with ace garage door" → "Reconnect with Ace Garage Door"
 */
function standardizeTaskTitle(title: string, _dealRef?: string): string {
  let result = title.trim();
  if (!result) return result;

  // Normalize whitespace
  result = result.replace(/\s+/g, ' ');

  // Remove trailing periods
  result = result.replace(/\.\s*$/, '');

  // Standardize "find buyer(s)" patterns → "Find Buyers for COMPANY"
  result = result.replace(
    /^(find|identify|source|look for|search for)\s+(a\s+)?buyer(s)?\s+(for|of)\s+/i,
    (_, verb, _a, _s, prep) => `Find Buyers ${prep.toLowerCase()} `,
  );

  // Standardize "build buyer universe/list" → "Build Buyer Universe for COMPANY"
  result = result.replace(
    /^(build|create|compile)\s+(a\s+)?(buyer\s+)?(universe|list)\s+(for|of)\s+/i,
    (_, _verb, _a, _b, _type, prep) => `Build Buyer Universe ${prep.toLowerCase()} `,
  );

  // Standardize "contact/call/reach out to owner" patterns
  result = result.replace(
    /^(call|contact|reach out to|phone)\s+(the\s+)?owner\s+(of|at|for)\s+/i,
    (_, _verb, _the, prep) => `Call Owner ${prep.toLowerCase()} `,
  );

  // Standardize "follow up" patterns
  result = result.replace(
    /^follow[\s-]?up\s+(with|on)\s+(the\s+)?/i,
    (_, prep) => `Follow Up ${prep.toLowerCase()} `,
  );

  // Standardize "send (materials/data room/teaser/CIM)" patterns
  result = result.replace(
    /^(send|share|forward)\s+(the\s+)?(data room|teaser|cim|memo|materials|nda)\s+(to|for)\s+/i,
    (_, _verb, _the, doc, prep) => {
      const docTitle =
        doc.toLowerCase() === 'cim'
          ? 'CIM'
          : doc.toLowerCase() === 'nda'
            ? 'NDA'
            : doc.replace(/\b\w/g, (c: string) => c.toUpperCase());
      return `Send ${docTitle} ${prep.toLowerCase()} `;
    },
  );

  // Standardize "email" patterns
  result = result.replace(/^(email|send\s+email\s+to|write\s+email\s+to)\s+/i, () => 'Email ');

  // Standardize "CC" → always uppercase
  result = result.replace(/\bcc\b/gi, 'CC');

  // Remove filler words: "the", "a" before company names (but keep meaningful ones)
  result = result.replace(/\s+the\s+(?=[A-Z])/g, ' ');

  // Title Case the result — capitalize first letter of each word, preserve acronyms
  result = result.replace(/\b([a-z])/g, (_, c) => c.toUpperCase());

  // Preserve known acronyms as uppercase
  const acronyms = [
    'NDA',
    'CIM',
    'IOI',
    'LOI',
    'CRM',
    'IC',
    'MPG',
    'PE',
    'LLC',
    'CEO',
    'CFO',
    'COO',
    'CC',
  ];
  for (const acr of acronyms) {
    const regex = new RegExp(`\\b${acr}\\b`, 'gi');
    result = result.replace(regex, acr);
  }

  // Lowercase prepositions/articles that are mid-title
  const lowercaseWords = ['for', 'of', 'to', 'with', 'on', 'at', 'and', 'the', 'a', 'an', 'in'];
  for (const word of lowercaseWords) {
    // Only lowercase if not at the start of the title
    const regex = new RegExp(`(?<=\\s)${word.charAt(0).toUpperCase() + word.slice(1)}(?=\\s)`, 'g');
    result = result.replace(regex, word);
  }

  // Ensure first character is always uppercase
  result = result.charAt(0).toUpperCase() + result.slice(1);

  return result;
}

/** Parse MM:SS timestamp to total seconds */
function parseTimestampToSeconds(ts: string): number | null {
  if (!ts) return null;
  const match = ts.match(/^(\d{1,3}):(\d{2})$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

/** Known deal names loaded from DB for single-word matching */
let _knownDealNames: string[] = [];

/** Team member names to exclude from deal reference matching */
let _teamMemberNames: Set<string> = new Set();

/** Common non-deal terms to exclude from deal reference regex fallback */
const NON_DEAL_TERMS = new Set([
  // People / roles
  'Alia',
  'Ali',
  'Bill',
  'Brandon',
  'Oz',
  'Tomos',
  'Tom',
  'Sean',
  'Kyle',
  'Mile',
  'Patrick',
  'Unassigned',
  'Speaker',
  // Geographic
  'California',
  'Louisiana',
  'Missouri',
  'New Mexico',
  'Texas',
  'Florida',
  'Oregon',
  'Northeast',
  'Southeast',
  'Midwest',
  'Southwest',
  'Pacific Northwest',
  'Orlando',
  'Seattle',
  'Modesto',
  // Lead sources / platforms (not deals)
  'GP Partners',
  'Giuseppe',
  'Fireflies',
  'SmartLead',
  'Smart Lead',
  'Salesforce',
  'LinkedIn',
  'Source Co',
  'SourceCo',
  'Valuation Leads',
  // Generic terms the regex catches
  'Team',
  'Today',
  'Everyone',
  'Guys',
  // Days / months (expanded)
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]);

async function loadActiveDealNames(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  const { data } = await supabase
    .from('deal_pipeline')
    .select('listings!inner(title, internal_company_name)')
    .not('listings.title', 'is', null);

  const names = new Set<string>();
  for (const d of data || []) {
    const listing = d.listings as { title: string | null; internal_company_name: string | null };
    if (listing.title) names.add(listing.title.trim());
    if (listing.internal_company_name) names.add(listing.internal_company_name.trim());
  }
  // Sort longest first so "Smith Manufacturing" matches before "Smith"
  return Array.from(names).sort((a, b) => b.length - a.length);
}

/** Check if a task already exists as pending/overdue for the same assignee */
async function findRecurringTask(
  supabase: ReturnType<typeof createClient>,
  assigneeId: string | null,
  title: string,
): Promise<boolean> {
  if (!assigneeId) return false;
  const normalized = title.toLowerCase().trim();
  if (normalized.length < 10) return false; // Too short to reliably dedup

  // Look for existing open tasks for this assignee
  const { data: existing } = await supabase
    .from('daily_standup_tasks')
    .select('id, title')
    .eq('assignee_id', assigneeId)
    .in('status', ['pending', 'overdue', 'in_progress'])
    .limit(100);

  if (!existing || existing.length === 0) return false;

  for (const task of existing) {
    const existingNorm = task.title.toLowerCase().trim();
    // Exact match
    if (existingNorm === normalized) return true;
    // Substring match for longer titles (≥15 chars)
    if (
      normalized.length >= 15 &&
      (existingNorm.includes(normalized) || normalized.includes(existingNorm))
    ) {
      return true;
    }
  }
  return false;
}

/** Carry over incomplete tasks from the previous standup that weren't re-mentioned */
async function carryOverIncompleteTasks(
  supabase: ReturnType<typeof createClient>,
  currentMeetingId: string,
  currentMeetingDate: string,
  newTaskTitles: string[],
): Promise<number> {
  // Find the most recent previous standup meeting
  const { data: prevMeetings } = await supabase
    .from('standup_meetings')
    .select('id')
    .lt('meeting_date', currentMeetingDate)
    .order('meeting_date', { ascending: false })
    .limit(1);

  if (!prevMeetings || prevMeetings.length === 0) return 0;
  const prevMeetingId = prevMeetings[0].id;

  // Find incomplete tasks from that meeting
  const { data: incompleteTasks } = await supabase
    .from('daily_standup_tasks')
    .select('id, title, due_date, carry_count')
    .eq('source_meeting_id', prevMeetingId)
    .in('status', ['pending', 'in_progress']);

  if (!incompleteTasks || incompleteTasks.length === 0) return 0;

  const newTitlesLower = new Set(newTaskTitles.map((t) => t.toLowerCase().trim()));
  let carriedCount = 0;

  for (const task of incompleteTasks) {
    // Skip if this task was re-mentioned in the current meeting
    if (newTitlesLower.has(task.title.toLowerCase().trim())) continue;

    const isOverdue = task.due_date && task.due_date < currentMeetingDate;
    await supabase
      .from('daily_standup_tasks')
      .update({
        source_meeting_id: currentMeetingId,
        carried_over: true,
        carry_count: (task.carry_count || 0) + 1,
        ...(isOverdue ? { status: 'overdue' } : {}),
      })
      .eq('id', task.id);
    carriedCount++;
  }

  return carriedCount;
}

// ─── AI Extraction ───

function buildExtractionPrompt(
  teamMembers: { name: string; aliases: string[] }[],
  today: string,
): string {
  const memberList = teamMembers
    .map(
      (m) =>
        `- ${m.name}${m.aliases.length > 0 ? ` (also known as: ${m.aliases.join(', ')})` : ''}`,
    )
    .join('\n');

  return `You are a task extraction engine for an M&A advisory firm's daily standup meeting.

Your job is to parse the meeting transcript and extract ONLY tasks directly related to specific deals, sellers/owners, and buyers. Ignore everything else.

## CRITICAL: Extract Only Deal & Buyer Tasks
ONLY extract tasks that involve ALL of:
- A specific deal, listing, or company being sold (you MUST be able to name it)
- OR a specific buyer, buyer group, PE firm, or acquirer (you MUST be able to name it)
- AND a clear action someone needs to take

DO NOT extract tasks related to:
- Platform/dev work (bugs, deployments, code, APIs, integrations, data migrations, enrichment)
- Operations/admin (invoices, billing, HR, onboarding, compliance, office tasks)
- Internal tools or CRM system updates (unless updating a specific deal's status)
- General team coordination, meetings, or scheduling that isn't deal-specific
- Marketing, social media, or general business development without a specific deal/buyer
- Building call lists, enriching data, or process improvements (these are operational, not deal tasks)
- Discussions about how to use the platform or system training

## Team Members
${memberList}

## CRITICAL: Task Assignment Rules
Every task MUST be assigned to the correct team member. Listen carefully to WHO commits to doing something:
- If someone says "I'll do X" or "I'll call X" → assign to THAT SPEAKER
- If someone says "[Name], can you do X" or "[Name] should do X" → assign to the NAMED person
- If the group agrees someone should do something → assign to that person
- NEVER set assignee_name to "Unassigned" if you can determine who should do it from context
- Use the EXACT team member name from the list above (not nicknames or shortened names)
- If someone delegates to another person, the assignee is the DELEGATEE, not the delegator

## Task Types (use ONLY these)
- contact_owner: Reach out to a business owner about a deal
- build_buyer_universe: Research and compile potential buyers for a deal
- follow_up_with_buyer: Follow up on an existing buyer conversation
- send_materials: Send teasers, CIMs, or other deal documents to a buyer
- schedule_call: Arrange a call with an owner, buyer, or deal party
- nda_execution: Send, follow up on, or finalize an NDA
- ioi_loi_process: Manage IOI or LOI submission, review, or negotiation
- due_diligence: Coordinate or follow up on due diligence activities
- buyer_qualification: Qualify or vet a potential buyer
- seller_relationship: Maintain or strengthen the relationship with a seller/owner
- buyer_ic_followup: Follow up with a buyer's investment committee or decision-makers
- find_buyers: Research and find potential buyers for a deal
- contact_buyers: Reach out to specific buyers about a deal

## Title Formatting Rules
Use professional, standardized title case. Follow these patterns:
- Finding buyers → "Find Buyers for [Company]"
- Building buyer universe → "Build Buyer Universe for [Company]"
- Calling/contacting owner → "Call Owner of [Company]"
- Following up with buyer → "Follow Up with [Buyer] re: [Deal]"
- Sending materials → "Send [Document Type] to [Buyer/Person]"
- Scheduling → "Schedule Call with [Person] re: [Deal]"
- NDA → "Send NDA to [Buyer]" or "Follow Up on NDA with [Buyer]"
- Reconnecting → "Reconnect with [Company/Person]"
Always capitalize company names. Use title case (capitalize major words, lowercase prepositions like "for", "of", "to", "with").

## CRITICAL: One Task Per Deal
If someone mentions multiple deals in one sentence (e.g., "work on CES, then Rejuve, then Legacy Corp"), create SEPARATE tasks for EACH deal. Never bundle multiple deals into one task.

## Extraction Rules
1. A task MUST reference a specific deal, company, buyer, or seller BY NAME — no generic tasks
2. Each task must have: title, description, assignee_name, task_type, due_date, confidence, deal_reference
3. deal_reference is REQUIRED — set it to the specific company/deal/buyer name mentioned. If no specific entity is named, do NOT extract the task
4. Default due_date is "${today}" unless context implies multi-day (e.g., "this week" = end of week)
5. Include source_timestamp (approximate time in meeting like "2:30") if discernible
6. Ignore general discussion, opinions, and status updates that don't create new actions
7. Do NOT extract duplicate tasks — if the same action is discussed multiple times, only extract it once
8. Set confidence to "high" if the task and assignee are explicitly stated, "medium" if inferred from context, "low" if ambiguous
9. When someone says "call" or "email" about a deal, classify it as the most specific type (contact_owner, follow_up_with_buyer, send_materials, etc.) — NOT as a generic action
10. Do NOT confuse people's names with deal/company names. Team member names are NEVER deal references
11. Lead sources like "GP Partners", "valuation leads", "referral leads" are NOT deal names — only use the actual company/business name

## Output Format
Return a JSON array of task objects. Example:
[
  {
    "title": "Call Owner of Smith Manufacturing",
    "description": "Owner hasn't responded to last email. Try calling directly.",
    "assignee_name": "Bill Martin",
    "task_type": "contact_owner",
    "due_date": "${today}",
    "source_timestamp": "3:45",
    "deal_reference": "Smith Manufacturing",
    "confidence": "high"
  }
]

Return ONLY the JSON array, no other text. If there are NO deal/buyer-related tasks, return an empty array: []`;
}

async function extractTasksWithAI(
  transcriptText: string,
  teamMembers: { name: string; aliases: string[] }[],
  today: string,
): Promise<ExtractedTask[]> {
  const systemPrompt = buildExtractionPrompt(teamMembers, today);

  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not configured');

  const response = await fetchWithAutoRetry(
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemini-2.0-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here is the meeting transcript:\n\n${transcriptText}` },
        ],
        temperature: 0,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(60000),
    },
    { maxRetries: 2, baseDelayMs: 2000, callerName: 'Gemini/extract-standup-tasks' },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText.substring(0, 300)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Parse the JSON array from the response (non-greedy to avoid capturing extra text)
  const jsonMatch = content.match(/\[[\s\S]*?\](?=[^[\]]*$)/);
  if (!jsonMatch) return [];

  try {
    const tasks = JSON.parse(jsonMatch[0]) as ExtractedTask[];
    // Validate task types and add task_category
    return tasks.map((t) => ({
      ...t,
      task_type: TASK_TYPES.includes(t.task_type) ? t.task_type : 'other',
      task_category: inferTaskCategory(t.title || '', t.task_type),
      confidence: ['high', 'medium', 'low'].includes(t.confidence) ? t.confidence : 'medium',
    }));
  } catch {
    console.error('Failed to parse AI extraction output');
    return [];
  }
}

// ─── Priority Scoring ───

function computePriorityScore(
  task: {
    task_type: string;
    due_date: string;
    deal_ebitda: number | null;
    deal_stage_name: string | null;
    all_ebitda_values: number[];
  },
  today: string,
): number {
  // Deal Value Score (40%)
  let dealValueScore = 50; // default for unlinked tasks
  if (task.deal_ebitda != null && task.all_ebitda_values.length > 0) {
    const maxEbitda = Math.max(...task.all_ebitda_values);
    const minEbitda = Math.min(...task.all_ebitda_values);
    if (maxEbitda > minEbitda) {
      dealValueScore = ((task.deal_ebitda - minEbitda) / (maxEbitda - minEbitda)) * 100;
    } else {
      dealValueScore = 50;
    }
  }

  // Deal Stage Score (35%)
  let dealStageScore = 50; // default for unlinked tasks
  if (task.deal_stage_name) {
    const normalized = task.deal_stage_name.toLowerCase().trim();
    dealStageScore = DEAL_STAGE_SCORES[normalized] ?? 50;
  }

  // Task Type Score (15%)
  const taskTypeScore = TASK_TYPE_SCORES[task.task_type] ?? 40;

  // Overdue Bonus (10%)
  let overdueBonus = 0;
  const dueDate = new Date(task.due_date);
  const todayDate = new Date(today);
  if (dueDate < todayDate) {
    const daysOverdue = Math.floor((todayDate.getTime() - dueDate.getTime()) / 86400000);
    overdueBonus = Math.min(daysOverdue * 5, 100);
  }

  return dealValueScore * 0.4 + dealStageScore * 0.35 + taskTypeScore * 0.15 + overdueBonus * 0.1;
}

// ─── Shared Helpers (used by both single + batch) ───

interface TeamMember {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  aliases: string[];
}

async function loadTeamMembers(supabase: ReturnType<typeof createClient>): Promise<TeamMember[]> {
  const { data: teamRoles } = await supabase
    .from('user_roles')
    .select('user_id, profiles!inner(id, first_name, last_name, email)')
    .in('role', ['owner', 'admin', 'moderator']);

  const { data: aliases } = await supabase.from('team_member_aliases').select('profile_id, alias');

  const aliasMap = new Map<string, string[]>();
  for (const a of aliases || []) {
    const existing = aliasMap.get(a.profile_id) || [];
    existing.push(a.alias);
    aliasMap.set(a.profile_id, existing);
  }

  // Use profiles.id (same as user_id) for alias lookup — both reference auth.users.id.
  // Also extract email prefix as an automatic alias for better Fireflies speaker matching.
  return (teamRoles || []).map(
    (r: {
      user_id: string;
      profiles: { id: string; first_name: string; last_name: string; email: string };
    }) => {
      const profileId = r.profiles.id;
      const manualAliases = aliasMap.get(profileId) || [];

      // Auto-generate aliases from email prefix (e.g., "jsmith" from "jsmith@company.com")
      const emailPrefix = r.profiles.email?.split('@')[0];
      const autoAliases = emailPrefix ? [emailPrefix] : [];

      return {
        id: r.user_id,
        name: `${r.profiles.first_name || ''} ${r.profiles.last_name || ''}`.trim(),
        first_name: r.profiles.first_name || '',
        last_name: r.profiles.last_name || '',
        aliases: [...manualAliases, ...autoAliases],
      };
    },
  );
}

function matchAssignee(name: string, teamMembers: TeamMember[]): string | null {
  if (!name || name === 'Unassigned') return null;

  // Normalize: strip common Fireflies speaker prefixes like "Speaker 1 - ", "Host - "
  let lower = name.toLowerCase().trim();
  lower = lower.replace(/^(speaker\s*\d+\s*[-–—:]\s*)/i, '');
  lower = lower.replace(/^(host\s*[-–—:]\s*)/i, '');
  lower = lower.trim();

  if (!lower) return null;

  // Pass 1: exact match on full name, first name, last name
  for (const m of teamMembers) {
    if (m.name.toLowerCase() === lower) return m.id;
    if (m.first_name.toLowerCase() === lower) return m.id;
    if (m.last_name.toLowerCase() === lower) return m.id;
  }

  // Pass 2: alias match (includes manual aliases + auto email prefix)
  for (const m of teamMembers) {
    for (const alias of m.aliases) {
      if (alias.toLowerCase() === lower) return m.id;
    }
  }

  // Pass 3: handle "FirstName L." or "FirstName Last..." patterns
  const dotAbbrev = lower.match(/^(\w+)\s+(\w)\.\s*$/);
  if (dotAbbrev) {
    const [, first, lastInitial] = dotAbbrev;
    for (const m of teamMembers) {
      if (
        m.first_name.toLowerCase() === first &&
        m.last_name.toLowerCase().startsWith(lastInitial)
      ) {
        return m.id;
      }
    }
  }

  // Pass 4: first-name-in-full-speaker-name — handles "Oz De La Luna" matching "Oz"
  // Only match if the speaker name STARTS with the team member's first name
  // (avoids false positives from substring containment)
  for (const m of teamMembers) {
    if (m.first_name.length >= 2) {
      const firstLower = m.first_name.toLowerCase();
      // Speaker name starts with first name + space or end of string
      if (lower === firstLower || lower.startsWith(firstLower + ' ')) {
        return m.id;
      }
    }
  }
  return null;
}

async function matchDeal(
  dealRef: string,
  supabase: ReturnType<typeof createClient>,
): Promise<{
  id: string;
  listing_id: string;
  ebitda: number | null;
  stage_name: string | null;
} | null> {
  if (!dealRef) return null;
  // Sanitize dealRef to prevent PostgREST filter injection
  const sanitized = dealRef.replace(/[(),."'\\]/g, '').trim();
  if (!sanitized) return null;

  const { data: deals } = await supabase
    .from('deal_pipeline')
    .select(
      'id, listing_id, stage_id, deal_stages(name), listings!inner(ebitda, title, internal_company_name)',
    )
    .or(`title.ilike.%${sanitized}%,internal_company_name.ilike.%${sanitized}%`, {
      referencedTable: 'listings',
    })
    .limit(1);

  if (deals && deals.length > 0) {
    const deal = deals[0] as {
      id: string;
      listing_id: string;
      stage_id: string;
      deal_stages: { name: string } | null;
      listings: { ebitda: number | null; title: string; internal_company_name: string };
    };
    return {
      id: deal.id,
      listing_id: deal.listing_id,
      ebitda: deal.listings?.ebitda ?? null,
      stage_name: deal.deal_stages?.name ?? null,
    };
  }
  return null;
}

async function matchBuyer(
  text: string,
  supabase: ReturnType<typeof createClient>,
): Promise<{ id: string; company_name: string } | null> {
  if (!text) return null;
  // Extract potential buyer/firm name references from task text
  const buyerPatterns = [
    /(?:buyer|firm|partner|group|capital|fund|equity)\s+([A-Z][A-Za-z''&]+(?:\s+[A-Z&][A-Za-z''&]*)*)/i,
    /([A-Z][A-Za-z''&]+(?:\s+[A-Z&][A-Za-z''&]*){0,3})\s+(?:buyer|firm|partner|group|capital|fund|equity)/i,
    /(?:introduce|send|share|follow.?up|contact|reach out to)\s+([A-Z][A-Za-z''&]+(?:\s+[A-Z&][A-Za-z''&]*){0,3})/,
  ];

  for (const pattern of buyerPatterns) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1]?.trim();
      if (!name || name.length < 3) continue;
      const sanitized = name.replace(/[(),."'\\]/g, '').trim();
      if (!sanitized) continue;

      const { data: buyers } = await supabase
        .from('buyers')
        .select('id, company_name')
        .ilike('company_name', `%${sanitized}%`)
        .limit(1);

      if (buyers && buyers.length > 0) {
        return { id: buyers[0].id, company_name: buyers[0].company_name };
      }
    }
  }

  return null;
}

async function loadAllEbitdaValues(supabase: ReturnType<typeof createClient>): Promise<number[]> {
  const { data: allDeals } = await supabase
    .from('deal_pipeline')
    .select('listing_id, listings!inner(ebitda)');

  return (allDeals || [])
    .map((d: { listing_id: string; listings: { ebitda: number | null } }) => d.listings?.ebitda)
    .filter((e: unknown): e is number => typeof e === 'number' && e > 0);
}

async function recomputeRanks(supabase: ReturnType<typeof createClient>): Promise<void> {
  const { data: allTasks } = await supabase
    .from('daily_standup_tasks')
    .select('id, priority_score, is_pinned, pinned_rank, created_at')
    .in('status', ['pending', 'overdue'])
    .order('priority_score', { ascending: false })
    .order('created_at', { ascending: true });

  if (!allTasks || allTasks.length === 0) return;

  const totalTasks = allTasks.length;
  const validPinned = allTasks.filter(
    (t) => t.is_pinned && t.pinned_rank && t.pinned_rank <= totalTasks,
  );
  const pinnedSlots = new Map<number, string>();
  const pinnedTaskIds = new Set<string>();
  for (const p of validPinned) {
    if (!pinnedSlots.has(p.pinned_rank!)) {
      pinnedSlots.set(p.pinned_rank!, p.id);
      pinnedTaskIds.add(p.id);
    }
  }

  const unpinned = allTasks.filter((t) => !pinnedTaskIds.has(t.id));
  const ranked: { id: string; rank: number }[] = [];
  let unpinnedIdx = 0;

  for (let rank = 1; rank <= totalTasks; rank++) {
    if (pinnedSlots.has(rank)) {
      ranked.push({ id: pinnedSlots.get(rank)!, rank });
    } else if (unpinnedIdx < unpinned.length) {
      ranked.push({ id: unpinned[unpinnedIdx].id, rank });
      unpinnedIdx++;
    }
  }

  // Batch update: group by rank isn't possible in PostgREST, but we can
  // reduce round-trips by running updates in parallel batches of 10
  const BATCH_SIZE = 10;
  for (let i = 0; i < ranked.length; i += BATCH_SIZE) {
    const batch = ranked.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(({ id, rank }) =>
        supabase.from('daily_standup_tasks').update({ priority_rank: rank }).eq('id', id),
      ),
    );
  }
}

// ─── Process a single meeting ───

interface ProcessResult {
  meeting_id: string;
  fireflies_id: string;
  meeting_title: string;
  tasks_extracted: number;
  tasks_unassigned: number;
  tasks_needing_review: number;
  tasks_deduplicated: number;
  tasks_carried_over: number;
  tasks: unknown[];
  skipped?: boolean;
  skip_reason?: string;
}

async function processSingleMeeting(
  firefliesId: string,
  body: ExtractRequest,
  supabase: ReturnType<typeof createClient>,
  teamMembers: TeamMember[],
  allEbitdaValues: number[],
  autoApproveEnabled: boolean,
  today: string,
): Promise<ProcessResult> {
  const useFirefliesActions = body.use_fireflies_actions ?? false;

  // Check if already processed
  const { data: existing } = await supabase
    .from('standup_meetings')
    .select('id')
    .eq('fireflies_transcript_id', firefliesId)
    .maybeSingle();

  if (existing) {
    console.log(`Transcript ${firefliesId} already processed as meeting ${existing.id}`);
    return {
      meeting_id: existing.id,
      fireflies_id: firefliesId,
      meeting_title: '',
      tasks_extracted: 0,
      tasks_unassigned: 0,
      tasks_needing_review: 0,
      tasks_deduplicated: 0,
      tasks_carried_over: 0,
      tasks: [],
      skipped: true,
      skip_reason: 'Already processed',
    };
  }

  let transcriptText = body.transcript_text || '';
  let meetingTitle = body.meeting_title || 'Daily Standup';
  let meetingDate = body.meeting_date || today;
  let transcriptUrl = '';
  let meetingDuration = 0;
  let extractedTasks: ExtractedTask[] = [];

  if (useFirefliesActions) {
    // ── Fireflies-native mode: parse action_items from summary ──
    console.log(`[Fireflies-native] Fetching summary for ${firefliesId}...`);
    const summary = await fetchSummary(firefliesId);
    if (!summary) {
      throw new Error(`Transcript ${firefliesId} not found in Fireflies`);
    }

    meetingTitle = summary.title || meetingTitle;
    transcriptUrl = summary.transcript_url || '';
    meetingDuration = summary.duration ? Math.round(summary.duration) : 0;

    if (summary.date) {
      const dateNum = typeof summary.date === 'number' ? summary.date : parseInt(summary.date, 10);
      if (!isNaN(dateNum)) {
        meetingDate = new Date(dateNum).toISOString().split('T')[0];
      }
    }

    const actionItemsText = summary.summary?.action_items || '';
    if (!actionItemsText.trim()) {
      console.log(`[Fireflies-native] No action items found for ${firefliesId}`);
    }

    extractedTasks = parseFirefliesActionItems(actionItemsText, today);
    console.log(`[Fireflies-native] Parsed ${extractedTasks.length} tasks from action items`);
  } else {
    // ── AI mode: fetch full transcript and use Gemini ──
    if (firefliesId && !transcriptText) {
      console.log(`Fetching transcript ${firefliesId} from Fireflies...`);
      const transcript = await fetchTranscript(firefliesId);
      if (!transcript) {
        throw new Error(`Transcript ${firefliesId} not found in Fireflies`);
      }

      meetingTitle = transcript.title || meetingTitle;
      transcriptUrl = transcript.transcript_url || '';
      meetingDuration = transcript.duration ? Math.round(transcript.duration) : 0;

      if (transcript.date) {
        const dateNum =
          typeof transcript.date === 'number' ? transcript.date : parseInt(transcript.date, 10);
        if (!isNaN(dateNum)) {
          meetingDate = new Date(dateNum).toISOString().split('T')[0];
        }
      }

      if (transcript.sentences && transcript.sentences.length > 0) {
        transcriptText = transcript.sentences
          .map((s: { speaker_name: string; text: string; start_time: number }) => {
            const mins = Math.floor((s.start_time || 0) / 60);
            const secs = Math.floor((s.start_time || 0) % 60);
            return `[${mins}:${secs.toString().padStart(2, '0')}] ${s.speaker_name}: ${s.text}`;
          })
          .join('\n');
      }
    }

    if (!transcriptText) {
      throw new Error('No transcript text available');
    }

    console.log('Running AI extraction...');
    extractedTasks = await extractTasksWithAI(
      transcriptText,
      teamMembers.map((m) => ({ name: m.name, aliases: m.aliases })),
      today,
    );
    console.log(`Extracted ${extractedTasks.length} tasks`);
  }

  // Standardize task titles before saving
  for (const task of extractedTasks) {
    task.title = standardizeTaskTitle(task.title, task.deal_reference);
  }

  // Filter: only keep deal/buyer-related tasks with a real deal reference
  const preFilterCount = extractedTasks.length;
  extractedTasks = extractedTasks.filter((task) => {
    // Drop non-deal categories
    if (task.task_category === 'platform_task' || task.task_category === 'operations_task') {
      return false;
    }
    // Require a deal_reference for ALL tasks — no generic tasks without a deal/company
    if (!task.deal_reference) {
      return false;
    }
    return true;
  });
  const droppedCount = preFilterCount - extractedTasks.length;
  if (droppedCount > 0) {
    console.log(`[filter] Dropped ${droppedCount} non-deal tasks (kept ${extractedTasks.length})`);
  }

  // Create standup meeting record
  const { data: meeting, error: meetingError } = await supabase
    .from('standup_meetings')
    .insert({
      fireflies_transcript_id: firefliesId,
      meeting_title: meetingTitle,
      meeting_date: meetingDate,
      meeting_duration_minutes: meetingDuration || null,
      transcript_url: transcriptUrl || null,
      is_ds_meeting: true,
      tasks_extracted: extractedTasks.length,
      tasks_unassigned: extractedTasks.filter((t) => !matchAssignee(t.assignee_name, teamMembers))
        .length,
      extraction_confidence_avg:
        extractedTasks.length > 0
          ? extractedTasks.reduce((sum, t) => {
              const scores = { high: 100, medium: 70, low: 40 };
              return sum + (scores[t.confidence] || 70);
            }, 0) / extractedTasks.length
          : null,
    })
    .select()
    .single();

  if (meetingError) throw meetingError;

  // Create task records with priority scoring + dedup
  const taskRecords = [];
  let dedupCount = 0;
  for (const task of extractedTasks) {
    const assigneeId = matchAssignee(task.assignee_name, teamMembers);

    // Auto-create alias if speaker name matched but isn't already a known alias
    if (assigneeId && task.assignee_name && task.assignee_name !== 'Unassigned') {
      const speakerLower = task.assignee_name.toLowerCase().trim();
      const matchedMember = teamMembers.find((m) => m.id === assigneeId);
      if (matchedMember) {
        const existingAliases = new Set([
          matchedMember.name.toLowerCase(),
          matchedMember.first_name.toLowerCase(),
          matchedMember.last_name.toLowerCase(),
          ...matchedMember.aliases.map((a) => a.toLowerCase()),
        ]);
        if (!existingAliases.has(speakerLower)) {
          // Save new alias for future matching (fire-and-forget)
          supabase
            .from('team_member_aliases')
            .upsert(
              { profile_id: assigneeId, alias: task.assignee_name.trim() },
              { onConflict: 'profile_id,alias' },
            )
            .then(({ error }) => {
              if (error)
                console.warn(
                  `[alias] Failed to save alias "${task.assignee_name}" for ${matchedMember.name}: ${error.message}`,
                );
              else
                console.log(
                  `[alias] Auto-saved alias "${task.assignee_name}" → ${matchedMember.name}`,
                );
            });
        }
      }
    }

    // Recurring task dedup: skip if same task already open for this assignee
    if (await findRecurringTask(supabase, assigneeId, task.title)) {
      console.log(`[dedup] Skipping duplicate task: "${task.title}" for assignee ${assigneeId}`);
      dedupCount++;
      continue;
    }

    const dealMatch = await matchDeal(task.deal_reference, supabase);
    const buyerMatch = await matchBuyer(task.title, supabase);

    const priorityScore = computePriorityScore(
      {
        task_type: task.task_type,
        due_date: task.due_date || today,
        deal_ebitda: dealMatch?.ebitda ?? null,
        deal_stage_name: dealMatch?.stage_name ?? null,
        all_ebitda_values: allEbitdaValues,
      },
      today,
    );

    const needsReview = !assigneeId || task.confidence === 'low';
    const shouldAutoApprove =
      autoApproveEnabled && task.confidence === 'high' && assigneeId !== null && !needsReview;

    // Determine entity linking: prefer deal > buyer > null
    let entityType: string | null = null;
    let entityId: string | null = null;
    let secondaryEntityType: string | null = null;
    let secondaryEntityId: string | null = null;

    if (dealMatch) {
      entityType = 'deal';
      entityId = dealMatch.id;
      if (buyerMatch) {
        secondaryEntityType = 'buyer';
        secondaryEntityId = buyerMatch.id;
      }
    } else if (buyerMatch) {
      entityType = 'buyer';
      entityId = buyerMatch.id;
    }

    taskRecords.push({
      title: task.title,
      description: task.description || null,
      assignee_id: assigneeId,
      task_type: task.task_type,
      task_category: task.task_category || 'deal_task',
      status: shouldAutoApprove ? 'pending' : 'pending_approval',
      due_date: isValidDateString(task.due_date) ? task.due_date : today,
      source_meeting_id: meeting.id,
      source_timestamp: task.source_timestamp || null,
      source_timestamp_seconds: parseTimestampToSeconds(task.source_timestamp || ''),
      deal_reference: task.deal_reference || null,
      deal_id: dealMatch?.id || null,
      priority_score: Math.round(priorityScore * 100) / 100,
      extraction_confidence: task.confidence,
      needs_review: needsReview,
      is_manual: false,
      approved_by: shouldAutoApprove ? 'system' : null,
      approved_at: shouldAutoApprove ? new Date().toISOString() : null,
      source: 'ai',
      entity_type: entityType,
      entity_id: entityId,
      secondary_entity_type: secondaryEntityType,
      secondary_entity_id: secondaryEntityId,
    });
  }

  // Insert all tasks
  const { data: insertedTasks, error: insertError } = await supabase
    .from('daily_standup_tasks')
    .insert(taskRecords)
    .select();

  if (insertError) throw insertError;

  // Log deal activities for tasks linked to deals
  const dealActivityRecords = (insertedTasks || [])
    .filter(
      (t: { entity_type: string | null; entity_id: string | null }) =>
        t.entity_type === 'deal' && t.entity_id,
    )
    .map(
      (t: {
        id: string;
        entity_id: string;
        title: string;
        task_type: string;
        assignee_id: string | null;
      }) => ({
        deal_id: t.entity_id,
        activity_type: 'task_created',
        title: `Task: ${t.title}`,
        description: `Auto-extracted from standup meeting. Type: ${t.task_type}`,
        metadata: { task_id: t.id, source: 'standup', assignee_id: t.assignee_id },
      }),
    );
  if (dealActivityRecords.length > 0) {
    await supabase.from('deal_activities').insert(dealActivityRecords);
  }

  // Task carryover: bring forward incomplete tasks from previous standup
  const carriedOver = await carryOverIncompleteTasks(
    supabase,
    meeting.id,
    meetingDate,
    extractedTasks.map((t) => t.title),
  );
  if (carriedOver > 0) {
    console.log(`[carryover] Carried forward ${carriedOver} incomplete tasks`);
  }

  return {
    meeting_id: meeting.id,
    fireflies_id: firefliesId,
    meeting_title: meetingTitle,
    tasks_extracted: taskRecords.length,
    tasks_unassigned: taskRecords.filter((t) => !t.assignee_id).length,
    tasks_needing_review: taskRecords.filter((t) => t.needs_review).length,
    tasks_deduplicated: dedupCount,
    tasks_carried_over: carriedOver,
    tasks: insertedTasks || [],
  };
}

// ─── Main Handler ───

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = (await req.json()) as ExtractRequest;
    const today = new Date().toISOString().split('T')[0];

    // Load shared data once
    const teamMembers = await loadTeamMembers(supabase);
    console.log(`Found ${teamMembers.length} team members`);

    const allEbitdaValues = await loadAllEbitdaValues(supabase);

    // Load known deal names for single-word deal matching
    _knownDealNames = await loadActiveDealNames(supabase);
    console.log(`Loaded ${_knownDealNames.length} known deal names`);

    // Build team member name exclusion set for deal reference matching
    _teamMemberNames = new Set<string>();
    for (const m of teamMembers) {
      if (m.name) _teamMemberNames.add(m.name.toLowerCase());
      if (m.first_name) _teamMemberNames.add(m.first_name.toLowerCase());
      if (m.last_name) _teamMemberNames.add(m.last_name.toLowerCase());
      for (const alias of m.aliases) {
        _teamMemberNames.add(alias.toLowerCase());
      }
    }

    // Check auto-approve setting from app_settings table
    let autoApproveEnabled = true;
    const { data: autoApproveSetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'task_auto_approve_high_confidence')
      .maybeSingle();

    if (autoApproveSetting?.value !== undefined) {
      autoApproveEnabled = autoApproveSetting.value === 'true' || autoApproveSetting.value === true;
    }

    // Determine which IDs to process
    const transcriptIds: string[] = [];
    if (body.fireflies_transcript_ids && body.fireflies_transcript_ids.length > 0) {
      transcriptIds.push(...body.fireflies_transcript_ids);
    } else if (body.fireflies_transcript_id) {
      transcriptIds.push(body.fireflies_transcript_id);
    } else if (body.transcript_text) {
      // Manual text mode — use a synthetic ID
      transcriptIds.push(`manual-${Date.now()}`);
    } else {
      return new Response(
        JSON.stringify({ error: 'No fireflies_transcript_id(s) or transcript_text provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Process each meeting
    const results: ProcessResult[] = [];
    const errors: { fireflies_id: string; error: string }[] = [];

    for (const fid of transcriptIds) {
      try {
        const result = await processSingleMeeting(
          fid,
          body,
          supabase,
          teamMembers,
          allEbitdaValues,
          autoApproveEnabled,
          today,
        );
        results.push(result);
      } catch (err) {
        console.error(`Error processing ${fid}:`, err);
        errors.push({
          fireflies_id: fid,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Recompute ranks once after all meetings processed
    const totalInserted = results.reduce((sum, r) => sum + (r.skipped ? 0 : r.tasks_extracted), 0);
    if (totalInserted > 0) {
      await recomputeRanks(supabase);
    }

    // Response format depends on single vs batch
    if (transcriptIds.length === 1 && errors.length === 0) {
      const r = results[0];
      return new Response(
        JSON.stringify({
          success: true,
          meeting_id: r.meeting_id,
          tasks_extracted: r.tasks_extracted,
          tasks_unassigned: r.tasks_unassigned,
          tasks_needing_review: r.tasks_needing_review,
          tasks_deduplicated: r.tasks_deduplicated,
          tasks_carried_over: r.tasks_carried_over,
          tasks: r.tasks,
          ...(r.skipped ? { skipped: true, skip_reason: r.skip_reason } : {}),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        batch: true,
        total_meetings: transcriptIds.length,
        processed: results.filter((r) => !r.skipped).length,
        skipped: results.filter((r) => r.skipped).length,
        total_tasks_extracted: results.reduce((sum, r) => sum + r.tasks_extracted, 0),
        results: results.map((r) => ({
          meeting_id: r.meeting_id,
          fireflies_id: r.fireflies_id,
          meeting_title: r.meeting_title,
          tasks_extracted: r.tasks_extracted,
          skipped: r.skipped || false,
          skip_reason: r.skip_reason,
        })),
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Extraction error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
