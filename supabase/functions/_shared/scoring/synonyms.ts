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
  infrastructure: ['utility', 'field services', 'municipal', 'outsourced services'],
  // Home Services -- each maps to "home services" as their shared parent but NOT
  // to each other's specific terms (hvac != plumbing, plumbing != roofing)
  'home services': ['residential services', 'home repair'],
  hvac: ['mechanical', 'climate control', 'heating and cooling'],
  plumbing: ['plumbing services', 'mechanical services', 'pipe services'],
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
  'environmental services': [
    'remediation',
    'environmental consulting',
    'environmental compliance',
  ],
  insurance: ['insurance services', 'insurance brokerage', 'risk management'],
  'food services': ['food distribution', 'catering', 'food manufacturing'],
  automotive: ['auto services', 'auto repair', 'collision', 'vehicle services'],
  // Fleet / Heavy-Duty Vehicle Services
  'fleet repair': [
    'fleet maintenance',
    'fleet services',
    'heavy duty truck repair',
    'heavy duty repair',
    'truck repair',
    'commercial vehicle repair',
    'commercial vehicle maintenance',
    'diesel repair',
    'trailer repair',
    'heavy equipment repair',
  ],
  'fleet maintenance': [
    'fleet repair',
    'fleet services',
    'heavy duty maintenance',
    'truck maintenance',
    'commercial vehicle maintenance',
    'preventive maintenance',
    'mobile fleet service',
    'heavy equipment maintenance',
  ],
  'fleet services': [
    'fleet repair',
    'fleet maintenance',
    'mobile fleet service',
    'fleet management',
    'commercial fleet',
    'heavy duty service',
  ],
  'truck repair': [
    'heavy duty truck repair',
    'fleet repair',
    'diesel repair',
    'trailer repair',
    'commercial vehicle repair',
    'heavy duty repair',
  ],
  'heavy duty': [
    'heavy duty truck',
    'heavy duty repair',
    'heavy duty service',
    'commercial vehicle',
    'fleet repair',
    'diesel',
    'truck repair',
  ],
  'tank trailer': [
    'tank trailer repair',
    'tank trailer inspection',
    'tanker services',
    'dot inspection',
    'tank testing',
  ],
  'dot inspection': [
    'department of transportation inspection',
    'dot compliance',
    'vehicle inspection',
    'safety inspection',
    'tank trailer inspection',
  ],
  education: ['training', 'learning', 'ed tech', 'tutoring', 'educational services'],
};

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
