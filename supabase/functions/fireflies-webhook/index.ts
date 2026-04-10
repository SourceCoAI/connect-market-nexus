/**
 * fireflies-webhook
 *
 * Receives Fireflies webhook events (transcription_complete), fetches the full
 * transcript, runs matching logic to link to deals + buyers, and triggers
 * auto-summarize-transcript for AI analysis.
 *
 * This provides near-real-time transcript processing vs the 30-minute cron.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response-helpers.ts';

const FIREFLIES_API_URL = 'https://api.fireflies.ai/graphql';
const INTERNAL_DOMAINS = ['sourcecodeals.com', 'captarget.com', 'sourcecoai.com'];

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|company|group|holdings|partners|lp|gp)\b\.?/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractExternalParticipants(attendees: any[]): Array<{ email: string; name: string }> {
  return (attendees || [])
    .filter((a: any) => {
      const email = (a.email || '').toLowerCase();
      return email && !INTERNAL_DOMAINS.some((d) => email.endsWith(`@${d}`));
    })
    .map((a: any) => ({
      email: (a.email || '').toLowerCase(),
      name: a.displayName || a.name || '',
    }));
}

async function fetchTranscriptFromFireflies(transcriptId: string, apiKey: string): Promise<any> {
  const query = `
    query GetTranscript($id: String!) {
      transcript(id: $id) {
        id
        title
        date
        duration
        organizer_email
        participants
        summary {
          overview
          action_items
          keywords
        }
        sentences {
          speaker_name
          text
        }
        meeting_attendees {
          email
          displayName
          name
        }
      }
    }
  `;

  const resp = await fetch(FIREFLIES_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { id: transcriptId } }),
  });

  if (!resp.ok) {
    throw new Error(`Fireflies API error: ${resp.status}`);
  }

  const data = await resp.json();
  return data?.data?.transcript || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, corsHeaders);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const payload = await req.json();
    const eventType = payload.event_type || payload.eventType || payload.type;
    const transcriptId =
      payload.transcript_id || payload.transcriptId || payload.data?.transcript_id;

    console.log(`[fireflies-webhook] Event: ${eventType}, transcript: ${transcriptId}`);

    // Only process transcription_complete events
    if (eventType !== 'Transcription completed' && eventType !== 'transcription_complete') {
      return successResponse({ skipped: true, reason: `Unhandled event: ${eventType}` }, corsHeaders);
    }

    if (!transcriptId) {
      return errorResponse('No transcript_id in payload', 400, corsHeaders);
    }

    // Check if already processed
    const { data: existingDeal } = await (supabase as any)
      .from('deal_transcripts')
      .select('id')
      .eq('fireflies_transcript_id', transcriptId)
      .limit(1)
      .maybeSingle();

    if (existingDeal) {
      return successResponse({ skipped: true, reason: 'already_linked' }, corsHeaders);
    }

    // Fetch full transcript from Fireflies
    const apiKey = Deno.env.get('FIREFLIES_API_KEY');
    if (!apiKey) {
      return errorResponse('FIREFLIES_API_KEY not configured', 500, corsHeaders);
    }

    const transcript = await fetchTranscriptFromFireflies(transcriptId, apiKey);
    if (!transcript) {
      return errorResponse('Transcript not found in Fireflies', 404, corsHeaders);
    }

    const attendees = transcript.meeting_attendees || [];
    const externalParticipants = extractExternalParticipants(attendees);
    const externalEmails = externalParticipants.map((p) => p.email).filter(Boolean);
    const normalizedTitle = normalizeCompanyName(transcript.title || '');

    // Build transcript text from sentences
    const transcriptText = (transcript.sentences || [])
      .map((s: any) => `${s.speaker_name || 'Unknown'}: ${s.text}`)
      .join('\n')
      .substring(0, 500000);

    const hasContent = transcriptText.length >= 50;
    const durationMinutes = transcript.duration ? Math.round(transcript.duration / 60) : null;

    // ── Phase 1: Email matching for buyers ──
    const matchedBuyerIds = new Set<string>();
    let buyerMatchType = 'email';

    if (externalEmails.length > 0) {
      const { data: buyerContacts } = await supabase
        .from('contacts')
        .select('remarketing_buyer_id')
        .in('email', externalEmails)
        .not('remarketing_buyer_id', 'is', null)
        .eq('archived', false);

      for (const c of buyerContacts || []) {
        if (c.remarketing_buyer_id) matchedBuyerIds.add(c.remarketing_buyer_id);
      }
    }

    // ── Phase 2: Company name matching for buyers (fallback) ──
    if (matchedBuyerIds.size === 0 && normalizedTitle.length >= 3) {
      const { data: buyers } = await (supabase as any)
        .from('remarketing_buyers')
        .select('id, company_name')
        .not('company_name', 'is', null)
        .limit(1000);

      for (const b of buyers || []) {
        const companyNorm = normalizeCompanyName(b.company_name || '');
        if (companyNorm.length >= 3 && (normalizedTitle.includes(companyNorm) || companyNorm.includes(normalizedTitle))) {
          matchedBuyerIds.add(b.id);
          buyerMatchType = 'keyword';
        }
      }
    }

    // ── Phase 1: Email matching for deals ──
    const matchedListingIds = new Set<string>();
    let dealMatchType = 'email';

    if (externalEmails.length > 0) {
      const { data: listings } = await (supabase as any)
        .from('listings')
        .select('id')
        .in('main_contact_email', externalEmails)
        .in('status', ['active', 'new', 'under_review']);

      for (const l of listings || []) {
        matchedListingIds.add(l.id);
      }
    }

    // ── Phase 2: Company name matching for deals (fallback) ──
    if (matchedListingIds.size === 0 && normalizedTitle.length >= 3) {
      const { data: listings } = await (supabase as any)
        .from('listings')
        .select('id, title')
        .in('status', ['active', 'new', 'under_review'])
        .limit(1000);

      for (const l of listings || []) {
        const listingNorm = normalizeCompanyName(l.title || '');
        if (listingNorm.length >= 3 && (normalizedTitle.includes(listingNorm) || listingNorm.includes(normalizedTitle))) {
          matchedListingIds.add(l.id);
          dealMatchType = 'keyword';
        }
      }
    }

    // ── Link to buyer_transcripts ──
    let buyerLinked = 0;
    for (const buyerId of matchedBuyerIds) {
      try {
        await (supabase as any).from('buyer_transcripts').upsert(
          {
            buyer_id: buyerId,
            fireflies_transcript_id: transcriptId,
            title: transcript.title || 'Untitled',
            call_date: transcript.date ? new Date(transcript.date).toISOString() : null,
            participants: attendees,
            duration_minutes: durationMinutes,
            summary: transcript.summary?.overview || null,
            linked_at: new Date().toISOString(),
            linked_by: 'fireflies_webhook',
          },
          { onConflict: 'buyer_id,fireflies_transcript_id', ignoreDuplicates: true },
        );
        buyerLinked++;
      } catch (e) {
        console.error(`[fireflies-webhook] Failed to link buyer ${buyerId}:`, e);
      }
    }

    // ── Link to deal_transcripts ──
    let dealLinked = 0;
    const linkedTranscriptIds: string[] = [];
    for (const listingId of matchedListingIds) {
      try {
        const { data: inserted } = await (supabase as any)
          .from('deal_transcripts')
          .upsert(
            {
              listing_id: listingId,
              fireflies_transcript_id: transcriptId,
              title: transcript.title || 'Untitled',
              call_date: transcript.date ? new Date(transcript.date).toISOString() : null,
              participants: attendees,
              meeting_attendees: attendees.map((a: any) => a.email).filter(Boolean),
              duration_minutes: durationMinutes,
              transcript_text: transcriptText,
              has_content: hasContent,
              source: 'fireflies',
              auto_linked: true,
              match_type: dealMatchType,
              external_participants: externalParticipants,
            },
            { onConflict: 'listing_id,fireflies_transcript_id', ignoreDuplicates: true },
          )
          .select('id');

        if (inserted?.[0]?.id) {
          linkedTranscriptIds.push(inserted[0].id);
          dealLinked++;
        }
      } catch (e) {
        console.error(`[fireflies-webhook] Failed to link deal ${listingId}:`, e);
      }
    }

    // ── Trigger auto-summarize for transcripts with content ──
    let summarizeTriggered = 0;
    if (hasContent) {
      for (const dtId of linkedTranscriptIds) {
        try {
          await supabase.functions.invoke('auto-summarize-transcript', {
            body: { transcript_id: dtId },
          });
          summarizeTriggered++;
        } catch (e) {
          console.error(`[fireflies-webhook] Failed to trigger summarize for ${dtId}:`, e);
        }
      }
    }

    console.log(
      `[fireflies-webhook] Processed ${transcriptId}: ${buyerLinked} buyers, ${dealLinked} deals linked, ${summarizeTriggered} summaries triggered`,
    );

    return successResponse(
      {
        processed: true,
        transcript_id: transcriptId,
        title: transcript.title,
        buyer_links: buyerLinked,
        deal_links: dealLinked,
        summaries_triggered: summarizeTriggered,
        has_content: hasContent,
      },
      corsHeaders,
    );
  } catch (err) {
    console.error('[fireflies-webhook] Error:', err);
    return errorResponse(`Webhook error: ${(err as Error).message}`, 500, corsHeaders);
  }
});
