/**
 * draft-reply-email: AI-drafts a contextual reply to a Smartlead inbox response
 *
 * Admin-only. Uses the original sent message, the lead's reply, and AI
 * classification to generate an appropriate follow-up email.
 *
 * POST body:
 *   - inbox_item_id: UUID (smartlead_reply_inbox.id)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import {
  GEMINI_API_URL,
  DEFAULT_GEMINI_MODEL,
  getGeminiHeaders,
  fetchWithAutoRetry,
} from '../_shared/ai-providers.ts';

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY')!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const auth = await requireAdmin(req, supabaseAdmin);
  if (!auth.isAdmin) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.authenticated ? 403 : 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { inbox_item_id } = await req.json();

    if (!inbox_item_id) {
      return new Response(JSON.stringify({ error: 'inbox_item_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the inbox item
    const { data: item, error: itemError } = await supabaseAdmin
      .from('smartlead_reply_inbox')
      .select(
        `id, from_email, to_email, to_name, subject, sent_message, sent_message_body,
         reply_message, reply_body, preview_text, campaign_name,
         ai_category, ai_sentiment, ai_is_positive,
         lead_first_name, lead_last_name, lead_company_name, lead_title,
         lead_industry, linked_deal_id`,
      )
      .eq('id', inbox_item_id)
      .single();

    if (itemError || !item) {
      return new Response(JSON.stringify({ error: 'Inbox item not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Optionally fetch linked deal for extra context
    let dealContext = '';
    if (item.linked_deal_id) {
      const { data: deal } = await supabaseAdmin
        .from('listings')
        .select(
          'title, internal_company_name, category, industry, description, executive_summary, revenue, ebitda, location',
        )
        .eq('id', item.linked_deal_id)
        .single();

      if (deal) {
        dealContext = `\nDEAL CONTEXT:
Company: ${deal.internal_company_name || deal.title || 'Unknown'}
Industry: ${deal.industry || deal.category || 'Not specified'}
Location: ${deal.location || 'Not specified'}
${deal.revenue ? `Revenue: $${(deal.revenue / 1000000).toFixed(1)}M` : ''}
${deal.ebitda ? `EBITDA: $${(deal.ebitda / 1000000).toFixed(1)}M` : ''}
Summary: ${deal.executive_summary || 'Not available'}`;
      }
    }

    const replyText = item.reply_body || item.reply_message || item.preview_text || '';
    const sentText = item.sent_message_body || item.sent_message || '';
    const leadName =
      [item.lead_first_name, item.lead_last_name].filter(Boolean).join(' ') ||
      item.to_name ||
      'the contact';
    const company = item.lead_company_name || '';
    const category = item.ai_category || 'neutral';

    const systemPrompt = `You are a senior M&A advisor at SourceCo drafting a reply to a lead who responded to a cold outreach email. Your reply should advance the conversation toward a meeting or next step.

Guidelines by response category:
- meeting_request: Thank them, propose 2-3 specific time slots this week/next week, keep it brief
- interested: Provide 1-2 additional compelling details about the opportunity, suggest a brief call
- question: Answer their question directly and concisely, then pivot to scheduling a call for deeper discussion
- referral: Thank them warmly, ask for the referral's name/email/phone, offer to reach out directly

General rules:
- Keep under 150 words
- Reference what they specifically said in their reply
- Tone: professional, warm, concise — like a trusted advisor, not a salesperson
- Do NOT use generic phrases like "I hope this email finds you well"
- Use the lead's first name if available
- End with a clear, specific next step
- Do NOT include a subject line in the body`;

    const userPrompt = `Draft a reply to this email response:

LEAD INFO:
Name: ${leadName}
Title: ${item.lead_title || 'Not known'}
Company: ${company}
Industry: ${item.lead_industry || 'Not specified'}
Category: ${category}
Campaign: ${item.campaign_name || 'Not specified'}

ORIGINAL OUTREACH (what we sent):
${sentText ? sentText.substring(0, 1500) : 'Original message not available'}

THEIR REPLY:
${replyText.substring(0, 2000)}
${dealContext}

Write the reply now. Return a JSON object with "subject" (a Re: subject line) and "body" (the email body text) fields.`;

    const response = await fetchWithAutoRetry(
      GEMINI_API_URL,
      {
        method: 'POST',
        headers: getGeminiHeaders(geminiApiKey),
        body: JSON.stringify({
          model: DEFAULT_GEMINI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.6,
          max_tokens: 2048,
          response_format: { type: 'json_object' },
        }),
      },
      { callerName: 'draft-reply-email', maxRetries: 2 },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    let parsed: { subject?: string; body?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content?.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        parsed = {
          subject: `Re: ${item.subject || 'Your response'}`,
          body: content,
        };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        email: {
          subject: parsed.subject || `Re: ${item.subject || 'Your response'}`,
          body: parsed.body || content,
        },
        context: {
          category,
          lead_name: leadName,
          company,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('Draft reply email error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to draft reply',
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
