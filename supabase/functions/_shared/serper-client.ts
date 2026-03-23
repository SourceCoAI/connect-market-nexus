/**
 * Serper.dev Google Search & Maps Client
 *
 * Replaces Apify Google Search Scraper and Firecrawl /v1/search for:
 * - Web search (company discovery, LinkedIn URL finding)
 * - Google Maps/Places data (ratings, reviews, addresses)
 *
 * Synchronous API — no polling required. Typical response in 1-2s.
 */

const SERPER_BASE = 'https://google.serper.dev';

export interface GoogleSearchItem {
  title: string;
  url: string;
  description: string;
  position: number;
}

export interface GoogleMapsPlace {
  title?: string;
  rating?: number;
  ratingCount?: number;
  address?: string;
  phoneNumber?: string;
  website?: string;
  category?: string;
  placeId?: string;
  cid?: string;
  latitude?: number;
  longitude?: number;
}

function getApiKey(): string {
  const apiKey = Deno.env.get('SERPER_API_KEY');
  if (!apiKey) throw new Error('SERPER_API_KEY not configured');
  return apiKey;
}

/**
 * Execute a Google search via Serper and return organic results.
 * @param query  Search query string
 * @param maxResults  Maximum results to return (default 10)
 */
export async function googleSearch(
  query: string,
  maxResults: number = 10,
): Promise<GoogleSearchItem[]> {
  const apiKey = getApiKey();

  const response = await fetch(`${SERPER_BASE}/search`, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      num: maxResults,
      gl: 'us',
      hl: 'en',
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Serper search failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const organic = data.organic || [];

  return organic
    .slice(0, maxResults)
    .map((r: { title?: string; link?: string; snippet?: string; position?: number }) => ({
      title: r.title || '',
      url: r.link || '',
      description: r.snippet || '',
      position: r.position || 0,
    }));
}

/**
 * Find a company's LinkedIn URL via Google search.
 */
export async function findCompanyLinkedIn(companyName: string): Promise<string | null> {
  const results = await googleSearch(`${companyName} site:linkedin.com/company`, 3);

  for (const result of results) {
    if (result.url.includes('linkedin.com/company/')) {
      return result.url;
    }
  }

  return null;
}

/**
 * Discover a company's real website domain via Google search.
 * Phase 1 of contact discovery — find the actual domain before searching for people.
 *
 * Strategy:
 *  1. Search Google for the company name — top results usually include the company website
 *  2. Extract domains from organic results that look like company websites
 *  3. Cross-check against inferred domain candidates for confidence
 *  4. Return the best domain found, or null if nothing convincing
 */
export async function discoverCompanyDomain(
  companyName: string,
  inferredCandidates: string[] = [],
): Promise<{ domain: string; source: 'google_search' | 'linkedin' | 'inferred'; confidence: 'high' | 'medium' | 'low' } | null> {
  // Clean company name for search (remove parentheticals, trailing dots)
  const cleanName = companyName.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\.{3,}$/, '').trim();

  // Run two targeted searches in parallel
  const queries = [
    `"${cleanName}" official website`,
    `${cleanName} private equity firm`,
  ];

  const allResults: GoogleSearchItem[] = [];
  for (const query of queries) {
    try {
      const results = await googleSearch(query, 5);
      allResults.push(...results);
    } catch (err) {
      console.warn(`[domain-discovery] Search failed for "${query}": ${err}`);
    }
  }

  if (allResults.length === 0) return null;

  // Extract domains from results, excluding known noise sites
  const noiseDomains = new Set([
    'linkedin.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com',
    'youtube.com', 'wikipedia.org', 'crunchbase.com', 'bloomberg.com',
    'pitchbook.com', 'zoominfo.com', 'dnb.com', 'apollo.io', 'rocketreach.com',
    'glassdoor.com', 'indeed.com', 'yelp.com', 'bbb.org', 'sec.gov',
    'google.com', 'yahoo.com', 'bing.com', 'reddit.com', 'quora.com',
    'signalhire.com', 'owler.com', 'ziprecruiter.com', 'comparably.com',
    'ambitionbox.com', 'levelsfyi.com', 'wellfound.com',
  ]);

  // Score each domain candidate from search results
  const domainScores = new Map<string, { score: number; url: string }>();
  const companyWords = cleanName.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  for (const result of allResults) {
    let hostname: string;
    try {
      hostname = new URL(result.url).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }

    // Skip noise domains
    if (noiseDomains.has(hostname)) continue;
    // Skip subdomains of noise sites
    if ([...noiseDomains].some(nd => hostname.endsWith(`.${nd}`))) continue;

    let score = 0;

    // High position in results = more likely to be the company site
    if (result.position <= 2) score += 3;
    else if (result.position <= 5) score += 1;

    // Domain name contains company words
    const domainLower = hostname.toLowerCase();
    for (const word of companyWords) {
      if (domainLower.includes(word)) score += 2;
    }

    // Title/description contains company name
    const combined = `${result.title} ${result.description}`.toLowerCase();
    if (combined.includes(cleanName.toLowerCase())) score += 2;

    // Matches one of our inferred candidates — strong signal
    if (inferredCandidates.includes(hostname)) score += 5;

    // Looks like a corporate site (short domain, .com)
    if (hostname.endsWith('.com') && hostname.split('.').length === 2) score += 1;

    const existing = domainScores.get(hostname);
    if (!existing || score > existing.score) {
      domainScores.set(hostname, { score, url: result.url });
    }
  }

  // Also check if the LinkedIn company page mentions a website
  // (LinkedIn results often appear even when filtered out above)
  for (const result of allResults) {
    if (!result.url.includes('linkedin.com/company/')) continue;
    // LinkedIn company description sometimes includes the website domain
    const desc = result.description.toLowerCase();
    for (const candidate of inferredCandidates) {
      if (desc.includes(candidate)) {
        const existing = domainScores.get(candidate);
        domainScores.set(candidate, { score: (existing?.score || 0) + 4, url: result.url });
      }
    }
  }

  if (domainScores.size === 0) return null;

  // Pick the highest-scoring domain
  const sorted = [...domainScores.entries()].sort((a, b) => b[1].score - a[1].score);
  const [bestDomain, bestInfo] = sorted[0];

  const confidence = bestInfo.score >= 6 ? 'high' : bestInfo.score >= 3 ? 'medium' : 'low';

  console.log(
    `[domain-discovery] "${cleanName}" → ${bestDomain} (score=${bestInfo.score}, confidence=${confidence}, candidates=${sorted.length})`,
  );

  return { domain: bestDomain, source: 'google_search', confidence };
}

