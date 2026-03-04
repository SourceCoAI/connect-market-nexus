import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * This function creates a generation record and returns immediately.
 * The actual processing is done by process-ma-guide-queue via cron.
 * This ensures generation continues even if the user leaves the page.
 */
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const { universe_id } = await req.json();

    if (!universe_id) {
      return new Response(JSON.stringify({ error: 'universe_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if there's already an active generation for this universe
    const { data: existingGeneration } = await supabase
      .from('ma_guide_generations')
      .select('*')
      .eq('universe_id', universe_id)
      .in('status', ['pending', 'processing'])
      .single();

    if (existingGeneration) {
      return new Response(
        JSON.stringify({
          generation_id: existingGeneration.id,
          status: existingGeneration.status,
          message: 'Generation already in progress',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch universe details to validate it exists
    const { data: universe, error: universeError } = await supabase
      .from('buyer_universes')
      .select('name, description')
      .eq('id', universe_id)
      .single();

    if (universeError || !universe) {
      return new Response(JSON.stringify({ error: 'Universe not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a new generation record with status 'pending'
    // The cron-triggered process-ma-guide-queue will pick this up
    const { data: generation, error: generationError } = await supabase
      .from('ma_guide_generations')
      .insert({
        universe_id,
        status: 'pending', // Queue for processing by cron
        current_phase: 'Queued for processing',
        phases_completed: 0,
        total_phases: 14,
        generated_content: {},
      })
      .select()
      .single();

    if (generationError || !generation) {
      throw new Error(`Failed to create generation record: ${generationError?.message}`);
    }

    console.log(
      `[generate-ma-guide-background] Queued generation ${generation.id} for universe ${universe_id}`,
    );

    // Trigger immediate processing (fire and forget)
    // This gives instant feedback while cron handles continuation
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || supabaseServiceKey;
    fetch(`${supabaseUrl}/functions/v1/process-ma-guide-queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ triggered_by: generation.id }),
    }).catch((err) => {
      // Non-blocking - cron will pick it up anyway
      console.log(
        '[generate-ma-guide-background] Initial trigger failed, cron will handle:',
        err.message,
      );
    });

    return new Response(
      JSON.stringify({
        generation_id: generation.id,
        status: 'pending',
        message: 'Generation queued. Processing will continue even if you leave the page.',
      }),
      {
        status: 202, // Accepted
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[generate-ma-guide-background] Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
