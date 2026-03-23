/**
 * Integration Tools — Shared Types, Constants & Helpers
 *
 * Common utilities used across multiple integration tool files:
 * title matching, LinkedIn profile scoring/validation, Google-based
 * LinkedIn discovery, and decision-maker discovery via Serper.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
export type SupabaseClient = ReturnType<typeof createClient>;
export type { ClaudeTool } from '../../../_shared/claude-client.ts';
export type { ToolResult } from '../index.ts';

export { inferDomain, inferDomainCandidates } from '../../../_shared/domain-utils.ts';
export { batchEnrich, domainSearchEnrich, enrichContact } from '../../../_shared/prospeo-client.ts';
export { googleSearch } from '../../../_shared/serper-client.ts';

// Re-import locally for use in this file's helper functions
import { inferDomain } from '../../../_shared/domain-utils.ts';
import { googleSearch } from '../../../_shared/serper-client.ts';

// ---------- Title matching (shared with find-contacts) ----------

export const TITLE_ALIASES: Record<string, string[]> = {
  associate: ['associate', 'sr associate', 'senior associate', 'investment associate', 'investment professional'],
  principal: ['principal', 'sr principal', 'senior principal', 'investment principal'],
  vp: ['vp', 'vice president', 'vice-president', 'svp', 'senior vice president', 'evp',
    'executive vice president', 'vp of operations', 'vp operations', 'vp finance',
    'vp business development', 'vp strategy', 'vp corporate development'],
  director: [
    'director', 'managing director', 'sr director', 'senior director', 'associate director',
    'director of operations', 'director of finance', 'director of business development',
    'director of acquisitions', 'director of strategy', 'executive director',
  ],
  partner: ['partner', 'managing partner', 'general partner', 'senior partner',
    'operating partner', 'venture partner', 'founding partner', 'equity partner'],
  analyst: ['analyst', 'sr analyst', 'senior analyst', 'investment analyst'],
  ceo: ['ceo', 'chief executive officer', 'president', 'owner', 'founder', 'co-founder',
    'chief executive', 'managing member', 'general manager', 'gm'],
  cfo: ['cfo', 'chief financial officer', 'head of finance', 'finance director',
    'vp finance', 'controller', 'treasurer'],
  coo: ['coo', 'chief operating officer', 'head of operations', 'operations director',
    'vp operations'],
  bd: [
    'business development', 'corp dev', 'corporate development',
    'head of acquisitions', 'vp acquisitions', 'vp m&a', 'head of m&a',
    'director of acquisitions', 'acquisitions', 'deal origination',
    'deal sourcing', 'investment origination', 'business development officer',
    'bdo', 'head of growth', 'vp growth', 'chief development officer',
    'chief business development officer', 'chief growth officer',
  ],
  operating_partner: ['operating partner', 'operating executive', 'operating advisor',
    'senior operating partner', 'executive in residence', 'eir',
    'operating principal', 'portfolio operations'],
  senior_associate: ['senior associate', 'sr associate', 'investment associate'],
};

export function matchesTitle(title: string, filters: string[]): boolean {
  const normalized = title.toLowerCase().trim();
  for (const filter of filters) {
    const f = filter.toLowerCase().trim();
    if (normalized.includes(f)) return true;
    const aliases = TITLE_ALIASES[f];
    if (aliases) {
      for (const alias of aliases) {
        if (normalized.includes(alias)) return true;
      }
    }
  }
  return false;
}

// ---------- LinkedIn verification helpers ----------

/**
 * Score a Google search result for LinkedIn profile matching.
 * Higher score = more likely to be the correct person.
 */