/**
 * Search Google Maps for a business and return place data.
 * Uses Serper /maps endpoint which returns placeId, rating, reviews, address, etc.
 */
export async function searchGoogleMaps(query: string): Promise<GoogleMapsPlace | null> {
  const apiKey = getApiKey();

  const response = await fetch(`${SERPER_BASE}/maps`, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: 1 }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Serper maps failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const places = data.places || [];
  if (places.length === 0) return null;

  const p = places[0];
  return {
    title: p.title,
    rating: p.rating,
    ratingCount: p.ratingCount,
    address: p.address,
    phoneNumber: p.phoneNumber,
    website: p.website,
    category: p.type || (p.types && p.types[0]) || undefined,
    placeId: p.placeId,
    cid: p.cid,
    latitude: p.latitude,
    longitude: p.longitude,
  };
}

/**
 * Parse a US address string into city, state, and postal code components.
 * Handles formats like "123 Main St, Dallas, TX 75201" and "Dallas, TX".
 */
export function parseAddress(fullAddress: string): {
  city?: string;
  state?: string;
  postalCode?: string;
} {
  if (!fullAddress) return {};

  const cleaned = fullAddress.replace(/,?\s*United States\s*$/i, '').trim();
  const parts = cleaned.split(',').map((s) => s.trim());

  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1];

    // Match "TX 75201" or "TX 75201-1234"
    const stateZipMatch = lastPart.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (stateZipMatch) {
      return {
        city: parts[parts.length - 2],
        state: stateZipMatch[1],
        postalCode: stateZipMatch[2],
      };
    }

    // Match just "TX"
    const stateMatch = lastPart.match(/^([A-Z]{2})$/);
    if (stateMatch) {
      return {
        city: parts[parts.length - 2],
        state: stateMatch[1],
      };
    }
  }

  return {};
}
