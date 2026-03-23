/* eslint-disable no-console */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

/** Internal email domains to filter out when extracting external participants.
 * Configure via INTERNAL_EMAIL_DOMAINS env var (comma-separated) for flexibility.
 */
const INTERNAL_DOMAINS = (
  Deno.env.get('INTERNAL_EMAIL_DOMAINS') || 'sourcecodeals.com,captarget.com'
)
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

const FIREFLIES_API_TIMEOUT_MS = 15_000;
const FIREFLIES_RATE_LIMIT_BACKOFF_MS = 3_000;

interface SearchRequest {
  emails?: string[]; // array of contact emails (primary search)
  query?: string; // keyword search term
  companyName?: string; // for fallback keyword search
  dealId?: string;
  participantEmails?: string[]; // legacy field — mapped to emails
  limit?: number;
}

interface ExternalParticipant {
  name: string;
  email: string;
}

interface SearchResult {
  id: string;
  title: string;
  date: string;
  duration_minutes: number | null;
  participants: unknown[];
  external_participants: ExternalParticipant[];
  summary: string;
  meeting_url: string;
  keywords: string[];
  has_content: boolean;
  match_type: 'email' | 'keyword';
}

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

/**
 * GraphQL queries that use the Fireflies native filtering:
 * - keyword: searches title + spoken words server-side
 * - participants: filters by attendee email server-side
 *
 * Now also fetches meeting_info for silent_meeting and summary_status detection.
 */
const TRANSCRIPT_FIELDS = `
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
    action_items
  }
  meeting_info {
    silent_meeting
    summary_status
  }
`;

const KEYWORD_SEARCH_QUERY = `
  query SearchByKeyword($keyword: String!, $limit: Int, $skip: Int) {
    transcripts(keyword: $keyword, limit: $limit, skip: $skip) {
      ${TRANSCRIPT_FIELDS}
    }
  }
`;

const PARTICIPANT_SEARCH_QUERY = `
  query SearchByParticipant($participants: [String!], $limit: Int, $skip: Int) {
    transcripts(participants: $participants, limit: $limit, skip: $skip) {
      ${TRANSCRIPT_FIELDS}
    }
  }
`;

const ALL_TRANSCRIPTS_QUERY = `
  query ListTranscripts($limit: Int, $skip: Int) {
    transcripts(limit: $limit, skip: $skip) {
      ${TRANSCRIPT_FIELDS}
    }
  }
`;

interface FirefliesTranscript {
  id: string;
  title?: string;
  date?: number | string;
  duration?: number;
  organizer_email?: string;
  participants?: string[];
  meeting_attendees?: MeetingAttendee[];
  transcript_url?: string;
  summary?: {
    short_summary?: string;
    keywords?: string[];
    action_items?: string[];
  };
  meeting_info?: {
    silent_meeting?: boolean;
    summary_status?: string;
  };
}

interface MeetingAttendee {
  displayName?: string;
  email?: string;
  name?: string;
}

/**
 * Check if a transcript has actual content (not a silent/skipped meeting).
 * Returns false if the meeting was silent AND skipped with no summary.
 */
function transcriptHasContent(t: FirefliesTranscript): boolean {
  const info = t.meeting_info || {};
  const isSilent = info.silent_meeting === true;
  const isSkipped = info.summary_status === 'skipped';
  const hasSummary = !!t.summary?.short_summary;

  // Only flag as no-content if it's silent/skipped AND has no summary
  if ((isSilent || isSkipped) && !hasSummary) {
    return false;
  }
  return true;
}

/**
 * Extract external participants from meeting attendees.
 * Filters out internal @sourcecodeals.com and @captarget.com addresses.
 */
