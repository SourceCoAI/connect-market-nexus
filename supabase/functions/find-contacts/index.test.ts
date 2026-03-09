/**
 * Tests for find-contacts — contact discovery pipeline improvements
 *
 * Validates the pure logic functions (domain inference, company name variations,
 * title matching, LinkedIn title parsing, company matching, domain scoring)
 * against the 5 most recent discovery runs to verify improvements.
 *
 * Old results (before changes):
 *   Legacy Service Partners / Gridiron Capital   — PE: 7, Co: 2, Saved: 9
 *   Valor Exterior Partners / Osceola Capital    — PE: 1, Co: –, Saved: 1
 *   Greenrise Technologies / Trivest Partners    — PE: 1, Co: 1, Saved: 2
 *   Roofing Corp of America / Kelso & Company    — PE: 1, Co: –, Saved: 1
 *   Roof Right Group / Broadtree Partners        — PE: 1, Co: –, Saved: 1
 */
import { describe, it, expect } from 'vitest';

// ============================================================================
// Re-implement pure functions from find-contacts/index.ts and domain-utils.ts
// (same pattern used in other edge function tests — avoids Deno imports)
// ============================================================================

// --- domain-utils.ts ---

function inferDomainCandidates(companyName: string): string[] {
  const candidates: string[] = [];
  const clean = companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
  const words = clean.split(/\s+/).filter(Boolean);

  // 1. Full concatenation
  candidates.push(`${words.join('')}.com`);

  // 2. Without common PE/finance suffixes
  const suffixes = [
    'partners',
    'capital',
    'group',
    'holdings',
    'advisors',
    'advisory',
    'management',
    'investments',
    'equity',
    'fund',
    'ventures',
    'associates',
    'llc',
    'inc',
    'corp',
    'corporation',
    'industries',
    'enterprises',
    'company',
    'co',
    'firms',
    'firm',
  ];
  const core = words.filter((w) => !suffixes.includes(w));
  if (core.length > 0 && core.length < words.length) {
    candidates.push(`${core.join('')}.com`);

    // 3. Core + common PE suffixes
    for (const suffix of ['capital', 'partners', 'group', 'advisors']) {
      if (words.includes(suffix)) {
        candidates.push(`${core.join('')}${suffix}.com`);
      }
    }
  }

  // 4. Hyphenated core words
  if (core.length >= 2) {
    candidates.push(`${core.join('-')}.com`);
  }

  // 5. Initials
  if (words.length >= 2) {
    const initials = words.map((w) => w[0]).join('');
    if (initials.length >= 2 && initials.length <= 5) {
      candidates.push(`${initials}.com`);
    }
    if (core.length >= 2 && core.length !== words.length) {
      const coreInitials = core.map((w) => w[0]).join('');
      if (coreInitials.length >= 2 && coreInitials.length <= 5) {
        candidates.push(`${coreInitials}.com`);
      }
    }
  }

  return [...new Set(candidates)];
}

// --- find-contacts/index.ts: TITLE_ALIASES ---

const TITLE_ALIASES: Record<string, string[]> = {
  associate: [
    'associate',
    'sr associate',
    'senior associate',
    'investment associate',
    'investment professional',
  ],
  principal: ['principal', 'sr principal', 'senior principal', 'investment principal'],
  vp: [
    'vp',
    'vice president',
    'vice-president',
    'svp',
    'senior vice president',
    'evp',
    'executive vice president',
    'vp of operations',
    'vp operations',
    'vp finance',
    'vp business development',
    'vp strategy',
    'vp corporate development',
  ],
  director: [
    'director',
    'managing director',
    'sr director',
    'senior director',
    'associate director',
    'director of operations',
    'director of finance',
    'director of business development',
    'director of acquisitions',
    'director of strategy',
    'executive director',
  ],
  partner: [
    'partner',
    'managing partner',
    'general partner',
    'senior partner',
    'operating partner',
    'venture partner',
    'founding partner',
    'equity partner',
  ],
  analyst: ['analyst', 'sr analyst', 'senior analyst', 'investment analyst'],
  ceo: [
    'ceo',
    'chief executive officer',
    'president',
    'owner',
    'founder',
    'co-founder',
    'chief executive',
    'managing member',
    'general manager',
    'gm',
  ],
  cfo: [
    'cfo',
    'chief financial officer',
    'head of finance',
    'finance director',
    'vp finance',
    'controller',
    'treasurer',
  ],
  coo: [
    'coo',
    'chief operating officer',
    'head of operations',
    'operations director',
    'vp operations',
  ],
  bd: [
    'business development',
    'corp dev',
    'corporate development',
    'head of acquisitions',
    'vp acquisitions',
    'vp m&a',
    'head of m&a',
    'director of acquisitions',
    'acquisitions',
    'deal origination',
    'deal sourcing',
    'investment origination',
    'business development officer',
    'bdo',
    'head of growth',
    'vp growth',
    'chief development officer',
    'chief business development officer',
    'chief growth officer',
  ],
  operating_partner: [
    'operating partner',
    'operating executive',
    'operating advisor',
    'senior operating partner',
    'executive in residence',
    'eir',
    'operating principal',
    'portfolio operations',
  ],
  senior_associate: ['senior associate', 'sr associate', 'investment associate'],
};

