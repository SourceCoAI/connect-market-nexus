/* eslint-disable no-console */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { fetchWithAutoRetry } from '../_shared/ai-providers.ts';

// ─── Structured Logger ───

function createLogger(correlationId: string) {
  const ctx = { correlationId };
  return {
    info: (msg: string, data?: Record<string, unknown>) =>
      console.log(
        JSON.stringify({ level: 'info', msg, ...ctx, ...data, ts: new Date().toISOString() }),
      ),
    warn: (msg: string, data?: Record<string, unknown>) =>
      console.warn(
        JSON.stringify({ level: 'warn', msg, ...ctx, ...data, ts: new Date().toISOString() }),
      ),
    error: (msg: string, data?: Record<string, unknown>) =>
      console.error(
        JSON.stringify({ level: 'error', msg, ...ctx, ...data, ts: new Date().toISOString() }),
      ),
  };
}

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
  due_date: string;
  source_timestamp: string;
  deal_reference: string;
  confidence: 'high' | 'medium' | 'low';
}

// ─── Helpers ───

/** Compute a dedup key for cross-extraction duplicate prevention.
 *  Format must match the SQL backfill in migration 20260530000002:
 *  lower(trim(title)) || ':' || coalesce(source_meeting_id::text, 'none') || ':' || coalesce(due_date::text, 'none')
 */
function computeDedupKey(title: string, meetingId: string, dueDate: string): string {
  return `${title.toLowerCase().trim()}:${meetingId || 'none'}:${dueDate || 'none'}`;
}

// ─── Constants ───

const TASK_TYPES = [
  'contact_owner',
  'build_buyer_universe',
  'follow_up_with_buyer',
  'send_materials',
  'update_pipeline',
  'schedule_call',
  'nda_execution',
  'ioi_loi_process',
  'due_diligence',
  'buyer_qualification',
  'seller_relationship',
  'buyer_ic_followup',
  'other',
  // Deal-specific types (added in migration 20260508000000)
  'call',
  'email',
  'find_buyers',
  'contact_buyers',
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
        participants
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
        participants
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

  // Email-specific
  if (/\b(email|send.*email|write.*email)\b/.test(lower)) {
    return 'email';
  }

  // Generic call
  if (/\b(call|phone|dial)\b/.test(lower)) {
    return 'call';
  }

  return 'other';
}

/** Try to extract a deal/company reference from action item text */
function extractDealReference(text: string): string {
  // Look for capitalized multi-word names that likely reference deals
  // Common patterns: "owner of [Deal Name]", "for [Deal Name]", "[Deal Name] deal"
  const patterns = [
    /(?:owner of|for|regarding|about|on)\s+([A-Z][A-Za-z'']+(?:\s+[A-Z&][A-Za-z'']*)*)/,
    /([A-Z][A-Za-z'']+(?:\s+[A-Z&][A-Za-z'']*){1,4})\s+(?:deal|listing|company|business)/i,
  ];

  const commonWords = new Set([
    'The',
    'This',
    'That',
    'These',
    'Those',
    'Team',
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
  ]);

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const ref = match[1]?.trim();
      if (ref && !commonWords.has(ref)) {
        return ref;
      }
    }
  }

  return '';
}

// ─── AI Extraction ───

