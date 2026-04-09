/**
 * Smartlead Reclassify All
 *
 * Admin-only endpoint that re-classifies ALL inbox records with the updated
 * sentiment model (positive/activated/negative/neutral).
 *
 * Does NOT trigger GP automation — only updates classification fields.
 *
 * POST {SUPABASE_URL}/functions/v1/smartlead-reclassify-all
 * Body: { "dry_run": true } (optional — preview without updating)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { DEFAULT_GEMINI_MODEL, getGeminiApiKey, GEMINI_API_URL } from '../_shared/ai-providers.ts';

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeForAI(text: string, maxLen = 5000): string {
  return stripHtml(text).substring(0, maxLen);
}

interface AIClassification {
  category: string;
  sentiment: string;
  is_positive: boolean;
  confidence: number;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are an email reply classifier for a cold email outreach platform. Classify each reply into exactly one category and sentiment.

Categories:
- meeting_request: wants to schedule a call/meeting
- interested: expresses interest but no meeting request
- question: asking clarifying questions
- referral: directing to someone else
- not_now: timing issue, not rejecting
- not_interested: polite decline
- unsubscribe: explicit opt-out request
- out_of_office: automated OOO reply
- negative_hostile: angry/hostile response
- neutral: cannot determine intent

Sentiment values:
- positive: explicitly wants a meeting or call (maps to meeting_request category)
- activated: shows engagement, interest, asks questions, provides referral, or says "not right now" — anything other than a firm rejection (maps to interested, question, referral, not_now categories)
- negative: firm decline, hostile, or unsubscribe (maps to not_interested, unsubscribe, negative_hostile categories)
- neutral: out of office, cannot determine intent (maps to out_of_office, neutral categories)

is_positive should be true for positive and activated sentiments (meeting_request, interested, question, referral, and not_now categories).
When in doubt between "neutral" and "interested", prefer "interested" if the reply shows any engagement, curiosity, or willingness to learn more.`;

async function classifyReply(replyText: string): Promise<AIClassification> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { category: 'neutral', sentiment: 'neutral', is_positive: false, confidence: 0, reasoning: 'AI key unavailable' };
  }

  const sanitized = sanitizeForAI(replyText);
  if (!sanitized || sanitized.length < 3) {
    return { category: 'neutral', sentiment: 'neutral', is_positive: false, confidence: 0.5, reasoning: 'Reply too short' };
  }

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_GEMINI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Classify this email reply:\n\n${sanitized}` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'classify_reply',
            description: 'Classify an email reply with category, sentiment, and reasoning.',
            parameters: {
              type: 'object',
              properties: {
                category: { type: 'string', enum: ['meeting_request', 'interested', 'question', 'referral', 'not_now', 'not_interested', 'unsubscribe', 'out_of_office', 'negative_hostile', 'neutral'] },
                sentiment: { type: 'string', enum: ['positive', 'activated', 'negative', 'neutral'] },
                is_positive: { type: 'boolean' },
                confidence: { type: 'number' },
                reasoning: { type: 'string' },
              },
              required: ['category', 'sentiment', 'is_positive', 'confidence', 'reasoning'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'classify_reply' } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[reclassify-all] AI error:', response.status, errText);
      return { category: 'neutral', sentiment: 'neutral', is_positive: false, confidence: 0, reasoning: `AI failed: ${response.status}` };
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = typeof toolCall.function.arguments === 'string'
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
      return {
        category: parsed.category || 'neutral',
        sentiment: parsed.sentiment || 'neutral',
        is_positive: parsed.is_positive === true,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        reasoning: parsed.reasoning || '',
      };
    }

    return { category: 'neutral', sentiment: 'neutral', is_positive: false, confidence: 0, reasoning: 'AI returned no classification' };
  } catch (err) {
    console.error('[reclassify-all] Classification error:', err);
    return { category: 'neutral', sentiment: 'neutral', is_positive: false, confidence: 0, reasoning: `Error: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 500;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Admin-only
  const auth = await requireAdmin(req, supabase);
  if (!auth.isAdmin) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.authenticated ? 403 : 401,
      headers: jsonHeaders,
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;

    // Fetch ALL inbox records
    const allRecords: any[] = [];
    const fetchBatchSize = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('smartlead_reply_inbox')
        .select('id, reply_body, reply_message, preview_text, ai_category, ai_sentiment')
        .order('created_at', { ascending: true })
        .range(offset, offset + fetchBatchSize - 1);

      if (error) {
        console.error('[reclassify-all] Fetch error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch records' }), { status: 500, headers: jsonHeaders });
      }

      if (data && data.length > 0) {
        allRecords.push(...data);
        offset += fetchBatchSize;
        hasMore = data.length === fetchBatchSize;
      } else {
        hasMore = false;
      }
    }

    if (allRecords.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No records found', total: 0 }), { headers: jsonHeaders });
    }

    console.log(`[reclassify-all] Found ${allRecords.length} records to reclassify (dry_run: ${dryRun})`);

    const results: { id: string; old_category: string; old_sentiment: string; new_category: string; new_sentiment: string; is_positive: boolean }[] = [];
    let errors = 0;

    for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
      const batch = allRecords.slice(i, i + BATCH_SIZE);

      for (const record of batch) {
        const replyText = record.reply_body || record.reply_message || record.preview_text || '';
        const classification = await classifyReply(replyText);

        results.push({
          id: record.id,
          old_category: record.ai_category || 'neutral',
          old_sentiment: record.ai_sentiment || 'neutral',
          new_category: classification.category,
          new_sentiment: classification.sentiment,
          is_positive: classification.is_positive,
        });

        if (!dryRun) {
          const { error: updateErr } = await supabase
            .from('smartlead_reply_inbox')
            .update({
              ai_category: classification.category,
              ai_sentiment: classification.sentiment,
              ai_is_positive: classification.is_positive,
              ai_confidence: classification.confidence,
              ai_reasoning: classification.reasoning,
              categorized_at: new Date().toISOString(),
            })
            .eq('id', record.id);

          if (updateErr) {
            console.error(`[reclassify-all] Update error for ${record.id}:`, updateErr);
            errors++;
          }
        }
      }

      // Delay between batches
      if (i + BATCH_SIZE < allRecords.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }

      // Log progress every 50 records
      if ((i + BATCH_SIZE) % 50 === 0 || i + BATCH_SIZE >= allRecords.length) {
        console.log(`[reclassify-all] Progress: ${Math.min(i + BATCH_SIZE, allRecords.length)}/${allRecords.length}`);
      }
    }

    const summary = {
      success: true,
      dry_run: dryRun,
      total: results.length,
      errors,
      changed: results.filter(r => r.old_sentiment !== r.new_sentiment || r.old_category !== r.new_category).length,
      by_sentiment: results.reduce((acc, r) => {
        acc[r.new_sentiment] = (acc[r.new_sentiment] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      by_category: results.reduce((acc, r) => {
        acc[r.new_category] = (acc[r.new_category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    console.log(`[reclassify-all] Complete:`, JSON.stringify(summary));

    return new Response(JSON.stringify(summary), { headers: jsonHeaders });
  } catch (err) {
    console.error('[reclassify-all] Error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), { status: 500, headers: jsonHeaders });
  }
});
