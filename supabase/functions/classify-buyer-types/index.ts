/**
 * classify-buyer-types – AI classification using canonical 6-type taxonomy
 *
 * Uses Claude Sonnet to classify buyers into one of 6 canonical types:
 *   private_equity, corporate, family_office, search_fund, independent_sponsor, individual_buyer
 *
 * Features:
 * - Confidence-based auto-apply (>= 85) vs staging for admin review (< 85)
 * - Admin manual overrides are never auto-overwritten
 * - Detects PE-backed corporates and sets is_pe_backed + pe_firm_name
 * - Platform Company Rule enforced in code (pe_firm_name → corporate + is_pe_backed)
 *
 * Body: { batchSize?: number, offset?: number, dryRun?: boolean, onlyNeedsReview?: boolean }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { callClaude, CLAUDE_MODELS } from '../_shared/claude-client.ts';
import { requireAdmin } from '../_shared/auth.ts';
import {
  buildClassificationSystemPrompt,
  isValidBuyerType,
} from '../_shared/buyer-type-definitions.ts';

const SYSTEM_PROMPT = buildClassificationSystemPrompt();

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
      .from('buyers')
      .select(
        'id, company_name, pe_firm_name, thesis_summary, company_website, buyer_type, buyer_type_source',
      )
      .eq('archived', false)
      .order('created_at', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (onlyNeedsReview) {
      query = query.eq('buyer_type_needs_review', true);
    }

    const { data: buyers, error: fetchError } = await query;

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch buyers', details: fetchError.message }),
        {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' },
        },
      );
    }

    if (!buyers || buyers.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No more buyers to classify', classified: 0 }),
        {
          headers: { ...headers, 'Content-Type': 'application/json' },
        },
      );
    }

    const buyerList = buyers.map((b) => ({
      id: b.id,
      company_name: b.company_name,
      pe_firm_name: b.pe_firm_name || null,
      thesis_snippet: (b.thesis_summary || '').slice(0, 200),
      website_domain: b.company_website
        ? b.company_website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
        : null,
      current_type: b.buyer_type || 'unclassified',
    }));

    const userPrompt = `Classify the buyer_type for each of these ${buyers.length} companies:\n\n${JSON.stringify(buyerList, null, 2)}`;

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

    let cleaned = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start >= 0 && end > start) cleaned = cleaned.substring(start, end + 1);

    const classifications: {
      id: string;
      type: string;
      confidence: number;
      reasoning: string;
      is_pe_backed?: boolean;
      pe_firm_name?: string | null;
    }[] = JSON.parse(cleaned);

    let autoApplied = 0;
    let stagedForReview = 0;
    let skipped = 0;
    const results: {
      id: string;
      company_name: string;
      old_type: string | null;
      new_type: string;
      confidence: number;
      action: string;
    }[] = [];

    for (const classification of classifications) {
      if (!isValidBuyerType(classification.type)) {
        skipped++;
        continue;
      }

      const buyer = buyers.find((b) => b.id === classification.id);
      if (!buyer) {
        skipped++;
        continue;
      }

      // Platform Company Rule: if pe_firm_name is set, force corporate + is_pe_backed
      if (buyer.pe_firm_name && buyer.pe_firm_name.trim() !== '') {
        classification.type = 'corporate';
        classification.is_pe_backed = true;
        classification.pe_firm_name = buyer.pe_firm_name;
      }

      // PE firms are never PE-backed themselves
      if (classification.type === 'private_equity') {
        classification.is_pe_backed = false;
      }

      // Never auto-overwrite admin manual classifications
      if (buyer.buyer_type_source === 'admin_manual') {
        results.push({
          id: classification.id,
          company_name: buyer.company_name,
          old_type: buyer.buyer_type,
          new_type: classification.type,
          confidence: classification.confidence,
          action: 'skipped_admin_override',
        });
        skipped++;
        continue;
      }

      // Audit P3: Flag low-confidence classifications for manual review
      // Confidence < 70: always flag for review (never auto-apply)
      // Confidence 70-84: stage for review
      // Confidence >= 85: auto-apply
      const autoApply = classification.confidence >= 85;
      const lowConfidence = classification.confidence < 70;
      const action = autoApply
        ? 'auto_applied'
        : lowConfidence
          ? 'flagged_low_confidence'
          : 'staged_for_review';

      results.push({
        id: classification.id,
        company_name: buyer.company_name,
        old_type: buyer.buyer_type,
        new_type: classification.type,
        confidence: classification.confidence,
        action,
      });

      if (!dryRun) {
        const updateData: Record<string, unknown> = {
          buyer_type_ai_recommendation: classification.type,
          buyer_type_confidence: classification.confidence,
          buyer_type_reasoning: classification.reasoning,
          buyer_type_classified_at: new Date().toISOString(),
        };

        if (autoApply) {
          updateData.buyer_type = classification.type;
          updateData.buyer_type_source = 'ai_auto';
          updateData.buyer_type_needs_review = false;
          autoApplied++;
        } else {
          // Both low-confidence and medium-confidence go to review queue
          updateData.buyer_type_needs_review = true;
          stagedForReview++;
        }

        if (classification.is_pe_backed) {
          updateData.is_pe_backed = true;
          if (classification.pe_firm_name) {
            updateData.pe_firm_name = classification.pe_firm_name;
          }
        }

        const { error: updateError } = await supabase
          .from('buyers')
          .update(updateData)
          .eq('id', classification.id);

        if (updateError) {
          console.error(`Failed to update ${buyer.company_name}:`, updateError.message);
          skipped++;
        }
      } else {
        if (autoApply) autoApplied++;
        else stagedForReview++;
      }
    }

    return new Response(
      JSON.stringify({
        auto_applied: autoApplied,
        staged_for_review: stagedForReview,
        skipped,
        total_in_batch: buyers.length,
        offset,
        next_offset: offset + batchSize,
        dry_run: dryRun,
        results,
        usage: claudeResponse.usage,
      }),
      {
        headers: { ...headers, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('classify-buyer-types error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
      },
    );
  }
});
