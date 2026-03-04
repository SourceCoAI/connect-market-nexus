import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

/**
 * Bulk Sync ALL Fireflies Transcripts
 *
 * Phase 1 (this call): Pulls all metadata, pairs to deals + buyers.
 * Phase 2 (separate calls): Content fetching handled via
 *   fetch-fireflies-content on demand, or by re-calling this function
 *   with { phase: "content" } to backfill missing content in batches.
 *
 * Designed to survive the Supabase edge function timeout (~150s):
 * - Graceful timeout: bails out before hard kill with partial results
 * - Processes transcripts in streaming fashion (no full array in memory)
 * - Caps transcript text at 500K chars to prevent DB bloat
 */

const INTERNAL_DOMAINS = (
  Deno.env.get('INTERNAL_EMAIL_DOMAINS') || 'sourcecodeals.com,captarget.com'
)
  .split(',')
  .map((d: string) => d.trim().toLowerCase())
  .filter(Boolean);

const FIREFLIES_API_TIMEOUT_MS = 15_000;
const BATCH_SIZE = 50;

// Graceful timeout: return results before Supabase kills us
// Supabase Pro = ~150s hard limit, we bail at 120s to be safe
const FUNCTION_TIMEOUT_MS = 120_000;

// Max characters for stored transcript text (500K ≈ a 3-hour call)
const MAX_TRANSCRIPT_TEXT_CHARS = 500_000;

// ---------------------------------------------------------------------------
// Fireflies API helper with progressive backoff
// ---------------------------------------------------------------------------

let currentBackoffMs = 3_000;
const MAX_BACKOFF_MS = 30_000;

async function firefliesGraphQL(query: string, variables?: Record<string, unknown>) {
  const apiKey = Deno.env.get('FIREFLIES_API_KEY');
  if (!apiKey) {
    throw new Error('FIREFLIES_API_KEY is not configured.');
  }

  const doFetch = async () => {
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
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`Fireflies API timeout after ${FIREFLIES_API_TIMEOUT_MS}ms`);
      }
      throw err;
    }
  };

  let response = await doFetch();

  // Progressive backoff on rate limits (up to 3 retries)
  let retries = 0;
  while (response.status === 429 && retries < 3) {
    console.warn(
      `Fireflies rate limit (429), backing off ${currentBackoffMs}ms (retry ${retries + 1}/3)`,
    );
    await new Promise((r) => setTimeout(r, currentBackoffMs));
    currentBackoffMs = Math.min(currentBackoffMs * 2, MAX_BACKOFF_MS);
    retries++;
    response = await doFetch();
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fireflies API error (${response.status}): ${text}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(
      `Fireflies GraphQL error: ${result.errors[0]?.message || JSON.stringify(result.errors)}`,
    );
  }

  // Reset backoff on success
  currentBackoffMs = 3_000;
  return result.data;
}

// ---------------------------------------------------------------------------
// GraphQL queries
// ---------------------------------------------------------------------------

const ALL_TRANSCRIPTS_QUERY = `
  query ListTranscripts($limit: Int, $skip: Int) {
    transcripts(limit: $limit, skip: $skip) {
      id
      title
      date
      duration
      organizer_email
      participants
      meeting_attendees {
        displayName
        email
        name
      }
      transcript_url
      summary {
        short_summary
        keywords
      }
      meeting_info {
        silent_meeting
        summary_status
      }
    }
  }
`;

