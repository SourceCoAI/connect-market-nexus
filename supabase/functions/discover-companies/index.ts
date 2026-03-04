/**
 * Discover Companies Edge Function
 *
 * Google-powered company discovery:
 *   1. Haiku builds optimized search queries from user intent
 *   2. Apify Google search executes queries
 *   3. Haiku extracts company info from results
 *   4. Dedup and cross-reference against existing buyer DB
 *
 * POST /discover-companies
 * Body: { query, industry?, geography?, min_locations?, max_results? }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { googleSearch } from '../_shared/serper-client.ts';
import { callClaude, CLAUDE_MODELS } from '../_shared/claude-client.ts';

interface DiscoverCompaniesRequest {
  query: string;
  industry?: string;
  geography?: string;
  min_locations?: number;
  max_results?: number;
}

interface DiscoveredCompany {
  name: string;
  url: string;
  description: string;
  industry?: string;
  location?: string;
  estimated_size?: string;
  already_in_db: boolean;
  existing_buyer_id?: string;
  confidence: 'high' | 'medium' | 'low';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const corsHeaders = getCorsHeaders(req);
  const startTime = Date.now();

  // Auth
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  const auth = await requireAdmin(req, supabaseAdmin);
  if (!auth.authenticated || !auth.isAdmin) {
    return new Response(JSON.stringify({ error: auth.error || 'Unauthorized' }), {
      status: auth.authenticated ? 403 : 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Parse body
  let body: DiscoverCompaniesRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!body.query?.trim()) {
    return new Response(JSON.stringify({ error: 'query is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const maxResults = body.max_results || 20;
  const errors: string[] = [];

  try {
    // 1. Use Haiku to build optimized search queries
    console.log(`[discover-companies] Building search queries for: "${body.query}"`);

    const queryBuilderResponse = await callClaude({
      model: CLAUDE_MODELS.haiku,
      maxTokens: 500,
      systemPrompt: `You are a search query optimizer. Given a user's company discovery request, generate 2-3 Google search queries that will find matching companies. Return JSON array of strings only. Focus on finding actual company websites, not directories or articles.`,
      messages: [
        {
          role: 'user',
          content: `Find companies matching: "${body.query}"${body.industry ? ` in ${body.industry} industry` : ''}${body.geography ? ` in ${body.geography}` : ''}${body.min_locations ? ` with ${body.min_locations}+ locations` : ''}`,
        },
      ],
      timeoutMs: 10000,
    });

    const queryText = queryBuilderResponse.content.find((b) => b.type === 'text')?.text || '';
    let searchQueries: string[];
    try {
      const jsonMatch = queryText.match(/\[[\s\S]*?\]/);
      searchQueries = jsonMatch ? JSON.parse(jsonMatch[0]) : [body.query];
    } catch {
      searchQueries = [body.query];
    }

    // 2. Execute Google searches via Apify
    console.log(`[discover-companies] Executing ${searchQueries.length} search queries`);
    const allResults: unknown[] = [];

    for (const query of searchQueries.slice(0, 3)) {
      try {
        const results = await googleSearch(query, 10);
        allResults.push(...results);
      } catch (err) {
        console.warn(`[discover-companies] Search failed for "${query}": ${err}`);
        errors.push(`Search query failed: ${query}`);
      }
    }

    if (allResults.length === 0) {
      return new Response(
        JSON.stringify({
          companies: [],
          total_found: 0,
          query_used: searchQueries.join(' | '),
          search_duration_ms: Date.now() - startTime,
          errors: ['No search results found'],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 3. Use Haiku to extract company information from results
    console.log(`[discover-companies] Extracting companies from ${allResults.length} results`);

    const extractionResponse = await callClaude({
      model: CLAUDE_MODELS.haiku,
      maxTokens: 2000,
      systemPrompt: `You extract company information from Google search results. Return a JSON array of objects with fields: name, url, description, industry, location, estimated_size, confidence (high/medium/low). Only include actual companies that match the user's criteria. Exclude directories, articles, and non-company pages. Deduplicate by company name.`,
      messages: [
        {
          role: 'user',
          content: `User wants: "${body.query}"${body.industry ? ` in ${body.industry}` : ''}${body.geography ? ` in ${body.geography}` : ''}

Search results:
${allResults.map((r, i) => `${i + 1}. ${r.title} - ${r.url}\n   ${r.description}`).join('\n')}

Extract matching companies as JSON array.`,
        },
      ],
      timeoutMs: 15000,
    });

    const extractText = extractionResponse.content.find((b) => b.type === 'text')?.text || '';
    let companies: DiscoveredCompany[];
    try {
      const jsonMatch = extractText.match(/\[[\s\S]*?\]/);
      companies = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      companies = [];
      errors.push('Failed to parse company extraction results');
    }

    // 4. Cross-reference against existing buyer database
    console.log(`[discover-companies] Cross-referencing ${companies.length} companies against DB`);

    const { data: existingBuyers } = await supabaseAdmin
      .from('buyers')
      .select('id, company_name')
      .eq('archived', false);

    const existingMap = new Map<string, string>();
    if (existingBuyers) {
      for (const buyer of existingBuyers) {
        existingMap.set(buyer.company_name.toLowerCase(), buyer.id);
      }
    }

    // Mark companies that are already in DB
    const enrichedCompanies = companies.map((c) => {
      const existingId = existingMap.get(c.name.toLowerCase());
      return {
        ...c,
        already_in_db: !!existingId,
        existing_buyer_id: existingId || undefined,
      };
    });

    // Dedup by name
    const seen = new Set<string>();
    const dedupedCompanies = enrichedCompanies
      .filter((c) => {
        const key = c.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, maxResults);

    const duration = Date.now() - startTime;
    console.log(`[discover-companies] Found ${dedupedCompanies.length} companies in ${duration}ms`);

    return new Response(
      JSON.stringify({
        companies: dedupedCompanies,
        total_found: dedupedCompanies.length,
        query_used: searchQueries.join(' | '),
        search_duration_ms: duration,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error(`[discover-companies] Unhandled error: ${err}`);
    return new Response(
      JSON.stringify({
        error: `Company discovery failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
