import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  calculateIndustryMatchScore,
  extractFinancialMetrics,
  generateRiskAssessment,
  mapToStandardizedLocation,
  calculateInvestmentMetrics,
  calculateLocationMatchScore,
} from './financial-parser';

// ============================================================================
// formatCurrency (financial-parser version)
// ============================================================================

describe('financial-parser: formatCurrency', () => {
  it('formats billions', () => {
    expect(formatCurrency(1500000000)).toBe('$1.5B');
  });

  it('formats millions', () => {
    expect(formatCurrency(5000000)).toBe('$5.0M');
  });

  it('formats thousands', () => {
    expect(formatCurrency(50000)).toBe('$50,000');
  });

  it('formats small numbers as-is', () => {
    expect(formatCurrency(999)).toBe('$999');
  });
});

// ============================================================================
// calculateIndustryMatchScore
// ============================================================================

describe('calculateIndustryMatchScore', () => {
  it('returns 100 for exact match', () => {
    expect(calculateIndustryMatchScore(['Healthcare & Medical'], 'Healthcare & Medical')).toBe(100);
  });

  it('returns 100 for "All Industries"', () => {
    expect(calculateIndustryMatchScore(['All Industries'], 'Manufacturing')).toBe(100);
  });

  it('returns 80 for proximate industries', () => {
    expect(calculateIndustryMatchScore(['Healthcare & Medical'], 'Pharmaceuticals')).toBe(80);
  });

  it('returns 80 for reverse proximity', () => {
    expect(calculateIndustryMatchScore(['Pharmaceuticals'], 'Healthcare & Medical')).toBe(80);
  });

  it('returns 0 for unrelated industries', () => {
    expect(calculateIndustryMatchScore(['Agriculture & Farming'], 'Technology & Software')).toBe(0);
  });

  it('returns 0 for empty inputs', () => {
    expect(calculateIndustryMatchScore([], 'Technology & Software')).toBe(0);
    expect(calculateIndustryMatchScore(['Technology & Software'], '')).toBe(0);
  });

  it('returns 70 for partial string match', () => {
    expect(calculateIndustryMatchScore(['Technology'], 'Technology & Software')).toBe(70);
  });
});

// ============================================================================
// extractFinancialMetrics
// ============================================================================

describe('extractFinancialMetrics', () => {
  it('extracts revenue from "$5M annual revenue"', () => {
    const result = extractFinancialMetrics(
      'Company generates $5M annual revenue with strong growth',
    );
    expect(result.revenue).toBeDefined();
    expect(result.revenue!.value).toBe(5000000);
    expect(result.revenue!.display).toBe('$5M');
  });

  it('extracts EBITDA', () => {
    const result = extractFinancialMetrics('EBITDA of $1.5M with healthy margins');
    expect(result.ebitda).toBeDefined();
    expect(result.ebitda!.value).toBe(1500000);
  });

  it('extracts margin percentage', () => {
    const result = extractFinancialMetrics('Operating at 25% EBITDA margin');
    expect(result.margin).toBeDefined();
    expect(result.margin!.value).toBe(25);
  });

  it('identifies recurring revenue model', () => {
    const result = extractFinancialMetrics('SaaS company with recurring subscription revenue');
    expect(result.revenueModel).toBe('Recurring Revenue Model');
  });

  it('identifies project-based revenue model', () => {
    const result = extractFinancialMetrics('Project-based consulting services firm');
    expect(result.revenueModel).toBe('Project-Based Revenue');
  });

  it('extracts competitive advantages', () => {
    const result = extractFinancialMetrics(
      'Strong barriers to entry and brand loyalty in the market',
    );
    expect(result.competitiveAdvantages).toContain('barriers to entry');
    expect(result.competitiveAdvantages).toContain('brand loyalty');
  });

  it('extracts risk factors', () => {
    const result = extractFinancialMetrics('Faces competition and customer concentration risk');
    expect(result.riskFactors).toContain('competition');
    expect(result.riskFactors).toContain('customer concentration');
  });

  it('identifies B2B customer base', () => {
    const result = extractFinancialMetrics('B2B enterprise software provider');
    expect(result.customerBase).toBe('B2B Customer Focus');
  });

  it('returns empty metrics for description with no financial data', () => {
    const result = extractFinancialMetrics('A nice company in a nice place');
    expect(result.revenue).toBeUndefined();
    expect(result.ebitda).toBeUndefined();
    expect(result.margin).toBeUndefined();
  });
});

// ============================================================================
// generateRiskAssessment
// ============================================================================

