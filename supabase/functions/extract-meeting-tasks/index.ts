import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import {
  fetchWithAutoRetry,
  DEFAULT_GEMINI_MODEL,
  getGeminiApiKey,
} from '../_shared/ai-providers.ts';

// ── Types ──

interface ExtractRequest {
  transcript_id: string;
  deal_id?: string;
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
  'update_pipeline',
  'call',
  'email',
  'other',
];

// ── Extraction prompt ──

function buildExtractionPrompt(today: string): string {
  return `You are a task extraction assistant for an M&A advisory firm. Extract actionable tasks from meeting transcripts.

For each task, identify:
- title: Clear, actionable task title
- description: Brief context from the transcript
- assignee_name: Who should do this (use speaker name if mentioned)
- task_type: One of: ${TASK_TYPES.join(', ')}
- due_date: In YYYY-MM-DD format (default to ${today} if not specified)
- source_timestamp: Approximate timestamp in the transcript if available
- deal_reference: Company or deal name referenced
- confidence: high, medium, or low

Focus on concrete action items: calls to make, emails to send, documents to prepare, follow-ups needed.
Skip vague statements, opinions, or completed items.

Return a JSON array of task objects. If there are NO actionable tasks, return an empty array: []`;
}

// ── AI extraction ──

async function extractTasksWithAI(transcriptText: string, today: string): Promise<ExtractedTask[]> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY / OPENROUTER_API_KEY not configured');

  const systemPrompt = buildExtractionPrompt(today);

  const response = await fetchWithAutoRetry(
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_GEMINI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here is the meeting transcript:\n\n${transcriptText}` },
        ],
        temperature: 0,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(60000),
    },
    { maxRetries: 2, baseDelayMs: 2000, callerName: 'Gemini/extract-meeting-tasks' },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText.substring(0, 300)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  const jsonMatch = content.match(/\[[\s\S]*?\](?=[^[\]]*$)/);
  if (!jsonMatch) return [];

  try {
    const tasks = JSON.parse(jsonMatch[0]) as ExtractedTask[];
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

// ── Main handler ──

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { transcript_id, deal_id }: ExtractRequest = await req.json();

    if (!transcript_id) {
      return new Response(JSON.stringify({ error: 'transcript_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Extracting tasks from transcript ${transcript_id}, deal_id=${deal_id || 'none'}`);

    // Fetch transcript from deal_transcripts
    const { data: transcript, error: fetchError } = await supabase
      .from('deal_transcripts')
      .select('id, listing_id, title, transcript_text, fireflies_transcript_id, created_at')
      .eq('id', transcript_id)
      .maybeSingle();

    // Also try lookup by fireflies_transcript_id if not found by primary key
    let resolvedTranscript = transcript;
    if (!resolvedTranscript && !fetchError) {
      const { data: ffTranscript } = await supabase
        .from('deal_transcripts')
        .select('id, listing_id, title, transcript_text, fireflies_transcript_id, created_at')
        .eq('fireflies_transcript_id', transcript_id)
        .maybeSingle();
      resolvedTranscript = ffTranscript;
    }

    if (fetchError || !resolvedTranscript) {
      return new Response(
        JSON.stringify({ error: fetchError?.message || 'Transcript not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Resolve deal_id from listing_id if not provided
    let effectiveDealId = deal_id;
    if (!effectiveDealId && resolvedTranscript.listing_id) {
      const { data: dealData } = await supabase
        .from('deal_pipeline')
        .select('id')
        .eq('listing_id', resolvedTranscript.listing_id)
        .limit(1)
        .maybeSingle();
      effectiveDealId = dealData?.id;
    }
    let transcriptText = resolvedTranscript.transcript_text;

    // If no transcript text stored locally, try fetching from Fireflies
    if (!transcriptText && resolvedTranscript.fireflies_transcript_id) {
      console.log('No local transcript text, fetching from Fireflies...');
      try {
        const ffResponse = await supabase.functions.invoke('fetch-fireflies-content', {
          body: { fireflies_transcript_id: resolvedTranscript.fireflies_transcript_id },
        });
        if (ffResponse.data?.transcript_text) {
          transcriptText = ffResponse.data.transcript_text;
        }
      } catch (ffError) {
        console.error('Failed to fetch from Fireflies:', ffError);
      }
    }

    if (!transcriptText) {
      return new Response(
        JSON.stringify({ error: 'No transcript text available for extraction' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Dedup: check if this transcript has already been processed.
    // We track previous extractions by looking for tasks with a matching
    // generation_source + metadata tag pointing at this transcript.
    const transcriptTag = `meeting_transcript:${resolvedTranscript.id}`;
    const { data: existingExtraction } = await supabase
      .from('daily_standup_tasks')
      .select('id')
      .eq('generation_source', 'meeting_transcript')
      .eq('deal_reference', transcriptTag)
      .limit(1);

    if (existingExtraction && existingExtraction.length > 0) {
      console.log(`Transcript ${transcript_id} already has extracted tasks, skipping`);
      return new Response(
        JSON.stringify({
          message: 'Transcript already processed',
          tasks_created: 0,
          skipped: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Extract tasks using AI
    const today = new Date().toISOString().split('T')[0];
    const extractedTasks = await extractTasksWithAI(transcriptText, today);

    if (!extractedTasks.length) {
      return new Response(
        JSON.stringify({ message: 'No tasks extracted from transcript', tasks_created: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Resolve assignee names to profile IDs
    const { data: teamProfiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('is_admin', true);

    const profileMap = new Map<string, string>();
    for (const p of teamProfiles || []) {
      const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim().toLowerCase();
      if (fullName) profileMap.set(fullName, p.id);
      if (p.first_name) profileMap.set(p.first_name.toLowerCase(), p.id);
    }

    function resolveAssignee(name: string): string | null {
      if (!name) return null;
      const lower = name.toLowerCase().trim();
      if (profileMap.has(lower)) return profileMap.get(lower)!;
      // Try partial match
      for (const [key, id] of profileMap) {
        if (key.includes(lower) || lower.includes(key)) return id;
      }
      return null;
    }

    // Save tasks to daily_standup_tasks
    let tasksCreated = 0;
    const createdTaskIds: string[] = [];

    for (const task of extractedTasks) {
      const assigneeId = resolveAssignee(task.assignee_name);

      const { data: inserted, error: insertError } = await supabase
        .from('daily_standup_tasks')
        .insert({
          title: task.title,
          description: task.description,
          task_type: task.task_type,
          // AI-extracted tasks require human review before going active
          status: 'pending_approval',
          priority: task.confidence === 'high' ? 'high' : 'medium',
          due_date: task.due_date,
          deal_id: effectiveDealId,
          entity_type: effectiveDealId ? 'deal' : null,
          entity_id: effectiveDealId,
          assignee_id: assigneeId,
          auto_generated: true,
          generation_source: 'meeting_transcript',
          source: 'ai',
          // Tag with transcript id for dedup on future runs
          deal_reference: transcriptTag,
          extraction_confidence: task.confidence,
          needs_review: !assigneeId || task.confidence === 'low',
        })
        .select('id')
        .single();

      if (insertError) {
        console.error(`Failed to insert task "${task.title}":`, insertError);
        continue;
      }

      tasksCreated++;
      if (inserted) createdTaskIds.push(inserted.id);
    }

    // Log to deal_activities if we have a deal
    if (effectiveDealId && tasksCreated > 0) {
      await supabase.rpc('log_deal_activity', {
        p_deal_id: effectiveDealId,
        p_activity_type: 'task_created',
        p_title: `${tasksCreated} task(s) extracted from transcript`,
        p_description: `Tasks extracted from "${resolvedTranscript.title || 'meeting transcript'}" via AI`,
        p_admin_id: null,
        p_metadata: {
          transcript_id,
          tasks_created: tasksCreated,
          task_ids: createdTaskIds,
        },
      });
    }

    console.log(`Extracted ${tasksCreated} tasks from transcript ${transcript_id}`);

    return new Response(
      JSON.stringify({
        message: 'Task extraction complete',
        tasks_extracted: extractedTasks.length,
        tasks_created: tasksCreated,
        task_ids: createdTaskIds,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('extract-meeting-tasks error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
