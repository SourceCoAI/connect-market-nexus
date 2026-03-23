/**
 * 5 Niche Companies × 5 Buyers Each — ROUND 2: Harder Categories
 *
 * Fire protection, elevator/escalator services, title & settlement,
 * veterinary emergency/specialty, and industrial laundry/linen.
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
  // Round 2: harder categories — override fire protection with expanded synonyms
  'fire safety': ['fire protection', 'fire suppression', 'life safety', 'sprinkler systems'],
  'life safety': ['fire protection', 'fire safety', 'fire suppression', 'sprinkler systems'],
  'sprinkler systems': ['fire protection', 'fire safety', 'fire suppression', 'life safety'],
  elevator: ['elevator services', 'vertical transportation', 'escalator', 'conveyance'],
  'elevator services': ['elevator', 'vertical transportation', 'escalator', 'conveyance'],
  'vertical transportation': ['elevator', 'elevator services', 'escalator', 'conveyance'],
  'title insurance': ['title services', 'settlement services', 'closing services', 'escrow'],
  'settlement services': ['title insurance', 'title services', 'closing services', 'escrow'],
  'title services': ['title insurance', 'settlement services', 'closing services', 'escrow'],
  'veterinary specialty': [
    'veterinary',
    'animal health',
    'emergency veterinary',
    'veterinary services',
    'animal hospital',
  ],
  'emergency veterinary': [
    'veterinary specialty',
    'veterinary',
    'animal health',
    'veterinary services',
  ],
  'industrial laundry': [
    'linen services',
    'uniform services',
    'commercial laundry',
    'textile services',
  ],
  'linen services': [
    'industrial laundry',
    'uniform services',
    'commercial laundry',
    'textile services',
  ],
  'uniform services': [
    'industrial laundry',
    'linen services',
    'commercial laundry',
    'textile services',
  ],
  'commercial laundry': [
    'industrial laundry',
    'linen services',
    'uniform services',
    'textile services',
  ],
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
  peFirm: string;
  services: string[];
  industries: string[];
  geos: string[];
  hqState: string;
  ebitdaMin: number | null;
  ebitdaMax: number | null;
  hasFee: boolean;
  appetite: string | null;
  acquisitions: number | null;
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

// ── 5 HARDER NICHE COMPANIES × 5 PE BUYERS EACH ──

const scenarios: { deal: Deal; buyers: Buyer[] }[] = [
  // 1. Fire protection / sprinkler company in Georgia
  {
    deal: {
      name: 'Peachtree Fire Protection',
      categories: ['fire protection', 'life safety'],
      industry: 'Fire Protection Services',
      state: 'GA',
      geoStates: ['GA', 'SC', 'AL'],
      ebitda: 2_500_000,
    },
    buyers: [
      {
        name: 'APi Group (Verifire)',
        peFirm: 'Blackstone',
        services: ['fire protection', 'life safety', 'sprinkler systems'],
        industries: ['fire safety'],
        geos: ['national'],
        hqState: 'MN',
        ebitdaMin: 2_000_000,
        ebitdaMax: 20_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 45,
      },
      {
        name: 'Pye-Barker Fire & Safety',
        peFirm: 'Leonard Green & Partners',
        services: ['fire suppression', 'fire safety', 'sprinkler systems'],
        industries: ['life safety'],
        geos: ['GA', 'FL', 'NC', 'SC'],
        hqState: 'GA',
        ebitdaMin: 500_000,
        ebitdaMax: 10_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 180,
      },
      {
        name: 'Koorsen Fire & Security',
        peFirm: 'Audax Private Equity',
        services: ['fire protection', 'fire suppression'],
        industries: ['fire safety'],
        geos: ['southeast'],
        hqState: 'IN',
        ebitdaMin: 1_000_000,
        ebitdaMax: 8_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 30,
      },
      {
        name: 'Summit Fire & Security',
        peFirm: 'SPC Partners',
        services: ['fire protection', 'life safety'],
        industries: [],
        geos: ['national'],
        hqState: 'TX',
        ebitdaMin: 1_000_000,
        ebitdaMax: 12_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 20,
      },
      {
        name: 'Peach State Dental Group',
        peFirm: 'Dental Corp Partners',
        services: ['dental'],
        industries: ['dental services'],
        geos: ['GA', 'SC'],
        hqState: 'GA',
        ebitdaMin: 500_000,
        ebitdaMax: 3_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 12,
      },
    ],
  },

  // 2. Elevator / escalator maintenance company in Illinois
  {
    deal: {
      name: 'Midwest Elevator Corp',
      categories: ['elevator', 'elevator services'],
      industry: 'Vertical Transportation',
      state: 'IL',
      geoStates: ['IL', 'IN', 'WI'],
      ebitda: 3_200_000,
    },
    buyers: [
      {
        name: 'Clarity Elevator',
        peFirm: 'CenterOak Partners',
        services: ['elevator services', 'elevator', 'conveyance'],
        industries: ['vertical transportation'],
        geos: ['midwest'],
        hqState: 'OH',
        ebitdaMin: 1_000_000,
        ebitdaMax: 10_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 22,
      },
      {
        name: 'Champion Elevator',
        peFirm: 'Prospect Capital',
        services: ['elevator', 'escalator'],
        industries: ['elevator services'],
        geos: ['national'],
        hqState: 'NY',
        ebitdaMin: 500_000,
        ebitdaMax: 8_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 15,
      },
      {
        name: 'Liberty Elevator',
        peFirm: 'Graham Partners',
        services: ['vertical transportation', 'elevator services'],
        industries: [],
        geos: ['northeast', 'midwest'],
        hqState: 'NJ',
        ebitdaMin: 1_000_000,
        ebitdaMax: 6_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 8,
      },
      {
        name: 'National Elevator Cab & Door',
        peFirm: 'Trivest Partners',
        services: ['elevator'],
        industries: ['vertical transportation'],
        geos: ['national'],
        hqState: 'PA',
        ebitdaMin: 2_000_000,
        ebitdaMax: 15_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 5,
      },
      {
        name: 'Heartland HVAC Holdings',
        peFirm: 'WindPoint Partners',
        services: ['hvac', 'heating and cooling'],
        industries: ['hvac services'],
        geos: ['IL', 'IN', 'WI'],
        hqState: 'IL',
        ebitdaMin: 1_000_000,
        ebitdaMax: 8_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 14,
      },
    ],
  },

  // 3. Title insurance / settlement company in Virginia
  {
    deal: {
      name: 'Old Dominion Title & Escrow',
      categories: ['title insurance', 'settlement services'],
      industry: 'Title Services',
      state: 'VA',
      geoStates: ['VA', 'MD', 'DC'],
      ebitda: 1_900_000,
    },
    buyers: [
      {
        name: 'States Title (Doma)',
        peFirm: 'Lennar / Fifth Wall',
        services: ['title insurance', 'closing services', 'escrow'],
        industries: ['title services'],
        geos: ['national'],
        hqState: 'CA',
        ebitdaMin: 1_000_000,
        ebitdaMax: 15_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 12,
      },
      {
        name: 'WFG National Title',
        peFirm: 'Williston Financial Group',
        services: ['title services', 'settlement services'],
        industries: ['title insurance'],
        geos: ['VA', 'MD', 'DC', 'PA'],
        hqState: 'OR',
        ebitdaMin: 500_000,
        ebitdaMax: 8_000_000,
        hasFee: true,
        appetite: null,
        acquisitions: 20,
      },
      {
        name: 'Westcor Land Title',
        peFirm: 'Thomas H. Lee Partners',
        services: ['title insurance', 'escrow'],
        industries: ['settlement services'],
        geos: ['national'],
        hqState: 'FL',
        ebitdaMin: 1_000_000,
        ebitdaMax: 10_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 8,
      },
      {
        name: 'Rynoh Technologies',
        peFirm: 'Insight Partners',
        services: ['closing services', 'settlement services'],
        industries: [],
        geos: ['southeast'],
        hqState: 'FL',
        ebitdaMin: 500_000,
        ebitdaMax: 5_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 3,
      },
      {
        name: 'Patriot National Insurance',
        peFirm: 'Warburg Pincus',
        services: ['insurance brokerage', 'risk management'],
        industries: ['insurance'],
        geos: ['VA', 'MD', 'DC'],
        hqState: 'VA',
        ebitdaMin: 1_000_000,
        ebitdaMax: 12_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 15,
      },
    ],
  },

  // 4. Veterinary emergency / specialty hospital in Colorado
  {
    deal: {
      name: 'Front Range Veterinary Emergency',
      categories: ['veterinary specialty', 'emergency veterinary'],
      industry: 'Veterinary Services',
      state: 'CO',
      geoStates: ['CO', 'UT', 'NM'],
      ebitda: 4_500_000,
    },
    buyers: [
      {
        name: 'NVA (National Veterinary Associates)',
        peFirm: 'JAB Holding / Caring Brands',
        services: ['veterinary', 'animal health', 'veterinary specialty'],
        industries: ['veterinary services'],
        geos: ['national'],
        hqState: 'CA',
        ebitdaMin: 500_000,
        ebitdaMax: 20_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 400,
      },
      {
        name: 'VetCor (Veterinary Practice Partners)',
        peFirm: 'Morgan Stanley Capital Partners',
        services: ['veterinary services', 'animal hospital'],
        industries: ['veterinary'],
        geos: ['national'],
        hqState: 'CT',
        ebitdaMin: 500_000,
        ebitdaMax: 10_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 85,
      },
      {
        name: 'Pathway Vet Alliance',
        peFirm: 'TSG Consumer Partners',
        services: ['emergency veterinary', 'veterinary specialty'],
        industries: ['animal health'],
        geos: ['CO', 'AZ', 'TX'],
        hqState: 'TX',
        ebitdaMin: 1_000_000,
        ebitdaMax: 15_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 65,
      },
      {
        name: 'BluePearl Specialty + Emergency',
        peFirm: 'Mars Veterinary Health',
        services: ['emergency veterinary', 'veterinary specialty', 'animal hospital'],
        industries: ['veterinary services'],
        geos: ['national'],
        hqState: 'FL',
        ebitdaMin: 2_000_000,
        ebitdaMax: 25_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 100,
      },
      {
        name: 'Rocky Mountain Dental Group',
        peFirm: 'Alpine Investors',
        services: ['dental'],
        industries: ['dental services'],
        geos: ['CO', 'UT'],
        hqState: 'CO',
        ebitdaMin: 500_000,
        ebitdaMax: 5_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 10,
      },
    ],
  },

  // 5. Industrial laundry / linen services company in Ohio
  {
    deal: {
      name: 'Buckeye Linen & Uniform',
      categories: ['industrial laundry', 'linen services'],
      industry: 'Textile Services',
      state: 'OH',
      geoStates: ['OH', 'PA', 'WV'],
      ebitda: 2_100_000,
    },
    buyers: [
      {
        name: 'ImageFIRST',
        peFirm: 'Calera Capital',
        services: ['linen services', 'uniform services', 'commercial laundry'],
        industries: ['textile services'],
        geos: ['national'],
        hqState: 'PA',
        ebitdaMin: 1_000_000,
        ebitdaMax: 12_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 30,
      },
      {
        name: 'Alsco Uniforms',
        peFirm: 'Steiner Corporation (Family PE)',
        services: ['uniform services', 'industrial laundry'],
        industries: ['linen services'],
        geos: ['national'],
        hqState: 'UT',
        ebitdaMin: 2_000_000,
        ebitdaMax: 20_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 15,
      },
      {
        name: 'Roscoe Company',
        peFirm: 'Kinderhook Industries',
        services: ['commercial laundry', 'textile services'],
        industries: ['industrial laundry'],
        geos: ['OH', 'PA', 'IN', 'MI'],
        hqState: 'IL',
        ebitdaMin: 500_000,
        ebitdaMax: 6_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 10,
      },
      {
        name: 'Clean Venture',
        peFirm: 'Sentinel Capital Partners',
        services: ['linen services', 'textile services'],
        industries: [],
        geos: ['midwest'],
        hqState: 'OH',
        ebitdaMin: 1_000_000,
        ebitdaMax: 8_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 4,
      },
      {
        name: 'Buckeye Waste Solutions',
        peFirm: 'Stonepeak Partners',
        services: ['waste management', 'hauling'],
        industries: ['waste services'],
        geos: ['OH', 'PA', 'WV'],
        hqState: 'OH',
        ebitdaMin: 1_000_000,
        ebitdaMax: 10_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 8,
      },
    ],
  },
];

// ── RUN ALL SCENARIOS ──

describe('5 Niche Companies × 5 Buyers — ROUND 2: Harder Categories', () => {
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
        allResults.push(
          `  #${rank + 1} ${r.buyer.name} [PE: ${r.buyer.peFirm}] → ${r.composite} (${r.tier}) | Svc:${r.svc} Geo:${r.geo} Bonus:${r.bonus} Gate:${r.gate} | ${r.signals.join(', ')}`,
        );
      });
    });
  });

  it('prints full scoring report', () => {
    console.log(
      '\n\n' +
        '═'.repeat(85) +
        '\n' +
        'ROUND 2: 5 HARDER NICHE COMPANIES × 5 PE BUYERS — SCORING REPORT\n' +
        '═'.repeat(85) +
        '\n' +
        allResults.join('\n') +
        '\n' +
        '═'.repeat(85) +
        '\n',
    );
    expect(true).toBe(true);
  });
});
