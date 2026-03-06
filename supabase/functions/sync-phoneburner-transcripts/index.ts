/**
 * EDGE FUNCTION: sync-phoneburner-transcripts
 *
 * PURPOSE:
 *   Syncs call transcripts from PhoneBurner contact_activities into the unified
 *   deal_transcripts table. This is a stable, standalone function decoupled from
 *   any UI components — it can be called on a cron schedule, from webhooks,
 *   or manually to backfill missed transcripts.
 *
 * TRIGGERS:
 *   HTTP POST request
 *   Body: { listingId?: string, backfillAll?: boolean, limit?: number }
 *
 * DATABASE TABLES TOUCHED:
 *   READ:  contact_activities (PhoneBurner call data with transcripts)
 *   READ:  deal_transcripts (dedup check)
 *   WRITE: deal_transcripts
 *
 * LAST UPDATED: 2026-03-06
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { listingId, backfillAll = false, limit = 100 } = await req.json();

    // Build query: find PhoneBurner call_completed activities with transcripts
    let query = supabase
      .from('contact_activities')
      .select('id, phoneburner_call_id, call_transcript, listing_id, call_started_at, call_duration_seconds, user_name, contact_email, disposition_label, recording_url_public, recording_url')
      .eq('source_system', 'phoneburner')
      .eq('activity_type', 'call_completed')
      .not('call_transcript', 'is', null)
      .not('listing_id', 'is', null)
      .order('call_started_at', { ascending: false })
      .limit(limit);

    if (listingId && !backfillAll) {
      query = query.eq('listing_id', listingId);
    }

    const { data: activities, error: fetchError } = await query;

    if (fetchError) {
      console.error('[sync-phoneburner-transcripts] Failed to fetch activities:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch activities', detail: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!activities || activities.length === 0) {
      return new Response(
        JSON.stringify({ synced: 0, skipped: 0, message: 'No PhoneBurner transcripts to sync' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[sync-phoneburner-transcripts] Found ${activities.length} activities with transcripts`);

    // Get existing phoneburner_call_ids to avoid duplicates
    const callIds = activities
      .map((a) => a.phoneburner_call_id)
      .filter(Boolean);

    const { data: existing } = await supabase
      .from('deal_transcripts')
      .select('phoneburner_call_id')
      .in('phoneburner_call_id', callIds);

    const existingCallIds = new Set((existing || []).map((e) => e.phoneburner_call_id));

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const activity of activities) {
      if (!activity.phoneburner_call_id || existingCallIds.has(activity.phoneburner_call_id)) {
        skipped++;
        continue;
      }

      const transcript = activity.call_transcript as string;
      if (!transcript || transcript.trim().length === 0) {
        skipped++;
        continue;
      }

      const title = `PhoneBurner Call${activity.disposition_label ? ` (${activity.disposition_label})` : ''}`;

      const { error: insertError } = await supabase.from('deal_transcripts').insert({
        listing_id: activity.listing_id,
        transcript_text: transcript,
        source: 'phoneburner',
        title,
        call_date: activity.call_started_at,
        duration_minutes: activity.call_duration_seconds
          ? Math.round(activity.call_duration_seconds / 60)
          : null,
        phoneburner_call_id: activity.phoneburner_call_id,
        contact_activity_id: activity.id,
        recording_url: activity.recording_url_public || activity.recording_url || null,
        has_content: true,
        auto_linked: true,
      });

      if (insertError) {
        if (insertError.code === '23505') {
          skipped++;
        } else {
          console.error(
            `[sync-phoneburner-transcripts] Insert failed for call ${activity.phoneburner_call_id}:`,
            insertError,
          );
          errors.push(`call ${activity.phoneburner_call_id}: ${insertError.message}`);
        }
      } else {
        synced++;
      }
    }

    console.log(
      `[sync-phoneburner-transcripts] Done: synced=${synced}, skipped=${skipped}, errors=${errors.length}`,
    );

    return new Response(
      JSON.stringify({ synced, skipped, errors: errors.slice(0, 10), total: activities.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[sync-phoneburner-transcripts] Error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
