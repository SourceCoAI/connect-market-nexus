/**
 * score-call-transcript
 *
 * Scores a PhoneBurner call transcript using the 16-category M&A cold call
 * scoring prompt. Called after a transcript is saved in phoneburner-webhook.
 *
 * Input: { contact_activity_id, transcript_text, rep_name?, rep_email?, listing_id?, deal_transcript_id?, call_duration_seconds? }
 * Output: { success: true, score_id } or { error }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  GEMINI_25_FLASH_MODEL,
  callGeminiWithTool,
} from '../_shared/ai-providers.ts';

const PROMPT_VERSION = 'v1';

// ────────────────────────────────────────────────────────────────────────────
// 16-CATEGORY SCORING PROMPT
// ────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the QA grader for a team of M&A cold callers.
Their job is to cold-call small-business owners, gauge whether the owner might consider selling their company, and—if interest exists—set an appointment for a senior advisor.

You will receive one call transcript at a time. Score it on exactly the 16 categories below. Every 1-10 rating must be accompanied by a one-sentence justification.

──────────────────────────────────
CATEGORY DEFINITIONS
──────────────────────────────────

1. Call Classification
   Label: "Voicemail drop" | "Gatekeeper" | "Connection"
   If NOT a Connection, score only categories 1, 5 (as N/A), 14, 15, 16 — leave all 1-10 ratings null.

2. Opener Quality (1-10)
   Did the rep clearly introduce themselves, their firm, and the reason for the call within the first 15 seconds? Penalize reading a script verbatim with no warmth.

3. Discovery Quality (1-10)
   How effectively did the rep probe for pain points, growth plans, succession timeline, or fatigue? Credit open-ended questions. Deduct for leading or yes/no questions only.
   Also note: what Owner Context was surfaced? (e.g. "Owner mentioned retirement in 2 years, revenue ~$5M")

4. Interest Level (1-10) — score the OWNER, not the rep
   1 = hostile / hard hang-up, 5 = polite but noncommittal, 10 = eager, asked for next steps.
   Justify with the owner's own words. Flag whether interest is explicit ("Yes, I'd love to talk") or implicit ("Well, I haven't really thought about it… tell me more").

5. Objection Log
   List every distinct objection verbatim (e.g. "I'm not interested", "We're not for sale", "How'd you get my number?"). If none, write "None raised".

6. Objection Handling Effectiveness (1-10)
   Rate how well each objection was addressed. Did the rep acknowledge → reframe → bridge back to value? Deduct for ignoring, arguing, or over-talking.

7. Objection Resolution Rate (0-100%)
   Of the objections logged, what percentage were neutralized or moved past? Round to nearest 10%.

8. Talk-to-Listen Ratio (1-10)
   Ideal for a discovery-heavy call is ≈ 30-40% rep / 60-70% owner. Score 10 if near ideal, 1 if rep dominated > 80%.
   Also provide your estimated rep talk percentage.

9. Closing / Next Step Execution (1-10)
   Did the rep secure a concrete next step (meeting booked, follow-up date, info to send)? 10 = calendar invite sent on call. 1 = call ended with no ask.
   Note the agreed next step if any.

10. Decision-Maker Confirmation (1-10)
    Did the rep confirm they were speaking to the owner / decision-maker? If gatekeeper, did they navigate toward the DM? 10 = confirmed DM early. 1 = never asked.

11. Script Adherence (1-10)
    How well did the rep follow the expected call flow: Permission → Purpose → Discovery → Value Prop → Close?
    Note which stages were completed.

12. Value Proposition Clarity (1-10)
    Did the rep articulate what the firm does and why the owner should care? 10 = crisp, benefit-led. 1 = jargon-heavy or missing.

13. Rapport & Tone (1-10)
    Was the rep conversational, empathetic, and professional? Deduct for sounding robotic, rushed, or pushy.

14. Not-Interested Follow-Up Depth
    If the owner said "not interested" (or equivalent), how many follow-up probes did the rep make before accepting? Describe briefly. If owner never said not interested, write "N/A".

15. Call Summary (CRM-ready, 2-3 sentences)
    Write a concise summary an advisor could read before a follow-up: who was called, outcome, key intel gathered, next step.

16. Top Coaching Point (1 sentence)
    The single most impactful piece of feedback for this rep to improve on the next call.`;

// ────────────────────────────────────────────────────────────────────────────
// TOOL SCHEMA for structured output
// ────────────────────────────────────────────────────────────────────────────
const SCORING_TOOL = {
  type: 'function',
  function: {
    name: 'submit_call_score',
    description: 'Submit the structured 16-category call quality score',
    parameters: {
      type: 'object',
      required: ['call_classification', 'call_summary', 'top_coaching_point'],
      properties: {
        // 1
        call_classification: {
          type: 'string',
          enum: ['Voicemail drop', 'Gatekeeper', 'Connection'],
        },
        // 2
        opener_quality_rating: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
        opener_quality_justification: { type: ['string', 'null'] },
        // 3
        discovery_quality_rating: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
        discovery_quality_justification: { type: ['string', 'null'] },
        owner_context_surfaced: { type: ['string', 'null'] },
        // 4
        interest_level_rating: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
        interest_level_justification: { type: ['string', 'null'] },
        interest_type: { type: ['string', 'null'], enum: ['explicit', 'implicit', null] },
        // 5
        objection_log: { type: ['string', 'null'] },
        // 6
        objection_handling_rating: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
        objection_handling_justification: { type: ['string', 'null'] },
        // 7
        objection_resolution_rate: { type: ['integer', 'null'], minimum: 0, maximum: 100 },
        // 8
        talk_listen_ratio_rating: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
        talk_listen_ratio_justification: { type: ['string', 'null'] },
        estimated_rep_talk_pct: { type: ['integer', 'null'], minimum: 0, maximum: 100 },
        // 9
        closing_rating: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
        closing_justification: { type: ['string', 'null'] },
        next_step_agreed: { type: ['string', 'null'] },
        // 10
        decision_maker_rating: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
        decision_maker_justification: { type: ['string', 'null'] },
        // 11
        script_adherence_rating: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
        script_adherence_justification: { type: ['string', 'null'] },
        stages_completed: {
          type: ['array', 'null'],
          items: { type: 'string' },
        },
        // 12
        value_proposition_rating: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
        value_proposition_justification: { type: ['string', 'null'] },
        // 13
        rapport_rating: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
        rapport_justification: { type: ['string', 'null'] },
        // 14
        not_interested_follow_up: { type: ['string', 'null'] },
        // 15
        call_summary: { type: 'string' },
        // 16
        top_coaching_point: { type: 'string' },
      },
    },
  },
};

/**
 * Compute overall quality: average of all non-null 1-10 ratings.
 */
