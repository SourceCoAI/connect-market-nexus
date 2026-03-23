/**
 * Real-World Scoring: Saks Metering & Essential Benefit Administrators
 *
 * Deal data sourced from company websites.
 * Buyer data sourced from real PE-backed acquirers in each vertical.
 * All PE-backed buyers only.
 */
import { describe, it, expect } from 'vitest';

// ── Inline copies of scoring functions (same as production synonyms.ts) ──

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
  dental: ['dental services', 'dental practice', 'orthodontics', 'oral health'],
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
  insurance: ['insurance services', 'insurance brokerage', 'risk management'],
  healthcare: ['health services', 'medical services', 'patient care'],
  'employee benefits': ['benefits administration', 'benefits advisory', 'group benefits', 'tpa'],
  'benefits advisory': ['employee benefits', 'benefits administration', 'group benefits', 'tpa'],
  tpa: [
    'third party administrator',
    'benefits administration',
    'employee benefits',
    'self-funded plans',
  ],
  'third party administrator': ['tpa', 'benefits administration', 'employee benefits'],
  'self-funded plans': ['tpa', 'third party administrator', 'benefits administration'],
  'water meter': ['metering', 'amr', 'ami', 'smart meter', 'meter installation'],
  'field services': ['utility services', 'utility', 'infrastructure services'],
  'gas inspection': ['utility services', 'field services', 'leak detection'],
  'utility locate': ['field services', 'damage prevention', 'underground utility'],
  'smart grid': ['ami', 'smart meter', 'meter installation', 'demand response'],
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

// ══════════════════════════════════════════════════════════════════════════════
// REAL COMPANIES × REAL PE BUYERS
// ══════════════════════════════════════════════════════════════════════════════

