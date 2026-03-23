/* eslint-disable no-console */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

interface FetchRequest {
  transcriptId: string; // deal_transcripts.id (our DB record ID)
}

const FIREFLIES_API_TIMEOUT_MS = 15_000; // 15 second timeout
const FIREFLIES_RATE_LIMIT_BACKOFF_MS = 3_000; // 3 second backoff on 429

/**
 * Call the Fireflies GraphQL API directly.
 * Requires FIREFLIES_API_KEY set as a Supabase secret.
 * Includes timeout enforcement and rate limit handling.
 */
async function firefliesGraphQL(query: string, variables?: Record<string, unknown>) {
  const apiKey = Deno.env.get('FIREFLIES_API_KEY');
  if (!apiKey) {
    throw new Error('Fireflies API key is not configured. Please contact an administrator.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FIREFLIES_API_TIMEOUT_MS);

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

    // Handle rate limiting
    if (response.status === 429) {
      console.warn(
        `[fireflies] Rate limited (429), backing off ${FIREFLIES_RATE_LIMIT_BACKOFF_MS}ms`,
      );
      await new Promise((r) => setTimeout(r, FIREFLIES_RATE_LIMIT_BACKOFF_MS));
      // Retry once
      const retryRes = await fetch('https://api.fireflies.ai/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(FIREFLIES_API_TIMEOUT_MS),
      });
      if (!retryRes.ok) {
        throw new Error(`Fireflies API error (${retryRes.status})`);
      }
      const retryResult = await retryRes.json();
      if (retryResult.errors) {
        throw new Error(
          `Fireflies GraphQL error: ${retryResult.errors[0]?.message || 'Unknown error'}`,
        );
      }
      return retryResult.data;
    }

    if (!response.ok) {
      throw new Error(`Fireflies API error (${response.status})`);
    }

    const result = await response.json();
    if (result.errors) {
      throw new Error(`Fireflies GraphQL error: ${result.errors[0]?.message || 'Unknown error'}`);
    }

    return result.data;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Fireflies API timed out after ${FIREFLIES_API_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

const GET_TRANSCRIPT_QUERY = `
  query GetTranscript($transcriptId: String!) {
    transcript(id: $transcriptId) {
      id
      title
      transcript_url
      sentences {
        text
        speaker_name
        start_time
        end_time
      }
      summary {
        short_summary
      }
    }
  }
`;

/**
 * Search recent Fireflies transcripts to find one matching a URL.
 * Used when a user pastes a Fireflies URL but we don't have the API transcript ID.
 */
const LIST_TRANSCRIPTS_QUERY = `
  query ListTranscripts($limit: Int, $skip: Int) {
    transcripts(limit: $limit, skip: $skip) {
      id
      title
      transcript_url
    }
  }
`;

async function findFirefliesIdByUrl(url: string): Promise<string | null> {
  // Extract the slug from the URL (e.g., "Orlando-Auto-Body-ext-SourceCo::4IadmUAh0YLzoEv4")
  const slugMatch = url.match(/app\.fireflies\.ai\/view\/([^?#]+)/);
  if (!slugMatch) return null;
  const slug = decodeURIComponent(slugMatch[1]);

  // Search through recent transcripts to find one with matching URL or slug
  let skip = 0;
  const batchSize = 50;
  const maxPages = 6; // Scan up to 300 transcripts

  for (let page = 0; page < maxPages; page++) {
    const data = await firefliesGraphQL(LIST_TRANSCRIPTS_QUERY, {
      limit: batchSize,
      skip,
    });
    const batch = data.transcripts || [];

    for (const t of batch) {
      // Match by transcript_url containing the same slug
      if (t.transcript_url && t.transcript_url.includes(slug)) {
        console.log(`Found Fireflies transcript ID ${t.id} matching URL slug "${slug}"`);
        return t.id;
      }
    }

    if (batch.length < batchSize) break;
    skip += batchSize;
  }

  console.log(`No Fireflies transcript found matching URL slug "${slug}"`);
  return null;
}

/**
 * Fetch full transcript content from Fireflies on-demand.
 *
 * 1. Checks if content is already cached in database
 * 2. If fireflies_transcript_id is missing but URL is a Fireflies URL, searches for it
 * 3. Fetches sentences from Fireflies GraphQL API
 * 4. Builds speaker-labeled transcript text
 * 5. Caches the content for future use
 * 6. Returns the transcript text
 *
 * Called by the enrichment system when transcript content is needed.
 */
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = (await req.json()) as FetchRequest;
    const { transcriptId } = body;

    if (!transcriptId) {
      return new Response(JSON.stringify({ error: 'transcriptId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate transcriptId format (UUID for our DB record IDs)
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(transcriptId)) {
      return new Response(JSON.stringify({ error: 'Invalid transcriptId format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the deal_transcript record (include transcript_url and has_content for handling)
    const { data: dealTranscript, error: fetchError } = await supabase
      .from('deal_transcripts')
      .select('id, fireflies_transcript_id, transcript_text, transcript_url, source, has_content')
      .eq('id', transcriptId)
      .single();

    if (fetchError || !dealTranscript) {
      return new Response(JSON.stringify({ error: 'Transcript not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if this is a Fireflies transcript (either by source or by URL)
    const hasFirefliesUrl =
      dealTranscript.transcript_url &&
      /app\.fireflies\.ai\/view\//i.test(dealTranscript.transcript_url);
    const isFireflies = dealTranscript.source === 'fireflies' || hasFirefliesUrl;

    if (!isFireflies) {
      return new Response(JSON.stringify({ error: 'Not a Fireflies transcript' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle transcripts flagged as having no content (silent/skipped meetings)
    if (dealTranscript.has_content === false) {
      console.log(`Transcript ${transcriptId} has no content (silent/skipped meeting)`);
      return new Response(
        JSON.stringify({
          success: true,
          content:
            '[No transcript available — this call was recorded but audio was not captured. This is typically caused by a Teams audio routing issue.]',
          cached: true,
          transcript_id: transcriptId,
          has_content: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check if already cached (content length > 100 chars indicates real content)
    if (dealTranscript.transcript_text && dealTranscript.transcript_text.length > 100) {
      console.log(`Returning cached content for transcript ${transcriptId}`);
      return new Response(
        JSON.stringify({
          success: true,
          content: dealTranscript.transcript_text,
          cached: true,
          transcript_id: transcriptId,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Resolve the Fireflies transcript ID
    let firefliesId = dealTranscript.fireflies_transcript_id;

    // If no Fireflies ID stored but we have a Fireflies URL, search for it
    if (!firefliesId && hasFirefliesUrl) {
      console.log(
        `No fireflies_transcript_id stored, searching by URL: ${dealTranscript.transcript_url}`,
      );
      firefliesId = await findFirefliesIdByUrl(dealTranscript.transcript_url!);

      if (firefliesId) {
        // Save the resolved ID so we don't have to search again
        await supabase
          .from('deal_transcripts')
          .update({
            fireflies_transcript_id: firefliesId,
            source: 'fireflies', // Ensure source is correct
          })
          .eq('id', transcriptId);
        console.log(`Saved resolved fireflies_transcript_id: ${firefliesId}`);
      }
    }

    if (!firefliesId) {
      throw new Error(
        'Could not resolve Fireflies transcript ID. The transcript may not exist in your Fireflies account.',
      );
    }

    // Fetch full transcript from Fireflies API
    console.log(`Fetching content from Fireflies for transcript ${firefliesId}`);

    let data = await firefliesGraphQL(GET_TRANSCRIPT_QUERY, {
      transcriptId: firefliesId,
    });

    let transcript = data.transcript;

    // Recovery: if firefliesId was a URL slug (e.g. "Meeting-Title::ActualId") rather than
    // an API ID, the API returns null. Try extracting the real ID from after "::" and retry.
    if (!transcript && firefliesId.includes('::')) {
      const slugIdMatch = firefliesId.match(/::([a-zA-Z0-9]+)$/);
      if (slugIdMatch) {
        const extractedId = slugIdMatch[1];
        console.log(`Stored ID looks like a URL slug, retrying with extracted ID: ${extractedId}`);
        data = await firefliesGraphQL(GET_TRANSCRIPT_QUERY, { transcriptId: extractedId });
        transcript = data.transcript;
        if (transcript) {
          // Save the correct API ID so future fetches succeed immediately
          firefliesId = extractedId;
          await supabase
            .from('deal_transcripts')
            .update({ fireflies_transcript_id: extractedId })
            .eq('id', transcriptId);
          console.log(`Fixed fireflies_transcript_id from slug to API ID: ${extractedId}`);
        }
      }
    }

    // Final fallback: if still not found and we have a Fireflies URL, search by URL
    if (!transcript && hasFirefliesUrl) {
      console.log(`API ID lookup failed, falling back to URL search: ${dealTranscript.transcript_url}`);
      const resolvedId = await findFirefliesIdByUrl(dealTranscript.transcript_url!);
      if (resolvedId) {
        data = await firefliesGraphQL(GET_TRANSCRIPT_QUERY, { transcriptId: resolvedId });
        transcript = data.transcript;
        if (transcript) {
          firefliesId = resolvedId;
          await supabase
            .from('deal_transcripts')
            .update({ fireflies_transcript_id: resolvedId })
            .eq('id', transcriptId);
          console.log(`Resolved via URL search, saved API ID: ${resolvedId}`);
        }
      }
    }

    if (!transcript) {
      throw new Error('Transcript not found in Fireflies');
    }

    // Build transcript text from sentences with speaker labels
    let transcriptText = '';

    if (
      transcript.sentences &&
      Array.isArray(transcript.sentences) &&
      transcript.sentences.length > 0
    ) {
      transcriptText = transcript.sentences
        .map((s: { speaker_name?: string; text: string }) => {
          const speaker = s.speaker_name || 'Unknown';
          return `${speaker}: ${s.text}`;
        })
        .join('\n');
    }

    // Fallback: use summary if no sentences available
    if (!transcriptText && transcript.summary?.short_summary) {
      transcriptText = `[Summary only]\n${transcript.summary.short_summary}`;
    }

    // Cap transcript text at 500K characters to prevent DB bloat on very long calls
    const MAX_TRANSCRIPT_TEXT_CHARS = 500_000;
    if (transcriptText && transcriptText.length > MAX_TRANSCRIPT_TEXT_CHARS) {
      transcriptText = transcriptText.substring(0, MAX_TRANSCRIPT_TEXT_CHARS) +
        '\n\n[Transcript truncated at 500K characters]';
    }

    if (!transcriptText || transcriptText.length < 50) {
      console.warn('Fetched content is too short or empty:', transcriptText?.substring(0, 100));

      // Mark as no-content rather than throwing — the recording exists but has no usable transcript
      await supabase
        .from('deal_transcripts')
        .update({
          has_content: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transcriptId);

      return new Response(
        JSON.stringify({
          success: true,
          content:
            '[No transcript available — this call was recorded but audio was not captured. This is typically caused by a Teams audio routing issue.]',
          cached: false,
          transcript_id: transcriptId,
          has_content: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`Fetched ${transcriptText.length} characters from Fireflies`);

    // Cache the content in database
    const { error: updateError } = await supabase
      .from('deal_transcripts')
      .update({
        transcript_text: transcriptText,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', transcriptId);

    if (updateError) {
      console.error('Failed to cache transcript content:', updateError);
      // Don't fail the request - still return the content
    } else {
      console.log(`Cached transcript content for ${transcriptId}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        content: transcriptText,
        cached: false,
        transcript_id: transcriptId,
        length: transcriptText.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Fetch content error:', error);
    // Don't leak internal details (API keys, raw responses) to client
    const safeMessage =
      error instanceof Error && !error.message.includes('API key')
        ? error.message
        : 'Failed to fetch transcript content. Please try again.';
    return new Response(
      JSON.stringify({
        success: false,
        error: safeMessage,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
