/**
 * CTO Audit: 10 Random Companies × 5 Buyers Each
 *
 * Simulates real-world deals with 5 potential buyers per deal,
 * scoring each buyer through the full pipeline and reporting results.
 */
import { describe, it, expect } from 'vitest';

// ── Inline copies of scoring functions (same as scorers.test.ts) ──

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

// ── 10 COMPANIES × 5 BUYERS EACH ──

const scenarios: { deal: Deal; buyers: Buyer[] }[] = [
  // 1. HVAC company in Houston, TX
  {
    deal: {
      name: 'Southwest Comfort Systems',
      categories: ['hvac'],
      industry: 'HVAC',
      state: 'TX',
      geoStates: ['TX', 'OK', 'LA'],
      ebitda: 3_500_000,
    },
    buyers: [
      {
        name: 'Apex Climate Solutions',
        peFirm: 'Alpine Investors',
        services: ['hvac', 'heating and cooling'],
        industries: [],
        geos: ['TX', 'OK'],
        hqState: 'TX',
        ebitdaMin: 2_000_000,
        ebitdaMax: 10_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 12,
        isPeBacked: true,
      },
      {
        name: 'National Plumbing Group',
        peFirm: 'Audax Private Equity',
        services: ['plumbing'],
        industries: [],
        geos: ['national'],
        hqState: 'OH',
        ebitdaMin: 1_000_000,
        ebitdaMax: 8_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 6,
        isPeBacked: true,
      },
      {
        name: 'TechCool Innovations',
        peFirm: null,
        services: ['software', 'saas'],
        industries: ['technology'],
        geos: ['CA'],
        hqState: 'CA',
        ebitdaMin: 5_000_000,
        ebitdaMax: 50_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 0,
        isPeBacked: false,
      },
      {
        name: 'Gulf Coast Mechanical',
        peFirm: 'Wynnchurch Capital',
        services: ['hvac', 'plumbing', 'electrical'],
        industries: ['home services'],
        geos: ['TX', 'LA', 'MS'],
        hqState: 'TX',
        ebitdaMin: 1_000_000,
        ebitdaMax: 5_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 4,
        isPeBacked: true,
      },
      {
        name: 'Denver Air Systems',
        peFirm: 'Riata Capital',
        services: ['air conditioning', 'climate control'],
        industries: ['hvac'],
        geos: ['CO', 'UT', 'WY'],
        hqState: 'CO',
        ebitdaMin: 1_500_000,
        ebitdaMax: 7_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 3,
        isPeBacked: true,
      },
    ],
  },
  // 2. Dental practice group in Florida
  {
    deal: {
      name: 'Sunshine Dental Partners',
      categories: ['dental'],
      industry: 'Dental',
      state: 'FL',
      geoStates: ['FL', 'GA'],
      ebitda: 2_000_000,
    },
    buyers: [
      {
        name: 'Smile Brands Inc.',
        peFirm: 'Gryphon Investors',
        services: ['dental services', 'orthodontics'],
        industries: ['dental'],
        geos: ['FL', 'GA', 'SC'],
        hqState: 'FL',
        ebitdaMin: 500_000,
        ebitdaMax: 5_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 20,
        isPeBacked: true,
      },
      {
        name: 'PetVet Care Centers',
        peFirm: 'KKR',
        services: ['veterinary'],
        industries: ['animal health'],
        geos: ['national'],
        hqState: 'CT',
        ebitdaMin: 1_000_000,
        ebitdaMax: 10_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 50,
        isPeBacked: true,
      },
      {
        name: 'ClearChoice Dental',
        peFirm: 'Thomas H. Lee Partners',
        services: ['dental practice'],
        industries: ['dental services'],
        geos: ['national'],
        hqState: 'CO',
        ebitdaMin: 2_000_000,
        ebitdaMax: 15_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 8,
        isPeBacked: true,
      },
      {
        name: 'Southeast Physical Therapy',
        peFirm: 'Shore Capital',
        services: ['physical therapy'],
        industries: ['healthcare'],
        geos: ['FL', 'GA'],
        hqState: 'FL',
        ebitdaMin: 500_000,
        ebitdaMax: 3_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 5,
        isPeBacked: true,
      },
      {
        name: 'Aspen Dental',
        peFirm: 'Leonard Green',
        services: ['dental'],
        industries: ['oral health'],
        geos: ['national'],
        hqState: 'NY',
        ebitdaMin: 1_000_000,
        ebitdaMax: 20_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 100,
        isPeBacked: true,
      },
    ],
  },
  // 3. Commercial cleaning company in Chicago
  {
    deal: {
      name: 'Windy City Cleaning Co.',
      categories: ['commercial cleaning', 'janitorial'],
      industry: 'Commercial Cleaning',
      state: 'IL',
      geoStates: ['IL', 'IN', 'WI'],
      ebitda: 1_500_000,
    },
    buyers: [
      {
        name: 'ABM Industries',
        peFirm: null,
        services: ['janitorial', 'facility services'],
        industries: ['building services'],
        geos: ['national'],
        hqState: 'NY',
        ebitdaMin: 5_000_000,
        ebitdaMax: 50_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 10,
        isPeBacked: false,
      },
      {
        name: 'Marsden Holding',
        peFirm: 'Kelso & Company',
        services: ['commercial cleaning', 'custodial'],
        industries: ['janitorial'],
        geos: ['IL', 'MN', 'WI', 'IN'],
        hqState: 'MN',
        ebitdaMin: 500_000,
        ebitdaMax: 5_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 15,
        isPeBacked: true,
      },
      {
        name: 'Coverall Holdings',
        peFirm: null,
        services: ['commercial cleaning'],
        industries: ['cleaning services'],
        geos: ['national'],
        hqState: 'FL',
        ebitdaMin: 500_000,
        ebitdaMax: 3_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 2,
        isPeBacked: false,
      },
      {
        name: 'ServiceMaster Clean',
        peFirm: 'Roark Capital',
        services: ['restoration', 'cleaning services'],
        industries: ['facility services'],
        geos: ['national'],
        hqState: 'TN',
        ebitdaMin: 1_000_000,
        ebitdaMax: 10_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 5,
        isPeBacked: true,
      },
      {
        name: 'Midwest Landscaping Group',
        peFirm: 'Prospect Partners',
        services: ['landscaping', 'grounds maintenance'],
        industries: [],
        geos: ['IL', 'IN', 'OH'],
        hqState: 'IL',
        ebitdaMin: 500_000,
        ebitdaMax: 3_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 3,
        isPeBacked: true,
      },
    ],
  },
  // 4. Cybersecurity firm in Virginia
  {
    deal: {
      name: 'FedShield Cyber Defense',
      categories: ['cybersecurity'],
      industry: 'Cybersecurity',
      state: 'VA',
      geoStates: ['VA', 'MD', 'DC'],
      ebitda: 5_000_000,
    },
    buyers: [
      {
        name: 'Booz Allen Hamilton',
        peFirm: null,
        services: ['cybersecurity', 'managed security'],
        industries: ['information security'],
        geos: ['national'],
        hqState: 'VA',
        ebitdaMin: 10_000_000,
        ebitdaMax: 100_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 20,
        isPeBacked: false,
      },
      {
        name: 'Telos Corporation',
        peFirm: null,
        services: ['information security', 'network security'],
        industries: ['cybersecurity'],
        geos: ['VA', 'MD', 'DC'],
        hqState: 'VA',
        ebitdaMin: 2_000_000,
        ebitdaMax: 15_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 3,
        isPeBacked: false,
      },
      {
        name: 'DataGuard Solutions',
        peFirm: 'Thoma Bravo',
        services: ['infosec', 'managed security'],
        industries: ['cybersecurity'],
        geos: ['national'],
        hqState: 'TX',
        ebitdaMin: 3_000_000,
        ebitdaMax: 20_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 8,
        isPeBacked: true,
      },
      {
        name: 'CloudSecure Inc.',
        peFirm: 'Vista Equity',
        services: ['it services', 'msp'],
        industries: ['technology services'],
        geos: ['CA', 'WA'],
        hqState: 'CA',
        ebitdaMin: 5_000_000,
        ebitdaMax: 30_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 5,
        isPeBacked: true,
      },
      {
        name: 'Staffing Solutions DC',
        peFirm: null,
        services: ['staffing', 'workforce solutions'],
        industries: ['staffing'],
        geos: ['VA', 'MD', 'DC'],
        hqState: 'VA',
        ebitdaMin: 1_000_000,
        ebitdaMax: 5_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 0,
        isPeBacked: false,
      },
    ],
  },
  // 5. Fire protection company in Georgia
  {
    deal: {
      name: 'Peach State Fire & Safety',
      categories: ['fire protection'],
      industry: 'Fire Protection',
      state: 'GA',
      geoStates: ['GA', 'SC', 'NC'],
      ebitda: 2_500_000,
    },
    buyers: [
      {
        name: 'APi Group (Chubb Fire)',
        peFirm: null,
        services: ['fire safety', 'fire suppression', 'sprinkler systems'],
        industries: ['life safety'],
        geos: ['national'],
        hqState: 'MN',
        ebitdaMin: 5_000_000,
        ebitdaMax: 50_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 30,
        isPeBacked: false,
      },
      {
        name: 'Pye-Barker Fire & Safety',
        peFirm: 'Leonard Green',
        services: ['fire protection', 'life safety'],
        industries: ['fire safety'],
        geos: ['GA', 'FL', 'SC', 'NC', 'AL'],
        hqState: 'GA',
        ebitdaMin: 1_000_000,
        ebitdaMax: 8_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 50,
        isPeBacked: true,
      },
      {
        name: 'Southeast Electrical Services',
        peFirm: 'Compass Group Equity',
        services: ['electrical', 'power systems'],
        industries: ['electrical contracting'],
        geos: ['GA', 'SC'],
        hqState: 'GA',
        ebitdaMin: 1_000_000,
        ebitdaMax: 5_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 3,
        isPeBacked: true,
      },
      {
        name: 'Guardian Life Safety',
        peFirm: 'Warburg Pincus',
        services: ['fire protection', 'fire suppression'],
        industries: ['fire safety'],
        geos: ['southeast'],
        hqState: 'FL',
        ebitdaMin: 2_000_000,
        ebitdaMax: 10_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 7,
        isPeBacked: true,
      },
      {
        name: 'SouthernCare Dental',
        peFirm: 'ABRY Partners',
        services: ['dental'],
        industries: ['dental services'],
        geos: ['GA', 'FL'],
        hqState: 'GA',
        ebitdaMin: 500_000,
        ebitdaMax: 4_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 5,
        isPeBacked: true,
      },
    ],
  },
  // 6. Staffing agency in Ohio
  {
    deal: {
      name: 'Heartland Staffing Solutions',
      categories: ['staffing'],
      industry: 'Staffing',
      state: 'OH',
      geoStates: ['OH', 'MI', 'IN'],
      ebitda: 1_800_000,
    },
    buyers: [
      {
        name: 'TrueBlue Inc.',
        peFirm: null,
        services: ['temporary staffing', 'workforce solutions'],
        industries: ['staffing'],
        geos: ['national'],
        hqState: 'WA',
        ebitdaMin: 3_000_000,
        ebitdaMax: 20_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 15,
        isPeBacked: false,
      },
      {
        name: 'Staffing 360 Solutions',
        peFirm: 'Brightspring',
        services: ['recruiting', 'talent acquisition'],
        industries: ['staffing'],
        geos: ['OH', 'PA', 'MI'],
        hqState: 'OH',
        ebitdaMin: 500_000,
        ebitdaMax: 5_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 8,
        isPeBacked: true,
      },
      {
        name: 'Midwest Accounting Partners',
        peFirm: null,
        services: ['accounting', 'cpa'],
        industries: ['professional services'],
        geos: ['OH', 'IN'],
        hqState: 'OH',
        ebitdaMin: 500_000,
        ebitdaMax: 3_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 2,
        isPeBacked: false,
      },
      {
        name: 'Heidrick & Struggles',
        peFirm: null,
        services: ['executive search', 'recruiting'],
        industries: ['talent acquisition'],
        geos: ['national'],
        hqState: 'IL',
        ebitdaMin: 5_000_000,
        ebitdaMax: 25_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 5,
        isPeBacked: false,
      },
      {
        name: 'Kelly Services',
        peFirm: null,
        services: ['temporary staffing', 'employment services'],
        industries: ['staffing'],
        geos: ['national'],
        hqState: 'MI',
        ebitdaMin: 2_000_000,
        ebitdaMax: 15_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 10,
        isPeBacked: false,
      },
    ],
  },
  // 7. Landscaping company in Arizona
  {
    deal: {
      name: 'Desert Green Landscapes',
      categories: ['landscaping'],
      industry: 'Landscaping',
      state: 'AZ',
      geoStates: ['AZ', 'NV'],
      ebitda: 1_200_000,
    },
    buyers: [
      {
        name: 'BrightView Holdings',
        peFirm: 'KKR',
        services: ['landscaping', 'grounds maintenance'],
        industries: ['outdoor services'],
        geos: ['national'],
        hqState: 'PA',
        ebitdaMin: 2_000_000,
        ebitdaMax: 20_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 25,
        isPeBacked: true,
      },
      {
        name: 'SavATree',
        peFirm: 'Investcorp',
        services: ['lawn care', 'landscape services'],
        industries: ['landscaping'],
        geos: ['AZ', 'CA', 'NV', 'CO'],
        hqState: 'CT',
        ebitdaMin: 500_000,
        ebitdaMax: 5_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 10,
        isPeBacked: true,
      },
      {
        name: 'Southwest Pest Solutions',
        peFirm: null,
        services: ['pest control', 'termite control'],
        industries: ['pest management'],
        geos: ['AZ', 'NV', 'NM'],
        hqState: 'AZ',
        ebitdaMin: 500_000,
        ebitdaMax: 3_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 1,
        isPeBacked: false,
      },
      {
        name: 'Ruppert Landscape',
        peFirm: null,
        services: ['landscape services', 'grounds maintenance'],
        industries: ['landscaping'],
        geos: ['MD', 'VA', 'DC', 'PA'],
        hqState: 'MD',
        ebitdaMin: 1_000_000,
        ebitdaMax: 8_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 5,
        isPeBacked: false,
      },
      {
        name: 'Valley Crest (now BrightView)',
        peFirm: 'MSD Capital',
        services: ['landscaping', 'outdoor services'],
        industries: ['grounds maintenance'],
        geos: ['AZ', 'CA', 'NV'],
        hqState: 'CA',
        ebitdaMin: 500_000,
        ebitdaMax: 5_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 15,
        isPeBacked: true,
      },
    ],
  },
  // 8. Insurance brokerage in New York
  {
    deal: {
      name: 'Empire Risk Advisors',
      categories: ['insurance'],
      industry: 'Insurance',
      state: 'NY',
      geoStates: ['NY', 'NJ', 'CT'],
      ebitda: 4_000_000,
    },
    buyers: [
      {
        name: 'Hub International',
        peFirm: 'Hellman & Friedman',
        services: ['insurance brokerage', 'risk management'],
        industries: ['insurance services'],
        geos: ['national'],
        hqState: 'IL',
        ebitdaMin: 2_000_000,
        ebitdaMax: 30_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 100,
        isPeBacked: true,
      },
      {
        name: 'AssuredPartners',
        peFirm: 'GTCR',
        services: ['insurance services', 'insurance brokerage'],
        industries: ['insurance'],
        geos: ['national'],
        hqState: 'FL',
        ebitdaMin: 1_000_000,
        ebitdaMax: 20_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 200,
        isPeBacked: true,
      },
      {
        name: 'NFP Corp',
        peFirm: 'Madison Dearborn',
        services: ['insurance'],
        industries: ['risk management'],
        geos: ['NY', 'NJ', 'CT', 'PA'],
        hqState: 'NY',
        ebitdaMin: 2_000_000,
        ebitdaMax: 15_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 50,
        isPeBacked: true,
      },
      {
        name: 'Northeast Healthcare Group',
        peFirm: null,
        services: ['healthcare', 'medical services'],
        industries: ['health services'],
        geos: ['NY', 'NJ'],
        hqState: 'NY',
        ebitdaMin: 1_000_000,
        ebitdaMax: 8_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 3,
        isPeBacked: false,
      },
      {
        name: 'Patriot National',
        peFirm: null,
        services: ['insurance services'],
        industries: ['insurance'],
        geos: ['FL', 'GA'],
        hqState: 'FL',
        ebitdaMin: 3_000_000,
        ebitdaMax: 12_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 2,
        isPeBacked: false,
      },
    ],
  },
  // 9. Auto collision repair in California
  {
    deal: {
      name: 'Pacific Auto Body Group',
      categories: ['collision', 'automotive'],
      industry: 'Auto Collision Repair',
      state: 'CA',
      geoStates: ['CA', 'OR', 'WA'],
      ebitda: 3_000_000,
    },
    buyers: [
      {
        name: 'Caliber Collision',
        peFirm: 'Omers Private Equity',
        services: ['collision', 'auto body', 'paint and body'],
        industries: ['automotive'],
        geos: ['national'],
        hqState: 'TX',
        ebitdaMin: 2_000_000,
        ebitdaMax: 20_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 100,
        isPeBacked: true,
      },
      {
        name: 'Service King',
        peFirm: '4KP Partners',
        services: ['auto repair', 'collision'],
        industries: ['auto body'],
        geos: ['CA', 'AZ', 'NV', 'TX'],
        hqState: 'TX',
        ebitdaMin: 1_000_000,
        ebitdaMax: 10_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 50,
        isPeBacked: true,
      },
      {
        name: 'Classic Collision',
        peFirm: 'Hellman & Friedman',
        services: ['auto body', 'paint and body'],
        industries: ['collision'],
        geos: ['CA', 'AZ', 'FL', 'GA'],
        hqState: 'GA',
        ebitdaMin: 1_000_000,
        ebitdaMax: 8_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 30,
        isPeBacked: true,
      },
      {
        name: 'West Coast HVAC Holdings',
        peFirm: 'Pacific Equity',
        services: ['hvac', 'air conditioning'],
        industries: [],
        geos: ['CA', 'OR', 'WA'],
        hqState: 'CA',
        ebitdaMin: 1_000_000,
        ebitdaMax: 5_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 4,
        isPeBacked: true,
      },
      {
        name: 'Maaco',
        peFirm: 'Roark Capital',
        services: ['auto repair', 'paint and body'],
        industries: ['automotive'],
        geos: ['national'],
        hqState: 'NC',
        ebitdaMin: 500_000,
        ebitdaMax: 5_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 5,
        isPeBacked: true,
      },
    ],
  },
  // 10. Waste management company in Texas
  {
    deal: {
      name: 'Lone Star Waste Services',
      categories: ['waste management'],
      industry: 'Waste Management',
      state: 'TX',
      geoStates: ['TX', 'OK', 'AR'],
      ebitda: 6_000_000,
    },
    buyers: [
      {
        name: 'GFL Environmental',
        peFirm: 'BC Partners',
        services: ['waste services', 'recycling', 'hauling'],
        industries: ['waste management'],
        geos: ['national'],
        hqState: 'TX',
        ebitdaMin: 3_000_000,
        ebitdaMax: 30_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 50,
        isPeBacked: true,
      },
      {
        name: 'Waste Connections',
        peFirm: null,
        services: ['waste collection', 'recycling'],
        industries: ['waste services'],
        geos: ['TX', 'OK', 'LA', 'AR'],
        hqState: 'TX',
        ebitdaMin: 2_000_000,
        ebitdaMax: 20_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 30,
        isPeBacked: false,
      },
      {
        name: 'Casella Waste Systems',
        peFirm: null,
        services: ['waste management', 'recycling'],
        industries: ['waste services'],
        geos: ['VT', 'NH', 'ME', 'MA'],
        hqState: 'VT',
        ebitdaMin: 1_000_000,
        ebitdaMax: 10_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 10,
        isPeBacked: false,
      },
      {
        name: 'Texas Environmental Services',
        peFirm: 'EnCap Investments',
        services: ['environmental services', 'remediation'],
        industries: ['environmental consulting'],
        geos: ['TX', 'OK'],
        hqState: 'TX',
        ebitdaMin: 1_000_000,
        ebitdaMax: 8_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 4,
        isPeBacked: true,
      },
      {
        name: 'SouthWaste Industries',
        peFirm: 'Macquarie',
        services: ['waste services', 'hauling'],
        industries: ['waste management'],
        geos: ['TX', 'LA', 'MS', 'AL'],
        hqState: 'TX',
        ebitdaMin: 2_000_000,
        ebitdaMax: 15_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 20,
        isPeBacked: true,
      },
    ],
  },
];