export function scoreLinkedInResult(
  result: { title: string; url: string; description: string },
  firstName: string,
  lastName: string,
  companyName: string,
  title: string,
): number {
  let score = 0;
  const rTitle = result.title.toLowerCase();
  const rDesc = result.description.toLowerCase();
  const combined = `${rTitle} ${rDesc}`;
  const fName = firstName.toLowerCase();
  const lName = lastName.toLowerCase();

  // Name match in title (highest signal)
  if (rTitle.includes(fName) && rTitle.includes(lName)) score += 40;
  else if (combined.includes(fName) && combined.includes(lName)) score += 20;

  // Company match
  if (companyName) {
    const compWords = companyName
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const matched = compWords.filter((w) => combined.includes(w));
    score += Math.min(matched.length * 10, 30);
    // Bonus for near-exact company match
    if (combined.includes(companyName.toLowerCase())) score += 10;
  }

  // Title/role match
  if (title) {
    const titleWords = title
      .toLowerCase()
      .split(/[\s,/]+/)
      .filter((w) => w.length > 2);
    const matched = titleWords.filter((w) => combined.includes(w));
    score += Math.min(matched.length * 5, 15);
  }

  // LinkedIn slug contains name parts (bonus)
  const slug = result.url.split('/in/')[1]?.split(/[/?#]/)[0] || '';
  if (slug && slug.includes(fName) && slug.includes(lName.replace(/\s/g, ''))) score += 10;

  return score;
}

/**
 * Validate that a Prospeo enrichment result matches the expected person.
 * Used to detect stale/wrong LinkedIn URLs stored in CRM records.
 */
export function validateProspeoResult(
  result: { first_name: string; last_name: string; company: string },
  expectedFirstName: string,
  expectedLastName: string,
  expectedCompany: string,
): { valid: boolean; nameMatch: boolean; companyMatch: boolean; details: string } {
  const fNameMatch =
    result.first_name.toLowerCase() === expectedFirstName.toLowerCase() ||
    (expectedFirstName.length >= 3 &&
      result.first_name.toLowerCase().startsWith(expectedFirstName.toLowerCase().substring(0, 3)));
  const lNameMatch = result.last_name.toLowerCase() === expectedLastName.toLowerCase();
  const nameMatch = fNameMatch && lNameMatch;

  let companyMatch = false;
  if (expectedCompany && result.company) {
    const pCompany = result.company.toLowerCase();
    const eCompany = expectedCompany.toLowerCase();
    if (pCompany.includes(eCompany) || eCompany.includes(pCompany)) {
      companyMatch = true;
    } else {
      const eWords = eCompany.split(/\s+/).filter((w) => w.length > 3);
      if (eWords.length > 0) {
        const matched = eWords.filter((w) => pCompany.includes(w));
        companyMatch = matched.length >= Math.ceil(eWords.length * 0.4);
      }
    }
  }

  // Valid if name matches OR company matches (person may have changed companies)
  const valid = nameMatch || companyMatch;
  const details = `name: ${nameMatch ? 'match' : 'mismatch'} (got "${result.first_name} ${result.last_name}"), company: ${companyMatch ? 'match' : 'mismatch'} (got "${result.company}")`;

  return { valid, nameMatch, companyMatch, details };
}

/**
 * Validate a LinkedIn URL is a real personal profile (not company, posts, etc.)
 * Mirrors the validation logic from the decision_makers_finder tool.
 */
export function isValidLinkedInProfileUrl(url: string): boolean {
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
 * Discover a LinkedIn profile URL via Google search with intelligent scoring.
 * Inspired by the decision_makers_finder tool patterns:
 * - Uses domain in queries for precision (like "{domain} {company} CEO")
 * - Excludes noisy aggregator sites (-zoominfo -dnb)
 * - Tries multiple search strategies from most specific to broadest
 * - Role-specific queries when title is available
 * Returns null if no confident match is found.
 */
export async function discoverLinkedInUrl(
  firstName: string,
  lastName: string,
  companyName: string,
  title: string,
  domain?: string,
): Promise<{ url: string; score: number; verification: string[] } | null> {
  const fullName = `${firstName} ${lastName}`.trim();
  if (!fullName) return null;

  // Noise exclusion: filter out aggregator sites that return stale/wrong data
  const excludeNoise = '-zoominfo -dnb -rocketreach -signalhire -apollo.io';

  // Infer domain from company name if not provided
  const companyDomain = domain || (companyName ? inferDomain(companyName) : '');

  // Build multiple search queries from most specific to broadest
  const queries: string[] = [];

  if (companyName) {
    // Strategy 1: domain + quoted name + site restriction (most precise, like decision_makers_finder)
    if (companyDomain) {
      queries.push(`${companyDomain} "${fullName}" site:linkedin.com/in ${excludeNoise}`);
    }

    // Strategy 2: quoted name + quoted company + site restriction
    queries.push(`"${fullName}" "${companyName}" site:linkedin.com/in ${excludeNoise}`);

    // Strategy 3: role-specific if we have a title (like CEO/Founder/President queries in decision_makers_finder)
    if (title) {
      const roleKeywords = title
        .split(/[\s,/&]+/)
        .filter((w) => w.length > 2)
        .slice(0, 2)
        .join(' ');
      if (roleKeywords) {
        queries.push(
          `"${fullName}" "${companyName}" ${roleKeywords} site:linkedin.com/in ${excludeNoise}`,
        );
      }
    }

    // Strategy 4: partial company match (core words) + site restriction
    const coreWords = companyName
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 2)
      .join(' ');
    if (coreWords && coreWords.toLowerCase() !== companyName.toLowerCase()) {
      queries.push(`"${fullName}" ${coreWords} site:linkedin.com/in ${excludeNoise}`);
    }

    // Strategy 5: without site restriction (catches non-standard LinkedIn URLs)
    queries.push(`"${fullName}" "${companyName}" linkedin ${excludeNoise}`);
  }

  if (title && !companyName) {
    queries.push(`"${fullName}" ${title} site:linkedin.com/in ${excludeNoise}`);
  }

  // Broadest: just the name
  if (queries.length === 0) {
    queries.push(`"${fullName}" site:linkedin.com/in ${excludeNoise}`);
  }

  let bestMatch: { url: string; score: number; verification: string[] } | null = null;

  for (const query of queries) {
    try {
      const results = await googleSearch(query, 5);
      const linkedInResults = results.filter((r) => isValidLinkedInProfileUrl(r.url));

      for (const result of linkedInResults) {
        const score = scoreLinkedInResult(result, firstName, lastName, companyName, title);
        if (score > (bestMatch?.score || 0)) {
          const verification: string[] = [];
          const rLower = `${result.title} ${result.description}`.toLowerCase();

          if (
            result.title.toLowerCase().includes(firstName.toLowerCase()) &&
            result.title.toLowerCase().includes(lastName.toLowerCase())
          ) {
            verification.push('Name confirmed in title');
          }
          if (companyName) {
            const compWords = companyName
              .toLowerCase()
              .split(/\s+/)
              .filter((w) => w.length > 2);
            const matched = compWords.filter((w) => rLower.includes(w));
            if (matched.length > 0) {
              verification.push(`Company keywords matched (${matched.join(', ')})`);
            }
          }
          if (title) {
            const titleWords = title
              .toLowerCase()
              .split(/[\s,/]+/)
              .filter((w) => w.length > 2);
            if (titleWords.some((w) => rLower.includes(w))) {
              verification.push('Title keywords matched');
            }
          }

          let cleanUrl = result.url.split('?')[0];
          if (!cleanUrl.startsWith('https://')) {
            cleanUrl = cleanUrl.replace('http://', 'https://');
          }
          bestMatch = { url: cleanUrl, score, verification };
        }
      }

      // Strong match found — no need for more queries
      if (bestMatch && bestMatch.score >= 50) break;
    } catch {
      // Continue to next query
    }
  }

  // Minimum score threshold
  return bestMatch && bestMatch.score >= 20 ? bestMatch : null;
}

// ---------- Serper-based decision maker discovery ----------

export interface DiscoveredContact {
  first_name: string;
  last_name: string;
  title: string;
  linkedin_url: string;
  source_url: string;
  confidence: number;
}

/**
 * Parse a LinkedIn search result title into structured contact data.
 * LinkedIn titles follow patterns like:
 *   "Ryan Brown - President at Essential Benefit Administrators | LinkedIn"
 *   "John Smith - CEO & Founder at Acme Corp | LinkedIn"
 *   "Jane Doe | LinkedIn"
 */
export function parseLinkedInTitle(resultTitle: string): {
  firstName: string;
  lastName: string;
  role: string;
  company: string;
} | null {
  // Strip LinkedIn suffix
  const cleaned = resultTitle.replace(/\s*[|·–—-]\s*LinkedIn\s*$/i, '').trim();
  if (!cleaned) return null;

  // Split on dash: "Name - Role at Company" or "Name - Company"
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
      // Could be just a company name or just a role
      const looksLikeRole =
        /\b(CEO|CFO|COO|CTO|VP|President|Founder|Owner|Partner|Director|Manager|Chairman|Principal)\b/i;
      if (looksLikeRole.test(rest)) {
        role = rest;
      } else {
        company = rest;
      }
    }
  }

  return { firstName, lastName, role, company };
}

