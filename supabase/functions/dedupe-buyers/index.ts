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

// Normalize company name for comparison
function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return '';

  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
    .replace(
      /llc|inc|corp|ltd|company|co|group|partners|capital|investments|holdings|management/g,
      '',
    )
    .trim();
}

// Calculate similarity between two strings (Levenshtein-based)
function similarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1;

  // Simple containment check
  if (longer.includes(shorter) || shorter.includes(longer)) {
    return shorter.length / longer.length;
  }

  // Character-based similarity
  const chars1 = new Set(s1.split(''));
  const chars2 = new Set(s2.split(''));
  const intersection = [...chars1].filter((c) => chars2.has(c)).length;
  const union = new Set([...chars1, ...chars2]).size;

  return intersection / union;
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

    // Fetch all existing buyers
    const { data: existingBuyers, error: buyersError } = await supabase
      .from('buyers')
      .select('id, company_name, company_website')
      .eq('archived', false);

    if (buyersError) throw buyersError;

    // Build lookup maps for existing buyers
    const existingByDomain = new Map<string, (typeof existingBuyers)[0]>();
    const existingByName = new Map<string, (typeof existingBuyers)[0]>();

    for (const existing of existingBuyers || []) {
      const domain = normalizeDomain(existing.company_website);
      if (domain) {
        existingByDomain.set(domain, existing);
      }
      const normalizedName = normalizeCompanyName(existing.company_name);
      if (normalizedName) {
        existingByName.set(normalizedName, existing);
      }
    }

    // Check each incoming buyer for duplicates
    const results = buyers.map(
      (buyer: { company_name: string; company_website?: string }, index: number) => {
        const potentialDuplicates: Array<{
          existingId: string;
          existingName: string;
          matchType: 'domain' | 'name';
          confidence: number;
        }> = [];

        // Check domain match
        const incomingDomain = normalizeDomain(buyer.company_website || null);
        if (incomingDomain) {
          const domainMatch = existingByDomain.get(incomingDomain);
          if (domainMatch) {
            potentialDuplicates.push({
              existingId: domainMatch.id,
              existingName: domainMatch.company_name,
              matchType: 'domain',
              confidence: 0.95,
            });
          }
        }

        // Check name similarity
        const incomingNormalized = normalizeCompanyName(buyer.company_name);
        if (incomingNormalized) {
          // Exact normalized match
          const exactMatch = existingByName.get(incomingNormalized);
          if (exactMatch) {
            // Avoid adding duplicate if already matched by domain
            if (!potentialDuplicates.some((d) => d.existingId === exactMatch.id)) {
              potentialDuplicates.push({
                existingId: exactMatch.id,
                existingName: exactMatch.company_name,
                matchType: 'name',
                confidence: 0.9,
              });
            }
          } else {
            // Check fuzzy matches
            for (const [normalizedName, existing] of existingByName) {
              const sim = similarity(incomingNormalized, normalizedName);
              if (sim > 0.7) {
                if (!potentialDuplicates.some((d) => d.existingId === existing.id)) {
                  potentialDuplicates.push({
                    existingId: existing.id,
                    existingName: existing.company_name,
                    matchType: 'name',
                    confidence: sim,
                  });
                }
              }
            }
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
