/**
 * Criteria Validation Utilities
 * Validates buyer universe fit criteria for completeness and quality
 */

import {
  SizeCriteriaSchema,
  ServiceCriteriaSchema,
  GeographyCriteriaSchema,
  BuyerTypesCriteriaSchema,
  CompleteCriteriaSet,
} from './criteriaSchema';

// ============= Validation Result Types =============

export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning' | 'suggestion';
  category: 'size' | 'service' | 'geography' | 'buyer_types' | 'general';
}

export interface SectionValidation {
  isComplete: boolean;
  completeness: number; // 0-100
  issues: ValidationIssue[];
  fieldsPopulated: string[];
  fieldsMissing: string[];
}

export interface CriteriaValidationResult {
  isValid: boolean;
  canSave: boolean;
  overallCompleteness: number; // 0-100
  
  // Section-by-section validation
  size: SectionValidation;
  service: SectionValidation;
  geography: SectionValidation;
  buyerTypes: SectionValidation;
  
  // Critical checks
  hasPrimaryFocus: boolean;
  hasPlaceholders: boolean;
  placeholderCount: number;
  
  // Aggregated issues
  blockers: ValidationIssue[];
  warnings: ValidationIssue[];
  suggestions: ValidationIssue[];
}

// ============= Placeholder Detection =============

const PLACEHOLDER_PATTERNS = [
  /\[X\]/gi,
  /\[VALUE\]/gi,
  /\[TBD\]/gi,
  /\[RANGE\]/gi,
  /\[INSERT\]/gi,
  /\$\[.*?\]/gi,
  /\[AMOUNT\]/gi,
  /\[NUMBER\]/gi,
  /XXX/gi,
  /TODO/gi,
  /PLACEHOLDER/gi,
];

function countPlaceholders(obj: unknown): number {
  if (obj === null || obj === undefined) return 0;
  
  if (typeof obj === 'string') {
    return PLACEHOLDER_PATTERNS.reduce((count, pattern) => {
      const matches = obj.match(pattern);
      return count + (matches ? matches.length : 0);
    }, 0);
  }
  
  if (Array.isArray(obj)) {
    return obj.reduce((count, item) => count + countPlaceholders(item), 0);
  }
  
  if (typeof obj === 'object') {
    return Object.values(obj).reduce((count, val) => count + countPlaceholders(val), 0);
  }
  
  return 0;
}

function hasPlaceholderValues(obj: unknown): boolean {
  return countPlaceholders(obj) > 0;
}

// ============= Size Criteria Validation =============

function validateSizeCriteria(criteria: SizeCriteriaSchema | undefined): SectionValidation {
  const issues: ValidationIssue[] = [];
  const fieldsPopulated: string[] = [];
  const fieldsMissing: string[] = [];
  
  if (!criteria) {
    return {
      isComplete: false,
      completeness: 0,
      issues: [{
        field: 'size_criteria',
        message: 'Size criteria not defined',
        severity: 'warning',
        category: 'size'
      }],
      fieldsPopulated: [],
      fieldsMissing: ['revenue_min', 'revenue_max', 'ebitda_min', 'ebitda_max']
    };
  }
  
  // Check revenue range
  if (criteria.revenue_min !== undefined) {
    fieldsPopulated.push('revenue_min');
    if (criteria.revenue_min < 0) {
      issues.push({
        field: 'revenue_min',
        message: 'Revenue minimum cannot be negative',
        severity: 'error',
        category: 'size'
      });
    }
  } else {
    fieldsMissing.push('revenue_min');
  }
  
  if (criteria.revenue_max !== undefined) {
    fieldsPopulated.push('revenue_max');
    if (criteria.revenue_min !== undefined && criteria.revenue_max < criteria.revenue_min) {
      issues.push({
        field: 'revenue_max',
        message: 'Revenue maximum is less than minimum',
        severity: 'error',
        category: 'size'
      });
    }
  } else {
    fieldsMissing.push('revenue_max');
  }
  
  // Check EBITDA range
  if (criteria.ebitda_min !== undefined) {
    fieldsPopulated.push('ebitda_min');
  } else {
    fieldsMissing.push('ebitda_min');
  }
  
  if (criteria.ebitda_max !== undefined) {
    fieldsPopulated.push('ebitda_max');
    if (criteria.ebitda_min !== undefined && criteria.ebitda_max < criteria.ebitda_min) {
      issues.push({
        field: 'ebitda_max',
        message: 'EBITDA maximum is less than minimum',
        severity: 'error',
        category: 'size'
      });
    }
  } else {
    fieldsMissing.push('ebitda_max');
  }
  
  // Check optional fields
  if (criteria.locations_min !== undefined) fieldsPopulated.push('locations_min');
  if (criteria.locations_max !== undefined) fieldsPopulated.push('locations_max');
  if (criteria.employee_min !== undefined) fieldsPopulated.push('employee_min');
  if (criteria.employee_max !== undefined) fieldsPopulated.push('employee_max');
  
  // Check for placeholders
  if (hasPlaceholderValues(criteria)) {
    issues.push({
      field: 'size_criteria',
      message: 'Size criteria contains placeholder values',
      severity: 'warning',
      category: 'size'
    });
  }
  
  // Calculate completeness (core fields: revenue_min/max, ebitda_min/max)
  const coreFields = ['revenue_min', 'revenue_max', 'ebitda_min', 'ebitda_max'];
  const corePopulated = coreFields.filter(f => fieldsPopulated.includes(f)).length;
  const completeness = Math.round((corePopulated / coreFields.length) * 100);
  
  return {
    isComplete: completeness >= 75,
    completeness,
    issues,
    fieldsPopulated,
    fieldsMissing
  };
}

