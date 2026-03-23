/**
 * Prospeo Email Enrichment Client
 *
 * 3-step waterfall enrichment strategy:
 *   1. LinkedIn profile lookup (highest confidence)
 *   2. Name + domain lookup (medium confidence)
 *   3. Domain search fallback (lower confidence)
 *
 * Includes batch processing with concurrency control.
 * Security: timeouts, rate limit handling, domain validation, response validation.
 */

const PROSPEO_API_BASE = 'https://api.prospeo.io';
const API_TIMEOUT_MS = 10_000; // 10 second timeout per API call
const RATE_LIMIT_BACKOFF_MS = 5_000; // 5 second backoff on 429

interface ProspeoLinkedInResult {
  email: string | null;
  first_name: string;
  last_name: string;
  company: string;
  title: string;
  phone: string | null;
}

interface ProspeoNameResult {
  email: string | null;
  confidence: number;
}

interface ProspeoSearchResult {
  email: string;
  first_name: string;
  last_name: string;
  title: string;
  linkedin_url: string;
  phone: string | null;
}

export interface EnrichmentResult {
  email: string | null;
  phone: string | null;
  first_name: string;
  last_name: string;
  company: string;
  title: string;
  linkedin_url: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'linkedin_lookup' | 'name_domain' | 'domain_search';
}

function getApiKey(): string {
  const key = Deno.env.get('PROSPEO_API_KEY');
  if (!key) throw new Error('PROSPEO_API_KEY not configured');
  return key;
}

/**
 * Validate that a domain string is a plausible domain (no path injection, no protocol).
 */
function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  // Must look like a domain: alphanumeric, hyphens, dots, no spaces or special chars
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(
    domain,
  );
}

/**
 * Validate that a Prospeo API response has the expected structure.
 */
function isValidLinkedInResponse(data: unknown): data is { response: ProspeoLinkedInResult } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (!d.response || typeof d.response !== 'object') return false;
  return true;
}

function isValidNameResponse(data: unknown): data is { response: ProspeoNameResult } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (!d.response || typeof d.response !== 'object') return false;
  return true;
}

function isValidSearchResponse(data: unknown): data is { response: ProspeoSearchResult[] } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (!d.response) return false;
  // response can be an array or null
  if (d.response !== null && !Array.isArray(d.response)) return false;
  return true;
}

/**
 * Fetch wrapper with timeout and rate limit handling.
 */
async function prospeoFetch(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    // Handle rate limiting (429) with backoff
    if (res.status === 429) {
      console.warn(`[prospeo] Rate limited (429), backing off ${RATE_LIMIT_BACKOFF_MS}ms`);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_BACKOFF_MS));
      // Retry once after backoff
      const retryRes = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      return retryRes;
    }

    return res;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[prospeo] API call timed out after ${API_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Step 1: LinkedIn profile lookup — highest confidence.
 */
async function lookupByLinkedIn(linkedinUrl: string): Promise<EnrichmentResult | null> {
  try {
    const res = await prospeoFetch(`${PROSPEO_API_BASE}/linkedin-email-finder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KEY': getApiKey(),
      },
      body: JSON.stringify({ url: linkedinUrl }),
    });

    if (!res.ok) {
      console.warn(`[prospeo] LinkedIn lookup failed: ${res.status}`);
      return null;
    }

    const data: unknown = await res.json();
    if (!isValidLinkedInResponse(data)) {
      console.warn('[prospeo] Invalid LinkedIn lookup response shape');
      return null;
    }

    const r = data.response;
    if (!r?.email) return null;

    return {
      email: r.email,
      phone: r.phone || null,
      first_name: r.first_name || '',
      last_name: r.last_name || '',
      company: r.company || '',
      title: r.title || '',
      linkedin_url: linkedinUrl,
      confidence: 'high',
      source: 'linkedin_lookup',
    };
  } catch (err) {
    console.warn(
      `[prospeo] LinkedIn lookup error: ${err instanceof Error ? err.message : 'unknown'}`,
    );
    return null;
  }
}

/**
 * Step 2: Name + domain lookup — medium confidence.
 */
async function lookupByNameDomain(
  firstName: string,
  lastName: string,
  domain: string,
): Promise<EnrichmentResult | null> {
  // Validate domain before sending to API
  if (!isValidDomain(domain)) {
    console.warn(`[prospeo] Invalid domain skipped: ${domain}`);
    return null;
  }

  try {
    const res = await prospeoFetch(`${PROSPEO_API_BASE}/email-finder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KEY': getApiKey(),
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        company: domain,
      }),
    });

    if (!res.ok) {
      console.warn(`[prospeo] Name+domain lookup failed: ${res.status}`);
      return null;
    }

    const data: unknown = await res.json();
    if (!isValidNameResponse(data)) {
      console.warn('[prospeo] Invalid name+domain response shape');
      return null;
    }

    const r = data.response;
    if (!r?.email) return null;

    return {
      email: r.email,
      phone: null,
      first_name: firstName,
      last_name: lastName,
      company: domain,
      title: '',
      linkedin_url: '',
      confidence: r.confidence > 80 ? 'medium' : 'low',
      source: 'name_domain',
    };
  } catch (err) {
    console.warn(
      `[prospeo] Name+domain lookup error: ${err instanceof Error ? err.message : 'unknown'}`,
    );
    return null;
  }
}

