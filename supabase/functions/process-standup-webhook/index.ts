/* eslint-disable no-console */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
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
 *
 * Improvements:
 * - Rate limiting per source IP (max 30 requests/min)
 * - Correlation ID for end-to-end tracing
 * - Delayed processing option for partial transcripts
 * - Structured logging with correlation context
 */

const STANDUP_TITLE_TAG = '<ds>';
const FIREFLIES_API_TIMEOUT_MS = 10_000;
const RATE_LIMIT_MAX_PER_MINUTE = 30;
const DELAYED_PROCESSING_MINUTES = 5;

// ─── Structured Logger ───

function createLogger(correlationId: string) {
  const ctx = { correlationId };
  return {
    info: (msg: string, data?: Record<string, unknown>) =>
      console.log(
        JSON.stringify({ level: 'info', msg, ...ctx, ...data, ts: new Date().toISOString() }),
      ),
    warn: (msg: string, data?: Record<string, unknown>) =>
      console.warn(
        JSON.stringify({ level: 'warn', msg, ...ctx, ...data, ts: new Date().toISOString() }),
      ),
    error: (msg: string, data?: Record<string, unknown>) =>
      console.error(
        JSON.stringify({ level: 'error', msg, ...ctx, ...data, ts: new Date().toISOString() }),
      ),
  };
}

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

