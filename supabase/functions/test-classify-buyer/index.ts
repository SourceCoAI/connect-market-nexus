/**
 * test-classify-buyer – Test buyer type classification on random or specific buyers
 *
 * Runs the AI classifier on a set of buyers WITHOUT writing results to the DB.
 * Always operates in dry-run mode. Returns classification results with comparison
 * against current DB values so admins can verify accuracy.
 *
 * Modes:
 *   - random:  Pick N random buyers from the DB and classify them
 *   - specific: Classify specific buyer IDs
 *   - manual:  Classify a manually-provided buyer object (no DB lookup)
 *
 * POST body:
 *   { mode: 'random', count?: number }
 *   { mode: 'specific', buyerIds: string[] }
 *   { mode: 'manual', buyers: Array<{ company_name: string, pe_firm_name?: string, thesis_snippet?: string, website?: string }> }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { callClaude, CLAUDE_MODELS } from '../_shared/claude-client.ts';
import { requireAdmin } from '../_shared/auth.ts';
import {
  CANONICAL_BUYER_TYPES,
  BUYER_TYPE_DEFINITIONS,
  CLASSIFICATION_RULES,
  buildClassificationSystemPrompt,
  isValidBuyerType,
} from '../_shared/buyer-type-definitions.ts';

interface BuyerInput {
  id: string;
  company_name: string;
  pe_firm_name: string | null;
  thesis_snippet: string;
  website_domain: string | null;
  current_type: string;
  current_is_pe_backed: boolean;
}

interface ClassificationResult {
  id: string;
  type: string;
  confidence: number;
  reasoning: string;
  is_pe_backed: boolean;
  pe_firm_name: string | null;
}

interface TestResult {
  buyer_id: string;
  company_name: string;
  current_type: string | null;
  current_is_pe_backed: boolean;
  classified_type: string;
  classified_is_pe_backed: boolean;
  classified_pe_firm_name: string | null;
  confidence: number;
  reasoning: string;
  matches_current: boolean;
  platform_company_rule_applied: boolean;
}

const SYSTEM_PROMPT = buildClassificationSystemPrompt();

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const headers = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const auth = await requireAdmin(req, supabase);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    if (Deno.env.get('ENABLE_TEST_FUNCTIONS') !== 'true') {
      return new Response(JSON.stringify({ error: 'Test functions are disabled in this environment' }), {
        status: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const mode = body.mode || 'random';

    let buyerInputs: BuyerInput[] = [];

    if (mode === 'random') {
      const count = Math.min(body.count || 10, 25);

      // Fetch total count of non-archived buyers
      const { count: totalCount } = await supabase
        .from('buyers')
        .select('id', { count: 'exact', head: true })
        .eq('archived', false);

      if (!totalCount || totalCount === 0) {
        return new Response(
          JSON.stringify({ error: 'No buyers found in database' }),
          { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } },
        );
      }

      // Generate random offsets
      const offsets = new Set<number>();
      while (offsets.size < Math.min(count, totalCount)) {
        offsets.add(Math.floor(Math.random() * totalCount));
      }

      // Fetch buyers at random offsets
      for (const offset of offsets) {
        const { data } = await supabase
          .from('buyers')
          .select(
            'id, company_name, pe_firm_name, thesis_summary, company_website, buyer_type, is_pe_backed',
          )
          .eq('archived', false)
          .order('created_at', { ascending: true })
          .range(offset, offset);

        if (data && data.length > 0) {
          const b = data[0];
          buyerInputs.push({
            id: b.id,
            company_name: b.company_name,
            pe_firm_name: b.pe_firm_name || null,
            thesis_snippet: (b.thesis_summary || '').slice(0, 300),
            website_domain: b.company_website
              ? b.company_website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
              : null,
            current_type: b.buyer_type || 'unclassified',
            current_is_pe_backed: b.is_pe_backed || false,
          });
        }
      }
    } else if (mode === 'specific') {
      const buyerIds: string[] = body.buyerIds || [];
      if (buyerIds.length === 0) {
        return new Response(
          JSON.stringify({ error: 'buyerIds array is required for specific mode' }),
          { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
        );
      }

      const { data: buyers, error: fetchError } = await supabase
        .from('buyers')
        .select(
          'id, company_name, pe_firm_name, thesis_summary, company_website, buyer_type, is_pe_backed',
        )
        .in('id', buyerIds.slice(0, 25));

      if (fetchError || !buyers) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch buyers', details: fetchError?.message }),
          { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
        );
      }

      buyerInputs = buyers.map((b) => ({
        id: b.id,
        company_name: b.company_name,
        pe_firm_name: b.pe_firm_name || null,
        thesis_snippet: (b.thesis_summary || '').slice(0, 300),
        website_domain: b.company_website
          ? b.company_website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
          : null,
        current_type: b.buyer_type || 'unclassified',
        current_is_pe_backed: b.is_pe_backed || false,
      }));
    } else if (mode === 'manual') {
      const manualBuyers: Array<{
        company_name: string;
        pe_firm_name?: string;
        thesis_snippet?: string;
        website?: string;
      }> = body.buyers || [];

      if (manualBuyers.length === 0) {
        return new Response(
          JSON.stringify({ error: 'buyers array is required for manual mode' }),
          { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
        );
      }

      buyerInputs = manualBuyers.slice(0, 25).map((b, i) => ({
        id: `manual-${i}`,
        company_name: b.company_name,
        pe_firm_name: b.pe_firm_name || null,
        thesis_snippet: (b.thesis_snippet || '').slice(0, 300),
        website_domain: b.website
          ? b.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
          : null,
        current_type: 'unclassified',
        current_is_pe_backed: false,
      }));
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid mode. Use: random, specific, or manual' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    if (buyerInputs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No buyers to classify' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    // Build the user prompt
    const buyerList = buyerInputs.map((b) => ({
      id: b.id,
      company_name: b.company_name,
      pe_firm_name: b.pe_firm_name,
      thesis_snippet: b.thesis_snippet,
      website_domain: b.website_domain,
    }));

    const userPrompt = `Classify the buyer_type for each of these ${buyerInputs.length} companies:\n\n${JSON.stringify(buyerList, null, 2)}`;

    // Call Claude
    const claudeResponse = await callClaude({
      model: CLAUDE_MODELS.sonnet,
      maxTokens: 4096,
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      timeoutMs: 60000,
    });

    const responseText = claudeResponse.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('');

    // Parse the JSON response
    let cleaned = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start >= 0 && end > start) cleaned = cleaned.substring(start, end + 1);

    const classifications: ClassificationResult[] = JSON.parse(cleaned);

    // Process results with Platform Company Rule enforcement
    const results: TestResult[] = [];
    let matchCount = 0;
    let mismatchCount = 0;
    let platformRuleCount = 0;

    for (const classification of classifications) {
      const input = buyerInputs.find((b) => b.id === classification.id);
      if (!input) continue;

      let finalType = classification.type;
      let finalIsPeBacked = classification.is_pe_backed || false;
      let platformRuleApplied = false;

      // Enforce Platform Company Rule in code
      if (input.pe_firm_name && input.pe_firm_name.trim() !== '') {
        if (finalType !== 'corporate' || !finalIsPeBacked) {
          platformRuleApplied = true;
          platformRuleCount++;
        }
        finalType = 'corporate';
        finalIsPeBacked = true;
      }

      // PE firms are never PE-backed themselves
      if (finalType === 'private_equity') {
        finalIsPeBacked = false;
      }

      // Validate the type
      if (!isValidBuyerType(finalType)) {
        finalType = 'corporate'; // safe fallback
      }

      const matchesCurrent = input.current_type === finalType;
      if (matchesCurrent) matchCount++;
      else mismatchCount++;

      results.push({
        buyer_id: input.id,
        company_name: input.company_name,
        current_type: input.current_type,
        current_is_pe_backed: input.current_is_pe_backed,
        classified_type: finalType,
        classified_is_pe_backed: finalIsPeBacked,
        classified_pe_firm_name: classification.pe_firm_name || null,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        matches_current: matchesCurrent,
        platform_company_rule_applied: platformRuleApplied,
      });
    }

    // Summary statistics
    const summary = {
      total_tested: results.length,
      matches: matchCount,
      mismatches: mismatchCount,
      accuracy_pct: results.length > 0 ? Math.round((matchCount / results.length) * 100) : 0,
      platform_rule_corrections: platformRuleCount,
      confidence_avg: results.length > 0
        ? Math.round(results.reduce((sum, r) => sum + r.confidence, 0) / results.length)
        : 0,
      type_distribution: Object.fromEntries(
        CANONICAL_BUYER_TYPES.map((t) => [
          t,
          results.filter((r) => r.classified_type === t).length,
        ]),
      ),
    };

    return new Response(
      JSON.stringify({
        mode,
        dry_run: true,
        summary,
        results,
        valid_types: CANONICAL_BUYER_TYPES,
        type_definitions: BUYER_TYPE_DEFINITIONS,
        classification_rules: CLASSIFICATION_RULES,
        usage: claudeResponse.usage,
      }),
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('test-classify-buyer error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }
});