function buildExtractionPrompt(
  teamMembers: { name: string; aliases: string[] }[],
  today: string,
  activeDealNames?: string[],
): string {
  const memberList = teamMembers
    .map(
      (m) =>
        `- ${m.name}${m.aliases.length > 0 ? ` (also known as: ${m.aliases.join(', ')})` : ''}`,
    )
    .join('\n');

  const dealSection =
    activeDealNames && activeDealNames.length > 0
      ? `\n## Active Deals (use these for deal_reference matching)\n${activeDealNames.map((n) => `- ${n}`).join('\n')}\n`
      : '';

  return `You are a task extraction engine for a business development team's daily standup meeting.

Your job is to parse the meeting transcript and extract concrete, actionable tasks that specific team members are expected to perform.

## Team Members
${memberList}
${dealSection}
## Task Types
- contact_owner: Reach out to a business owner about a deal
- build_buyer_universe: Research and compile potential buyers for a deal
- follow_up_with_buyer: Follow up on an existing buyer conversation
- send_materials: Send teasers, CIMs, or other deal documents
- update_pipeline: Update CRM records, deal status, or notes
- schedule_call: Arrange a call with an owner, buyer, or internal team
- nda_execution: Send, follow up on, or finalize an NDA
- ioi_loi_process: Manage IOI or LOI submission, review, or negotiation
- due_diligence: Coordinate or follow up on due diligence activities
- buyer_qualification: Qualify or vet a potential buyer
- seller_relationship: Maintain or strengthen the relationship with a seller/owner
- buyer_ic_followup: Follow up with a buyer's investment committee or decision-makers
- call: Make a phone call (general, not owner-specific)
- email: Send an email (general, not materials-specific)
- find_buyers: Research and find potential buyers
- contact_buyers: Reach out to specific buyers
- other: Tasks that don't fit above categories

## Extraction Rules
1. A task is any specific action a named person is expected to perform
2. Each task must have: title, description, assignee_name, task_type, due_date, confidence
3. If no specific person is named for a task, set assignee_name to "Unassigned"
4. Default due_date is "${today}" unless context implies multi-day (e.g., "this week" = end of week)
5. Include source_timestamp (approximate time in meeting like "2:30") if discernible
6. Include deal_reference if a specific deal/company is mentioned
7. Ignore general discussion, opinions, and status updates that don't create new actions
8. Do NOT extract duplicate tasks — if the same action is discussed multiple times, only extract it once
9. Set confidence to "high" if the task and assignee are explicitly stated, "medium" if inferred from context, "low" if ambiguous

## Output Format
Return a JSON array of task objects. Example:
[
  {
    "title": "Call the owner of Smith Manufacturing",
    "description": "Owner hasn't responded to last email. Try calling directly.",
    "assignee_name": "Tom",
    "task_type": "contact_owner",
    "due_date": "${today}",
    "source_timestamp": "3:45",
    "deal_reference": "Smith Manufacturing",
    "confidence": "high"
  }
]

Return ONLY the JSON array, no other text.`;
}

// Chunk long transcripts into overlapping segments so the AI doesn't lose
// the second half of 60+ minute meetings.
const MAX_CHUNK_CHARS = 80_000; // ~20k tokens — well within Gemini context
const OVERLAP_CHARS = 2_000; // overlap to avoid splitting mid-action-item

function chunkTranscript(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];

  const chunks: string[] = [];
  let pos = 0;
  const step = MAX_CHUNK_CHARS - OVERLAP_CHARS;
  if (step <= 0) {
    // Safety: overlap must be smaller than chunk size
    return [text];
  }
  while (pos < text.length) {
    const end = Math.min(pos + MAX_CHUNK_CHARS, text.length);
    chunks.push(text.slice(pos, end));
    if (end >= text.length) break;
    pos += step;
  }
  console.log(`[chunking] Split ${text.length} char transcript into ${chunks.length} chunks`);
  return chunks;
}

async function extractFromSingleChunk(
  chunk: string,
  chunkLabel: string,
  systemPrompt: string,
  apiKey: string,
): Promise<ExtractedTask[]> {
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
          { role: 'user', content: `Here is the meeting transcript${chunkLabel}:\n\n${chunk}` },
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

  // Find the outermost JSON array — use greedy match to capture nested brackets
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const tasks = JSON.parse(jsonMatch[0]) as ExtractedTask[];
    return tasks.map((t) => ({
      ...t,
      task_type: TASK_TYPES.includes(t.task_type) ? t.task_type : 'other',
      confidence: ['high', 'medium', 'low'].includes(t.confidence) ? t.confidence : 'medium',
    }));
  } catch {
    console.error(`Failed to parse AI extraction output for ${chunkLabel}`);
    return [];
  }
}

