/**
 * 5 Niche Companies × 5 Buyers Each — Hard Categories
 *
 * Tests scoring with ambiguous verticals: utility metering, benefits advisory,
 * environmental remediation, precision manufacturing, and 3PL logistics.
 * All PE-backed buyers only.
 */
import { describe, it, expect } from 'vitest';

// ── Inline copies of scoring functions ──

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
  hvac: ['hvac services', 'climate control', 'heating and cooling', 'air conditioning'],
  plumbing: ['plumbing services', 'plumbing contractor', 'pipe services'],
  roofing: ['roofing services', 'exterior services'],
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
  consulting: ['advisory', 'professional services', 'management consulting'],
  electrical: ['electrical services', 'electrical contracting', 'power systems'],
  construction: ['general contracting', 'specialty contracting', 'trades'],
  'fire protection': ['fire safety', 'fire suppression', 'life safety', 'sprinkler systems'],
  restoration: ['remediation', 'disaster recovery', 'reconstruction', 'water damage'],
  janitorial: ['commercial cleaning', 'custodial', 'cleaning services'],
  'commercial cleaning': ['janitorial', 'custodial', 'cleaning services'],
  'it services': ['managed services', 'msp', 'technology services', 'it support'],
  cybersecurity: ['information security', 'managed security', 'infosec', 'network security'],
  landscaping: ['grounds maintenance', 'outdoor services', 'lawn care', 'landscape services'],
  'pest control': ['extermination', 'pest management', 'termite control'],
  'waste management': ['waste services', 'recycling', 'hauling', 'waste collection'],
  insurance: ['insurance services', 'insurance brokerage', 'risk management'],
  'food services': ['food distribution', 'catering', 'food manufacturing'],
  automotive: ['auto services', 'auto repair', 'collision', 'vehicle services'],
  healthcare: ['health services', 'medical services', 'patient care'],
  manufacturing: ['production', 'fabrication', 'industrial', 'precision manufacturing'],
  distribution: ['wholesale', 'supply chain', 'industrial distribution'],
  logistics: ['transportation', 'freight', '3pl', 'warehousing'],
  software: ['saas', 'technology', 'tech-enabled services'],
  education: ['training', 'learning', 'ed tech', 'tutoring', 'educational services'],
  accounting: ['bookkeeping', 'cpa', 'tax services', 'audit services'],
  collision: ['auto body', 'paint and body', 'auto repair'],
  'employee benefits': ['benefits administration', 'benefits advisory', 'group benefits'],
  'benefits advisory': ['employee benefits', 'benefits administration', 'group benefits'],
  environmental: ['environmental services', 'remediation', 'abatement', 'hazmat'],
  remediation: [
    'environmental services',
    'restoration',
    'disaster recovery',
    'water damage',
    'abatement',
  ],
  'precision manufacturing': ['manufacturing', 'cnc', 'machining', 'fabrication'],
  '3pl': ['logistics', 'warehousing', 'fulfillment', 'freight', 'transportation'],
  warehousing: ['3pl', 'logistics', 'fulfillment', 'distribution'],
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
  if (rawDealTerms.length === 0 || rawBuyerTerms.length === 0) return { score: 0, signals: [] };
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
  for (const m of exactMatches) matchSignals.push(`Exact: ${m}`);
  if (bestMatch < 100) {
    for (const m of adjacentMatches) matchSignals.push(`Adjacent: ${m}`);
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
  const dealStates = [dealState, ...dealGeoStates].filter(Boolean);
  if (dealStates.length === 0) return { score: 0, signals: [] };
  const allBuyerGeos = [...buyerGeos, ...buyerFootprint, buyerHqState].filter(Boolean);
  const nationalIndicators = ['national', 'nationwide', 'all states', 'us', 'united states'];
  if (allBuyerGeos.some((g) => nationalIndicators.includes(g))) {
    return { score: 80, signals: ['National buyer'] };
  }
  for (const ds of dealStates) {
    if (allBuyerGeos.includes(ds)) return { score: 100, signals: [`State: ${ds.toUpperCase()}`] };
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
    } else if (dr === 'west') expandedDealRegions.add('northwest');
  }
  for (const dr of expandedDealRegions) {
    if (buyerRegions.has(dr)) return { score: 60, signals: [`Region: ${dr}`] };
  }
  return { score: 0, signals: [] };
}

