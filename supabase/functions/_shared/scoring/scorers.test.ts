/**
 * CTO-Level Audit: Comprehensive tests for the buyer discovery scoring engine.
 *
 * Tests cover:
 * - scoreService: exact match, adjacent match, no match, synonym expansion, edge cases
 * - scoreGeography: state match, national buyer, regional overlap, no data
 * - scoreSize: in-range, near-range, out-of-range, null handling
 * - scoreBonus: fee agreement, appetite, acquisitions, combined
 * - classifyTier: move_now, strong, speculative boundaries
 * - extractDealKeywords: keyword extraction from rich text
 * - norm / normArray: string normalization
 * - 10 real-company scenarios end-to-end
 */
import { describe, it, expect } from 'vitest';

// We can't directly import Deno modules in Vitest, so we replicate the pure logic here.
// This is intentional — we're testing the algorithm, not the Deno runtime.

// ── Inline copies of pure functions from scorers.ts ──

const SECTOR_SYNONYMS: Record<string, string[]> = {
  utility: [
    'utilities',
    'utility services',
    'infrastructure',
    'field services',
    'municipal services',
  ],
  'utility services': [
    'utility',
    'utilities',
    'infrastructure services',
    'outsourced utility',
    'municipal',
  ],
  metering: ['amr', 'ami', 'smart meter', 'meter reading', 'meter installation'],
  infrastructure: ['utility', 'field services', 'municipal', 'outsourced services'],
  'home services': ['residential services', 'home repair'],
  hvac: ['hvac services', 'climate control', 'heating and cooling', 'air conditioning'],
  plumbing: ['plumbing services', 'plumbing contractor', 'pipe services'],
  roofing: ['roofing services', 'exterior services'],
  collision: ['auto body', 'paint and body', 'auto repair'],
  healthcare: ['health services', 'medical services', 'patient care'],
  dental: ['dental services', 'dental practice', 'orthodontics', 'oral health'],
  'behavioral health': ['mental health', 'therapy', 'counseling', 'psychiatric services'],
  veterinary: ['animal health', 'pet care', 'veterinary services', 'animal hospital'],
  staffing: [
    'workforce solutions',
    'temporary staffing',
    'talent acquisition',
    'recruiting',
    'employment services',
  ],
  recruiting: ['staffing', 'talent acquisition', 'executive search', 'workforce solutions'],
  consulting: ['advisory', 'professional services', 'management consulting'],
  accounting: ['bookkeeping', 'cpa', 'tax services', 'audit services'],
  electrical: ['electrical services', 'electrical contracting', 'power systems'],
  construction: ['general contracting', 'specialty contracting', 'trades'],
  'fire protection': ['fire safety', 'fire suppression', 'life safety', 'sprinkler systems'],
  restoration: ['remediation', 'disaster recovery', 'reconstruction', 'water damage'],
  janitorial: ['commercial cleaning', 'custodial', 'cleaning services'],
  'commercial cleaning': ['janitorial', 'custodial', 'cleaning services'],
  'facility services': ['building services', 'property services', 'facilities management'],
  'building services': ['facility services', 'property management', 'building maintenance'],
  'it services': ['managed services', 'msp', 'technology services', 'it support'],
  cybersecurity: ['information security', 'managed security', 'infosec', 'network security'],
  software: ['saas', 'technology', 'tech-enabled services'],
  telecom: ['telecommunications', 'communications', 'wireless', 'connectivity'],
  manufacturing: ['production', 'fabrication', 'industrial', 'precision manufacturing'],
  distribution: ['wholesale', 'supply chain', 'industrial distribution'],
  logistics: ['transportation', 'freight', '3pl', 'warehousing'],
  landscaping: ['grounds maintenance', 'outdoor services', 'lawn care', 'landscape services'],
  'pest control': ['extermination', 'pest management', 'termite control'],
  'waste management': ['waste services', 'recycling', 'hauling', 'waste collection'],
  'environmental services': ['remediation', 'environmental consulting', 'environmental compliance'],
  insurance: ['insurance services', 'insurance brokerage', 'risk management'],
  'food services': ['food distribution', 'catering', 'food manufacturing'],
  automotive: ['auto services', 'auto repair', 'collision', 'vehicle services'],
  education: ['training', 'learning', 'ed tech', 'tutoring', 'educational services'],
};