// ============= Service Criteria Validation =============

function validateServiceCriteria(criteria: ServiceCriteriaSchema | undefined): SectionValidation {
  const issues: ValidationIssue[] = [];
  const fieldsPopulated: string[] = [];
  const fieldsMissing: string[] = [];
  
  if (!criteria) {
    return {
      isComplete: false,
      completeness: 0,
      issues: [{
        field: 'service_criteria',
        message: 'Service criteria not defined',
        severity: 'error',
        category: 'service'
      }],
      fieldsPopulated: [],
      fieldsMissing: ['primary_focus', 'required_services']
    };
  }
  
  // PRIMARY FOCUS is CRITICAL
  if (criteria.primary_focus && criteria.primary_focus.length > 0) {
    fieldsPopulated.push('primary_focus');
  } else {
    fieldsMissing.push('primary_focus');
    issues.push({
      field: 'primary_focus',
      message: 'Primary focus services are required for accurate scoring. This field determines buyer-deal matching.',
      severity: 'error',
      category: 'service'
    });
  }
  
  // Required services
  if (criteria.required_services && criteria.required_services.length > 0) {
    fieldsPopulated.push('required_services');
  } else {
    fieldsMissing.push('required_services');
    issues.push({
      field: 'required_services',
      message: 'Consider adding required services for better matching',
      severity: 'suggestion',
      category: 'service'
    });
  }
  
  // Preferred services
  if (criteria.preferred_services && criteria.preferred_services.length > 0) {
    fieldsPopulated.push('preferred_services');
  }
  
  // Excluded services
  if (criteria.excluded_services && criteria.excluded_services.length > 0) {
    fieldsPopulated.push('excluded_services');
  }
  
  // Business model
  if (criteria.business_model) {
    fieldsPopulated.push('business_model');
  }
  
  // Customer profile
  if (criteria.customer_profile) {
    fieldsPopulated.push('customer_profile');
  }
  
  // Check for placeholders
  if (hasPlaceholderValues(criteria)) {
    issues.push({
      field: 'service_criteria',
      message: 'Service criteria contains placeholder values',
      severity: 'warning',
      category: 'service'
    });
  }
  
  // Calculate completeness
  const hasPrimaryFocus = fieldsPopulated.includes('primary_focus');
  const otherFieldsCount = fieldsPopulated.filter(f => f !== 'primary_focus').length;
  const otherFieldsWeight = Math.min(otherFieldsCount * 10, 30);
  const completeness = hasPrimaryFocus ? 70 + otherFieldsWeight : otherFieldsWeight;
  
  return {
    isComplete: hasPrimaryFocus,
    completeness: Math.min(completeness, 100),
    issues,
    fieldsPopulated,
    fieldsMissing
  };
}

// ============= Geography Criteria Validation =============

