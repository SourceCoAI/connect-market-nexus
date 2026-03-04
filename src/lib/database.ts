/**
 * Database Utility Layer
 *
 * Type-safe query builder helpers, common query patterns (paginated fetch,
 * filtered query), error handling wrapper for Supabase queries, and a
 * connection health check function.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Names of all public tables in the database. */
type TableName = keyof Database['public']['Tables'];

/** Row type for a given table. */
type Row<T extends TableName> = Database['public']['Tables'][T]['Row'];

/** Insert type for a given table. */
type InsertRow<T extends TableName> = Database['public']['Tables'][T]['Insert'];

/** Update type for a given table. */
type UpdateRow<T extends TableName> = Database['public']['Tables'][T]['Update'];

/** Standard API response wrapper. */
export interface DatabaseResult<T> {
  data: T | null;
  error: DatabaseError | null;
  count: number | null;
}

/** Normalised error object returned by all helpers. */
export interface DatabaseError {
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
}

/** Options accepted by the paginated fetch helper. */
export interface PaginationOptions {
  page: number;
  pageSize: number;
}

/** Options accepted by the filtered query helper. */
export interface FilterOptions<T extends TableName> {
  column: keyof Row<T> & string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is';
  value: unknown;
}

/** Options for ordering results. */
export interface OrderOptions<T extends TableName> {
  column: keyof Row<T> & string;
  ascending?: boolean;
}

/** Combined query options. */
export interface QueryOptions<T extends TableName> {
  filters?: FilterOptions<T>[];
  order?: OrderOptions<T>;
  pagination?: PaginationOptions;
  select?: string;
}

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

/**
 * Normalise a Supabase PostgREST error into our DatabaseError shape.
 */
function normaliseError(error: unknown): DatabaseError {
  if (error && typeof error === 'object' && 'message' in error) {
    const e = error as Record<string, unknown>;
    return {
      message: String(e.message ?? 'Unknown database error'),
      code: e.code != null ? String(e.code) : null,
      details: e.details != null ? String(e.details) : null,
      hint: e.hint != null ? String(e.hint) : null,
    };
  }
  return {
    message: String(error),
    code: null,
    details: null,
    hint: null,
  };
}

/**
 * Wraps an async Supabase query and returns a DatabaseResult.
 * Catches both thrown exceptions and Supabase error objects.
 */
export async function safeQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: unknown; count?: number | null }>,
): Promise<DatabaseResult<T>> {
  try {
    const result = await queryFn();
    if (result.error) {
      return {
        data: null,
        error: normaliseError(result.error),
        count: null,
      };
    }
    return {
      data: result.data,
      error: null,
      count: result.count ?? null,
    };
  } catch (err) {
    return {
      data: null,
      error: normaliseError(err),
      count: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Query Builders
// ---------------------------------------------------------------------------

/**
 * Fetch rows from a table with optional filters, ordering, and pagination.
 *
 * @example
 * ```ts
 * const result = await fetchRows('deals', {
 *   filters: [{ column: 'priority', operator: 'eq', value: 'high' }],
 *   order: { column: 'created_at', ascending: false },
 *   pagination: { page: 1, pageSize: 20 },
 * });
 * ```
 */
export async function fetchRows<T extends TableName>(
  table: T,
  options: QueryOptions<T> = {},
): Promise<DatabaseResult<Row<T>[]>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return safeQuery<Row<T>[]>(async (): Promise<any> => {
    const { filters, order, pagination, select } = options;

    let query = supabase.from(table).select(select ?? '*', { count: 'exact' });

    // Apply filters
    if (filters) {
      for (const f of filters) {
        switch (f.operator) {
          case 'eq':
            query = query.eq(f.column, f.value as never);
            break;
          case 'neq':
            query = query.neq(f.column, f.value as never);
            break;
          case 'gt':
            query = query.gt(f.column, f.value as never);
            break;
          case 'gte':
            query = query.gte(f.column, f.value as never);
            break;
          case 'lt':
            query = query.lt(f.column, f.value as never);
            break;
          case 'lte':
            query = query.lte(f.column, f.value as never);
            break;
          case 'like':
            query = query.like(f.column, f.value as never);
            break;
          case 'ilike':
            query = query.ilike(f.column, f.value as never);
            break;
          case 'in':
            query = query.in(f.column, f.value as never[]);
            break;
          case 'is':
            query = query.is(f.column, f.value as null);
            break;
        }
      }
    }

    // Apply ordering
    if (order) {
      query = query.order(order.column as never, {
        ascending: order.ascending ?? true,
      });
    }

    // Apply pagination
    if (pagination) {
      const { page, pageSize } = pagination;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);
    }

    return query as unknown as { data: Row<T>[] | null; error: unknown; count?: number | null };
  });
}

/**
 * Fetch a single row by its primary key.
 */
export async function fetchById<T extends TableName>(
  table: T,
  id: string,
  select?: string,
): Promise<DatabaseResult<Row<T>>> {
  return safeQuery(async () => {
    return supabase
      .from(table)
      .select(select ?? '*')
      .eq('id' as never, id)
      .single();
  });
}

/**
 * Insert one or more rows into a table.
 */
export async function insertRows<T extends TableName>(
  table: T,
  rows: InsertRow<T> | InsertRow<T>[],
): Promise<DatabaseResult<Row<T>[]>> {
  return safeQuery(async () => {
    const payload = Array.isArray(rows) ? rows : [rows];
    return supabase
      .from(table)
      .insert(payload as never[])
      .select();
  });
}

/**
 * Update a row by its primary key.
 */
export async function updateRow<T extends TableName>(
  table: T,
  id: string,
  updates: UpdateRow<T>,
): Promise<DatabaseResult<Row<T>>> {
  return safeQuery(async () => {
    return supabase
      .from(table)
      .update(updates as never)
      .eq('id' as never, id)
      .select()
      .single();
  });
}

/**
 * Soft-delete a row (sets deleted_at = now) if the table supports it,
 * otherwise performs a hard delete.
 */
export async function deleteRow<T extends TableName>(
  table: T,
  id: string,
  soft = true,
): Promise<DatabaseResult<Row<T>>> {
  if (soft) {
    return safeQuery(async () => {
      return supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq('id' as never, id)
        .select()
        .single();
    });
  }
  return safeQuery(async () => {
    return supabase
      .from(table)
      .delete()
      .eq('id' as never, id)
      .select()
      .single();
  });
}

// ---------------------------------------------------------------------------
// Paginated Fetch
// ---------------------------------------------------------------------------

/** Return shape for paginated queries. */
export interface PaginatedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  error: DatabaseError | null;
}

