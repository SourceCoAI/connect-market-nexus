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
  task_category: 'deal_task' | 'platform_task' | 'operations_task';
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
    const taskCategory = inferTaskCategory(taskText, taskType, currentSpeaker);
    const dealRef = extractDealReference(taskText);

    tasks.push({
      title: taskText,
      description: `From Fireflies action items. Speaker: ${currentSpeaker}`,
      assignee_name: currentSpeaker,
      task_type: taskType,
      task_category: taskCategory,
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

/** Classify a task as deal-related, platform/dev, or operations */
function inferTaskCategory(
  text: string,
  taskType: string,
  _assigneeName: string,
): 'deal_task' | 'platform_task' | 'operations_task' {
  const lower = text.toLowerCase();

  // Platform/dev indicators
  if (
    /\b(bug|fix|deploy|push|code|feature|api|database|migration|enrichment.*bug|upload.*issue|smartleads|data warehouse|webhook|integration)\b/.test(
      lower,
    )
  ) {
    return 'platform_task';
  }

  // Operations indicators
  if (
    /\b(invoice|billing|onboard|training|license|subscription|payroll|admin.*setup|office)\b/.test(
      lower,
    )
  ) {
    return 'operations_task';
  }

  // If task type is deal-specific, it's a deal task
  const dealTaskTypes = new Set([
    'contact_owner',
    'build_buyer_universe',
    'follow_up_with_buyer',
    'send_materials',
    'nda_execution',
    'ioi_loi_process',
    'due_diligence',
    'buyer_qualification',
    'seller_relationship',
    'buyer_ic_followup',
    'find_buyers',
    'contact_buyers',
  ]);

  if (dealTaskTypes.has(taskType)) return 'deal_task';

  // update_pipeline could be either — check context
  if (taskType === 'update_pipeline') {
    if (/\b(crm|salesforce|deal.*status|pipeline.*stage)\b/.test(lower)) return 'deal_task';
    if (/\b(data|system|platform|tool)\b/.test(lower)) return 'platform_task';
    return 'deal_task';
  }

  return 'deal_task'; // default for standup meetings
}

/** Parse a MM:SS or M:SS timestamp string to total seconds */
function parseTimestampToSeconds(timestamp: string): number | null {
  if (!timestamp) return null;
  const match = timestamp.match(/^(\d{1,3}):(\d{2})$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

/** Known deal names loaded from the database — set before extraction runs */
let _knownDealNames: string[] = [];

function setKnownDealNames(names: string[]) {
  _knownDealNames = names;
}

/** Try to extract a deal/company reference from action item text */
function extractDealReference(text: string): string {
  // First: check against known deal names from the database (handles single-word names)
  if (_knownDealNames.length > 0) {
    const textLower = text.toLowerCase();
    // Sort by length descending so longer names match first (e.g., "Smith Manufacturing" before "Smith")
    const sortedNames = [..._knownDealNames].sort((a, b) => b.length - a.length);
    for (const dealName of sortedNames) {
      if (dealName.length < 3) continue; // skip very short names
      if (textLower.includes(dealName.toLowerCase())) {
        return dealName;
      }
    }
  }

  // Fallback: regex patterns for capitalized names (multi-word and single-word)
  const patterns = [
    /(?:owner of|for|regarding|about|on)\s+([A-Z][A-Za-z'']+(?:\s+[A-Z&][A-Za-z'']*)*)/,
    /([A-Z][A-Za-z'']+(?:\s+[A-Z&][A-Za-z'']*){1,4})\s+(?:deal|listing|company|business)/i,
    // Single capitalized word followed by deal context
    /(?:owner of|for|regarding|about|on)\s+([A-Z][a-z]{2,})/,
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
    'September',
    'October',
    'November',
    'December',
    'Unassigned',
    'Action',
    'Follow',
    'Update',
    'Send',
    'Call',
    'Email',
    'Schedule',
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

## Task Categories
- deal_task: Any task directly related to a deal (calling owners, sending NDAs, buyer outreach, etc.)
- platform_task: Technical/dev tasks (fixing bugs, deploying code, system updates, data issues)
- operations_task: Administrative tasks (billing, onboarding, training, licenses)

## Extraction Rules
1. A task is any specific action a named person is expected to perform
2. Each task must have: title, description, assignee_name, task_type, task_category, due_date, confidence
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
    "task_category": "deal_task",
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
      task_category: ['deal_task', 'platform_task', 'operations_task'].includes(t.task_category)
        ? t.task_category
        : inferTaskCategory(t.title, t.task_type, t.assignee_name),
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

// ─── Auto-learn team member aliases ───

async function autoLearnAliases(
  extractedTasks: ExtractedTask[],
  teamMembers: TeamMember[],
  firefliesId: string,
  supabase: ReturnType<typeof createClient>,
  log: ReturnType<typeof createLogger>,
): Promise<number> {
  let learned = 0;
  const seen = new Set<string>();

  for (const task of extractedTasks) {
    const name = task.assignee_name?.trim();
    if (!name || name === 'Unassigned' || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    // Check if this name matches a team member by first/last name (not alias)
    const matchedMember = teamMembers.find((m) => {
      const lower = name.toLowerCase();
      return m.first_name.toLowerCase() === lower || m.last_name.toLowerCase() === lower;
    });

    if (!matchedMember) continue;

    // Check if this exact name is already stored as a full name or alias
    const isFullName =
      name.toLowerCase() === matchedMember.name.toLowerCase() ||
      name.toLowerCase() ===
        matchedMember.first_name.toLowerCase() + ' ' + matchedMember.last_name.toLowerCase();

    if (isFullName) continue; // skip exact full name matches

    const existingAlias = matchedMember.aliases.find((a) => a.toLowerCase() === name.toLowerCase());
    if (existingAlias) continue; // already known alias

    // Auto-learn this as a new alias
    const { error } = await supabase.from('team_member_aliases').insert({
      profile_id: matchedMember.id,
      alias: name,
      auto_learned: true,
      source_transcript_id: firefliesId,
    });

    if (!error) {
      learned++;
      log.info('Auto-learned new alias', {
        profileId: matchedMember.id,
        memberName: matchedMember.name,
        alias: name,
      });
    }
  }

  return learned;
}

// ─── Deal mention timeline tracking ───

async function recordDealMentions(
  meetingId: string,
  meetingDate: string,
  extractedTasks: ExtractedTask[],
  teamMembers: TeamMember[],
  supabase: ReturnType<typeof createClient>,
  log: ReturnType<typeof createLogger>,
): Promise<number> {
  // Group tasks by deal reference
  const dealMentions = new Map<string, { tasks: ExtractedTask[]; dealId: string | null }>();

  for (const task of extractedTasks) {
    if (!task.deal_reference) continue;
    const ref = task.deal_reference;
    if (!dealMentions.has(ref)) {
      // Try to resolve deal ID
      const sanitized = ref
        .replace(/[(),."'\\]/g, '')
        .replace(/%/g, '')
        .trim();
      let dealId: string | null = null;
      if (sanitized.length >= 2) {
        const { data } = await supabase
          .from('deal_pipeline')
          .select('id')
          .or(
            `title.ilike.%${sanitized}%`,
            // Simplified query — just check deal title
          )
          .limit(1);
        dealId = data?.[0]?.id || null;
      }
      dealMentions.set(ref, { tasks: [], dealId });
    }
    dealMentions.get(ref)!.tasks.push(task);
  }

  if (dealMentions.size === 0) return 0;

  const records = [];
  for (const [dealRef, { tasks, dealId }] of dealMentions) {
    // Find who mentioned this deal (first speaker)
    const mentionedBy = tasks[0]?.assignee_name
      ? teamMembers.find(
          (m) =>
            m.first_name.toLowerCase() === tasks[0].assignee_name.toLowerCase() ||
            m.name.toLowerCase() === tasks[0].assignee_name.toLowerCase(),
        )?.id || null
      : null;

    records.push({
      deal_id: dealId,
      deal_reference: dealRef,
      meeting_id: meetingId,
      meeting_date: meetingDate,
      mentioned_by: mentionedBy,
      context: tasks
        .map((t) => t.title)
        .join('; ')
        .slice(0, 500),
      tasks_generated: tasks.length,
    });
  }

  const { error } = await supabase.from('deal_mention_timeline').insert(records);
  if (error) {
    log.warn('Failed to record deal mention timeline', { error: error.message });
    return 0;
  }

  log.info('Recorded deal mention timeline', {
    dealsTracked: records.length,
    totalDealTasks: extractedTasks.filter((t) => t.deal_reference).length,
  });

  return records.length;
}

// ─── Meeting effectiveness scoring ───

async function computeEffectivenessScore(
  meetingId: string,
  meetingDate: string,
  tasksExtracted: number,
  recurringSkipped: number,
  carriedOverCount: number,
  supabase: ReturnType<typeof createClient>,
): Promise<number> {
  // Count tasks completed from the previous standup
  const { data: prevMeetings } = await supabase
    .from('standup_meetings')
    .select('id')
    .lt('meeting_date', meetingDate)
    .order('meeting_date', { ascending: false })
    .limit(1);

  let tasksCompletedFromPrevious = 0;
  if (prevMeetings && prevMeetings.length > 0) {
    const { count } = await supabase
      .from('daily_standup_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('source_meeting_id', prevMeetings[0].id)
      .eq('status', 'completed');
    tasksCompletedFromPrevious = count ?? 0;
  }

  // Effectiveness formula:
  // - New tasks generated: +3 pts each (max 30)
  // - Previous tasks completed: +5 pts each (max 50)
  // - Recurring tasks skipped (= already tracked): +1 pt each (max 10)
  // - Tasks carried over (= incomplete from previous): -2 pts each (max -20)
  const newTaskScore = Math.min(tasksExtracted * 3, 30);
  const completionScore = Math.min(tasksCompletedFromPrevious * 5, 50);
  const recurringScore = Math.min(recurringSkipped * 1, 10);
  const carryoverPenalty = Math.min(carriedOverCount * 2, 20);

  const score = Math.max(
    0,
    Math.min(100, newTaskScore + completionScore + recurringScore - carryoverPenalty),
  );

  // Update the meeting record
  await supabase
    .from('standup_meetings')
    .update({
      effectiveness_score: score,
      tasks_completed_from_previous: tasksCompletedFromPrevious,
      tasks_carried_over: carriedOverCount,
      recurring_tasks_skipped: recurringSkipped,
    })
    .eq('id', meetingId);

  return score;
}

// ─── Cross-meeting recurring task dedup ───

/**
 * Check if a newly extracted task is essentially the same as an existing
 * pending/overdue task from a previous standup. Returns the existing task ID
 * if a match is found, or null if the task is genuinely new.
 *
 * Match criteria: same assignee + similar title (normalized) + still incomplete
 */
async function findRecurringTask(
  title: string,
  assigneeId: string | null,
  currentMeetingId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<{ id: string; source_meeting_id: string } | null> {
  if (!assigneeId) return null; // can't dedup unassigned tasks reliably

  const normalizedTitle = title.toLowerCase().trim().replace(/\s+/g, ' ');

  // Find pending/overdue tasks for the same assignee from OTHER meetings
  const { data: candidates } = await supabase
    .from('daily_standup_tasks')
    .select('id, title, source_meeting_id')
    .eq('assignee_id', assigneeId)
    .in('status', ['pending', 'pending_approval', 'overdue'])
    .neq('source_meeting_id', currentMeetingId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!candidates || candidates.length === 0) return null;

  for (const candidate of candidates) {
    const candidateNorm = candidate.title.toLowerCase().trim().replace(/\s+/g, ' ');
    // Exact match after normalization
    if (candidateNorm === normalizedTitle) {
      return { id: candidate.id, source_meeting_id: candidate.source_meeting_id };
    }
    // Fuzzy: one title contains the other (for minor rewording)
    if (
      (normalizedTitle.length >= 15 && candidateNorm.includes(normalizedTitle)) ||
      (candidateNorm.length >= 15 && normalizedTitle.includes(candidateNorm))
    ) {
      return { id: candidate.id, source_meeting_id: candidate.source_meeting_id };
    }
  }

  return null;
}

// ─── Task Carryover ───

/**
 * Find incomplete tasks from the most recent previous standup that were NOT
 * re-mentioned in the current extraction. These get carried forward with a
 * "carryover" flag so the team knows they're still outstanding.
 */
async function carryOverIncompleteTasks(
  currentMeetingId: string,
  currentMeetingDate: string,
  extractedTitles: string[],
  supabase: ReturnType<typeof createClient>,
  log: ReturnType<typeof createLogger>,
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

  // Get incomplete tasks from that meeting
  const { data: incompleteTasks } = await supabase
    .from('daily_standup_tasks')
    .select('id, title, assignee_id, task_type, due_date, deal_reference, deal_id, priority_score')
    .eq('source_meeting_id', prevMeetingId)
    .in('status', ['pending', 'pending_approval', 'overdue']);

  if (!incompleteTasks || incompleteTasks.length === 0) return 0;

  // Normalize current extracted titles for comparison
  const currentNormalized = new Set(
    extractedTitles.map((t) => t.toLowerCase().trim().replace(/\s+/g, ' ')),
  );

  // Filter to tasks NOT re-mentioned in the current extraction
  const tasksToCarry = incompleteTasks.filter((task) => {
    const norm = task.title.toLowerCase().trim().replace(/\s+/g, ' ');
    // Check if any current task is similar
    for (const current of currentNormalized) {
      if (norm === current) return false;
      if (norm.length >= 15 && current.includes(norm)) return false;
      if (current.length >= 15 && norm.includes(current)) return false;
    }
    return true;
  });

  if (tasksToCarry.length === 0) return 0;

  // Mark carried-over tasks: update their source_meeting_id to current meeting
  // and add a carryover note to description
  for (const task of tasksToCarry) {
    await supabase
      .from('daily_standup_tasks')
      .update({
        source_meeting_id: currentMeetingId,
        description:
          `[Carried over from previous standup] ${task.deal_reference ? 'Deal: ' + task.deal_reference : ''}`.trim(),
        status: task.due_date < currentMeetingDate ? 'overdue' : 'pending',
      })
      .eq('id', task.id);
  }

  log.info('Carried over incomplete tasks from previous standup', {
    previousMeetingId: prevMeetingId,
    carriedOver: tasksToCarry.length,
    totalIncomplete: incompleteTasks.length,
  });

  return tasksToCarry.length;
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

  // Batch update: group by rank and update in parallel batches of 10
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
  tasks_deduplicated?: number;
  tasks_recurring_skipped?: number;
  tasks_carried_over?: number;
  contacts_matched?: number;
  low_confidence_count?: number;
  processing_duration_ms?: number;
  effectiveness_score?: number;
  deal_mentions_recorded?: number;
  aliases_learned?: number;
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

    // Set known deal names so regex-based extraction can match single-word names
    setKnownDealNames(activeDealNames);

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

    // Set known deal names so regex-based extraction can match single-word names
    setKnownDealNames(activeDealNames);

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

  // Create task records with priority scoring and cross-meeting dedup
  const taskRecords = [];
  let recurringSkipped = 0;
  for (const task of extractedTasks) {
    const assigneeId = matchAssignee(task.assignee_name, teamMembers);

    // Cross-meeting recurring task dedup: skip if same task already pending for this assignee
    const recurringMatch = await findRecurringTask(task.title, assigneeId, meeting.id, supabase);
    if (recurringMatch) {
      log.info('Skipping recurring task (already pending from previous standup)', {
        title: task.title,
        existingTaskId: recurringMatch.id,
        existingMeetingId: recurringMatch.source_meeting_id,
      });
      recurringSkipped++;
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
      task_category: task.task_category,
      status: shouldAutoApprove ? 'pending' : 'pending_approval',
      due_date: isValidDateString(task.due_date) ? task.due_date : today,
      source_meeting_id: meeting.id,
      source_timestamp: task.source_timestamp || null,
      source_timestamp_seconds: parseTimestampToSeconds(task.source_timestamp),
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

  if (recurringSkipped > 0) {
    log.info('Skipped recurring tasks (already pending from previous standups)', {
      count: recurringSkipped,
    });
  }

  // Carry over incomplete tasks from the previous standup that weren't re-mentioned
  let carriedOverCount = 0;
  try {
    carriedOverCount = await carryOverIncompleteTasks(
      meeting.id,
      meetingDate,
      extractedTasks.map((t) => t.title),
      supabase,
      log,
    );
  } catch (carryoverError) {
    log.warn('Task carryover failed (non-fatal)', {
      error: carryoverError instanceof Error ? carryoverError.message : 'Unknown error',
    });
  }

  // Log deal activities for tasks linked to deals (so tasks appear in deal history)
  try {
    const dealLinkedTasks = taskRecords.filter((t) => t.entity_type === 'deal' && t.entity_id);
    if (dealLinkedTasks.length > 0) {
      const dealActivities = dealLinkedTasks.map((t) => ({
        deal_id: t.entity_id,
        admin_id: t.assignee_id || null,
        activity_type: 'task_created',
        title: `Task from standup: ${t.title}`,
        description:
          `Extracted from "${meetingTitle}". ${t.deal_reference ? 'Deal: ' + t.deal_reference : ''} Type: ${t.task_type}`.trim(),
        metadata: {
          source: 'standup_extraction',
          meeting_id: meeting.id,
          task_type: t.task_type,
          task_category: t.task_category,
          priority_score: t.priority_score,
          correlation_id: correlationId,
        },
      }));

      await supabase.from('deal_activities').insert(dealActivities);
      log.info('Logged deal activities for standup tasks', {
        dealActivityCount: dealActivities.length,
      });
    }
  } catch (dealActivityError) {
    log.warn('Failed to log deal activities (non-fatal)', {
      error: dealActivityError instanceof Error ? dealActivityError.message : 'Unknown error',
    });
  }

  // Log buyer activities for tasks linked to buyers
  try {
    const buyerLinkedTasks = taskRecords.filter(
      (t) =>
        (t.entity_type === 'buyer' && t.entity_id) ||
        (t.secondary_entity_type === 'buyer' && t.secondary_entity_id),
    );

    if (buyerLinkedTasks.length > 0) {
      // If buyer_activities table exists, log there too
      // Otherwise, deal_activities already captures deal+buyer combos
      const buyerTaskSummary = buyerLinkedTasks.map((t) => ({
        buyer_id: t.entity_type === 'buyer' ? t.entity_id : t.secondary_entity_id,
        task_title: t.title,
        task_type: t.task_type,
      }));

      log.info('Tasks linked to buyers', {
        buyerTaskCount: buyerTaskSummary.length,
        buyers: [...new Set(buyerTaskSummary.map((b) => b.buyer_id))],
      });
    }
  } catch (buyerLogError) {
    log.warn('Failed to log buyer task linkage (non-fatal)', {
      error: buyerLogError instanceof Error ? buyerLogError.message : 'Unknown error',
    });
  }

  // Count low-confidence tasks for metrics
  const lowConfidenceCount = taskRecords.filter((t) => t.extraction_confidence === 'low').length;

  // Auto-learn team member aliases from speaker names
  let aliasesLearned = 0;
  try {
    aliasesLearned = await autoLearnAliases(
      extractedTasks,
      teamMembers,
      firefliesId,
      supabase,
      log,
    );
  } catch (aliasError) {
    log.warn('Alias auto-learning failed (non-fatal)', {
      error: aliasError instanceof Error ? aliasError.message : 'Unknown error',
    });
  }

  // Record deal mention timeline
  let dealMentionsRecorded = 0;
  try {
    dealMentionsRecorded = await recordDealMentions(
      meeting.id,
      meetingDate,
      extractedTasks,
      teamMembers,
      supabase,
      log,
    );
  } catch (timelineError) {
    log.warn('Deal timeline recording failed (non-fatal)', {
      error: timelineError instanceof Error ? timelineError.message : 'Unknown error',
    });
  }

  // Update meeting with deals_mentioned count
  if (dealMentionsRecorded > 0) {
    await supabase
      .from('standup_meetings')
      .update({ deals_mentioned: dealMentionsRecorded })
      .eq('id', meeting.id);
  }

  // Compute meeting effectiveness score
  let effectivenessScore = 0;
  try {
    effectivenessScore = await computeEffectivenessScore(
      meeting.id,
      meetingDate,
      insertedTasks.length,
      recurringSkipped,
      carriedOverCount,
      supabase,
    );
    log.info('Meeting effectiveness score computed', { score: effectivenessScore });
  } catch (effectError) {
    log.warn('Effectiveness scoring failed (non-fatal)', {
      error: effectError instanceof Error ? effectError.message : 'Unknown error',
    });
  }

  // Smart notification routing: high-urgency tasks get immediate notifications,
  // low-priority/low-confidence tasks are grouped into a digest
  if (insertedTasks.length > 0) {
    try {
      const assignedTasks = taskRecords.filter((t) => t.assignee_id);
      const tasksByAssignee = new Map<string, typeof taskRecords>();
      for (const task of assignedTasks) {
        const existing = tasksByAssignee.get(task.assignee_id!) || [];
        existing.push(task);
        tasksByAssignee.set(task.assignee_id!, existing);
      }

      const notifications = [];
      for (const [assigneeId, tasks] of tasksByAssignee) {
        // Split into urgent (high-confidence deal tasks due today) vs normal
        const urgentTasks = tasks.filter(
          (t) =>
            t.extraction_confidence === 'high' &&
            t.task_category === 'deal_task' &&
            t.due_date === today &&
            (t.priority_score ?? 0) >= 60,
        );
        const normalTasks = tasks.filter((t) => !urgentTasks.includes(t));

        // Urgent tasks get individual notifications
        for (const urgent of urgentTasks) {
          notifications.push({
            admin_id: assigneeId,
            notification_type: 'urgent_task',
            title: `Urgent: ${urgent.title}`,
            message: `High-priority task from "${meetingTitle}" — due today`,
            action_url: '/admin/daily-tasks',
            metadata: {
              meeting_id: meeting.id,
              meeting_title: meetingTitle,
              task_title: urgent.title,
              task_type: urgent.task_type,
              deal_reference: urgent.deal_reference,
              priority_score: urgent.priority_score,
              correlation_id: correlationId,
            },
          });
        }

        // Normal tasks get grouped digest notification
        if (normalTasks.length > 0) {
          const taskTitles = normalTasks.map((t) => t.title).slice(0, 5);
          const moreCount = normalTasks.length > 5 ? normalTasks.length - 5 : 0;
          const taskList = taskTitles.join(', ') + (moreCount > 0 ? ` +${moreCount} more` : '');
          notifications.push({
            admin_id: assigneeId,
            notification_type: 'tasks_extracted',
            title: `${normalTasks.length} New Task${normalTasks.length > 1 ? 's' : ''} from Standup`,
            message: `Tasks from "${meetingTitle}": ${taskList}`,
            action_url: '/admin/daily-tasks',
            metadata: {
              meeting_id: meeting.id,
              meeting_title: meetingTitle,
              task_count: normalTasks.length,
              task_titles: taskTitles,
              correlation_id: correlationId,
            },
          });
        }
      }

      if (notifications.length > 0) {
        await supabase.from('admin_notifications').insert(notifications);
        log.info('Sent smart notifications', {
          notificationCount: notifications.length,
          urgentCount: notifications.filter((n) => n.notification_type === 'urgent_task').length,
          digestCount: notifications.filter((n) => n.notification_type === 'tasks_extracted')
            .length,
        });
      }
    } catch (notifError) {
      log.warn('Failed to send task notifications', {
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

  // Generate daily standup report notification for admins
  try {
    const dealTaskCount = taskRecords.filter((t) => t.task_category === 'deal_task').length;
    const platformTaskCount = taskRecords.filter((t) => t.task_category === 'platform_task').length;
    const opsTaskCount = taskRecords.filter((t) => t.task_category === 'operations_task').length;
    const uniqueDeals = [
      ...new Set(taskRecords.filter((t) => t.deal_reference).map((t) => t.deal_reference)),
    ];
    const uniqueAssignees = [
      ...new Set(taskRecords.filter((t) => t.assignee_id).map((t) => t.assignee_id)),
    ];

    const reportLines = [
      `Standup Report: "${meetingTitle}"`,
      `Tasks: ${insertedTasks.length} new, ${recurringSkipped} recurring (skipped), ${carriedOverCount} carried over`,
      dealTaskCount > 0 ? `Deal tasks: ${dealTaskCount}` : null,
      platformTaskCount > 0 ? `Platform tasks: ${platformTaskCount}` : null,
      opsTaskCount > 0 ? `Operations tasks: ${opsTaskCount}` : null,
      uniqueDeals.length > 0 ? `Deals mentioned: ${uniqueDeals.join(', ')}` : null,
      `Effectiveness score: ${effectivenessScore}/100`,
      lowConfidenceCount > 0 ? `Low confidence: ${lowConfidenceCount} (needs review)` : null,
      aliasesLearned > 0 ? `New aliases learned: ${aliasesLearned}` : null,
    ].filter(Boolean);

    // Send report to all admins/owners
    const { data: adminUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['owner', 'admin']);

    if (adminUsers && adminUsers.length > 0) {
      const reportNotifications = adminUsers.map((u) => ({
        admin_id: u.user_id,
        notification_type: 'standup_report',
        title: `Standup Report: ${insertedTasks.length} tasks from ${meetingTitle}`,
        message: reportLines.join(' | '),
        action_url: '/admin/daily-tasks',
        metadata: {
          meeting_id: meeting.id,
          meeting_title: meetingTitle,
          tasks_extracted: insertedTasks.length,
          tasks_recurring_skipped: recurringSkipped,
          tasks_carried_over: carriedOverCount,
          deal_task_count: dealTaskCount,
          platform_task_count: platformTaskCount,
          ops_task_count: opsTaskCount,
          deals_mentioned: uniqueDeals,
          assignees: uniqueAssignees.length,
          effectiveness_score: effectivenessScore,
          correlation_id: correlationId,
        },
      }));

      await supabase.from('admin_notifications').insert(reportNotifications);
      log.info('Sent standup report', { recipientCount: reportNotifications.length });
    }
  } catch (reportError) {
    log.warn('Failed to generate standup report (non-fatal)', {
      error: reportError instanceof Error ? reportError.message : 'Unknown error',
    });
  }

  log.info('Meeting processing complete', {
    meetingId: meeting.id,
    tasksExtracted: insertedTasks.length,
    tasksDeduplicated: skippedDuplicates.length,
    recurringSkipped,
    carriedOver: carriedOverCount,
    lowConfidenceCount,
    contactsMatched: matchedContacts.length,
    dealMentionsRecorded,
    aliasesLearned,
    effectivenessScore,
    processingDurationMs,
  });

  return {
    meeting_id: meeting.id,
    fireflies_id: firefliesId,
    meeting_title: meetingTitle,
    tasks_extracted: insertedTasks.length,
    tasks_deduplicated: skippedDuplicates.length,
    tasks_recurring_skipped: recurringSkipped,
    tasks_carried_over: carriedOverCount,
    tasks_unassigned: taskRecords.filter((t) => !t.assignee_id).length,
    tasks_needing_review: taskRecords.filter((t) => t.needs_review).length,
    contacts_matched: matchedContacts.length,
    low_confidence_count: lowConfidenceCount,
    processing_duration_ms: processingDurationMs,
    effectiveness_score: effectivenessScore,
    deal_mentions_recorded: dealMentionsRecorded,
    aliases_learned: aliasesLearned,
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
          tasks_recurring_skipped: r.tasks_recurring_skipped,
          tasks_carried_over: r.tasks_carried_over,
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
        total_recurring_skipped: results.reduce(
          (sum, r) => sum + (r.tasks_recurring_skipped || 0),
          0,
        ),
        total_carried_over: results.reduce((sum, r) => sum + (r.tasks_carried_over || 0), 0),
        total_low_confidence: results.reduce((sum, r) => sum + (r.low_confidence_count || 0), 0),
        correlation_id: correlationId,
        results: results.map((r) => ({
          meeting_id: r.meeting_id,
          fireflies_id: r.fireflies_id,
          meeting_title: r.meeting_title,
          tasks_extracted: r.tasks_extracted,
          tasks_deduplicated: r.tasks_deduplicated,
          tasks_recurring_skipped: r.tasks_recurring_skipped,
          tasks_carried_over: r.tasks_carried_over,
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