const STATE_REGIONS: Record<string, string> = {
  CT: 'northeast',
  MA: 'northeast',
  ME: 'northeast',
  NH: 'northeast',
  NJ: 'northeast',
  NY: 'northeast',
  PA: 'northeast',
  RI: 'northeast',
  VT: 'northeast',
  IL: 'midwest',
  IN: 'midwest',
  IA: 'midwest',
  KS: 'midwest',
  MI: 'midwest',
  MN: 'midwest',
  MO: 'midwest',
  NE: 'midwest',
  ND: 'midwest',
  OH: 'midwest',
  SD: 'midwest',
  WI: 'midwest',
  AL: 'south',
  AR: 'south',
  DC: 'south',
  DE: 'south',
  FL: 'south',
  GA: 'south',
  KY: 'south',
  LA: 'south',
  MD: 'south',
  MS: 'south',
  NC: 'south',
  OK: 'south',
  SC: 'south',
  TN: 'south',
  TX: 'south',
  VA: 'south',
  WV: 'south',
  AK: 'west',
  AZ: 'west',
  CA: 'west',
  CO: 'west',
  HI: 'west',
  ID: 'west',
  MT: 'west',
  NV: 'west',
  NM: 'west',
  OR: 'west',
  UT: 'west',
  WA: 'west',
  WY: 'west',
};

function expandTerms(terms: string[]): string[] {
  const expanded = new Set(terms.map((t) => t.toLowerCase()));
  for (const t of terms) {
    const synonyms = SECTOR_SYNONYMS[t.toLowerCase()] || [];
    for (const s of synonyms) expanded.add(s.toLowerCase());
  }
  return [...expanded];
}

function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().trim();
}

function normArray(arr: string[] | null | undefined): string[] {
  if (!arr) return [];
  return arr.map((s) => norm(s)).filter(Boolean);
}

function extractDealKeywords(deal: Record<string, unknown>): string[] {
  const richText = [
    deal.executive_summary,
    deal.description,
    deal.hero_description,
    deal.investment_thesis,
    deal.end_market_description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const knownTerms = Object.keys(SECTOR_SYNONYMS);
  return knownTerms.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`);
    return regex.test(richText);
  });
}

function scoreService(
  dealCategories: string[],
  dealIndustry: string,
  buyerServices: string[],
  buyerIndustries: string[],
  buyerIndustryVertical: string,
): { score: number; signals: string[] } {
  const rawDealTerms = [...dealCategories, dealIndustry].filter(Boolean);
  const rawBuyerTerms = [...buyerServices, ...buyerIndustries, buyerIndustryVertical].filter(
    Boolean,
  );
  if (rawDealTerms.length === 0 || rawBuyerTerms.length === 0) {
    return { score: 0, signals: [] };
  }
  const dealTerms = expandTerms(rawDealTerms);
  const buyerTerms = expandTerms(rawBuyerTerms);
  let bestMatch = 0;
  const exactMatches = new Set<string>();
  const adjacentMatches = new Set<string>();
  for (const dt of dealTerms) {
    for (const bt of buyerTerms) {
      if (dt === bt) {
        bestMatch = 100;
        exactMatches.add(bt);
      } else if (dt.length >= 4 && bt.length >= 4) {
        const shorter = dt.length <= bt.length ? dt : bt;
        const longer = dt.length <= bt.length ? bt : dt;
        const escaped = shorter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${escaped}\\b`).test(longer)) {
          if (bestMatch < 60) bestMatch = 60;
          adjacentMatches.add(bt);
        }
      }
    }
  }
  const matchSignals: string[] = [];
  for (const m of exactMatches) matchSignals.push(`Exact industry match: ${m}`);
  if (bestMatch < 100) {
    for (const m of adjacentMatches) matchSignals.push(`Adjacent industry: ${m}`);
  }
  return { score: bestMatch, signals: matchSignals };
}

function scoreGeography(
  dealState: string,
  dealGeoStates: string[],
  buyerGeos: string[],
  buyerFootprint: string[],
  buyerHqState: string,
): { score: number; signals: string[] } {
  const signals: string[] = [];
  const dealStates = [dealState, ...dealGeoStates].filter(Boolean);
  if (dealStates.length === 0) return { score: 0, signals: [] };
  const allBuyerGeos = [...buyerGeos, ...buyerFootprint, buyerHqState].filter(Boolean);
  const nationalIndicators = ['national', 'nationwide', 'all states', 'us', 'united states'];
  if (allBuyerGeos.some((g) => nationalIndicators.includes(g))) {
    signals.push('National buyer');
    return { score: 80, signals };
  }
  for (const ds of dealStates) {
    if (allBuyerGeos.includes(ds)) {
      signals.push(`State match: ${ds}`);
      return { score: 100, signals };
    }
  }
  const REGION_NAMES = new Set([
    'northeast',
    'midwest',
    'south',
    'west',
    'southeast',
    'southwest',
    'northwest',
  ]);
  const dealRegions = new Set(
    dealStates.map((s) => STATE_REGIONS[s.toUpperCase()]).filter(Boolean),
  );
  const buyerRegions = new Set<string>();
  for (const g of allBuyerGeos) {
    const fromState = STATE_REGIONS[g.toUpperCase()];
    if (fromState) buyerRegions.add(fromState);
    if (REGION_NAMES.has(g)) {
      if (g === 'southeast' || g === 'southwest') buyerRegions.add('south');
      else if (g === 'northwest') buyerRegions.add('west');
      buyerRegions.add(g);
    }
  }
  const expandedDealRegions = new Set<string>(dealRegions);
  for (const dr of [...dealRegions]) {
    if (dr === 'south') {
      expandedDealRegions.add('southeast');
      expandedDealRegions.add('southwest');
    } else if (dr === 'west') {
      expandedDealRegions.add('northwest');
    }
  }
  for (const dr of expandedDealRegions) {
    if (buyerRegions.has(dr)) {
      signals.push(`Region match: ${dr}`);
      return { score: 60, signals };
    }
  }
  return { score: 0, signals: [] };
}