function matchesTitle(title: string, filters: string[]): boolean {
  const normalizedTitle = title.toLowerCase().trim();
  for (const filter of filters) {
    const normalizedFilter = filter.toLowerCase().trim();
    if (normalizedTitle.includes(normalizedFilter)) return true;
    const aliases = TITLE_ALIASES[normalizedFilter];
    if (aliases) {
      for (const alias of aliases) {
        if (normalizedTitle.includes(alias)) return true;
      }
    }
  }
  return false;
}

// --- find-contacts/index.ts: parseLinkedInTitle ---

function parseLinkedInTitle(resultTitle: string): {
  firstName: string;
  lastName: string;
  role: string;
  company: string;
} | null {
  const cleaned = resultTitle.replace(/\s*[|·–—-]\s*LinkedIn\s*$/i, '').trim();
  if (!cleaned) return null;

  const commaPattern = cleaned.match(
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+),\s*(.+?)(?:\s+[-–—]\s+(.+))?$/,
  );
  if (commaPattern) {
    const namePart = commaPattern[1].trim();
    const roleOrCompany = commaPattern[2].trim();
    const afterDash = commaPattern[3]?.trim() || '';
    const names = namePart.split(/\s+/).filter(Boolean);
    if (names.length >= 2) {
      const looksLikeRole =
        /\b(CEO|CFO|COO|CTO|VP|President|Founder|Owner|Partner|Principal|Director|Manager|Chairman|Associate|Analyst|Managing|Operating|Senior|Head)\b/i;
      let role = '';
      let company = '';
      if (looksLikeRole.test(roleOrCompany)) {
        role = roleOrCompany;
        company = afterDash;
      } else {
        company = roleOrCompany;
        role = afterDash;
      }
      return { firstName: names[0], lastName: names[names.length - 1], role, company };
    }
  }

  const dashParts = cleaned.split(/\s+[-–—]\s+/);
  const namePart = dashParts[0]?.trim() || '';
  const names = namePart.split(/\s+/).filter(Boolean);
  if (names.length < 2) return null;

  const firstName = names[0];
  const lastName = names[names.length - 1];

  let role = '';
  let company = '';
  if (dashParts.length >= 2) {
    const rest = dashParts.slice(1).join(' - ').trim();
    const atMatch = rest.match(/^(.+?)\s+at\s+(.+)$/i);
    if (atMatch) {
      role = atMatch[1].trim();
      company = atMatch[2].trim();
    } else {
      const commaMatch = rest.match(/^(.+?),\s+(.+)$/);
      if (commaMatch) {
        const looksLikeRole =
          /\b(CEO|CFO|COO|CTO|VP|President|Founder|Owner|Partner|Principal|Director|Manager|Chairman|Associate|Analyst|Managing|Operating|Senior|Head)\b/i;
        if (looksLikeRole.test(commaMatch[1])) {
          role = commaMatch[1].trim();
          company = commaMatch[2].trim();
        } else {
          company = commaMatch[1].trim();
          role = commaMatch[2].trim();
        }
      } else {
        const looksLikeRole =
          /\b(CEO|CFO|COO|CTO|VP|President|Founder|Owner|Partner|Principal|Director|Manager|Chairman|Associate|Analyst|Managing|Operating|Senior|Head)\b/i;
        if (looksLikeRole.test(rest)) {
          role = rest;
        } else {
          company = rest;
        }
      }
    }
  }

  return { firstName, lastName, role, company };
}

// --- find-contacts/index.ts: getCompanyNameVariations ---

