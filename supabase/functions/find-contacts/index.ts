/**
 * Find Contacts Edge Function
 *
 * Core orchestration for contact intelligence (same pipeline as AI command center):
 *   1. Check cache for recent results
 *   2. Discover employees via Serper Google search (role-specific queries)
 *   3. Filter by title criteria
 *   4. CRM pre-check — skip contacts already known with email
 *   5. PRIMARY: Clay batch email lookup (synchronous poll)
 *   6. FALLBACK: Prospeo enrichment for contacts Clay couldn't find
 *   7. Domain search fallback with multiple domain candidates
 *   8. Save to enriched_contacts table
 *   9. Log the search
 *
 * POST /find-contacts
 * Body: { company_name, title_filter?, target_count?, company_linkedin_url?, company_domain? }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { inferDomain, inferDomainCandidates } from '../_shared/domain-utils.ts';
import { batchEnrich, domainSearchEnrich } from '../_shared/prospeo-client.ts';
import { googleSearch } from '../_shared/serper-client.ts';
import { sendToClayLinkedIn, sendToClayNameDomain } from '../_shared/clay-client.ts';

interface FindContactsRequest {
  company_name: string;
  title_filter?: string[];
  target_count?: number;
  company_linkedin_url?: string;
  company_domain?: string;
}

// Title matching utility
const TITLE_ALIASES: Record<string, string[]> = {
  associate: ['associate', 'sr associate', 'senior associate', 'investment associate'],
  principal: ['principal', 'sr principal', 'senior principal', 'investment principal'],
  vp: ['vp', 'vice president', 'vice-president', 'svp', 'senior vice president', 'evp'],
  director: [
    'director',
    'managing director',
    'sr director',
    'senior director',
    'associate director',
  ],
  partner: ['partner', 'managing partner', 'general partner', 'senior partner'],
  analyst: ['analyst', 'sr analyst', 'senior analyst', 'investment analyst'],
  ceo: ['ceo', 'chief executive officer', 'president', 'owner', 'founder', 'co-founder'],
  bd: [
    'business development',
    'corp dev',
    'corporate development',
    'head of acquisitions',
    'vp acquisitions',
    'vp m&a',
    'head of m&a',
  ],
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
 */
