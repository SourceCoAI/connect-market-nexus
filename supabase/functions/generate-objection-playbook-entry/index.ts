import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

interface PlaybookRequest {
  category_id: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  const corsHeaders = getCorsHeaders(req);

  try {
    const { category_id } = (await req.json()) as PlaybookRequest;
    if (!category_id) {
      return new Response(JSON.stringify({ error: 'category_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get category details
    const { data: category, error: catError } = await supabase
      .from('objection_categories')
      .select('id, name')
      .eq('id', category_id)
      .single();

    if (catError || !category) {
      return new Response(JSON.stringify({ error: 'Category not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the last 50 auto_accepted instances for this category
    const { data: instances, error: instError } = await supabase
      .from('objection_instances')
      .select('objection_text, caller_response_text, overcame, call_outcome, handling_score')
      .eq('category_id', category_id)
      .eq('status', 'auto_accepted')
      .order('created_at', { ascending: false })
      .limit(50);

    if (instError) throw instError;
    if (!instances || instances.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No instances found for this category' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Build the prompt
    const dataStr = instances
      .map(
        (inst, i) =>
          `Instance ${i + 1}:\n- Objection: "${inst.objection_text}"\n- Caller response: "${inst.caller_response_text}"\n- Overcame: ${inst.overcame}\n- Call outcome: ${inst.call_outcome}\n- Handling score: ${inst.handling_score}/10`,
      )
      .join('\n\n');

    const prompt = `You are a sales training expert for an M&A cold calling team. You have been given ${instances.length} real call instances where prospects raised a ${category.name} objection. For each instance: prospect objection text, caller response, whether the caller overcame it (true/false), and call outcome. Analyse which caller responses correlated with overcoming the objection versus ending the call. Return only valid JSON with this structure: {frameworks: [{title: string, description: string, example_phrases: string[3]}] (2–3 items that correlated with OVERCOMING the objection), mistakes_to_avoid: [{pattern: string, why_it_fails: string}] (2–3 items that correlated with NOT overcoming), confidence: number (0–1 based on data volume and consistency)}. Write example phrases a caller can use word-for-word on a live call. Plain direct language only.\n\nDATA:\n${dataStr}`;

    // Call Anthropic API
    const aiResponse = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!aiResponse.ok) {
      const err = await aiResponse.text();
      throw new Error(`Anthropic API error ${aiResponse.status}: ${err}`);
    }

    const aiResult = await aiResponse.json();
    const textContent = aiResult.content?.find((b: { type: string }) => b.type === 'text')?.text;
    if (!textContent) throw new Error('No text response from AI');

    const parsed = JSON.parse(textContent);

    // Get current version for this category
    const { data: existing } = await supabase
      .from('objection_playbook')
      .select('version')
      .eq('category_id', category_id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (existing?.version || 0) + 1;

    // Insert new playbook entry as pending_review (never auto-publish)
    const { data: playbook, error: insertError } = await supabase
      .from('objection_playbook')
      .insert({
        category_id,
        version: nextVersion,
        status: 'pending_review',
        frameworks: parsed.frameworks || [],
        mistakes_to_avoid: parsed.mistakes_to_avoid || [],
        data_basis_count: instances.length,
        ai_confidence: parsed.confidence || 0,
        generated_at: new Date().toISOString(),
      })
      .select('id, version')
      .single();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        message: `Playbook entry v${nextVersion} generated for "${category.name}"`,
        playbook_id: playbook?.id,
        version: nextVersion,
        status: 'pending_review',
        data_basis_count: instances.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('generate-objection-playbook-entry error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
