import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

const INTERNAL_DOMAINS = (
  Deno.env.get('INTERNAL_EMAIL_DOMAINS') || 'sourcecodeals.com,captarget.com'
)
  .split(',')
  .map((d: string) => d.trim().toLowerCase())
  .filter(Boolean);

const FIREFLIES_API_TIMEOUT_MS = 15_000;
const FIREFLIES_RATE_LIMIT_BACKOFF_MS = 3_000;

interface AutoPairRequest {
  /** Max number of Fireflies transcripts to fetch. Default 500. */
  limit?: number;
  /** Only pair for these buyer IDs (if omitted, pair for all active buyers). */
  buyerIds?: string[];
  /** Only pair for these listing IDs (if omitted, pair for all active listings). */
  listingIds?: string[];
}

// ---------------------------------------------------------------------------
// Fireflies API helpers (same pattern as other edge functions)
// ---------------------------------------------------------------------------

async function firefliesGraphQL(query: string, variables?: Record<string, unknown>) {
  const apiKey = Deno.env.get('FIREFLIES_API_KEY');
  if (!apiKey) {
    throw new Error('FIREFLIES_API_KEY is not configured. Add it as a Supabase secret.');
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
  if (response.status === 429) {
    console.warn(`Fireflies rate limit (429), backing off ${FIREFLIES_RATE_LIMIT_BACKOFF_MS}ms…`);
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

function transcriptHasContent(t: {
  meeting_info?: { silent_meeting?: boolean; summary_status?: string };
  summary?: { short_summary?: string };
}): boolean {
  const info = t.meeting_info || {};
  const isSilent = info.silent_meeting === true;
  const isSkipped = info.summary_status === 'skipped';
  const hasSummary = !!t.summary?.short_summary;
  if ((isSilent || isSkipped) && !hasSummary) return false;
  return true;
}

function extractExternalParticipants(attendees: unknown[]): { name: string; email: string }[] {
  if (!Array.isArray(attendees)) return [];
  return attendees
    .filter((a: { email?: string; displayName?: string; name?: string }) => {
      const email = (a.email || '').toLowerCase();
      if (!email) return false;
      return !INTERNAL_DOMAINS.some((domain) => email.endsWith(`@${domain}`));
    })
    .map((a: { email?: string; displayName?: string; name?: string }) => ({
      name: a.displayName || a.name || a.email?.split('@')[0] || 'Unknown',
      email: a.email || '',
    }));
}

/**
 * Normalise a company name for fuzzy matching:
 * lowercase, strip common suffixes, collapse whitespace.
 */
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

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = (await req.json()) as AutoPairRequest;
    const maxTranscripts = Math.min(body.limit || 500, 1000);

    // ------------------------------------------------------------------
    // 1. Load database records we need for matching
    // ------------------------------------------------------------------

    // a) Buyer contacts: email → buyer_id[] AND name → buyer_id[]
    const emailToBuyerIds = new Map<string, Set<string>>();
    const contactNameToBuyerIds = new Map<string, Set<string>>();
    {
      let contactQuery = supabase
        .from('contacts')
        .select('email, first_name, last_name, remarketing_buyer_id')
        .eq('contact_type', 'buyer')
        .eq('archived', false)
        .not('remarketing_buyer_id', 'is', null);

      if (body.buyerIds?.length) {
        contactQuery = contactQuery.in('remarketing_buyer_id', body.buyerIds);
      }

      const { data: contacts } = await contactQuery;
      for (const c of contacts || []) {
        if (!c.remarketing_buyer_id) continue;

        // Email match
        if (c.email) {
          const email = c.email.toLowerCase().trim();
          if (!emailToBuyerIds.has(email)) emailToBuyerIds.set(email, new Set());
          emailToBuyerIds.get(email)!.add(c.remarketing_buyer_id);
        }

        // Name match: build "first last" normalized key
        const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ').trim().toLowerCase();
        if (fullName.length >= 3) {
          if (!contactNameToBuyerIds.has(fullName)) contactNameToBuyerIds.set(fullName, new Set());
          contactNameToBuyerIds.get(fullName)!.add(c.remarketing_buyer_id);
        }
      }
    }
    console.log(`Loaded ${emailToBuyerIds.size} unique buyer contact emails, ${contactNameToBuyerIds.size} unique contact names`);

    // b) Buyers: company_name (normalised) → buyer_id
    const nameToBuyerIds = new Map<string, Set<string>>();
    {
      let buyerQuery = supabase
        .from('buyers')
        .select('id, company_name, pe_firm_name')
        .eq('archived', false);

      if (body.buyerIds?.length) {
        buyerQuery = buyerQuery.in('id', body.buyerIds);
      }

      const { data: buyers } = await buyerQuery;
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
    console.log(`Loaded ${nameToBuyerIds.size} unique buyer company names`);

    // c) Deal (listing) contacts: email → listing_id[]
    const emailToListingIds = new Map<string, Set<string>>();
    const nameToListingIds = new Map<string, Set<string>>();
    {
      // Listings with main contact email
      let listingQuery = supabase
        .from('listings')
        .select('id, main_contact_email, title')
        .is('deleted_at', null);

      if (body.listingIds?.length) {
        listingQuery = listingQuery.in('id', body.listingIds);
      }

      const { data: listings } = await listingQuery;
      for (const l of listings || []) {
        // Email match
        if (l.main_contact_email) {
          const email = l.main_contact_email.toLowerCase().trim();
          if (!emailToListingIds.has(email)) emailToListingIds.set(email, new Set());
          emailToListingIds.get(email)!.add(l.id);
        }
        // Company name match from title
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
      `Loaded ${emailToListingIds.size} deal contact emails, ${nameToListingIds.size} deal names`,
    );

    // d) Pre-load existing links to avoid redundant insert attempts
    const existingBuyerLinks = new Set<string>(); // "buyerId:firefliesId"
    {
      const { data } = await supabase
        .from('buyer_transcripts')
        .select('buyer_id, fireflies_transcript_id');
      for (const row of data || []) {
        existingBuyerLinks.add(`${row.buyer_id}:${row.fireflies_transcript_id}`);
      }
    }

    const existingDealLinks = new Set<string>(); // "listingId:firefliesId"
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
      `Pre-loaded ${existingBuyerLinks.size} existing buyer links, ${existingDealLinks.size} deal links`,
    );

    // ------------------------------------------------------------------
    // 2. Fetch all recent Fireflies transcripts
    // ------------------------------------------------------------------
    const allTranscripts: unknown[] = [];
    const batchSize = 50;
    const maxPages = Math.ceil(maxTranscripts / batchSize);

    for (let page = 0; page < maxPages; page++) {
      const data = await firefliesGraphQL(ALL_TRANSCRIPTS_QUERY, {
        limit: batchSize,
        skip: page * batchSize,
      });
      const batch = data.transcripts || [];
      allTranscripts.push(...batch);
      console.log(`Fetched page ${page + 1}: ${batch.length} transcripts`);
      if (batch.length < batchSize) break;
    }
    console.log(`Total Fireflies transcripts fetched: ${allTranscripts.length}`);

    // ------------------------------------------------------------------
    // 3. Match each transcript to buyers and deals
    // ------------------------------------------------------------------
    let buyersPaired = 0;
    let dealsPaired = 0;
    let buyersSkipped = 0;
    let dealsSkipped = 0;
    const errors: string[] = [];

    for (const transcript of allTranscripts) {
      if (!transcript.id) continue;

      const externalParticipants = extractExternalParticipants(transcript.meeting_attendees || []);
      const participantEmails = externalParticipants
        .map((p) => p.email.toLowerCase())
        .filter(Boolean);

      const hasContent = transcriptHasContent(transcript);
      const title = transcript.title || '';
      const normalizedTitle = normalizeCompanyName(title);

      // Convert Fireflies date
      let callDate: string | null = null;
      if (transcript.date) {
        const dateNum =
          typeof transcript.date === 'number' ? transcript.date : parseInt(transcript.date, 10);
        if (!isNaN(dateNum)) {
          callDate = new Date(dateNum).toISOString();
        }
      }

      // --- Match to buyers ---
      const matchedBuyerIds = new Set<string>();
      const buyerMatchTypes = new Map<string, 'email' | 'keyword'>();

      // Phase 1: Email match
      for (const email of participantEmails) {
        const buyerIds = emailToBuyerIds.get(email);
        if (buyerIds) {
          for (const bid of buyerIds) {
            matchedBuyerIds.add(bid);
            buyerMatchTypes.set(bid, 'email');
          }
        }
      }

      // Phase 2: Company name match (fallback for buyers with no email match)
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

      // Phase 3: Participant name match against buyer contact names
      for (const participant of externalParticipants) {
        const pName = participant.name?.toLowerCase().trim();
        if (!pName || pName.length < 3 || pName === 'unknown') continue;
        const buyerIds = contactNameToBuyerIds.get(pName);
        if (buyerIds) {
          for (const bid of buyerIds) {
            if (!matchedBuyerIds.has(bid)) {
              matchedBuyerIds.add(bid);
              buyerMatchTypes.set(bid, 'keyword');
            }
          }
        }
      }

      // Insert buyer links
      for (const buyerId of matchedBuyerIds) {
        const linkKey = `${buyerId}:${transcript.id}`;
        if (existingBuyerLinks.has(linkKey)) {
          buyersSkipped++;
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
            } else {
              errors.push(`buyer ${buyerId}: ${insertErr.message}`);
            }
          } else {
            buyersPaired++;
            existingBuyerLinks.add(linkKey);
          }
        } catch (e) {
          errors.push(`buyer ${buyerId}: ${e instanceof Error ? e.message : 'Unknown'}`);
        }
      }

      // --- Match to deals ---
      const matchedListingIds = new Set<string>();
      const dealMatchTypes = new Map<string, 'email' | 'keyword'>();

      // Phase 1: Email match
      for (const email of participantEmails) {
        const listingIds = emailToListingIds.get(email);
        if (listingIds) {
          for (const lid of listingIds) {
            matchedListingIds.add(lid);
            dealMatchTypes.set(lid, 'email');
          }
        }
      }

      // Phase 2: Company name match
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
          continue;
        }

        try {
          const attendeeEmails = (transcript.meeting_attendees || [])
            .map((a: { email?: string }) => a.email)
            .filter(Boolean);

          const { error: insertErr } = await supabase.from('deal_transcripts').insert({
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
          });

          if (insertErr) {
            if (insertErr.code === '23505') {
              dealsSkipped++;
            } else {
              errors.push(`deal ${listingId}: ${insertErr.message}`);
            }
          } else {
            dealsPaired++;
            existingDealLinks.add(linkKey);
          }
        } catch (e) {
          errors.push(`deal ${listingId}: ${e instanceof Error ? e.message : 'Unknown'}`);
        }
      }
    }

    const result = {
      success: true,
      transcripts_processed: allTranscripts.length,
      buyers_paired: buyersPaired,
      buyers_skipped: buyersSkipped,
      deals_paired: dealsPaired,
      deals_skipped: dealsSkipped,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    };

    console.log('Auto-pair complete:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Auto-pair error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