function scoreBonus(buyer: {
  hasFee: boolean;
  appetite: string | null;
  acquisitions: number | null;
}): { score: number; signals: string[] } {
  let points = 0;
  const signals: string[] = [];
  if (buyer.hasFee) {
    points += 34;
    signals.push('Fee agreement');
  }
  if (norm(buyer.appetite) === 'aggressive') {
    points += 33;
    signals.push('Aggressive');
  }
  if ((buyer.acquisitions || 0) > 3) {
    points += 33;
    signals.push(`${buyer.acquisitions} acqs`);
  }
  return { score: Math.min(points, 100), signals };
}

const SCORE_WEIGHTS = { service: 0.7, geography: 0.15, bonus: 0.15 } as const;

function getServiceGateMultiplier(serviceScore: number): number {
  if (serviceScore === 0) return 0.0;
  if (serviceScore <= 20) return 0.4;
  if (serviceScore <= 40) return 0.6;
  if (serviceScore <= 60) return 0.8;
  if (serviceScore <= 80) return 0.9;
  return 1.0;
}

function classifyTier(composite: number, hasFee: boolean, appetite: string | null): string {
  if (composite >= 80 && (hasFee || norm(appetite) === 'aggressive')) return 'MOVE_NOW';
  if (composite >= 60) return 'STRONG';
  return 'SPECULATIVE';
}

interface Deal {
  name: string;
  categories: string[];
  industry: string;
  state: string;
  geoStates: string[];
  ebitda: number | null;
}

interface Buyer {
  name: string;
  peFirm: string | null;
  services: string[];
  industries: string[];
  geos: string[];
  hqState: string;
  ebitdaMin: number | null;
  ebitdaMax: number | null;
  hasFee: boolean;
  appetite: string | null;
  acquisitions: number | null;
  isPeBacked: boolean;
}

function scoreBuyer(deal: Deal, buyer: Buyer) {
  const svc = scoreService(
    normArray(deal.categories),
    norm(deal.industry),
    normArray(buyer.services),
    normArray(buyer.industries),
    '',
  );
  const geo = scoreGeography(
    norm(deal.state),
    normArray(deal.geoStates),
    normArray(buyer.geos),
    [],
    norm(buyer.hqState),
  );
  const bonus = scoreBonus({
    hasFee: buyer.hasFee,
    appetite: buyer.appetite,
    acquisitions: buyer.acquisitions,
  });
  const raw = Math.round(
    svc.score * SCORE_WEIGHTS.service +
      geo.score * SCORE_WEIGHTS.geography +
      bonus.score * SCORE_WEIGHTS.bonus,
  );
  const gate = getServiceGateMultiplier(svc.score);
  const composite = Math.round(raw * gate);
  const tier = classifyTier(composite, buyer.hasFee, buyer.appetite);
  return {
    composite,
    svc: svc.score,
    geo: geo.score,
    bonus: bonus.score,
    tier,
    signals: [...svc.signals, ...geo.signals, ...bonus.signals],
    gate,
  };
}

// ── 5 NICHE COMPANIES × 5 BUYERS EACH ──