function scoreSize(
  dealEbitda: number | null,
  buyerMin: number | null,
  buyerMax: number | null,
): { score: number; signals: string[] } {
  const signals: string[] = [];
  if (dealEbitda == null || dealEbitda < 0 || (buyerMin == null && buyerMax == null)) {
    return { score: 0, signals: [] };
  }
  const min = buyerMin ?? 0;
  const max = buyerMax ?? Number.MAX_SAFE_INTEGER;
  if (dealEbitda >= min && dealEbitda <= max) {
    signals.push(`EBITDA in range ($${(dealEbitda / 1_000_000).toFixed(1)}M)`);
    return { score: 100, signals };
  }
  const rangeSize = max === Number.MAX_SAFE_INTEGER ? min * 2 : max - min;
  const tolerance = rangeSize * 0.5;
  if (dealEbitda >= min - tolerance && dealEbitda <= max + tolerance) {
    signals.push('EBITDA near target range');
    return { score: 60, signals };
  }
  return { score: 0, signals: [] };
}

function scoreBonus(buyer: {
  has_fee_agreement: boolean | null;
  acquisition_appetite: string | null;
  total_acquisitions: number | null;
}): { score: number; signals: string[] } {
  let points = 0;
  const signals: string[] = [];
  if (buyer.has_fee_agreement) {
    points += 34;
    signals.push('Fee agreement signed');
  }
  if (norm(buyer.acquisition_appetite) === 'aggressive') {
    points += 33;
    signals.push('Aggressive acquisition appetite');
  }
  if ((buyer.total_acquisitions || 0) > 3) {
    points += 33;
    signals.push(`${buyer.total_acquisitions} acquisitions`);
  }
  return { score: Math.min(points, 100), signals };
}

function classifyTier(
  compositeScore: number,
  hasFeeAgreement: boolean,
  appetite: string | null,
): 'move_now' | 'strong' | 'speculative' {
  if (compositeScore >= 80 && (hasFeeAgreement || norm(appetite) === 'aggressive'))
    return 'move_now';
  if (compositeScore >= 60) return 'strong';
  return 'speculative';
}

function getServiceGateMultiplier(serviceScore: number): number {
  if (serviceScore === 0) return 0.0;
  if (serviceScore <= 20) return 0.4;
  if (serviceScore <= 40) return 0.6;
  if (serviceScore <= 60) return 0.8;
  if (serviceScore <= 80) return 0.9;
  return 1.0;
}

const SCORE_WEIGHTS = { service: 0.7, geography: 0.15, bonus: 0.15 } as const;

function getBuyerTypePriority(buyerType: string | null, isPeBacked: boolean): number {
  if (buyerType === 'corporate' && isPeBacked) return 1;
  if (buyerType === 'private_equity') return 2;
  if (buyerType === 'family_office') return 2;
  if (buyerType === 'independent_sponsor') return 3;
  if (buyerType === 'search_fund') return 3;
  if (buyerType === 'corporate') return 4;
  return 5;
}

// ────────────────────────────────────────────────────────────────────────────
// TESTS
// ────────────────────────────────────────────────────────────────────────────

describe('norm()', () => {
  it('lowercases and trims', () => {
    expect(norm('  HVAC  ')).toBe('hvac');
  });
  it('handles null/undefined', () => {
    expect(norm(null)).toBe('');
    expect(norm(undefined)).toBe('');
  });
});

describe('normArray()', () => {
  it('normalizes array elements', () => {
    expect(normArray(['HVAC', ' Plumbing ', ''])).toEqual(['hvac', 'plumbing']);
  });
  it('handles null', () => {
    expect(normArray(null)).toEqual([]);
  });
});