/** Extract source IP from request headers */
function getSourceIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** Check rate limit: returns true if request should be allowed */
async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  sourceIp: string,
  transcriptId: string,
): Promise<{ allowed: boolean; count: number }> {
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();

  // Record this request
  await supabase.from('webhook_rate_limit').insert({
    source_ip: sourceIp,
    transcript_id: transcriptId,
  });

  // Count recent requests from this IP
  const { count } = await supabase
    .from('webhook_rate_limit')
    .select('*', { count: 'exact', head: true })
    .eq('source_ip', sourceIp)
    .gte('requested_at', oneMinuteAgo);

  return {
    allowed: (count ?? 0) <= RATE_LIMIT_MAX_PER_MINUTE,
    count: count ?? 0,
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  // Generate or use existing correlation ID for end-to-end tracing
  const correlationId =
    req.headers.get('x-correlation-id') || `wh-${crypto.randomUUID().slice(0, 12)}`;
  const log = createLogger(correlationId);

  // Hoist webhookLogId so the catch block can mark failures for retry
  let webhookLogId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate request size to prevent oversized payloads
    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > 1_000_000) {
      log.warn('Payload too large', { contentLength });
      return new Response(JSON.stringify({ error: 'Payload too large' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Optional webhook secret verification (if FIREFLIES_WEBHOOK_SECRET is configured)
    const webhookSecret = Deno.env.get('FIREFLIES_WEBHOOK_SECRET');
    if (webhookSecret) {
      const signature = req.headers.get('x-webhook-secret') || req.headers.get('authorization');
      if (!signature || !signature.includes(webhookSecret)) {
        log.warn('Webhook request failed secret verification');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const body = await req.json();
    log.info('Received Fireflies webhook', {
      payload_preview: JSON.stringify(body).slice(0, 300),
    });

    // Fireflies webhook payload
    const transcriptId = body.data?.transcript_id || body.transcript_id || body.id;
    let meetingTitle = body.data?.title || body.title || '';

    if (!transcriptId) {
      log.warn('No transcript_id in webhook payload');
      return new Response(JSON.stringify({ error: 'No transcript_id in webhook payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate transcript ID format to prevent injection
    if (
      typeof transcriptId !== 'string' ||
      transcriptId.length > 200 ||
      !/^[\w-]+$/.test(transcriptId)
    ) {
      log.warn('Invalid transcript_id format', { transcriptId });
      return new Response(JSON.stringify({ error: 'Invalid transcript_id format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting (skip for retries)
    const isRetry = !!req.headers.get('x-retry-webhook-log-id');
    if (!isRetry) {
      const sourceIp = getSourceIp(req);
      const { allowed, count } = await checkRateLimit(supabase, sourceIp, transcriptId);
      if (!allowed) {
        log.warn('Rate limit exceeded', { sourceIp, count, limit: RATE_LIMIT_MAX_PER_MINUTE });
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded', retry_after_seconds: 60 }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'Retry-After': '60',
            },
          },
        );
      }
    }

    // Log the webhook event for observability and retry support.
    // If this is a retry, update the existing log entry instead.
    const retryLogId = req.headers.get('x-retry-webhook-log-id');
    webhookLogId = retryLogId;

    if (retryLogId) {
      await supabase
        .from('fireflies_webhook_log')
        .update({ status: 'processing', correlation_id: correlationId })
        .eq('id', retryLogId);
    } else {
      const { data: logEntry } = await supabase
        .from('fireflies_webhook_log')
        .insert({
          transcript_id: transcriptId,
          event_type: body.data?.event_type || 'transcription_completed',
          payload: body,
          status: 'processing',
          correlation_id: correlationId,
        })
        .select('id')
        .single();
      webhookLogId = logEntry?.id ?? null;
    }

    // If the webhook payload doesn't include the title (or it's empty),
    // fetch it from the Fireflies API so we can check for the <ds> tag.
    if (!meetingTitle) {
      log.info('No title in webhook payload, fetching from Fireflies API');
      meetingTitle = await fetchTitleFromFireflies(transcriptId);
      log.info('Fetched title from API', { title: meetingTitle });
    }

    // Log standup tag status (informational — no longer required)
    const isTaggedStandup = hasStandupTag(meetingTitle);
    if (isTaggedStandup) {
      log.info('Meeting has <ds> standup tag', { title: meetingTitle });
    }

    // Check if we've already processed this transcript
    const { data: existing } = await supabase
      .from('standup_meetings')
      .select('id')
      .eq('fireflies_transcript_id', transcriptId)
      .maybeSingle();

    if (existing) {
      log.info('Transcript already processed', {
        transcriptId,
        meetingId: existing.id,
      });

      // Mark webhook log as success (already-processed is a valid outcome)
      if (webhookLogId) {
        await supabase
          .from('fireflies_webhook_log')
          .update({ status: 'success', processed_at: new Date().toISOString() })
          .eq('id', webhookLogId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: 'Already processed',
          meeting_id: existing.id,
          correlation_id: correlationId,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Delayed processing: if the webhook event type suggests the transcript
    // is still being processed, delay by DELAYED_PROCESSING_MINUTES
    const eventType = body.data?.event_type || '';
    const isPartialTranscript =
      eventType === 'transcription_in_progress' || body.data?.is_partial === true;

    if (isPartialTranscript && !isRetry) {
      const processAfter = new Date(Date.now() + DELAYED_PROCESSING_MINUTES * 60_000).toISOString();

      log.info('Delaying processing for partial transcript', {
        transcriptId,
        processAfter,
        delayMinutes: DELAYED_PROCESSING_MINUTES,
      });

      if (webhookLogId) {
        await supabase
          .from('fireflies_webhook_log')
          .update({
            status: 'delayed',
            process_after: processAfter,
            delay_reason: `Partial transcript — delayed ${DELAYED_PROCESSING_MINUTES}min for completion`,
          })
          .eq('id', webhookLogId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          delayed: true,
          process_after: processAfter,
          reason: 'Partial transcript — processing delayed for completion',
          correlation_id: correlationId,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Trigger extraction
    // Auto-detect: use Fireflies-native mode when Gemini key is not configured
    const hasGeminiKey = !!(Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GEMINI_API_KEY'));
    const useFirefliesActions = !hasGeminiKey;
    log.info('Processing meeting', {
      title: meetingTitle,
      transcriptId,
      mode: useFirefliesActions ? 'fireflies-native' : 'ai',
      isTaggedStandup,
    });

    const extractResponse = await fetch(`${supabaseUrl}/functions/v1/extract-standup-tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseKey}`,
        'X-Correlation-Id': correlationId,
        'X-Webhook-Log-Id': webhookLogId || '',
      },
      body: JSON.stringify({
        fireflies_transcript_id: transcriptId,
        meeting_title: meetingTitle,
        use_fireflies_actions: useFirefliesActions,
      }),
    });

    const extractResult = await extractResponse.json();

    if (!extractResponse.ok) {
      log.error('Extraction failed', { error: extractResult.error });

      // Mark webhook log as failed for retry
      if (webhookLogId) {
        await supabase
          .from('fireflies_webhook_log')
          .update({
            status: 'failed',
            last_error: extractResult.error || 'Extraction failed',
          })
          .eq('id', webhookLogId);
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: extractResult.error || 'Extraction failed',
          correlation_id: correlationId,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Mark webhook log as success
    if (webhookLogId) {
      await supabase
        .from('fireflies_webhook_log')
        .update({ status: 'success', processed_at: new Date().toISOString() })
        .eq('id', webhookLogId);
    }

    log.info('Extraction complete', {
      meetingId: extractResult.meeting_id,
      tasksExtracted: extractResult.tasks_extracted,
      tasksDeduplicated: extractResult.tasks_deduplicated,
      contactsMatched: extractResult.contacts_matched,
    });

    return new Response(
      JSON.stringify({
        success: true,
        meeting_id: extractResult.meeting_id,
        tasks_extracted: extractResult.tasks_extracted,
        tasks_deduplicated: extractResult.tasks_deduplicated,
        contacts_matched: extractResult.contacts_matched,
        correlation_id: correlationId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    log.error('Webhook processing error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Best-effort: mark webhook log as failed so retry cron can pick it up
    if (typeof webhookLogId === 'string' && webhookLogId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);
        await sb
          .from('fireflies_webhook_log')
          .update({
            status: 'failed',
            last_error: error instanceof Error ? error.message : 'Unknown error',
          })
          .eq('id', webhookLogId);
      } catch (logErr) {
        console.error('Failed to update webhook log on error:', logErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlation_id: correlationId,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
