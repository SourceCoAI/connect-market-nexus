/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase client used with untyped tables */
/**
 * Fireflies Auto-Summary Tools (Feature 3)
 *
 * summarize_transcript_to_notes — Processes a Fireflies transcript (or any deal
 *   transcript) and generates a structured note containing: executive summary,
 *   key signals, action items, notable quotes, and participant analysis.
 *   The note is automatically saved as a deal_comment (deal note).
 *
 * get_unprocessed_transcripts — Finds deal_transcripts that have content but
 *   haven't been auto-summarized yet, so users can batch-process them.
 */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';

// ---------- Tool definitions ----------

export const firefliesSummaryTools: ClaudeTool[] = [
  {
    name: 'summarize_transcript_to_notes',
    description: `Summarize a meeting transcript and save the structured summary as a deal note.
Extracts: executive summary, key buyer/seller signals, action items, notable quotes, and participant analysis.
The summary is saved as a deal comment so it appears in the Notes tab for the deal.
USE WHEN: "summarize this transcript", "create notes from meeting", "process the Fireflies recording", "save transcript summary to notes".
REQUIRES CONFIRMATION (creates a deal note).`,
    input_schema: {
      type: 'object',
      properties: {
        transcript_id: {
          type: 'string',
          description: 'The deal_transcripts UUID to summarize',
        },
        deal_id: {
          type: 'string',
          description:
            "The listing/deal UUID to save the note to. If omitted, uses the transcript's listing_id.",
        },
        include_quotes: {
          type: 'boolean',
          description: 'Include notable quotes in the summary (default true)',
        },
        auto_create_tasks: {
          type: 'boolean',
          description: 'Automatically create tasks from extracted action items (default false)',
        },
      },
      required: ['transcript_id'],
    },
  },
  {
    name: 'get_unprocessed_transcripts',
    description: `Find deal transcripts that have content but haven't been summarized to notes yet.
Returns transcripts that have has_content=true but no AI-generated summary note.
USE WHEN: "any new transcripts to process?", "unprocessed Fireflies recordings", "which meetings haven't been summarized?"`,
    input_schema: {
      type: 'object',
      properties: {
        deal_id: {
          type: 'string',
          description: 'Filter by deal/listing UUID',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 10)',
        },
      },
      required: [],
    },
  },
];

// ---------- Executor ----------

export async function executeFirefliesSummaryTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  switch (toolName) {
    case 'summarize_transcript_to_notes':
      return summarizeTranscriptToNotes(supabase, args, userId);
    case 'get_unprocessed_transcripts':
      return getUnprocessedTranscripts(supabase, args);
    default:
      return { error: `Unknown fireflies summary tool: ${toolName}` };
  }
}

// ---------- Implementations ----------