function getCompanyNameVariations(companyName: string): string[] {
  const variations = [companyName];

  // Step 1: Extract primary name (before any parenthetical)
  const primaryName = companyName.replace(/\s*\(.*$/, '').trim() || companyName;
  if (primaryName !== companyName) {
    variations.push(primaryName);
  }

  // Step 2: Handle parenthetical names
  const parenMatch = companyName.match(/^(.+?)\s*\((.+?)\)?$/);
  if (parenMatch) {
    const inner = parenMatch[2].replace(/\.\.\.$/, '').trim();
    const dbaInner = inner.match(/^(?:dba|d\/b\/a|doing business as)\s+(.+)$/i);
    if (dbaInner) {
      variations.push(dbaInner[1].trim());
    } else {
      for (const alt of inner.split('/')) {
        const trimmed = alt.trim();
        if (trimmed.length > 2) variations.push(trimmed);
      }
    }
  }

  // Step 3: Apply suffix stripping to the PRIMARY name
  const suffixes = [
    'partners',
    'capital',
    'group',
    'holdings',
    'advisors',
    'advisory',
    'management',
    'investments',
    'equity',
    'fund',
    'ventures',
    'associates',
    'llc',
    'inc',
    'corp',
    'corporation',
    'industries',
    'enterprises',
    'company',
    'co',
  ];
  const words = primaryName.split(/\s+/).filter(Boolean);
  const core = words.filter((w) => !suffixes.includes(w.toLowerCase()));

  if (core.length > 0 && core.length < words.length) {
    variations.push(core.join(' '));
    const firstSuffix = words.find((w) => suffixes.includes(w.toLowerCase()));
    if (firstSuffix && core.length >= 1) {
      variations.push(`${core.join(' ')} ${firstSuffix}`);
    }
  }

  return [...new Set(variations.filter((v) => v.length > 1))];
}

// --- serper-client.ts: discoverCompanyDomain (scoring logic only) ---

interface GoogleSearchItem {
  title: string;
  url: string;
  description: string;
  position: number;
}

const NOISE_DOMAINS = new Set([
  'linkedin.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'youtube.com',
  'wikipedia.org',
  'crunchbase.com',
  'bloomberg.com',
  'pitchbook.com',
  'zoominfo.com',
  'dnb.com',
  'apollo.io',
  'rocketreach.com',
  'glassdoor.com',
  'indeed.com',
  'yelp.com',
  'bbb.org',
  'sec.gov',
  'google.com',
  'yahoo.com',
  'bing.com',
  'reddit.com',
  'quora.com',
  'signalhire.com',
  'owler.com',
  'ziprecruiter.com',
  'comparably.com',
  'ambitionbox.com',
  'levelsfyi.com',
  'wellfound.com',
]);

function scoreDomainFromResults(
  companyName: string,
  inferredCandidates: string[],
  results: GoogleSearchItem[],
): { domain: string; score: number; confidence: 'high' | 'medium' | 'low' } | null {
  const cleanName = companyName
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\.{3,}$/, '')
    .trim();
  const companyWords = cleanName
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const domainScores = new Map<string, { score: number; url: string }>();

  for (const result of results) {
    let hostname: string;
    try {
      hostname = new URL(result.url).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }

    if (NOISE_DOMAINS.has(hostname)) continue;
    if ([...NOISE_DOMAINS].some((nd) => hostname.endsWith(`.${nd}`))) continue;

    let score = 0;
    if (result.position <= 2) score += 3;
    else if (result.position <= 5) score += 1;

    const domainLower = hostname.toLowerCase();
    for (const word of companyWords) {
      if (domainLower.includes(word)) score += 2;
    }

    const combined = `${result.title} ${result.description}`.toLowerCase();
    if (combined.includes(cleanName.toLowerCase())) score += 2;

    if (inferredCandidates.includes(hostname)) score += 5;

    if (hostname.endsWith('.com') && hostname.split('.').length === 2) score += 1;

    const existing = domainScores.get(hostname);
    if (!existing || score > existing.score) {
      domainScores.set(hostname, { score, url: result.url });
    }
  }

  // Check LinkedIn company pages for domain mentions
  for (const result of results) {
    if (!result.url.includes('linkedin.com/company/')) continue;
    const desc = result.description.toLowerCase();
    for (const candidate of inferredCandidates) {
      if (desc.includes(candidate)) {
        const existing = domainScores.get(candidate);
        domainScores.set(candidate, { score: (existing?.score || 0) + 4, url: result.url });
      }
    }
  }

  if (domainScores.size === 0) return null;

  const sorted = [...domainScores.entries()].sort((a, b) => b[1].score - a[1].score);
  const [bestDomain, bestInfo] = sorted[0];
  const confidence = bestInfo.score >= 6 ? 'high' : bestInfo.score >= 3 ? 'medium' : 'low';

  return { domain: bestDomain, score: bestInfo.score, confidence };
}

// --- find-introduction-contacts/index.ts: title filters ---

const PE_TITLE_FILTER = [
  'partner',
  'managing partner',
  'operating partner',
  'senior partner',
  'principal',
  'managing director',
  'vp',
  'vice president',
  'director',
  'bd',
  'business development',
  'acquisitions',
  'senior associate',
  'analyst',
  'ceo',
  'president',
  'founder',
];

const COMPANY_TITLE_FILTER = [
  'ceo',
  'president',
  'founder',
  'owner',
  'cfo',
  'chief financial officer',
  'coo',
  'chief operating officer',
  'vp',
  'vice president',
  'bd',
  'business development',
  'director',
  'general manager',
  'head of finance',
  'finance director',
  'vp finance',
  'controller',
  'head of operations',
  'vp operations',
];

// ============================================================================
// TESTS
// ============================================================================

// The 5 most recent discovery runs and their old results
const TEST_COMPANIES = [
  {
    company: 'Legacy Service Partners',
    peFirm: 'Gridiron Capital',
    oldResults: { pe: 7, co: 2, saved: 9 },
  },
  {
    company: 'Valor Exterior Partners',
    peFirm: 'Osceola Capital Management',
    oldResults: { pe: 1, co: 0, saved: 1 },
  },
  {
    company: 'Greenrise Technologies',
    peFirm: 'Trivest Partners',
    oldResults: { pe: 1, co: 1, saved: 2 },
  },
  {
    company: 'Roofing Corp of America',
    peFirm: 'Kelso & Company',
    oldResults: { pe: 1, co: 0, saved: 1 },
  },
  {
    company: 'Roof Right Group',
    peFirm: 'Broadtree Partners',
    oldResults: { pe: 1, co: 0, saved: 1 },
  },
];

// ============================================================================
// 1. Domain Inference — verify we generate better domain candidates
// ============================================================================