function computeOverallQuality(data: Record<string, unknown>): number | null {
  const ratingKeys = [
    'opener_quality_rating',
    'discovery_quality_rating',
    'interest_level_rating',
    'objection_handling_rating',
    'talk_listen_ratio_rating',
    'closing_rating',
    'decision_maker_rating',
    'script_adherence_rating',
    'value_proposition_rating',
    'rapport_rating',
  ];
  const values = ratingKeys
    .map((k) => data[k])
    .filter((v): v is number => typeof v === 'number' && v >= 1 && v <= 10);

  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  try {
    const {
      contact_activity_id,
      transcript_text,
      rep_name,
      rep_email,
      listing_id,
      deal_transcript_id,
      call_duration_seconds,
    } = await req.json();

    if (!transcript_text) {
      return new Response(JSON.stringify({ error: 'transcript_text is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Skip very short transcripts (likely just voicemail with no useful content)
    if (transcript_text.length < 50) {
      console.log('[score-call-transcript] Transcript too short to score, skipping.');
      return new Response(JSON.stringify({ skipped: true, reason: 'transcript_too_short' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check idempotency: don't re-score the same activity
    if (contact_activity_id) {
      const { data: existing } = await supabase
        .from('call_quality_scores')
        .select('id')
        .eq('contact_activity_id', contact_activity_id)
        .maybeSingle();

      if (existing) {
        console.log(
          `[score-call-transcript] Already scored activity ${contact_activity_id}, skipping.`,
        );
        return new Response(
          JSON.stringify({ skipped: true, reason: 'already_scored', score_id: existing.id }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    // Call Gemini
    const userPrompt = `Score this M&A cold call transcript:\n\n${transcript_text}`;

    console.log(
      `[score-call-transcript] Scoring transcript (${transcript_text.length} chars) for activity ${contact_activity_id}...`,
    );

    const result = await callGeminiWithTool(
      SYSTEM_PROMPT,
      userPrompt,
      SCORING_TOOL,
      geminiApiKey,
      GEMINI_25_FLASH_MODEL,
      90000, // 90s timeout for thorough scoring
      8192,
    );

    if (result.error || !result.data) {
      console.error('[score-call-transcript] AI scoring failed:', result.error);

      // Still insert a row so we track the failure
      if (contact_activity_id) {
        await supabase.from('call_quality_scores').insert({
          contact_activity_id,
          listing_id: listing_id || null,
          deal_transcript_id: deal_transcript_id || null,
          rep_name: rep_name || null,
          rep_email: rep_email || null,
          call_duration_seconds: call_duration_seconds || null,
          scoring_model: GEMINI_25_FLASH_MODEL,
          scoring_prompt_version: PROMPT_VERSION,
          scoring_error: result.error?.message || 'Unknown AI error',
        });
      }

      return new Response(
        JSON.stringify({ error: 'AI scoring failed', detail: result.error?.message }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const scores = result.data as Record<string, unknown>;
    const overallQuality = computeOverallQuality(scores);

    // Insert scores
    const { data: inserted, error: insertError } = await supabase
      .from('call_quality_scores')
      .insert({
        contact_activity_id: contact_activity_id || null,
        deal_transcript_id: deal_transcript_id || null,
        listing_id: listing_id || null,
        rep_name: rep_name || null,
        rep_email: rep_email || null,
        call_duration_seconds: call_duration_seconds || null,

        call_classification: scores.call_classification,
        opener_quality_rating: scores.opener_quality_rating ?? null,
        opener_quality_justification: scores.opener_quality_justification ?? null,
        discovery_quality_rating: scores.discovery_quality_rating ?? null,
        discovery_quality_justification: scores.discovery_quality_justification ?? null,
        owner_context_surfaced: scores.owner_context_surfaced ?? null,
        interest_level_rating: scores.interest_level_rating ?? null,
        interest_level_justification: scores.interest_level_justification ?? null,
        interest_type: scores.interest_type ?? null,
        objection_log: scores.objection_log ?? null,
        objection_handling_rating: scores.objection_handling_rating ?? null,
        objection_handling_justification: scores.objection_handling_justification ?? null,
        objection_resolution_rate: scores.objection_resolution_rate ?? null,
        talk_listen_ratio_rating: scores.talk_listen_ratio_rating ?? null,
        talk_listen_ratio_justification: scores.talk_listen_ratio_justification ?? null,
        estimated_rep_talk_pct: scores.estimated_rep_talk_pct ?? null,
        closing_rating: scores.closing_rating ?? null,
        closing_justification: scores.closing_justification ?? null,
        next_step_agreed: scores.next_step_agreed ?? null,
        decision_maker_rating: scores.decision_maker_rating ?? null,
        decision_maker_justification: scores.decision_maker_justification ?? null,
        script_adherence_rating: scores.script_adherence_rating ?? null,
        script_adherence_justification: scores.script_adherence_justification ?? null,
        stages_completed: scores.stages_completed ?? null,
        value_proposition_rating: scores.value_proposition_rating ?? null,
        value_proposition_justification: scores.value_proposition_justification ?? null,
        rapport_rating: scores.rapport_rating ?? null,
        rapport_justification: scores.rapport_justification ?? null,
        not_interested_follow_up: scores.not_interested_follow_up ?? null,
        call_summary: scores.call_summary ?? null,
        top_coaching_point: scores.top_coaching_point ?? null,

        overall_quality: overallQuality,
        scoring_model: GEMINI_25_FLASH_MODEL,
        scoring_prompt_version: PROMPT_VERSION,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[score-call-transcript] DB insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to save scores', detail: insertError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(
      `[score-call-transcript] Scored call: ${scores.call_classification}, overall=${overallQuality}, id=${inserted.id}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        score_id: inserted.id,
        call_classification: scores.call_classification,
        overall_quality: overallQuality,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[score-call-transcript] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error', detail: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
