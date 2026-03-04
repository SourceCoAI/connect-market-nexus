/**
 * Shared Enrichment Types
 *
 * Common type definitions for the enrichment pipeline used by both
 * enrich-deal and enrich-buyer edge functions. Centralizes the
 * interfaces so that report shapes, step statuses, and result
 * structures are consistent across entity types.
 *
 * CONSUMERS:
 *   - supabase/functions/enrich-deal/index.ts
 *   - supabase/functions/enrich-buyer/index.ts
 *   - supabase/functions/_shared/enrichment/pipeline.ts
 */

// ============================================================================
// STEP & PIPELINE STATUS
// ============================================================================

/** Possible outcomes for a single enrichment step. */
export type EnrichmentStepStatus =
  | 'success'
  | 'partial'
  | 'skipped'
  | 'failure'
  | 'timeout'
  | 'rate_limited';

/** Possible overall outcomes for an enrichment run. */
export type EnrichmentOutcome =
  | 'success'
  | 'partial'
  | 'failure'
  | 'no_data';

/** Entity types that can be enriched. */
export type EnrichmentEntityType = 'deal' | 'buyer';

// ============================================================================
// STEP RESULT
// ============================================================================

/**
 * Result of a single enrichment step (e.g. transcript processing,
 * website scraping, AI extraction, external enrichment).
 *
 * Generic parameter `D` allows steps to attach step-specific detail
 * payloads (e.g. scrape page summaries, transcript counts).
 */
export interface EnrichmentStepResult<D = Record<string, unknown>> {
  /** Machine-readable step name (e.g. 'transcripts', 'website_scrape', 'ai_extraction'). */
  stepName: string;
  /** Human-readable label for logs and reports. */
  label: string;
  /** Outcome of this step. */
  status: EnrichmentStepStatus;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Fields that were updated on the entity by this step. */
  fieldsUpdated: string[];
  /** Non-fatal warnings produced during this step. */
  warnings: string[];
  /** Error message if status is 'failure' or 'timeout'. */
  errorMessage?: string;
  /** Step-specific detail payload. */
  details?: D;
}

// ============================================================================
// ENRICHMENT RESULT
// ============================================================================

/**
 * Complete result returned by an enrichment pipeline run.
 * Used to build the HTTP response and to log enrichment events.
 */
export interface EnrichmentResult {
  /** Whether the overall enrichment succeeded (at least partially). */
  success: boolean;
  /** Overall outcome classification. */
  outcome: EnrichmentOutcome;
  /** Human-readable summary message. */
  message: string;
  /** Union of all fields updated across all steps. */
  fieldsUpdated: string[];
  /** Per-step results for detailed reporting. */
  steps: EnrichmentStepResult[];
  /** Total wall-clock duration in milliseconds. */
  totalDurationMs: number;
  /** Warnings aggregated from all steps. */
  warnings: string[];
}

// ============================================================================
// ENRICHMENT REPORT
// ============================================================================

/**
 * Structured enrichment report intended for the HTTP response body.
 * Extends EnrichmentResult with entity metadata so callers can
 * correlate the report back to the enriched record.
 */
export interface EnrichmentReport extends EnrichmentResult {
  /** Entity type that was enriched ('deal' or 'buyer'). */
  entityType: EnrichmentEntityType;
  /** ID of the entity that was enriched. */
  entityId: string;
  /** ISO timestamp when enrichment started. */
  startedAt: string;
  /** ISO timestamp when enrichment finished. */
  completedAt: string;
}

// ============================================================================
// PIPELINE STEP DEFINITION
// ============================================================================

/**
 * Definition of a single step in an enrichment pipeline.
 * The pipeline orchestrator iterates over an array of these to execute
 * the enrichment in order, with error isolation per step.
 */
export interface EnrichmentPipelineStep<TContext = unknown> {
  /** Machine-readable step name. */
  name: string;
  /** Human-readable label. */
  label: string;
  /**
   * Whether this step should be executed.
   * Receives the shared pipeline context so steps can be conditionally
   * skipped based on results of prior steps.
   */
  shouldRun: (ctx: TContext) => boolean;
  /**
   * Execute the step. Receives the shared context (mutable) and must
   * return the list of field names it updated.
   *
   * Throwing an error is allowed -- the pipeline orchestrator catches
   * it and records it as a step failure.
   */
  execute: (ctx: TContext) => Promise<string[]>;
}

// ============================================================================
// PIPELINE OPTIONS
// ============================================================================

/**
 * Configuration options for the pipeline orchestrator.
 */
export interface EnrichmentPipelineOptions {
  /** Entity type being enriched (for logging and event tracking). */
  entityType: EnrichmentEntityType;
  /** Entity ID being enriched. */
  entityId: string;
  /** Edge function name (e.g. 'enrich-deal', 'enrich-buyer'). */
  functionName: string;
  /** AI provider name (e.g. 'gemini'). Default: 'gemini'. */
  provider?: string;
}

// ============================================================================
// UTILITY TYPE: EXTRACTION SOURCE SUMMARY
// ============================================================================

/**
 * Lightweight summary of where an enrichment field value came from.
 * Used when building the final response to show provenance per field.
 */
export interface FieldSourceSummary {
  field: string;
  source: string;
  stepName: string;
}