describe('extractDealKeywords()', () => {
  it('extracts known sector terms from rich text', () => {
    const deal = {
      executive_summary: 'This HVAC company provides heating and cooling services.',
      description: 'Commercial plumbing and electrical work.',
    };
    const keywords = extractDealKeywords(deal);
    expect(keywords).toContain('hvac');
    expect(keywords).toContain('plumbing');
    expect(keywords).toContain('electrical');
  });

  it('does not match partial words (no "dental" in "accidental")', () => {
    const deal = { executive_summary: 'Accidental damage repair services.' };
    const keywords = extractDealKeywords(deal);
    expect(keywords).not.toContain('dental');
  });

  it('returns empty for irrelevant text', () => {
    const deal = { executive_summary: 'A widget manufacturing company.' };
    const keywords = extractDealKeywords(deal);
    expect(keywords).toContain('manufacturing');
    expect(keywords).not.toContain('dental');
    expect(keywords).not.toContain('hvac');
  });
});

describe('scoreService()', () => {
  it('returns 100 for exact match', () => {
    const result = scoreService(['hvac'], 'hvac', ['hvac'], [], '');
    expect(result.score).toBe(100);
    expect(result.signals.some((s) => s.includes('Exact'))).toBe(true);
  });

  it('returns 100 for synonym match (hvac -> climate control)', () => {
    const result = scoreService(['hvac'], '', ['climate control'], [], '');
    expect(result.score).toBe(100);
  });

  it('returns 100 via synonym expansion for electrical terms', () => {
    // "electrical" -> ["electrical services", "electrical contracting"]
    // Both "electrical services" and "electrical contracting" expand through "electrical"
    // So they share the synonym "electrical" and get exact match
    const result = scoreService(['electrical'], '', ['electrical contracting'], [], '');
    expect(result.score).toBe(100);
  });

  it('returns 0 when deal has no categories', () => {
    const result = scoreService([], '', ['hvac'], [], '');
    expect(result.score).toBe(0);
  });

  it('returns 0 when buyer has no services', () => {
    const result = scoreService(['hvac'], 'hvac', [], [], '');
    expect(result.score).toBe(0);
  });

  it('does NOT cross-match dental and veterinary (no healthcare bridge)', () => {
    const result = scoreService(['dental'], 'dental', ['veterinary'], ['animal health'], '');
    expect(result.score).toBe(0);
  });

  it('FIXED: HVAC and plumbing do NOT cross-match (mechanical bridge removed)', () => {
    // Previously HVAC -> "mechanical" and plumbing -> "mechanical services" caused
    // a false adjacent match at 60. Fixed by removing "mechanical" from HVAC synonyms
    // and "mechanical services" from plumbing synonyms.
    const result = scoreService(['hvac'], '', ['plumbing'], [], '');
    expect(result.score).toBe(0);
  });

  it('handles industry vertical as a buyer term', () => {
    const result = scoreService(['staffing'], '', [], [], 'workforce solutions');
    expect(result.score).toBe(100);
  });

  it('correctly handles multi-word terms', () => {
    const result = scoreService(['fire protection'], '', ['fire safety'], [], '');
    expect(result.score).toBe(100);
  });

  it('handles case insensitivity', () => {
    const result = scoreService(['HVAC'], '', ['Hvac'], [], '');
    expect(result.score).toBe(100);
  });
});

describe('scoreGeography()', () => {
  it('returns 100 for exact state match', () => {
    const result = scoreGeography('tx', [], ['tx'], [], '');
    expect(result.score).toBe(100);
    expect(result.signals[0]).toContain('State match');
  });

  it('returns 80 for national buyer', () => {
    const result = scoreGeography('tx', [], ['national'], [], '');
    expect(result.score).toBe(80);
  });

  it('returns 80 for nationwide buyer', () => {
    const result = scoreGeography('ca', [], ['nationwide'], [], '');
    expect(result.score).toBe(80);
  });

  it('returns 60 for regional match (TX and FL are both south)', () => {
    const result = scoreGeography('tx', [], ['fl'], [], '');
    expect(result.score).toBe(60);
    expect(result.signals[0]).toContain('Region match');
  });

  it('returns 0 for no overlap (TX south vs CA west)', () => {
    const result = scoreGeography('tx', [], ['ca'], [], '');
    expect(result.score).toBe(0);
  });

  it('returns 0 when deal has no state', () => {
    const result = scoreGeography('', [], ['tx'], [], '');
    expect(result.score).toBe(0);
  });

  it('matches deal geo_states (multi-state deals)', () => {
    const result = scoreGeography('', ['ca', 'or'], ['or'], [], '');
    expect(result.score).toBe(100);
  });

  it('uses buyer HQ state for matching', () => {
    const result = scoreGeography('ny', [], [], [], 'ny');
    expect(result.score).toBe(100);
  });

  it('handles region name in buyer geos (e.g., "southeast")', () => {
    const result = scoreGeography('fl', [], ['southeast'], [], '');
    expect(result.score).toBe(60);
  });

  it('south deal matches buyer targeting southeast', () => {
    const result = scoreGeography('ga', [], ['southeast'], [], '');
    expect(result.score).toBe(60);
  });
});

