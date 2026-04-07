/**
 * draft-outreach-email: AI-drafts a personalized outreach email for a buyer
 *
 * Admin-only. Uses deal memo content + buyer thesis/criteria to generate
 * a personalized pitch email explaining why this deal fits the buyer.
 *
 * POST body:
 *   - deal_id: UUID
 *   - buyer_id: UUID (remarketing_buyer_id)
 *   - memo_id: UUID (optional — to reference specific memo content)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import {
  GEMINI_API_URL,
  DEFAULT_GEMINI_MODEL,
  getGeminiHeaders,
  fetchWithAutoRetry,
  getGeminiApiKey,
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
  const geminiApiKey = getGeminiApiKey();
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const auth = await requireAdmin(req, supabaseAdmin);
  if (!auth.isAdmin) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.authenticated ? 403 : 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { deal_id, buyer_id, memo_id } = await req.json();

    if (!deal_id || !buyer_id) {
      return new Response(JSON.stringify({ error: 'deal_id and buyer_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch deal data
    const { data: deal } = await supabaseAdmin
      .from('listings')
      .select(
        'title, internal_company_name, category, location, address_state, revenue, ebitda, services, service_mix, description, executive_summary, geographic_states, industry',
      )
      .eq('id', deal_id)
      .single();

    if (!deal) {
      return new Response(JSON.stringify({ error: 'Deal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch buyer data
    const { data: buyer } = await supabaseAdmin
      .from('buyers')
      .select(
        'company_name, pe_firm_name, thesis_summary, industry_vertical, target_revenue_min, target_revenue_max, target_ebitda_min, target_ebitda_max, geographic_footprint, operating_locations, services_provided, acquisition_history, business_overview',
      )
      .eq('id', buyer_id)
      .single();

    if (!buyer) {
      return new Response(JSON.stringify({ error: 'Buyer not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch memo content if provided
    let memoContent = '';
    if (memo_id) {
      const { data: memo } = await supabaseAdmin
        .from('lead_memos')
        .select('content, memo_type')
        .eq('id', memo_id)
        .single();

      if (memo?.content) {
        const sections =
          (memo.content as { sections?: { title: string; content: string }[] }).sections || [];
        memoContent = sections.map((s) => `${s.title}:\n${s.content}`).join('\n\n');
      }
    }

    // Generate outreach email
    const systemPrompt = `You are a senior M&A advisor at SourceCo writing a personalized outreach email to a potential buyer about a deal opportunity. Your email should be professional, concise, and demonstrate understanding of both the deal and the buyer's investment thesis.

Key rules:
- Open with a personalized hook referencing the buyer's thesis or recent activity
- Highlight 2-3 specific reasons this deal fits the buyer's criteria (size, geography, services, thesis alignment)
- Include concrete data points (revenue, EBITDA, location, service mix)
- Keep it under 200 words
- End with a clear call to action
- Tone: professional but warm, like a trusted advisor sharing a genuine opportunity
- Do NOT use generic salutations like "Dear Sir/Madam" — use the firm name`;

    const userPrompt = `Draft an outreach email for this buyer about this deal:

DEAL INFO:
Company: ${deal.internal_company_name || deal.title}
Industry: ${deal.industry || deal.category}
Location: ${deal.address_state || deal.location}
Revenue: ${deal.revenue ? `$${(deal.revenue / 1000000).toFixed(1)}M` : 'Not disclosed'}
EBITDA: ${deal.ebitda ? `$${(deal.ebitda / 1000000).toFixed(1)}M` : 'Not disclosed'}
Services: ${deal.services || deal.service_mix || 'Not specified'}
Description: ${deal.executive_summary || ''}

BUYER INFO:
Firm: ${buyer.pe_firm_name || buyer.company_name}
Thesis: ${buyer.thesis_summary || 'Not available'}
Industry Focus: ${buyer.industry_vertical || 'Not specified'}
Target Revenue: ${buyer.target_revenue_min && buyer.target_revenue_max ? `$${(buyer.target_revenue_min / 1000000).toFixed(1)}M - $${(buyer.target_revenue_max / 1000000).toFixed(1)}M` : 'Not specified'}
Geography: ${buyer.geographic_footprint || buyer.operating_locations || 'Not specified'}
Services Focus: ${buyer.services_provided || 'Not specified'}
Recent Acquisitions: ${buyer.acquisition_history || 'Not available'}

${memoContent ? `MEMO HIGHLIGHTS:\n${memoContent.substring(0, 2000)}` : ''}

Write the email now. Return a JSON object with "subject" and "body" fields.`;

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
      { callerName: 'draft-outreach-email', maxRetries: 2 },
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
        parsed = { subject: 'Deal Opportunity', body: content };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        email: {
          subject: parsed.subject || 'Deal Opportunity',
          body: parsed.body || content,
          buyer_name: buyer.pe_firm_name || buyer.company_name,
          deal_name: deal.internal_company_name || deal.title,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('Draft email error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to draft email',
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