async function extractTasksWithAI(
  transcriptText: string,
  teamMembers: { name: string; aliases: string[] }[],
  today: string,
  activeDealNames?: string[],
): Promise<ExtractedTask[]> {
  const systemPrompt = buildExtractionPrompt(teamMembers, today, activeDealNames);

  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not configured');

  const chunks = chunkTranscript(transcriptText);

  if (chunks.length === 1) {
    return extractFromSingleChunk(chunks[0], '', systemPrompt, apiKey);
  }

  // Process chunks and merge, deduplicating by normalised title
  // Continue on per-chunk failures so partial results are still returned
  const allTasks: ExtractedTask[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const label = ` (part ${i + 1} of ${chunks.length})`;
    try {
      const chunkTasks = await extractFromSingleChunk(chunks[i], label, systemPrompt, apiKey);
      allTasks.push(...chunkTasks);
    } catch (chunkErr) {
      console.error(`[chunking] Failed to extract from chunk ${i + 1}/${chunks.length}:`, chunkErr);
      // Continue with other chunks rather than failing entirely
    }
  }

  // Deduplicate across chunks by normalised title
  const seen = new Set<string>();
  return allTasks.filter((t) => {
    const key = t.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    .select('user_id, profiles!inner(id, first_name, last_name)')
    .in('role', ['owner', 'admin', 'moderator']);

  const { data: aliases } = await supabase.from('team_member_aliases').select('profile_id, alias');

  const aliasMap = new Map<string, string[]>();
  for (const a of aliases || []) {
    const existing = aliasMap.get(a.profile_id) || [];
    existing.push(a.alias);
    aliasMap.set(a.profile_id, existing);
  }

  return (teamRoles || []).map(
    (r: { user_id: string; profiles: { id: string; first_name: string; last_name: string } }) => ({
      id: r.user_id,
      name: `${r.profiles.first_name || ''} ${r.profiles.last_name || ''}`.trim(),
      first_name: r.profiles.first_name || '',
      last_name: r.profiles.last_name || '',
      aliases: aliasMap.get(r.user_id) || [],
    }),
  );
}

function matchAssignee(name: string, teamMembers: TeamMember[]): string | null {
  if (!name || name === 'Unassigned') return null;
  const lower = name.toLowerCase().trim();
  for (const m of teamMembers) {
    if (m.name.toLowerCase() === lower) return m.id;
    if (m.first_name.toLowerCase() === lower) return m.id;
    if (m.last_name.toLowerCase() === lower) return m.id;
    for (const alias of m.aliases) {
      if (alias.toLowerCase() === lower) return m.id;
    }
  }
  // Fuzzy: check if name is contained in any team member name
  // Require minimum 3 characters to avoid false positives (e.g., "an" matching "Dan")
  if (lower.length >= 3) {
    for (const m of teamMembers) {
      if (
        m.name.toLowerCase().includes(lower) ||
        (m.first_name.length >= 3 && lower.includes(m.first_name.toLowerCase()))
      ) {
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
  // Sanitize: strip PostgREST operators and escape SQL LIKE wildcards
  const sanitized = dealRef
    .replace(/[(),."'\\]/g, '')
    .replace(/%/g, '')
    .replace(/_/g, '\\_')
    .trim();
  if (!sanitized || sanitized.length < 2) return null;

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
      const sanitized = name
        .replace(/[(),."'\\]/g, '')
        .replace(/%/g, '')
        .replace(/_/g, '\\_')
        .trim();
      if (!sanitized || sanitized.length < 2) continue;

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

// ─── Match meeting participants to contacts table ───

async function matchContactsFromParticipants(
  participants: string[],
  supabase: ReturnType<typeof createClient>,
): Promise<{ id: string; first_name: string; last_name: string; email: string | null }[]> {
  if (!participants || participants.length === 0) return [];

  type ContactRow = { id: string; first_name: string; last_name: string; email: string | null };
  const matchedMap = new Map<string, ContactRow>();

  // Separate emails from names for batch processing
  const emails: string[] = [];
  const nameParts: { firstName: string; lastName: string }[] = [];

  for (const participant of participants) {
    const name = participant.trim();
    if (!name || name.length < 2) continue;

    if (name.includes('@')) {
      emails.push(name.toLowerCase());
    } else {
      const parts = name.split(/\s+/);
      if (parts.length >= 2) {
        const firstName = parts[0].replace(/[^a-zA-Z'-]/g, '');
        const lastName = parts
          .slice(1)
          .join(' ')
          .replace(/[^a-zA-Z' -]/g, '');
        if (firstName.length >= 2 && lastName.length >= 2) {
          nameParts.push({ firstName, lastName });
        }
      }
    }
  }

  // Batch email lookup in a single query
  if (emails.length > 0) {
    const { data: emailMatches } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email')
      .in('email', emails);
    for (const c of (emailMatches || []) as ContactRow[]) {
      matchedMap.set(c.id, c);
    }
  }

  // Name lookups still need individual queries due to ilike patterns,
  // but run them in parallel instead of sequentially
  if (nameParts.length > 0) {
    const namePromises = nameParts.map(async ({ firstName, lastName }) => {
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email')
        .ilike('first_name', firstName)
        .ilike('last_name', `${lastName}%`)
        .limit(1);
      return (data || []) as ContactRow[];
    });
    const results = await Promise.all(namePromises);
    for (const rows of results) {
      for (const c of rows) {
        matchedMap.set(c.id, c);
      }
    }
  }

  return [...matchedMap.values()];
}

async function loadAllEbitdaValues(supabase: ReturnType<typeof createClient>): Promise<number[]> {
  const { data: allDeals } = await supabase
    .from('deal_pipeline')
    .select('listing_id, listings!inner(ebitda)');

  return (allDeals || [])
    .map((d: { listing_id: string; listings: { ebitda: number | null } }) => d.listings?.ebitda)
    .filter((e: unknown): e is number => typeof e === 'number' && e > 0);
}

/** Load active deal names so the AI prompt can match deal references more accurately. */
async function loadActiveDealNames(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  const { data: deals } = await supabase
    .from('deal_pipeline')
    .select('title, listings!inner(title, internal_company_name)')
    .limit(200);

  if (!deals) return [];

  const names = new Set<string>();
  for (const d of deals as {
    title: string;
    listings: { title: string; internal_company_name: string };
  }[]) {
    if (d.title) names.add(d.title);
    if (d.listings?.title) names.add(d.listings.title);
    if (d.listings?.internal_company_name) names.add(d.listings.internal_company_name);
  }
  return [...names].sort();
}

async function recomputeRanks(supabase: ReturnType<typeof createClient>): Promise<void> {
  const { data: allTasks } = await supabase
    .from('daily_standup_tasks')
    .select('id, priority_score, is_pinned, pinned_rank, created_at')
    .in('status', ['pending_approval', 'pending', 'overdue'])
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

  for (const { id, rank } of ranked) {
    await supabase.from('daily_standup_tasks').update({ priority_rank: rank }).eq('id', id);
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
  tasks_deduplicated?: number;
  contacts_matched?: number;
  low_confidence_count?: number;
  processing_duration_ms?: number;
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
  activeDealNames: string[],
  log: ReturnType<typeof createLogger>,
  correlationId: string,
  webhookLogId: string | null,
): Promise<ProcessResult> {
  const processingStart = performance.now();
  const useFirefliesActions = body.use_fireflies_actions ?? false;

  // Check if already processed
  const { data: existing } = await supabase
    .from('standup_meetings')
    .select('id')
    .eq('fireflies_transcript_id', firefliesId)
    .maybeSingle();

  if (existing) {
    log.info('Transcript already processed', { firefliesId, meetingId: existing.id });
    return {
      meeting_id: existing.id,
      fireflies_id: firefliesId,
      meeting_title: '',
      tasks_extracted: 0,
      tasks_unassigned: 0,
      tasks_needing_review: 0,
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
  let meetingParticipants: string[] = [];

  if (useFirefliesActions) {
    // ── Fireflies-native mode: parse action_items from summary ──
    log.info('Fetching Fireflies summary', { firefliesId, mode: 'fireflies-native' });
    const summary = await fetchSummary(firefliesId);
    if (!summary) {
      throw new Error(`Transcript ${firefliesId} not found in Fireflies`);
    }

    meetingTitle = summary.title || meetingTitle;
    transcriptUrl = summary.transcript_url || '';
    meetingDuration = summary.duration ? Math.round(summary.duration) : 0;
    meetingParticipants = summary.participants || [];

    if (summary.date) {
      const dateNum = typeof summary.date === 'number' ? summary.date : parseInt(summary.date, 10);
      if (!isNaN(dateNum)) {
        meetingDate = new Date(dateNum).toISOString().split('T')[0];
      }
    }

    const actionItemsText = summary.summary?.action_items || '';
    if (!actionItemsText.trim()) {
      log.info('No action items found in summary', { firefliesId });
    }

    extractedTasks = parseFirefliesActionItems(actionItemsText, today);
    log.info('Parsed Fireflies action items', { firefliesId, taskCount: extractedTasks.length });
  } else {
    // ── AI mode: fetch full transcript and use Gemini ──
    if (firefliesId && !transcriptText) {
      log.info('Fetching transcript from Fireflies', { firefliesId, mode: 'ai' });
      const transcript = await fetchTranscript(firefliesId);
      if (!transcript) {
        throw new Error(`Transcript ${firefliesId} not found in Fireflies`);
      }

      meetingTitle = transcript.title || meetingTitle;
      transcriptUrl = transcript.transcript_url || '';
      meetingDuration = transcript.duration ? Math.round(transcript.duration) : 0;
      meetingParticipants = transcript.participants || [];

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

    log.info('Running AI extraction', { transcriptLength: transcriptText.length });
    extractedTasks = await extractTasksWithAI(
      transcriptText,
      teamMembers.map((m) => ({ name: m.name, aliases: m.aliases })),
      today,
      activeDealNames,
    );
    log.info('AI extraction complete', { taskCount: extractedTasks.length });
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

  // Match meeting participants to contacts (for entity linking)
  const matchedContacts = await matchContactsFromParticipants(meetingParticipants, supabase);
  if (matchedContacts.length > 0) {
    log.info('Matched contacts from participants', {
      matched: matchedContacts.length,
      totalParticipants: meetingParticipants.length,
    });
  }

  // Create task records with priority scoring
  const taskRecords = [];
  for (const task of extractedTasks) {
    const assigneeId = matchAssignee(task.assignee_name, teamMembers);
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

    // Determine entity linking: prefer deal > buyer > contact > null
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
      } else if (matchedContacts.length > 0) {
        // Link first matched contact as secondary entity
        secondaryEntityType = 'contact';
        secondaryEntityId = matchedContacts[0].id;
      }
    } else if (buyerMatch) {
      entityType = 'buyer';
      entityId = buyerMatch.id;
      if (matchedContacts.length > 0) {
        secondaryEntityType = 'contact';
        secondaryEntityId = matchedContacts[0].id;
      }
    } else if (matchedContacts.length > 0) {
      // No deal or buyer match — link to the first matched contact
      entityType = 'contact';
      entityId = matchedContacts[0].id;
    }

    taskRecords.push({
      title: task.title,
      description: task.description || null,
      assignee_id: assigneeId,
      task_type: task.task_type,
      status: shouldAutoApprove ? 'pending' : 'pending_approval',
      due_date: isValidDateString(task.due_date) ? task.due_date : today,
      source_meeting_id: meeting.id,
      source_timestamp: task.source_timestamp || null,
      deal_reference: task.deal_reference || null,
      deal_id: dealMatch?.id || null,
      priority_score: Math.round(priorityScore * 100) / 100,
      extraction_confidence: task.confidence,
      needs_review: needsReview,
      is_manual: false,
      approved_by: shouldAutoApprove ? 'system' : null,
      approved_at: shouldAutoApprove ? new Date().toISOString() : null,
      source: 'ai',
      // created_by is intentionally null — edge function runs as service role with no auth user
      created_by: null,
      entity_type: entityType,
      entity_id: entityId,
      secondary_entity_type: secondaryEntityType,
      secondary_entity_id: secondaryEntityId,
      // Cross-extraction dedup key: prevents duplicates if same meeting is re-processed
      dedup_key: computeDedupKey(
        task.title,
        meeting.id,
        isValidDateString(task.due_date) ? task.due_date : today,
      ),
    });
  }

  // Batch insert tasks, handling dedup conflicts via ON CONFLICT
  let insertedTasks: unknown[] = [];
  const skippedDuplicates: string[] = [];

  if (taskRecords.length > 0) {
    // Try batch insert first — much faster than one-at-a-time
    const { data: batchResult, error: batchError } = await supabase
      .from('daily_standup_tasks')
      .insert(taskRecords)
      .select();

    if (batchError) {
      // If batch fails due to dedup conflict, fall back to individual inserts
      if (batchError.code === '23505' && batchError.message?.includes('dedup')) {
        log.info('Batch insert hit dedup conflict, falling back to individual inserts', {
          totalRecords: taskRecords.length,
        });
        for (const record of taskRecords) {
          const { data, error: insertError } = await supabase
            .from('daily_standup_tasks')
            .insert(record)
            .select()
            .maybeSingle();

          if (insertError) {
            if (insertError.code === '23505' && insertError.message?.includes('dedup')) {
              skippedDuplicates.push(record.title);
              continue;
            }
            throw insertError;
          }
          if (data) insertedTasks.push(data);
        }
      } else {
        throw batchError;
      }
    } else {
      insertedTasks = batchResult || [];
    }
  }

  // Update meeting record with actual inserted count (may differ due to dedup/failures)
  if (insertedTasks.length !== extractedTasks.length) {
    await supabase
      .from('standup_meetings')
      .update({ tasks_extracted: insertedTasks.length })
      .eq('id', meeting.id);
  }

  if (skippedDuplicates.length > 0) {
    log.info('Skipped duplicate tasks', {
      count: skippedDuplicates.length,
      titles: skippedDuplicates,
    });
  }

  // Count low-confidence tasks for metrics
  const lowConfidenceCount = taskRecords.filter((t) => t.extraction_confidence === 'low').length;

  // Send notifications to assignees for newly created tasks
  if (insertedTasks.length > 0) {
    try {
      const assignedTasks = taskRecords.filter((t) => t.assignee_id);
      // Group by assignee to send one notification per person
      const tasksByAssignee = new Map<string, typeof taskRecords>();
      for (const task of assignedTasks) {
        const existing = tasksByAssignee.get(task.assignee_id!) || [];
        existing.push(task);
        tasksByAssignee.set(task.assignee_id!, existing);
      }

      const notifications = [];
      for (const [assigneeId, tasks] of tasksByAssignee) {
        const taskTitles = tasks.map((t) => t.title).slice(0, 5);
        const moreCount = tasks.length > 5 ? tasks.length - 5 : 0;
        const taskList = taskTitles.join(', ') + (moreCount > 0 ? ` +${moreCount} more` : '');
        notifications.push({
          admin_id: assigneeId,
          notification_type: 'tasks_extracted',
          title: `${tasks.length} New Task${tasks.length > 1 ? 's' : ''} from Meeting`,
          message: `Tasks extracted from "${meetingTitle}": ${taskList}`,
          action_url: '/admin/daily-tasks',
          metadata: {
            meeting_id: meeting.id,
            meeting_title: meetingTitle,
            task_count: tasks.length,
            task_titles: taskTitles,
            correlation_id: correlationId,
          },
        });
      }

      if (notifications.length > 0) {
        await supabase.from('admin_notifications').insert(notifications);
        log.info('Sent task extraction notifications', {
          notificationCount: notifications.length,
          assigneeCount: tasksByAssignee.size,
        });
      }
    } catch (notifError) {
      log.warn('Failed to send task extraction notifications', {
        error: notifError instanceof Error ? notifError.message : 'Unknown error',
      });
    }
  }

  const processingDurationMs = Math.round(performance.now() - processingStart);

  // Record processing metrics
  try {
    await supabase.from('task_processing_metrics').insert({
      meeting_id: meeting.id,
      webhook_log_id: webhookLogId || null,
      correlation_id: correlationId,
      fireflies_transcript_id: firefliesId,
      tasks_extracted: insertedTasks.length,
      tasks_deduplicated: skippedDuplicates.length,
      tasks_unassigned: taskRecords.filter((t) => !t.assignee_id).length,
      tasks_needing_review: taskRecords.filter((t) => t.needs_review).length,
      contacts_matched: matchedContacts.length,
      low_confidence_count: lowConfidenceCount,
      processing_duration_ms: processingDurationMs,
      extraction_mode: useFirefliesActions ? 'fireflies-native' : 'ai',
    });
  } catch (metricsError) {
    log.warn('Failed to record processing metrics', {
      error: metricsError instanceof Error ? metricsError.message : 'Unknown error',
    });
  }

  log.info('Meeting processing complete', {
    meetingId: meeting.id,
    tasksExtracted: insertedTasks.length,
    tasksDeduplicated: skippedDuplicates.length,
    lowConfidenceCount,
    contactsMatched: matchedContacts.length,
    processingDurationMs,
  });

  return {
    meeting_id: meeting.id,
    fireflies_id: firefliesId,
    meeting_title: meetingTitle,
    tasks_extracted: insertedTasks.length,
    tasks_deduplicated: skippedDuplicates.length,
    tasks_unassigned: taskRecords.filter((t) => !t.assignee_id).length,
    tasks_needing_review: taskRecords.filter((t) => t.needs_review).length,
    contacts_matched: matchedContacts.length,
    low_confidence_count: lowConfidenceCount,
    processing_duration_ms: processingDurationMs,
    tasks: insertedTasks,
  };
}

// ─── Main Handler ───

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  // Correlation ID for end-to-end tracing
  const correlationId =
    req.headers.get('x-correlation-id') || `ext-${crypto.randomUUID().slice(0, 12)}`;
  const webhookLogId = req.headers.get('x-webhook-log-id') || null;
  const log = createLogger(correlationId);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = (await req.json()) as ExtractRequest;
    const today = new Date().toISOString().split('T')[0];

    // Load shared data once
    const teamMembers = await loadTeamMembers(supabase);
    log.info('Loaded team members', { count: teamMembers.length });

    const allEbitdaValues = await loadAllEbitdaValues(supabase);
    const activeDealNames = await loadActiveDealNames(supabase);
    log.info('Loaded active deal names for AI context', { count: activeDealNames.length });

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
          activeDealNames,
          log,
          correlationId,
          webhookLogId,
        );
        results.push(result);
      } catch (err) {
        log.error('Error processing transcript', {
          firefliesId: fid,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
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
          tasks_deduplicated: r.tasks_deduplicated,
          tasks_unassigned: r.tasks_unassigned,
          tasks_needing_review: r.tasks_needing_review,
          contacts_matched: r.contacts_matched,
          low_confidence_count: r.low_confidence_count,
          processing_duration_ms: r.processing_duration_ms,
          correlation_id: correlationId,
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
        total_deduplicated: results.reduce((sum, r) => sum + (r.tasks_deduplicated || 0), 0),
        total_low_confidence: results.reduce((sum, r) => sum + (r.low_confidence_count || 0), 0),
        correlation_id: correlationId,
        results: results.map((r) => ({
          meeting_id: r.meeting_id,
          fireflies_id: r.fireflies_id,
          meeting_title: r.meeting_title,
          tasks_extracted: r.tasks_extracted,
          tasks_deduplicated: r.tasks_deduplicated,
          contacts_matched: r.contacts_matched,
          low_confidence_count: r.low_confidence_count,
          processing_duration_ms: r.processing_duration_ms,
          skipped: r.skipped || false,
          skip_reason: r.skip_reason,
        })),
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    log.error('Extraction error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlation_id: correlationId,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