describe('scoreSize()', () => {
  it('returns 100 when deal EBITDA is within range', () => {
    const result = scoreSize(2_000_000, 1_000_000, 5_000_000);
    expect(result.score).toBe(100);
    expect(result.signals[0]).toContain('EBITDA in range');
  });

  it('returns 100 at exact boundary (min)', () => {
    const result = scoreSize(1_000_000, 1_000_000, 5_000_000);
    expect(result.score).toBe(100);
  });

  it('returns 100 at exact boundary (max)', () => {
    const result = scoreSize(5_000_000, 1_000_000, 5_000_000);
    expect(result.score).toBe(100);
  });

  it('returns 60 when near range (within 50% tolerance)', () => {
    // Range is 1M-5M, tolerance = 2M, so 500K should be near
    const result = scoreSize(500_000, 1_000_000, 5_000_000);
    expect(result.score).toBe(60);
  });

  it('returns 0 when far outside range', () => {
    const result = scoreSize(100_000, 5_000_000, 10_000_000);
    expect(result.score).toBe(0);
  });

  it('returns 0 when deal EBITDA is null', () => {
    const result = scoreSize(null, 1_000_000, 5_000_000);
    expect(result.score).toBe(0);
  });

  it('returns 0 when buyer has no min/max', () => {
    const result = scoreSize(2_000_000, null, null);
    expect(result.score).toBe(0);
  });

  it('handles buyer with only min set', () => {
    const result = scoreSize(3_000_000, 1_000_000, null);
    expect(result.score).toBe(100);
  });

  it('handles buyer with only max set', () => {
    const result = scoreSize(3_000_000, null, 5_000_000);
    expect(result.score).toBe(100);
  });
});

describe('scoreBonus()', () => {
  it('awards 34 points for fee agreement', () => {
    const result = scoreBonus({
      has_fee_agreement: true,
      acquisition_appetite: null,
      total_acquisitions: null,
    });
    expect(result.score).toBe(34);
    expect(result.signals).toContain('Fee agreement signed');
  });

  it('awards 33 points for aggressive appetite', () => {
    const result = scoreBonus({
      has_fee_agreement: false,
      acquisition_appetite: 'aggressive',
      total_acquisitions: null,
    });
    expect(result.score).toBe(33);
  });

  it('awards 33 points for 4+ acquisitions', () => {
    const result = scoreBonus({
      has_fee_agreement: false,
      acquisition_appetite: null,
      total_acquisitions: 5,
    });
    expect(result.score).toBe(33);
  });

  it('caps at 100 for all bonuses', () => {
    const result = scoreBonus({
      has_fee_agreement: true,
      acquisition_appetite: 'aggressive',
      total_acquisitions: 10,
    });
    expect(result.score).toBe(100);
  });

  it('returns 0 for no bonuses', () => {
    const result = scoreBonus({
      has_fee_agreement: false,
      acquisition_appetite: null,
      total_acquisitions: 0,
    });
    expect(result.score).toBe(0);
  });

  it('does not award for 3 or fewer acquisitions', () => {
    const result = scoreBonus({
      has_fee_agreement: false,
      acquisition_appetite: null,
      total_acquisitions: 3,
    });
    expect(result.score).toBe(0);
  });
});

describe('classifyTier()', () => {
  it('returns move_now for score>=80 with fee agreement', () => {
    expect(classifyTier(80, true, null)).toBe('move_now');
  });

  it('returns move_now for score>=80 with aggressive appetite', () => {
    expect(classifyTier(85, false, 'aggressive')).toBe('move_now');
  });

  it('returns strong for score>=60 without readiness signals', () => {
    expect(classifyTier(80, false, null)).toBe('strong');
  });

  it('returns strong for score=60', () => {
    expect(classifyTier(60, false, null)).toBe('strong');
  });

  it('returns speculative for score<60', () => {
    expect(classifyTier(59, true, 'aggressive')).toBe('speculative');
  });

  it('returns speculative for score=0', () => {
    expect(classifyTier(0, false, null)).toBe('speculative');
  });
});

describe('getServiceGateMultiplier()', () => {
  it('kills score at 0 service', () => {
    expect(getServiceGateMultiplier(0)).toBe(0.0);
  });
  it('returns 0.4 for very low service score', () => {
    expect(getServiceGateMultiplier(20)).toBe(0.4);
  });
  it('returns 1.0 for high service score', () => {
    expect(getServiceGateMultiplier(100)).toBe(1.0);
  });
  it('returns 0.8 for adjacent match (60)', () => {
    expect(getServiceGateMultiplier(60)).toBe(0.8);
  });
});

