/* eslint-disable no-console */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { fetchWithAutoRetry } from '../_shared/ai-providers.ts';

// ─── Types ───

interface ExtractRequest {
  fireflies_transcript_id?: string;
  // Manual trigger: pass transcript text directly
  transcript_text?: string;
  meeting_title?: string;
  meeting_date?: string;
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
  buyer_ic_followup: 78,
  follow_up_with_buyer: 75,
  seller_relationship: 72,
  send_materials: 70,
  buyer_qualification: 60,
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

  return `You are a task extraction engine for a business development team's daily standup meeting.

Your job is to parse the meeting transcript and extract concrete, actionable tasks that specific team members are expected to perform.

## Team Members
${memberList}

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

  // Parse the JSON array from the response
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const tasks = JSON.parse(jsonMatch[0]) as ExtractedTask[];
    // Validate task types
    return tasks.map((t) => ({
      ...t,
      task_type: TASK_TYPES.includes(t.task_type) ? t.task_type : 'other',
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

    // 1. Get transcript text
    let transcriptText = body.transcript_text || '';
    let meetingTitle = body.meeting_title || 'Daily Standup';
    let meetingDate = body.meeting_date || today;
    let transcriptUrl = '';
    const firefliesId = body.fireflies_transcript_id || '';
    let meetingDuration = 0;

    if (firefliesId && !transcriptText) {
      console.log(`Fetching transcript ${firefliesId} from Fireflies...`);
      const transcript = await fetchTranscript(firefliesId);
      if (!transcript) {
        return new Response(JSON.stringify({ error: 'Transcript not found in Fireflies' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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

      // Build transcript text from sentences
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
      return new Response(JSON.stringify({ error: 'No transcript text available' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Get team members with aliases
    const { data: teamRoles } = await supabase
      .from('user_roles')
      .select('user_id, profiles!inner(id, first_name, last_name)')
      .in('role', ['owner', 'admin', 'moderator']);

    const { data: aliases } = await supabase
      .from('team_member_aliases')
      .select('profile_id, alias');

    const aliasMap = new Map<string, string[]>();
    for (const a of aliases || []) {
      const existing = aliasMap.get(a.profile_id) || [];
      existing.push(a.alias);
      aliasMap.set(a.profile_id, existing);
    }

    const teamMembers = (teamRoles || []).map((r: { user_id: string; profiles: { id: string; first_name: string; last_name: string } }) => ({
      id: r.user_id,
      name: `${r.profiles.first_name || ''} ${r.profiles.last_name || ''}`.trim(),
      first_name: r.profiles.first_name || '',
      last_name: r.profiles.last_name || '',
      aliases: aliasMap.get(r.user_id) || [],
    }));

    console.log(`Found ${teamMembers.length} team members`);

    // 3. Extract tasks with AI
    console.log('Running AI extraction...');
    const extractedTasks = await extractTasksWithAI(
      transcriptText,
      teamMembers.map((m) => ({ name: m.name, aliases: m.aliases })),
      today,
    );
    console.log(`Extracted ${extractedTasks.length} tasks`);

    // 4. Match assignees to team member profiles
    function matchAssignee(name: string): string | null {
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

    // 5. Try to match deal references to actual deals
    async function matchDeal(
      dealRef: string,
    ): Promise<{ id: string; listing_id: string; ebitda: number | null; stage_name: string | null } | null> {
      if (!dealRef) return null;
      // Sanitize dealRef to prevent PostgREST filter injection
      // Remove characters that could break the .or() filter syntax
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
        const deal = deals[0] as { id: string; listing_id: string; stage_id: string; deal_stages: { name: string } | null; listings: { ebitda: number | null; title: string; internal_company_name: string } };
        return {
          id: deal.id,
          listing_id: deal.listing_id,
          ebitda: deal.listings?.ebitda ?? null,
          stage_name: deal.deal_stages?.name ?? null,
        };
      }
      return null;
    }

    // 6. Get all EBITDA values for scoring normalization
    const { data: allDeals } = await supabase
      .from('deal_pipeline')
      .select('listing_id, listings!inner(ebitda)');

    const allEbitdaValues = (allDeals || [])
      .map((d: { listing_id: string; listings: { ebitda: number | null } }) => d.listings?.ebitda)
      .filter((e: unknown): e is number => typeof e === 'number' && e > 0);

    // 7. Create standup meeting record
    const { data: meeting, error: meetingError } = await supabase
      .from('standup_meetings')
      .insert({
        fireflies_transcript_id: firefliesId || `manual-${Date.now()}`,
        meeting_title: meetingTitle,
        meeting_date: meetingDate,
        meeting_duration_minutes: meetingDuration || null,
        transcript_url: transcriptUrl || null,
        tasks_extracted: extractedTasks.length,
        tasks_unassigned: extractedTasks.filter((t) => !matchAssignee(t.assignee_name)).length,
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

    // 7b. Check auto-approve setting
    let autoApproveEnabled = true; // default: on
    const { data: autoApproveSetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'task_auto_approve_high_confidence')
      .single();

    if (autoApproveSetting?.value !== undefined) {
      autoApproveEnabled = autoApproveSetting.value === 'true' || autoApproveSetting.value === true;
    }

    // 8. Create task records with priority scoring
    const taskRecords = [];
    for (const task of extractedTasks) {
      const assigneeId = matchAssignee(task.assignee_name);
      const dealMatch = await matchDeal(task.deal_reference);

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

      // Auto-approve high-confidence tasks with a known assignee
      const shouldAutoApprove =
        autoApproveEnabled && task.confidence === 'high' && assigneeId !== null && !needsReview;

      taskRecords.push({
        title: task.title,
        description: task.description || null,
        assignee_id: assigneeId,
        task_type: task.task_type,
        status: shouldAutoApprove ? 'pending' : 'pending_approval',
        due_date: task.due_date || today,
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
        entity_type: dealMatch ? 'listing' : null,
        entity_id: dealMatch?.listing_id || null,
      });
    }

    // Insert all tasks
    const { data: insertedTasks, error: insertError } = await supabase
      .from('daily_standup_tasks')
      .insert(taskRecords)
      .select();

    if (insertError) throw insertError;

    // 9. Compute ranks (priority_score DESC, created_at ASC for ties)
    if (insertedTasks && insertedTasks.length > 0) {
      // Get all pending/overdue tasks to rank them together
      const { data: allTasks } = await supabase
        .from('daily_standup_tasks')
        .select('id, priority_score, is_pinned, pinned_rank, created_at')
        .in('status', ['pending', 'overdue'])
        .order('priority_score', { ascending: false })
        .order('created_at', { ascending: true });

      if (allTasks) {
        const totalTasks = allTasks.length;

        // Separate pinned (with valid ranks in range) and unpinned
        const validPinned = allTasks.filter(
          (t) => t.is_pinned && t.pinned_rank && t.pinned_rank <= totalTasks,
        );
        // Deduplicate: if two tasks share a pinned_rank, only the first keeps the slot
        const pinnedSlots = new Map<number, string>();
        const pinnedTaskIds = new Set<string>();
        for (const p of validPinned) {
          if (!pinnedSlots.has(p.pinned_rank!)) {
            pinnedSlots.set(p.pinned_rank!, p.id);
            pinnedTaskIds.add(p.id);
          }
        }

        // Everyone not occupying a pinned slot goes into the unpinned pool (in score order)
        const unpinned = allTasks.filter((t) => !pinnedTaskIds.has(t.id));

        // Build final ranking
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

        // Update ranks in batch
        for (const { id, rank } of ranked) {
          await supabase.from('daily_standup_tasks').update({ priority_rank: rank }).eq('id', id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        meeting_id: meeting.id,
        tasks_extracted: taskRecords.length,
        tasks_unassigned: taskRecords.filter((t) => !t.assignee_id).length,
        tasks_needing_review: taskRecords.filter((t) => t.needs_review).length,
        tasks: insertedTasks,
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