function validateGeographyCriteria(criteria: GeographyCriteriaSchema | undefined): SectionValidation {
  const issues: ValidationIssue[] = [];
  const fieldsPopulated: string[] = [];
  const fieldsMissing: string[] = [];
  
  if (!criteria) {
    return {
      isComplete: false,
      completeness: 0,
      issues: [{
        field: 'geography_criteria',
        message: 'Geography criteria not defined',
        severity: 'warning',
        category: 'geography'
      }],
      fieldsPopulated: [],
      fieldsMissing: ['target_states', 'target_regions']
    };
  }
  
  // Target states
  if (criteria.target_states && criteria.target_states.length > 0) {
    fieldsPopulated.push('target_states');
  } else {
    fieldsMissing.push('target_states');
  }
  
  // Target regions
  if (criteria.target_regions && criteria.target_regions.length > 0) {
    fieldsPopulated.push('target_regions');
  } else {
    fieldsMissing.push('target_regions');
  }
  
  // Need at least one geographic constraint
  if (!fieldsPopulated.includes('target_states') && !fieldsPopulated.includes('target_regions')) {
    if (criteria.coverage !== 'national') {
      issues.push({
        field: 'geography_criteria',
        message: 'Define target states or regions for geographic matching',
        severity: 'warning',
        category: 'geography'
      });
    }
  }
  
  // Coverage mode
  if (criteria.coverage) {
    fieldsPopulated.push('coverage');
  }
  
  // Exclude states
  if (criteria.exclude_states && criteria.exclude_states.length > 0) {
    fieldsPopulated.push('exclude_states');
  }
  
  // Check for placeholders
  if (hasPlaceholderValues(criteria)) {
    issues.push({
      field: 'geography_criteria',
      message: 'Geography criteria contains placeholder values',
      severity: 'warning',
      category: 'geography'
    });
  }
  
  // Calculate completeness
  const hasAnyTarget = fieldsPopulated.includes('target_states') || fieldsPopulated.includes('target_regions') || criteria.coverage === 'national';
  const baseScore = hasAnyTarget ? 60 : 0;
  const bonusFields = ['coverage', 'exclude_states', 'preferred_metros', 'hq_requirements'];
  const bonus = bonusFields.filter(f => fieldsPopulated.includes(f)).length * 10;
  const completeness = Math.min(baseScore + bonus, 100);
  
  return {
    isComplete: hasAnyTarget,
    completeness,
    issues,
    fieldsPopulated,
    fieldsMissing
  };
}

// ============= Buyer Types Criteria Validation =============

function validateBuyerTypesCriteria(criteria: BuyerTypesCriteriaSchema | undefined): SectionValidation {
  const issues: ValidationIssue[] = [];
  const fieldsPopulated: string[] = [];
  const fieldsMissing: string[] = [];
  
  if (!criteria) {
    return {
      isComplete: true, // Buyer types are optional with defaults
      completeness: 50,
      issues: [],
      fieldsPopulated: [],
      fieldsMissing: []
    };
  }
  
  // Check legacy boolean flags
  const boolFlags = ['include_pe_firms', 'include_platforms', 'include_strategic', 'include_family_office', 'include_independent_sponsors', 'include_search_funds', 'include_individual_buyers'];
  boolFlags.forEach(flag => {
    if ((criteria as Record<string, unknown>)[flag] !== undefined) {
      fieldsPopulated.push(flag);
    }
  });
  
  // Check ranked buyer types
  if (criteria.buyer_types && criteria.buyer_types.length > 0) {
    fieldsPopulated.push('buyer_types');
    
    // Validate each buyer type
    criteria.buyer_types.forEach((bt, idx) => {
      if (!bt.name) {
        issues.push({
          field: `buyer_types[${idx}]`,
          message: `Buyer type at position ${idx + 1} is missing a name`,
          severity: 'error',
          category: 'buyer_types'
        });
      }
    });
  }
  
  // Calculate completeness
  const hasAnyConfig = fieldsPopulated.length > 0;
  const hasRankedTypes = fieldsPopulated.includes('buyer_types');
  const completeness = hasRankedTypes ? 100 : (hasAnyConfig ? 70 : 50);
  
  return {
    isComplete: true,
    completeness,
    issues,
    fieldsPopulated,
    fieldsMissing
  };
}

// ============= Main Validation Function =============