const GET_TRANSCRIPT_CONTENT_QUERY = `
  query GetTranscript($transcriptId: String!) {
    transcript(id: $transcriptId) {
      id
      sentences {
        text
        speaker_name
      }
      summary {
        short_summary
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FirefliesAttendee {
  displayName?: string;
  email?: string;
  name?: string;
}

interface FirefliesTranscript {
  id: string;
  title?: string;
  date?: number | string;
  duration?: number;
  organizer_email?: string;
  participants?: string[];
  meeting_attendees?: FirefliesAttendee[];
  transcript_url?: string;
  summary?: { short_summary?: string; keywords?: string[] };
  meeting_info?: { silent_meeting?: boolean; summary_status?: string };
}

interface FirefliesSentence {
  text: string;
  speaker_name?: string;
}

function transcriptHasContent(t: FirefliesTranscript): boolean {
  const info = t.meeting_info || {};
  const isSilent = info.silent_meeting === true;
  const isSkipped = info.summary_status === 'skipped';
  const hasSummary = !!t.summary?.short_summary;
  if ((isSilent || isSkipped) && !hasSummary) return false;
  return true;
}

function extractExternalParticipants(
  attendees: FirefliesAttendee[],
): { name: string; email: string }[] {
  if (!Array.isArray(attendees)) return [];
  return attendees
    .filter((a: FirefliesAttendee) => {
      const email = (a.email || '').toLowerCase();
      if (!email) return false;
      return !INTERNAL_DOMAINS.some((domain) => email.endsWith(`@${domain}`));
    })
    .map((a: FirefliesAttendee) => ({
      name: a.displayName || a.name || a.email?.split('@')[0] || 'Unknown',
      email: a.email || '',
    }));
}

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(inc|llc|ltd|corp|corporation|company|co|group|holdings|partners|lp|l\.p\.|l\.l\.c\.)\b\.?/gi,
      '',
    )
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function convertFirefliesDate(date: number | string | null | undefined): string | null {
  if (!date) return null;
  const dateNum = typeof date === 'number' ? date : parseInt(date, 10);
  if (isNaN(dateNum)) return null;
  return new Date(dateNum).toISOString();
}

/**
 * Fetch full transcript text from Fireflies for a single transcript.
 * Caps at MAX_TRANSCRIPT_TEXT_CHARS to prevent DB bloat.
 */
async function fetchTranscriptContent(firefliesId: string): Promise<string | null> {
  try {
    const data = await firefliesGraphQL(GET_TRANSCRIPT_CONTENT_QUERY, {
      transcriptId: firefliesId,
    });

    const transcript = data.transcript;
    if (!transcript) return null;

    let text = '';

    if (
      transcript.sentences &&
      Array.isArray(transcript.sentences) &&
      transcript.sentences.length > 0
    ) {
      text = transcript.sentences
        .map((s: FirefliesSentence) => `${s.speaker_name || 'Unknown'}: ${s.text}`)
        .join('\n');
    }

    if (!text && transcript.summary?.short_summary) {
      text = `[Summary only]\n${transcript.summary.short_summary}`;
    }

    // Cap transcript text to prevent DB bloat
    if (text.length > MAX_TRANSCRIPT_TEXT_CHARS) {
      text =
        text.substring(0, MAX_TRANSCRIPT_TEXT_CHARS) +
        '\n\n[Transcript truncated at 500K characters]';
    }

    return text || null;
  } catch (err) {
    console.error(
      `Failed to fetch content for ${firefliesId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const startTime = Date.now();

  /** Check if we're running out of time */
  function isTimedOut(): boolean {
    return Date.now() - startTime > FUNCTION_TIMEOUT_MS;
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const phase = body.phase || 'all'; // "all", "pair", or "content"
    const fetchContent = phase !== 'pair' && body.fetchContent !== false;
    const contentBatchSize = Math.min(body.contentBatchSize || 5, 15);
    // Allow resuming from a specific page offset
    const startPage = body.startPage || 0;

    console.log(
      `Starting bulk Fireflies sync phase="${phase}" fetchContent=${fetchContent} startPage=${startPage}`,
    );

    // ------------------------------------------------------------------
    // Phase: Content-only backfill
    // ------------------------------------------------------------------
    if (phase === 'content') {
      return await handleContentPhase(supabase, corsHeaders, contentBatchSize, isTimedOut);
    }

    // ------------------------------------------------------------------
    // 1. Load database records for matching
    // ------------------------------------------------------------------

    // a) Buyer contacts: email → buyer_id[]
    const emailToBuyerIds = new Map<string, Set<string>>();
    {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('email, remarketing_buyer_id')
        .eq('contact_type', 'buyer')
        .eq('archived', false)
        .not('email', 'is', null)
        .not('remarketing_buyer_id', 'is', null);

      for (const c of contacts || []) {
        if (!c.email || !c.remarketing_buyer_id) continue;
        const email = c.email.toLowerCase().trim();
        if (!emailToBuyerIds.has(email)) emailToBuyerIds.set(email, new Set());
        emailToBuyerIds.get(email)!.add(c.remarketing_buyer_id);
      }
    }
    console.log(`Loaded ${emailToBuyerIds.size} buyer contact emails`);

    // b) Buyers: company_name → buyer_id
    const nameToBuyerIds = new Map<string, Set<string>>();
    {
      const { data: buyers } = await supabase
        .from('buyers')
        .select('id, company_name, pe_firm_name')
        .eq('archived', false);

      for (const b of buyers || []) {
        for (const name of [b.company_name, b.pe_firm_name]) {
          if (!name || name.length < 3) continue;
          const norm = normalizeCompanyName(name);
          if (!norm) continue;
          if (!nameToBuyerIds.has(norm)) nameToBuyerIds.set(norm, new Set());
          nameToBuyerIds.get(norm)!.add(b.id);
        }
      }
    }
    console.log(`Loaded ${nameToBuyerIds.size} buyer company names`);

    // c) Deal contacts: email → listing_id[]
    const emailToListingIds = new Map<string, Set<string>>();
    const nameToListingIds = new Map<string, Set<string>>();
    {
      const { data: listings } = await supabase
        .from('listings')
        .select('id, main_contact_email, title')
        .is('deleted_at', null);

      for (const l of listings || []) {
        if (l.main_contact_email) {
          const email = l.main_contact_email.toLowerCase().trim();
          if (!emailToListingIds.has(email)) emailToListingIds.set(email, new Set());
          emailToListingIds.get(email)!.add(l.id);
        }
        if (l.title && l.title.length >= 3) {
          const norm = normalizeCompanyName(l.title);
          if (norm) {
            if (!nameToListingIds.has(norm)) nameToListingIds.set(norm, new Set());
            nameToListingIds.get(norm)!.add(l.id);
          }
        }
      }
    }
    console.log(
      `Loaded ${emailToListingIds.size} deal emails, ${nameToListingIds.size} deal names`,
    );

    // d) Pre-load existing links to skip duplicates
    const existingBuyerLinks = new Set<string>();
    {
      const { data } = await supabase
        .from('buyer_transcripts')
        .select('buyer_id, fireflies_transcript_id');
      for (const row of data || []) {
        if (row.fireflies_transcript_id) {
          existingBuyerLinks.add(`${row.buyer_id}:${row.fireflies_transcript_id}`);
        }
      }
    }

    const existingDealLinks = new Set<string>();
    {
      const { data } = await supabase
        .from('deal_transcripts')
        .select('listing_id, fireflies_transcript_id')
        .not('fireflies_transcript_id', 'is', null);
      for (const row of data || []) {
        existingDealLinks.add(`${row.listing_id}:${row.fireflies_transcript_id}`);
      }
    }

    console.log(
      `Pre-loaded ${existingBuyerLinks.size} buyer links, ${existingDealLinks.size} deal links`,
    );

    // ------------------------------------------------------------------
    // 2. Fetch + process Fireflies transcripts page by page
    //    (streaming: process each page then discard to save memory)
    // ------------------------------------------------------------------
    let totalFetched = 0;
    let buyersPaired = 0;
    let dealsPaired = 0;
    let buyersSkipped = 0;
    let dealsSkipped = 0;
    let contentFetched = 0;
    let contentSkipped = 0;
    let contentFailed = 0;
    let unmatched = 0;
    let timedOut = false;
    let lastPage = startPage;
    const errors: string[] = [];

    // Track new deal_transcript IDs that need content fetching
    const needsContent: { dbId: string; firefliesId: string }[] = [];

    let page = startPage;
    while (true) {
      if (isTimedOut()) {
        console.warn(`Approaching timeout at page ${page}, bailing out with partial results`);
        timedOut = true;
        break;
      }

      console.log(`Fetching Fireflies page ${page + 1} (skip=${page * BATCH_SIZE})...`);
      const data = await firefliesGraphQL(ALL_TRANSCRIPTS_QUERY, {
        limit: BATCH_SIZE,
        skip: page * BATCH_SIZE,
      });
      const batch = data.transcripts || [];
      totalFetched += batch.length;
      console.log(`Page ${page + 1}: ${batch.length} transcripts (running total: ${totalFetched})`);

      // Process this batch immediately, then discard
      for (const transcript of batch) {
        if (!transcript.id) continue;

        const externalParticipants = extractExternalParticipants(
          transcript.meeting_attendees || [],
        );
        const participantEmails = externalParticipants
          .map((p) => p.email.toLowerCase())
          .filter(Boolean);

        const hasContent = transcriptHasContent(transcript);
        const title = transcript.title || '';
        const normalizedTitle = normalizeCompanyName(title);
        const callDate = convertFirefliesDate(transcript.date);
        const attendeeEmails = (transcript.meeting_attendees || [])
          .map((a: FirefliesAttendee) => a.email)
          .filter(Boolean);

        let matchedAnything = false;

        // --- Match to buyers ---
        const matchedBuyerIds = new Set<string>();
        const buyerMatchTypes = new Map<string, 'email' | 'keyword'>();

        for (const email of participantEmails) {
          const buyerIds = emailToBuyerIds.get(email);
          if (buyerIds) {
            for (const bid of buyerIds) {
              matchedBuyerIds.add(bid);
              buyerMatchTypes.set(bid, 'email');
            }
          }
        }

        if (normalizedTitle.length >= 3) {
          for (const [companyNorm, buyerIds] of nameToBuyerIds) {
            if (normalizedTitle.includes(companyNorm) || companyNorm.includes(normalizedTitle)) {
              for (const bid of buyerIds) {
                if (!matchedBuyerIds.has(bid)) {
                  matchedBuyerIds.add(bid);
                  buyerMatchTypes.set(bid, 'keyword');
                }
              }
            }
          }
        }

        // Insert buyer links
        for (const buyerId of matchedBuyerIds) {
          const linkKey = `${buyerId}:${transcript.id}`;
          if (existingBuyerLinks.has(linkKey)) {
            buyersSkipped++;
            matchedAnything = true;
            continue;
          }

          try {
            const { error: insertErr } = await supabase.from('buyer_transcripts').insert({
              buyer_id: buyerId,
              fireflies_transcript_id: transcript.id,
              transcript_url: transcript.transcript_url || null,
              title: title || 'Call',
              call_date: callDate,
              participants: transcript.meeting_attendees || [],
              duration_minutes: transcript.duration ? Math.round(transcript.duration) : null,
              summary: transcript.summary?.short_summary || null,
              key_points: transcript.summary?.keywords || [],
            });

            if (insertErr) {
              if (insertErr.code === '23505') {
                buyersSkipped++;
              } else if (errors.length < 50) {
                errors.push(`buyer ${buyerId}: ${insertErr.message}`);
              }
            } else {
              buyersPaired++;
              existingBuyerLinks.add(linkKey);
            }
            matchedAnything = true;
          } catch (e) {
            if (errors.length < 50) {
              errors.push(`buyer ${buyerId}: ${e instanceof Error ? e.message : 'Unknown'}`);
            }
          }
        }

        // --- Match to deals ---
        const matchedListingIds = new Set<string>();
        const dealMatchTypes = new Map<string, 'email' | 'keyword'>();

        for (const email of participantEmails) {
          const listingIds = emailToListingIds.get(email);
          if (listingIds) {
            for (const lid of listingIds) {
              matchedListingIds.add(lid);
              dealMatchTypes.set(lid, 'email');
            }
          }
        }

        if (normalizedTitle.length >= 3) {
          for (const [companyNorm, listingIds] of nameToListingIds) {
            if (normalizedTitle.includes(companyNorm) || companyNorm.includes(normalizedTitle)) {
              for (const lid of listingIds) {
                if (!matchedListingIds.has(lid)) {
                  matchedListingIds.add(lid);
                  dealMatchTypes.set(lid, 'keyword');
                }
              }
            }
          }
        }

        // Insert deal links
        for (const listingId of matchedListingIds) {
          const linkKey = `${listingId}:${transcript.id}`;
          if (existingDealLinks.has(linkKey)) {
            dealsSkipped++;
            matchedAnything = true;
            continue;
          }

          try {
            const { data: inserted, error: insertErr } = await supabase
              .from('deal_transcripts')
              .insert({
                listing_id: listingId,
                fireflies_transcript_id: transcript.id,
                fireflies_meeting_id: transcript.id,
                transcript_url: transcript.transcript_url || null,
                title: title || 'Call',
                call_date: callDate,
                participants: transcript.meeting_attendees || [],
                meeting_attendees: attendeeEmails,
                duration_minutes: transcript.duration ? Math.round(transcript.duration) : null,
                source: 'fireflies',
                auto_linked: true,
                transcript_text: '',
                has_content: hasContent,
                match_type: dealMatchTypes.get(listingId) || 'email',
                external_participants: externalParticipants,
              })
              .select('id')
              .single();

            if (insertErr) {
              if (insertErr.code === '23505') {
                dealsSkipped++;
              } else if (errors.length < 50) {
                errors.push(`deal ${listingId}: ${insertErr.message}`);
              }
            } else {
              dealsPaired++;
              existingDealLinks.add(linkKey);
              if (hasContent && inserted?.id) {
                needsContent.push({
                  dbId: inserted.id,
                  firefliesId: transcript.id,
                });
              }
            }
            matchedAnything = true;
          } catch (e) {
            if (errors.length < 50) {
              errors.push(`deal ${listingId}: ${e instanceof Error ? e.message : 'Unknown'}`);
            }
          }
        }

        if (!matchedAnything) {
          unmatched++;
        }
      }

      lastPage = page;
      if (batch.length < BATCH_SIZE) break; // Last page
      page++;

      // Small delay between pages to be gentle on the API
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(
      `Pairing complete: ${buyersPaired} buyers, ${dealsPaired} deals, ${unmatched} unmatched, ${totalFetched} total`,
    );

    // ------------------------------------------------------------------
    // 3. Fetch content for newly linked deals (if time allows)
    // ------------------------------------------------------------------
    if (fetchContent && needsContent.length > 0 && !isTimedOut()) {
      console.log(`Fetching content for ${needsContent.length} new transcripts...`);

      for (const item of needsContent) {
        if (isTimedOut()) {
          console.warn('Timeout approaching during content fetch, stopping');
          timedOut = true;
          break;
        }

        const text = await fetchTranscriptContent(item.firefliesId);

        if (text && text.length >= 50) {
          const { error: updateErr } = await supabase
            .from('deal_transcripts')
            .update({
              transcript_text: text,
              processed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.dbId);

          if (updateErr) {
            contentFailed++;
          } else {
            contentFetched++;
          }
        } else if (text !== null && text.length < 50) {
          await supabase
            .from('deal_transcripts')
            .update({
              has_content: false,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.dbId);
          contentSkipped++;
        } else {
          contentFailed++;
        }

        // Small delay between fetches
        await new Promise((r) => setTimeout(r, 300));
      }

      console.log(
        `Content: ${contentFetched} fetched, ${contentSkipped} empty, ${contentFailed} failed`,
      );
    }

    // ------------------------------------------------------------------
    // 4. Return results
    // ------------------------------------------------------------------
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const result = {
      success: true,
      fireflies_total: totalFetched,
      pairing: {
        buyers_paired: buyersPaired,
        buyers_skipped: buyersSkipped,
        deals_paired: dealsPaired,
        deals_skipped: dealsSkipped,
        unmatched,
      },
      content: fetchContent
        ? {
            fetched: contentFetched,
            skipped_empty: contentSkipped,
            failed: contentFailed,
            total_queued: needsContent.length,
          }
        : 'skipped (phase=pair)',
      elapsed_seconds: elapsed,
      timed_out: timedOut,
      resume_from_page: timedOut ? lastPage + 1 : undefined,
      content_still_needed: needsContent.length - contentFetched - contentSkipped - contentFailed,
      errors: errors.length > 0 ? errors.slice(0, 50) : undefined,
    };

    console.log('Bulk sync complete:', JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Bulk sync error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        elapsed_seconds: Math.round((Date.now() - startTime) / 1000),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

// ---------------------------------------------------------------------------
// Content-only phase: backfill missing transcript text
// ---------------------------------------------------------------------------
async function handleContentPhase(
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>,
  batchSize: number,
  isTimedOut: () => boolean,
): Promise<Response> {
  const startTime = Date.now();

  // Find deal_transcripts that are missing content
  const { data: missing, error: queryErr } = await supabase
    .from('deal_transcripts')
    .select('id, fireflies_transcript_id')
    .not('fireflies_transcript_id', 'is', null)
    .eq('transcript_text', '')
    .eq('has_content', true)
    .limit(200); // Cap per run

  if (queryErr) {
    return new Response(JSON.stringify({ success: false, error: queryErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const items = (missing || []).filter(
    (r: { id: string; fireflies_transcript_id: string | null }) => r.fireflies_transcript_id,
  );
  console.log(`Content phase: ${items.length} transcripts need content`);

  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    if (isTimedOut()) {
      console.warn('Timeout approaching, stopping content phase');
      break;
    }

    const text = await fetchTranscriptContent(item.fireflies_transcript_id);

    if (text && text.length >= 50) {
      const { error: updateErr } = await supabase
        .from('deal_transcripts')
        .update({
          transcript_text: text,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (updateErr) {
        failed++;
      } else {
        fetched++;
      }
    } else if (text !== null && text.length < 50) {
      await supabase
        .from('deal_transcripts')
        .update({ has_content: false, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      skipped++;
    } else {
      failed++;
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const remaining = items.length - fetched - skipped - failed;

  return new Response(
    JSON.stringify({
      success: true,
      phase: 'content',
      fetched,
      skipped_empty: skipped,
      failed,
      remaining,
      elapsed_seconds: elapsed,
      note:
        remaining > 0
          ? `${remaining} transcripts still need content. Call again with { phase: "content" } to continue.`
          : 'All transcript content is up to date.',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
