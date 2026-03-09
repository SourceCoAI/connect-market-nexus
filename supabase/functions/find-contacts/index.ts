/**
 * Find Contacts Edge Function
 *
 * Two-phase contact discovery pipeline:
 *   Phase 1 — Domain Discovery (when no domain provided):
 *     Google the company name to find their real website domain.
 *     Prevents wrong domain guesses from poisoning all contact searches.
 *
 *   Phase 2 — Contact Discovery & Enrichment:
 *     1. Check cache for recent results
 *     2. Domain discovery via Google (if no domain provided)
 *     3. Discover employees via multi-layered Serper Google search
 *        - Layer 1: Verified domain + company name + role
 *        - Layer 2: Company name only (domain-free fallback)
 *        - Layer 3: Company name variations (DBA, abbreviations)
 *        - Layer 4: Specific title filter queries
 *        - Layer 5: Broader coverage (team pages, etc.)
 *     4. Filter by title criteria
 *     5. CRM pre-check — skip contacts already known with email
 *     6. PRIMARY: Clay batch email lookup (synchronous poll)
 *     7. FALLBACK: Prospeo enrichment for contacts Clay couldn't find
 *     8. Domain search fallback with multiple domain candidates
 *     9. Save to enriched_contacts table
 *    10. Log the search
 *
 * POST /find-contacts
 * Body: { company_name, title_filter?, target_count?, company_linkedin_url?, company_domain? }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { inferDomain, inferDomainCandidates } from '../_shared/domain-utils.ts';
import { batchEnrich, domainSearchEnrich } from '../_shared/prospeo-client.ts';
import { googleSearch, discoverCompanyDomain } from '../_shared/serper-client.ts';
import { sendToClayLinkedIn, sendToClayNameDomain } from '../_shared/clay-client.ts';

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

  // ---- Layer 1: Domain + quoted company + role (most precise) ----
  roleQueries.push(
    `${companyDomain} "${companyName}" CEO owner founder site:linkedin.com/in ${excludeNoise}`,
    `${companyDomain} "${companyName}" president chairman site:linkedin.com/in ${excludeNoise}`,
    `${companyDomain} "${companyName}" partner principal "managing director" site:linkedin.com/in ${excludeNoise}`,
    `${companyDomain} "${companyName}" VP director site:linkedin.com/in ${excludeNoise}`,
  );

  // ---- Layer 2: Quoted company only (no domain — critical when domain guess is wrong) ----
  roleQueries.push(
    `"${companyName}" CEO founder president site:linkedin.com/in ${excludeNoise}`,
    `"${companyName}" partner principal "managing director" site:linkedin.com/in ${excludeNoise}`,
    `"${companyName}" VP director "head of" site:linkedin.com/in ${excludeNoise}`,
    `"${companyName}" "business development" acquisitions site:linkedin.com/in ${excludeNoise}`,
    `"${companyName}" CFO COO "operating partner" site:linkedin.com/in ${excludeNoise}`,
  );

  // ---- Layer 3: Company name variations (handles DBA names, abbreviations) ----
  for (const variation of nameVariations.slice(1)) {
    // skip first (already used above)
    roleQueries.push(
      `"${variation}" CEO partner principal director site:linkedin.com/in ${excludeNoise}`,
    );
  }

  // ---- Layer 4: Specific title filter queries ----
  if (titleFilter.length > 0) {
    for (const tf of titleFilter) {
      // With domain
      roleQueries.push(
        `${companyDomain} "${companyName}" ${tf} site:linkedin.com/in ${excludeNoise}`,
      );
      // Without domain (fallback)
      roleQueries.push(`"${companyName}" "${tf}" site:linkedin.com/in ${excludeNoise}`);
    }
  }

  // ---- Layer 5: Broader coverage (team pages, about pages, general search) ----
  roleQueries.push(
    `"${companyName}" team leadership site:linkedin.com/in ${excludeNoise}`,
    `"${companyName}" "works at" OR "working at" site:linkedin.com/in ${excludeNoise}`,
  );

  // Deduplicate queries
  const uniqueQueries = [...new Set(roleQueries)];

  console.log(
    `[find-contacts] Running ${uniqueQueries.length} Serper queries for "${companyName}"`,
  );

  // Run all queries and collect results
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

    // Verify this person is associated with the target company
    // Use a more lenient check: match against any company name variation words
    const combined = `${result.title} ${result.description}`.toLowerCase();
    const companyWordMatches = [...allCompanyWords].filter((w) => combined.includes(w));

    // Also check if the parsed company from LinkedIn title matches
    const parsedCompanyWords = (parsed.company || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const parsedCompanyMatches = parsedCompanyWords.filter((w) => allCompanyWords.has(w));

    // Accept if: any company word matches in text, OR parsed company matches, OR domain appears
    const hasCompanyMatch =
      companyWordMatches.length > 0 ||
      parsedCompanyMatches.length > 0 ||
      combined.includes(companyDomain.toLowerCase().replace('.com', ''));

    if (!hasCompanyMatch) {
      continue;
    }

    // Clean LinkedIn URL
    let cleanUrl = result.url.split('?')[0];
    if (!cleanUrl.startsWith('https://')) {
      cleanUrl = cleanUrl.replace('http://', 'https://');
    }

    // Dedup key — use LinkedIn URL slug as primary key (more reliable than name)
    const slug = cleanUrl.split('/in/')[1]?.replace(/\/$/, '') || '';
    const dedupKey = slug || `${parsed.firstName.toLowerCase()}:${parsed.lastName.toLowerCase()}`;

    // Score this contact
    let confidence = 20; // Name found
    confidence += Math.min(companyWordMatches.length * 10, 30); // Company match (text)
    if (parsedCompanyMatches.length > 0) confidence += 10; // Parsed company match bonus
    if (parsed.role) confidence += 20; // Has role
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

  // Sort by confidence and limit
  const results = Array.from(contactMap.values()).sort((a, b) => b.confidence - a.confidence);

  console.log(
    `[find-contacts] Discovered ${results.length} unique contacts for "${companyName}" via Serper`,
  );

  return results.slice(0, maxResults);
}

// ---------- Clay batch enrichment (same pattern as AI command center) ----------

const CLAY_POLL_INTERVAL_MS = 3_000;
const CLAY_MAX_POLL_MS = 60_000;

/**
 * Send contacts to Clay for email lookup (non-blocking sends, returns request IDs).
 * Matches the AI command center's clayBatchSend pattern.
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
 * Matches the AI command center's clayBatchPoll pattern.
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

  const auth = await requireAdmin(req, supabaseAdmin);
  if (!auth.authenticated || !auth.isAdmin) {
    return new Response(JSON.stringify({ error: auth.error || 'Unauthorized' }), {
      status: auth.authenticated ? 403 : 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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

    // 2. PHASE 1: Domain Discovery — find the real company domain before searching contacts
    //    If a domain was provided (e.g., from buyer's website), use it.
    //    Otherwise, Google the company to find their actual website domain.
    const providedDomain = body.company_domain?.trim() || undefined;
    const inferredCandidates = inferDomainCandidates(companyName);
    let primaryDomain: string;
    let domainCandidates: string[];

    if (providedDomain) {
      // Domain was provided (extracted from buyer record) — trust it as primary
      primaryDomain = providedDomain;
      domainCandidates = [
        providedDomain,
        ...inferredCandidates.filter((d) => d !== providedDomain),
      ];
      console.log(`[find-contacts] Using provided domain: ${primaryDomain}`);
    } else {
      // No domain provided — discover it via Google search
      console.log(
        `[find-contacts] No domain provided for "${companyName}", running domain discovery...`,
      );
      try {
        const discovered = await discoverCompanyDomain(companyName, inferredCandidates);
        if (discovered && discovered.confidence !== 'low') {
          primaryDomain = discovered.domain;
          domainCandidates = [
            discovered.domain,
            ...inferredCandidates.filter((d) => d !== discovered.domain),
          ];
          console.log(
            `[find-contacts] Domain discovered: ${primaryDomain} (${discovered.confidence} confidence via ${discovered.source})`,
          );
        } else {
          // Discovery returned low confidence or nothing — use inferred but don't rely on it
          primaryDomain = inferredCandidates[0] || inferDomain(companyName);
          domainCandidates = inferredCandidates;
          console.log(
            `[find-contacts] Domain discovery inconclusive, using inferred: ${primaryDomain}`,
          );
        }
      } catch (err) {
        console.warn(`[find-contacts] Domain discovery failed: ${err}, falling back to inference`);
        primaryDomain = inferredCandidates[0] || inferDomain(companyName);
        domainCandidates = inferredCandidates;
      }
    }

    // 3. PHASE 2: Discover employees via Serper Google search using the resolved domain

    let discovered: DiscoveredEmployee[] = [];
    try {
      discovered = await discoverEmployeesViaSerper(
        companyName,
        primaryDomain,
        titleFilter,
        Math.max(targetCount * 3, 30),
      );
    } catch (err) {
      console.error(`[find-contacts] Serper discovery failed: ${err}`);
      errors.push(`Contact discovery failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 4. Apply title filter (Serper discovery already scores by role, but apply explicit filter)
    let filtered = discovered;
    if (titleFilter.length > 0 && discovered.length > 0) {
      const titleFiltered = discovered.filter((e) => matchesTitle(e.title || '', titleFilter));
      // If filter produced results, use them; otherwise keep all (filter might be too narrow)
      if (titleFiltered.length > 0) {
        filtered = titleFiltered;
        console.log(`[find-contacts] Title filter: ${discovered.length} → ${filtered.length}`);
      }
    }

    // 5. CRM pre-check — skip contacts we already have email for (same as AI command center)
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

    // 6. PRIMARY: Clay batch email lookup — send all contacts, poll for results
    //    (Same approach as AI command center — Clay is primary, Prospeo is fallback)
    const clayRequestIds = await clayBatchSend(
      supabaseAdmin,
      auth.userId!,
      toEnrich.map((d) => ({
        linkedinUrl: d.profileUrl || undefined,
        firstName: d.firstName,
        lastName: d.lastName,
        domain: primaryDomain,
        company: companyName,
        title: d.title,
      })),
    );

    // Build mapping from requestId → contact for correlation
    const requestToContact = new Map<string, DiscoveredEmployee>();
    for (let i = 0; i < Math.min(clayRequestIds.length, toEnrich.length); i++) {
      requestToContact.set(clayRequestIds[i], toEnrich[i]);
    }

    // Poll for Clay results (up to 60s)
    const clayEmails = await clayBatchPoll(supabaseAdmin, clayRequestIds);
    console.log(`[find-contacts] Clay returned ${clayEmails.size}/${clayRequestIds.length} emails`);

    // Map Clay results back to contacts by LinkedIn URL
    const clayEmailByLinkedIn = new Map<string, string>();
    for (const [reqId, email] of clayEmails) {
      const contact = requestToContact.get(reqId);
      if (contact?.profileUrl) {
        clayEmailByLinkedIn.set(contact.profileUrl.toLowerCase(), email);
      }
    }

    // Determine which contacts still need email (Clay didn't find them)
    const stillNeedsEmail = toEnrich.filter(
      (d) => !clayEmailByLinkedIn.has((d.profileUrl || '').toLowerCase()),
    );

    // 7. FALLBACK: Prospeo enrichment for contacts Clay couldn't find
    let prospeoEnriched: Record<string, unknown>[] = [];
    if (stillNeedsEmail.length > 0) {
      console.log(`[find-contacts] Prospeo fallback for ${stillNeedsEmail.length} contacts`);
      try {
        prospeoEnriched = await batchEnrich(
          stillNeedsEmail.map((e) => ({
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

      // 8. Domain search fallback — try multiple domain candidates (same as AI command center)
      if (prospeoEnriched.length < stillNeedsEmail.length / 2) {
        for (const domainCandidate of domainCandidates.slice(0, 3)) {
          if (prospeoEnriched.length >= stillNeedsEmail.length) break;
          try {
            const domainResults = await domainSearchEnrich(
              domainCandidate,
              stillNeedsEmail.length - prospeoEnriched.length,
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

    // Build final contacts — merge Clay results + Prospeo results + unenriched
    const contacts = [
      // Contacts with Clay email
      ...toEnrich
        .filter((d) => clayEmailByLinkedIn.has((d.profileUrl || '').toLowerCase()))
        .map((d) => ({
          company_name: companyName,
          full_name: `${d.firstName} ${d.lastName}`.trim(),
          first_name: d.firstName,
          last_name: d.lastName,
          title: d.title || '',
          email: clayEmailByLinkedIn.get((d.profileUrl || '').toLowerCase()) || null,
          phone: null as string | null,
          linkedin_url: d.profileUrl || '',
          confidence: 'high' as string,
          source: 'clay',
          enriched_at: new Date().toISOString(),
          search_query: cacheKey,
        })),
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

    // Include unenriched contacts (neither Clay nor Prospeo found email)
    const enrichedLinkedIns = new Set(
      contacts.map((c) => c.linkedin_url?.toLowerCase()).filter(Boolean),
    );
    const unenriched = toEnrich
      .filter((d) => !enrichedLinkedIns.has(d.profileUrl?.toLowerCase()))
      .map((d) => ({
        company_name: companyName,
        full_name: `${d.firstName} ${d.lastName}`.trim(),
        first_name: d.firstName,
        last_name: d.lastName,
        title: d.title || '',
        email: null,
        phone: null,
        linkedin_url: d.profileUrl || '',
        confidence: 'low' as const,
        source: 'google_discovery',
        enriched_at: new Date().toISOString(),
        search_query: cacheKey,
      }));

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
