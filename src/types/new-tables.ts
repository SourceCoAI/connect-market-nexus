// ── Supplemental type definitions for new tables ─────────────────────
// These tables exist in the database but are NOT yet reflected in the
// auto-generated Supabase types file (src/integrations/supabase/types.ts).
//
// Once `supabase gen types typescript` is re-run against the live schema
// these manual definitions can be removed and replaced by imports from
// the generated file.
//
// Last audited: 2026-03-04

import type { Json } from '@/integrations/supabase/types';

// ─────────────────────────────────────────────────────────────────────
// admin_view_state
// ─────────────────────────────────────────────────────────────────────

/** Row shape returned by SELECT on admin_view_state. */
export interface AdminViewStateRow {
  id: string;
  admin_id: string;
  view_type: string;
  last_viewed_at: string;
  created_at: string | null;
  updated_at: string | null;
}

/** Shape for INSERT into admin_view_state. */
export interface AdminViewStateInsert {
  id?: string;
  admin_id: string;
  view_type: string;
  last_viewed_at?: string;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Shape for UPDATE on admin_view_state. */
export interface AdminViewStateUpdate {
  id?: string;
  admin_id?: string;
  view_type?: string;
  last_viewed_at?: string;
  created_at?: string | null;
  updated_at?: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// api_rate_limits
// ─────────────────────────────────────────────────────────────────────

/** Row shape returned by SELECT on api_rate_limits. */
export interface ApiRateLimitsRow {
  provider: string;
  max_concurrent: number;
  max_per_minute: number;
  max_per_hour: number;
  daily_cost_limit_usd: number;
  updated_at: string | null;
}

/** Shape for INSERT into api_rate_limits. */
export interface ApiRateLimitsInsert {
  provider: string;
  max_concurrent?: number;
  max_per_minute?: number;
  max_per_hour?: number;
  daily_cost_limit_usd?: number;
  updated_at?: string | null;
}

/** Shape for UPDATE on api_rate_limits. */
export interface ApiRateLimitsUpdate {
  provider?: string;
  max_concurrent?: number;
  max_per_minute?: number;
  max_per_hour?: number;
  daily_cost_limit_usd?: number;
  updated_at?: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// api_semaphore
// ─────────────────────────────────────────────────────────────────────

/** Row shape returned by SELECT on api_semaphore. */
export interface ApiSemaphoreRow {
  id: string;
  provider: string;
  slot_holder: string;
  acquired_at: string;
  expires_at: string;
  released_at: string | null;
  metadata: Json | null;
}

/** Shape for INSERT into api_semaphore. */
export interface ApiSemaphoreInsert {
  id?: string;
  provider: string;
  slot_holder: string;
  acquired_at?: string;
  expires_at: string;
  released_at?: string | null;
  metadata?: Json | null;
}

/** Shape for UPDATE on api_semaphore. */
export interface ApiSemaphoreUpdate {
  id?: string;
  provider?: string;
  slot_holder?: string;
  acquired_at?: string;
  expires_at?: string;
  released_at?: string | null;
  metadata?: Json | null;
}