// ── RUN ALL SCENARIOS ──

describe('10 Companies × 5 Buyers: Full Scoring Results', () => {
  const allResults: string[] = [];

  scenarios.forEach((scenario, idx) => {
    describe(`${idx + 1}. ${scenario.deal.name}`, () => {
      const results = scenario.buyers.map((buyer) => ({
        buyer,
        ...scoreBuyer(scenario.deal, buyer),
      }));

      // Sort by composite score descending
      results.sort((a, b) => b.composite - a.composite);

      results.forEach((r, rank) => {
        it(`Rank ${rank + 1}: ${r.buyer.name} → ${r.composite} (${r.tier})`, () => {
          // Basic invariants
          expect(r.composite).toBeGreaterThanOrEqual(0);
          expect(r.composite).toBeLessThanOrEqual(100);
          expect(['MOVE_NOW', 'STRONG', 'SPECULATIVE']).toContain(r.tier);

          // Score breakdown invariants
          expect(r.svc).toBeGreaterThanOrEqual(0);
          expect(r.svc).toBeLessThanOrEqual(100);
          expect(r.geo).toBeGreaterThanOrEqual(0);
          expect(r.geo).toBeLessThanOrEqual(100);
          expect(r.bonus).toBeGreaterThanOrEqual(0);
          expect(r.bonus).toBeLessThanOrEqual(100);
        });
      });

      // Build report line for final summary
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
    // eslint-disable-next-line no-console
    console.log(
      '\n\n' +
        '═'.repeat(80) +
        '\n' +
        'CTO AUDIT: 10 COMPANIES × 5 BUYERS — FULL SCORING REPORT\n' +
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
