/**
 * Shared Enrichment Pipeline Orchestrator
 *
 * Generic pipeline runner for enrichment edge functions. Executes an
 * ordered list of enrichment steps with:
 *   - Error isolation: a failing step does not abort subsequent steps
 *   - Automatic timing: wall-clock duration tracked per step
 *   - Report generation: builds a structured EnrichmentResult from step outcomes
 *   - Observability: logs step start/end/error to console with consistent formatting
 *
 * Used by both enrich-deal and enrich-buyer to avoid duplicating
 * orchestration logic. Each function defines its own steps and context
 * shape, then hands them to `runEnrichmentPipeline`.
 *
 * CONSUMERS:
 *   - supabase/functions/enrich-deal/index.ts
 *   - supabase/functions/enrich-buyer/index.ts
 *
 * @module _shared/enrichment/pipeline
 */

import type {
  EnrichmentPipelineStep,
  EnrichmentStepResult,
  EnrichmentStepStatus,
  EnrichmentResult,
  EnrichmentReport,
  EnrichmentOutcome,
  EnrichmentPipelineOptions,
} from './types.ts';

// Re-export types so consumers can import everything from pipeline.ts
export type {
  EnrichmentPipelineStep,
  EnrichmentStepResult,
  EnrichmentStepStatus,
  EnrichmentResult,
  EnrichmentReport,
  EnrichmentOutcome,
  EnrichmentPipelineOptions,
};
export type {
  EnrichmentEntityType,
  FieldSourceSummary,
} from './types.ts';

// ============================================================================
// ERROR UTILITIES
// ============================================================================

/**
 * Safely extract a human-readable error message from any thrown value.
 *
 * Both enrich-deal and enrich-buyer had identical copies of this helper.
 * Centralised here so changes propagate everywhere.
 */
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return String((error as { message: string }).message);
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
};

/**
 * Classify an error message into an EnrichmentStepStatus.
 * Used by the pipeline to set the right status when a step throws.
 */
export function classifyError(errorMessage: string): EnrichmentStepStatus {
  if (errorMessage.includes('timeout') || errorMessage.includes('abort') || errorMessage.includes('EDGE_TIMEOUT')) {
    return 'timeout';
  }
  if (errorMessage.includes('429') || errorMessage.includes('rate')) {
    return 'rate_limited';
  }
  return 'failure';
}

// ============================================================================
// STEP EXECUTION
// ============================================================================

/**
 * Execute a single enrichment pipeline step with error isolation and timing.
 *
 * - If the step's `shouldRun` returns false, it is recorded as 'skipped'.
 * - If the step throws, the error is caught and recorded as 'failure'
 *   (or 'timeout' / 'rate_limited' based on the error message).
 * - Otherwise the step is 'success' (or 'partial' if it returned fields
 *   but also produced warnings).
 */
export async function executeStep<TContext>(
  step: EnrichmentPipelineStep<TContext>,
  ctx: TContext,
): Promise<EnrichmentStepResult> {
  // Check precondition
  if (!step.shouldRun(ctx)) {
    console.log(`[${step.name}] Skipped: precondition not met`);
    return {
      stepName: step.name,
      label: step.label,
      status: 'skipped',
      durationMs: 0,
      fieldsUpdated: [],
      warnings: [],
    };
  }

  const startMs = Date.now();
  console.log(`[${step.name}] Starting: ${step.label}`);

  try {
    const fieldsUpdated = await step.execute(ctx);
    const durationMs = Date.now() - startMs;
    const status: EnrichmentStepStatus = fieldsUpdated.length > 0 ? 'success' : 'partial';

    console.log(
      `[${step.name}] Completed in ${durationMs}ms: ${fieldsUpdated.length} fields updated`,
    );

    return {
      stepName: step.name,
      label: step.label,
      status,
      durationMs,
      fieldsUpdated,
      warnings: [],
    };
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const errorMessage = getErrorMessage(err);
    const status = classifyError(errorMessage);

    console.error(`[${step.name}] Failed in ${durationMs}ms (${status}): ${errorMessage}`);

    return {
      stepName: step.name,
      label: step.label,
      status,
      durationMs,
      fieldsUpdated: [],
      warnings: [],
      errorMessage,
    };
  }
}

// ============================================================================
// OUTCOME CLASSIFICATION
// ============================================================================

/**
 * Determine the overall enrichment outcome from the step results.
 *
 * - 'success'  if at least one step succeeded and none critically failed
 * - 'partial'  if some steps succeeded and some failed
 * - 'failure'  if all executed steps failed
 * - 'no_data'  if all steps were skipped (nothing to enrich)
 */