describe('generateRiskAssessment', () => {
  it('returns Low risk for high revenue and margin', () => {
    const extracted = extractFinancialMetrics('');
    const result = generateRiskAssessment(
      'Strong company',
      'Technology',
      15000000,
      3500000,
      extracted,
    );
    expect(result.level).toBe('Low');
  });

  it('returns Medium-High for low margins', () => {
    const extracted = extractFinancialMetrics('');
    const result = generateRiskAssessment('Small company', 'Retail', 500000, 10000, extracted);
    expect(result.level).toBe('Medium-High');
  });

  it('includes industry-specific risks', () => {
    const extracted = extractFinancialMetrics('');
    const result = generateRiskAssessment(
      'Tech company',
      'Technology',
      5000000,
      1000000,
      extracted,
    );
    expect(result.industryRisks.length).toBeGreaterThan(0);
  });

  it('recognizes recurring revenue as risk mitigation', () => {
    const extracted = extractFinancialMetrics('SaaS subscription model');
    const result = generateRiskAssessment('SaaS company', 'Technology', 3000000, 300000, extracted);
    expect(result.mitigationFactors.some((f) => f.includes('Recurring revenue'))).toBe(true);
  });

  it('confidence is capped at 1.0', () => {
    const extracted = extractFinancialMetrics(
      'barriers to entry and brand loyalty with growing demand',
    );
    const result = generateRiskAssessment(
      'Great company',
      'Technology',
      20000000,
      5000000,
      extracted,
    );
    expect(result.confidence).toBeLessThanOrEqual(1.0);
  });
});

// ============================================================================
// mapToStandardizedLocation
// ============================================================================

describe('mapToStandardizedLocation', () => {
  it('maps Northeast cities', () => {
    expect(mapToStandardizedLocation('New York')).toBe('Northeast US');
    expect(mapToStandardizedLocation('Boston, MA')).toBe('Northeast US');
    expect(mapToStandardizedLocation('Philadelphia')).toBe('Northeast US');
  });

  it('maps Southeast states', () => {
    expect(mapToStandardizedLocation('Florida')).toBe('Southeast US');
    expect(mapToStandardizedLocation('Georgia')).toBe('Southeast US');
  });

  it('maps Southwest states', () => {
    expect(mapToStandardizedLocation('Texas')).toBe('Southwest US');
    expect(mapToStandardizedLocation('Arizona')).toBe('Southwest US');
  });

  it('maps Western cities', () => {
    expect(mapToStandardizedLocation('California')).toBe('Western US');
    expect(mapToStandardizedLocation('Seattle')).toBe('Western US');
  });

  it('maps Midwest states', () => {
    expect(mapToStandardizedLocation('Illinois')).toBe('Midwest US');
    expect(mapToStandardizedLocation('Ohio')).toBe('Midwest US');
  });

  it('maps international locations', () => {
    expect(mapToStandardizedLocation('London')).toBe('United Kingdom');
    expect(mapToStandardizedLocation('Germany')).toBe('Europe');
    expect(mapToStandardizedLocation('Japan')).toBe('Asia Pacific');
  });

  it('falls back to Global/International', () => {
    expect(mapToStandardizedLocation('Mars')).toBe('Global/International');
  });
});

// ============================================================================
// calculateInvestmentMetrics
// ============================================================================

describe('calculateInvestmentMetrics', () => {
  it('calculates EBITDA margin', () => {
    const result = calculateInvestmentMetrics(10000000, 2500000);
    expect(result.ebitdaMargin).toBe('25.0');
  });

  it('calculates revenue multiple', () => {
    const result = calculateInvestmentMetrics(10000000, 2500000);
    expect(result.revenueMultiple).toBe('4.0');
  });

  it('returns High ROI for large EBITDA', () => {
    const result = calculateInvestmentMetrics(100000000, 30000000);
    expect(result.roiPotential).toBe('High');
  });

  it('returns Conservative ROI for small EBITDA', () => {
    const result = calculateInvestmentMetrics(5000000, 1000000);
    expect(result.roiPotential).toBe('Conservative');
  });

  it('handles zero revenue gracefully', () => {
    const result = calculateInvestmentMetrics(0, 0);
    expect(result.ebitdaMargin).toBe('0');
    expect(result.revenueMultiple).toBe('0');
  });
});

// ============================================================================
// calculateLocationMatchScore
// ============================================================================

describe('calculateLocationMatchScore', () => {
  it('returns 100 for exact match', () => {
    expect(calculateLocationMatchScore(['Northeast US'], 'Northeast US')).toBe(100);
  });

  it('returns 100 for "All Locations"', () => {
    expect(calculateLocationMatchScore(['All Locations'], 'Anywhere')).toBe(100);
  });

  it('returns 100 for hierarchical parent-child match', () => {
    expect(calculateLocationMatchScore(['United States'], 'Northeast US')).toBe(100);
  });

  it('returns 75 for sibling regions', () => {
    expect(calculateLocationMatchScore(['Northeast US'], 'Southeast US')).toBe(75);
  });

  it('returns 50 for continental match', () => {
    expect(calculateLocationMatchScore(['United States'], 'Canada')).toBe(50);
  });

  it('returns 0 for no match', () => {
    expect(calculateLocationMatchScore(['Asia'], 'Northeast US')).toBe(0);
  });

  it('returns 0 for empty inputs', () => {
    expect(calculateLocationMatchScore([], 'Northeast US')).toBe(0);
    expect(calculateLocationMatchScore(['Northeast US'], '')).toBe(0);
  });
});
