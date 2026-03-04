/**
 * EDGE FUNCTION: sync-fireflies-transcripts
 *
 * PURPOSE:
 *   Syncs call transcripts from Fireflies.ai for a given deal. Searches by
 *   participant emails (with individual + combined queries) and falls back to
 *   company name keyword search. Filters out silent/skipped meetings, extracts
 *   external participants, deduplicates results, and upserts into deal_transcripts.
 *
 * TRIGGERS:
 *   HTTP POST request (from UI deal enrichment flow)
 *   Body: { listingId, contactEmails[], contactEmail?, companyName?, limit? }
 *
 * DATABASE TABLES TOUCHED:
 *   READ:  deal_transcripts (dedup check)
 *   WRITE: deal_transcripts
 *
 * EXTERNAL APIS:
 *   Fireflies.ai GraphQL API (transcript search by participant and keyword)
 *
 * LAST UPDATED: 2026-02-26
 * AUDIT REF: CTO Audit February 2026
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

/** Internal email domains to filter out when extracting external participants.
 * Configure via INTERNAL_EMAIL_DOMAINS env var (comma-separated) for flexibility.
 */
const INTERNAL_DOMAINS = (
  Deno.env.get('INTERNAL_EMAIL_DOMAINS') || 'sourcecodeals.com,captarget.com'
)
  .split(',')
  .map((d: string) => d.trim().toLowerCase())
  .filter(Boolean);

const FIREFLIES_API_TIMEOUT_MS = 15_000;
const FIREFLIES_RATE_LIMIT_BACKOFF_MS = 3_000;

interface SyncRequest {
  listingId: string;
  contactEmails: string[]; // array of contact emails (new)
  contactEmail?: string; // legacy single email — still supported
  companyName?: string; // for fallback keyword search
  limit?: number;
}

/**
 * Call the Fireflies GraphQL API directly.
 * Requires FIREFLIES_API_KEY set as a Supabase secret.
 * Includes timeout enforcement and 429 rate-limit retry.
 */
