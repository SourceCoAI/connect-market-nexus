import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

// Normalize domain from URL or email
function normalizeDomain(input: string | null): string | null {
  if (!input) return null;

  try {
    // Try to parse as URL
    let domain = input.toLowerCase().trim();

    // Remove protocol
    domain = domain.replace(/^https?:\/\//, '');

    // Remove www prefix
    domain = domain.replace(/^www\./, '');

    // Get just the domain (before any path)
    domain = domain.split('/')[0];

    // Remove port
    domain = domain.split(':')[0];

    return domain || null;
  } catch {
    return null;
  }
}

// Website domain is the canonical unique identifier for buyers.
// Name-based matching is intentionally removed — it produced too many false positives
// (e.g. "Apex Capital" matching "Apex Partners") and is unreliable across naming conventions.

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { buyers: inputBuyers, universeId } = await req.json();

    let buyers: Array<{ company_name: string; company_website?: string }>;

    // If universeId is provided, fetch buyers from the database
    if (universeId) {
      const { data: universeBuyers, error: fetchError } = await supabase
        .from('buyers')
        .select('id, company_name, company_website')
        .eq('universe_id', universeId)
        .eq('archived', false);

      if (fetchError) throw fetchError;

      if (!universeBuyers || universeBuyers.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            totalChecked: 0,
            duplicatesFound: 0,
            results: [],
            message: 'No buyers found in universe',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      buyers = universeBuyers;
    } else if (inputBuyers && Array.isArray(inputBuyers)) {
      buyers = inputBuyers;
    } else {
      return new Response(JSON.stringify({ error: 'buyers array or universeId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Checking ${buyers.length} buyers for duplicates`);

    // Fetch all active buyers that have a website (domain is the canonical dedup key)
    const { data: existingBuyers, error: buyersError } = await supabase
      .from('buyers')
      .select('id, company_name, company_website')
      .eq('archived', false)
      .not('company_website', 'is', null);

    if (buyersError) throw buyersError;

    // Build domain → buyer lookup map
    const existingByDomain = new Map<string, (typeof existingBuyers)[0]>();
    for (const existing of existingBuyers || []) {
      const domain = normalizeDomain(existing.company_website);
      if (domain) {
        existingByDomain.set(domain, existing);
      }
    }

    // Check each incoming buyer for a domain match.
    // Buyers with no website are flagged as duplicates (they are not allowed).
    const results = buyers.map(
      (buyer: { company_name: string; company_website?: string }, index: number) => {
        const potentialDuplicates: Array<{
          existingId: string;
          existingName: string;
          matchType: 'domain' | 'no_website';
          confidence: number;
        }> = [];

        const incomingDomain = normalizeDomain(buyer.company_website || null);

        if (!incomingDomain) {
          // No website provided — treat as a duplicate/invalid so the UI surfaces it
          potentialDuplicates.push({
            existingId: '',
            existingName: '',
            matchType: 'no_website',
            confidence: 1,
          });
        } else {
          const domainMatch = existingByDomain.get(incomingDomain);
          if (domainMatch) {
            potentialDuplicates.push({
              existingId: domainMatch.id,
              existingName: domainMatch.company_name,
              matchType: 'domain',
              confidence: 1,
            });
          }
        }

        return {
          index,
          companyName: buyer.company_name,
          isDuplicate: potentialDuplicates.length > 0,
          potentialDuplicates: potentialDuplicates.sort((a, b) => b.confidence - a.confidence),
        };
      },
    );

    const duplicateCount = results.filter((r) => r.isDuplicate).length;

    return new Response(
      JSON.stringify({
        success: true,
        totalChecked: buyers.length,
        duplicatesFound: duplicateCount,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Error in dedupe-buyers:', error);
    const message = error instanceof Error ? error.message : 'Failed to check for duplicates';
    return new Response(
      JSON.stringify({
        error: message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
