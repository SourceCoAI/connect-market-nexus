// ── Sector synonyms & geographic region maps ──
// Used by the scoring pipeline for semantic term matching and geographic
// proximity scoring.

// ---------------------------------------------------------------------------
// SECTOR_SYNONYMS
// ---------------------------------------------------------------------------
// Maps each sector term to closely-related terms for matching.
// IMPORTANT: Avoid generic bridge terms (e.g. "healthcare", "building services",
// "facility services") as synonyms of specific verticals -- they cause false
// exact-match scores between unrelated industries (e.g. dental <-> veterinary
// through "healthcare"). Only map to genuinely interchangeable or directly
// overlapping terms.

export const SECTOR_SYNONYMS: Record<string, string[]> = {
  // Utilities / Infrastructure
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
  'water meter': ['metering', 'amr', 'ami', 'smart meter', 'meter installation'],
  'smart grid': ['ami', 'smart meter', 'meter installation', 'demand response'],
  'field services': ['utility services', 'utility', 'infrastructure services'],
  infrastructure: ['utility', 'field services', 'municipal', 'outsourced services'],
  // Home Services -- each maps to "home services" as their shared parent but NOT
  // to each other's specific terms (hvac != plumbing, plumbing != roofing)
  'home services': ['residential services', 'home repair'],
  hvac: ['hvac services', 'climate control', 'heating and cooling', 'air conditioning'],
  plumbing: ['plumbing services', 'plumbing contractor', 'pipe services'],
  roofing: ['roofing services', 'exterior services'],
  collision: ['auto body', 'paint and body', 'auto repair'],
  // Healthcare -- each sub-vertical maps to its own close synonyms, NOT the
  // generic "healthcare" umbrella (prevents dental <-> veterinary false matches)
  healthcare: ['health services', 'medical services', 'patient care'],
  dental: ['dental services', 'dental practice', 'orthodontics', 'oral health'],
  'behavioral health': ['mental health', 'therapy', 'counseling', 'psychiatric services'],
  veterinary: ['animal health', 'pet care', 'veterinary services', 'animal hospital'],
  // Staffing / Professional Services
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
  // Construction / Trades -- each maps to close synonyms, not generic "building services"
  electrical: ['electrical services', 'electrical contracting', 'power systems'],
  construction: ['general contracting', 'specialty contracting', 'trades'],
  'fire protection': ['fire safety', 'fire suppression', 'life safety', 'sprinkler systems'],
  restoration: ['remediation', 'disaster recovery', 'reconstruction', 'water damage'],
  // Facility / Building Services
  janitorial: ['commercial cleaning', 'custodial', 'cleaning services'],
  'commercial cleaning': ['janitorial', 'custodial', 'cleaning services'],
  'facility services': ['building services', 'property services', 'facilities management'],
  'building services': ['facility services', 'property management', 'building maintenance'],
  // Technology / IT
  'it services': ['managed services', 'msp', 'technology services', 'it support'],
  cybersecurity: ['information security', 'managed security', 'infosec', 'network security'],
  software: ['saas', 'technology', 'tech-enabled services'],
  telecom: ['telecommunications', 'communications', 'wireless', 'connectivity'],
  // Industrial / Manufacturing
  manufacturing: ['production', 'fabrication', 'industrial', 'precision manufacturing'],
  distribution: ['wholesale', 'supply chain', 'industrial distribution'],
  logistics: ['transportation', 'freight', '3pl', 'warehousing'],
  // Other Services
  landscaping: ['grounds maintenance', 'outdoor services', 'lawn care', 'landscape services'],
  'pest control': ['extermination', 'pest management', 'termite control'],
  'waste management': ['waste services', 'recycling', 'hauling', 'waste collection'],
  'environmental services': ['remediation', 'environmental consulting', 'environmental compliance'],
  insurance: ['insurance services', 'insurance brokerage', 'risk management'],
  // Employee Benefits / TPA -- distinct from insurance brokerage
  'employee benefits': ['benefits administration', 'benefits advisory', 'group benefits', 'tpa'],
  'benefits administration': ['employee benefits', 'benefits advisory', 'tpa', 'group benefits'],
  'benefits advisory': ['employee benefits', 'benefits administration', 'group benefits', 'tpa'],
  tpa: [
    'third party administrator',
    'benefits administration',
    'employee benefits',
    'self-funded plans',
  ],
  'third party administrator': ['tpa', 'benefits administration', 'employee benefits'],
  'self-funded plans': ['tpa', 'third party administrator', 'benefits administration'],
  'food services': ['food distribution', 'catering', 'food manufacturing'],
  automotive: ['auto services', 'auto repair', 'collision', 'vehicle services'],
  education: ['training', 'learning', 'ed tech', 'tutoring', 'educational services'],
};

