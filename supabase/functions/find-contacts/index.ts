/**
 * Find Contacts Edge Function
 *
 * Contact discovery pipeline with Blitz API as primary, Serper/Clay/Prospeo as fallbacks:
 *
 *   1. Check cache for recent results
 *   2. Resolve company LinkedIn URL:
 *      a. Has domain? → Blitz domain-to-linkedin
 *      b. No domain? → Serper discoverCompanyDomain → Blitz domain-to-linkedin
 *      c. Blitz fails? → Serper findCompanyLinkedIn (fallback)
 *   3. PRIMARY: Blitz Waterfall ICP Search for contacts
 *      - 3-tier cascade: C-suite/Partners → VPs/Directors → Associates/BD
 *      - Supplement with Employee Finder if needed
 *      - FALLBACK: Serper Google search if Blitz fails
 *   4. Filter by title criteria
 *   5. CRM pre-check — skip contacts already known with email
 *   6. PRIMARY: Blitz email + phone enrichment
 *   7. FALLBACK 1: Clay batch email lookup (for contacts Blitz couldn't enrich)
 *   8. FALLBACK 2: Prospeo enrichment (last resort)
 *   9. Save to enriched_contacts table
 *  10. Log the search
 *
 * POST /find-contacts
 * Body: { company_name, title_filter?, target_count?, company_linkedin_url?, company_domain? }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { inferDomain, inferDomainCandidates } from '../_shared/domain-utils.ts';
import { batchEnrich, domainSearchEnrich } from '../_shared/prospeo-client.ts';
import {
  googleSearch,
  discoverCompanyDomain,
  findCompanyLinkedIn,
} from '../_shared/serper-client.ts';
import { sendToClayLinkedIn, sendToClayNameDomain } from '../_shared/clay-client.ts';
import {
  domainToLinkedIn,
  linkedInToDomain,
  waterfallIcpSearch,
  employeeFinder,
  batchEnrichContacts,
  type CascadeFilter,
  type BlitzPerson,
} from '../_shared/blitz-client.ts';

interface FindContactsRequest {
  company_name: string;
  title_filter?: string[];
  target_count?: number;
  company_linkedin_url?: string;
  company_domain?: string;
}

// Title matching utility — expanded to catch more PE and platform company roles
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

    // Direct match
    if (normalizedTitle.includes(normalizedFilter)) return true;

    // Alias match
    const aliases = TITLE_ALIASES[normalizedFilter];
    if (aliases) {
      for (const alias of aliases) {
        if (normalizedTitle.includes(alias)) return true;
      }
    }
  }

  return false;
}

/**
 * Validate a LinkedIn URL is a real personal profile (not company, posts, etc.)
 */
function isValidLinkedInProfileUrl(url: string): boolean {
  if (!url || !url.includes('linkedin.com/in/')) return false;
  const disallowed = [
    'linkedin.com/company/',
    'linkedin.com/posts/',
    'linkedin.com/pub/dir/',
    'linkedin.com/feed/',
    'linkedin.com/jobs/',
    'linkedin.com/school/',
    'linkedin.com/in/ACo',
  ];
  return !disallowed.some((d) => url.includes(d));
}

/**
 * Parse a LinkedIn search result title into structured contact data.
 * LinkedIn titles follow patterns like:
 *   "Ryan Brown - President at Essential Benefit Administrators | LinkedIn"
 *   "John Smith - CEO & Founder at Acme Corp | LinkedIn"
 *   "Jane Doe, Partner - Gridiron Capital | LinkedIn"
 *   "Mike Lee | Managing Director | LinkedIn"
 */