async function firefliesGraphQL(query: string, variables?: Record<string, unknown>) {
  const apiKey = Deno.env.get('FIREFLIES_API_KEY');
  if (!apiKey) {
    throw new Error(
      'FIREFLIES_API_KEY is not configured. Add it as a Supabase secret: ' +
        'supabase secrets set FIREFLIES_API_KEY=your_key',
    );
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

  // Handle rate limiting: back off and retry once
  if (response.status === 429) {
    console.warn(
      `Fireflies rate limit hit (429), backing off ${FIREFLIES_RATE_LIMIT_BACKOFF_MS}ms...`,
    );
    await new Promise((r) => setTimeout(r, FIREFLIES_RATE_LIMIT_BACKOFF_MS));
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

  return result.data;
}

/**
 * Use the Fireflies native `participants` filter to find transcripts.
 * Now also fetches meeting_info for silent_meeting detection.
 */
const PARTICIPANT_SEARCH_QUERY = `
  query SearchByParticipant($participants: [String!], $limit: Int, $skip: Int) {
    transcripts(participants: $participants, limit: $limit, skip: $skip) {
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

const KEYWORD_SEARCH_QUERY = `
  query SearchByKeyword($keyword: String!, $limit: Int, $skip: Int) {
    transcripts(keyword: $keyword, limit: $limit, skip: $skip) {
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

/**
 * Check if a transcript has actual content (not a silent/skipped meeting).
 */
interface FirefliesTranscript {
  id: string;
  title?: string;
  date?: number | string;
  duration?: number;
  organizer_email?: string;
  participants?: string[];
  meeting_attendees?: { displayName?: string; email?: string; name?: string }[];
  transcript_url?: string;
  summary?: { short_summary?: string; keywords?: string[] };
  meeting_info?: { silent_meeting?: boolean; summary_status?: string };
}

function transcriptHasContent(t: FirefliesTranscript): boolean {
  const info = t.meeting_info || {};
  const isSilent = info.silent_meeting === true;
  const isSkipped = info.summary_status === 'skipped';
  const hasSummary = !!t.summary?.short_summary;

  if ((isSilent || isSkipped) && !hasSummary) {
    return false;
  }
  return true;
}

/**
 * Extract external participants — filters out internal domains.
 */
function extractExternalParticipants(
  attendees: { displayName?: string; email?: string; name?: string }[],
): { name: string; email: string }[] {
  if (!Array.isArray(attendees)) return [];

  return attendees
    .filter((a) => {
      const email = (a.email || '').toLowerCase();
      if (!email) return false;
      return !INTERNAL_DOMAINS.some((domain) => email.endsWith(`@${domain}`));
    })
    .map((a) => ({
      name: a.displayName || a.name || a.email?.split('@')[0] || 'Unknown',
      email: a.email || '',
    }));
}

/**
 * Paginated participant email search helper.
 */
async function paginatedSearchEmails(
  emails: string[],
  batchSize: number,
  maxPages: number,
): Promise<FirefliesTranscript[]> {
  const results: FirefliesTranscript[] = [];
  let skip = 0;
  for (let page = 0; page < maxPages; page++) {
    const data = await firefliesGraphQL(PARTICIPANT_SEARCH_QUERY, {
      participants: emails,
      limit: batchSize,
      skip,
    });
    const batch = data.transcripts || [];
    results.push(...batch);
    if (batch.length < batchSize) break;
    skip += batchSize;
  }
  return results;
}

/**
 * Sync Fireflies transcripts for a deal.
 *
 * Improvements:
 * 1. Accepts array of contact emails (with backward compat for single email)
 * 2. Deduplicates results across multi-email search
 * 3. Detects silent/skipped meetings and sets has_content flag
 * 4. Extracts external participants
 * 5. Falls back to company name keyword search when email search finds nothing
 * 6. Tags results with match_type
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

    const body = (await req.json()) as SyncRequest;
    const { listingId, companyName, limit: _limit = 50 } = body;

    // Support both new `contactEmails` array and legacy `contactEmail` single string
    const allEmails: string[] = [];
    if (body.contactEmails && Array.isArray(body.contactEmails)) {
      allEmails.push(...body.contactEmails);
    }
    if (body.contactEmail && !allEmails.includes(body.contactEmail)) {
      allEmails.push(body.contactEmail);
    }
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails = [
      ...new Set(
        allEmails
          .filter(Boolean)
          .map((e) => e.toLowerCase().trim())
          .filter((e) => EMAIL_RE.test(e)),
      ),
    ];

    if (!listingId) {
      return new Response(JSON.stringify({ error: 'listingId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (validEmails.length === 0 && !companyName) {
      return new Response(
        JSON.stringify({ error: 'At least one contact email or company name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(
      `Syncing Fireflies transcripts for [${validEmails.join(', ')}] on deal ${listingId}`,
    );

    // === Phase 1: Email-based participant search ===
    const matchingTranscripts: FirefliesTranscript[] = [];
    const transcriptMatchType = new Map<string, 'email' | 'keyword'>();
    const seenIds = new Set<string>();

    if (validEmails.length > 0) {
      const batchSize = 50;
      const maxPages = 10;

      // Search with combined emails array
      const combinedResults = await paginatedSearchEmails(validEmails, batchSize, maxPages);
      for (const t of combinedResults) {
        if (t.id && !seenIds.has(t.id)) {
          seenIds.add(t.id);
          matchingTranscripts.push(t);
          transcriptMatchType.set(t.id, 'email');
        }
      }
      console.log(`Combined participant search returned ${combinedResults.length} transcripts`);

      // Also search each email individually to catch transcripts the combined search misses
      // (Fireflies may use AND logic for the participants array filter)
      for (const email of validEmails) {
        const individualResults = await paginatedSearchEmails([email], batchSize, maxPages);
        let newFromIndividual = 0;
        for (const t of individualResults) {
          if (t.id && !seenIds.has(t.id)) {
            seenIds.add(t.id);
            matchingTranscripts.push(t);
            transcriptMatchType.set(t.id, 'email');
            newFromIndividual++;
          }
        }
        console.log(`Individual search [${email}] added ${newFromIndividual} new transcripts`);
      }

      // Also search each email as a keyword (catches organizer-only matches)
      for (const email of validEmails.slice(0, 3)) {
        try {
          let skip = 0;
          for (let page = 0; page < 4; page++) {
            const data = await firefliesGraphQL(KEYWORD_SEARCH_QUERY, {
              keyword: email,
              limit: batchSize,
              skip,
            });
            const batch = data.transcripts || [];
            for (const t of batch) {
              if (t.id && !seenIds.has(t.id)) {
                seenIds.add(t.id);
                matchingTranscripts.push(t);
                transcriptMatchType.set(t.id, 'email');
              }
            }
            if (batch.length < batchSize) break;
            skip += batchSize;
          }
        } catch (err) {
          console.warn(`Keyword search for email ${email} failed:`, err);
        }
      }

      console.log(
        `Total participant search returned ${matchingTranscripts.length} unique transcripts`,
      );
    }

    // Deduplicate
    const seen = new Set<string>();
    const uniqueTranscripts = matchingTranscripts.filter((t) => {
      if (!t.id || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    // === Phase 2: Fallback keyword search by company name ===
    const emailResultsWithContent = uniqueTranscripts.filter((t) => transcriptHasContent(t));

    if (emailResultsWithContent.length === 0 && companyName && companyName.trim().length >= 3) {
      console.log(`No email results with content, running fallback for "${companyName}"`);

      let skip = 0;
      const batchSize = 50;
      const maxPages = 4;

      for (let page = 0; page < maxPages; page++) {
        const data = await firefliesGraphQL(KEYWORD_SEARCH_QUERY, {
          keyword: companyName.trim(),
          limit: batchSize,
          skip,
        });
        const batch = data.transcripts || [];

        for (const t of batch) {
          if (t.id && !seen.has(t.id)) {
            seen.add(t.id);
            uniqueTranscripts.push(t);
            transcriptMatchType.set(t.id, 'keyword');
          }
        }

        if (batch.length < batchSize) break;
        skip += batchSize;
      }

      console.log(
        `Fallback search added ${uniqueTranscripts.length - emailResultsWithContent.length} transcripts`,
      );
    }

    console.log(`Found ${uniqueTranscripts.length} unique Fireflies transcripts total`);

    if (uniqueTranscripts.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `No Fireflies transcripts found`,
          linked: 0,
          skipped: 0,
          total: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let linked = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const transcript of uniqueTranscripts) {
      if (!transcript.id) {
        skipped++;
        continue;
      }

      try {
        // Check if already linked
        const { data: existing } = await supabase
          .from('deal_transcripts')
          .select('id')
          .eq('listing_id', listingId)
          .eq('fireflies_transcript_id', transcript.id)
          .maybeSingle();

        if (existing) {
          console.log(`Transcript ${transcript.id} already linked, skipping`);
          skipped++;
          continue;
        }

        // Extract participant emails
        const attendeeEmails = (transcript.meeting_attendees || [])
          .map((a: { email?: string }) => a.email)
          .filter(Boolean);

        // Convert Fireflies date (Unix ms) to ISO string
        let callDate: string | null = null;
        if (transcript.date) {
          const dateNum =
            typeof transcript.date === 'number' ? transcript.date : parseInt(transcript.date, 10);
          if (!isNaN(dateNum)) {
            callDate = new Date(dateNum).toISOString();
          }
        }

        // Determine content status and match type
        const hasContent = transcriptHasContent(transcript);
        const matchType = transcriptMatchType.get(transcript.id) || 'email';
        const externalParticipants = extractExternalParticipants(
          transcript.meeting_attendees || [],
        );

        // Store Fireflies summary data in extracted_data for display in Contact History
        const extractedData: Record<string, unknown> = {};
        if (transcript.summary?.short_summary) {
          extractedData.fireflies_summary = transcript.summary.short_summary;
        }
        if (transcript.summary?.keywords) {
          extractedData.fireflies_keywords = transcript.summary.keywords;
        }

        const { error: insertError } = await supabase.from('deal_transcripts').insert({
          listing_id: listingId,
          fireflies_transcript_id: transcript.id,
          fireflies_meeting_id: transcript.id,
          transcript_url: transcript.transcript_url || null,
          title: transcript.title || `Call`,
          call_date: callDate,
          participants: transcript.meeting_attendees || [],
          meeting_attendees: attendeeEmails,
          duration_minutes: transcript.duration ? Math.round(transcript.duration) : null,
          source: 'fireflies',
          auto_linked: true,
          transcript_text: '', // Fetched on-demand via fetch-fireflies-content
          created_by: null,
          has_content: hasContent,
          match_type: matchType,
          external_participants: externalParticipants,
          extracted_data: extractedData,
        });

        if (insertError) {
          console.error(`Failed to link transcript ${transcript.id}:`, insertError);
          errors.push(`${transcript.id}: ${insertError.message}`);
          skipped++;
        } else {
          console.log(
            `Linked transcript ${transcript.id}: ${transcript.title} (has_content=${hasContent}, match_type=${matchType})`,
          );
          linked++;
        }
      } catch (err) {
        console.error(`Error processing transcript ${transcript.id}:`, err);
        errors.push(`${transcript.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        skipped++;
      }
    }

    const response = {
      success: true,
      message: `Linked ${linked} transcript${linked !== 1 ? 's' : ''}, skipped ${skipped}`,
      linked,
      skipped,
      total: uniqueTranscripts.length,
      emailsSearched: validEmails.length,
      fallbackUsed: uniqueTranscripts.some((t) => transcriptMatchType.get(t.id) === 'keyword'),
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log('Sync complete:', response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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
