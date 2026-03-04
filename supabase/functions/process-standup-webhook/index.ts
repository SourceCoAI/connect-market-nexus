/* eslint-disable no-console */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

/**
 * Fireflies webhook handler for meeting task extraction.
 *
 * When Fireflies finishes processing a meeting, it sends a webhook.
 * This function triggers the extract-standup-tasks function to pull
 * actionable tasks from the meeting transcript.
 *
 * All meetings are processed. Meetings tagged with `<ds>` in the title
 * are logged as known standup meetings but the tag is NOT required.
 */

const STANDUP_TITLE_TAG = '<ds>';
const FIREFLIES_API_TIMEOUT_MS = 10_000;

/** Fetch the transcript title from Fireflies API as a fallback */
async function fetchTitleFromFireflies(transcriptId: string): Promise<string> {
  const apiKey = Deno.env.get('FIREFLIES_API_KEY');
  if (!apiKey) {
    console.warn('FIREFLIES_API_KEY not configured, cannot fetch title');
    return '';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FIREFLIES_API_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: `query GetTitle($id: String!) { transcript(id: $id) { title } }`,
        variables: { id: transcriptId },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return '';
    const result = await response.json();
    return result.data?.transcript?.title || '';
  } catch {
    return '';
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Check if a title contains the standup tag, including HTML-encoded variants */
function hasStandupTag(title: string): boolean {
  const lower = title.toLowerCase();
  return (
    lower.includes(STANDUP_TITLE_TAG) || lower.includes('&lt;ds&gt;') || lower.includes('%3cds%3e')
  );
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

    const body = await req.json();
    console.log('Received Fireflies webhook:', JSON.stringify(body).slice(0, 500));

    // Fireflies webhook payload
    const transcriptId = body.data?.transcript_id || body.transcript_id || body.id;
    let meetingTitle = body.data?.title || body.title || '';

    if (!transcriptId) {
      return new Response(JSON.stringify({ error: 'No transcript_id in webhook payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If the webhook payload doesn't include the title (or it's empty),
    // fetch it from the Fireflies API so we can check for the <ds> tag.
    if (!meetingTitle) {
      console.log(`No title in webhook payload, fetching from Fireflies API...`);
      meetingTitle = await fetchTitleFromFireflies(transcriptId);
      console.log(`Fetched title from API: "${meetingTitle}"`);
    }

    // Log standup tag status (informational — no longer required)
    const isTaggedStandup = hasStandupTag(meetingTitle);
    if (isTaggedStandup) {
      console.log(`Meeting "${meetingTitle}" has <ds> standup tag`);
    }

    // Check if we've already processed this transcript
    const { data: existing } = await supabase
      .from('standup_meetings')
      .select('id')
      .eq('fireflies_transcript_id', transcriptId)
      .maybeSingle();

    if (existing) {
      console.log(`Transcript ${transcriptId} already processed as meeting ${existing.id}`);
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: 'Already processed',
          meeting_id: existing.id,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Trigger extraction
    // Auto-detect: use Fireflies-native mode when Gemini key is not configured
    const hasGeminiKey = !!(Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GEMINI_API_KEY'));
    const useFirefliesActions = !hasGeminiKey;
    console.log(
      `Processing meeting: "${meetingTitle}" (${transcriptId}) [mode: ${useFirefliesActions ? 'fireflies-native' : 'ai'}${isTaggedStandup ? ', tagged standup' : ''}]`,
    );

    const extractResponse = await fetch(`${supabaseUrl}/functions/v1/extract-standup-tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        fireflies_transcript_id: transcriptId,
        meeting_title: meetingTitle,
        use_fireflies_actions: useFirefliesActions,
      }),
    });

    const extractResult = await extractResponse.json();

    if (!extractResponse.ok) {
      console.error('Extraction failed:', extractResult);
      return new Response(
        JSON.stringify({
          success: false,
          error: extractResult.error || 'Extraction failed',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('Extraction complete:', extractResult);

    return new Response(
      JSON.stringify({
        success: true,
        meeting_id: extractResult.meeting_id,
        tasks_extracted: extractResult.tasks_extracted,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Webhook processing error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
