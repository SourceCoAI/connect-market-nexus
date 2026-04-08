/**
 * EDGE FUNCTION: search-deal-transcripts
 *
 * PURPOSE:
 *   Searches across locally stored transcript text in deal_transcripts.
 *   Returns matching transcripts with context snippets around the match.
 *
 * TRIGGERS:
 *   HTTP POST request
 *   Body: { query, deal_id?, listing_id?, limit? }
 *
 * DATABASE TABLES TOUCHED:
 *   READ: deal_transcripts, deals
 *
 * LAST UPDATED: 2026-04-07
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { query, deal_id, listing_id, limit = 20 } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: 'Query must be at least 2 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let dbQuery = supabase
      .from('deal_transcripts')
      .select('id, listing_id, title, call_date, transcript_text, source, fireflies_transcript_id')
      .not('transcript_text', 'is', null)
      .ilike('transcript_text', `%${query}%`)
      .order('call_date', { ascending: false })
      .limit(limit);

    if (deal_id) {
      // Resolve listing_id from the deal
      const { data: deal } = await supabase
        .from('deals')
        .select('listing_id')
        .eq('id', deal_id)
        .maybeSingle();
      if (deal?.listing_id) {
        dbQuery = dbQuery.eq('listing_id', deal.listing_id);
      }
    } else if (listing_id) {
      dbQuery = dbQuery.eq('listing_id', listing_id);
    }

    const { data: results, error } = await dbQuery;

    if (error) throw error;

    // Extract matching snippets with surrounding context
    const searchResults = (results || []).map((t) => {
      const text = t.transcript_text || '';
      const lowerText = text.toLowerCase();
      const lowerQuery = query.toLowerCase();
      const idx = lowerText.indexOf(lowerQuery);

      let snippet = '';
      if (idx >= 0) {
        const start = Math.max(0, idx - 100);
        const end = Math.min(text.length, idx + query.length + 100);
        snippet =
          (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
      }

      return {
        id: t.id,
        listing_id: t.listing_id,
        title: t.title,
        call_date: t.call_date,
        source: t.source,
        snippet,
        match_position: idx,
      };
    });

    return new Response(
      JSON.stringify({
        query,
        results: searchResults,
        count: searchResults.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('search-deal-transcripts error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