const scenarios: { deal: Deal; buyers: Buyer[] }[] = [
  // 1. Utility metering / AMR company in rural Mississippi
  {
    deal: {
      name: 'Delta Metering Solutions',
      categories: ['metering', 'utility services'],
      industry: 'Utility Metering',
      state: 'MS',
      geoStates: ['MS', 'AL', 'LA'],
      ebitda: 1_800_000,
    },
    buyers: [
      {
        name: 'Saks Metering Group',
        peFirm: 'Centerbridge Partners',
        services: ['meter reading', 'ami', 'smart meter'],
        industries: ['utility services'],
        geos: ['southeast'],
        hqState: 'AL',
        ebitdaMin: 500_000,
        ebitdaMax: 4_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 3,
        isPeBacked: true,
      },
      {
        name: 'Utility Partners of America',
        peFirm: 'Bernhard Capital',
        services: ['utility', 'field services', 'meter installation'],
        industries: ['infrastructure services'],
        geos: ['MS', 'AL', 'TN', 'AR'],
        hqState: 'LA',
        ebitdaMin: 1_000_000,
        ebitdaMax: 8_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 11,
        isPeBacked: true,
      },
      {
        name: 'Core & Main',
        peFirm: 'Clayton Dubilier & Rice',
        services: ['water infrastructure', 'municipal services'],
        industries: ['utility'],
        geos: ['national'],
        hqState: 'MO',
        ebitdaMin: 5_000_000,
        ebitdaMax: 50_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 25,
        isPeBacked: true,
      },
      {
        name: 'PowerGrid Services',
        peFirm: 'Kohlberg & Company',
        services: ['infrastructure', 'field services', 'utility'],
        industries: ['utility services'],
        geos: ['national'],
        hqState: 'TX',
        ebitdaMin: 2_000_000,
        ebitdaMax: 15_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 9,
        isPeBacked: true,
      },
      {
        name: 'Southern Dental Holdings',
        peFirm: 'Shore Capital',
        services: ['dental'],
        industries: ['dental services'],
        geos: ['MS', 'AL', 'TN'],
        hqState: 'TN',
        ebitdaMin: 500_000,
        ebitdaMax: 3_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 7,
        isPeBacked: true,
      },
    ],
  },

  // 2. Employee benefits advisory firm in Connecticut
  {
    deal: {
      name: 'Essential Benefits Advisors',
      categories: ['employee benefits', 'benefits advisory'],
      industry: 'Benefits Consulting',
      state: 'CT',
      geoStates: ['CT', 'NY', 'MA'],
      ebitda: 2_200_000,
    },
    buyers: [
      {
        name: 'OneDigital Health and Benefits',
        peFirm: 'New Mountain Capital',
        services: ['employee benefits', 'benefits administration'],
        industries: ['insurance services'],
        geos: ['national'],
        hqState: 'GA',
        ebitdaMin: 500_000,
        ebitdaMax: 10_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 80,
        isPeBacked: true,
      },
      {
        name: 'Acrisure',
        peFirm: 'BRG / Gallatin Point',
        services: ['insurance brokerage', 'risk management'],
        industries: ['insurance'],
        geos: ['national'],
        hqState: 'MI',
        ebitdaMin: 1_000_000,
        ebitdaMax: 20_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 300,
        isPeBacked: true,
      },
      {
        name: 'Alera Group',
        peFirm: 'Genstar Capital',
        services: ['employee benefits', 'group benefits'],
        industries: ['benefits advisory'],
        geos: ['CT', 'NY', 'NJ', 'MA'],
        hqState: 'IL',
        ebitdaMin: 500_000,
        ebitdaMax: 5_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 40,
        isPeBacked: true,
      },
      {
        name: 'NFP Corp',
        peFirm: 'Madison Dearborn',
        services: ['benefits administration', 'insurance brokerage'],
        industries: ['employee benefits'],
        geos: ['national'],
        hqState: 'NY',
        ebitdaMin: 1_000_000,
        ebitdaMax: 15_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 50,
        isPeBacked: true,
      },
      {
        name: 'ConnectPoint Consulting',
        peFirm: 'Abry Partners',
        services: ['managed services', 'it support'],
        industries: ['technology services'],
        geos: ['CT', 'NY'],
        hqState: 'CT',
        ebitdaMin: 500_000,
        ebitdaMax: 3_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 6,
        isPeBacked: true,
      },
    ],
  },

  // 3. Environmental remediation / abatement company in New Jersey
  {
    deal: {
      name: 'CleanSite Environmental',
      categories: ['remediation', 'environmental'],
      industry: 'Environmental Services',
      state: 'NJ',
      geoStates: ['NJ', 'NY', 'PA'],
      ebitda: 3_500_000,
    },
    buyers: [
      {
        name: 'Enviri Group (Harsco)',
        peFirm: 'Warburg Pincus',
        services: ['environmental services', 'hazmat', 'remediation'],
        industries: ['environmental'],
        geos: ['national'],
        hqState: 'PA',
        ebitdaMin: 3_000_000,
        ebitdaMax: 25_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 15,
        isPeBacked: true,
      },
      {
        name: 'Montrose Environmental',
        peFirm: 'Oaktree Capital',
        services: ['remediation', 'abatement'],
        industries: ['environmental services'],
        geos: ['national'],
        hqState: 'CA',
        ebitdaMin: 2_000_000,
        ebitdaMax: 20_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 18,
        isPeBacked: true,
      },
      {
        name: 'EG Group Environmental',
        peFirm: 'Arsenal Capital',
        services: ['abatement', 'environmental services'],
        industries: ['remediation'],
        geos: ['NJ', 'NY', 'PA', 'CT'],
        hqState: 'NJ',
        ebitdaMin: 1_000_000,
        ebitdaMax: 8_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 9,
        isPeBacked: true,
      },
      {
        name: 'ServiceMaster Restore',
        peFirm: 'Roark Capital',
        services: ['restoration', 'water damage', 'disaster recovery'],
        industries: [],
        geos: ['national'],
        hqState: 'TN',
        ebitdaMin: 1_000_000,
        ebitdaMax: 10_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 8,
        isPeBacked: true,
      },
      {
        name: 'Horizon Facility Services',
        peFirm: 'Platinum Equity',
        services: ['plumbing', 'facility maintenance'],
        industries: ['building services'],
        geos: ['NJ', 'NY', 'PA'],
        hqState: 'NJ',
        ebitdaMin: 1_000_000,
        ebitdaMax: 8_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 4,
        isPeBacked: true,
      },
    ],
  },

  // 4. Precision CNC machining shop in Wisconsin
  {
    deal: {
      name: 'Badger Precision Industries',
      categories: ['precision manufacturing', 'manufacturing'],
      industry: 'Precision Manufacturing',
      state: 'WI',
      geoStates: ['WI', 'MN', 'IL'],
      ebitda: 4_000_000,
    },
    buyers: [
      {
        name: 'Tekfor Group',
        peFirm: 'American Industrial Partners',
        services: ['manufacturing', 'industrial'],
        industries: ['precision manufacturing'],
        geos: ['national'],
        hqState: 'IL',
        ebitdaMin: 3_000_000,
        ebitdaMax: 30_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 12,
        isPeBacked: true,
      },
      {
        name: 'Midwest Metal Products',
        peFirm: 'Pfingsten Partners',
        services: ['cnc', 'machining', 'fabrication'],
        industries: ['manufacturing'],
        geos: ['WI', 'IL', 'IN'],
        hqState: 'IL',
        ebitdaMin: 1_000_000,
        ebitdaMax: 6_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 6,
        isPeBacked: true,
      },
      {
        name: 'Precision Castparts',
        peFirm: 'Berkshire Partners',
        services: ['fabrication', 'production'],
        industries: ['manufacturing'],
        geos: ['national'],
        hqState: 'PA',
        ebitdaMin: 5_000_000,
        ebitdaMax: 40_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 8,
        isPeBacked: true,
      },
      {
        name: 'Great Lakes Staffing',
        peFirm: 'THL Partners',
        services: ['staffing', 'temporary staffing'],
        industries: ['workforce solutions'],
        geos: ['WI', 'MI', 'MN'],
        hqState: 'WI',
        ebitdaMin: 500_000,
        ebitdaMax: 3_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 5,
        isPeBacked: true,
      },
      {
        name: 'Shoreview Industries',
        peFirm: 'Shoreview Partners',
        services: ['industrial', 'production'],
        industries: ['manufacturing'],
        geos: ['midwest'],
        hqState: 'MN',
        ebitdaMin: 2_000_000,
        ebitdaMax: 12_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 14,
        isPeBacked: true,
      },
    ],
  },

  // 5. Third-party logistics / warehousing company in Memphis, TN
  {
    deal: {
      name: 'Bluff City Fulfillment',
      categories: ['3pl', 'warehousing'],
      industry: 'Logistics',
      state: 'TN',
      geoStates: ['TN', 'MS', 'AR'],
      ebitda: 2_800_000,
    },
    buyers: [
      {
        name: 'Radial (bpost)',
        peFirm: 'Advent International',
        services: ['3pl', 'warehousing', 'fulfillment'],
        industries: ['logistics'],
        geos: ['national'],
        hqState: 'PA',
        ebitdaMin: 2_000_000,
        ebitdaMax: 15_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 8,
        isPeBacked: true,
      },
      {
        name: 'Geodis (Ozburn-Hessey)',
        peFirm: 'CEVA / CMA CGM',
        services: ['warehousing', 'distribution'],
        industries: ['logistics'],
        geos: ['TN', 'GA', 'KY'],
        hqState: 'TN',
        ebitdaMin: 3_000_000,
        ebitdaMax: 20_000_000,
        hasFee: true,
        appetite: null,
        acquisitions: 6,
        isPeBacked: true,
      },
      {
        name: 'Port Logistics Group',
        peFirm: 'Jordan Company',
        services: ['transportation', 'freight', 'warehousing'],
        industries: ['3pl'],
        geos: ['national'],
        hqState: 'NJ',
        ebitdaMin: 2_000_000,
        ebitdaMax: 18_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 10,
        isPeBacked: true,
      },
      {
        name: 'OmniTRAX',
        peFirm: 'Broe Group',
        services: ['freight', 'transportation'],
        industries: ['logistics'],
        geos: ['national'],
        hqState: 'CO',
        ebitdaMin: 2_000_000,
        ebitdaMax: 15_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 7,
        isPeBacked: true,
      },
      {
        name: 'Southern Dental Holdings',
        peFirm: 'Shore Capital',
        services: ['dental'],
        industries: ['dental services'],
        geos: ['TN', 'MS', 'AL'],
        hqState: 'TN',
        ebitdaMin: 500_000,
        ebitdaMax: 4_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 7,
        isPeBacked: true,
      },
    ],
  },
];