function parseLinkedInTitle(resultTitle: string): {
  firstName: string;
  lastName: string;
  role: string;
  company: string;
} | null {
  const cleaned = resultTitle.replace(/\s*[|·–—-]\s*LinkedIn\s*$/i, '').trim();
  if (!cleaned) return null;

  // Handle "Name, Title - Company" pattern (common in LinkedIn)
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
    // Try "Role at Company" first
    const atMatch = rest.match(/^(.+?)\s+at\s+(.+)$/i);
    if (atMatch) {
      role = atMatch[1].trim();
      company = atMatch[2].trim();
    } else {
      // Try "Role, Company" pattern
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

interface DiscoveredEmployee {
  fullName: string;
  firstName: string;
  lastName: string;
  title: string;
  profileUrl: string;
  companyName: string;
  confidence: number;
}

/**
 * Build search-friendly name variations for a company.
 * PE firms often go by abbreviations or short names.
 * e.g., "Bernhard Capital Partners" → ["Bernhard Capital Partners", "Bernhard Capital", "BCP"]
 */
function getCompanyNameVariations(companyName: string): string[] {
  const variations = [companyName];

  // Step 1: Extract primary name (before any parenthetical)
  const primaryName = companyName.replace(/\s*\(.*$/, '').trim() || companyName;
  if (primaryName !== companyName) {
    variations.push(primaryName);
  }

  // Step 2: Handle parenthetical names: "BigRentz (Equipt/America..." → "Equipt", "America"
  const parenMatch = companyName.match(/^(.+?)\s*\((.+?)\)?$/);
  if (parenMatch) {
    const inner = parenMatch[2].replace(/\.\.\.$/, '').trim();
    // Handle "dba" prefix inside parens
    const dbaInner = inner.match(/^(?:dba|d\/b\/a|doing business as)\s+(.+)$/i);
    if (dbaInner) {
      variations.push(dbaInner[1].trim());
    } else {
      // Split on / for alternate names
      for (const alt of inner.split('/')) {
        const trimmed = alt.trim();
        if (trimmed.length > 2) variations.push(trimmed);
      }
    }
  }

  // Step 3: Apply suffix stripping to the PRIMARY name (not the full parenthetical mess)
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
    // Core words only: "Bernhard Capital Partners" → "Bernhard"
    variations.push(core.join(' '));
    // Core + first suffix: "Bernhard Capital Partners" → "Bernhard Capital"
    const firstSuffix = words.find((w) => suffixes.includes(w.toLowerCase()));
    if (firstSuffix && core.length >= 1) {
      variations.push(`${core.join(' ')} ${firstSuffix}`);
    }
  }

  return [...new Set(variations.filter((v) => v.length > 1))];
}

// ─── NEW: Blitz-based contact discovery ─────────────────────────────────────

/**
 * Resolve the company LinkedIn URL using available data.
 * Waterfall: provided URL → domain → Blitz domain-to-linkedin → Serper fallback
 */
async function resolveCompanyLinkedInUrl(
  companyName: string,
  providedDomain: string | undefined,
  providedLinkedInUrl: string | undefined,
): Promise<{ linkedinUrl: string | null; domain: string | null }> {
  // 1. If LinkedIn URL was provided directly, use it
  if (providedLinkedInUrl?.includes('linkedin.com/company/')) {
    console.log(`[find-contacts] Using provided LinkedIn URL: ${providedLinkedInUrl}`);
    let domain = providedDomain || null;
    // If we have LinkedIn URL but no domain, try to get domain from Blitz
    if (!domain) {
      try {
        const domainRes = await linkedInToDomain(providedLinkedInUrl);
        if (domainRes.ok && domainRes.data?.domain) {
          domain = domainRes.data.domain;
          console.log(`[find-contacts] Resolved domain from LinkedIn URL: ${domain}`);
        }
      } catch (err) {
        console.warn(`[find-contacts] linkedInToDomain failed: ${err}`);
      }
    }
    return { linkedinUrl: providedLinkedInUrl, domain };
  }

  // 2. If domain was provided, use Blitz domain-to-linkedin
  if (providedDomain) {
    console.log(`[find-contacts] Resolving LinkedIn URL from provided domain: ${providedDomain}`);
    try {
      const res = await domainToLinkedIn(providedDomain);
      const linkedinUrl = res.data?.linkedin_url || res.data?.company_linkedin_url || null;
      if (res.ok && linkedinUrl) {
        console.log(`[find-contacts] Blitz domain-to-linkedin: ${linkedinUrl}`);
        return { linkedinUrl, domain: providedDomain };
      }
    } catch (err) {
      console.warn(`[find-contacts] Blitz domainToLinkedIn failed: ${err}`);
    }
  }

  // 3. No domain provided — discover domain via Serper, then use Blitz
  if (!providedDomain) {
    console.log(`[find-contacts] No domain provided, discovering via Serper...`);
    const inferredCandidates = inferDomainCandidates(companyName);
    try {
      const discovered = await discoverCompanyDomain(companyName, inferredCandidates);
      if (discovered && discovered.confidence !== 'low') {
        console.log(
          `[find-contacts] Domain discovered: ${discovered.domain} (${discovered.confidence})`,
        );
        // Try Blitz domain-to-linkedin with discovered domain
        try {
          const res = await domainToLinkedIn(discovered.domain);
          const linkedinUrl = res.data?.linkedin_url || res.data?.company_linkedin_url || null;
          if (res.ok && linkedinUrl) {
            console.log(`[find-contacts] Blitz domain-to-linkedin: ${linkedinUrl}`);
            return { linkedinUrl, domain: discovered.domain };
          }
        } catch (err) {
          console.warn(
            `[find-contacts] Blitz domainToLinkedIn failed for discovered domain: ${err}`,
          );
        }
        // Blitz failed but we have a domain — continue with Serper fallback
      }
    } catch (err) {
      console.warn(`[find-contacts] Serper domain discovery failed: ${err}`);
    }
  }

  // 4. Fallback: Serper findCompanyLinkedIn (Google search for LinkedIn company page)
  console.log(`[find-contacts] Falling back to Serper findCompanyLinkedIn for "${companyName}"`);
  try {
    const linkedinUrl = await findCompanyLinkedIn(companyName);
    if (linkedinUrl) {
      console.log(`[find-contacts] Serper found LinkedIn URL: ${linkedinUrl}`);
      // Try to get domain from LinkedIn URL via Blitz
      let domain = providedDomain || null;
      if (!domain) {
        try {
          const domainRes = await linkedInToDomain(linkedinUrl);
          if (domainRes.ok && domainRes.data?.domain) {
            domain = domainRes.data.domain;
          }
        } catch {
          /* non-critical */
        }
      }
      return { linkedinUrl, domain };
    }
  } catch (err) {
    console.warn(`[find-contacts] Serper findCompanyLinkedIn failed: ${err}`);
  }

  // All methods exhausted
  console.warn(`[find-contacts] Could not resolve LinkedIn URL for "${companyName}"`);
  return {
    linkedinUrl: null,
    domain: providedDomain || inferDomainCandidates(companyName)[0] || inferDomain(companyName),
  };
}

/**
 * Map a BlitzPerson to our DiscoveredEmployee format.
 */
function blitzPersonToEmployee(
  person: BlitzPerson,
  companyName: string,
  tier: number,
): DiscoveredEmployee {
  const fullName =
    person.full_name || `${person.first_name || ''} ${person.last_name || ''}`.trim();
  const names = fullName.split(/\s+/).filter(Boolean);
  const firstName = person.first_name || names[0] || '';
  const lastName = person.last_name || names.slice(1).join(' ') || names[names.length - 1] || '';

  // Extract title from headline (Blitz returns headline like "CEO at Acme Corp")
  let title = person.title || '';
  if (!title && person.headline) {
    const atMatch = person.headline.match(/^(.+?)\s+at\s+/i);
    title = atMatch ? atMatch[1].trim() : person.headline;
  }

  // Confidence based on tier (tier 1 = C-suite = highest)
  const confidence = tier === 1 ? 90 : tier === 2 ? 70 : 50;

  return {
    fullName,
    firstName,
    lastName,
    title,
    profileUrl: person.linkedin_url || '',
    companyName,
    confidence,
  };
}

/**
 * Discover contacts via Blitz Waterfall ICP Search (primary).
 * Falls back to Serper discovery if Blitz fails or returns too few results.
 */
async function discoverContactsViaBlitz(
  companyLinkedInUrl: string | null,
  companyName: string,
  domain: string,
  titleFilter: string[],
  maxResults: number,
): Promise<DiscoveredEmployee[]> {
  // If we don't have a LinkedIn URL, go straight to Serper fallback
  if (!companyLinkedInUrl) {
    console.log(`[find-contacts] No LinkedIn URL available, using Serper fallback`);
    return discoverEmployeesViaSerper(companyName, domain, titleFilter, maxResults);
  }

  // Build 3-tier cascade from title filter
  const cascade: CascadeFilter[] = [
    {
      include_title: [
        'CEO',
        'CFO',
        'COO',
        'CTO',
        'President',
        'Founder',
        'Owner',
        'Chairman',
        'Partner',
        'Managing Partner',
        'General Partner',
        'Senior Partner',
        'Principal',
        'Managing Director',
      ],
      exclude_title: ['assistant', 'intern', 'junior', 'entry level'],
      location: ['WORLD'],
      include_headline_search: true,
    },
    {
      include_title: [
        'VP',
        'Vice President',
        'SVP',
        'EVP',
        'Director',
        'Senior Director',
        'Executive Director',
        'Head of',
        'Operating Partner',
      ],
      exclude_title: ['assistant', 'intern', 'junior', 'entry level'],
      location: ['WORLD'],
      include_headline_search: true,
    },
    {
      include_title: [
        'Senior Associate',
        'Associate',
        'Analyst',
        'Business Development',
        'Corporate Development',
        'Acquisitions',
        'Deal Sourcing',
        'Investment Origination',
      ],
      exclude_title: ['assistant', 'intern', 'junior', 'entry level'],
      location: ['WORLD'],
      include_headline_search: true,
    },
  ];

  console.log(
    `[find-contacts] Blitz waterfall ICP search for ${companyLinkedInUrl} (max ${maxResults})`,
  );

  let blitzContacts: DiscoveredEmployee[] = [];

  try {
    const res = await waterfallIcpSearch(companyLinkedInUrl, cascade, maxResults);

    if (res.ok && res.data?.results?.length) {
      blitzContacts = res.data.results
        .filter((r) => r.person?.linkedin_url && isValidLinkedInProfileUrl(r.person.linkedin_url))
        .map((r) => blitzPersonToEmployee(r.person, companyName, parseInt(r.icp) || 1));

      console.log(`[find-contacts] Blitz waterfall found ${blitzContacts.length} contacts`);
    } else {
      console.warn(
        `[find-contacts] Blitz waterfall returned no results (ok=${res.ok}, error=${res.error || 'none'})`,
      );
    }
  } catch (err) {
    console.error(`[find-contacts] Blitz waterfall ICP search failed: ${err}`);
  }

  // Supplement with Employee Finder if waterfall returned too few
  if (blitzContacts.length < maxResults / 2) {
    console.log(`[find-contacts] Supplementing with Blitz Employee Finder...`);
    try {
      const efRes = await employeeFinder(
        companyLinkedInUrl,
        ['C-Team', 'VP', 'Director', 'Manager'],
        ['Sales & Business Development', 'Finance'],
        maxResults - blitzContacts.length,
      );

      if (efRes.ok && efRes.data?.results?.length) {
        const existingUrls = new Set(blitzContacts.map((c) => c.profileUrl.toLowerCase()));
        const supplementContacts = efRes.data.results
          .filter(
            (p) =>
              p.linkedin_url &&
              isValidLinkedInProfileUrl(p.linkedin_url) &&
              !existingUrls.has(p.linkedin_url.toLowerCase()),
          )
          .map((p) => blitzPersonToEmployee(p, companyName, 2));

        blitzContacts = [...blitzContacts, ...supplementContacts];
        console.log(
          `[find-contacts] Employee Finder added ${supplementContacts.length} contacts (total: ${blitzContacts.length})`,
        );
      }
    } catch (err) {
      console.warn(`[find-contacts] Blitz Employee Finder failed: ${err}`);
    }
  }

  // If Blitz found contacts, return them
  if (blitzContacts.length > 0) {
    return blitzContacts.slice(0, maxResults);
  }

  // FALLBACK: Blitz returned nothing — use Serper discovery
  console.log(`[find-contacts] Blitz returned 0 contacts, falling back to Serper discovery`);
  return discoverEmployeesViaSerper(companyName, domain, titleFilter, maxResults);
}

// ─── Serper-based discovery (BACKUP — used when Blitz fails) ────────────────

/**
 * Discover employees at a company via Serper Google search.
 * Uses a multi-layered search strategy:
 *   Layer 1: Domain + company name + role (most precise)
 *   Layer 2: Company name only + role (catches when domain guess is wrong)
 *   Layer 3: Company name variations + role (catches abbreviations/DBAs)
 *   Layer 4: Broader coverage queries (team pages, about pages)
 */
async function discoverEmployeesViaSerper(
  companyName: string,
  domain: string,
  titleFilter: string[],
  maxResults: number = 25,
): Promise<DiscoveredEmployee[]> {
  const companyDomain = domain || inferDomain(companyName);
  const excludeNoise = '-zoominfo -dnb -rocketreach -signalhire -apollo.io -indeed.com -glassdoor';
  const nameVariations = getCompanyNameVariations(companyName);

  const roleQueries: string[] = [];

  // ---- Core queries: Company name + role groups (5 queries cover all major titles) ----
  const domainHint = companyDomain ? `${companyDomain} ` : '';
  roleQueries.push(
    `${domainHint}"${companyName}" CEO founder president owner site:linkedin.com/in ${excludeNoise}`,
    `${domainHint}"${companyName}" partner principal "managing director" chairman site:linkedin.com/in ${excludeNoise}`,
    `"${companyName}" VP director "head of" site:linkedin.com/in ${excludeNoise}`,
    `"${companyName}" "business development" acquisitions CFO COO site:linkedin.com/in ${excludeNoise}`,
    `"${companyName}" "operating partner" "senior associate" analyst site:linkedin.com/in ${excludeNoise}`,
  );

  // ---- Layer 3: Company name variations (handles DBA names, abbreviations) ----
  for (const variation of nameVariations.slice(1)) {
    roleQueries.push(
      `"${variation}" CEO partner principal director site:linkedin.com/in ${excludeNoise}`,
    );
  }

  // ---- Layer 4: Title filter queries (batched to reduce API calls) ----
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

  // ---- Layer 5: Broader coverage ----
  roleQueries.push(
    `"${companyName}" team leadership site:linkedin.com/in ${excludeNoise}`,
    `"${companyName}" "works at" OR "working at" site:linkedin.com/in ${excludeNoise}`,
  );

  const uniqueQueries = [...new Set(roleQueries)];

  console.log(
    `[find-contacts] Running ${uniqueQueries.length} Serper queries for "${companyName}" (fallback)`,
  );

  const allResults: Array<{ title: string; url: string; description: string }> = [];

  for (const query of uniqueQueries) {
    try {
      const results = await googleSearch(query, 10);
      for (const r of results) {
        allResults.push(r);
      }
    } catch (err) {
      console.warn(
        `[find-contacts] Serper query failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`[find-contacts] Collected ${allResults.length} total search results`);

  // Build company match words from all name variations
  const allCompanyWords = new Set<string>();
  for (const variation of nameVariations) {
    for (const word of variation.toLowerCase().split(/\s+/)) {
      if (word.length > 2) allCompanyWords.add(word);
    }
  }

  // Extract contacts from LinkedIn results
  const contactMap = new Map<string, DiscoveredEmployee>();

  for (const result of allResults) {
    if (!isValidLinkedInProfileUrl(result.url)) continue;

    const parsed = parseLinkedInTitle(result.title);
    if (!parsed) continue;

    const combined = `${result.title} ${result.description}`.toLowerCase();
    const companyWordMatches = [...allCompanyWords].filter((w) => combined.includes(w));

    const parsedCompanyWords = (parsed.company || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const parsedCompanyMatches = parsedCompanyWords.filter((w) => allCompanyWords.has(w));

    const hasCompanyMatch =
      companyWordMatches.length > 0 ||
      parsedCompanyMatches.length > 0 ||
      combined.includes(companyDomain.toLowerCase().replace('.com', ''));

    if (!hasCompanyMatch) {
      continue;
    }

    let cleanUrl = result.url.split('?')[0];
    if (!cleanUrl.startsWith('https://')) {
      cleanUrl = cleanUrl.replace('http://', 'https://');
    }

    const slug = cleanUrl.split('/in/')[1]?.replace(/\/$/, '') || '';
    const dedupKey = slug || `${parsed.firstName.toLowerCase()}:${parsed.lastName.toLowerCase()}`;

    let confidence = 20;
    confidence += Math.min(companyWordMatches.length * 10, 30);
    if (parsedCompanyMatches.length > 0) confidence += 10;
    if (parsed.role) confidence += 20;
    if (
      /\b(CEO|CFO|COO|CTO|President|Founder|Owner|Chairman|Partner|Principal|Managing\s*Director)\b/i.test(
        parsed.role,
      )
    ) {
      confidence += 20;
    } else if (
      /\b(VP|Director|Manager|General\s*Manager|Head\s+of|Operating\s*Partner)\b/i.test(parsed.role)
    ) {
      confidence += 10;
    }

    const existing = contactMap.get(dedupKey);
    if (!existing || confidence > existing.confidence) {
      const title = parsed.role || existing?.title || '';
      contactMap.set(dedupKey, {
        fullName: `${parsed.firstName} ${parsed.lastName}`,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        title: title.length > (existing?.title?.length || 0) ? title : existing?.title || title,
        profileUrl: cleanUrl,
        companyName: companyName,
        confidence,
      });
    }
  }

  const results = Array.from(contactMap.values()).sort((a, b) => b.confidence - a.confidence);

  console.log(
    `[find-contacts] Discovered ${results.length} unique contacts for "${companyName}" via Serper (fallback)`,
  );

  return results.slice(0, maxResults);
}

// ---------- Clay batch enrichment (FALLBACK 1 — used when Blitz can't enrich) ----------

const CLAY_POLL_INTERVAL_MS = 3_000;
const CLAY_MAX_POLL_MS = 60_000;

/**
 * Send contacts to Clay for email lookup (non-blocking sends, returns request IDs).
 */
async function clayBatchSend(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  contacts: Array<{
    linkedinUrl?: string;
    firstName: string;
    lastName: string;
    domain: string;
    company: string;
    title: string;
  }>,
): Promise<string[]> {
  const requestIds: string[] = [];

  for (const params of contacts) {
    const linkedinUrl = params.linkedinUrl?.trim() || '';
    const firstName = params.firstName?.trim() || '';
    const lastName = params.lastName?.trim() || '';
    const domain = params.domain?.trim() || '';

    const hasLinkedIn = linkedinUrl.includes('linkedin.com/in/');
    const hasNameDomain = !!firstName && !!lastName && !!domain;
    if (!hasLinkedIn && !hasNameDomain) continue;

    const requestId = crypto.randomUUID();
    const requestType = hasLinkedIn ? 'linkedin' : 'name_domain';

    const { error: insertErr } = await supabase.from('clay_enrichment_requests').insert({
      request_id: requestId,
      request_type: requestType,
      status: 'pending',
      workspace_id: userId,
      first_name: firstName || null,
      last_name: lastName || null,
      domain: domain || null,
      linkedin_url: linkedinUrl || null,
      company_name: params.company || null,
      title: params.title || null,
      source_function: 'find_contacts',
      source_entity_id: null,
    });

    if (insertErr) {
      console.warn(`[clay-batch] Insert failed for ${firstName} ${lastName}: ${insertErr.message}`);
      continue;
    }

    // Fire Clay webhook (non-blocking)
    const sendFn = hasLinkedIn
      ? sendToClayLinkedIn({ requestId, linkedinUrl })
      : sendToClayNameDomain({ requestId, firstName, lastName, domain });

    sendFn
      .then((res) => {
        if (!res.success) console.warn(`[clay-batch] Webhook failed: ${res.error}`);
      })
      .catch((err) => console.error(`[clay-batch] Webhook error: ${err}`));

    requestIds.push(requestId);
  }

  return requestIds;
}

/**
 * Poll for batch Clay results — returns map of requestId → email.
 */
async function clayBatchPoll(
  supabase: ReturnType<typeof createClient>,
  requestIds: string[],
  maxWaitMs = CLAY_MAX_POLL_MS,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  if (requestIds.length === 0) return results;

  const pending = new Set(requestIds);
  const deadline = Date.now() + maxWaitMs;

  while (pending.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, CLAY_POLL_INTERVAL_MS));

    const { data: rows } = await supabase
      .from('clay_enrichment_requests')
      .select('request_id, status, result_email')
      .in('request_id', [...pending])
      .neq('status', 'pending');

    if (rows?.length) {
      for (const row of rows) {
        pending.delete(row.request_id);
        if (row.status === 'completed' && row.result_email) {
          results.set(row.request_id, row.result_email);
        }
      }
    }
  }

  return results;
}

function _deduplicateContacts<
  T extends { linkedin_url?: string; email?: string | null; full_name?: string; fullName?: string },
>(contacts: T[]): T[] {
  const seen = new Set<string>();
  return contacts.filter((c) => {
    const name = (c.full_name || c.fullName || '').toLowerCase();
    const linkedin = (c.linkedin_url || '').toLowerCase();
    const email = (c.email || '').toLowerCase();

    const key = linkedin || email || name;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const corsHeaders = getCorsHeaders(req);
  const startTime = Date.now();

  // Auth
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Allow service-role calls via x-internal-secret header
  const internalSecret = req.headers.get('x-internal-secret');
  const isServiceCall = internalSecret === supabaseServiceKey;

  let authUserId: string | undefined;
  if (!isServiceCall) {
    const auth = await requireAdmin(req, supabaseAdmin);
    if (!auth.authenticated || !auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error || 'Unauthorized' }), {
        status: auth.authenticated ? 403 : 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    authUserId = auth.userId;
  }
  // Provide a fallback auth object for downstream references
  const auth = { userId: authUserId || null };

  // Parse body
  let body: FindContactsRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!body.company_name?.trim()) {
    return new Response(JSON.stringify({ error: 'company_name is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const companyName = body.company_name.trim();
  const titleFilter = body.title_filter || [];
  const targetCount = body.target_count || 10;
  const errors: string[] = [];

  try {
    // 1. Check cache (results from last 7 days)
    const cacheKey = `${companyName}:${titleFilter.sort().join(',')}`.toLowerCase();
    const { data: cached } = await supabaseAdmin
      .from('contact_search_cache')
      .select('results')
      .eq('cache_key', cacheKey)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached?.results) {
      console.log(`[find-contacts] Cache hit for "${companyName}"`);

      // Log the search
      await supabaseAdmin.from('contact_search_log').insert({
        user_id: auth.userId,
        company_name: companyName,
        title_filter: titleFilter,
        results_count: cached.results.length,
        from_cache: true,
        duration_ms: Date.now() - startTime,
      });

      return new Response(
        JSON.stringify({
          contacts: cached.results,
          total_found: cached.results.length,
          total_enriched: cached.results.filter((c: { email?: string }) => c.email).length,
          from_cache: true,
          search_duration_ms: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Resolve company LinkedIn URL (NEW — Blitz domain-to-linkedin with Serper fallback)
    const { linkedinUrl: companyLinkedInUrl, domain: resolvedDomain } =
      await resolveCompanyLinkedInUrl(
        companyName,
        body.company_domain?.trim() || undefined,
        body.company_linkedin_url?.trim() || undefined,
      );

    const primaryDomain = resolvedDomain || body.company_domain?.trim() || inferDomain(companyName);
    const domainCandidates = [
      primaryDomain,
      ...inferDomainCandidates(companyName).filter((d) => d !== primaryDomain),
    ];

    // 3. Discover contacts — Blitz primary, Serper fallback
    let discovered: DiscoveredEmployee[] = [];
    try {
      discovered = await discoverContactsViaBlitz(
        companyLinkedInUrl,
        companyName,
        primaryDomain,
        titleFilter,
        Math.max(targetCount * 3, 30),
      );
    } catch (err) {
      console.error(`[find-contacts] Contact discovery failed: ${err}`);
      errors.push(`Contact discovery failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 4. Apply title filter
    let filtered = discovered;
    if (titleFilter.length > 0 && discovered.length > 0) {
      const titleFiltered = discovered.filter((e) => matchesTitle(e.title || '', titleFilter));
      if (titleFiltered.length > 0) {
        filtered = titleFiltered;
        console.log(`[find-contacts] Title filter: ${discovered.length} → ${filtered.length}`);
      }
    }

    // 5. CRM pre-check — skip contacts we already have email for
    const crmAlreadyKnown = new Set<string>();
    if (filtered.length > 0) {
      const linkedInUrls = filtered.map((d) => d.profileUrl?.toLowerCase()).filter(Boolean);

      if (linkedInUrls.length > 0) {
        const { data: existingByLinkedIn } = await supabaseAdmin
          .from('contacts')
          .select('linkedin_url')
          .eq('archived', false)
          .not('email', 'is', null);

        if (existingByLinkedIn?.length) {
          for (const c of existingByLinkedIn) {
            if (c.linkedin_url) {
              const norm = c.linkedin_url
                .toLowerCase()
                .replace('https://www.', '')
                .replace('https://', '')
                .replace('http://', '');
              if (
                linkedInUrls.some(
                  (u: string) =>
                    u.includes(norm) ||
                    norm.includes(u.replace('https://www.', '').replace('https://', '')),
                )
              ) {
                crmAlreadyKnown.add(c.linkedin_url.toLowerCase());
              }
            }
          }
        }
      }

      const { data: existingByName } = await supabaseAdmin
        .from('contacts')
        .select('first_name, last_name')
        .eq('archived', false)
        .not('email', 'is', null)
        .ilike('company_name', `%${companyName}%`);

      if (existingByName?.length) {
        for (const c of existingByName) {
          crmAlreadyKnown.add(
            `${(c.first_name || '').toLowerCase()}:${(c.last_name || '').toLowerCase()}`,
          );
        }
      }
    }

    // Filter out contacts already in CRM with email
    const needsEnrichment = filtered.filter((d) => {
      const normUrl = (d.profileUrl || '')
        .toLowerCase()
        .replace('https://www.', '')
        .replace('https://', '')
        .replace('http://', '');
      if (
        normUrl &&
        Array.from(crmAlreadyKnown).some((k) => k.includes(normUrl) || normUrl.includes(k))
      ) {
        return false;
      }
      const nameKey = `${d.firstName.toLowerCase()}:${d.lastName.toLowerCase()}`;
      if (crmAlreadyKnown.has(nameKey)) return false;
      return true;
    });

    const skippedFromCrm = filtered.length - needsEnrichment.length;
    if (skippedFromCrm > 0) {
      console.log(`[find-contacts] Skipped ${skippedFromCrm} contacts already in CRM with email`);
    }

    const toEnrich = needsEnrichment.slice(0, targetCount);

    // 6. PRIMARY: Blitz email + phone enrichment
    const blitzEnriched = new Map<string, { email: string | null; phone: string | null }>();
    const contactsWithLinkedIn = toEnrich.filter(
      (d) => d.profileUrl && isValidLinkedInProfileUrl(d.profileUrl),
    );

    if (contactsWithLinkedIn.length > 0) {
      console.log(
        `[find-contacts] Blitz enriching ${contactsWithLinkedIn.length} contacts (email + phone)...`,
      );
      try {
        const blitzResults = await batchEnrichContacts(
          contactsWithLinkedIn.map((d) => ({ linkedinUrl: d.profileUrl })),
          1, // concurrency — serialized to avoid Blitz rate limits
        );
        for (const [url, data] of blitzResults) {
          blitzEnriched.set(url, data);
        }
        const blitzEmailCount = [...blitzEnriched.values()].filter((v) => v.email).length;
        console.log(
          `[find-contacts] Blitz enriched ${blitzEmailCount}/${contactsWithLinkedIn.length} emails`,
        );
      } catch (err) {
        console.error(`[find-contacts] Blitz batch enrichment failed: ${err}`);
        errors.push(`Blitz enrichment failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Determine which contacts still need email after Blitz
    const stillNeedsEmailAfterBlitz = toEnrich.filter((d) => {
      const blitzData = blitzEnriched.get((d.profileUrl || '').toLowerCase());
      return !blitzData?.email;
    });

    // 7. FALLBACK 1: Clay batch email lookup for contacts Blitz couldn't enrich
    const clayEmailByLinkedIn = new Map<string, string>();
    if (stillNeedsEmailAfterBlitz.length > 0) {
      console.log(`[find-contacts] Clay fallback for ${stillNeedsEmailAfterBlitz.length} contacts`);
      const clayRequestIds = await clayBatchSend(
        supabaseAdmin,
        auth.userId!,
        stillNeedsEmailAfterBlitz.map((d) => ({
          linkedinUrl: d.profileUrl || undefined,
          firstName: d.firstName,
          lastName: d.lastName,
          domain: primaryDomain,
          company: companyName,
          title: d.title,
        })),
      );

      const requestToContact = new Map<string, DiscoveredEmployee>();
      for (let i = 0; i < Math.min(clayRequestIds.length, stillNeedsEmailAfterBlitz.length); i++) {
        requestToContact.set(clayRequestIds[i], stillNeedsEmailAfterBlitz[i]);
      }

      const clayEmails = await clayBatchPoll(supabaseAdmin, clayRequestIds);
      console.log(
        `[find-contacts] Clay returned ${clayEmails.size}/${clayRequestIds.length} emails`,
      );

      for (const [reqId, email] of clayEmails) {
        const contact = requestToContact.get(reqId);
        if (contact?.profileUrl) {
          clayEmailByLinkedIn.set(contact.profileUrl.toLowerCase(), email);
        }
      }
    }

    // Determine which contacts still need email after Clay
    const stillNeedsEmailAfterClay = stillNeedsEmailAfterBlitz.filter(
      (d) => !clayEmailByLinkedIn.has((d.profileUrl || '').toLowerCase()),
    );

    // 8. FALLBACK 2: Prospeo enrichment (last resort)
    let prospeoEnriched: Record<string, unknown>[] = [];
    if (stillNeedsEmailAfterClay.length > 0) {
      console.log(
        `[find-contacts] Prospeo fallback (last resort) for ${stillNeedsEmailAfterClay.length} contacts`,
      );
      try {
        prospeoEnriched = await batchEnrich(
          stillNeedsEmailAfterClay.map((e) => ({
            firstName: e.firstName || e.fullName?.split(' ')[0] || '',
            lastName: e.lastName || e.fullName?.split(' ').slice(1).join(' ') || '',
            linkedinUrl: e.profileUrl || undefined,
            domain: primaryDomain,
            title: e.title,
            company: companyName,
          })),
          3,
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('404')) {
          errors.push(`Prospeo enrichment failed (404): API endpoint may have changed.`);
        } else if (errMsg.includes('401') || errMsg.includes('403')) {
          errors.push(`Prospeo enrichment failed (auth): API key may be invalid or expired.`);
        } else {
          errors.push(`Prospeo enrichment failed: ${errMsg}`);
        }
      }

      // Domain search fallback — try multiple domain candidates
      if (prospeoEnriched.length < stillNeedsEmailAfterClay.length / 2) {
        for (const domainCandidate of domainCandidates.slice(0, 3)) {
          if (prospeoEnriched.length >= stillNeedsEmailAfterClay.length) break;
          try {
            const domainResults = await domainSearchEnrich(
              domainCandidate,
              stillNeedsEmailAfterClay.length - prospeoEnriched.length,
            );
            const filteredDomain =
              titleFilter.length > 0
                ? domainResults.filter((r) => matchesTitle(r.title, titleFilter))
                : domainResults;
            prospeoEnriched = [...prospeoEnriched, ...filteredDomain];
          } catch {
            /* non-critical — try next domain candidate */
          }
        }
      }
    }

    // Build final contacts — merge Blitz + Clay + Prospeo results + unenriched
    const contacts = [
      // Contacts with Blitz email/phone
      ...toEnrich
        .filter((d) => {
          const blitzData = blitzEnriched.get((d.profileUrl || '').toLowerCase());
          return blitzData?.email;
        })
        .map((d) => {
          const blitzData = blitzEnriched.get((d.profileUrl || '').toLowerCase())!;
          return {
            company_name: companyName,
            full_name: `${d.firstName} ${d.lastName}`.trim(),
            first_name: d.firstName,
            last_name: d.lastName,
            title: d.title || '',
            email: blitzData.email,
            phone: blitzData.phone,
            linkedin_url: d.profileUrl || '',
            confidence: 'high' as string,
            source: 'blitz',
            enriched_at: new Date().toISOString(),
            search_query: cacheKey,
          };
        }),
      // Contacts with Clay email
      ...toEnrich
        .filter((d) => clayEmailByLinkedIn.has((d.profileUrl || '').toLowerCase()))
        .map((d) => {
          // Also check if Blitz found a phone even if it didn't find email
          const blitzData = blitzEnriched.get((d.profileUrl || '').toLowerCase());
          return {
            company_name: companyName,
            full_name: `${d.firstName} ${d.lastName}`.trim(),
            first_name: d.firstName,
            last_name: d.lastName,
            title: d.title || '',
            email: clayEmailByLinkedIn.get((d.profileUrl || '').toLowerCase()) || null,
            phone: blitzData?.phone || null,
            linkedin_url: d.profileUrl || '',
            confidence: 'high' as string,
            source: 'clay',
            enriched_at: new Date().toISOString(),
            search_query: cacheKey,
          };
        }),
      // Contacts with Prospeo email
      ...prospeoEnriched.map((e: Record<string, unknown>) => ({
        company_name: companyName,
        full_name: `${e.first_name} ${e.last_name}`.trim(),
        first_name: e.first_name,
        last_name: e.last_name,
        title: (e.title as string) || '',
        email: e.email,
        phone: e.phone,
        linkedin_url: (e.linkedin_url as string) || '',
        confidence: (e.confidence as string) || 'low',
        source: (e.source as string) || 'prospeo',
        enriched_at: new Date().toISOString(),
        search_query: cacheKey,
      })),
    ];

    // Include unenriched contacts (no enrichment source found email)
    const enrichedLinkedIns = new Set(
      contacts.map((c) => c.linkedin_url?.toLowerCase()).filter(Boolean),
    );
    const unenriched = toEnrich
      .filter((d) => !enrichedLinkedIns.has(d.profileUrl?.toLowerCase()))
      .map((d) => {
        const blitzData = blitzEnriched.get((d.profileUrl || '').toLowerCase());
        return {
          company_name: companyName,
          full_name: `${d.firstName} ${d.lastName}`.trim(),
          first_name: d.firstName,
          last_name: d.lastName,
          title: d.title || '',
          email: null,
          phone: blitzData?.phone || null,
          linkedin_url: d.profileUrl || '',
          confidence: 'low' as const,
          source: 'blitz_discovery',
          enriched_at: new Date().toISOString(),
          search_query: cacheKey,
        };
      });

    const seenFinal = new Set<string>();
    const allContacts = [...contacts, ...unenriched]
      .filter((c) => {
        const key = (c.linkedin_url || c.email || c.full_name || '').toLowerCase();
        if (!key || seenFinal.has(key)) return false;
        seenFinal.add(key);
        return true;
      })
      .slice(0, targetCount);

    // 9. Save to enriched_contacts
    if (allContacts.length > 0) {
      const { error: insertErr } = await supabaseAdmin.from('enriched_contacts').upsert(
        allContacts.map((c) => ({
          ...c,
          workspace_id: auth.userId,
        })),
        { onConflict: 'workspace_id,linkedin_url', ignoreDuplicates: true },
      );

      if (insertErr) {
        console.error(`[find-contacts] DB insert error: ${insertErr.message}`);
        errors.push(`Save failed: ${insertErr.message}`);
      }
    }

    // 10. Cache results
    await supabaseAdmin.from('contact_search_cache').insert({
      cache_key: cacheKey,
      company_name: companyName,
      results: allContacts,
    });

    // 11. Log the search
    await supabaseAdmin.from('contact_search_log').insert({
      user_id: auth.userId,
      company_name: companyName,
      title_filter: titleFilter,
      results_count: allContacts.length,
      from_cache: false,
      duration_ms: Date.now() - startTime,
    });

    const duration = Date.now() - startTime;
    console.log(`[find-contacts] Done: ${allContacts.length} contacts in ${duration}ms`);

    return new Response(
      JSON.stringify({
        contacts: allContacts,
        total_found: allContacts.length,
        total_enriched: contacts.length,
        skipped_already_in_crm: skippedFromCrm,
        from_cache: false,
        search_duration_ms: duration,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error(`[find-contacts] Unhandled error: ${err}`);
    return new Response(
      JSON.stringify({
        error: `Contact search failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
