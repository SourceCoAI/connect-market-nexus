/**
 * auto-summarize-email-thread
 *
 * Triggered when a deal accumulates 3+ emails in a single conversation thread.
 * Collects the thread, sends to Gemini via OpenRouter, saves as deal_comment.
 *
 * Triggered from: outlook-sync-emails — after processing a batch, checks for
 * deals with 3+ emails in a thread that haven't been summarized yet.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response-helpers.ts';
import {
  GEMINI_API_URL,
  GEMINI_25_FLASH_MODEL,
  getGeminiApiKey,
  getGeminiHeaders,
  fetchWithAutoRetry,
} from '../_shared/ai-providers.ts';

const SYSTEM_PROMPT = `You are an M&A advisor reviewing an email thread about a deal. Summarize:

1. THREAD STATUS: One line — where does this conversation stand?
2. ORIGINAL OUTREACH: What was the initial message about?
3. KEY EXCHANGES: What questions were raised? What was answered?
4. CURRENT POSITION: What's the contact's latest stance?
5. NEXT STEPS: What needs to happen next? Who owes what?
6. TONE: Is the contact engaged, hesitant, or unresponsive?

Be specific — quote relevant details, names, dates. Keep it concise but actionable.
Format each section with a header (e.g., "## THREAD STATUS") followed by the content.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, corsHeaders);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json();
    const { conversation_id, deal_id: inputDealId } = body;

    if (!conversation_id || !inputDealId) {
      return errorResponse('conversation_id and deal_id are required', 400, corsHeaders);
    }

    // Resolve listing_id from deal_pipeline if needed (the UI uses listing_id as deal_id)
    let deal_id = inputDealId;
    const { data: pipelineRow } = await supabase
      .from('deal_pipeline')
      .select('listing_id')
      .eq('id', inputDealId)
      .limit(1)
      .maybeSingle();
    if (pipelineRow?.listing_id) {
      deal_id = pipelineRow.listing_id;
    }

    // Fetch all emails in this thread
    const { data: emails, error: fetchErr } = await (supabase as any)
      .from('email_messages')
      .select('id, direction, from_address, to_addresses, subject, body_text, sent_at')
      .eq('microsoft_conversation_id', conversation_id)
      .order('sent_at', { ascending: true })
      .limit(50);

    if (fetchErr || !emails || emails.length < 3) {
      return successResponse({
        skipped: true,
        reason: !emails || emails.length < 3 ? 'fewer_than_3_emails' : fetchErr?.message,
      }, corsHeaders);
    }

    // Check if already summarized (store in deal_activities metadata)
    const summaryKey = `email_thread_${conversation_id}`;
    const { data: existing } = await (supabase as any)
      .from('deal_activities')
      .select('id')
      .eq('deal_id', deal_id)
      .eq('activity_type', 'email_thread_summary')
      .contains('metadata', { conversation_id })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return successResponse({ skipped: true, reason: 'already_summarized' }, corsHeaders);
    }

    // Build thread text
    const threadText = emails.map((e: any) => {
      const dir = e.direction === 'outbound' ? 'SENT' : 'RECEIVED';
      const date = e.sent_at ? new Date(e.sent_at).toLocaleString() : 'Unknown date';
      const from = e.from_address || 'Unknown';
      const to = (e.to_addresses || []).join(', ');
      const body = (e.body_text || '').substring(0, 3000);
      return `[${dir}] ${date}\nFrom: ${from}\nTo: ${to}\nSubject: ${e.subject || '(No subject)'}\n\n${body}`;
    }).join('\n\n---\n\n');

    // Call Gemini
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return errorResponse('AI API key not configured', 500, corsHeaders);
    }

    const aiResponse = await fetchWithAutoRetry(
      GEMINI_API_URL,
      {
        method: 'POST',
        headers: getGeminiHeaders(apiKey),
        body: JSON.stringify({
          model: GEMINI_25_FLASH_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Email Thread (${emails.length} messages):\n\n${threadText.substring(0, 30000)}` },
          ],
          max_tokens: 1500,
          temperature: 0.3,
        }),
      },
      { callerName: 'auto-summarize-email-thread', maxRetries: 2 },
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('[auto-summarize-email-thread] AI call failed:', aiResponse.status, errText);
      return errorResponse(`AI summarization failed: ${aiResponse.status}`, 500, corsHeaders);
    }

    const aiData = await aiResponse.json();
    const summaryText = aiData.choices?.[0]?.message?.content || '';

    if (!summaryText || summaryText.length < 20) {
      return errorResponse('AI returned insufficient summary', 500, corsHeaders);
    }

    // Save as deal_comment
    const noteContent = [
      `## AI Email Thread Summary — ${emails[0]?.subject || 'Thread'}`,
      `*${emails.length} emails, ${emails[0]?.sent_at ? new Date(emails[0].sent_at).toLocaleDateString() : ''} – ${emails[emails.length - 1]?.sent_at ? new Date(emails[emails.length - 1].sent_at).toLocaleDateString() : ''}*`,
      '',
      summaryText,
    ].join('\n');

    const { data: savedNote } = await (supabase as any)
      .from('deal_comments')
      .insert({
        deal_id,
        admin_id: null,
        comment_text: noteContent,
      })
      .select('id')
      .single();

    // Log as deal_activity so we don't re-summarize
    await supabase.rpc('log_deal_activity', {
      p_deal_id: deal_id,
      p_activity_type: 'email_thread_summary',
      p_title: `AI summarized email thread: ${emails[0]?.subject || 'Thread'}`,
      p_description: `${emails.length} emails summarized`,
      p_admin_id: null,
      p_metadata: {
        conversation_id,
        email_count: emails.length,
        note_id: savedNote?.id || null,
        model: GEMINI_25_FLASH_MODEL,
      },
    });

    console.log(`[auto-summarize-email-thread] Summarized thread ${conversation_id}, note=${savedNote?.id}`);

    return successResponse({
      summarized: true,
      conversation_id,
      deal_id,
      note_id: savedNote?.id || null,
      email_count: emails.length,
      summary_length: summaryText.length,
    }, corsHeaders);
  } catch (err) {
    console.error('[auto-summarize-email-thread] Error:', err);
    return errorResponse(`Summarization error: ${(err as Error).message}`, 500, corsHeaders);
  }
});