/**
 * Step 3: Domain search fallback — lower confidence, discovers contacts.
 */
async function searchByDomain(domain: string, limit: number = 10): Promise<EnrichmentResult[]> {
  // Validate domain before sending to API
  if (!isValidDomain(domain)) {
    console.warn(`[prospeo] Invalid domain skipped for search: ${domain}`);
    return [];
  }

  try {
    const res = await prospeoFetch(`${PROSPEO_API_BASE}/domain-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KEY': getApiKey(),
      },
      body: JSON.stringify({ company: domain, limit }),
    });

    if (!res.ok) {
      console.warn(`[prospeo] Domain search failed: ${res.status}`);
      return [];
    }

    const data: unknown = await res.json();
    if (!isValidSearchResponse(data)) {
      console.warn('[prospeo] Invalid domain search response shape');
      return [];
    }

    return (data.response || []).map((r) => ({
      email: r.email,
      phone: r.phone || null,
      first_name: r.first_name || '',
      last_name: r.last_name || '',
      company: domain,
      title: r.title || '',
      linkedin_url: r.linkedin_url || '',
      confidence: 'low' as const,
      source: 'domain_search' as const,
    }));
  } catch (err) {
    console.warn(
      `[prospeo] Domain search error: ${err instanceof Error ? err.message : 'unknown'}`,
    );
    return [];
  }
}

/**
 * Enrich a single contact through the 3-step waterfall.
 */
export async function enrichContact(contact: {
  firstName: string;
  lastName: string;
  linkedinUrl?: string;
  domain?: string;
  title?: string;
  company?: string;
}): Promise<EnrichmentResult | null> {
  // Step 1: Try LinkedIn lookup
  if (contact.linkedinUrl) {
    const result = await lookupByLinkedIn(contact.linkedinUrl);
    if (result) {
      result.title = result.title || contact.title || '';
      return result;
    }
  }

  // Step 2: Try name + domain
  if (contact.domain && contact.firstName && contact.lastName) {
    const result = await lookupByNameDomain(contact.firstName, contact.lastName, contact.domain);
    if (result) {
      result.title = contact.title || '';
      result.linkedin_url = contact.linkedinUrl || '';
      return result;
    }
  }

  // No email found through individual lookups
  return null;
}

/**
 * Batch-enrich contacts with concurrency control.
 * @param contacts  Array of contacts to enrich
 * @param concurrency  Max concurrent API calls (default 3)
 */
export async function batchEnrich(
  contacts: Array<{
    firstName: string;
    lastName: string;
    linkedinUrl?: string;
    domain?: string;
    title?: string;
    company?: string;
  }>,
  concurrency: number = 3,
): Promise<EnrichmentResult[]> {
  const results: EnrichmentResult[] = [];
  const queue = [...contacts];

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const contact = queue.shift();
      if (!contact) break;

      const result = await enrichContact(contact);
      if (result) {
        results.push(result);
      }

      // Rate limit: 200ms between calls
      await new Promise((r) => setTimeout(r, 200));
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Domain search enrichment — finds contacts at a domain.
 */
export async function domainSearchEnrich(
  domain: string,
  limit: number = 10,
): Promise<EnrichmentResult[]> {
  return searchByDomain(domain, limit);
}