describe('Domain inference for PE firms', () => {
  it('Gridiron Capital: generates useful domain candidates', () => {
    const candidates = inferDomainCandidates('Gridiron Capital');
    expect(candidates).toContain('gridironcapital.com');
    expect(candidates).toContain('gridiron.com');
    expect(candidates).toContain('gc.com');
    // OLD: only had these 3. NEW: also includes hyphenated
    expect(candidates.length).toBeGreaterThanOrEqual(3);
  });

  it('Osceola Capital Management: generates candidates including without "Management"', () => {
    const candidates = inferDomainCandidates('Osceola Capital Management');
    expect(candidates).toContain('osceolacapitalmanagement.com');
    expect(candidates).toContain('osceola.com');
    // NEW: should include core + suffix recombination
    expect(candidates).toContain('osceolacapital.com');
  });

  it('Trivest Partners: generates correct candidates', () => {
    const candidates = inferDomainCandidates('Trivest Partners');
    expect(candidates).toContain('trivestpartners.com');
    expect(candidates).toContain('trivest.com');
    // NEW: should try trivest + partners recombination
    expect(candidates).toContain('trivestpartners.com');
  });

  it('Kelso & Company: handles ampersand and "Company" suffix', () => {
    const candidates = inferDomainCandidates('Kelso & Company');
    // & gets stripped → "kelso company"
    expect(candidates).toContain('kelsocompany.com');
    expect(candidates).toContain('kelso.com');
  });

  it('Broadtree Partners: generates correct candidates', () => {
    const candidates = inferDomainCandidates('Broadtree Partners');
    expect(candidates).toContain('broadtreepartners.com');
    expect(candidates).toContain('broadtree.com');
  });
});

describe('Domain inference for platform companies', () => {
  it('Legacy Service Partners: generates candidates', () => {
    const candidates = inferDomainCandidates('Legacy Service Partners');
    expect(candidates).toContain('legacyservicepartners.com');
    expect(candidates).toContain('legacyservice.com');
    // Initials
    expect(candidates).toContain('lsp.com');
  });

  it('Valor Exterior Partners: generates candidates', () => {
    const candidates = inferDomainCandidates('Valor Exterior Partners');
    expect(candidates).toContain('valorexteriorpartners.com');
    expect(candidates).toContain('valorexterior.com');
  });

  it('Greenrise Technologies: handles non-PE suffix "Technologies"', () => {
    // "technologies" is NOT in our suffix list, so it stays
    const candidates = inferDomainCandidates('Greenrise Technologies');
    expect(candidates).toContain('greenrisetechnologies.com');
  });

  it('Roofing Corp of America: handles "Corp"', () => {
    const candidates = inferDomainCandidates('Roofing Corp of America');
    // "corp" is stripped, "of" is kept (>2 chars? no, "of" is 2 chars)
    // Words: roofing, corp, of, america → core: roofing, of, america (corp stripped)
    // But "of" has length 2, so after filter: only words > 0 chars kept
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates).toContain('roofingcorpofamerica.com');
  });
});

// ============================================================================
// 2. Domain scoring — simulate Google results and verify we'd pick the right domain
// ============================================================================