// ---------------------------------------------------------------------------
// SECTOR_FAMILIES  --  groups related sectors under a parent category
// ---------------------------------------------------------------------------
// Used for "same-family" scoring (80 points) — services that share a parent
// category are closer than adjacent (60) but not identical (100).
// Example: "commercial HVAC" and "residential HVAC" are same-family (both HVAC);
//          "plumbing" and "HVAC" are adjacent (both home services, different trades).

export const SECTOR_FAMILIES: Record<string, string[]> = {
  home_services: ['hvac', 'plumbing', 'roofing', 'electrical', 'restoration', 'home services', 'residential services', 'home repair'],
  healthcare: ['dental', 'behavioral health', 'veterinary', 'home health', 'healthcare', 'health services', 'medical services', 'patient care'],
  business_services: ['staffing', 'recruiting', 'consulting', 'accounting', 'professional services'],
  facility_services: ['janitorial', 'commercial cleaning', 'pest control', 'landscaping', 'facility services', 'building services'],
  infrastructure: ['utility', 'metering', 'field services', 'smart grid', 'infrastructure', 'utility services', 'municipal services'],
  industrial: ['manufacturing', 'distribution', 'logistics'],
  technology: ['it services', 'cybersecurity', 'software', 'telecom'],
  construction: ['electrical', 'construction', 'fire protection', 'general contracting', 'specialty contracting'],
  environmental: ['waste management', 'environmental services', 'remediation'],
  insurance_benefits: ['insurance', 'employee benefits', 'benefits administration', 'benefits advisory', 'tpa', 'third party administrator'],
  automotive: ['automotive', 'collision', 'auto body', 'auto repair'],
};

/** Reverse lookup: term -> family name */
const _termToFamily = new Map<string, string>();
for (const [family, terms] of Object.entries(SECTOR_FAMILIES)) {
  for (const term of terms) {
    // If a term appears in multiple families, keep the first one
    if (!_termToFamily.has(term)) {
      _termToFamily.set(term, family);
    }
  }
}

/** Check if two terms share the same sector family. */
export function areSameFamily(termA: string, termB: string): boolean {
  const familyA = _termToFamily.get(termA.toLowerCase());
  const familyB = _termToFamily.get(termB.toLowerCase());
  return !!familyA && familyA === familyB;
}

// ---------------------------------------------------------------------------
// STATE_REGIONS  --  US state abbreviation -> broad census region
// ---------------------------------------------------------------------------

export const STATE_REGIONS: Record<string, string> = {
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

// ---------------------------------------------------------------------------
// expandTerms  --  expand an array of terms through the synonym map
// ---------------------------------------------------------------------------

/**
 * Takes raw terms and returns a de-duplicated array that also includes all
 * synonyms reachable from the SECTOR_SYNONYMS map (one level deep).
 */
export function expandTerms(terms: string[]): string[] {
  const expanded = new Set(terms.map((t) => t.toLowerCase()));
  for (const t of terms) {
    const synonyms = SECTOR_SYNONYMS[t.toLowerCase()] || [];
    for (const s of synonyms) expanded.add(s.toLowerCase());
  }
  return [...expanded];
}
