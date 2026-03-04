import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const { universe_id, guide_content, source_name, industry_name } = await req.json();

    if (!universe_id) {
      return new Response(JSON.stringify({ error: 'universe_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!guide_content || guide_content.length < 1000) {
      return new Response(
        JSON.stringify({ error: 'guide_content must have at least 1000 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if there's already an active extraction for this universe
    const { data: existingExtraction } = await supabase
      .from('buyer_criteria_extractions')
      .select('*')
      .eq('universe_id', universe_id)
      .in('status', ['pending', 'processing'])
      .single();

    if (existingExtraction) {
      return new Response(
        JSON.stringify({
          extraction_id: existingExtraction.id,
          status: existingExtraction.status,
          message: 'Extraction already in progress',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Create extraction source record first
    const { data: sourceRecord, error: sourceError } = await supabase
      .from('criteria_extraction_sources')
      .insert({
        universe_id,
        source_type: 'ai_guide',
        source_name: source_name || 'M&A Guide',
        source_metadata: {
          industry_name: industry_name || 'Unknown',
          content_length: guide_content.length,
          word_count: guide_content.split(/\s+/).length,
        },
        extraction_status: 'processing',
        extraction_started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sourceError) {
      throw new Error(`Failed to create source record: ${sourceError.message}`);
    }

    // Create a new extraction tracking record
    const { data: extraction, error: extractionError } = await supabase
      .from('buyer_criteria_extractions')
      .insert({
        universe_id,
        source_id: sourceRecord.id,
        status: 'processing',
        current_phase: 'Initializing',
        phases_completed: 0,
        total_phases: 4, // Size, Service, Geography, Buyer Types
        extracted_criteria: {},
      })
      .select()
      .single();

    if (extractionError || !extraction) {
      throw new Error(`Failed to create extraction record: ${extractionError?.message}`);
    }

    console.log(
      `[extract-buyer-criteria-background] Created extraction ${extraction.id} for universe ${universe_id}`,
    );

    // Return immediately with the extraction ID
    const response = new Response(
      JSON.stringify({
        extraction_id: extraction.id,
        source_id: sourceRecord.id,
        status: 'processing',
        message: 'Extraction started. Poll the buyer_criteria_extractions table for progress.',
      }),
      {
        status: 202, // Accepted
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

    // Start the background extraction (don't await)
    processExtractionInBackground(
      extraction.id,
      sourceRecord.id,
      universe_id,
      guide_content,
      industry_name || 'Unknown Industry',
      supabase,
    ).catch(async (error: unknown) => {
      console.error(
        `[extract-buyer-criteria-background] Extraction ${extraction.id} failed:`,
        error,
      );
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      // Update extraction status to failed
      await supabase
        .from('buyer_criteria_extractions')
        .update({
          status: 'failed',
          error: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', extraction.id);

      // Update source record
      await supabase
        .from('criteria_extraction_sources')
        .update({
          extraction_status: 'failed',
          extraction_error: errorMessage,
          extraction_completed_at: new Date().toISOString(),
        })
        .eq('id', sourceRecord.id);
    });

    return response;
  } catch (error: unknown) {
    console.error('[extract-buyer-criteria-background] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

async function processExtractionInBackground(
  extractionId: string,
  sourceId: string,
  universeId: string,
  guideContent: string,
  industryName: string,
  supabase: ReturnType<typeof createClient>,
) {
  console.log(`[processExtractionInBackground] Starting extraction ${extractionId}`);

  try {
    // Define the 4 phases of extraction
    const phases = [
      { name: 'Size Criteria', key: 'size_criteria' },
      { name: 'Service Criteria', key: 'service_criteria' },
      { name: 'Geography Criteria', key: 'geography_criteria' },
      { name: 'Buyer Types', key: 'buyer_types_criteria' },
    ];

    let extractedCriteria: Record<string, unknown> = {};
    let confidenceScores: Record<string, unknown> = {};

    // Process each phase
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      console.log(
        `[processExtractionInBackground] Processing phase ${i + 1}/${phases.length}: ${phase.name}`,
      );

      // Update status
      await supabase
        .from('buyer_criteria_extractions')
        .update({
          current_phase: phase.name,
          phases_completed: i,
        })
        .eq('id', extractionId);

      // Call the original extract-buyer-criteria function in non-streaming mode
      // We'll do this via HTTP to the existing edge function
      const response = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/extract-buyer-criteria`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({
            universe_id: universeId,
            guide_content: guideContent,
            source_name: `${industryName} M&A Guide`,
            industry_name: industryName,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Phase ${i + 1} failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success && result.extracted_data) {
        extractedCriteria = result.extracted_data;
        confidenceScores = {
          size: result.extracted_data.size_criteria?.confidence_score || 0,
          service: result.extracted_data.service_criteria?.confidence_score || 0,
          geography: result.extracted_data.geography_criteria?.confidence_score || 0,
          buyer_types: result.extracted_data.buyer_types_criteria?.confidence_score || 0,
          overall: result.extracted_data.overall_confidence || result.confidence || 0,
        };

        // Update progress with extracted data
        await supabase
          .from('buyer_criteria_extractions')
          .update({
            extracted_criteria: extractedCriteria,
            confidence_scores: confidenceScores,
            phases_completed: i + 1,
          })
          .eq('id', extractionId);

        break; // The extraction function returns everything at once
      }
    }

    // Mark as completed
    await supabase
      .from('buyer_criteria_extractions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        phases_completed: 4,
      })
      .eq('id', extractionId);

    // Update source record
    await supabase
      .from('criteria_extraction_sources')
      .update({
        extraction_status: 'completed',
        extraction_completed_at: new Date().toISOString(),
        extracted_data: extractedCriteria,
        confidence_scores: confidenceScores,
      })
      .eq('id', sourceId);

    // Update the universe with the extracted criteria
    await supabase
      .from('buyer_universes')
      .update({
        size_criteria: extractedCriteria.size_criteria,
        service_criteria: extractedCriteria.service_criteria,
        geography_criteria: extractedCriteria.geography_criteria,
        buyer_types_criteria: extractedCriteria.buyer_types_criteria,
      })
      .eq('id', universeId);

    console.log(
      `[processExtractionInBackground] Extraction ${extractionId} completed successfully`,
    );
  } catch (error: unknown) {
    console.error(`[processExtractionInBackground] Error in extraction ${extractionId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    // Update status to failed
    await supabase
      .from('buyer_criteria_extractions')
      .update({
        status: 'failed',
        error: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('id', extractionId);

    // Update source record
    await supabase
      .from('criteria_extraction_sources')
      .update({
        extraction_status: 'failed',
        extraction_error: errorMessage,
        extraction_completed_at: new Date().toISOString(),
      })
      .eq('id', sourceId);

    throw error;
  }
}