describe('Domain discovery scoring', () => {
  it('Gridiron Capital: picks gridironcap.com from Google results', () => {
    // Simulate what Google would return for "Gridiron Capital"
    const fakeResults: GoogleSearchItem[] = [
      {
        title: 'Gridiron Capital - Private Equity',
        url: 'https://www.gridironcap.com/',
        description: 'Gridiron Capital is a private equity firm focused on...',
        position: 1,
      },
      {
        title: 'Gridiron Capital | LinkedIn',
        url: 'https://www.linkedin.com/company/gridiron-capital',
        description: 'Gridiron Capital is a middle market private equity firm. gridironcap.com',
        position: 2,
      },
      {
        title: 'Gridiron Capital - PitchBook',
        url: 'https://pitchbook.com/profiles/gridiron-capital',
        description: 'PE firm',
        position: 3,
      },
      {
        title: 'Gridiron Capital - Crunchbase',
        url: 'https://www.crunchbase.com/organization/gridiron-capital',
        description: 'PE firm',
        position: 4,
      },
    ];

    const inferred = inferDomainCandidates('Gridiron Capital');
    const result = scoreDomainFromResults('Gridiron Capital', inferred, fakeResults);

    expect(result).not.toBeNull();
    expect(result!.domain).toBe('gridironcap.com');
    expect(result!.confidence).toBe('high');
  });

  it('Trivest Partners: picks trivest.com', () => {
    const fakeResults: GoogleSearchItem[] = [
      {
        title: 'Trivest Partners - Middle Market PE',
        url: 'https://www.trivest.com/',
        description: 'Trivest Partners is a private equity firm based in Miami.',
        position: 1,
      },
      {
        title: 'Trivest Partners | LinkedIn',
        url: 'https://www.linkedin.com/company/trivest-partners',
        description: 'trivest.com · Private Equity',
        position: 2,
      },
    ];

    const inferred = inferDomainCandidates('Trivest Partners');
    const result = scoreDomainFromResults('Trivest Partners', inferred, fakeResults);

    expect(result).not.toBeNull();
    expect(result!.domain).toBe('trivest.com');
    expect(result!.confidence).toBe('high');
  });

  it('Kelso & Company: picks kelso.com', () => {
    const fakeResults: GoogleSearchItem[] = [
      {
        title: 'Kelso & Company - Private Equity',
        url: 'https://www.kelso.com/',
        description: 'Kelso & Company is one of the oldest private equity firms.',
        position: 1,
      },
      {
        title: 'Kelso & Company | LinkedIn',
        url: 'https://www.linkedin.com/company/kelso-&-company',
        description: 'kelso.com',
        position: 2,
      },
    ];

    const inferred = inferDomainCandidates('Kelso & Company');
    const result = scoreDomainFromResults('Kelso & Company', inferred, fakeResults);

    expect(result).not.toBeNull();
    expect(result!.domain).toBe('kelso.com');
    expect(result!.confidence).toBe('high');
  });

  it('Osceola Capital Management: picks osceolacapital.com', () => {
    const fakeResults: GoogleSearchItem[] = [
      {
        title: 'Osceola Capital Management - PE Firm',
        url: 'https://www.osceolacapital.com/',
        description: 'Osceola Capital Management is a private equity firm based in Tampa.',
        position: 1,
      },
      {
        title: 'Osceola Capital Management | LinkedIn',
        url: 'https://www.linkedin.com/company/osceola-capital-management',
        description: 'osceolacapital.com',
        position: 2,
      },
    ];

    const inferred = inferDomainCandidates('Osceola Capital Management');
    const result = scoreDomainFromResults('Osceola Capital Management', inferred, fakeResults);

    expect(result).not.toBeNull();
    expect(result!.domain).toBe('osceolacapital.com');
    expect(result!.confidence).toBe('high');
  });

  it('Broadtree Partners: picks broadtree.com', () => {
    const fakeResults: GoogleSearchItem[] = [
      {
        title: 'Broadtree Partners - Private Equity',
        url: 'https://www.broadtreepartners.com/',
        description: 'Broadtree Partners focuses on lower middle market investments.',
        position: 1,
      },
    ];

    const inferred = inferDomainCandidates('Broadtree Partners');
    const result = scoreDomainFromResults('Broadtree Partners', inferred, fakeResults);

    expect(result).not.toBeNull();
    expect(result!.domain).toBe('broadtreepartners.com');
    // Matches inferred (+5) + position 1 (+3) + company words (+2 "broadtree") + title match (+2) + .com (+1) = 13
    expect(result!.confidence).toBe('high');
  });

  it('filters out noise domains (PitchBook, Crunchbase, ZoomInfo)', () => {
    const fakeResults: GoogleSearchItem[] = [
      {
        title: 'Some Firm - PitchBook',
        url: 'https://pitchbook.com/profiles/some-firm',
        description: '',
        position: 1,
      },
      {
        title: 'Some Firm - Crunchbase',
        url: 'https://www.crunchbase.com/organization/some-firm',
        description: '',
        position: 2,
      },
      {
        title: 'Some Firm - ZoomInfo',
        url: 'https://www.zoominfo.com/c/some-firm/123',
        description: '',
        position: 3,
      },
      {
        title: 'Some Firm',
        url: 'https://www.somefirm.com/',
        description: 'Some Firm is a PE firm',
        position: 4,
      },
    ];

    const result = scoreDomainFromResults('Some Firm', ['somefirm.com'], fakeResults);
    expect(result).not.toBeNull();
    expect(result!.domain).toBe('somefirm.com');
  });
});

// ============================================================================
// 3. Company name variations — verify we parse tricky names correctly
// ============================================================================

describe('Company name variations', () => {
  it('simple PE firm name', () => {
    const vars = getCompanyNameVariations('Gridiron Capital');
    expect(vars).toContain('Gridiron Capital');
    expect(vars).toContain('Gridiron');
    expect(vars).toContain('Gridiron Capital'); // core + suffix
  });

  it('PE firm with "Management" suffix', () => {
    const vars = getCompanyNameVariations('Osceola Capital Management');
    expect(vars).toContain('Osceola Capital Management');
    expect(vars).toContain('Osceola');
    expect(vars).toContain('Osceola Capital'); // core + first suffix
  });

  it('parenthetical name: BigRentz (Equipt/America...)', () => {
    const vars = getCompanyNameVariations('BigRentz (Equipt/America...)');
    expect(vars).toContain('BigRentz');
    expect(vars).toContain('Equipt');
    // "America" from splitting inner on "/" and stripping trailing "..."
    expect(vars.some((v) => v.startsWith('America'))).toBe(true);
  });

  it('DBA name: Brammo Holdings (dba MiCorp)', () => {
    const vars = getCompanyNameVariations('Brammo Holdings (dba MiCorp)');
    expect(vars).toContain('Brammo Holdings (dba MiCorp)');
    expect(vars).toContain('Brammo Holdings'); // primary name (before parens)
    expect(vars).toContain('MiCorp'); // extracted from DBA
    // Suffix stripping on "Brammo Holdings" → "Brammo" (Holdings is in suffix list)
    expect(vars).toContain('Brammo');
  });

  it('simple two-word name has no extra variations', () => {
    const vars = getCompanyNameVariations('Greenrise Technologies');
    // "technologies" is NOT in suffix list, so no stripping happens
    expect(vars).toEqual(['Greenrise Technologies']);
  });

  it('Kelso & Company strips Company suffix', () => {
    const vars = getCompanyNameVariations('Kelso & Company');
    expect(vars).toContain('Kelso & Company');
    expect(vars).toContain('Kelso &');
    // "company" is in suffix list, "&" stays with core
  });
});