function extractExternalParticipants(attendees: unknown[]): ExternalParticipant[] {
  if (!Array.isArray(attendees)) return [];

  return (attendees as MeetingAttendee[])
    .filter((a: MeetingAttendee) => {
      const email = (a.email || '').toLowerCase();
      if (!email) return false;
      return !INTERNAL_DOMAINS.some((domain) => email.endsWith(`@${domain}`));
    })
    .map((a: MeetingAttendee) => ({
      name: a.displayName || a.name || a.email?.split('@')[0] || 'Unknown',
      email: a.email || '',
    }));
}

/**
 * Paginated fetch from Fireflies API.
 */
async function paginatedFetch(
  gqlQuery: string,
  variables: Record<string, unknown>,
  maxPages = 4,
  batchSize = 50,
): Promise<FirefliesTranscript[]> {
  const results: FirefliesTranscript[] = [];
  let skip = 0;

  for (let page = 0; page < maxPages; page++) {
    const data = await firefliesGraphQL(gqlQuery, {
      ...variables,
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
 * Search Fireflies transcripts for buyer/deal linking.
 *
 * Improvements:
 * 1. Accepts array of emails for multi-contact search
 * 2. Filters silent/skipped meetings — flags them as has_content: false
 * 3. Fallback keyword search by company name when no email results
 * 4. Extracts external participants (filters out internal domains)
 * 5. Tags results with match_type: 'email' | 'keyword'
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

    // Verify the caller has a valid auth token (admin or service role)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    if (token !== supabaseKey) {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid auth token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!profile?.is_admin) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const body = (await req.json()) as SearchRequest;
    const { query, companyName, dealId: _dealId } = body;
    // Cap limit to prevent excessive API calls
    const limit = Math.min(Math.max(body.limit || 20, 1), 50);

    // Support both new `emails` and legacy `participantEmails` field
    const emails = body.emails || body.participantEmails || [];
    // Validate email format and limit count
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails = emails
      .filter(Boolean)
      .map((e) => e.toLowerCase().trim())
      .filter((e) => EMAIL_REGEX.test(e))
      .slice(0, 20); // Cap at 20 emails to prevent abuse

    const trimmedQuery = (query || '').trim();

    if (!trimmedQuery && validEmails.length === 0 && !companyName) {
      return new Response(
        JSON.stringify({ error: 'Search query, participant emails, or company name required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // === Phase 1: Primary search — emails + keyword in parallel ===
    const searches: Promise<{ results: FirefliesTranscript[]; type: 'email' | 'keyword' }>[] = [];

    // Search each email individually AND as a group to maximize results.
    // Fireflies' participants filter may use AND logic with arrays,
    // so individual searches catch transcripts where only one email matches.
    if (validEmails.length > 0) {
      // Combined array search
      searches.push(
        (async () => {
          const results = await paginatedFetch(
            PARTICIPANT_SEARCH_QUERY,
            {
              participants: validEmails,
            },
            8,
            50,
          );
          console.log(
            `Combined participant search [${validEmails.join(', ')}] returned ${results.length} results`,
          );
          return { results, type: 'email' as const };
        })(),
      );

      // Individual email searches (to catch transcripts the combined search misses)
      for (const email of validEmails) {
        searches.push(
          (async () => {
            const results = await paginatedFetch(
              PARTICIPANT_SEARCH_QUERY,
              {
                participants: [email],
              },
              8,
              50,
            );
            console.log(
              `Individual participant search [${email}] returned ${results.length} results`,
            );
            return { results, type: 'email' as const };
          })(),
        );
      }

      // Also search each email as a keyword (catches organizer-only matches)
      for (const email of validEmails.slice(0, 3)) {
        searches.push(
          (async () => {
            const results = await paginatedFetch(
              KEYWORD_SEARCH_QUERY,
              {
                keyword: email,
              },
              4,
              50,
            );
            console.log(`Email keyword search "${email}" returned ${results.length} results`);
            return { results, type: 'email' as const };
          })(),
        );
      }
    }

    // Keyword search if provided
    if (trimmedQuery) {
      searches.push(
        (async () => {
          const results = await paginatedFetch(
            KEYWORD_SEARCH_QUERY,
            {
              keyword: trimmedQuery,
            },
            8,
            50,
          );
          console.log(`Keyword search "${trimmedQuery}" returned ${results.length} results`);
          return { results, type: 'keyword' as const };
        })(),
      );
    }

    // If no keyword and no emails (shouldn't happen due to validation), fetch recent
    if (searches.length === 0 && !companyName) {
      searches.push(
        (async () => {
          const data = await firefliesGraphQL(ALL_TRANSCRIPTS_QUERY, { limit: 50, skip: 0 });
          return { results: data.transcripts || [], type: 'keyword' as const };
        })(),
      );
    }

    const searchResults = await Promise.all(searches);

    // Merge and deduplicate by transcript ID, tracking match_type per result
    const seen = new Map<string, 'email' | 'keyword'>();
    const matchingResults: FirefliesTranscript[] = [];

    for (const { results, type } of searchResults) {
      for (const t of results) {
        if (t.id && !seen.has(t.id)) {
          seen.set(t.id, type);
          matchingResults.push(t);
        }
        // If already seen as 'keyword' but now found via 'email', upgrade to 'email'
        if (t.id && seen.get(t.id) === 'keyword' && type === 'email') {
          seen.set(t.id, 'email');
        }
      }
    }

    console.log(`${matchingResults.length} unique transcripts after primary search`);

    // === Phase 2: Fallback keyword search by company name ===
    // Only run if primary email search returned 0 results with content
    const emailResultsWithContent = matchingResults.filter(
      (t) => seen.get(t.id) === 'email' && transcriptHasContent(t),
    );

    const fallbackResults: FirefliesTranscript[] = [];
    if (emailResultsWithContent.length === 0 && companyName && companyName.trim().length >= 3) {
      console.log(
        `No email results with content, running fallback keyword search for "${companyName}"`,
      );
      const fallbackRaw = await paginatedFetch(
        KEYWORD_SEARCH_QUERY,
        {
          keyword: companyName.trim(),
        },
        2,
      ); // Limit fallback to 2 pages

      // Only add results not already found
      for (const t of fallbackRaw) {
        if (t.id && !seen.has(t.id)) {
          seen.set(t.id, 'keyword');
          fallbackResults.push(t);
        }
      }
      console.log(
        `Fallback search for "${companyName}" returned ${fallbackResults.length} new results`,
      );
    }

    const allResults = [...matchingResults, ...fallbackResults];

    // === Format results ===
    const formattedResults: SearchResult[] = allResults.slice(0, limit).map((t: FirefliesTranscript) => {
      // Convert date
      let dateStr = new Date().toISOString();
      if (t.date) {
        const dateNum = typeof t.date === 'number' ? t.date : parseInt(t.date, 10);
        if (!isNaN(dateNum)) {
          dateStr = new Date(dateNum).toISOString();
        }
      }

      const hasContent = transcriptHasContent(t);
      const matchType = seen.get(t.id) || 'keyword';
      const externalParticipants = extractExternalParticipants(t.meeting_attendees || []);

      return {
        id: t.id,
        title: t.title || 'Untitled Call',
        date: dateStr,
        duration_minutes: t.duration ? Math.round(t.duration) : null,
        participants: t.meeting_attendees || [],
        external_participants: externalParticipants,
        summary: t.summary?.short_summary || '',
        meeting_url: t.transcript_url || '',
        keywords: t.summary?.keywords || [],
        has_content: hasContent,
        match_type: matchType,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        results: formattedResults,
        total: formattedResults.length,
        query: query,
        emailsSearched: validEmails.length,
        companyNameSearched: companyName || null,
        fallbackUsed: fallbackResults.length > 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Search error:', error);
    // Don't leak internal error details (API keys, raw responses) to client
    const safeMessage =
      error instanceof Error && !error.message.includes('API key')
        ? error.message
        : 'Transcript search failed. Please try again.';
    return new Response(
      JSON.stringify({
        success: false,
        error: safeMessage,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