// ── RUN ALL SCENARIOS ──

describe('5 Niche Companies × 5 Buyers: Scoring Results', () => {
  const allResults: string[] = [];

  scenarios.forEach((scenario, idx) => {
    describe(`${idx + 1}. ${scenario.deal.name}`, () => {
      const results = scenario.buyers.map((buyer) => ({
        buyer,
        ...scoreBuyer(scenario.deal, buyer),
      }));

      results.sort((a, b) => b.composite - a.composite);

      results.forEach((r, rank) => {
        it(`Rank ${rank + 1}: ${r.buyer.name} → ${r.composite} (${r.tier})`, () => {
          expect(r.composite).toBeGreaterThanOrEqual(0);
          expect(r.composite).toBeLessThanOrEqual(100);
          expect(['MOVE_NOW', 'STRONG', 'SPECULATIVE']).toContain(r.tier);
          expect(r.svc).toBeGreaterThanOrEqual(0);
          expect(r.svc).toBeLessThanOrEqual(100);
          expect(r.geo).toBeGreaterThanOrEqual(0);
          expect(r.geo).toBeLessThanOrEqual(100);
          expect(r.bonus).toBeGreaterThanOrEqual(0);
          expect(r.bonus).toBeLessThanOrEqual(100);
        });
      });

      const header = `\n━━━ ${idx + 1}. ${scenario.deal.name} (${scenario.deal.industry}, ${scenario.deal.state}) ━━━`;
      allResults.push(header);
      results.forEach((r, rank) => {
        const pe = r.buyer.peFirm ? ` [PE: ${r.buyer.peFirm}]` : '';
        allResults.push(
          `  #${rank + 1} ${r.buyer.name}${pe} → ${r.composite} (${r.tier}) | Svc:${r.svc} Geo:${r.geo} Bonus:${r.bonus} Gate:${r.gate} | ${r.signals.join(', ')}`,
        );
      });
    });
  });

  it('prints full scoring report', () => {
    console.log(
      '\n\n' +
        '═'.repeat(80) +
        '\n' +
        '5 NICHE COMPANIES × 5 BUYERS — HARD CATEGORY SCORING REPORT\n' +
        '═'.repeat(80) +
        '\n' +
        allResults.join('\n') +
        '\n' +
        '═'.repeat(80) +
        '\n',
    );
    expect(true).toBe(true);
  });
});