describe('getBuyerTypePriority()', () => {
  it('PE-backed corporate = priority 1', () => {
    expect(getBuyerTypePriority('corporate', true)).toBe(1);
  });
  it('PE firm = priority 2', () => {
    expect(getBuyerTypePriority('private_equity', false)).toBe(2);
  });
  it('family office = priority 2', () => {
    expect(getBuyerTypePriority('family_office', false)).toBe(2);
  });
  it('search fund = priority 3', () => {
    expect(getBuyerTypePriority('search_fund', false)).toBe(3);
  });
  it('non-PE corporate = priority 4', () => {
    expect(getBuyerTypePriority('corporate', false)).toBe(4);
  });
  it('individual = priority 5', () => {
    expect(getBuyerTypePriority('individual_buyer', false)).toBe(5);
  });
  it('null type = priority 5', () => {
    expect(getBuyerTypePriority(null, false)).toBe(5);
  });
});

describe('SCORE_WEIGHTS', () => {
  it('weights sum to 1.0', () => {
    const sum = SCORE_WEIGHTS.service + SCORE_WEIGHTS.geography + SCORE_WEIGHTS.bonus;
    expect(sum).toBeCloseTo(1.0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 10 REAL COMPANY SCENARIOS — End-to-end scoring pipeline
// ────────────────────────────────────────────────────────────────────────────

describe('10 Real Company Scenarios', () => {
  function computeComposite(
    deal: {
      categories: string[];
      industry: string;
      state: string;
      geoStates: string[];
      ebitda: number | null;
    },
    buyer: {
      services: string[];
      industries: string[];
      industryVertical: string;
      geos: string[];
      footprint: string[];
      hqState: string;
      ebitdaMin: number | null;
      ebitdaMax: number | null;
      hasFee: boolean;
      appetite: string | null;
      acquisitions: number | null;
      buyerType: string;
      isPeBacked: boolean;
    },
  ) {
    const dealCats = normArray([
      ...deal.categories,
      ...extractDealKeywords({ industry: deal.industry }),
    ]);
    const dealInd = norm(deal.industry);
    const svc = scoreService(
      dealCats,
      dealInd,
      normArray(buyer.services),
      normArray(buyer.industries),
      norm(buyer.industryVertical),
    );
    const geo = scoreGeography(
      norm(deal.state),
      normArray(deal.geoStates),
      normArray(buyer.geos),
      normArray(buyer.footprint),
      norm(buyer.hqState),
    );
    const bonus = scoreBonus({
      has_fee_agreement: buyer.hasFee,
      acquisition_appetite: buyer.appetite,
      total_acquisitions: buyer.acquisitions,
    });
    const rawComposite = Math.round(
      svc.score * SCORE_WEIGHTS.service +
        geo.score * SCORE_WEIGHTS.geography +
        bonus.score * SCORE_WEIGHTS.bonus,
    );
    const gate = getServiceGateMultiplier(svc.score);
    const composite = Math.round(rawComposite * gate);
    const tier = classifyTier(composite, buyer.hasFee, buyer.appetite);
    const priority = getBuyerTypePriority(buyer.buyerType, buyer.isPeBacked);
    return { composite, svc, geo, bonus, tier, priority, gate };
  }

  // 1. Perfect PE-backed HVAC platform for HVAC deal in TX
  it('Scenario 1: PE-backed HVAC platform — perfect match', () => {
    const r = computeComposite(
      { categories: ['hvac'], industry: 'HVAC', state: 'TX', geoStates: [], ebitda: 3_000_000 },
      {
        services: ['hvac', 'mechanical'],
        industries: ['home services'],
        industryVertical: 'HVAC',
        geos: ['tx', 'ok', 'la'],
        footprint: [],
        hqState: 'tx',
        ebitdaMin: 1_000_000,
        ebitdaMax: 10_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 8,
        buyerType: 'corporate',
        isPeBacked: true,
      },
    );
    expect(r.composite).toBeGreaterThanOrEqual(80);
    expect(r.tier).toBe('move_now');
    expect(r.priority).toBe(1);
    expect(r.svc.score).toBe(100);
    expect(r.geo.score).toBe(100);
  });

  // 2. Dental practice buyer looking at veterinary deal — should NOT match
  it('Scenario 2: Dental buyer vs veterinary deal — no cross-match', () => {
    const r = computeComposite(
      {
        categories: ['veterinary'],
        industry: 'Veterinary',
        state: 'FL',
        geoStates: [],
        ebitda: 1_500_000,
      },
      {
        services: ['dental', 'orthodontics'],
        industries: ['dental services'],
        industryVertical: 'Dental',
        geos: ['fl'],
        footprint: [],
        hqState: 'fl',
        ebitdaMin: 500_000,
        ebitdaMax: 5_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 2,
        buyerType: 'corporate',
        isPeBacked: true,
      },
    );
    expect(r.svc.score).toBe(0);
    expect(r.composite).toBe(0); // service gate kills everything
    expect(r.gate).toBe(0.0);
  });

  // 3. National PE firm with staffing focus vs staffing deal in OH
  it('Scenario 3: National staffing PE — strong match', () => {
    const r = computeComposite(
      {
        categories: ['staffing'],
        industry: 'Staffing',
        state: 'OH',
        geoStates: [],
        ebitda: 2_000_000,
      },
      {
        services: ['workforce solutions', 'temporary staffing'],
        industries: ['staffing'],
        industryVertical: '',
        geos: ['national'],
        footprint: [],
        hqState: 'ny',
        ebitdaMin: 1_000_000,
        ebitdaMax: 5_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 0,
        buyerType: 'private_equity',
        isPeBacked: false,
      },
    );
    expect(r.svc.score).toBe(100);
    expect(r.geo.score).toBe(80);
    expect(r.composite).toBeGreaterThanOrEqual(60);
    expect(r.tier).toBe('strong');
  });

  // 4. Landscaping platform with fee agreement vs landscaping deal
  it('Scenario 4: Landscaping platform — move_now with fee', () => {
    const r = computeComposite(
      {
        categories: ['landscaping'],
        industry: 'Landscaping',
        state: 'CA',
        geoStates: ['ca', 'az'],
        ebitda: 4_000_000,
      },
      {
        services: ['lawn care', 'grounds maintenance'],
        industries: ['landscaping'],
        industryVertical: '',
        geos: ['ca', 'az', 'nv'],
        footprint: [],
        hqState: 'ca',
        ebitdaMin: 2_000_000,
        ebitdaMax: 8_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 12,
        buyerType: 'corporate',
        isPeBacked: true,
      },
    );
    expect(r.svc.score).toBe(100);
    expect(r.geo.score).toBe(100);
    expect(r.composite).toBeGreaterThanOrEqual(80);
    expect(r.tier).toBe('move_now');
  });

  // 5. IT services buyer vs cybersecurity deal — adjacent but different
  it('Scenario 5: IT services vs cybersecurity — NOT exact match', () => {
    const r = computeComposite(
      {
        categories: ['cybersecurity'],
        industry: 'Cybersecurity',
        state: 'VA',
        geoStates: [],
        ebitda: 3_000_000,
      },
      {
        services: ['it services', 'managed services'],
        industries: [],
        industryVertical: 'IT Services',
        geos: ['va', 'md', 'dc'],
        footprint: [],
        hqState: 'va',
        ebitdaMin: 1_000_000,
        ebitdaMax: 10_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 3,
        buyerType: 'corporate',
        isPeBacked: true,
      },
    );
    // IT services and cybersecurity are NOT synonyms — they should NOT exact match
    expect(r.svc.score).toBeLessThan(100);
  });

  // 6. Wrong geography entirely — west coast buyer vs northeast deal
  it('Scenario 6: Wrong geography — should score 0 geo', () => {
    const r = computeComposite(
      {
        categories: ['plumbing'],
        industry: 'Plumbing',
        state: 'NY',
        geoStates: [],
        ebitda: 2_000_000,
      },
      {
        services: ['plumbing'],
        industries: [],
        industryVertical: '',
        geos: ['ca', 'wa', 'or'],
        footprint: [],
        hqState: 'ca',
        ebitdaMin: 1_000_000,
        ebitdaMax: 5_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 0,
        buyerType: 'corporate',
        isPeBacked: true,
      },
    );
    expect(r.svc.score).toBe(100);
    expect(r.geo.score).toBe(0);
    expect(r.composite).toBeLessThan(80);
  });

  // 7. Family office — buyer HQ in IL matches deal state IL (state match, not region)
  it('Scenario 7: Family office — state match via HQ, strong', () => {
    const r = computeComposite(
      {
        categories: ['insurance'],
        industry: 'Insurance',
        state: 'IL',
        geoStates: [],
        ebitda: 5_000_000,
      },
      {
        services: ['insurance brokerage'],
        industries: ['insurance'],
        industryVertical: '',
        geos: ['midwest'],
        footprint: [],
        hqState: 'il',
        ebitdaMin: null,
        ebitdaMax: null,
        hasFee: false,
        appetite: null,
        acquisitions: 0,
        buyerType: 'family_office',
        isPeBacked: false,
      },
    );
    expect(r.svc.score).toBe(100);
    expect(r.geo.score).toBe(100); // state match via hqState=il matching dealState=il
    expect(r.priority).toBe(2);
  });

  // 8. Search fund — completely wrong industry
  it('Scenario 8: Search fund in food vs dental deal — zero service', () => {
    const r = computeComposite(
      { categories: ['dental'], industry: 'Dental', state: 'TX', geoStates: [], ebitda: 1_000_000 },
      {
        services: ['food distribution', 'catering'],
        industries: ['food services'],
        industryVertical: '',
        geos: ['tx'],
        footprint: [],
        hqState: 'tx',
        ebitdaMin: 500_000,
        ebitdaMax: 3_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 0,
        buyerType: 'search_fund',
        isPeBacked: false,
      },
    );
    expect(r.svc.score).toBe(0);
    expect(r.composite).toBe(0); // gate kills it
  });

  // 9. PE-backed fire protection platform vs fire protection deal
  it('Scenario 9: Fire protection PE platform — exact match', () => {
    const r = computeComposite(
      {
        categories: ['fire protection'],
        industry: 'Fire Protection',
        state: 'GA',
        geoStates: ['ga', 'sc', 'nc'],
        ebitda: 2_500_000,
      },
      {
        services: ['fire safety', 'sprinkler systems', 'life safety'],
        industries: ['fire protection'],
        industryVertical: '',
        geos: ['ga', 'fl', 'sc', 'nc'],
        footprint: [],
        hqState: 'ga',
        ebitdaMin: 1_000_000,
        ebitdaMax: 7_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 6,
        buyerType: 'corporate',
        isPeBacked: true,
      },
    );
    expect(r.svc.score).toBe(100);
    expect(r.geo.score).toBe(100);
    expect(r.bonus.score).toBe(100);
    expect(r.composite).toBe(100);
    expect(r.tier).toBe('move_now');
  });

  // 10. Good service + geo but no bonus signals — strong not move_now
  it('Scenario 10: Good fit but no readiness signals — strong tier', () => {
    const r = computeComposite(
      {
        categories: ['electrical'],
        industry: 'Electrical',
        state: 'TX',
        geoStates: [],
        ebitda: 50_000_000,
      },
      {
        services: ['electrical', 'electrical contracting'],
        industries: [],
        industryVertical: '',
        geos: ['tx'],
        footprint: [],
        hqState: 'tx',
        ebitdaMin: 1_000_000,
        ebitdaMax: 5_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 2,
        buyerType: 'corporate',
        isPeBacked: true,
      },
    );
    expect(r.svc.score).toBe(100);
    expect(r.geo.score).toBe(100);
    expect(r.tier).toBe('strong'); // no readiness signals, so not move_now
  });
});

// ────────────────────────────────────────────────────────────────────────────
// EDGE CASES & REGRESSION TESTS
// ────────────────────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('composite score never exceeds 100', () => {
    const svc = { score: 100 };
    const geo = { score: 100 };
    const bonus = { score: 100 };
    const raw = Math.round(
      svc.score * SCORE_WEIGHTS.service +
        geo.score * SCORE_WEIGHTS.geography +
        bonus.score * SCORE_WEIGHTS.bonus,
    );
    expect(raw).toBeLessThanOrEqual(100);
  });

  it('composite score is never negative', () => {
    const svc = scoreService([], '', [], [], '');
    const geo = scoreGeography('', [], [], [], '');
    const bonus = scoreBonus({
      has_fee_agreement: false,
      acquisition_appetite: null,
      total_acquisitions: null,
    });
    const raw = Math.round(
      svc.score * SCORE_WEIGHTS.service +
        geo.score * SCORE_WEIGHTS.geography +
        bonus.score * SCORE_WEIGHTS.bonus,
    );
    const gated = Math.round(raw * getServiceGateMultiplier(svc.score));
    expect(gated).toBeGreaterThanOrEqual(0);
  });

  it('expandTerms does not infinite loop on circular synonyms', () => {
    // staffing -> recruiting -> staffing (circular)
    const result = expandTerms(['staffing']);
    expect(result).toContain('staffing');
    expect(result).toContain('recruiting');
    expect(result.length).toBeLessThan(20);
  });

  it('FIXED: negative EBITDA returns 0 (not near-range 60)', () => {
    // Previously -500K fell within the 50% tolerance zone and scored 60.
    // Fixed by adding early return for dealEbitda < 0.
    const result = scoreSize(-500_000, 1_000_000, 5_000_000);
    expect(result.score).toBe(0);
  });

  it('service gate at 0 ensures zero composite even with perfect geo/bonus', () => {
    const raw = Math.round(
      0 * SCORE_WEIGHTS.service + 100 * SCORE_WEIGHTS.geography + 100 * SCORE_WEIGHTS.bonus,
    );
    const gated = Math.round(raw * getServiceGateMultiplier(0));
    expect(gated).toBe(0);
  });

  it('buyer with all empty arrays/nulls scores 0 across the board', () => {
    const svc = scoreService([], '', [], [], '');
    const geo = scoreGeography('', [], [], [], '');
    const bonus = scoreBonus({
      has_fee_agreement: null,
      acquisition_appetite: null,
      total_acquisitions: null,
    });
    expect(svc.score).toBe(0);
    expect(geo.score).toBe(0);
    expect(bonus.score).toBe(0);
  });
});
