/**
 * Smartlead Reclassify Failed
 *
 * Admin-only endpoint that re-classifies inbox records that failed AI
 * classification (defaulted to "neutral" with reasoning containing "failed").
 *
 * For GP campaign records newly classified as positive, re-triggers the
 * GP automation: creates/updates GP Partner Deals, adds to calling list,
 * enriches phone numbers.
 *
 * POST {SUPABASE_URL}/functions/v1/smartlead-reclassify-failed
 * Body: { "dry_run": true } (optional — preview without updating)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { timingSafeEqual } from '../_shared/security.ts';
import { DEFAULT_GEMINI_MODEL, getGeminiApiKey, GEMINI_API_URL } from '../_shared/ai-providers.ts';

/** Strip HTML tags and collapse whitespace */
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

async function classifyReply(replyText: string): Promise<AIClassification> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { category: 'neutral', sentiment: 'neutral', is_positive: false, confidence: 0, reasoning: 'AI key unavailable' };
  }

  const sanitized = sanitizeForAI(replyText);
  if (!sanitized || sanitized.length < 3) {
    return { category: 'neutral', sentiment: 'neutral', is_positive: false, confidence: 0.5, reasoning: 'Reply too short' };
  }

  const systemPrompt = `You are an email reply classifier for a cold email outreach platform. Classify each reply into exactly one category and sentiment.

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

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_GEMINI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
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
      console.error('[reclassify] AI error:', response.status, errText);
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
    console.error('[reclassify] Classification error:', err);
    return { category: 'neutral', sentiment: 'neutral', is_positive: false, confidence: 0, reasoning: `Error: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 500;