async function summarizeTranscriptToNotes(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const transcriptId = args.transcript_id as string;
  const includeQuotes = args.include_quotes !== false;
  const autoCreateTasks = args.auto_create_tasks === true;

  // 1. Fetch the transcript
  const { data: transcript, error: txError } = await (supabase as any)
    .from('deal_transcripts')
    .select(
      `id, title, listing_id, transcript_text, duration_minutes,
       meeting_attendees, external_participants, participants,
       extracted_data, source, fireflies_transcript_id, created_at`,
    )
    .eq('id', transcriptId)
    .single();

  if (txError) {
    return { error: `Transcript not found: ${txError.message}` };
  }

  const dealId = (args.deal_id as string) || transcript.listing_id;
  if (!dealId) {
    return {
      error:
        'No deal_id provided and transcript is not linked to a deal. Please specify a deal_id.',
    };
  }

  const transcriptText = transcript.transcript_text as string;
  if (!transcriptText || transcriptText.trim().length < 50) {
    return {
      error:
        'Transcript has insufficient content to summarize. The recording may be empty or too short.',
    };
  }

  // 2. Extract structured data from transcript text
  const summary = extractSummary(transcriptText, transcript);

  // 3. Build the formatted note
  const noteParts: string[] = [];

  noteParts.push(`## AI Meeting Summary — ${transcript.title || 'Untitled Meeting'}`);
  noteParts.push(
    `*Auto-generated from ${transcript.source || 'recording'} on ${new Date().toISOString().split('T')[0]}*`,
  );
  if (transcript.duration_minutes) {
    noteParts.push(`*Duration: ${transcript.duration_minutes} minutes*`);
  }
  noteParts.push('');

  // Participants
  if (summary.participants.length > 0) {
    noteParts.push('**Participants:** ' + summary.participants.join(', '));
    noteParts.push('');
  }

  // Executive summary
  noteParts.push('**Summary**');
  noteParts.push(summary.executive_summary);
  noteParts.push('');

  // Key signals
  if (summary.signals.length > 0) {
    noteParts.push('**Key Signals**');
    for (const signal of summary.signals) {
      noteParts.push(`- [${signal.type.toUpperCase()}] ${signal.text}`);
    }
    noteParts.push('');
  }

  // Action items
  if (summary.action_items.length > 0) {
    noteParts.push('**Action Items**');
    for (const item of summary.action_items) {
      const owner = item.owner ? ` (${item.owner})` : '';
      noteParts.push(`- [ ] ${item.text}${owner}`);
    }
    noteParts.push('');
  }

  // Notable quotes
  if (includeQuotes && summary.quotes.length > 0) {
    noteParts.push('**Notable Quotes**');
    for (const quote of summary.quotes) {
      noteParts.push(`> "${quote.text}" — ${quote.speaker || 'Unknown'}`);
    }
    noteParts.push('');
  }

  const noteContent = noteParts.join('\n');

  // 4. Save as a deal comment/note
  const { data: savedNote, error: noteError } = await (supabase as any)
    .from('deal_comments')
    .insert({
      deal_id: dealId,
      admin_id: userId,
      comment_text: noteContent,
    })
    .select('id')
    .single();

  if (noteError) {
    return {
      error: `Summary generated but failed to save as note: ${noteError.message}`,
      data: { summary: noteContent },
    };
  }

  // 5. Mark transcript as processed
  await (supabase as any)
    .from('deal_transcripts')
    .update({
      extracted_data: {
        ...(transcript.extracted_data || {}),
        ai_summary_note_id: savedNote.id,
        ai_summarized_at: new Date().toISOString(),
      },
    })
    .eq('id', transcriptId);

  // 6. Optionally create tasks from action items
  let tasksCreated = 0;
  if (autoCreateTasks && summary.action_items.length > 0) {
    for (const item of summary.action_items.slice(0, 5)) {
      const { error: taskError } = await (supabase as any).from('daily_standup_tasks').insert({
        title: item.text,
        entity_type: 'listing',
        entity_id: dealId,
        deal_reference: transcript.title || 'Meeting follow-up',
        source: 'ai',
        status: 'pending_approval',
        task_type: 'follow_up_with_buyer',
        priority: 'medium',
        assignee_id: userId,
        due_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        is_manual: false,
        priority_score: 50,
        extraction_confidence: 'medium',
        needs_review: true,
        created_by: userId,
      });
      if (!taskError) tasksCreated++;
    }
  }

  return {
    data: {
      note_id: savedNote.id,
      deal_id: dealId,
      transcript_id: transcriptId,
      summary: noteContent,
      signal_count: summary.signals.length,
      action_item_count: summary.action_items.length,
      quote_count: summary.quotes.length,
      tasks_created: tasksCreated,
      message: `Meeting summary saved to deal notes. ${summary.action_items.length} action items identified${tasksCreated > 0 ? `, ${tasksCreated} tasks created (pending approval)` : ''}.`,
    },
  };
}