function parseLinkedInTitle(resultTitle: string): {
  firstName: string;
  lastName: string;
  role: string;
  company: string;
} | null {
  const cleaned = resultTitle.replace(/\s*[|·–—-]\s*LinkedIn\s*$/i, '').trim();
  if (!cleaned) return null;

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
      const looksLikeRole =
        /\b(CEO|CFO|COO|CTO|VP|President|Founder|Owner|Partner|Principal|Director|Manager|Chairman)\b/i;
      if (looksLikeRole.test(rest)) {
        role = rest;
      } else {
        company = rest;
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
 * Discover employees at a company via Serper Google search.
 * Replaces the broken Apify LinkedIn scraper with the same approach
 * used by the AI command center's discoverDecisionMakers.
 */
async function discoverEmployeesViaSerper(
  companyName: string,
  domain: string,
  titleFilter: string[],
  maxResults: number = 25,
): Promise<DiscoveredEmployee[]> {
  const companyDomain = domain || inferDomain(companyName);
  const excludeNoise = '-zoominfo -dnb -rocketreach -signalhire -apollo.io';

  // Role-specific search queries (same strategy as AI command center)
  const roleQueries = [
    `${companyDomain} "${companyName}" CEO owner founder site:linkedin.com/in ${excludeNoise}`,
    `${companyDomain} "${companyName}" president chairman site:linkedin.com/in ${excludeNoise}`,
    `${companyDomain} "${companyName}" partner principal site:linkedin.com/in ${excludeNoise}`,
    `${companyDomain} "${companyName}" VP director site:linkedin.com/in ${excludeNoise}`,
    `"${companyName}" contact email ${excludeNoise}`,
  ];

  // Add targeted queries for specific title filters
  if (titleFilter.length > 0) {
    for (const tf of titleFilter) {
      roleQueries.push(
        `${companyDomain} "${companyName}" ${tf} site:linkedin.com/in ${excludeNoise}`,
      );
    }
  }

  // Broader coverage query
  roleQueries.push(`${companyDomain} "${companyName}" leadership team ${excludeNoise}`);

  console.log(
    `[find-contacts] Running ${roleQueries.length} Serper queries for "${companyName}"`,
  );

  // Run all queries and collect results
  const allResults: Array<{ title: string; url: string; description: string }> = [];

  for (const query of roleQueries) {
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

  // Extract contacts from LinkedIn results
  const contactMap = new Map<string, DiscoveredEmployee>();

  for (const result of allResults) {
    if (!isValidLinkedInProfileUrl(result.url)) continue;

    const parsed = parseLinkedInTitle(result.title);
    if (!parsed) continue;

    // Verify this person is associated with the target company
    const combined = `${result.title} ${result.description}`.toLowerCase();
    const compWords = companyName
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const companyWordMatches = compWords.filter((w) => combined.includes(w));

    if (companyWordMatches.length === 0 && !combined.includes(companyDomain.toLowerCase())) {
      continue;
    }

    // Clean LinkedIn URL
    let cleanUrl = result.url.split('?')[0];
    if (!cleanUrl.startsWith('https://')) {
      cleanUrl = cleanUrl.replace('http://', 'https://');
    }

    // Dedup key
    const dedupKey = `${parsed.firstName.toLowerCase()}:${parsed.lastName.toLowerCase()}`;

    // Score this contact
    let confidence = 20; // Name found
    confidence += Math.min(companyWordMatches.length * 15, 30); // Company match
    if (parsed.role) confidence += 20; // Has role
    if (
      /\b(CEO|CFO|COO|CTO|President|Founder|Owner|Chairman|Partner|Principal)\b/i.test(
        parsed.role,
      )
    ) {
      confidence += 20;
    } else if (/\b(VP|Director|Manager|General\s*Manager)\b/i.test(parsed.role)) {
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

function deduplicateContacts<
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

    // 2. Discover employees via Serper Google search
    //    Same strategy as AI command center's discoverDecisionMakers:
    //    role-specific Google queries → parse LinkedIn titles → score & deduplicate
    const companyDomain = body.company_domain?.trim() || undefined;
    const domainCandidates = companyDomain
      ? [companyDomain, ...inferDomainCandidates(companyName).filter((d) => d !== companyDomain)]
      : inferDomainCandidates(companyName);
    const primaryDomain = domainCandidates[0] || inferDomain(companyName);

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

    // 3. Apply title filter (Serper discovery already scores by role, but apply explicit filter)
    let filtered = discovered;
    if (titleFilter.length > 0 && discovered.length > 0) {
      const titleFiltered = discovered.filter((e) => matchesTitle(e.title || '', titleFilter));
      // If filter produced results, use them; otherwise keep all (filter might be too narrow)
      if (titleFiltered.length > 0) {
        filtered = titleFiltered;
        console.log(`[find-contacts] Title filter: ${discovered.length} → ${filtered.length}`);
      }
    }

    // 4. CRM pre-check — skip contacts we already have email for (same as AI command center)
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
              const norm = c.linkedin_url.toLowerCase()
                .replace('https://www.', '').replace('https://', '').replace('http://', '');
              if (linkedInUrls.some((u: string) =>
                u.includes(norm) || norm.includes(u.replace('https://www.', '').replace('https://', '')))) {
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
          crmAlreadyKnown.add(`${(c.first_name || '').toLowerCase()}:${(c.last_name || '').toLowerCase()}`);
        }
      }
    }

    // Filter out contacts already in CRM with email
    const needsEnrichment = filtered.filter((d) => {
      const normUrl = (d.profileUrl || '').toLowerCase()
        .replace('https://www.', '').replace('https://', '').replace('http://', '');
      if (normUrl && Array.from(crmAlreadyKnown).some((k) => k.includes(normUrl) || normUrl.includes(k))) {
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

    // 5. PRIMARY: Clay batch email lookup — send all contacts, poll for results
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

    // 6. FALLBACK: Prospeo enrichment for contacts Clay couldn't find
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

      // 7. Domain search fallback — try multiple domain candidates (same as AI command center)
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
      ...prospeoEnriched.map(
        (e: Record<string, unknown>) => ({
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
        }),
      ),
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

    // 8. Save to enriched_contacts
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

    // 9. Cache results
    await supabaseAdmin.from('contact_search_cache').insert({
      cache_key: cacheKey,
      company_name: companyName,
      results: allContacts,
    });

    // 10. Log the search
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
