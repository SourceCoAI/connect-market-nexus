/**
 * auto-summarize-transcript
 *
 * Reads a transcript from deal_transcripts, sends it to Gemini via OpenRouter
 * with an M&A-tuned prompt, and saves the structured summary as a deal_comment.
 * Marks the transcript as summarized via extracted_data.ai_summarized_at.
 *
 * Triggered from:
 *   - PhoneBurner webhook (when talk_time > 30s and transcript exists)
 *   - Fireflies sync (when has_content = true)
 *   - Fireflies webhook (Phase 7)
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

const SYSTEM_PROMPT = `You are a senior M&A advisor reviewing a call transcript about a potential acquisition target. Extract:

1. ONE-LINE SUMMARY: Single sentence — the most important outcome.
2. BUYER INTEREST SIGNALS: Specific interest, questions about financials/operations, timeline urgency, IC references.
3. CONCERNS OR OBJECTIONS: Business worries, valuation pushback, process concerns, competitive deals.
4. INFORMATION REQUESTED: Documents asked for, follow-up questions, data points to verify.
5. AGREED NEXT STEPS: Commitments, deadlines, follow-up meetings.
6. ACTION ITEMS: Specific tasks for our team, with suggested owners.

Be concrete — quote numbers, names, specifics. Flag anything suggesting buyer may pass.
Format each section with a header (e.g., "## ONE-LINE SUMMARY") followed by the content.`;

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
    const { transcript_id } = body;

    if (!transcript_id) {
      return errorResponse('transcript_id is required', 400, corsHeaders);
    }

    // Fetch the transcript
    const { data: transcript, error: fetchErr } = await (supabase as any)
      .from('deal_transcripts')
      .select('id, listing_id, title, transcript_text, transcript_type, source, duration_minutes, call_date, has_content, extracted_data, contact_name, user_name')
      .eq('id', transcript_id)
      .single();

    if (fetchErr || !transcript) {
      return errorResponse(`Transcript not found: ${fetchErr?.message || 'missing'}`, 404, corsHeaders);
    }

    // Skip if already summarized
    const existingData = transcript.extracted_data || {};
    if (existingData.ai_summarized_at) {
      return successResponse({ skipped: true, reason: 'already_summarized' }, corsHeaders);
    }

    // Get transcript text
    const transcriptText = transcript.transcript_text;
    if (!transcriptText || transcriptText.trim().length < 50) {
      return successResponse({ skipped: true, reason: 'insufficient_content' }, corsHeaders);
    }

    // Resolve deal context from listing_id
    // In the remarketing system, deal_comments and deal_activities use listing_id as deal_id
    const listingId = transcript.listing_id;
    let buyerContext = '';
    if (listingId) {
      const { data: deal } = await supabase
        .from('deal_pipeline')
        .select('id, remarketing_buyer_id')
        .eq('listing_id', listingId)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();

      // Fetch buyer context for multi-deal awareness
      if (deal?.remarketing_buyer_id) {
        const { data: otherDeals } = await (supabase as any)
          .from('deal_pipeline')
          .select('title, listing_id')
          .eq('remarketing_buyer_id', deal.remarketing_buyer_id)
          .is('deleted_at', null)
          .neq('listing_id', listingId)
          .limit(5);

        if (otherDeals?.length) {
          const otherDealNames = otherDeals.map((d: any) => d.title).join(', ');
          buyerContext = `\nNOTE: This buyer is also being marketed on these other deals: ${otherDealNames}. Flag any mentions of interest in other deals or cross-deal references.\n`;
        }
      }
    }

    // Call Gemini via OpenRouter
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return errorResponse('AI API key not configured', 500, corsHeaders);
    }

    const userMessage = [
      buyerContext || '',
      `Transcript Title: ${transcript.title || 'Untitled'}`,
      transcript.contact_name ? `Contact: ${transcript.contact_name}` : '',
      transcript.user_name ? `Our Team Member: ${transcript.user_name}` : '',
      transcript.duration_minutes ? `Duration: ${transcript.duration_minutes} minutes` : '',
      '',
      '--- TRANSCRIPT ---',
      transcriptText.substring(0, 30000), // Cap at 30K chars to stay within limits
    ].filter(Boolean).join('\n');

    const aiResponse = await fetchWithAutoRetry(
      GEMINI_API_URL,
      {
        method: 'POST',
        headers: getGeminiHeaders(apiKey),
        body: JSON.stringify({
          model: GEMINI_25_FLASH_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 2000,
          temperature: 0.3,
        }),
      },
      { callerName: 'auto-summarize-transcript', maxRetries: 2 },
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('[auto-summarize-transcript] AI call failed:', aiResponse.status, errText);
      return errorResponse(`AI summarization failed: ${aiResponse.status}`, 500, corsHeaders);
    }

    const aiData = await aiResponse.json();
    const summaryText = aiData.choices?.[0]?.message?.content || '';

    if (!summaryText || summaryText.length < 20) {
      return errorResponse('AI returned insufficient summary', 500, corsHeaders);
    }

    // Save as deal_comment using listing_id as deal_id (matches UI query pattern)
    let noteId: string | null = null;
    if (listingId) {
      const noteContent = [
        `## AI Meeting Summary — ${transcript.title || 'Call'}`,
        transcript.call_date ? `*Date: ${transcript.call_date}*` : '',
        transcript.duration_minutes ? `*Duration: ${transcript.duration_minutes} min*` : '',
        '',
        summaryText,
      ].filter(Boolean).join('\n');

      const { data: savedNote } = await (supabase as any)
        .from('deal_comments')
        .insert({
          deal_id: listingId,
          admin_id: null,
          comment_text: noteContent,
        })
        .select('id')
        .single();

      noteId = savedNote?.id || null;

      // Log the summary generation as a deal_activity
      try {
        await supabase.rpc('log_deal_activity', {
          p_deal_id: listingId,
          p_activity_type: 'meeting_summary_generated',
          p_title: `AI summary generated: ${transcript.title || 'Call'}`,
          p_description: summaryText.substring(0, 200),
          p_admin_id: null,
          p_metadata: {
            transcript_id,
            note_id: noteId,
            model: GEMINI_25_FLASH_MODEL,
            summary_length: summaryText.length,
          },
        });
      } catch (e) {
        console.error('[auto-summarize-transcript] Failed to log deal activity:', e);
      }
    }

    // Mark transcript as summarized
    const updatedData = {
      ...existingData,
      ai_summarized_at: new Date().toISOString(),
      ai_summary_note_id: noteId,
      ai_summary_model: GEMINI_25_FLASH_MODEL,
    };

    await (supabase as any)
      .from('deal_transcripts')
      .update({ extracted_data: updatedData })
      .eq('id', transcript_id);

    console.log(`[auto-summarize-transcript] Summarized transcript ${transcript_id}, note=${noteId}`);

    return successResponse({
      summarized: true,
      transcript_id,
      deal_id: listingId,
      note_id: noteId,
      summary_length: summaryText.length,
    }, corsHeaders);
  } catch (err) {
    console.error('[auto-summarize-transcript] Error:', err);
    return errorResponse(`Summarization error: ${(err as Error).message}`, 500, corsHeaders);
  }
});