export function validateCriteria(criteria: Partial<CompleteCriteriaSet>): CriteriaValidationResult {
  const size = validateSizeCriteria(criteria.size_criteria);
  const service = validateServiceCriteria(criteria.service_criteria);
  const geography = validateGeographyCriteria(criteria.geography_criteria);
  const buyerTypes = validateBuyerTypesCriteria(criteria.buyer_types_criteria);
  
  // Calculate overall completeness (weighted)
  const weights = { size: 0.25, service: 0.35, geography: 0.25, buyerTypes: 0.15 };
  const overallCompleteness = Math.round(
    size.completeness * weights.size +
    service.completeness * weights.service +
    geography.completeness * weights.geography +
    buyerTypes.completeness * weights.buyerTypes
  );
  
  // Check for primary focus (CRITICAL)
  const hasPrimaryFocus = service.fieldsPopulated.includes('primary_focus');
  
  // Count placeholders
  const placeholderCount = 
    countPlaceholders(criteria.size_criteria) +
    countPlaceholders(criteria.service_criteria) +
    countPlaceholders(criteria.geography_criteria) +
    countPlaceholders(criteria.buyer_types_criteria);
  
  // Aggregate issues
  const allIssues = [...size.issues, ...service.issues, ...geography.issues, ...buyerTypes.issues];
  const blockers = allIssues.filter(i => i.severity === 'error');
  const warnings = allIssues.filter(i => i.severity === 'warning');
  const suggestions = allIssues.filter(i => i.severity === 'suggestion');
  
  // Determine if valid and can save
  const isValid = hasPrimaryFocus && blockers.length === 0;
  const canSave = blockers.length === 0; // Allow save without primary_focus but warn
  
  return {
    isValid,
    canSave,
    overallCompleteness,
    size,
    service,
    geography,
    buyerTypes,
    hasPrimaryFocus,
    hasPlaceholders: placeholderCount > 0,
    placeholderCount,
    blockers,
    warnings,
    suggestions
  };
}

// ============= Pre-Save Validation =============

export function validateBeforeSave(criteria: Partial<CompleteCriteriaSet>): {
  canSave: boolean;
  issues: ValidationIssue[];
  criticalMessage?: string;
} {
  const result = validateCriteria(criteria);
  
  // Critical: Must have primary focus
  if (!result.hasPrimaryFocus) {
    return {
      canSave: false,
      issues: result.blockers,
      criticalMessage: 'Primary Focus services are required for the scoring algorithm to work correctly. Please add at least one primary focus service.'
    };
  }
  
  // Allow save with warnings
  return {
    canSave: true,
    issues: [...result.warnings, ...result.suggestions]
  };
}

// ============= Completeness Score Display =============

export function getCompletenessLabel(score: number): {
  label: string;
  color: 'red' | 'yellow' | 'green';
} {
  if (score >= 80) return { label: 'Complete', color: 'green' };
  if (score >= 50) return { label: 'Partial', color: 'yellow' };
  return { label: 'Incomplete', color: 'red' };
}

export function getCriteriaSummary(criteria: Partial<CompleteCriteriaSet>): {
  size: string;
  service: string;
  geography: string;
  buyerTypes: string;
} {
  const formatRange = (min?: number, max?: number, suffix = ''): string => {
    if (min !== undefined && max !== undefined) {
      return `${formatNum(min)}-${formatNum(max)}${suffix}`;
    }
    if (min !== undefined) return `${formatNum(min)}+${suffix}`;
    if (max !== undefined) return `Up to ${formatNum(max)}${suffix}`;
    return 'Not specified';
  };
  
  const formatNum = (n: number): string => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n}`;
  };
  
  const size = criteria.size_criteria;
  const sizeSummary = size
    ? `Revenue: ${formatRange(size.revenue_min, size.revenue_max)}, EBITDA: ${formatRange(size.ebitda_min, size.ebitda_max)}`
    : 'Not configured';
    
  const service = criteria.service_criteria;
  const serviceSummary = service?.primary_focus?.length
    ? `Focus: ${service.primary_focus.slice(0, 3).join(', ')}${service.primary_focus.length > 3 ? '...' : ''}`
    : 'Primary focus not set';
    
  const geography = criteria.geography_criteria;
  let geoSummary = 'Not configured';
  if (geography?.coverage === 'national') {
    geoSummary = 'National coverage';
  } else if (geography?.target_regions?.length) {
    geoSummary = geography.target_regions.slice(0, 3).join(', ');
  } else if (geography?.target_states?.length) {
    geoSummary = `${geography.target_states.length} states`;
  }
  
  const buyerTypes = criteria.buyer_types_criteria;
  const enabledTypes = [];
  if (buyerTypes?.include_pe_firms) enabledTypes.push('PE');
  if (buyerTypes?.include_platforms) enabledTypes.push('Platforms');
  if (buyerTypes?.include_strategic) enabledTypes.push('Strategic');
  if (buyerTypes?.include_family_office) enabledTypes.push('Family Office');
  if (buyerTypes?.include_independent_sponsors) enabledTypes.push('Ind. Sponsors');
  if (buyerTypes?.include_search_funds) enabledTypes.push('Search Funds');
  if (buyerTypes?.include_individual_buyers) enabledTypes.push('Individuals');
  const buyerTypesSummary = enabledTypes.length ? enabledTypes.join(', ') : 'All types';
  
  return {
    size: sizeSummary,
    service: serviceSummary,
    geography: geoSummary,
    buyerTypes: buyerTypesSummary
  };
}
