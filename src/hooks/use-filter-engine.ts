/**
 * useFilterEngine
 *
 * Client-side filtering engine that evaluates filter rules against an array
 * of items. Supports text, number, date, select, multi-select, boolean, and
 * user field types with URL-based filter state persistence.
 *
 * Returns: { filteredItems, filterState, setFilterState, activeFilterCount, totalCount, filteredCount, fieldDefinitions, dynamicOptions }
 *
 * Tables: none (client-side filtering only)
 */

import { useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  type FilterFieldDef,
  type FilterRule,
  type FilterState,
  EMPTY_FILTER_STATE,
} from '@/components/filters/filter-definitions';
import { subDays, startOfDay } from 'date-fns';

// ─── URL Serialization ──────────────────────────────────────────
function serializeFilters(state: FilterState): string {
  if (state.rules.length === 0 && !state.search) return '';
  return btoa(JSON.stringify(state));
}

function deserializeFilters(raw: string | null): FilterState | null {
  if (!raw) return null;
  try {
    return JSON.parse(atob(raw));
  } catch {
    return null;
  }
}

// ─── Value getter ───────────────────────────────────────────────
function getFieldValue(item: Record<string, unknown>, fieldDef: FilterFieldDef): unknown {
  if (fieldDef.accessor) return fieldDef.accessor(item);
  return item[fieldDef.key];
}

// ─── Evaluate a single rule ─────────────────────────────────────
function evaluateRule(
  item: Record<string, unknown>,
  rule: FilterRule,
  fieldDef: FilterFieldDef | undefined,
): boolean {
  if (!fieldDef) return true;
  const raw = getFieldValue(item, fieldDef);
  const op = rule.operator;

  // Empty / not-empty operators work on any type
  if (op === 'is_empty') {
    return raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0);
  }
  if (op === 'is_not_empty') {
    return raw != null && raw !== '' && !(Array.isArray(raw) && raw.length === 0);
  }

  // Boolean
  if (op === 'is_true') return Boolean(raw) === true;
  if (op === 'is_false') return !raw;

  // User: unassigned
  if (op === 'is_unassigned') return raw == null || raw === '';

  const val = rule.value;

  // Text operators
  if (fieldDef.type === 'text') {
    const str = String(raw ?? '').toLowerCase();
    const target = String(val ?? '').toLowerCase();
    if (op === 'contains') return str.includes(target);
    if (op === 'equals') return str === target;
    if (op === 'starts_with') return str.startsWith(target);
    if (op === 'ends_with') return str.endsWith(target);
  }

  // Number / currency operators
  if (fieldDef.type === 'number' || fieldDef.type === 'currency') {
    const num = Number(raw) || 0;
    if (op === 'eq') return num === Number(val);
    if (op === 'gt') return num > Number(val);
    if (op === 'gte') return num >= Number(val);
    if (op === 'lt') return num < Number(val);
    if (op === 'lte') return num <= Number(val);
    if (
      op === 'between' &&
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      !(val instanceof Date)
    ) {
      const rangeVal = val as { min: number; max: number };
      const min = Number(rangeVal.min);
      const max = Number(rangeVal.max);
      return (!rangeVal.min || num >= min) && (!rangeVal.max || num <= max);
    }
  }

  // Select operators
  if (fieldDef.type === 'select' || fieldDef.type === 'user') {
    const str = String(raw ?? '');
    if (op === 'is') return str === String(val);
    if (op === 'is_not') return str !== String(val);
    if (op === 'is_any_of' && Array.isArray(val)) {
      return val.includes(str);
    }
  }

  // Multi-select operators
  if (fieldDef.type === 'multi_select') {
    const arr: string[] = Array.isArray(raw) ? raw : [];
    if (op === 'includes_any' && Array.isArray(val)) {
      return val.some((v: string) => arr.includes(v));
    }
    if (op === 'includes_all' && Array.isArray(val)) {
      return val.every((v: string) => arr.includes(v));
    }
    if (op === 'excludes' && Array.isArray(val)) {
      return !val.some((v: string) => arr.includes(v));
    }
  }

  // Date operators
  if (fieldDef.type === 'date') {
    const d = raw ? new Date(raw as string) : null;
    if (!d) return false;

    if (op === 'is' && val) {
      const target = new Date(val as string | number | Date);
      return d.toDateString() === target.toDateString();
    }
    if (op === 'before' && val) return d < new Date(val as string | number | Date);
    if (op === 'after' && val) return d > new Date(val as string | number | Date);
    if (
      op === 'between' &&
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      !(val instanceof Date)
    ) {
      const rangeVal = val as { min: number; max: number };
      const min = rangeVal.min ? new Date(rangeVal.min) : null;
      const max = rangeVal.max ? new Date(rangeVal.max) : null;
      return (!min || d >= min) && (!max || d <= max);
    }
    if (op === 'last_n_days') {
      const n = Number(val);
      if (!n) return true;
      return d >= startOfDay(subDays(new Date(), n));
    }
  }

  return true;
}

