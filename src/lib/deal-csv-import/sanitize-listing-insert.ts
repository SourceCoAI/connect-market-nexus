import { DEAL_IMPORT_FIELDS } from './constants';

/**
 * Final safety net: ensure we never attempt to insert columns that don't exist.
 * This prevents PGRST204 schema-cache errors when older AI models suggest legacy fields.
 */

const EXTRA_ALLOWED_FIELDS = [
  // system-managed / defaults we set during import
  'status',
  'is_internal_deal',
  'deal_source',
  'pushed_to_all_deals',
  // required in schema (NOT NULL) but not user-mapped (public/anon-friendly)
  'location',
  // row-processor default
  'category',
  // row-processor address default
  'address_country',
] as const;

export const ALLOWED_LISTING_INSERT_FIELDS = new Set<string>([
  ...DEAL_IMPORT_FIELDS.map((f) => f.value),
  ...EXTRA_ALLOWED_FIELDS,
]);

export function sanitizeListingInsert<T extends Record<string, unknown>>(data: T): Partial<T> {
  const out: Partial<T> = {};

  // Copy allowed fields only
  for (const [k, v] of Object.entries(data)) {
    if (!ALLOWED_LISTING_INSERT_FIELDS.has(k)) continue;
    if (v === undefined) continue;
    out[k as keyof T] = v as T[keyof T];
  }

  // CRITICAL: Ensure required NOT NULL fields have valid values
  // These defaults prevent database constraint violations
  // Use record-style access since we're working with dynamic keys from CSV import
  const record = out as Record<string, unknown>;

  // description: required string, default to title if missing
  if (typeof record.description !== 'string' || !(record.description as string)?.trim()) {
    record.description = (record.title as string) || '';
  }

  // revenue: required number, default to 0
  if (typeof record.revenue !== 'number' || isNaN(record.revenue as number)) {
    record.revenue = 0;
  }

  // ebitda: required number, default to 0
  if (typeof record.ebitda !== 'number' || isNaN(record.ebitda as number)) {
    record.ebitda = 0;
  }

  // location: required string, ensure it exists
  // This should already be set by the caller (DealImportDialog/DealCSVImport)
  // but add a final fallback to prevent constraint violations
  if (typeof record.location !== 'string' || !(record.location as string)?.trim()) {
    record.location = 'Unknown';
  }

  // category: required string, ensure it exists
  if (typeof record.category !== 'string' || !(record.category as string)?.trim()) {
    record.category = 'Other';
  }

  return out;
}