const ACTIVATED_CATEGORIES = ['meeting_request', 'interested', 'question', 'referral', 'not_now'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Allow admin auth OR webhook secret OR internal service call
  const internalSecret = req.headers.get('x-internal-secret');
  const isInternalCall = internalSecret && internalSecret === serviceRoleKey;
  const webhookSecret = Deno.env.get('SMARTLEAD_WEBHOOK_SECRET');
  const providedWebhookSecret = req.headers.get('x-webhook-secret');
  const isWebhookAuth = webhookSecret && providedWebhookSecret && timingSafeEqual(providedWebhookSecret, webhookSecret);

  if (!isInternalCall && !isWebhookAuth) {
    const auth = await requireAdmin(req, supabase);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: jsonHeaders,
      });
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;

    // Find all failed classifications
    const { data: failedRecords, error: fetchErr } = await supabase
      .from('smartlead_reply_inbox')
      .select('id, reply_body, reply_message, preview_text, campaign_name, sl_lead_email, from_email, to_email, to_name, lead_first_name, lead_last_name, lead_company_name, lead_website, lead_phone, lead_mobile, lead_linkedin_url, lead_title, lead_industry, lead_location, time_replied, campaign_id, ai_category, ai_reasoning')
      .eq('ai_category', 'neutral')
      .like('ai_reasoning', '%failed%')
      .order('created_at', { ascending: true });

    if (fetchErr) {
      console.error('[reclassify] Fetch error:', fetchErr);
      return new Response(JSON.stringify({ error: 'Failed to fetch records' }), { status: 500, headers: jsonHeaders });
    }

    if (!failedRecords || failedRecords.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No failed records found', total: 0 }), { headers: jsonHeaders });
    }

    console.log(`[reclassify] Found ${failedRecords.length} failed records to reclassify (dry_run: ${dryRun})`);

    const results: { id: string; old_category: string; new_category: string; is_positive: boolean; gp_deal_created: boolean }[] = [];

    for (let i = 0; i < failedRecords.length; i += BATCH_SIZE) {
      const batch = failedRecords.slice(i, i + BATCH_SIZE);

      for (const record of batch) {
        const replyText = record.reply_body || record.reply_message || record.preview_text || '';
        const classification = await classifyReply(replyText);

        const resultEntry = {
          id: record.id,
          old_category: 'neutral',
          new_category: classification.category,
          is_positive: classification.is_positive,
          gp_deal_created: false,
        };

        if (!dryRun) {
          // Update the record with new classification
          await supabase
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

          // GP automation for activated categories on GP campaigns
          const campaignNameLower = (record.campaign_name || '').toLowerCase();
          const isGPCampaign = campaignNameLower.includes('gp');
          const isActivated = ACTIVATED_CATEGORIES.includes(classification.category);

          if (isGPCampaign && isActivated) {
            const contactEmail = record.sl_lead_email || record.from_email || record.to_email;
            const contactName = [record.lead_first_name, record.lead_last_name].filter(Boolean).join(' ') || record.to_name || null;
            const companyName = record.lead_company_name || null;
            const contactPhone = record.lead_phone || record.lead_mobile || null;

            // Check for existing GP deal
            let gpDealId: string | null = null;
            if (contactEmail) {
              const { data: existing } = await supabase
                .from('listings')
                .select('id')
                .eq('main_contact_email', contactEmail)
                .eq('deal_source', 'gp_partners')
                .is('deleted_at', null)
                .limit(1)
                .maybeSingle();

              if (existing) {
                gpDealId = existing.id;
                await supabase.from('listings').update({
                  smartlead_reply_inbox_id: record.id,
                  smartlead_replied_at: record.time_replied || new Date().toISOString(),
                  smartlead_ai_category: classification.category,
                }).eq('id', gpDealId);
              } else {
                const { data: newDeal } = await supabase
                  .from('listings')
                  .insert({
                    title: companyName || contactName || 'GP Response',
                    internal_company_name: companyName,
                    website: record.lead_website || null,
                    main_contact_name: contactName,
                    main_contact_email: contactEmail,
                    main_contact_phone: contactPhone,
                    main_contact_linkedin: record.lead_linkedin_url || null,
                    industry: record.lead_industry || null,
                    location: record.lead_location || null,
                    deal_source: 'gp_partners',
                    status: 'active',
                    is_internal_deal: true,
                    pushed_to_all_deals: false,
                    auto_created_from_smartlead: true,
                    smartlead_reply_inbox_id: record.id,
                    smartlead_replied_at: record.time_replied || new Date().toISOString(),
                    smartlead_ai_category: classification.category,
                    executive_summary: `Auto-created from reclassification. Category: ${classification.category}. Campaign: ${record.campaign_name}`,
                  })
                  .select('id')
                  .single();
                gpDealId = newDeal?.id || null;
              }

              if (gpDealId) {
                resultEntry.gp_deal_created = true;
                await supabase.from('smartlead_reply_inbox').update({ linked_deal_id: gpDealId }).eq('id', record.id);

                // Add to calling list if phone exists
                if (contactPhone) {
                  const { data: gpList } = await supabase
                    .from('contact_lists')
                    .select('id')
                    .eq('name', 'Smartlead GP Responses')
                    .eq('is_archived', false)
                    .limit(1)
                    .maybeSingle();

                  if (gpList?.id) {
                    await supabase.from('contact_list_members').upsert({
                      list_id: gpList.id,
                      contact_email: contactEmail,
                      contact_name: contactName,
                      contact_phone: contactPhone,
                      contact_company: companyName,
                      contact_role: record.lead_title || null,
                      entity_type: 'gp_partner_deal',
                      entity_id: gpDealId,
                      removed_at: null,
                    }, { onConflict: 'list_id,contact_email', ignoreDuplicates: false });
                  }
                }
              }
            }
          }
        }

        results.push(resultEntry);
      }

      // Delay between batches
      if (i + BATCH_SIZE < failedRecords.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    const summary = {
      success: true,
      dry_run: dryRun,
      total: results.length,
      reclassified: results.filter(r => r.new_category !== 'neutral').length,
      still_neutral: results.filter(r => r.new_category === 'neutral').length,
      positive: results.filter(r => r.is_positive).length,
      gp_deals_created: results.filter(r => r.gp_deal_created).length,
      by_category: results.reduce((acc, r) => {
        acc[r.new_category] = (acc[r.new_category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      results,
    };

    console.log(`[reclassify] Complete:`, JSON.stringify({ ...summary, results: `${results.length} items` }));

    return new Response(JSON.stringify(summary), { headers: jsonHeaders });
  } catch (err) {
    console.error('[reclassify] Error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), { status: 500, headers: jsonHeaders });
  }
});
