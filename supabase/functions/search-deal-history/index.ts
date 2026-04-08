import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

interface SearchRequest {
  query: string;
  deal_id?: string;
  listing_id?: string;
  limit?: number;
}

interface SearchResult {
  source: string;
  title: string;
  snippet: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

/**
 * Extract a snippet around the first match of `query` in `text`.
 * Shows ~100 chars before and after the match position.
 */
function extractSnippet(text: string, query: string): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) {
    // No match found — return the first 200 chars as a fallback
    return text.length > 200 ? text.slice(0, 200) + '...' : text;
  }
  const start = Math.max(0, idx - 100);
  const end = Math.min(text.length, idx + query.length + 100);
  let snippet = '';
  if (start > 0) snippet += '...';
  snippet += text.slice(start, end);
  if (end < text.length) snippet += '...';
  return snippet;
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

    // Auth: require valid user JWT
    const authHeader = req.headers.get('authorization') || '';
    const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : '';

    if (!bearer) {
      return new Response(JSON.stringify({ error: 'Missing Authorization bearer token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(bearer);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: SearchRequest = await req.json();
    const { query, deal_id, listing_id: rawListingId, limit = 20 } = body;

    if (!query || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: 'Query must be at least 2 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve listing_id
    let listingId = rawListingId;
    if (!listingId && deal_id) {
      const { data: deal } = await supabase
        .from('deal_pipeline')
        .select('listing_id')
        .eq('id', deal_id)
        .single();
      listingId = deal?.listing_id ?? undefined;
    }

    const ilikePattern = `%${query}%`;

    // Run all searches in parallel
    const searches = await Promise.allSettled([
      // 1. deal_transcripts — transcript_text
      (async (): Promise<SearchResult[]> => {
        let q = supabase
          .from('deal_transcripts')
          .select('id, listing_id, transcript_text, source, created_at')
          .ilike('transcript_text', ilikePattern)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (listingId) q = q.eq('listing_id', listingId);
        const { data, error } = await q;
        if (error) {
          console.error('deal_transcripts search error:', error);
          return [];
        }
        return (data || []).map((r) => ({
          source: 'transcript',
          title: `Transcript (${r.source || 'call'})`,
          snippet: extractSnippet(r.transcript_text, query),
          timestamp: r.created_at,
          metadata: { id: r.id, listing_id: r.listing_id, source: r.source },
        }));
      })(),

      // 2. contact_email_history — subject or reply_text
      (async (): Promise<SearchResult[]> => {
        let q = supabase
          .from('contact_email_history')
          .select('id, contact_id, listing_id, subject, reply_text, sent_at, recipient_email')
          .or(`subject.ilike.${ilikePattern},reply_text.ilike.${ilikePattern}`)
          .order('sent_at', { ascending: false })
          .limit(limit);
        if (listingId) q = q.eq('listing_id', listingId);
        const { data, error } = await q;
        if (error) {
          console.error('contact_email_history search error:', error);
          return [];
        }
        return (data || []).map((r) => ({
          source: 'email',
          title: r.subject || 'Email',
          snippet: extractSnippet(r.reply_text || r.subject || '', query),
          timestamp: r.sent_at,
          metadata: {
            id: r.id,
            contact_id: r.contact_id,
            listing_id: r.listing_id,
            recipient_email: r.recipient_email,
          },
        }));
      })(),

      // 3. contact_call_history — call_notes
      (async (): Promise<SearchResult[]> => {
        let q = supabase
          .from('contact_call_history')
          .select('id, contact_id, listing_id, call_notes, called_at, disposition, phone_number')
          .ilike('call_notes', ilikePattern)
          .order('called_at', { ascending: false })
          .limit(limit);
        if (listingId) q = q.eq('listing_id', listingId);
        const { data, error } = await q;
        if (error) {
          console.error('contact_call_history search error:', error);
          return [];
        }
        return (data || []).map((r) => ({
          source: 'call',
          title: `Call — ${r.disposition || 'unknown'}`,
          snippet: extractSnippet(r.call_notes || '', query),
          timestamp: r.called_at,
          metadata: {
            id: r.id,
            contact_id: r.contact_id,
            listing_id: r.listing_id,
            disposition: r.disposition,
          },
        }));
      })(),

      // 4. deal_activities — title or description
      (async (): Promise<SearchResult[]> => {
        let q = supabase
          .from('deal_activities')
          .select('id, deal_id, title, description, activity_type, created_at')
          .or(`title.ilike.${ilikePattern},description.ilike.${ilikePattern}`)
          .order('created_at', { ascending: false })
          .limit(limit);
        // deal_activities uses deal_id, not listing_id — need to resolve via deals table
        if (listingId) {
          const { data: deals } = await supabase
            .from('deal_pipeline')
            .select('id')
            .eq('listing_id', listingId);
          const dealIds = (deals || []).map((d) => d.id);
          if (dealIds.length === 0) return [];
          q = q.in('deal_id', dealIds);
        }
        const { data, error } = await q;
        if (error) {
          console.error('deal_activities search error:', error);
          return [];
        }
        return (data || []).map((r) => ({
          source: 'activity',
          title: r.title,
          snippet: extractSnippet(r.description || r.title || '', query),
          timestamp: r.created_at,
          metadata: { id: r.id, deal_id: r.deal_id, activity_type: r.activity_type },
        }));
      })(),

      // 5. listing_notes — note
      (async (): Promise<SearchResult[]> => {
        let q = supabase
          .from('listing_notes')
          .select('id, listing_id, note, created_at')
          .ilike('note', ilikePattern)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (listingId) q = q.eq('listing_id', listingId);
        const { data, error } = await q;
        if (error) {
          console.error('listing_notes search error:', error);
          return [];
        }
        return (data || []).map((r) => ({
          source: 'note',
          title: 'Listing Note',
          snippet: extractSnippet(r.note || '', query),
          timestamp: r.created_at,
          metadata: { id: r.id, listing_id: r.listing_id },
        }));
      })(),

      // 6. contact_activities — call_transcript
      (async (): Promise<SearchResult[]> => {
        let q = supabase
          .from('contact_activities')
          .select(
            'id, contact_id, listing_id, call_transcript, disposition_label, disposition_notes, activity_type, call_started_at, created_at',
          )
          .ilike('call_transcript', ilikePattern)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (listingId) q = q.eq('listing_id', listingId);
        const { data, error } = await q;
        if (error) {
          console.error('contact_activities search error:', error);
          return [];
        }
        return (data || []).map((r) => ({
          source: 'phoneburner_transcript',
          title: r.disposition_label || `PhoneBurner — ${r.activity_type || 'call'}`,
          snippet: extractSnippet(r.call_transcript || r.disposition_notes || '', query),
          timestamp: r.call_started_at || r.created_at,
          metadata: {
            id: r.id,
            contact_id: r.contact_id,
            listing_id: r.listing_id,
            activity_type: r.activity_type,
          },
        }));
      })(),
    ]);

    // Collect all fulfilled results
    const allResults: SearchResult[] = [];
    for (const result of searches) {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
      }
    }

    // Sort by timestamp descending
    allResults.sort((a, b) => {
      const ta = new Date(a.timestamp || 0).getTime();
      const tb = new Date(b.timestamp || 0).getTime();
      return tb - ta;
    });

    // Limit to top N
    const limited = allResults.slice(0, limit);

    return new Response(JSON.stringify({ results: limited, total: allResults.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('search-deal-history error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(err) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
