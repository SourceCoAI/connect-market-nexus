/* eslint-disable no-console */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  updateGlobalQueueProgress,
  completeGlobalQueueOperation,
  isOperationPaused,
} from '../_shared/global-activity-queue.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

// Process one batch per invocation to stay within timeout limits
const BATCH_SIZE = 1; // Must match generate-ma-guide BATCH_SIZE
const TOTAL_PHASES = 14;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || supabaseServiceKey;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Find pending or processing generations
    const { data: generations, error: fetchError } = await supabase
      .from('ma_guide_generations')
      .select('*, buyer_universes!inner(name, description, ma_guide_qa_context)')
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: true })
      .limit(1); // Process one at a time

    if (fetchError) {
      console.error('[process-ma-guide-queue] Error fetching generations:', fetchError);
      throw fetchError;
    }

    if (!generations || generations.length === 0) {
      console.log('[process-ma-guide-queue] No pending generations');
      return new Response(JSON.stringify({ message: 'No pending generations' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const generation = generations[0];
    const universe = generation.buyer_universes;

    console.log(
      `[process-ma-guide-queue] Processing generation ${generation.id}, phase ${generation.phases_completed}/${TOTAL_PHASES}`,
    );

    // Calculate which batch to process next
    const currentBatch = Math.floor(generation.phases_completed / BATCH_SIZE);
    const totalBatches = Math.ceil(TOTAL_PHASES / BATCH_SIZE);

    // If already complete, mark as done
    if (currentBatch >= totalBatches) {
      await supabase
        .from('ma_guide_generations')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          phases_completed: TOTAL_PHASES,
        })
        .eq('id', generation.id);

      return new Response(
        JSON.stringify({ message: 'Generation completed', generation_id: generation.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Update status to processing
    await supabase
      .from('ma_guide_generations')
      .update({
        status: 'processing',
        current_phase: `Batch ${currentBatch + 1}/${totalBatches}`,
      })
      .eq('id', generation.id);

    // Get previous content from generated_content
    const previousContent = generation.generated_content?.content || '';

    // Check if paused by user before processing
    if (await isOperationPaused(supabase, 'guide_generation')) {
      console.log('[process-ma-guide-queue] Operation paused by user — skipping this batch');
      return new Response(
        JSON.stringify({ message: 'Operation paused', generation_id: generation.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // === Fireflies Intelligence Gathering (only on first batch) ===
    let firefliesIntelligence = generation.generated_content?.fireflies_intelligence || '';

    if (currentBatch === 0) {
      console.log(
        `[process-ma-guide-queue] Gathering Fireflies intelligence for "${universe.name}"`,
      );

      try {
        // Search Fireflies for transcripts related to this industry
        const searchTerms = [universe.name];

        // Add segment terms from clarification context if available
        const qaContext = (universe.ma_guide_qa_context as Record<string, unknown>) || {};
        if (qaContext.segments && Array.isArray(qaContext.segments)) {
          searchTerms.push(...qaContext.segments);
        }
        if (qaContext.example_companies) {
          searchTerms.push(qaContext.example_companies);
        }

        const allTranscripts: unknown[] = [];

        // Helper to search Fireflies for a single term
        const searchFireflies = async (query: string, limit: number): Promise<unknown[]> => {
          try {
            const searchResponse = await fetch(
              `${supabaseUrl}/functions/v1/search-fireflies-for-buyer`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  apikey: supabaseAnonKey,
                  Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({ query, limit }),
                signal: AbortSignal.timeout(15000),
              },
            );
            if (searchResponse.ok) {
              const searchData = await searchResponse.json();
              return searchData.results || [];
            }
          } catch (searchErr) {
            console.warn(
              `[process-ma-guide-queue] Fireflies search for "${query}" failed:`,
              searchErr,
            );
          }
          return [];
        };

        // Fetch buyers in parallel with term searches
        const [termResults, { data: universeBuyers }] = await Promise.all([
          // Run all term searches in parallel
          Promise.allSettled(searchTerms.slice(0, 3).map((term) => searchFireflies(term, 10))),
          // Fetch buyers at the same time
          supabase
            .from('buyers')
            .select('pe_firm_name, company_name')
            .eq('universe_id', generation.universe_id)
            .limit(10),
        ]);

        // Collect term search results
        for (const result of termResults) {
          if (result.status === 'fulfilled' && result.value.length > 0) {
            allTranscripts.push(...result.value);
          }
        }

        // Run buyer searches in parallel
        if (universeBuyers && universeBuyers.length > 0) {
          const buyerNames = universeBuyers
            .slice(0, 5)
            .map((b) => b.pe_firm_name || b.company_name)
            .filter(Boolean) as string[];

          const buyerResults = await Promise.allSettled(
            buyerNames.map((name) => searchFireflies(name, 5)),
          );

          for (const result of buyerResults) {
            if (result.status === 'fulfilled' && result.value.length > 0) {
              allTranscripts.push(...result.value);
            }
          }
        }

        // Deduplicate by transcript ID
        const seen = new Set<string>();
        const uniqueTranscripts = allTranscripts.filter((t) => {
          if (!t.id || seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });

        console.log(
          `[process-ma-guide-queue] Found ${uniqueTranscripts.length} unique Fireflies transcripts`,
        );

        // Filter for external meetings only
        const externalTranscripts = uniqueTranscripts.filter((t) => {
          const title = (t.title || '').toLowerCase();
          return (
            title.includes('<rem>') ||
            title.includes('<ext>') ||
            title.includes('intro') ||
            title.includes('discovery') ||
            title.includes('capital') ||
            title.includes('partner') ||
            (!title.includes('standup') &&
              !title.includes('stand up') &&
              !title.includes('weekly touch base') &&
              !title.includes('internal'))
          );
        });

        // Build structured intelligence summary from transcript summaries
        if (externalTranscripts.length > 0) {
          const summaryParts: string[] = [];
          summaryParts.push(
            `FIREFLIES INTELLIGENCE: Found ${externalTranscripts.length} relevant call transcripts.\n`,
          );

          for (const t of externalTranscripts.slice(0, 15)) {
            const summary =
              typeof t.summary === 'string' ? t.summary : t.summary?.short_summary || '';
            const keywords = Array.isArray(t.keywords) ? t.keywords.join(', ') : '';
            const participants = Array.isArray(t.participants)
              ? t.participants
                  .map((p: string | { email?: string; name?: string }) =>
                    typeof p === 'string' ? p : p.email || p.name,
                  )
                  .join(', ')
              : '';

            if (summary) {
              summaryParts.push(`--- CALL: "${t.title}" (${t.date || 'undated'}) ---`);
              summaryParts.push(`Participants: ${participants}`);
              if (keywords) summaryParts.push(`Keywords: ${keywords}`);
              summaryParts.push(`Summary: ${summary}`);
              summaryParts.push('');
            }
          }

          firefliesIntelligence = summaryParts.join('\n');
          console.log(
            `[process-ma-guide-queue] Built ${firefliesIntelligence.length} chars of Fireflies intelligence`,
          );
        }

        // Store intelligence on the generation record for reuse across batches
        await supabase
          .from('ma_guide_generations')
          .update({
            generated_content: {
              ...generation.generated_content,
              fireflies_intelligence: firefliesIntelligence,
            },
          })
          .eq('id', generation.id);
      } catch (ffError) {
        console.warn(
          '[process-ma-guide-queue] Fireflies intelligence gathering failed (non-blocking):',
          ffError,
        );
      }
    }

    // Call generate-ma-guide for this batch
    console.log(`[process-ma-guide-queue] Calling generate-ma-guide for batch ${currentBatch}`);

    const anonKeyForApiHeader = Deno.env.get('SUPABASE_ANON_KEY') || supabaseServiceKey;
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-ma-guide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKeyForApiHeader,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        industry_name: universe.name,
        industry_description: universe.description,
        universe_id: generation.universe_id,
        clarification_context: universe.ma_guide_qa_context,
        fireflies_intelligence: firefliesIntelligence,
        stream: false,
        batch_index: currentBatch,
        previous_content: previousContent,
      }),
      signal: AbortSignal.timeout(120000), // 2 minute timeout
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Check for rate limit
      if (response.status === 429) {
        console.log('[process-ma-guide-queue] Rate limited, will retry on next cron');
        // Don't update status - leave as processing so cron picks it up again
        return new Response(
          JSON.stringify({ message: 'Rate limited, will retry', generation_id: generation.id }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      throw new Error(
        `Batch ${currentBatch} failed: ${response.status} - ${errorText.substring(0, 200)}`,
      );
    }

    const result = await response.json();
    const newContent = result.content || previousContent;
    const newPhasesCompleted = Math.min((currentBatch + 1) * BATCH_SIZE, TOTAL_PHASES);

    console.log(
      `[process-ma-guide-queue] Batch ${currentBatch} complete. Phases: ${newPhasesCompleted}/${TOTAL_PHASES}`,
    );

    // Update progress
    const updateData: Record<string, unknown> = {
      generated_content: { content: newContent },
      phases_completed: newPhasesCompleted,
      current_phase: `Batch ${currentBatch + 1}/${totalBatches} complete`,
    };

    // Check if this was the final batch
    if (result.is_final || newPhasesCompleted >= TOTAL_PHASES) {
      updateData.status = 'completed';
      updateData.completed_at = new Date().toISOString();

      if (result.criteria) {
        updateData.generated_content = {
          content: newContent,
          criteria: result.criteria,
          quality: result.quality,
        };
      }

      // Update universe with final content
      await supabase
        .from('buyer_universes')
        .update({
          ma_guide_content: newContent,
          ...(result.criteria ? { fit_criteria: result.criteria } : {}),
        })
        .eq('id', generation.universe_id);

      console.log(`[process-ma-guide-queue] Generation ${generation.id} COMPLETED`);
      await completeGlobalQueueOperation(supabase, 'guide_generation');
    } else {
      // Update progress: each batch = 1 completed phase
      await updateGlobalQueueProgress(supabase, 'guide_generation', { completedDelta: BATCH_SIZE });
    }

    await supabase.from('ma_guide_generations').update(updateData).eq('id', generation.id);

    // Self-chain: if there are more batches, trigger ourselves for the next one
    // This ensures continuous processing without waiting for the cron job (up to 60s gap)
    if (!result.is_final && newPhasesCompleted < TOTAL_PHASES) {
      console.log(
        `[process-ma-guide-queue] Triggering next batch (${newPhasesCompleted}/${TOTAL_PHASES} phases done)`,
      );
      // Small delay to avoid rate limiting, then fire-and-forget
      setTimeout(() => {
        const selfAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || supabaseServiceKey;
        fetch(`${supabaseUrl}/functions/v1/process-ma-guide-queue`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: selfAnonKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ triggered_by: generation.id, batch: newPhasesCompleted }),
          signal: AbortSignal.timeout(30_000),
        }).catch((err) => {
          // Non-blocking - cron will pick it up as backup
          console.log(
            '[process-ma-guide-queue] Self-chain trigger failed, cron will handle:',
            err.message,
          );
        });
      }, 2000); // 2s delay between batches to avoid rate limits
    }

    return new Response(
      JSON.stringify({
        message: result.is_final ? 'Generation completed' : 'Batch processed',
        generation_id: generation.id,
        phases_completed: newPhasesCompleted,
        total_phases: TOTAL_PHASES,
        is_complete: result.is_final || newPhasesCompleted >= TOTAL_PHASES,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[process-ma-guide-queue] Error:', errorMessage);

    // Check if we have a generation to update
    const { data: activeGen } = await supabase
      .from('ma_guide_generations')
      .select('id')
      .eq('status', 'processing')
      .limit(1)
      .single();

    if (activeGen) {
      // Default to recoverable — only permanently fail on known-terminal errors.
      // Rate limits (429, 500 with "rate limit") are recoverable and should be retried by cron.
      const isRateLimit =
        errorMessage.toLowerCase().includes('rate limit') ||
        errorMessage.includes('429') ||
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.includes('502') ||
        errorMessage.includes('503');

      const isTerminal =
        !isRateLimit &&
        (errorMessage.includes('401') ||
          errorMessage.includes('403') ||
          errorMessage.includes('payment_required') ||
          errorMessage.includes('Missing required'));

      if (isTerminal) {
        await supabase
          .from('ma_guide_generations')
          .update({
            status: 'failed',
            error: JSON.stringify({
              message: errorMessage,
              is_recoverable: false,
              timestamp: new Date().toISOString(),
            }),
          })
          .eq('id', activeGen.id);

        await completeGlobalQueueOperation(supabase, 'guide_generation', 'failed');
      } else if (isRateLimit) {
        // Rate-limited: store error info but keep as "processing" so cron retries
        console.log(
          `[process-ma-guide-queue] Rate limit detected, leaving as processing for retry: ${errorMessage}`,
        );
        await supabase
          .from('ma_guide_generations')
          .update({
            error: JSON.stringify({
              message: errorMessage,
              is_recoverable: true,
              timestamp: new Date().toISOString(),
            }),
          })
          .eq('id', activeGen.id);
      }
      // If recoverable, leave as processing for next cron run
    }

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
