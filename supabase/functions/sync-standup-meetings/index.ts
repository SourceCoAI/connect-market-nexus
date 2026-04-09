/* eslint-disable no-console */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { getGeminiApiKey } from '../_shared/ai-providers.ts';

/**
 * Polling fallback for meeting detection.
 *
 * Queries Fireflies for recent meetings and processes any unprocessed ones
 * through the extract-standup-tasks function.
 *
 * Only meetings tagged with `<ds>` in the title are processed. Other
 * meetings are skipped to keep the task tracker focused on standups.
 *
 * This runs on a cron schedule as a safety net in case the Fireflies
 * webhook is misconfigured, delayed, or fails silently.
 */

const STANDUP_TITLE_TAG = '<ds>';
const FIREFLIES_API_TIMEOUT_MS = 15_000;
const LOOKBACK_HOURS = 48;

/** Check if a title contains the standup tag, including HTML-encoded variants */
function hasStandupTag(title: string): boolean {
  const lower = title.toLowerCase();
  return (
    lower.includes(STANDUP_TITLE_TAG) || lower.includes('&lt;ds&gt;') || lower.includes('%3cds%3e')
  );
}

async function firefliesGraphQL(query: string, variables?: Record<string, unknown>) {
  const apiKey = Deno.env.get('FIREFLIES_API_KEY');
  if (!apiKey) throw new Error('FIREFLIES_API_KEY not configured');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FIREFLIES_API_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`Fireflies API error: ${response.status}`);
    const result = await response.json();
    if (result.errors) throw new Error(result.errors[0]?.message);
    return result.data;
  } finally {
    clearTimeout(timeoutId);
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Allow overriding lookback via request body
    let lookbackHours = LOOKBACK_HOURS;
    try {
      const body = await req.json();
      if (body.lookback_hours && typeof body.lookback_hours === 'number') {
        lookbackHours = Math.min(body.lookback_hours, 168); // max 7 days
      }
    } catch {
      // No body or invalid JSON — use defaults
    }

    const fromDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
    const fromDateIso = fromDate.toISOString().split('T')[0];

    console.log(`Syncing standup meetings from ${fromDateIso} (${lookbackHours}h lookback)`);

    // Fetch recent transcripts from Fireflies. Paginate via skip/limit to
    // handle teams that hold many meetings in the lookback window.
    const PAGE_SIZE = 50;
    const MAX_PAGES = 5; // hard cap: 250 meetings per cron run
    const allTranscripts: Array<{ id: string; title?: string; date?: string }> = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await firefliesGraphQL(
        `query RecentTranscripts($fromDate: DateTime, $skip: Int, $limit: Int) {
          transcripts(fromDate: $fromDate, skip: $skip, limit: $limit) {
            id
            title
            date
          }
        }`,
        { fromDate: fromDate.toISOString(), skip: page * PAGE_SIZE, limit: PAGE_SIZE },
      );

      const pageResults = data?.transcripts || [];
      if (pageResults.length === 0) break;
      allTranscripts.push(...pageResults);
      if (pageResults.length < PAGE_SIZE) break; // last page
    }

    const transcripts = allTranscripts.filter((t) => !!t.title);
    console.log(`Found ${transcripts.length} recent transcripts across ${Math.ceil(allTranscripts.length / PAGE_SIZE)} page(s)`);

    // Only process meetings with the <ds> standup tag
    const dsTagged = transcripts.filter((t: { title: string }) => hasStandupTag(t.title));
    const skippedCount = transcripts.length - dsTagged.length;
    console.log(
      `${dsTagged.length} of ${transcripts.length} have <ds> tag (skipping ${skippedCount} non-<ds> meetings)`,
    );

    if (dsTagged.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No <ds>-tagged meetings found in Fireflies',
          transcripts_checked: transcripts.length,
          skipped_non_ds: skippedCount,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check which ones have already been processed
    const transcriptIds = dsTagged.map((t: { id: string }) => t.id);
    const { data: existing } = await supabase
      .from('standup_meetings')
      .select('fireflies_transcript_id')
      .in('fireflies_transcript_id', transcriptIds);

    const processedIds = new Set(
      (existing || []).map((e: { fireflies_transcript_id: string }) => e.fireflies_transcript_id),
    );

    const unprocessed = dsTagged.filter((t: { id: string }) => !processedIds.has(t.id));

    console.log(`${unprocessed.length} unprocessed meetings (${processedIds.size} already done)`);

    // Auto-detect extraction mode: use Fireflies-native mode when Gemini key is not configured
    const hasGeminiKey = !!getGeminiApiKey();
    const useFirefliesActions = !hasGeminiKey;
    console.log(`Extraction mode: ${useFirefliesActions ? 'fireflies-native' : 'ai'}`);

    // Process each unprocessed standup
    const results: {
      transcript_id: string;
      title: string;
      success: boolean;
      meeting_id?: string;
      error?: string;
    }[] = [];

    for (const transcript of unprocessed) {
      try {
        console.log(`Processing: "${transcript.title}" (${transcript.id})`);

        const extractResponse = await fetch(`${supabaseUrl}/functions/v1/extract-standup-tasks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            fireflies_transcript_id: transcript.id,
            meeting_title: transcript.title,
            use_fireflies_actions: useFirefliesActions,
          }),
        });

        const extractResult = await extractResponse.json();

        if (extractResponse.ok) {
          console.log(
            `Extracted ${extractResult.tasks_extracted} tasks from "${transcript.title}"`,
          );
          results.push({
            transcript_id: transcript.id,
            title: transcript.title,
            success: true,
            meeting_id: extractResult.meeting_id,
          });
        } else {
          console.error(`Extraction failed for ${transcript.id}:`, extractResult);
          results.push({
            transcript_id: transcript.id,
            title: transcript.title,
            success: false,
            error: extractResult.error || 'Extraction failed',
          });
        }
      } catch (err) {
        console.error(`Error processing ${transcript.id}:`, err);
        results.push({
          transcript_id: transcript.id,
          title: transcript.title,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const processed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        transcripts_checked: transcripts.length,
        ds_tagged: dsTagged.length,
        skipped_non_ds: skippedCount,
        already_processed: processedIds.size,
        newly_processed: processed,
        failed,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
