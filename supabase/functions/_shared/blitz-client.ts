/**
 * Shared Blitz API client for edge functions.
 *
 * Centralizes authentication (API key via x-api-key header), base URL, and
 * common request patterns so individual edge functions stay thin.
 *
 * Requires BLITZ_API_KEY environment variable.
 *
 * API Base: https://api.blitz-api.ai
 */

const BLITZ_BASE_URL = 'https://api.blitz-api.ai';
const SEARCH_TIMEOUT_MS = 10_000;
const ENRICHMENT_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3;
const RATE_LIMIT_WAIT_MS = 60_000;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BlitzRequestOptions {
  method?: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface BlitzResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

export interface BlitzPerson {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  linkedin_url?: string;
  title?: string;
  company_name?: string;
  location?: string;
}

export interface BlitzWaterfallResult {
  icp: string;
  ranking: string;
  person: BlitzPerson;
}

export interface BlitzWaterfallResponse {
  results: BlitzWaterfallResult[];
}

export interface BlitzEmployeeFinderResponse {
  results: BlitzPerson[];
  total_pages?: number;
  results_length?: number;
}

export interface BlitzEmailResponse {
  found: boolean;
  email?: string;
  all_emails?: Array<{ email: string }>;
}

export interface BlitzPhoneResponse {
  found?: boolean;
  phone?: string;
}

export interface BlitzDomainToLinkedInResponse {
  linkedin_url?: string;
  company_linkedin_url?: string;
}

export interface BlitzLinkedInToDomainResponse {
  domain?: string;
}

export interface CascadeFilter {
  include_title: string[];
  exclude_title?: string[];
  location?: string[];
  include_headline_search?: boolean;
}

// ─── Core request function ──────────────────────────────────────────────────

function getApiKey(): string {
  const key = Deno.env.get('BLITZ_API_KEY');
  if (!key) throw new Error('BLITZ_API_KEY is not set');
  return key;
}

/**
 * Make an authenticated request to the Blitz API.
 *
 * Handles rate limiting (429 → wait 60s → retry) and transient errors
 * (5xx / network) with exponential backoff. Does NOT retry 4xx client errors.
 */
export async function blitzRequest<T = unknown>(
  options: BlitzRequestOptions,
): Promise<BlitzResponse<T>> {
  const apiKey = getApiKey();
  const { method = 'POST', path, body, timeoutMs = ENRICHMENT_TIMEOUT_MS } = options;

  const url = `${BLITZ_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
  };

  let lastError = '';

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      };

      if (body && method !== 'GET') {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);

      // Parse response
      let data: T | null = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = (await response.json()) as T;
      } else {
        const text = await response.text();
        data = text as unknown as T;
      }

      if (response.ok) {
        if (attempt > 0) {
          console.log(`[blitz] Succeeded on retry ${attempt}/${MAX_RETRIES}`);
        }
        return { ok: true, status: response.status, data };
      }

      // Rate limited — wait 60s and retry
      if (response.status === 429) {
        console.warn(
          `[blitz] Rate limited (attempt ${attempt + 1}/${MAX_RETRIES}). Waiting 60s...`,
        );
        await new Promise((r) => setTimeout(r, RATE_LIMIT_WAIT_MS));
        continue;
      }

      // Don't retry client errors (4xx except 429)
      if (response.status >= 400 && response.status < 500) {
        const errorMsg =
          typeof data === 'string' && data.trim()
            ? data
            : data
              ? JSON.stringify(data)
              : `Blitz API returned ${response.status} for ${method} ${path}`;
        console.error(`[blitz] Client error ${response.status} for ${method} ${path}:`, errorMsg);
        return { ok: false, status: response.status, data: null, error: errorMsg };
      }

      // Server error (5xx) — retry with backoff
      lastError = `HTTP ${response.status}: ${JSON.stringify(data)}`;
      console.warn(`[blitz] Server error (attempt ${attempt + 1}/${MAX_RETRIES}):`, lastError);
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[blitz] Fetch error (attempt ${attempt + 1}/${MAX_RETRIES}):`, lastError);
    }

    // Exponential backoff before retry (5s, 10s, 15s)
    if (attempt < MAX_RETRIES - 1) {
      const delay = 5000 * (attempt + 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  console.error(`[blitz] All ${MAX_RETRIES} attempts failed for ${method} ${path}`);
  return {
    ok: false,
    status: 0,
    data: null,
    error: `All retries exhausted: ${lastError}`,
  };
}

// ─── Convenience wrappers ───────────────────────────────────────────────────

/**
 * Get company LinkedIn URL from a website domain.
 * POST /v2/enrichment/domain-to-linkedin
 */
export async function domainToLinkedIn(
  domain: string,
): Promise<BlitzResponse<BlitzDomainToLinkedInResponse>> {
  // Strip protocol and trailing slash
  let cleanDomain = domain.trim().toLowerCase();
  if (cleanDomain.startsWith('http://')) cleanDomain = cleanDomain.slice(7);
  if (cleanDomain.startsWith('https://')) cleanDomain = cleanDomain.slice(8);
  cleanDomain = cleanDomain.replace(/\/+$/, '');

  return blitzRequest<BlitzDomainToLinkedInResponse>({
    path: '/v2/enrichment/domain-to-linkedin',
    body: { domain: cleanDomain },
    timeoutMs: ENRICHMENT_TIMEOUT_MS,
  });
}

/**
 * Get email domain from company LinkedIn URL.
 * POST /v2/enrichment/linkedin-to-domain
 */
export async function linkedInToDomain(
  companyLinkedInUrl: string,
): Promise<BlitzResponse<BlitzLinkedInToDomainResponse>> {
  return blitzRequest<BlitzLinkedInToDomainResponse>({
    path: '/v2/enrichment/linkedin-to-domain',
    body: { company_linkedin_url: companyLinkedInUrl },
    timeoutMs: ENRICHMENT_TIMEOUT_MS,
  });
}

/**
 * Waterfall ICP Search — find decision-makers using cascading title hierarchy.
 * POST /v2/search/waterfall-icp-keyword
 *
 * Results are nested in results[].person (unlike Employee Finder).
 */
export async function waterfallIcpSearch(
  companyLinkedInUrl: string,
  cascade: CascadeFilter[],
  maxResults: number = 10,
): Promise<BlitzResponse<BlitzWaterfallResponse>> {
  return blitzRequest<BlitzWaterfallResponse>({
    path: '/v2/search/waterfall-icp-keyword',
    body: {
      company_linkedin_url: companyLinkedInUrl,
      cascade,
      max_results: maxResults,
    },
    timeoutMs: SEARCH_TIMEOUT_MS,
  });
}

/**
 * Employee Finder — find employees with job level/function filters.
 * POST /v2/search/employee-finder
 *
 * Results are returned directly in results[] (not nested).
 */
export async function employeeFinder(
  companyLinkedInUrl: string,
  jobLevel: string[] = [],
  jobFunction: string[] = [],
  maxResults: number = 10,
): Promise<BlitzResponse<BlitzEmployeeFinderResponse>> {
  return blitzRequest<BlitzEmployeeFinderResponse>({
    path: '/v2/search/employee-finder',
    body: {
      company_linkedin_url: companyLinkedInUrl,
      job_level: jobLevel,
      job_function: jobFunction,
      max_results: maxResults,
    },
    timeoutMs: SEARCH_TIMEOUT_MS,
  });
}

/**
 * Find a person's work email from their LinkedIn URL.
 * POST /v2/enrichment/email
 */
export async function findWorkEmail(
  personLinkedInUrl: string,
): Promise<BlitzResponse<BlitzEmailResponse>> {
  return blitzRequest<BlitzEmailResponse>({
    path: '/v2/enrichment/email',
    body: { person_linkedin_url: personLinkedInUrl },
    timeoutMs: ENRICHMENT_TIMEOUT_MS,
  });
}

/**
 * Find a person's phone number from their LinkedIn URL (US only).
 * POST /v2/enrichment/phone
 */
export async function findPhone(
  personLinkedInUrl: string,
): Promise<BlitzResponse<BlitzPhoneResponse>> {
  return blitzRequest<BlitzPhoneResponse>({
    path: '/v2/enrichment/phone',
    body: { person_linkedin_url: personLinkedInUrl },
    timeoutMs: ENRICHMENT_TIMEOUT_MS,
  });
}

// ─── Batch enrichment helper ────────────────────────────────────────────────

/**
 * Batch enrich contacts with email + phone in parallel with concurrency control.
 * Returns a Map keyed by LinkedIn URL → { email, phone }.
 */
export async function batchEnrichContacts(
  contacts: Array<{ linkedinUrl: string }>,
  concurrency: number = 1,
): Promise<Map<string, { email: string | null; phone: string | null }>> {
  const results = new Map<string, { email: string | null; phone: string | null }>();
  if (contacts.length === 0) return results;

  // Worker queue with concurrency limiter
  let cursor = 0;

  async function processNext(): Promise<void> {
    while (cursor < contacts.length) {
      const idx = cursor++;
      const contact = contacts[idx];
      const url = contact.linkedinUrl;

      let email: string | null = null;
      let phone: string | null = null;

      try {
        // Run email + phone lookups sequentially to avoid rate limits
        const emailRes = await findWorkEmail(url).catch((e: Error) => ({ ok: false, status: 0, data: null, error: e.message } as BlitzResponse<BlitzEmailResponse>));
        if (emailRes.ok && emailRes.data?.email) {
          email = emailRes.data.email;
        }

        const phoneRes = await findPhone(url).catch((e: Error) => ({ ok: false, status: 0, data: null, error: e.message } as BlitzResponse<BlitzPhoneResponse>));
        if (phoneRes.ok && phoneRes.data?.phone) {
          phone = phoneRes.data.phone;
        }
      } catch (err) {
        console.warn(`[blitz] Batch enrich failed for ${url}: ${err}`);
      }

      results.set(url.toLowerCase(), { email, phone });
    }
  }

  // Launch concurrent workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, contacts.length); i++) {
    workers.push(processNext());
  }
  await Promise.allSettled(workers);

  return results;
}
