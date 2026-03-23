/**
 * Standardized response helpers for edge functions.
 *
 * All responses follow consistent JSON schemas:
 *   Success: { data: T, meta?: { ... } }
 *   Error:   { error: string, error_code?: string }
 *
 * Re-exports errorResponse from error-response.ts for convenience.
 */

export { errorResponse, type ErrorResponseBody } from './error-response.ts';

export interface SuccessResponseBody<T = unknown> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * Build a JSON success Response with consistent schema.
 */
export function successResponse<T>(
  data: T,
  corsHeaders: Record<string, string>,
  meta?: Record<string, unknown>,
  status: number = 200,
): Response {
  const body: SuccessResponseBody<T> = { data };
  if (meta) body.meta = meta;
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Build a CORS preflight (OPTIONS) response.
 */
export function corsResponse(corsHeaders: Record<string, string>): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}