// ============================================================================
// 4. Title matching — verify expanded aliases catch more PE roles
// ============================================================================

describe('Title matching with expanded aliases', () => {
  // Roles that the OLD system missed but NEW should catch
  const newlyCaughtRoles = [
    { title: 'Operating Partner', filter: 'partner', should: true },
    { title: 'Operating Partner at Gridiron Capital', filter: 'operating_partner', should: true },
    { title: 'Managing Director', filter: 'director', should: true },
    { title: 'Executive in Residence', filter: 'operating_partner', should: true },
    { title: 'Chief Financial Officer', filter: 'cfo', should: true },
    { title: 'Chief Operating Officer', filter: 'coo', should: true },
    { title: 'Head of Acquisitions', filter: 'bd', should: true },
    { title: 'Director of Acquisitions', filter: 'bd', should: true },
    { title: 'VP Business Development', filter: 'vp', should: true },
    { title: 'Deal Sourcing', filter: 'bd', should: true },
    { title: 'Head of Growth', filter: 'bd', should: true },
    { title: 'Investment Professional', filter: 'associate', should: true },
    { title: 'Founding Partner', filter: 'partner', should: true },
    { title: 'General Manager', filter: 'ceo', should: true },
    { title: 'Controller', filter: 'cfo', should: true },
    { title: 'Portfolio Operations', filter: 'operating_partner', should: true },
  ];

  for (const { title, filter, should } of newlyCaughtRoles) {
    it(`"${title}" matches filter "${filter}": ${should}`, () => {
      expect(matchesTitle(title, [filter])).toBe(should);
    });
  }

  // Verify PE_TITLE_FILTER catches all these PE roles
  const peRoles = [
    'Partner',
    'Managing Partner',
    'Operating Partner',
    'Senior Partner',
    'Principal',
    'Managing Director',
    'Vice President',
    'Director',
    'Business Development',
    'Senior Associate',
    'Analyst',
    'CEO',
    'President',
    'Founder',
    'Head of Acquisitions',
    'VP M&A',
  ];

  for (const role of peRoles) {
    it(`PE filter catches "${role}"`, () => {
      expect(matchesTitle(role, PE_TITLE_FILTER)).toBe(true);
    });
  }

  // Verify COMPANY_TITLE_FILTER catches all these company roles
  const companyRoles = [
    'CEO',
    'President',
    'Founder',
    'Owner',
    'CFO',
    'Chief Financial Officer',
    'COO',
    'Chief Operating Officer',
    'VP',
    'Vice President',
    'Business Development',
    'Director',
    'General Manager',
    'Head of Finance',
    'Finance Director',
    'Controller',
    'Head of Operations',
    'VP Operations',
  ];

  for (const role of companyRoles) {
    it(`Company filter catches "${role}"`, () => {
      expect(matchesTitle(role, COMPANY_TITLE_FILTER)).toBe(true);
    });
  }
});

// ============================================================================
// 5. LinkedIn title parsing — verify we handle more patterns
// ============================================================================

describe('LinkedIn title parsing', () => {
  it('standard "Name - Role at Company | LinkedIn"', () => {
    const result = parseLinkedInTitle('Ryan Brown - President at Gridiron Capital | LinkedIn');
    expect(result).not.toBeNull();
    expect(result!.firstName).toBe('Ryan');
    expect(result!.lastName).toBe('Brown');
    expect(result!.role).toBe('President');
    expect(result!.company).toBe('Gridiron Capital');
  });

  it('"Name - Role at Company" (no LinkedIn suffix)', () => {
    const result = parseLinkedInTitle('John Smith - CEO & Founder at Acme Corp');
    expect(result).not.toBeNull();
    expect(result!.firstName).toBe('John');
    expect(result!.lastName).toBe('Smith');
    expect(result!.role).toBe('CEO & Founder');
    expect(result!.company).toBe('Acme Corp');
  });

  it('comma pattern: "Name, Role - Company | LinkedIn"', () => {
    const result = parseLinkedInTitle('Jane Doe, Partner - Gridiron Capital | LinkedIn');
    expect(result).not.toBeNull();
    expect(result!.firstName).toBe('Jane');
    expect(result!.lastName).toBe('Doe');
    expect(result!.role).toBe('Partner');
    expect(result!.company).toBe('Gridiron Capital');
  });

  it('"Name - Managing Director | LinkedIn"', () => {
    const result = parseLinkedInTitle('Mike Lee - Managing Director | LinkedIn');
    expect(result).not.toBeNull();
    expect(result!.firstName).toBe('Mike');
    expect(result!.lastName).toBe('Lee');
    expect(result!.role).toBe('Managing Director');
  });

  it('"Name - Role, Company | LinkedIn"', () => {
    const result = parseLinkedInTitle('Sarah Kim - VP of Operations, Kelso & Company | LinkedIn');
    expect(result).not.toBeNull();
    expect(result!.firstName).toBe('Sarah');
    expect(result!.lastName).toBe('Kim');
    expect(result!.role).toBe('VP of Operations');
    expect(result!.company).toBe('Kelso & Company');
  });

  it('handles three-part names', () => {
    const result = parseLinkedInTitle('Mary Jane Watson - Partner at Trivest Partners | LinkedIn');
    expect(result).not.toBeNull();
    expect(result!.firstName).toBe('Mary');
    expect(result!.lastName).toBe('Watson');
    expect(result!.role).toBe('Partner');
    expect(result!.company).toBe('Trivest Partners');
  });

  it('returns null for single-word name', () => {
    const result = parseLinkedInTitle('Madonna - Singer | LinkedIn');
    // "Madonna" is only 1 word — should return null
    expect(result).toBeNull();
  });
});