// ─── Full-text search ───────────────────────────────────────────
function matchesSearch(
  item: Record<string, unknown>,
  search: string,
  fields: FilterFieldDef[],
): boolean {
  if (!search) return true;
  const lower = search.toLowerCase();

  // search across all text-like fields
  for (const field of fields) {
    const val = getFieldValue(item, field);
    if (val == null) continue;
    if (typeof val === 'string' && val.toLowerCase().includes(lower)) return true;
    if (Array.isArray(val) && val.some((v) => String(v).toLowerCase().includes(lower))) return true;
    if (typeof val === 'number' && String(val).includes(lower)) return true;
  }
  return false;
}

// ─── Hook ───────────────────────────────────────────────────────
export function useFilterEngine<T>(items: T[], fieldDefinitions: FilterFieldDef[]) {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialState = useMemo(() => {
    return deserializeFilters(searchParams.get('f')) ?? EMPTY_FILTER_STATE;
  }, []); // only on mount

  const [filterState, setFilterStateLocal] = useState<FilterState>(initialState);

  const setFilterState = useCallback(
    (next: FilterState | ((prev: FilterState) => FilterState)) => {
      setFilterStateLocal((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        // sync to URL
        setSearchParams(
          (p) => {
            const n = new URLSearchParams(p);
            const serialized = serializeFilters(resolved);
            if (serialized) {
              n.set('f', serialized);
            } else {
              n.delete('f');
            }
            // Reset pagination when filters change to avoid stale page
            n.delete('cp');
            return n;
          },
          { replace: true },
        );
        return resolved;
      });
    },
    [setSearchParams],
  );

  const fieldMap = useMemo(() => {
    const map = new Map<string, FilterFieldDef>();
    for (const f of fieldDefinitions) map.set(f.key, f);
    return map;
  }, [fieldDefinitions]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const record = item as Record<string, unknown>;
      // 1. Full-text search
      if (!matchesSearch(record, filterState.search, fieldDefinitions)) return false;

      // 2. Filter rules
      const { rules, conjunction } = filterState;
      if (rules.length === 0) return true;

      if (conjunction === 'and') {
        return rules.every((rule) => evaluateRule(record, rule, fieldMap.get(rule.field)));
      } else {
        return rules.some((rule) => evaluateRule(record, rule, fieldMap.get(rule.field)));
      }
    });
  }, [items, filterState, fieldDefinitions, fieldMap]);

  // Derive dynamic options from the full data set
  const dynamicOptions = useMemo(() => {
    const result: Record<string, { label: string; value: string }[]> = {};
    for (const field of fieldDefinitions) {
      if (!field.dynamicOptions) continue;
      const unique = new Set<string>();
      for (const item of items) {
        const val = getFieldValue(item as Record<string, unknown>, field);
        if (val != null && val !== '') {
          if (Array.isArray(val)) {
            val.forEach((v: string) => unique.add(String(v)));
          } else {
            unique.add(String(val));
          }
        }
      }
      result[field.key] = Array.from(unique)
        .sort()
        .map((v) => ({ label: v, value: v }));
    }
    return result;
  }, [items, fieldDefinitions]);

  return {
    filteredItems,
    filterState,
    setFilterState,
    activeFilterCount: filterState.rules.length,
    totalCount: items.length,
    filteredCount: filteredItems.length,
    fieldDefinitions,
    dynamicOptions,
  } as const;
}
