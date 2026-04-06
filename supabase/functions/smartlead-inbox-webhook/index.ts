/**
 * Smartlead Inbox Webhook
 *
 * Receives reply events from SmartLead (via n8n), classifies them
 * with AI, and stores them in smartlead_reply_inbox.
 *
 * POST {SUPABASE_URL}/functions/v1/smartlead-inbox-webhook
 *
 * No JWT auth — validates via SMARTLEAD_WEBHOOK_SECRET header or query param.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { timingSafeEqual } from '../_shared/security.ts';
import { smartleadRequest } from '../_shared/smartlead-client.ts';

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

/** Sanitize text for AI prompt: truncate and strip */
function sanitizeForAI(text: string, maxLen = 5000): string {
  const stripped = stripHtml(text);
  return stripped.substring(0, maxLen);
}

interface AIClassification {
  category: string;
  sentiment: string;
  is_positive: boolean;
  confidence: number;
  reasoning: string;
}

async function classifyReply(replyText: string): Promise<AIClassification> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.warn('[smartlead-inbox-webhook] GEMINI_API_KEY not set, skipping classification');
    return {
      category: 'neutral',
      sentiment: 'neutral',
      is_positive: false,
      confidence: 0,
      reasoning: 'AI classification unavailable',
    };
  }

  const sanitized = sanitizeForAI(replyText);
  if (!sanitized || sanitized.length < 3) {
    return {
      category: 'neutral',
      sentiment: 'neutral',
      is_positive: false,
      confidence: 0.5,
      reasoning: 'Reply too short to classify',
    };
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

Sentiment: positive, negative, neutral
is_positive should be true ONLY for meeting_request and interested categories.`;

  try {
    const response = await fetch(
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
            { role: 'user', content: `Classify this email reply:\n\n${sanitized}` },
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'classify_reply',
                description: 'Classify an email reply with category, sentiment, and reasoning.',
                parameters: {
                  type: 'object',
                  properties: {
                    category: {
                      type: 'string',
                      enum: [
                        'meeting_request',
                        'interested',
                        'question',
                        'referral',
                        'not_now',
                        'not_interested',
                        'unsubscribe',
                        'out_of_office',
                        'negative_hostile',
                        'neutral',
                      ],
                    },
                    sentiment: {
                      type: 'string',
                      enum: ['positive', 'negative', 'neutral'],
                    },
                    is_positive: { type: 'boolean' },
                    confidence: { type: 'number' },
                    reasoning: { type: 'string' },
                  },
                  required: ['category', 'sentiment', 'is_positive', 'confidence', 'reasoning'],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: 'function', function: { name: 'classify_reply' } },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('[smartlead-inbox-webhook] AI gateway error:', response.status, errText);
      return {
        category: 'neutral',
        sentiment: 'neutral',
        is_positive: false,
        confidence: 0,
        reasoning: `AI classification failed: ${response.status}`,
      };
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed =
        typeof toolCall.function.arguments === 'string'
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

    return {
      category: 'neutral',
      sentiment: 'neutral',
      is_positive: false,
      confidence: 0,
      reasoning: 'AI returned no classification',
    };
  } catch (err) {
    console.error('[smartlead-inbox-webhook] AI classification error:', err);
    return {
      category: 'neutral',
      sentiment: 'neutral',
      is_positive: false,
      confidence: 0,
      reasoning: `Classification error: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  // ─── Verify webhook secret ──────────────────────────────────────────
  const webhookSecret = Deno.env.get('SMARTLEAD_WEBHOOK_SECRET');
  if (webhookSecret) {
    const providedSecret =
      req.headers.get('x-webhook-secret') || new URL(req.url).searchParams.get('secret');

    if (!providedSecret || !timingSafeEqual(providedSecret, webhookSecret)) {
      console.warn('[smartlead-inbox-webhook] Invalid webhook secret');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const rawBody = await req.text();
    console.log(`[smartlead-inbox-webhook] Raw request body: ${rawBody}`);

    const payload = rawBody ? JSON.parse(rawBody) : {};

    // ─── Extract fields from webhook payload ────────────────────────────
    const messageId = payload.message_id || null;
    const fromEmail = payload.from_email || null;
    const eventTimestamp = payload.event_timestamp || null;

    console.log(
      `[smartlead-inbox-webhook] Parsed payload summary: ${JSON.stringify({
        messageId,
        fromEmail,
        eventTimestamp,
        keys: Object.keys(payload || {}),
      })}`,
    );

    // ─── Idempotency check ──────────────────────────────────────────────
    if (messageId) {
      const { data: existing } = await supabase
        .from('smartlead_reply_inbox')
        .select('id')
        .eq('message_id', messageId)
        .limit(1)
        .maybeSingle();

      if (existing) {
        console.log(
          `[smartlead-inbox-webhook] Duplicate detected: ${JSON.stringify({
            messageId,
            existingId: existing.id,
            fromEmail,
            eventTimestamp,
          })}`,
        );
        return new Response(JSON.stringify({ success: true, id: existing.id, duplicate: true }), {
          headers: jsonHeaders,
        });
      }
    } else if (fromEmail && eventTimestamp) {
      const { data: existing } = await supabase
        .from('smartlead_reply_inbox')
        .select('id')
        .eq('from_email', fromEmail)
        .eq('event_timestamp', eventTimestamp)
        .limit(1)
        .maybeSingle();

      if (existing) {
        console.log(`[smartlead-inbox-webhook] Duplicate from_email+event_timestamp`);
        return new Response(JSON.stringify({ success: true, id: existing.id, duplicate: true }), {
          headers: jsonHeaders,
        });
      }
    }

    // ─── AI Classification ──────────────────────────────────────────────
    const replyText = payload.reply_body || payload.reply_message || payload.preview_text || '';
    const classification = await classifyReply(replyText);

    // ─── Generate preview text ──────────────────────────────────────────
    const previewText = payload.preview_text || stripHtml(replyText).substring(0, 300) || null;

    // ─── Insert record ──────────────────────────────────────────────────
    // Handle fields that may come as objects (SmartLead sends nested structures)
    const replyMessageStr =
      typeof payload.reply_message === 'object' && payload.reply_message
        ? payload.reply_message.text ||
          payload.reply_message.html ||
          JSON.stringify(payload.reply_message)
        : payload.reply_message || null;

    const sentMessageStr =
      typeof payload.sent_message === 'object' && payload.sent_message
        ? payload.sent_message.text ||
          payload.sent_message.html ||
          JSON.stringify(payload.sent_message)
        : payload.sent_message || null;

    // Handle camelCase variants from SmartLead/n8n
    const leadCorrespondence = payload.lead_correspondence || payload.leadCorrespondence || null;

    const record = {
      campaign_status: payload.campaign_status || null,
      campaign_name: payload.campaign_name || null,
      campaign_id: payload.campaign_id ? Number(payload.campaign_id) : null,
      stats_id: payload.stats_id || null,
      sl_email_lead_id: payload.sl_email_lead_id ? String(payload.sl_email_lead_id) : null,
      sl_email_lead_map_id: payload.sl_email_lead_map_id
        ? String(payload.sl_email_lead_map_id)
        : null,
      sl_lead_email: payload.sl_lead_email || null,
      from_email: fromEmail,
      to_email: payload.to_email || null,
      to_name: payload.to_name || null,
      cc_emails: Array.isArray(payload.cc_emails) ? payload.cc_emails : [],
      subject: payload.subject || null,
      message_id: messageId,
      sent_message_body: payload.sent_message_body || null,
      sent_message: sentMessageStr,
      time_replied: payload.time_replied || null,
      event_timestamp: eventTimestamp,
      reply_message: replyMessageStr,
      reply_body: payload.reply_body || null,
      preview_text: previewText,
      sequence_number: payload.sequence_number ? Number(payload.sequence_number) : null,
      secret_key: payload.secret_key || null,
      app_url: payload.app_url || null,
      ui_master_inbox_link: payload.ui_master_inbox_link || null,
      description: payload.description || null,
      metadata: payload.metadata || null,
      lead_correspondence: leadCorrespondence,
      webhook_url: payload.webhook_url || null,
      webhook_id: payload.webhook_id ? String(payload.webhook_id) : null,
      webhook_name: payload.webhook_name || null,
      event_type: payload.event_type || payload.event || 'REPLY',
      client_id: payload.client_id ? String(payload.client_id) : null,
      ai_category: classification.category,
      ai_sentiment: classification.sentiment,
      ai_is_positive: classification.is_positive,
      ai_confidence: classification.confidence,
      ai_reasoning: classification.reasoning,
      categorized_at: new Date().toISOString(),
      raw_payload: payload,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('smartlead_reply_inbox')
      .insert(record)
      .select('id')
      .single();

    if (insertError) {
      console.error('[smartlead-inbox-webhook] Insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to store reply' }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    console.log(
      `[smartlead-inbox-webhook] Stored reply ${inserted.id} — ${classification.category} (${classification.sentiment})`,
    );

    // ─── Enrich from Smartlead API (best-effort, non-blocking) ────────
    try {
      const lookupEmail = record.sl_lead_email || record.from_email;
      if (lookupEmail) {
        console.log(`[smartlead-inbox-webhook] Enriching lead via API for ${lookupEmail}`);
        const leadResult = await smartleadRequest<{
          id: string;
          first_name?: string;
          last_name?: string;
          company_name?: string;
          website?: string;
          phone_number?: string;
          linkedin_profile?: string;
          location?: string;
          custom_fields?: Record<string, string>;
          [key: string]: unknown;
        }>({
          path: '/leads/',
          queryParams: { email: lookupEmail },
        });

        if (leadResult.ok && leadResult.data) {
          const ld = leadResult.data;
          const cf = ld.custom_fields || {};

          // Extract industry from campaign name (pattern: "Client - Industry - Tier - Sender")
          let leadIndustry: string | null = null;
          const campaignName = record.campaign_name || '';
          if (campaignName) {
            const parts = campaignName.split(/\s*[-–—]\s*/);
            // Industry is typically the 2nd segment (index 1) in "Client - Industry - ..."
            if (parts.length >= 3) {
              leadIndustry = parts[1].trim() || null;
            } else if (parts.length === 2) {
              // Fallback: might be "Client - Industry"
              leadIndustry = parts[1].trim() || null;
            }
          }

          const enrichUpdate: Record<string, unknown> = {
            lead_first_name: ld.first_name || null,
            lead_last_name: ld.last_name || null,
            lead_company_name: ld.company_name || null,
            lead_website: ld.website || null,
            lead_phone: cf.Phone || ld.phone_number || null,
            lead_mobile: cf.Mobile || null,
            lead_linkedin_url: ld.linkedin_profile || cf.Person_LinkedIn || null,
            lead_title: cf.Title || null,
            lead_location: ld.location && ld.location !== '--' ? ld.location : null,
            lead_industry: leadIndustry,
            lead_custom_fields: Object.keys(cf).length > 0 ? cf : null,
            smartlead_lead_data: ld,
            enriched_at: new Date().toISOString(),
          };

          const { error: enrichErr } = await supabase
            .from('smartlead_reply_inbox')
            .update(enrichUpdate)
            .eq('id', inserted.id);

          if (enrichErr) {
            console.error('[smartlead-inbox-webhook] Enrichment update error:', enrichErr);
          } else {
            console.log(`[smartlead-inbox-webhook] Enriched lead for ${lookupEmail}`);
          }
        } else {
          console.warn(
            `[smartlead-inbox-webhook] Lead lookup failed for ${lookupEmail}:`,
            leadResult.error,
          );
        }
      }
    } catch (enrichError) {
      console.error('[smartlead-inbox-webhook] Enrichment error (non-fatal):', enrichError);
    }

    // ─── GP Campaign Automation ─────────────────────────────────────────
    // For GP campaigns with activated responses: auto-add to GP Partner
    // Deals (remarketing), auto-populate calling list, and enrich phone.
    let gpDealId: string | null = null;
    try {
      const campaignNameLower = (record.campaign_name || '').toLowerCase();
      const ACTIVATED_CATEGORIES = ['meeting_request', 'interested', 'question', 'referral'];
      const isGPCampaign = campaignNameLower.includes('gp');
      const isActivated = ACTIVATED_CATEGORIES.includes(classification.category);

      if (isGPCampaign && isActivated) {
        // Re-read the enriched record to get lead details
        const { data: enrichedRecord } = await supabase
          .from('smartlead_reply_inbox')
          .select(
            'lead_first_name, lead_last_name, lead_company_name, lead_website, lead_phone, lead_mobile, lead_linkedin_url, lead_title, lead_industry, lead_location',
          )
          .eq('id', inserted.id)
          .single();

        const contactEmail = record.sl_lead_email || record.from_email || record.to_email;
        const contactName =
          [enrichedRecord?.lead_first_name, enrichedRecord?.lead_last_name]
            .filter(Boolean)
            .join(' ') ||
          record.to_name ||
          null;
        const companyName = enrichedRecord?.lead_company_name || null;
        const contactPhone = enrichedRecord?.lead_phone || enrichedRecord?.lead_mobile || null;

        // ── Feature 3: Auto-add to GP Partner Deals ──────────────────────
        try {
          // Dedup by email + deal_source
          let existingDealId: string | null = null;
          if (contactEmail) {
            const { data: existing } = await supabase
              .from('listings')
              .select('id')
              .eq('main_contact_email', contactEmail)
              .eq('deal_source', 'gp_partners')
              .is('deleted_at', null)
              .limit(1)
              .maybeSingle();
            existingDealId = existing?.id || null;
          }

          if (existingDealId) {
            await supabase
              .from('listings')
              .update({
                smartlead_reply_inbox_id: inserted.id,
                smartlead_replied_at: record.time_replied || new Date().toISOString(),
                smartlead_ai_category: classification.category,
              })
              .eq('id', existingDealId);
            gpDealId = existingDealId;
            console.log(
              `[smartlead-inbox-webhook] Updated existing GP deal ${existingDealId} with reply`,
            );
          } else {
            const { data: newDeal } = await supabase
              .from('listings')
              .insert({
                title: companyName || contactName || 'GP Response',
                internal_company_name: companyName,
                website: enrichedRecord?.lead_website || null,
                main_contact_name: contactName,
                main_contact_email: contactEmail || null,
                main_contact_phone: contactPhone,
                main_contact_linkedin: enrichedRecord?.lead_linkedin_url || null,
                industry: enrichedRecord?.lead_industry || null,
                location: enrichedRecord?.lead_location || null,
                deal_source: 'gp_partners',
                status: 'active',
                is_internal_deal: true,
                pushed_to_all_deals: false,
                auto_created_from_smartlead: true,
                smartlead_reply_inbox_id: inserted.id,
                smartlead_replied_at: record.time_replied || new Date().toISOString(),
                smartlead_ai_category: classification.category,
                executive_summary: `Auto-created from Smartlead GP response. Category: ${classification.category}. Campaign: ${record.campaign_name}`,
              })
              .select('id')
              .single();

            if (newDeal?.id) {
              gpDealId = newDeal.id;
              console.log(`[smartlead-inbox-webhook] Created new GP deal ${gpDealId} from reply`);
            }
          }

          // Link inbox item to deal
          if (gpDealId) {
            await supabase
              .from('smartlead_reply_inbox')
              .update({ linked_deal_id: gpDealId })
              .eq('id', inserted.id);
          }
        } catch (gpDealError) {
          console.error(
            '[smartlead-inbox-webhook] GP auto-add to deals error (non-fatal):',
            gpDealError,
          );
        }

        // ── Feature 1: Auto-populate calling list (only if phone exists) ─
        // ── Feature 2: Enrich phone first if missing ─────────────────────
        try {
          let phoneForList = contactPhone;

          // If no phone and email is not generic, try to enrich
          if (!phoneForList && contactEmail) {
            const { isGenericEmailDomain } = await import('../_shared/generic-email-domains.ts');
            const domain = contactEmail.split('@')[1] || '';

            if (!isGenericEmailDomain(domain)) {
              try {
                const { googleSearch } = await import('../_shared/serper-client.ts');
                const { findPhone } = await import('../_shared/blitz-client.ts');

                const firstName = enrichedRecord?.lead_first_name || '';
                const lastName = enrichedRecord?.lead_last_name || '';
                const company = enrichedRecord?.lead_company_name || '';
                const searchQuery = `"${firstName} ${lastName}" "${company}" site:linkedin.com/in`;

                console.log(
                  `[smartlead-inbox-webhook] Phone enrichment: searching LinkedIn for ${firstName} ${lastName}`,
                );
                const results = await googleSearch(searchQuery, 3);
                const linkedInUrl = results?.find((r: { link?: string; url?: string }) =>
                  (r.link || r.url || '').includes('linkedin.com/in/'),
                );
                const linkedInProfileUrl = linkedInUrl?.link || linkedInUrl?.url || null;

                if (linkedInProfileUrl) {
                  console.log(
                    `[smartlead-inbox-webhook] Found LinkedIn: ${linkedInProfileUrl}, looking up phone`,
                  );
                  const phoneResult = await findPhone(linkedInProfileUrl);
                  if (phoneResult.ok && phoneResult.data?.phone) {
                    phoneForList = phoneResult.data.phone;

                    // Update inbox record with enriched phone
                    await supabase
                      .from('smartlead_reply_inbox')
                      .update({
                        lead_phone: phoneForList,
                        phone_enriched_at: new Date().toISOString(),
                        phone_enrichment_source: 'blitz',
                        phone_enrichment_linkedin_url: linkedInProfileUrl,
                      })
                      .eq('id', inserted.id);

                    // Update listing phone if null
                    if (gpDealId) {
                      await supabase
                        .from('listings')
                        .update({ main_contact_phone: phoneForList })
                        .eq('id', gpDealId)
                        .is('main_contact_phone', null);
                    }

                    console.log(
                      `[smartlead-inbox-webhook] Phone enriched for ${contactEmail}: ${phoneForList}`,
                    );
                  }
                } else {
                  console.log(
                    `[smartlead-inbox-webhook] No LinkedIn profile found for ${firstName} ${lastName}`,
                  );
                }
              } catch (enrichErr) {
                console.error(
                  '[smartlead-inbox-webhook] Phone enrichment error (non-fatal):',
                  enrichErr,
                );
              }
            } else {
              console.log(
                `[smartlead-inbox-webhook] Skipping phone enrichment for generic email: ${contactEmail}`,
              );
            }
          }

          // Add to calling list only if we have a phone number
          if (phoneForList && contactEmail) {
            const { data: gpList } = await supabase
              .from('contact_lists')
              .select('id')
              .eq('name', 'Smartlead GP Responses')
              .eq('is_archived', false)
              .limit(1)
              .maybeSingle();

            if (gpList?.id) {
              await supabase.from('contact_list_members').upsert(
                {
                  list_id: gpList.id,
                  contact_email: contactEmail,
                  contact_name: contactName,
                  contact_phone: phoneForList,
                  contact_company: companyName,
                  contact_role: enrichedRecord?.lead_title || null,
                  entity_type: 'gp_partner_deal',
                  entity_id: gpDealId || inserted.id,
                  removed_at: null,
                },
                { onConflict: 'list_id,contact_email', ignoreDuplicates: false },
              );
              console.log(
                `[smartlead-inbox-webhook] Added ${contactEmail} to GP calling list (phone: ${phoneForList})`,
              );
            } else {
              console.warn('[smartlead-inbox-webhook] "Smartlead GP Responses" list not found');
            }
          }
        } catch (callingListError) {
          console.error(
            '[smartlead-inbox-webhook] GP calling list error (non-fatal):',
            callingListError,
          );
        }
      }
    } catch (gpAutoError) {
      console.error('[smartlead-inbox-webhook] GP automation error (non-fatal):', gpAutoError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        id: inserted.id,
        classification: {
          category: classification.category,
          sentiment: classification.sentiment,
          is_positive: classification.is_positive,
          confidence: classification.confidence,
        },
      }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    console.error('[smartlead-inbox-webhook] Error:', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Internal error',
      }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
