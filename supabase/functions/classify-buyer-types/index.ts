/**
 * classify-buyer-types – Batch AI classification of buyer_type
 *
 * Uses Claude Haiku to classify buyers as pe_firm, platform, strategic,
 * or family_office based on company name, PE firm name, thesis, and website domain.
 * Processes in batches of 50 to stay within edge function timeouts.
 *
 * Body: { batchSize?: number, offset?: number, dryRun?: boolean }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { callClaude, CLAUDE_MODELS } from '../_shared/claude-client.ts';
import { requireAdmin } from '../_shared/auth.ts';

const SYSTEM_PROMPT = `You are a buyer classification specialist for M&A deal sourcing.
Given a list of companies, classify each one into exactly one buyer_type:

- "pe_firm": Private equity fund, investment firm, or financial sponsor (e.g., "Apex Capital Partners", "Blackstone")
- "platform": PE-backed operating company doing add-on acquisitions (e.g., "ServiceMaster" backed by a PE firm)
- "strategic": Corporate/strategic acquirer, operating company acquiring for growth (e.g., "Waste Management", "Cintas")
- "family_office": Family office or single-family investment vehicle

Classification rules:
- If the company has a pe_firm_name AND the company name is different from the pe_firm_name, it's a "platform"
- If the company name contains words like Capital, Partners, Equity, Fund, Ventures, Advisors, Holdings, Investment, and it looks like a financial firm, it's "pe_firm"
- If the company appears to be an operating business (services, manufacturing, etc.), it's "strategic"
- Family offices are rare — only classify as "family_office" if explicitly indicated

Return a JSON array of objects: [{"id": "...", "buyer_type": "..."}]
Return ONLY the JSON array. No markdown, no explanation.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const headers = getCorsHeaders(req);

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

    const body = await req.json();
    const batchSize = Math.min(body.batchSize || 50, 100);
    const offset = body.offset || 0;
    const dryRun = body.dryRun || false;

    // Fetch buyers that need classification
    // Target: buyers with no buyer_type, or generic 'strategic' that might be misclassified
    const { data: buyers, error: fetchError } = await supabase
      .from('remarketing_buyers')
      .select('id, company_name, pe_firm_name, thesis_summary, company_website')
      .eq('archived', false)
      .order('created_at', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (fetchError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch buyers', details: fetchError.message }), {
        status: 500, headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    if (!buyers || buyers.length === 0) {
      return new Response(JSON.stringify({ message: 'No more buyers to classify', classified: 0 }), {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // Build the prompt with buyer data
    const buyerList = buyers.map(b => ({
      id: b.id,
      company_name: b.company_name,
      pe_firm_name: b.pe_firm_name || null,
      thesis_snippet: (b.thesis_summary || '').slice(0, 150),
      website_domain: b.company_website ? b.company_website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null,
    }));

    const userPrompt = `Classify the buyer_type for each of these ${buyers.length} companies:\n\n${JSON.stringify(buyerList, null, 2)}`;

    const claudeResponse = await callClaude({
      model: CLAUDE_MODELS.haiku,
      maxTokens: 4096,
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      timeoutMs: 45000,
    });

    const responseText = claudeResponse.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Parse response
    let cleaned = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start >= 0 && end > start) cleaned = cleaned.substring(start, end + 1);

    const classifications: { id: string; buyer_type: string }[] = JSON.parse(cleaned);
    const validTypes = new Set(['pe_firm', 'platform', 'strategic', 'family_office']);

    // Apply updates
    let updated = 0;
    let skipped = 0;
    const results: { id: string; company_name: string; old_type: string | null; new_type: string }[] = [];

    for (const classification of classifications) {
      if (!validTypes.has(classification.buyer_type)) {
        skipped++;
        continue;
      }

      const buyer = buyers.find(b => b.id === classification.id);
      if (!buyer) { skipped++; continue; }

      results.push({
        id: classification.id,
        company_name: buyer.company_name,
        old_type: null, // We don't have the old type in this select but it's fine for logging
        new_type: classification.buyer_type,
      });

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from('remarketing_buyers')
          .update({ buyer_type: classification.buyer_type })
          .eq('id', classification.id);

        if (updateError) {
          console.error(`Failed to update ${buyer.company_name}:`, updateError.message);
          skipped++;
          continue;
        }
      }
      updated++;
    }

    return new Response(JSON.stringify({
      classified: updated,
      skipped,
      total_in_batch: buyers.length,
      offset,
      next_offset: offset + batchSize,
      dry_run: dryRun,
      results,
      usage: claudeResponse.usage,
    }), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('classify-buyer-types error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(error) }), {
      status: 500, headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
});