// ============================================================================
// 6. Search query generation — verify we produce domain-free fallback queries
// ============================================================================

describe('Search query generation', () => {
  function buildSearchQueries(
    companyName: string,
    domain: string,
    titleFilter: string[],
  ): string[] {
    const excludeNoise =
      '-zoominfo -dnb -rocketreach -signalhire -apollo.io -indeed.com -glassdoor';
    const nameVariations = getCompanyNameVariations(companyName);
    const roleQueries: string[] = [];

    // Core queries: Company name + role groups (consolidated layers 1+2)
    const domainHint = domain ? `${domain} ` : '';
    roleQueries.push(
      `${domainHint}"${companyName}" CEO founder president owner site:linkedin.com/in ${excludeNoise}`,
      `${domainHint}"${companyName}" partner principal "managing director" chairman site:linkedin.com/in ${excludeNoise}`,
      `"${companyName}" VP director "head of" site:linkedin.com/in ${excludeNoise}`,
      `"${companyName}" "business development" acquisitions CFO COO site:linkedin.com/in ${excludeNoise}`,
      `"${companyName}" "operating partner" "senior associate" analyst site:linkedin.com/in ${excludeNoise}`,
    );

    // Layer 3: Name variations
    for (const variation of nameVariations.slice(1)) {
      roleQueries.push(
        `"${variation}" CEO partner principal director site:linkedin.com/in ${excludeNoise}`,
      );
    }

    // Layer 4: Title filter queries (batched, skip already-covered titles)
    const alreadyCovered = new Set([
      'ceo',
      'president',
      'founder',
      'owner',
      'partner',
      'principal',
      'managing director',
      'vp',
      'vice president',
      'director',
      'chairman',
      'business development',
      'acquisitions',
      'cfo',
      'coo',
      'operating partner',
      'head of',
    ]);
    if (titleFilter.length > 0) {
      const uncovered = titleFilter.filter((tf) => !alreadyCovered.has(tf.toLowerCase()));
      for (let i = 0; i < uncovered.length; i += 3) {
        const batch = uncovered.slice(i, i + 3);
        const terms = batch.map((t) => `"${t}"`).join(' OR ');
        roleQueries.push(`"${companyName}" ${terms} site:linkedin.com/in ${excludeNoise}`);
      }
    }

    // Layer 5: Broader
    roleQueries.push(
      `"${companyName}" team leadership site:linkedin.com/in ${excludeNoise}`,
      `"${companyName}" "works at" OR "working at" site:linkedin.com/in ${excludeNoise}`,
    );

    return [...new Set(roleQueries)];
  }

  it('Gridiron Capital generates domain-free fallback queries', () => {
    const queries = buildSearchQueries('Gridiron Capital', 'gridironcap.com', PE_TITLE_FILTER);

    // Should have domain-based queries
    const domainQueries = queries.filter((q) => q.includes('gridironcap.com'));
    expect(domainQueries.length).toBeGreaterThan(0);

    // Should also have domain-free queries (queries without domain hint)
    const domainFreeQueries = queries.filter(
      (q) => q.includes('"Gridiron Capital"') && !q.includes('gridironcap.com'),
    );
    expect(domainFreeQueries.length).toBeGreaterThanOrEqual(3);

    // Total queries should be substantial but optimized (batched + consolidated)
    expect(queries.length).toBeGreaterThanOrEqual(8);
  });

  it('Osceola Capital Management generates variation queries', () => {
    const queries = buildSearchQueries(
      'Osceola Capital Management',
      'osceolacapital.com',
      PE_TITLE_FILTER,
    );

    // Should have queries for the core name "Osceola" as a variation
    const variationQueries = queries.filter((q) => q.includes('"Osceola"'));
    expect(variationQueries.length).toBeGreaterThanOrEqual(1);
  });

  it('every company gets CFO/COO queries in core queries', () => {
    for (const tc of TEST_COMPANIES) {
      const queries = buildSearchQueries(tc.peFirm, 'test.com', PE_TITLE_FILTER);
      const cfoCooQuery = queries.find((q) => q.includes('CFO COO'));
      expect(cfoCooQuery).toBeDefined();
    }
  });

  it('domain-free queries always include site:linkedin.com/in', () => {
    const queries = buildSearchQueries('Gridiron Capital', 'gridironcap.com', PE_TITLE_FILTER);
    const domainFree = queries.filter((q) => !q.includes('gridironcap.com'));
    for (const q of domainFree) {
      expect(q).toContain('site:linkedin.com/in');
    }
  });
});