const scenarios: { deal: Deal; buyers: Buyer[] }[] = [
  // ── 1. SAKS METERING ──
  // Source: saksmetering.com
  // HQ: Maspeth, Queens, NY 11378
  // Services: Smart meter installation, AMR/AMI, fire hydrant services,
  //   large meter & confined space installation, meter downsizing,
  //   curb valve exercising, electric & gas smart meters
  // Clients: Municipalities, water districts, metro transit, sporting venues
  // Geography: Northeast US (primarily NY metro, NJ, CT tri-state)
  {
    deal: {
      name: 'Saks Metering',
      categories: ['metering', 'water meter', 'utility services', 'smart grid'],
      industry: 'Utility Metering & Field Services',
      state: 'NY',
      geoStates: ['NY', 'NJ', 'CT'],
      ebitda: null, // private company, EBITDA unknown
    },
    buyers: [
      // #1 — Sparus Holdings (Ridgemont Equity)
      // Real PE platform: $162.8M rev, 7+ acquisitions including Allegiant
      // & TruCheck (meter/smart grid services), OneVision (utility locate)
      // HQ: Peachtree Corners, GA. National utility field services.
      {
        name: 'Sparus Holdings',
        peFirm: 'Ridgemont Equity Partners',
        services: [
          'metering',
          'smart grid',
          'meter installation',
          'utility locate',
          'gas inspection',
          'field services',
        ],
        industries: ['utility services'],
        geos: ['national'],
        hqState: 'GA',
        ebitdaMin: 1_000_000,
        ebitdaMax: 15_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 7,
      },

      // #2 — United Utility Services (now Sandbrook Capital, ex-Bernhard Capital)
      // Built via W.A. Chester + BHI Power Delivery + bolt-ons
      // Power transmission, distribution, substation. National.
      {
        name: 'United Utility Services',
        peFirm: 'Sandbrook Capital (ex-Bernhard)',
        services: ['utility', 'field services', 'infrastructure'],
        industries: ['utility services', 'infrastructure services'],
        geos: ['national'],
        hqState: 'LA',
        ebitdaMin: 3_000_000,
        ebitdaMax: 30_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 5,
      },

      // #3 — Core & Main
      // CD&R-backed, NYSE: CNM. $7B+ revenue.
      // Water/wastewater infrastructure, AMR/AMI metering solutions.
      // National. Way above Saks in size but exact service overlap.
      {
        name: 'Core & Main',
        peFirm: 'Clayton Dubilier & Rice',
        services: ['water meter', 'amr', 'ami', 'municipal services'],
        industries: ['utility', 'infrastructure services'],
        geos: ['national'],
        hqState: 'MO',
        ebitdaMin: 10_000_000,
        ebitdaMax: 100_000_000,
        hasFee: false,
        appetite: null,
        acquisitions: 30,
      },

      // #4 — HydroPro Solutions
      // PE-backed AMI/AMR meter installation in TX and CA
      // Regional, smaller, direct competitor in meter installation
      {
        name: 'HydroPro Solutions',
        peFirm: 'XPV Water Partners',
        services: ['ami', 'amr', 'water meter', 'meter installation'],
        industries: ['utility services'],
        geos: ['TX', 'CA'],
        hqState: 'TX',
        ebitdaMin: 500_000,
        ebitdaMax: 5_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 3,
      },

      // #5 — WRONG-INDUSTRY CONTROL: Pye-Barker Fire & Safety
      // Leonard Green-backed fire protection platform, 180+ acquisitions
      // Same geography (northeast) but fire safety, not metering
      {
        name: 'Pye-Barker Fire & Safety',
        peFirm: 'Leonard Green & Partners',
        services: ['fire protection', 'fire safety', 'sprinkler systems'],
        industries: ['life safety'],
        geos: ['NY', 'NJ', 'CT', 'PA'],
        hqState: 'GA',
        ebitdaMin: 500_000,
        ebitdaMax: 10_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 180,
      },
    ],
  },

  // ── 2. ESSENTIAL BENEFIT ADMINISTRATORS ──
  // Source: essentialbenefitplans.com, BBB, LinkedIn
  // HQ: 19800 MacArthur Blvd Ste 300, Irvine, CA 92612
  // Owner: Ryan Brown (President)
  // Employees: 100-200
  // Services: Third Party Administrator (TPA), MEC plans, MEC Plus,
  //   MEC Premium Plus, Major Medical MVP, ICHRA, QSEHRA,
  //   dental/vision, telemedicine, FSA, HSA, Rx discounts,
  //   ACA compliance, 1094-C/1095-C filing
  // Network: First Health (all 50 states)
  // Focus: Multi-location employers with part-time/variable-hour employees
  {
    deal: {
      name: 'Essential Benefit Administrators',
      categories: ['tpa', 'employee benefits', 'benefits administration', 'self-funded plans'],
      industry: 'Third Party Administrator',
      state: 'CA',
      geoStates: ['CA'], // HQ in Irvine, CA; serves nationally via First Health
      ebitda: null, // private company, EBITDA unknown
    },
    buyers: [
      // #1 — OneDigital Health and Benefits
      // Stone Point Capital / CPP Investments. $7B+ valuation.
      // 193 acquisitions. National employee benefits, HR, retirement.
      {
        name: 'OneDigital Health and Benefits',
        peFirm: 'Stone Point Capital / CPP Investments',
        services: ['employee benefits', 'benefits administration', 'tpa'],
        industries: ['insurance services', 'employee benefits'],
        geos: ['national'],
        hqState: 'GA',
        ebitdaMin: 500_000,
        ebitdaMax: 15_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 193,
      },

      // #2 — Alera Group
      // Genstar Capital → now Ares/Flexpoint/Carlyle. $1.5B+ revenue.
      // 166 acquisitions. Employee benefits, P&C, wealth management.
      {
        name: 'Alera Group',
        peFirm: 'Genstar Capital / Ares Management',
        services: ['employee benefits', 'benefits advisory', 'group benefits'],
        industries: ['insurance services', 'benefits administration'],
        geos: ['national'],
        hqState: 'IL',
        ebitdaMin: 500_000,
        ebitdaMax: 10_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 166,
      },

      // #3 — Relation Insurance Services
      // BayPine (ex-Aquiline Capital). 100+ acquisitions.
      // Employee benefits, TPA consulting, P&C. 90+ locations.
      {
        name: 'Relation Insurance Services',
        peFirm: 'BayPine (ex-Aquiline Capital)',
        services: ['employee benefits', 'tpa', 'benefits administration'],
        industries: ['insurance services'],
        geos: ['national'],
        hqState: 'CA',
        ebitdaMin: 500_000,
        ebitdaMax: 8_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 100,
      },

      // #4 — Acrisure
      // BRG / Gallatin Point. 300+ acquisitions. Insurance brokerage.
      // They do insurance brokerage, NOT TPA/benefits admin directly.
      // Adjacent but not exact match — tests partial overlap.
      {
        name: 'Acrisure',
        peFirm: 'BRG / Gallatin Point',
        services: ['insurance brokerage', 'risk management'],
        industries: ['insurance'],
        geos: ['national'],
        hqState: 'MI',
        ebitdaMin: 1_000_000,
        ebitdaMax: 25_000_000,
        hasFee: false,
        appetite: 'aggressive',
        acquisitions: 300,
      },

      // #5 — WRONG-INDUSTRY CONTROL: NVA (National Veterinary Associates)
      // JAB Holding. 400 acquisitions. Veterinary, not benefits.
      // National, aggressive, but completely wrong vertical.
      {
        name: 'NVA (National Veterinary Associates)',
        peFirm: 'JAB Holding / Caring Brands',
        services: ['veterinary', 'animal health', 'animal hospital'],
        industries: ['veterinary services'],
        geos: ['national'],
        hqState: 'CA',
        ebitdaMin: 500_000,
        ebitdaMax: 20_000_000,
        hasFee: true,
        appetite: 'aggressive',
        acquisitions: 400,
      },
    ],
  },
];

// ── RUN SCENARIOS ──

describe('Real-World Scoring: Saks Metering & Essential Benefit Administrators', () => {
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
        });
      });

      const header = `\n━━━ ${idx + 1}. ${scenario.deal.name} (${scenario.deal.industry}, ${scenario.deal.state}) ━━━`;
      allResults.push(header);
      results.forEach((r, rank) => {
        allResults.push(
          `  #${rank + 1} ${r.buyer.name} [PE: ${r.buyer.peFirm}] → ${r.composite} (${r.tier})` +
            `\n       Svc:${r.svc} Geo:${r.geo} Bonus:${r.bonus} Gate:${r.gate}` +
            `\n       ${r.signals.join(', ')}`,
        );
      });
    });
  });

  it('prints full scoring report', () => {
    console.log(
      '\n\n' +
        '═'.repeat(85) +
        '\n' +
        'REAL-WORLD SCORING: SAKS METERING & ESSENTIAL BENEFIT ADMINISTRATORS\n' +
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
