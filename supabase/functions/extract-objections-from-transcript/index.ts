import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

const EXTRACTION_PROMPT = `You are an expert cold call analyst for an M&A advisory firm. Read the following call transcript and identify every objection raised by the prospect. An objection is any statement where the prospect pushes back, resists, deflects, or expresses reluctance — including soft objections like 'just send me some info' and hard ones like 'we are not interested'. For each objection found, return a JSON object with: objection_text (prospect's exact words), category (one of: Timing, Not Interested, Price, Already In Process, Gatekeeper, No Deals, Size Mismatch, Send Info, Too Busy, Other), caller_response (caller's immediate response verbatim from transcript), overcame (true if call continued productively after the response, false if it stalled or ended), call_outcome (one of: continued, ended, meeting_booked, callback_scheduled), handling_score (integer 1–10 rating the quality of the caller's response), confidence (decimal 0–1 your confidence in this extraction). Return as JSON: {objections: [...]}. If no objections found return {objections: []}. Return only valid JSON with no other text.`;

interface ExtractRequest {
  call_id: string;
  transcript_text?: string;
}

interface ExtractedObjection {
  objection_text: string;
  category: string;
  caller_response: string;
  overcame: boolean;
  call_outcome: string;
  handling_score: number;
  confidence: number;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  const corsHeaders = getCorsHeaders(req);

  try {
    const { call_id, transcript_text } = (await req.json()) as ExtractRequest;
    if (!call_id) {
      return new Response(JSON.stringify({ error: 'call_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get transcript text if not provided
    let transcript = transcript_text;
    if (!transcript) {
      // Try fetching from fireflies_transcripts first, then calls
      const { data: ffData } = await supabase
        .from('fireflies_transcripts')
        .select('transcript_text, recording_url')
        .eq('call_id', call_id)
        .maybeSingle();

      if (ffData?.transcript_text) {
        transcript = ffData.transcript_text;
      } else {
        const { data: callData } = await supabase
          .from('calls')
          .select('transcript')
          .eq('id', call_id)
          .maybeSingle();
        transcript = callData?.transcript;
      }
    }

    if (!transcript) {
      return new Response(
        JSON.stringify({ error: 'No transcript found for this call', call_id }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Get recording URL if available
    const { data: recordingData } = await supabase
      .from('fireflies_transcripts')
      .select('recording_url')
      .eq('call_id', call_id)
      .maybeSingle();

    const recordingUrl = recordingData?.recording_url || null;

    // Get caller_id from the call record
    const { data: callRecord } = await supabase
      .from('calls')
      .select('caller_id, user_id')
      .eq('id', call_id)
      .maybeSingle();

    const callerId = callRecord?.caller_id || callRecord?.user_id || null;

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
        messages: [
          {
            role: 'user',
            content: `${EXTRACTION_PROMPT}\n\nTRANSCRIPT:\n${transcript}`,
          },
        ],
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

    // Parse JSON from the AI response
    const parsed = JSON.parse(textContent);
    const objections: ExtractedObjection[] = parsed.objections || [];

    if (objections.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No objections detected', call_id, count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Map category names to category IDs
    const { data: categories } = await supabase
      .from('objection_categories')
      .select('id, name');

    const categoryMap = new Map<string, string>();
    for (const cat of categories || []) {
      categoryMap.set(cat.name.toLowerCase(), cat.id);
      // Also map shortened names from AI
      if (cat.name === 'Price / Fee Concern') categoryMap.set('price', cat.id);
      if (cat.name === 'Already In a Process') categoryMap.set('already in process', cat.id);
      if (cat.name === 'Gatekeeper Block') categoryMap.set('gatekeeper', cat.id);
      if (cat.name === 'No Deals Available') categoryMap.set('no deals', cat.id);
      if (cat.name === 'Other / Uncategorised') {
        categoryMap.set('other', cat.id);
        categoryMap.set('uncategorised', cat.id);
        categoryMap.set('uncategorized', cat.id);
      }
    }

    const fallbackCategoryId = categoryMap.get('other / uncategorised') || categoryMap.get('other');

    // Insert each objection instance
    const insertedIds: string[] = [];
    const categoryInstanceCounts = new Map<string, number>();

    for (const obj of objections) {
      const catKey = obj.category?.toLowerCase() || 'other';
      const categoryId = categoryMap.get(catKey) || fallbackCategoryId;
      if (!categoryId) continue;

      const status = obj.confidence >= 0.8 ? 'auto_accepted' : 'pending_review';

      const { data: inserted, error } = await supabase
        .from('objection_instances')
        .insert({
          call_id,
          caller_id: callerId,
          objection_text: obj.objection_text,
          category_id: categoryId,
          caller_response_text: obj.caller_response,
          overcame: obj.overcame,
          call_outcome: obj.call_outcome,
          handling_score: Math.min(10, Math.max(1, Math.round(obj.handling_score))),
          confidence_score: obj.confidence,
          recording_url: recordingUrl,
          status,
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error inserting objection instance:', error);
        continue;
      }

      if (inserted) insertedIds.push(inserted.id);

      // Track counts per category for playbook trigger
      if (status === 'auto_accepted') {
        categoryInstanceCounts.set(
          categoryId,
          (categoryInstanceCounts.get(categoryId) || 0) + 1,
        );
      }
    }

    // Check if any category has 10+ new instances since last playbook generation
    for (const [categoryId] of categoryInstanceCounts) {
      const { data: latestPlaybook } = await supabase
        .from('objection_playbook')
        .select('generated_at')
        .eq('category_id', categoryId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let query = supabase
        .from('objection_instances')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', categoryId)
        .eq('status', 'auto_accepted');

      if (latestPlaybook?.generated_at) {
        query = query.gt('created_at', latestPlaybook.generated_at);
      }

      const { count } = await query;

      if (count && count >= 10) {
        // Trigger playbook generation
        try {
          await fetch(
            `${supabaseUrl}/functions/v1/generate-objection-playbook-entry`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ category_id: categoryId }),
            },
          );
        } catch (triggerErr) {
          console.error('Error triggering playbook generation:', triggerErr);
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: `Extracted ${insertedIds.length} objections`,
        call_id,
        count: insertedIds.length,
        instance_ids: insertedIds,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('extract-objections-from-transcript error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