export function classifyOutcome(steps: EnrichmentStepResult[]): EnrichmentOutcome {
  const executed = steps.filter((s) => s.status !== 'skipped');
  if (executed.length === 0) return 'no_data';

  const succeeded = executed.filter(
    (s) => s.status === 'success' || s.status === 'partial',
  );
  const failed = executed.filter(
    (s) => s.status === 'failure' || s.status === 'timeout' || s.status === 'rate_limited',
  );

  if (failed.length === 0) return 'success';
  if (succeeded.length > 0) return 'partial';
  return 'failure';
}

// ============================================================================
// REPORT BUILDING
// ============================================================================

/**
 * Build a human-readable summary message from step results.
 */
export function buildSummaryMessage(
  entityType: string,
  steps: EnrichmentStepResult[],
  outcome: EnrichmentOutcome,
): string {
  const allFields = steps.flatMap((s) => s.fieldsUpdated);
  const uniqueFields = [...new Set(allFields)];

  if (outcome === 'no_data') {
    return `No enrichment steps were applicable for this ${entityType}.`;
  }

  const sourceParts: string[] = [];
  for (const step of steps) {
    if (step.fieldsUpdated.length > 0) {
      sourceParts.push(`${step.fieldsUpdated.length} from ${step.label.toLowerCase()}`);
    }
  }

  const fieldsSummary = sourceParts.length > 0
    ? ` (${sourceParts.join(', ')})`
    : '';

  if (outcome === 'success') {
    return `Successfully enriched ${entityType} with ${uniqueFields.length} fields${fieldsSummary}.`;
  }
  if (outcome === 'partial') {
    const failedSteps = steps
      .filter((s) => s.status === 'failure' || s.status === 'timeout' || s.status === 'rate_limited')
      .map((s) => s.label.toLowerCase());
    return `Partially enriched ${entityType} with ${uniqueFields.length} fields${fieldsSummary}. Failed steps: ${failedSteps.join(', ')}.`;
  }
  // failure
  const errors = steps
    .filter((s) => s.errorMessage)
    .map((s) => `${s.label}: ${s.errorMessage!.substring(0, 100)}`)
    .join('; ');
  return `Enrichment failed for ${entityType}. ${errors}`;
}

/**
 * Build an EnrichmentResult from an array of step results.
 */
export function buildEnrichmentResult(
  options: EnrichmentPipelineOptions,
  steps: EnrichmentStepResult[],
  startTime: number,
): EnrichmentResult {
  const outcome = classifyOutcome(steps);
  const allFields = [...new Set(steps.flatMap((s) => s.fieldsUpdated))];
  const allWarnings = steps.flatMap((s) => s.warnings);

  return {
    success: outcome === 'success' || outcome === 'partial',
    outcome,
    message: buildSummaryMessage(options.entityType, steps, outcome),
    fieldsUpdated: allFields,
    steps,
    totalDurationMs: Date.now() - startTime,
    warnings: allWarnings,
  };
}

/**
 * Build a full EnrichmentReport (result + entity metadata).
 */
export function buildEnrichmentReport(
  options: EnrichmentPipelineOptions,
  steps: EnrichmentStepResult[],
  startTime: number,
): EnrichmentReport {
  const result = buildEnrichmentResult(options, steps, startTime);
  return {
    ...result,
    entityType: options.entityType,
    entityId: options.entityId,
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
  };
}

// ============================================================================
// PIPELINE ORCHESTRATOR
// ============================================================================

/**
 * Run an enrichment pipeline: execute each step sequentially with error
 * isolation, then build and return the structured result.
 *
 * Steps are run in order. A failing step does NOT prevent subsequent
 * steps from running -- each step's error is captured in its result.
 *
 * Usage:
 * ```ts
 * const steps: EnrichmentPipelineStep<MyContext>[] = [ ... ];
 * const result = await runEnrichmentPipeline(steps, ctx, {
 *   entityType: 'deal',
 *   entityId: dealId,
 *   functionName: 'enrich-deal',
 * });
 * ```
 */
export async function runEnrichmentPipeline<TContext>(
  steps: EnrichmentPipelineStep<TContext>[],
  ctx: TContext,
  options: EnrichmentPipelineOptions,
): Promise<EnrichmentResult> {
  const startTime = Date.now();
  const stepResults: EnrichmentStepResult[] = [];

  console.log(
    `[${options.functionName}] Starting enrichment pipeline for ${options.entityType} ${options.entityId} (${steps.length} steps)`,
  );

  for (const step of steps) {
    const result = await executeStep(step, ctx);
    stepResults.push(result);
  }

  const enrichmentResult = buildEnrichmentResult(options, stepResults, startTime);

  console.log(
    `[${options.functionName}] Pipeline complete: outcome=${enrichmentResult.outcome}, ` +
      `fields=${enrichmentResult.fieldsUpdated.length}, ` +
      `duration=${enrichmentResult.totalDurationMs}ms`,
  );

  return enrichmentResult;
}