async function getUnprocessedTranscripts(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 10, 25);

  let query = (supabase as any)
    .from('deal_transcripts')
    .select(
      `id, title, listing_id, source, duration_minutes,
       meeting_attendees, has_content, created_at,
       fireflies_transcript_id, extracted_data`,
    )
    .eq('has_content', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (args.deal_id) {
    query = query.eq('listing_id', args.deal_id as string);
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  // Filter to transcripts where extracted_data doesn't contain ai_summarized_at
  const unprocessed = (data || []).filter((t: Record<string, unknown>) => {
    const extracted = t.extracted_data as Record<string, unknown> | null;
    return !extracted?.ai_summarized_at;
  });

  return {
    data: {
      transcripts: unprocessed,
      total: unprocessed.length,
      message:
        unprocessed.length > 0
          ? `${unprocessed.length} transcript(s) ready to be summarized. Use summarize_transcript_to_notes to process them.`
          : 'All transcripts have been summarized.',
    },
  };
}

// ---------- Text extraction helpers ----------

interface TranscriptSummary {
  executive_summary: string;
  participants: string[];
  signals: Array<{ type: 'positive' | 'negative' | 'neutral'; text: string }>;
  action_items: Array<{ text: string; owner: string | null }>;
  quotes: Array<{ text: string; speaker: string | null }>;
}

function extractSummary(text: string, transcript: Record<string, unknown>): TranscriptSummary {
  // Extract participants from metadata
  const participants: string[] = [];
  const attendees = transcript.meeting_attendees as string[] | null;
  if (attendees) {
    participants.push(...attendees.slice(0, 10));
  }
  const externalParticipants = transcript.external_participants as Array<
    Record<string, string>
  > | null;
  if (externalParticipants) {
    for (const p of externalParticipants) {
      const name = p.name || p.email;
      if (name && !participants.includes(name)) {
        participants.push(name);
      }
    }
  }

  // Use extracted_data if available (from Fireflies processing)
  const existingExtracted = transcript.extracted_data as Record<string, unknown> | null;

  // Build executive summary from first portion of transcript
  const truncatedText = text.slice(0, 3000);
  const sentences = truncatedText.split(/[.!?]+/).filter((s: string) => s.trim().length > 20);
  const summaryLines = sentences.slice(0, 5).map((s: string) => s.trim());
  const executive_summary = summaryLines.join('. ') + '.';

  // Extract signals using keyword heuristics
  const signals: TranscriptSummary['signals'] = [];
  const positiveKeywords = [
    'interested',
    'excited',
    'growth',
    'opportunity',
    'strong',
    'positive',
    'approved',
    'proceed',
  ];
  const negativeKeywords = [
    'concern',
    'risk',
    'challenge',
    'decline',
    'delay',
    'issue',
    'problem',
    'worried',
  ];

  const lowerText = text.toLowerCase();
  for (const kw of positiveKeywords) {
    if (lowerText.includes(kw)) {
      const idx = lowerText.indexOf(kw);
      const start = Math.max(0, idx - 50);
      const end = Math.min(text.length, idx + kw.length + 100);
      const snippet = text.slice(start, end).replace(/\n/g, ' ').trim();
      signals.push({ type: 'positive', text: `${snippet}...` });
      if (signals.filter((s) => s.type === 'positive').length >= 3) break;
    }
  }
  for (const kw of negativeKeywords) {
    if (lowerText.includes(kw)) {
      const idx = lowerText.indexOf(kw);
      const start = Math.max(0, idx - 50);
      const end = Math.min(text.length, idx + kw.length + 100);
      const snippet = text.slice(start, end).replace(/\n/g, ' ').trim();
      signals.push({ type: 'negative', text: `${snippet}...` });
      if (signals.filter((s) => s.type === 'negative').length >= 2) break;
    }
  }

  // Extract action items using keyword patterns
  const action_items: TranscriptSummary['action_items'] = [];
  const actionPatterns = [
    /(?:need to|should|will|going to|action item|follow[- ]?up|next step)[:\s]+([^.!?]{10,120})/gi,
    /(?:I'll|we'll|let's|please)[:\s]+([^.!?]{10,100})/gi,
  ];
  for (const pattern of actionPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null && action_items.length < 5) {
      const actionText = match[1].trim();
      if (actionText.length >= 10 && !action_items.some((a) => a.text === actionText)) {
        action_items.push({ text: actionText, owner: null });
      }
    }
  }

  // If we have existing extracted action items, prefer those
  if (existingExtracted?.action_items && Array.isArray(existingExtracted.action_items)) {
    const existingItems = existingExtracted.action_items as Array<Record<string, string>>;
    for (const item of existingItems.slice(0, 5)) {
      const itemText = item.text || item.description || String(item);
      if (typeof itemText === 'string' && itemText.length > 5) {
        action_items.unshift({ text: itemText, owner: item.owner || null });
      }
    }
    // Deduplicate and limit
    const seen = new Set<string>();
    action_items.splice(
      0,
      action_items.length,
      ...action_items
        .filter((a) => {
          if (seen.has(a.text)) return false;
          seen.add(a.text);
          return true;
        })
        .slice(0, 5),
    );
  }

  // Extract notable quotes (lines that look like speech)
  const quotes: TranscriptSummary['quotes'] = [];
  const quotePattern = /(?:^|\n)([A-Z][a-z]+ ?[A-Z]?[a-z]*)\s*:\s*([^:\n]{30,200})/g;
  let quoteMatch;
  while ((quoteMatch = quotePattern.exec(text)) !== null && quotes.length < 3) {
    const speaker = quoteMatch[1].trim();
    const quoteText = quoteMatch[2].trim();
    if (quoteText.length >= 30) {
      quotes.push({ text: quoteText, speaker });
    }
  }

  return {
    executive_summary,
    participants,
    signals: signals.slice(0, 5),
    action_items,
    quotes,
  };
}
