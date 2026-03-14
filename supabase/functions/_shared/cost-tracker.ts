/**
 * AI Cost Tracker
 *
 * Logs token usage and estimated costs for every AI API call.
 * Writes to `enrichment_cost_log` table for visibility and budgeting.
 *
 * Designed to be non-blocking — cost logging never fails the actual AI operation.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type CostProvider = 'gemini' | 'anthropic';

// Pricing per million tokens (as of Feb 2026)
const PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  'gemini-2.0-flash':          { inputPerMTok: 0.10, outputPerMTok: 0.40 },
  'gemini-2.0-pro-exp':        { inputPerMTok: 1.25, outputPerMTok: 5.00 },
  'claude-sonnet-4-6':       { inputPerMTok: 3.00, outputPerMTok: 15.00 },
  'claude-sonnet-4-20250514':  { inputPerMTok: 3.00, outputPerMTok: 15.00 },
};

export interface CostEntry {
  function_name: string;
  provider: CostProvider;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Calculate estimated cost for a given model and token usage.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = PRICING[model];
  if (!pricing) {
    // Unknown model — use a conservative estimate
    return (inputTokens * 1.0 + outputTokens * 3.0) / 1_000_000;
  }
  return (inputTokens * pricing.inputPerMTok + outputTokens * pricing.outputPerMTok) / 1_000_000;
}

/**
 * Log an AI call's cost to the database.
 * This is NON-BLOCKING — failures are caught and logged, never thrown.
 */
export async function logCost(
  supabase: SupabaseClient,
  entry: CostEntry
): Promise<void> {
  try {
    await supabase
      .from('enrichment_cost_log')
      .insert({
        function_name: entry.function_name,
        provider: entry.provider,
        model: entry.model,
        input_tokens: entry.input_tokens,
        output_tokens: entry.output_tokens,
        estimated_cost_usd: entry.estimated_cost_usd,
        duration_ms: entry.duration_ms,
        metadata: entry.metadata,
        created_at: new Date().toISOString(),
      });
  } catch (err) {
    // Non-blocking — don't let cost logging break the operation
    console.warn('[cost-tracker] Failed to log cost:', err);
  }
}

/**
 * Log cost from an AI response that includes usage data.
 * Convenience wrapper that calculates cost automatically.
 */
export async function logAICallCost(
  supabase: SupabaseClient,
  functionName: string,
  provider: CostProvider,
  model: string,
  usage: { inputTokens: number; outputTokens: number } | null | undefined,
  durationMs?: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!usage) return; // No usage data available

  const cost = estimateCost(model, usage.inputTokens, usage.outputTokens);

  await logCost(supabase, {
    function_name: functionName,
    provider,
    model,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    estimated_cost_usd: cost,
    duration_ms: durationMs,
    metadata,
  });
}

/**
 * Get total spend for a given time period.
 * Useful for budget monitoring and alerts.
 */
export async function getTotalSpend(
  supabase: SupabaseClient,
  sinceIso?: string
): Promise<{ total: number; byProvider: Record<string, number>; byFunction: Record<string, number> }> {
  try {
    let query = supabase
      .from('enrichment_cost_log')
      .select('provider, function_name, estimated_cost_usd');

    if (sinceIso) {
      query = query.gte('created_at', sinceIso);
    }

    const { data, error } = await query;
    if (error || !data) return { total: 0, byProvider: {}, byFunction: {} };

    let total = 0;
    const byProvider: Record<string, number> = {};
    const byFunction: Record<string, number> = {};

    for (const row of data) {
      const cost = row.estimated_cost_usd || 0;
      total += cost;
      byProvider[row.provider] = (byProvider[row.provider] || 0) + cost;
      byFunction[row.function_name] = (byFunction[row.function_name] || 0) + cost;
    }

    return { total, byProvider, byFunction };
  } catch {
    return { total: 0, byProvider: {}, byFunction: {} };
  }
}