/**
 * Convenience wrapper that returns paginated results with metadata.
 *
 * @example
 * ```ts
 * const page = await paginatedFetch('deals', {
 *   page: 2,
 *   pageSize: 25,
 *   filters: [{ column: 'source', operator: 'eq', value: 'marketplace' }],
 *   order: { column: 'created_at', ascending: false },
 * });
 *
 * console.log(page.totalPages, page.hasNextPage);
 * ```
 */
export async function paginatedFetch<T extends TableName>(
  table: T,
  options: QueryOptions<T> & { page?: number; pageSize?: number } = {},
): Promise<PaginatedResult<Row<T>>> {
  const page = options.page ?? options.pagination?.page ?? 1;
  const pageSize = options.pageSize ?? options.pagination?.pageSize ?? 25;

  const result = await fetchRows(table, {
    ...options,
    pagination: { page, pageSize },
  });

  const totalCount = result.count ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return {
    data: result.data ?? [],
    page,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    error: result.error,
  };
}

// ---------------------------------------------------------------------------
// Connection Health Check
// ---------------------------------------------------------------------------

/** Health check response. */
export interface HealthCheckResult {
  connected: boolean;
  latencyMs: number;
  timestamp: string;
  error: string | null;
}

/**
 * Performs a lightweight round-trip to Supabase to verify connectivity.
 * Uses a simple SELECT 1 against the profiles table (which always exists).
 */
export async function checkDatabaseHealth(): Promise<HealthCheckResult> {
  const start = performance.now();
  try {
    const { error } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    const latencyMs = Math.round(performance.now() - start);

    if (error) {
      return {
        connected: false,
        latencyMs,
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }

    return {
      connected: true,
      latencyMs,
      timestamp: new Date().toISOString(),
      error: null,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      connected: false,
      latencyMs,
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Audit Logging Helper
// ---------------------------------------------------------------------------

/**
 * Writes an entry to the audit_log table from the client side.
 * Requires the caller to be an admin (enforced by RLS).
 */
export async function writeAuditLog(entry: {
  tableName: string;
  recordId?: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT' | 'LOGIN' | 'LOGOUT' | 'EXPORT';
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
}): Promise<DatabaseResult<unknown>> {
  return safeQuery(async () => {
    return supabase.from('audit_log').insert({
      table_name: entry.tableName,
      record_id: entry.recordId ?? null,
      action: entry.action,
      old_data: entry.oldData ?? null,
      new_data: entry.newData ?? null,
    });
  });
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export type { TableName, Row, InsertRow, UpdateRow };