/**
 * Discover decision makers and key contacts at a company via Google search.
 * Replaces Apify LinkedIn employee scraping with faster, more reliable Serper-based discovery.
 *
 * Uses the same strategy as the decision_makers_finder tool:
 * - Multiple role-specific search queries
 * - Domain-based searches for precision
 * - Parse LinkedIn profile titles for structured data
 * - Score and deduplicate results
 */
export async function discoverDecisionMakers(
  companyName: string,
  domain?: string,
  titleFilter?: string[],
  maxResults: number = 25,
): Promise<DiscoveredContact[]> {
  const companyDomain = domain || inferDomain(companyName);
  const excludeNoise = '-zoominfo -dnb -rocketreach -signalhire -apollo.io';

  // Role-specific search queries (like decision_makers_finder)
  const roleQueries = [
    `${companyDomain} "${companyName}" CEO owner founder site:linkedin.com/in ${excludeNoise}`,
    `${companyDomain} "${companyName}" president chairman site:linkedin.com/in ${excludeNoise}`,
    `${companyDomain} "${companyName}" partner principal site:linkedin.com/in ${excludeNoise}`,
    `${companyDomain} "${companyName}" VP director site:linkedin.com/in ${excludeNoise}`,
    `"${companyName}" contact email ${excludeNoise}`,
  ];

  // Add targeted queries for specific title filters
  if (titleFilter?.length) {
    for (const tf of titleFilter) {
      roleQueries.push(
        `${companyDomain} "${companyName}" ${tf} site:linkedin.com/in ${excludeNoise}`,
      );
    }
  }

  // Also try without site restriction for broader coverage
  roleQueries.push(`${companyDomain} "${companyName}" leadership team ${excludeNoise}`);

  console.log(
    `[discover-decision-makers] Running ${roleQueries.length} Serper queries for "${companyName}"`,
  );

  // Run all queries and collect results
  const allResults: Array<{ title: string; url: string; description: string; query: string }> = [];

  for (const query of roleQueries) {
    try {
      const results = await googleSearch(query, 10);
      for (const r of results) {
        allResults.push({ ...r, query });
      }
    } catch (err) {
      console.warn(
        `[discover-decision-makers] Query failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`[discover-decision-makers] Collected ${allResults.length} total search results`);

  // Extract contacts from LinkedIn results
  const contactMap = new Map<string, DiscoveredContact>();

  for (const result of allResults) {
    // Only process valid LinkedIn profile URLs
    if (!isValidLinkedInProfileUrl(result.url)) continue;

    const parsed = parseLinkedInTitle(result.title);
    if (!parsed) continue;

    // Verify this person is actually associated with the target company
    const combined = `${result.title} ${result.description}`.toLowerCase();
    const compWords = companyName
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const companyWordMatches = compWords.filter((w) => combined.includes(w));

    // Require at least one company word match, or the domain appears in results
    if (companyWordMatches.length === 0 && !combined.includes(companyDomain.toLowerCase())) {
      continue;
    }

    // Clean the LinkedIn URL
    let cleanUrl = result.url.split('?')[0];
    if (!cleanUrl.startsWith('https://')) {
      cleanUrl = cleanUrl.replace('http://', 'https://');
    }

    // Dedup key: lowercase name
    const dedupKey = `${parsed.firstName.toLowerCase()}:${parsed.lastName.toLowerCase()}`;

    // Score this contact
    let confidence = 0;
    // Name found
    confidence += 20;
    // Company match strength
    confidence += Math.min(companyWordMatches.length * 15, 30);
    // Has a role/title
    if (parsed.role) confidence += 20;
    // Role is a decision-maker title
    if (
      /\b(CEO|CFO|COO|CTO|President|Founder|Owner|Chairman|Partner|Principal)\b/i.test(parsed.role)
    ) {
      confidence += 20;
    } else if (/\b(VP|Director|Manager|General\s*Manager)\b/i.test(parsed.role)) {
      confidence += 10;
    }

    const existing = contactMap.get(dedupKey);
    if (!existing || confidence > existing.confidence) {
      // Keep the more specific title if same person appears multiple times
      const title = parsed.role || existing?.title || '';
      contactMap.set(dedupKey, {
        first_name: parsed.firstName,
        last_name: parsed.lastName,
        title: title.length > (existing?.title?.length || 0) ? title : existing?.title || title,
        linkedin_url: cleanUrl,
        source_url: result.url,
        confidence,
      });
    }
  }

  // Sort by confidence (highest first) and limit
  let results = Array.from(contactMap.values()).sort((a, b) => b.confidence - a.confidence);

  // Apply title filter if specified
  if (titleFilter?.length) {
    const filtered = results.filter((c) => matchesTitle(c.title, titleFilter));
    // If filter produced results, use them; otherwise keep all (filter might be too narrow)
    if (filtered.length > 0) results = filtered;
  }

  console.log(
    `[discover-decision-makers] Found ${results.length} unique contacts for "${companyName}"`,
  );

  return results.slice(0, maxResults);
}

// ---------- LinkedIn match interface (used by find_contact_linkedin) ----------

export interface LinkedInMatch {
  contact_id: string;
  contact_name: string;
  contact_title: string;
  company_name: string;
  linkedin_url: string | null;
  confidence: 'high' | 'medium' | 'low';
  verification: string[];
  search_query: string;
  updated: boolean;
}
