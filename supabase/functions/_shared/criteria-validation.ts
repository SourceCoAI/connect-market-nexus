/**
 * Criteria Validation & Synthesis Utilities
 *
 * Provides validation, conflict detection, and synthesis functions for buyer fit criteria
 * extracted from multiple sources (AI guides, documents, transcripts).
 */

// ==============================================
// PLACEHOLDER DETECTION (Anti-Hallucination)
// ==============================================

const PLACEHOLDER_PATTERNS = [
  /\[X\]/gi,
  /\$\[?X\]?/gi,
  /\bTBD\b/gi,
  /\bTBA\b/gi,
  /\bN\/A\b/gi,
  /\bPLACEHOLDER\b/gi,
  /\[INSERT.*?\]/gi,
  /\[VALUE\]/gi,
  /\bXXX+\b/gi,
  /\$?X{2,}/gi,
  /\[?\d+\]?X/gi, // Matches [10]X, 5X, etc.
];

/**
 * Detect if text contains placeholder or hallucinated values
 */
export function detectPlaceholders(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Validate numeric value is realistic and not hallucinated
 */
export function validateNumericRange(
  value: number | undefined | null,
  min: number,
  max: number,
  fieldName: string,
): { valid: boolean; reason?: string } {
  if (value === undefined || value === null) {
    return { valid: true }; // Null/undefined is acceptable (missing data)
  }

  if (typeof value !== 'number' || isNaN(value)) {
    return { valid: false, reason: `${fieldName} is not a valid number` };
  }

  if (value < min || value > max) {
    return {
      valid: false,
      reason: `${fieldName} ${value} is outside realistic range ${min}-${max}`,
    };
  }

  return { valid: true };
}

/**
 * Validate revenue/EBITDA ranges are realistic
 */
interface SizeCriteriaInput {
  revenue_min?: number;
  revenue_max?: number;
  ebitda_min?: number;
  ebitda_max?: number;
  location_count_min?: number;
  location_count_max?: number;
}

export function validateSizeCriteria(criteria: SizeCriteriaInput): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Revenue validations
  if (criteria.revenue_min) {
    const validation = validateNumericRange(
      criteria.revenue_min,
      100000,
      1000000000,
      'revenue_min',
    );
    if (!validation.valid) errors.push(validation.reason!);
  }

  if (criteria.revenue_max) {
    const validation = validateNumericRange(
      criteria.revenue_max,
      100000,
      10000000000,
      'revenue_max',
    );
    if (!validation.valid) errors.push(validation.reason!);
  }

  if (criteria.revenue_min && criteria.revenue_max && criteria.revenue_min > criteria.revenue_max) {
    errors.push('revenue_min cannot be greater than revenue_max');
  }

  // EBITDA validations
  if (criteria.ebitda_min) {
    const validation = validateNumericRange(
      criteria.ebitda_min,
      -10000000,
      500000000,
      'ebitda_min',
    );
    if (!validation.valid) errors.push(validation.reason!);
  }

  if (criteria.ebitda_max) {
    const validation = validateNumericRange(
      criteria.ebitda_max,
      -10000000,
      2000000000,
      'ebitda_max',
    );
    if (!validation.valid) errors.push(validation.reason!);
  }

  if (criteria.ebitda_min && criteria.ebitda_max && criteria.ebitda_min > criteria.ebitda_max) {
    errors.push('ebitda_min cannot be greater than ebitda_max');
  }

  // Location count validations
  if (criteria.location_count_min) {
    const validation = validateNumericRange(
      criteria.location_count_min,
      1,
      10000,
      'location_count_min',
    );
    if (!validation.valid) errors.push(validation.reason!);
  }

  if (criteria.location_count_max) {
    const validation = validateNumericRange(
      criteria.location_count_max,
      1,
      50000,
      'location_count_max',
    );
    if (!validation.valid) errors.push(validation.reason!);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate confidence score is in valid range
 */
export function validateConfidenceScore(score: number | undefined): boolean {
  if (score === undefined) return false;
  return typeof score === 'number' && score >= 0 && score <= 100;
}

/**
 * Normalize confidence score to 0-100 range.
 * Handles both 0-1 fractional scale (from some AI models) and 0-100 integer scale.
 */
export function normalizeConfidenceScore(score: number | undefined | null): number {
  if (score === undefined || score === null || typeof score !== 'number' || isNaN(score)) return 0;
  // If in 0-1 fractional range, convert to 0-100
  if (score > 0 && score <= 1) return Math.round(score * 100);
  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ==============================================
// STATE/REGION NORMALIZATION
// ==============================================

// Re-export normalizeState from the canonical shared geography module.
// This avoids duplicating the full state mapping table.
export { normalizeState } from './geography.ts';

const _US_REGIONS = new Set(['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West', 'National']);

/**
 * Normalize region names
 */
export function normalizeRegion(region: string): string | null {
  if (!region) return null;

  const normalized = region.trim().toLowerCase();
  const regionMap: Record<string, string> = {
    northeast: 'Northeast',
    'north east': 'Northeast',
    southeast: 'Southeast',
    'south east': 'Southeast',
    midwest: 'Midwest',
    'mid west': 'Midwest',
    southwest: 'Southwest',
    'south west': 'Southwest',
    west: 'West',
    western: 'West',
    national: 'National',
    nationwide: 'National',
  };

  return regionMap[normalized] || null;
}

// ==============================================
// CONFLICT DETECTION & RESOLUTION
// ==============================================

export interface ConflictDetection {
  field: string;
  existing_value: unknown;
  new_value: unknown;
  conflict_type: 'numeric_discrepancy' | 'array_difference' | 'text_mismatch';
  severity: 'high' | 'medium' | 'low';
  resolution_suggestion: string;
}

/**
 * Detect conflicts when merging size criteria from multiple sources
 */
export function detectSizeCriteriaConflicts(
  existing: SizeCriteriaInput,
  incoming: SizeCriteriaInput,
  threshold: number = 0.2,
): ConflictDetection[] {
  const conflicts: ConflictDetection[] = [];

  // Check revenue_min conflict
  if (existing.revenue_min && incoming.revenue_min) {
    const diff = Math.abs(existing.revenue_min - incoming.revenue_min) / existing.revenue_min;
    if (diff > threshold) {
      conflicts.push({
        field: 'revenue_min',
        existing_value: existing.revenue_min,
        new_value: incoming.revenue_min,
        conflict_type: 'numeric_discrepancy',
        severity: diff > 0.5 ? 'high' : 'medium',
        resolution_suggestion: `Consider using the lower value: $${Math.min(existing.revenue_min, incoming.revenue_min).toLocaleString()}`,
      });
    }
  }

  // Check revenue_max conflict
  if (existing.revenue_max && incoming.revenue_max) {
    const diff = Math.abs(existing.revenue_max - incoming.revenue_max) / existing.revenue_max;
    if (diff > threshold) {
      conflicts.push({
        field: 'revenue_max',
        existing_value: existing.revenue_max,
        new_value: incoming.revenue_max,
        conflict_type: 'numeric_discrepancy',
        severity: diff > 0.5 ? 'high' : 'medium',
        resolution_suggestion: `Consider using the higher value: $${Math.max(existing.revenue_max, incoming.revenue_max).toLocaleString()}`,
      });
    }
  }

  // Check EBITDA conflicts
  if (existing.ebitda_min && incoming.ebitda_min) {
    const diff =
      Math.abs(existing.ebitda_min - incoming.ebitda_min) / Math.abs(existing.ebitda_min);
    if (diff > threshold) {
      conflicts.push({
        field: 'ebitda_min',
        existing_value: existing.ebitda_min,
        new_value: incoming.ebitda_min,
        conflict_type: 'numeric_discrepancy',
        severity: diff > 0.5 ? 'high' : 'medium',
        resolution_suggestion: `Review both sources - ${diff * 100}% difference`,
      });
    }
  }

  return conflicts;
}

/**
 * Detect conflicts in array-based criteria (services, geographies)
 */
export function detectArrayConflicts(
  existing: string[],
  incoming: string[],
  fieldName: string,
): ConflictDetection | null {
  if (!existing || !incoming) return null;

  const existingSet = new Set(existing.map((s) => s.toLowerCase()));
  const incomingSet = new Set(incoming.map((s) => s.toLowerCase()));

  const onlyInExisting = existing.filter((s) => !incomingSet.has(s.toLowerCase()));
  const onlyInIncoming = incoming.filter((s) => !existingSet.has(s.toLowerCase()));

  if (onlyInExisting.length === 0 && onlyInIncoming.length === 0) {
    return null; // No conflict
  }

  const overlapRatio =
    [...existingSet].filter((s) => incomingSet.has(s)).length /
    Math.max(existingSet.size, incomingSet.size);

  if (overlapRatio < 0.5) {
    return {
      field: fieldName,
      existing_value: existing,
      new_value: incoming,
      conflict_type: 'array_difference',
      severity: 'high',
      resolution_suggestion: `Arrays have low overlap (${Math.round(overlapRatio * 100)}%). Consider merging or reviewing sources.`,
    };
  }

  return {
    field: fieldName,
    existing_value: existing,
    new_value: incoming,
    conflict_type: 'array_difference',
    severity: 'low',
    resolution_suggestion: `Merge unique values from both sources`,
  };
}

// ==============================================
// SYNTHESIS (Multi-Source Merging)
// ==============================================

/**
 * Merge size criteria from multiple sources
 * Strategy: Take min of minimums, max of maximums, weighted average for sweet spots
 */
interface SizeCriteriaSource extends SizeCriteriaInput {
  confidence_score?: number;
  revenue_sweet_spot?: number;
  ebitda_sweet_spot?: number;
}

export function synthesizeSizeCriteria(sources: SizeCriteriaSource[]): SizeCriteriaSource {
  if (!sources || sources.length === 0) return {};

  const merged: SizeCriteriaSource = {
    confidence_score: Math.round(
      sources.reduce((sum, s) => sum + (s.confidence_score || 0), 0) / sources.length,
    ),
  };

  // Revenue min: Take the MINIMUM across all sources (most permissive)
  const revenueMin = sources.map((s) => s.revenue_min).filter((v) => v !== undefined && v !== null);
  if (revenueMin.length > 0) {
    merged.revenue_min = Math.min(...revenueMin);
  }

  // Revenue max: Take the MAXIMUM across all sources (most permissive)
  const revenueMax = sources.map((s) => s.revenue_max).filter((v) => v !== undefined && v !== null);
  if (revenueMax.length > 0) {
    merged.revenue_max = Math.max(...revenueMax);
  }

  // Revenue sweet spot: Weighted average
  const revenueSweetSpot = sources
    .map((s) => s.revenue_sweet_spot)
    .filter((v) => v !== undefined && v !== null);
  if (revenueSweetSpot.length > 0) {
    merged.revenue_sweet_spot = Math.round(
      revenueSweetSpot.reduce((sum, v) => sum + v, 0) / revenueSweetSpot.length,
    );
  }

  // EBITDA min: Take the MINIMUM
  const ebitdaMin = sources.map((s) => s.ebitda_min).filter((v) => v !== undefined && v !== null);
  if (ebitdaMin.length > 0) {
    merged.ebitda_min = Math.min(...ebitdaMin);
  }

  // EBITDA max: Take the MAXIMUM
  const ebitdaMax = sources.map((s) => s.ebitda_max).filter((v) => v !== undefined && v !== null);
  if (ebitdaMax.length > 0) {
    merged.ebitda_max = Math.max(...ebitdaMax);
  }

  // EBITDA sweet spot: Weighted average
  const ebitdaSweetSpot = sources
    .map((s) => s.ebitda_sweet_spot)
    .filter((v) => v !== undefined && v !== null);
  if (ebitdaSweetSpot.length > 0) {
    merged.ebitda_sweet_spot = Math.round(
      ebitdaSweetSpot.reduce((sum, v) => sum + v, 0) / ebitdaSweetSpot.length,
    );
  }

  // Location counts: Take average
  const locationMin = sources
    .map((s) => s.location_count_min)
    .filter((v) => v !== undefined && v !== null);
  if (locationMin.length > 0) {
    merged.location_count_min = Math.round(
      locationMin.reduce((sum, v) => sum + v, 0) / locationMin.length,
    );
  }

  const locationMax = sources
    .map((s) => s.location_count_max)
    .filter((v) => v !== undefined && v !== null);
  if (locationMax.length > 0) {
    merged.location_count_max = Math.round(
      locationMax.reduce((sum, v) => sum + v, 0) / locationMax.length,
    );
  }

  return merged;
}

/**
 * Merge array-based criteria (services, geographies)
 * Strategy: Union of all values, normalized
 */
export function synthesizeArrayCriteria(
  sources: Record<string, unknown>[],
  fieldName: string,
): string[] {
  if (!sources || sources.length === 0) return [];

  const allValues = sources
    .flatMap((s) => (s[fieldName] as string[] | undefined) || [])
    .filter((v) => v && typeof v === 'string')
    .map((v) => v.trim());

  // Deduplicate (case-insensitive)
  const uniqueValues = Array.from(new Map(allValues.map((v) => [v.toLowerCase(), v])).values());

  return uniqueValues.sort();
}

/**
 * Calculate overall confidence based on section confidence scores
 */
export function calculateOverallConfidence(sections: { confidence_score: number }[]): number {
  if (!sections || sections.length === 0) return 0;

  const validScores = sections
    .map((s) => s.confidence_score)
    .filter((s) => s !== undefined && s !== null && s >= 0 && s <= 100);

  if (validScores.length === 0) return 0;

  // Weighted average with penalty for missing sections
  const average = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
  const completeness = validScores.length / sections.length;

  return Math.round(average * completeness);
}