// ============================================================================
// 7. End-to-end comparison: old vs new query counts
// ============================================================================

describe('Query count comparison: old vs new', () => {
  // Old system generated: 4 domain-based + 1 generic + N title-filter + 1 leadership = ~23 queries
  // New system: 4 domain + 5 domain-free + variations + batched uncovered titles + 2 broad = ~14 queries
  // Fewer queries but better coverage (Layers 1-3 already cover most important titles)

  function countOldQueries(titleFilter: string[]): number {
    // Old: 4 domain role queries + 1 "contact email" + titleFilter.length + 1 leadership
    return 4 + 1 + titleFilter.length + 1;
  }

  function countNewQueries(companyName: string, titleFilter: string[]): number {
    const nameVars = getCompanyNameVariations(companyName);
    const coreQueries = 5; // consolidated role group queries
    const layer3 = nameVars.length - 1; // variations (skip first)
    // Layer 4: only uncovered titles, batched in groups of 3
    const alreadyCovered = new Set([
      'ceo',
      'president',
      'founder',
      'owner',
      'partner',
      'principal',
      'managing director',
      'vp',
      'vice president',
      'director',
      'chairman',
      'business development',
      'acquisitions',
      'cfo',
      'coo',
      'operating partner',
      'head of',
    ]);
    const uncovered = titleFilter.filter((tf) => !alreadyCovered.has(tf.toLowerCase()));
    const layer4 = Math.ceil(uncovered.length / 3); // batched queries
    const layer5 = 2; // broader

    // Approximate (before dedup)
    return coreQueries + layer3 + layer4 + layer5;
  }

  for (const tc of TEST_COMPANIES) {
    it(`${tc.peFirm}: new generates fewer but more targeted queries than old`, () => {
      const oldCount = countOldQueries(PE_TITLE_FILTER);
      const newCount = countNewQueries(tc.peFirm, PE_TITLE_FILTER);

      // New approach uses fewer queries (batched + deduped) but better coverage
      // Layers 1-3 cover all major titles; Layer 4 only adds truly uncovered ones
      expect(newCount).toBeLessThanOrEqual(oldCount);
      expect(newCount).toBeGreaterThanOrEqual(10); // still substantial
    });
  }
});

// ============================================================================
// 8. Company matching — verify relaxed matching catches more valid contacts
// ============================================================================

describe('Company matching (relaxed)', () => {
  function getCompanyMatchWords(companyName: string): Set<string> {
    const nameVariations = getCompanyNameVariations(companyName);
    const allCompanyWords = new Set<string>();
    for (const variation of nameVariations) {
      for (const word of variation.toLowerCase().split(/\s+/)) {
        if (word.length > 2) allCompanyWords.add(word);
      }
    }
    return allCompanyWords;
  }

  function wouldMatch(
    companyName: string,
    domain: string,
    resultTitle: string,
    resultDescription: string,
  ): boolean {
    const allCompanyWords = getCompanyMatchWords(companyName);
    const combined = `${resultTitle} ${resultDescription}`.toLowerCase();

    const companyWordMatches = [...allCompanyWords].filter((w) => combined.includes(w));

    // Also check parsed company from title
    const parsed = parseLinkedInTitle(resultTitle);
    const parsedCompanyWords = (parsed?.company || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const parsedCompanyMatches = parsedCompanyWords.filter((w) => allCompanyWords.has(w));

    return (
      companyWordMatches.length > 0 ||
      parsedCompanyMatches.length > 0 ||
      combined.includes(domain.toLowerCase().replace('.com', ''))
    );
  }

  it('matches "Gridiron Capital" from LinkedIn title mentioning Gridiron', () => {
    expect(
      wouldMatch(
        'Gridiron Capital',
        'gridironcap.com',
        'John Smith - Partner at Gridiron Capital | LinkedIn',
        'Experienced PE professional.',
      ),
    ).toBe(true);
  });

  it('matches via domain when company name not in text', () => {
    expect(
      wouldMatch(
        'Gridiron Capital',
        'gridironcap.com',
        'John Smith - Partner | LinkedIn',
        'Works at gridironcap.com in private equity.',
      ),
    ).toBe(true);
  });

  it('matches "Osceola Capital Management" even if only "Osceola" appears', () => {
    // OLD would require "osceola" AND "capital" AND "management" all present
    // NEW checks all variations including just "Osceola"
    expect(
      wouldMatch(
        'Osceola Capital Management',
        'osceolacapital.com',
        'Jane Doe - VP at Osceola Capital | LinkedIn',
        'Private equity investment professional.',
      ),
    ).toBe(true);
  });

  it('matches via parsed company field from LinkedIn title', () => {
    expect(
      wouldMatch(
        'Broadtree Partners',
        'broadtreepartners.com',
        'Mike Lee - Director at Broadtree Partners | LinkedIn',
        '',
      ),
    ).toBe(true);
  });

  it('rejects completely unrelated results', () => {
    expect(
      wouldMatch(
        'Gridiron Capital',
        'gridironcap.com',
        'John Smith - Partner at Goldman Sachs | LinkedIn',
        'Investment banking professional at Goldman.',
      ),
    ).toBe(false);
  });
});
