/**
 * classify-buyer-types – AI classification of buyer_type using canonical taxonomy
 *
 * Uses Claude Sonnet to classify buyers into exactly one of 6 canonical types:
 *   private_equity, corporate, family_office, search_fund, independent_sponsor, individual_buyer
 *
 * Writes results to staging columns (buyer_type_ai_recommendation, buyer_type_confidence,
 * buyer_type_reasoning). Auto-applies when confidence >= 85 unless buyer_type_source = "admin_manual".
 *
 * Body: { batchSize?: number, offset?: number, dryRun?: boolean, onlyNeedsReview?: boolean }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { callClaude, CLAUDE_MODELS } from '../_shared/claude-client.ts';
import { requireAdmin } from '../_shared/auth.ts';

const VALID_TYPES = new Set([
  'private_equity',
  'corporate',
  'family_office',
  'search_fund',
  'independent_sponsor',
  'individual_buyer',
]);

const SYSTEM_PROMPT = `You are a senior M&A analyst at a lower-middle market investment bank. Classify buyers into exactly one of six categories.

THE SIX VALID TYPES:
1. private_equity - Formal fund (Fund I/II/III), LP investors, portfolio companies, investment thesis page, partners managing fund capital, defined hold period.
2. corporate - Operating company with its own revenue, employees, products/services. Acquires using balance sheet capital. No fund structure. Regardless of how many acquisitions they make.
3. family_office - Manages wealth for a single family. Direct investor. No LP fund structure. Often has a family surname in the name.
4. search_fund - Individual/small team using ETA model. Searching for first acquisition to operate. Often MBA graduate. SBA financing common.
5. independent_sponsor - Deal-by-deal. No committed fund capital. Raises equity per transaction from LPs or family offices.
6. individual_buyer - A high-net-worth individual using personal wealth to buy a company. No fund, no entity, no LP backing, no search fund structure. Just a person buying a business with their own money.

CRITICAL RULE: If the company has real operations, revenue, and customers - it is "corporate", not "private_equity". A dental rollup, MSP, manufacturer, services company doing acquisitions - all "corporate". Only classify as "private_equity" if you see clear evidence of LP capital being deployed through a fund structure.

SECONDARY CHECK: If you classify as "corporate", determine if this corporate is owned by a PE firm. Look for: "backed by [firm]", "portfolio company of", "a [firm] company", PE firm listed as parent/owner.

For each buyer, respond with a JSON object:
{
  "id": "the buyer ID",
  "type": "private_equity|corporate|family_office|search_fund|independent_sponsor|individual_buyer",
  "confidence": 0-100,
  "reasoning": "1-2 sentences citing specific evidence",
  "needs_review": true/false,
  "is_pe_backed": true/false,
  "pe_firm_name": "Name or null"
}

Return a JSON array of these objects. Return ONLY the JSON array. No markdown, no explanation.`;

const AUTO_APPLY_THRESHOLD = 85;

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
    const onlyNeedsReview = body.onlyNeedsReview || false;

    // Fetch buyers that need classification
    let query = supabase
      .from('remarketing_buyers')
      .select('id, company_name, pe_firm_name, thesis_summary, company_website, buyer_type, buyer_type_source, is_pe_backed')
      .eq('archived', false)
      .order('created_at', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (onlyNeedsReview) {
      query = query.eq('buyer_type_needs_review', true);
    }

    const { data: buyers, error: fetchError } = await query;

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
      thesis_snippet: (b.thesis_summary || '').slice(0, 200),
      website_domain: b.company_website ? b.company_website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null,
      current_buyer_type: b.buyer_type || null,
    }));

    const userPrompt = `Classify the buyer_type for each of these ${buyers.length} companies:\n\n${JSON.stringify(buyerList, null, 2)}`;

    const claudeResponse = await callClaude({
      model: CLAUDE_MODELS.sonnet,
      maxTokens: 8192,
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      timeoutMs: 60000,
    });

    const responseText = claudeResponse.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('');

    // Parse response
    let cleaned = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start >= 0 && end > start) cleaned = cleaned.substring(start, end + 1);

    const classifications: {
      id: string;
      type: string;
      confidence: number;
      reasoning: string;
      needs_review: boolean;
      is_pe_backed: boolean;
      pe_firm_name: string | null;
    }[] = JSON.parse(cleaned);

    // Apply updates
    let autoApplied = 0;
    let staged = 0;
    let skipped = 0;
    let protectedByAdmin = 0;
    const results: {
      id: string;
      company_name: string;
      old_type: string | null;
      new_type: string;
      confidence: number;
      auto_applied: boolean;
    }[] = [];

    for (const classification of classifications) {
      if (!VALID_TYPES.has(classification.type)) {
        skipped++;
        continue;
      }

      const buyer = buyers.find(b => b.id === classification.id);
      if (!buyer) { skipped++; continue; }

      const confidence = Math.max(0, Math.min(100, classification.confidence || 0));
      const needsReview = confidence < AUTO_APPLY_THRESHOLD || classification.needs_review;
      const isAdminManual = buyer.buyer_type_source === 'admin_manual';

      // Never auto-overwrite admin manual classifications
      const canAutoApply = confidence >= AUTO_APPLY_THRESHOLD && !isAdminManual && !dryRun;

      if (isAdminManual) {
        protectedByAdmin++;
      }

      const updateData: Record<string, unknown> = {
        buyer_type_ai_recommendation: classification.type,
        buyer_type_confidence: confidence,
        buyer_type_reasoning: classification.reasoning,
        buyer_type_needs_review: isAdminManual ? false : needsReview,
        buyer_type_classified_at: new Date().toISOString(),
      };

      if (canAutoApply) {
        updateData.buyer_type = classification.type;
        updateData.buyer_type_source = 'ai_auto';
        updateData.buyer_type_needs_review = false;

        // Set PE backing fields if AI detected it
        if (classification.is_pe_backed) {
          updateData.is_pe_backed = true;
          if (classification.pe_firm_name) {
            updateData.pe_firm_name = classification.pe_firm_name;
          }
        }
      }

      results.push({
        id: classification.id,
        company_name: buyer.company_name,
        old_type: buyer.buyer_type,
        new_type: classification.type,
        confidence,
        auto_applied: canAutoApply,
      });

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from('remarketing_buyers')
          .update(updateData)
          .eq('id', classification.id);

        if (updateError) {
          console.error(`Failed to update ${buyer.company_name}:`, updateError.message);
          skipped++;
          continue;
        }
      }

      if (canAutoApply) {
        autoApplied++;
      } else {
        staged++;
      }
    }

    return new Response(JSON.stringify({
      auto_applied: autoApplied,
      staged_for_review: staged,
      protected_by_admin: protectedByAdmin,
      skipped,
      total_in_batch: buyers.length,
      offset,
      next_offset: offset + batchSize,
      dry_run: dryRun,
      auto_apply_threshold: AUTO_APPLY_THRESHOLD,
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
