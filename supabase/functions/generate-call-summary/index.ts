import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import {
  GEMINI_API_URL,
  getGeminiHeaders,
  getGeminiApiKey,
  DEFAULT_GEMINI_MODEL,
} from '../_shared/ai-providers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const {
      call_score_id,
      composite_score,
      opener_tone,
      call_structure,
      discovery_quality,
      objection_handling,
      closing_next_step,
      value_proposition,
      disposition,
    } = await req.json();

    if (!call_score_id) {
      return new Response(JSON.stringify({ error: 'call_score_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check cache first
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: existing } = await supabase
      .from('call_scores')
      .select('ai_summary')
      .eq('id', call_score_id)
      .single();

    if (existing?.ai_summary) {
      return new Response(JSON.stringify({ summary: existing.ai_summary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate using Gemini via OpenRouter
    const geminiKey = getGeminiApiKey();
    if (!geminiKey) {
      return new Response(
        JSON.stringify({ error: 'OPENROUTER_API_KEY/GEMINI_API_KEY not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const prompt = `In one sentence of 20 words or fewer, explain why this cold call scored ${composite_score}/10. Scores by dimension — Opener & Tone: ${opener_tone ?? 'N/A'}, Call Structure: ${call_structure ?? 'N/A'}, Discovery Quality: ${discovery_quality ?? 'N/A'}, Objection Handling: ${objection_handling ?? 'N/A'}, Closing / Next Step: ${closing_next_step ?? 'N/A'}, Value Proposition: ${value_proposition ?? 'N/A'}. Call outcome: ${disposition ?? 'Unknown'}. Be specific and direct.`;

    const geminiRes = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: getGeminiHeaders(geminiKey),
      body: JSON.stringify({
        model: DEFAULT_GEMINI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 0.3,
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', errText);
      return new Response(JSON.stringify({ error: 'Gemini API error', details: errText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiData = await geminiRes.json();
    const summary = geminiData?.choices?.[0]?.message?.content?.trim() || null;

    // Cache the result
    if (summary) {
      await supabase.from('call_scores').update({ ai_summary: summary }).eq('id', call_score_id);
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('generate-call-summary error:', err);
    return new Response(JSON.stringify({ error: 'Internal error', message: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
