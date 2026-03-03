/**
 * Integration Enrichment Tools
 * Contact enrichment via external APIs (Google search + Prospeo email enrichment).
 * Includes: enrich_contact (company/linkedin modes), find_contact (person/decision_makers/linkedin_search modes).
 *
 * MERGED Feb 2026: Contact enrichment tools consolidated:
 *   enrich_buyer_contacts + enrich_linkedin_contact -> enrich_contact (with mode param)
 *   find_contact_linkedin + find_and_enrich_person -> find_contact (with mode param)
 */

import type { SupabaseClient, ClaudeTool, ToolResult } from './common.ts';
import {
  inferDomain,
  inferDomainCandidates,
  batchEnrich,
  domainSearchEnrich,
  enrichContact,
  matchesTitle,
  validateProspeoResult,
  discoverLinkedInUrl,
  discoverDecisionMakers,
  type DiscoveredContact,
  type LinkedInMatch,
} from './common.ts';
import { clayLookupEmail, clayBatchSend, clayBatchPoll } from './clay-tools.ts';

// ---------- Tool definitions ----------

export const enrichmentToolDefinitions: ClaudeTool[] = [
  {
    name: 'enrich_contact',
    description:
      'Enrich contacts via external APIs (Google search + Prospeo email enrichment). Two modes: "company" mode discovers decision makers and key contacts at a company via Google search, filters by title/role, and enriches with email/phone. "linkedin" mode enriches a single contact from their LinkedIn profile URL. Results are saved to the enriched_contacts table.',
    input_schema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['company', 'linkedin'],
          description:
            '"company" to discover contacts at a company (requires company_name), "linkedin" to enrich from a LinkedIn profile URL (requires linkedin_url). Default: auto-detected based on provided params.',
        },
        company_name: {
          type: 'string',
          description: 'Company name to search for contacts (company mode)',
        },
        title_filter: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Filter by title/role keywords. E.g. ["associate", "principal", "vp", "director", "partner"]. Supports aliases. (company mode)',
        },
        target_count: {
          type: 'number',
          description: 'Number of contacts to find (default 10, max 25) (company mode)',
        },
        company_linkedin_url: {
          type: 'string',
          description: 'LinkedIn company page URL if known (skips URL resolution) (company mode)',
        },
        company_domain: {
          type: 'string',
          description: 'Company email domain if known (e.g. "trivest.com")',
        },
        linkedin_url: {
          type: 'string',
          description:
            'LinkedIn profile URL to enrich (linkedin mode, e.g. "https://www.linkedin.com/in/john-smith")',
        },
        first_name: {
          type: 'string',
          description: 'First name if known (helps with name+domain fallback, linkedin mode)',
        },
        last_name: {
          type: 'string',
          description: 'Last name if known (helps with name+domain fallback, linkedin mode)',
        },
      },
      required: [],
    },
  },
  {
    name: 'find_contact',
    description:
      'Find and enrich contact information. Three modes: "person" mode chains CRM lookup + company resolution + LinkedIn discovery + email enrichment + CRM update in one command. "decision_makers" mode discovers ALL key contacts at a company (CEO, founders, VPs, etc.) via Google search and enriches their emails. "linkedin_search" mode finds LinkedIn profile URLs for existing CRM contacts who are missing them. Use "person" when asked "find the email for [name]". Use "decision_makers" when asked "find contacts at [company]" or "who runs [company]". Use "linkedin_search" for bulk LinkedIn URL discovery.',
    input_schema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['person', 'decision_makers', 'linkedin_search'],
          description:
            '"person" to find a specific person\'s email (default), "decision_makers" to discover all key contacts at a company, "linkedin_search" to find LinkedIn URLs for existing CRM contacts.',
        },
        person_name: {
          type: 'string',
          description: 'Full name of the person to find (person mode, e.g. "Larry Phillips")',
        },
        company_name: {
          type: 'string',
          description:
            'Company name. Required for decision_makers mode. Optional for person mode (resolves from linked listings/deals if omitted).',
        },
        company_domain: {
          type: 'string',
          description:
            'Company email domain if known (e.g. "trivest.com"). Improves search accuracy for decision_makers and person modes.',
        },
        title_filter: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Filter by title/role keywords (decision_makers mode). E.g. ["CEO", "founder", "partner"]. Supports aliases.',
        },
        target_count: {
          type: 'number',
          description: 'Number of contacts to find in decision_makers mode (default 10, max 25)',
        },
        auto_enrich: {
          type: 'boolean',
          description:
            'If true, automatically enrich discovered contacts with email/phone via Prospeo (decision_makers mode). Default true.',
        },
        contact_type: {
          type: 'string',
          enum: ['buyer', 'seller', 'advisor', 'all'],
          description:
            'Filter by contact type (default "all" for person mode, "seller" for linkedin_search mode)',
        },
        contact_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Specific contact UUIDs to find LinkedIn URLs for (linkedin_search mode). If omitted, auto-discovers contacts missing LinkedIn.',
        },
        limit: {
          type: 'number',
          description: 'Max contacts to search for in linkedin_search mode (default 5, max 10)',
        },
        auto_update: {
          type: 'boolean',
          description:
            'If true, automatically update high-confidence matches in the contacts table (linkedin_search mode). Default false.',
        },
      },
      required: [],
    },
  },
];

// ---------- enrich_buyer_contacts ----------

export async function enrichBuyerContacts(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const companyName = (args.company_name as string)?.trim();
  if (!companyName) return { error: 'company_name is required' };

  const titleFilter = (args.title_filter as string[]) || [];
  const targetCount = Math.min((args.target_count as number) || 10, 25);
  const errors: string[] = [];

  // 1. Check cache (7-day)
  const cacheKey = `${companyName}:${titleFilter.sort().join(',')}`.toLowerCase();
  const { data: cached } = await supabase
    .from('contact_search_cache')
    .select('results')
    .eq('cache_key', cacheKey)
    .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached?.results) {
    return {
      data: {
        contacts: cached.results,
        total_found: cached.results.length,
        total_enriched: cached.results.filter((c: { email?: string }) => c.email).length,
        from_cache: true,
        message: `Found ${cached.results.length} cached contacts for "${companyName}"`,
      },
    };
  }

  // 2. Discover contacts via Serper-based Google search (replaces Apify LinkedIn scraping)
  const companyDomain = (args.company_domain as string)?.trim() || undefined;
  let discovered: DiscoveredContact[] = [];
  try {
    discovered = await discoverDecisionMakers(
      companyName,
      companyDomain,
      titleFilter,
      Math.max(targetCount * 2, 30),
    );
  } catch (err) {
    errors.push(
      `Google-based contact discovery failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 3. Pre-check CRM — skip people we already have email for
  const crmAlreadyKnown = new Set<string>();
  if (discovered.length > 0) {
    // Check by LinkedIn URL
    const linkedInUrls = discovered.map((d) => d.linkedin_url?.toLowerCase()).filter(Boolean);

    if (linkedInUrls.length > 0) {
      const { data: existingByLinkedIn } = await supabase
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

    // Check by name + company
    const { data: existingByName } = await supabase
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
  const needsEnrichment = discovered.filter((d) => {
    const normUrl = d.linkedin_url
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
    const nameKey = `${d.first_name.toLowerCase()}:${d.last_name.toLowerCase()}`;
    if (crmAlreadyKnown.has(nameKey)) return false;
    return true;
  });

  const skippedFromCrm = discovered.length - needsEnrichment.length;
  if (skippedFromCrm > 0) {
    console.log(
      `[enrich-buyer-contacts] Skipped ${skippedFromCrm} contacts already in CRM with email`,
    );
  }

  const toEnrich = needsEnrichment.slice(0, targetCount);

  const domainCandidates = companyDomain
    ? [companyDomain, ...inferDomainCandidates(companyName).filter((d) => d !== companyDomain)]
    : inferDomainCandidates(companyName);
  const primaryDomain = domainCandidates[0] || inferDomain(companyName);

  // 4. PRIMARY: Clay batch email lookup — send all contacts, poll for results
  const clayRequestIds = await clayBatchSend(
    supabase,
    userId,
    toEnrich.map((d) => ({
      linkedinUrl: d.linkedin_url || undefined,
      firstName: d.first_name,
      lastName: d.last_name,
      domain: primaryDomain,
      company: companyName,
      title: d.title,
      sourceFunction: 'enrich_buyer_contacts',
    })),
  );

  // Build a mapping from requestId → contact for correlation
  const requestToContact = new Map<string, DiscoveredContact>();
  for (let i = 0; i < Math.min(clayRequestIds.length, toEnrich.length); i++) {
    requestToContact.set(clayRequestIds[i], toEnrich[i]);
  }

  // Poll for Clay results (up to 60s)
  const clayEmails = await clayBatchPoll(supabase, clayRequestIds);
  console.log(
    `[enrich-buyer-contacts] Clay returned ${clayEmails.size}/${clayRequestIds.length} emails`,
  );

  // Map Clay results back to contacts by LinkedIn URL
  const clayEmailByLinkedIn = new Map<string, string>();
  for (const [reqId, email] of clayEmails) {
    const contact = requestToContact.get(reqId);
    if (contact?.linkedin_url) {
      clayEmailByLinkedIn.set(contact.linkedin_url.toLowerCase(), email);
    }
  }

  // Determine which contacts still need email (Clay didn't find them)
  const stillNeedsEmail = toEnrich.filter(
    (d) => !clayEmailByLinkedIn.has((d.linkedin_url || '').toLowerCase()),
  );

  // 5. FALLBACK: Prospeo enrichment for contacts Clay couldn't find
  // deno-lint-ignore no-explicit-any
  let prospeoEnriched: unknown[] = [];
  if (stillNeedsEmail.length > 0) {
    try {
      prospeoEnriched = await batchEnrich(
        stillNeedsEmail.map((d) => ({
          firstName: d.first_name,
          lastName: d.last_name,
          linkedinUrl: d.linkedin_url,
          domain: primaryDomain,
          title: d.title,
          company: companyName,
        })),
        3,
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('404')) {
        errors.push(
          `Prospeo enrichment failed (404): Prospeo API endpoint may have changed. Check PROSPEO_API_KEY.`,
        );
      } else if (errMsg.includes('401') || errMsg.includes('403')) {
        errors.push(`Prospeo enrichment failed (auth): PROSPEO_API_KEY may be invalid or expired.`);
      } else {
        errors.push(`Prospeo enrichment failed: ${errMsg}`);
      }
    }

    // 6. Domain search fallback — try multiple domain candidates
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
      .filter((d) => clayEmailByLinkedIn.has((d.linkedin_url || '').toLowerCase()))
      .map((d) => ({
        company_name: companyName,
        full_name: `${d.first_name} ${d.last_name}`.trim(),
        first_name: d.first_name,
        last_name: d.last_name,
        title: d.title || '',
        email: clayEmailByLinkedIn.get((d.linkedin_url || '').toLowerCase()) || null,
        phone: null as string | null,
        linkedin_url: d.linkedin_url || '',
        confidence: 'high' as string,
        source: 'clay',
        enriched_at: new Date().toISOString(),
        search_query: cacheKey,
      })),
    // Contacts with Prospeo email
    ...prospeoEnriched.map(
      (e: {
        first_name?: string;
        last_name?: string;
        title?: string;
        email?: string;
        phone?: string;
        linkedin_url?: string;
        confidence?: string;
        source?: string;
      }) => ({
        company_name: companyName,
        full_name: `${e.first_name} ${e.last_name}`.trim(),
        first_name: e.first_name,
        last_name: e.last_name,
        title: e.title || '',
        email: e.email,
        phone: e.phone,
        linkedin_url: e.linkedin_url || '',
        confidence: e.confidence || 'low',
        source: e.source || 'prospeo',
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
    .filter((d) => !enrichedLinkedIns.has(d.linkedin_url?.toLowerCase()))
    .map((d) => ({
      company_name: companyName,
      full_name: `${d.first_name} ${d.last_name}`.trim(),
      first_name: d.first_name,
      last_name: d.last_name,
      title: d.title || '',
      email: null,
      phone: null,
      linkedin_url: d.linkedin_url || '',
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
    await supabase.from('enriched_contacts').upsert(
      allContacts.map((c) => ({ ...c, workspace_id: userId })),
      { onConflict: 'workspace_id,linkedin_url', ignoreDuplicates: true },
    );
  }

  // 9. Cache
  await supabase.from('contact_search_cache').insert({
    cache_key: cacheKey,
    company_name: companyName,
    results: allContacts,
  });

  // 10. Log
  await supabase.from('contact_search_log').insert({
    user_id: userId,
    company_name: companyName,
    title_filter: titleFilter,
    results_count: allContacts.length,
    from_cache: false,
    duration_ms: 0,
  });

  // If all external APIs failed and we got nothing, provide actionable guidance
  if (allContacts.length === 0 && errors.length > 0) {
    return {
      data: {
        contacts: [],
        total_found: 0,
        total_enriched: 0,
        from_cache: false,
        errors,
        message: `Could not find contacts for "${companyName}" — enrichment APIs failed.`,
        alternatives: [
          'Search internal contacts using search_contacts or search_pe_contacts',
          'If the user has a LinkedIn URL for someone at this company, use enrich_contact(mode: "linkedin") instead',
          'Try searching with a different company name or providing the company_domain directly',
          'Check SERPER_API_KEY and PROSPEO_API_KEY in Supabase Edge Function secrets',
        ],
      },
    };
  }

  return {
    data: {
      contacts: allContacts,
      total_found: allContacts.length,
      total_enriched: contacts.length,
      skipped_already_in_crm: skippedFromCrm,
      from_cache: false,
      errors: errors.length > 0 ? errors : undefined,
      message: `Found ${allContacts.length} contacts for "${companyName}" (${contacts.length} with email)${skippedFromCrm > 0 ? ` — skipped ${skippedFromCrm} already in CRM` : ''}`,
    },
  };
}

// ---------- enrich_linkedin_contact ----------

export async function enrichLinkedInContact(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const linkedinUrl = (args.linkedin_url as string)?.trim();
  if (!linkedinUrl) return { error: 'linkedin_url is required' };

  // Validate it looks like a LinkedIn URL
  if (!linkedinUrl.includes('linkedin.com/in/')) {
    return {
      error: 'Invalid LinkedIn URL — expected a profile URL like linkedin.com/in/john-smith',
    };
  }

  const firstName = (args.first_name as string)?.trim() || '';
  const lastName = (args.last_name as string)?.trim() || '';
  const domain = (args.company_domain as string)?.trim() || undefined;

  console.log(`[enrich-linkedin] Enriching: ${linkedinUrl}`);

  // --- PRIMARY: Try Clay first for email lookup ---
  try {
    const clayResult = await clayLookupEmail(supabase, userId, {
      linkedinUrl,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      domain,
      sourceFunction: 'enrich_linkedin_contact',
    });

    if (clayResult.email) {
      console.log(`[enrich-linkedin] Clay found email: ${clayResult.email} for ${linkedinUrl}`);

      // Save to enriched_contacts
      const contactData = {
        workspace_id: userId,
        company_name: 'Unknown',
        full_name: `${firstName} ${lastName}`.trim() || 'Unknown',
        first_name: firstName,
        last_name: lastName,
        title: '',
        email: clayResult.email,
        phone: null,
        linkedin_url: linkedinUrl,
        confidence: 'high',
        source: clayResult.source,
        enriched_at: new Date().toISOString(),
        search_query: `linkedin:${linkedinUrl}`,
      };

      await supabase
        .from('enriched_contacts')
        .upsert(contactData, { onConflict: 'workspace_id,linkedin_url', ignoreDuplicates: false });

      // Update CRM contact if exists
      let crmContactId: string | null = null;
      let crmAction: 'created' | 'updated' | null = null;
      const normalizedUrl = linkedinUrl
        .replace('https://www.', '')
        .replace('https://', '')
        .replace('http://', '');

      const { data: existingContacts } = await supabase
        .from('contacts')
        .select('id, email, phone, linkedin_url, first_name, last_name')
        .or(`linkedin_url.ilike.%${normalizedUrl}%`)
        .eq('archived', false)
        .limit(1);

      if (existingContacts && existingContacts.length > 0) {
        const existing = existingContacts[0] as Record<string, unknown>;
        const updates: Record<string, unknown> = {};
        if (!existing.email) updates.email = clayResult.email;
        if (Object.keys(updates).length > 0) {
          await supabase.from('contacts').update(updates).eq('id', existing.id);
        }
        crmContactId = existing.id as string;
        crmAction = 'updated';
      }

      return {
        data: {
          found: true,
          name: `${firstName} ${lastName}`.trim() || 'Unknown',
          email: clayResult.email,
          phone: null,
          title: null,
          company: null,
          linkedin_url: linkedinUrl,
          confidence: 'high',
          source: clayResult.source,
          saved_to_enriched: true,
          crm_contact_id: crmContactId || undefined,
          crm_action: crmAction || undefined,
          message: `Found email via Clay: ${clayResult.email}${crmAction === 'updated' ? ' — existing CRM contact updated' : ''}`,
        },
      };
    }

    console.log(
      `[enrich-linkedin] Clay did not find email for ${linkedinUrl} — trying Prospeo fallback`,
    );
  } catch (clayErr) {
    console.warn(
      `[enrich-linkedin] Clay lookup failed: ${clayErr instanceof Error ? clayErr.message : String(clayErr)} — trying Prospeo fallback`,
    );
  }

  // --- FALLBACK: Try Prospeo ---
  try {
    const result = await enrichContact({
      firstName,
      lastName,
      linkedinUrl,
      domain,
    });

    if (!result) {
      // --- FALLBACK 2: Prospeo returned nothing — try Google discovery to verify/find correct profile ---
      console.log(
        `[enrich-linkedin] Prospeo returned no results for ${linkedinUrl} — trying Google fallback`,
      );

      // Try to find CRM context for this LinkedIn URL (person name + company)
      let fallbackFirstName = firstName;
      let fallbackLastName = lastName;
      let fallbackCompany = '';
      let fallbackCrmContactId: string | null = null;

      const normalizedUrl = linkedinUrl
        .replace('https://www.', '')
        .replace('https://', '')
        .replace('http://', '');
      const { data: crmMatch } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, title, company_name, listing_id, remarketing_buyer_id')
        .or(`linkedin_url.ilike.%${normalizedUrl}%`)
        .eq('archived', false)
        .limit(1);

      if (crmMatch?.length) {
        const c = crmMatch[0] as Record<string, unknown>;
        fallbackFirstName = (c.first_name as string) || fallbackFirstName;
        fallbackLastName = (c.last_name as string) || fallbackLastName;
        fallbackCrmContactId = c.id as string;
        fallbackCompany = (c.company_name as string) || '';

        // Resolve company from linked records if not on contact directly
        if (!fallbackCompany && c.listing_id) {
          const { data: listing } = await supabase
            .from('listings')
            .select('title')
            .eq('id', c.listing_id as string)
            .single();
          if (listing?.title) fallbackCompany = listing.title as string;
        }
        if (!fallbackCompany && c.remarketing_buyer_id) {
          const { data: buyer } = await supabase
            .from('remarketing_buyers')
            .select('company_name, pe_firm_name')
            .eq('id', c.remarketing_buyer_id as string)
            .single();
          if (buyer) fallbackCompany = ((buyer.company_name || buyer.pe_firm_name) as string) || '';
        }
      }

      // If we have a name, try Google search to find the correct LinkedIn profile
      if (fallbackFirstName && fallbackLastName) {
        try {
          const googleResult = await discoverLinkedInUrl(
            fallbackFirstName,
            fallbackLastName,
            fallbackCompany,
            '',
            domain,
          );

          if (googleResult && googleResult.url !== linkedinUrl) {
            // Google found a DIFFERENT LinkedIn URL — stored URL was likely wrong
            console.log(
              `[enrich-linkedin] Google found different profile: ${googleResult.url} (score: ${googleResult.score}) — retrying enrichment`,
            );

            const retryResult = await enrichContact({
              firstName: fallbackFirstName,
              lastName: fallbackLastName,
              linkedinUrl: googleResult.url,
              domain,
            });

            if (retryResult?.email) {
              // Update CRM with corrected URL + email
              if (fallbackCrmContactId) {
                await supabase
                  .from('contacts')
                  .update({
                    linkedin_url: googleResult.url,
                    email: retryResult.email,
                    ...(retryResult.phone ? { phone: retryResult.phone } : {}),
                  })
                  .eq('id', fallbackCrmContactId);
                console.log(
                  `[enrich-linkedin] Corrected LinkedIn URL and updated CRM contact ${fallbackCrmContactId}`,
                );
              }

              // Save to enriched_contacts
              await supabase.from('enriched_contacts').upsert(
                {
                  workspace_id: userId,
                  company_name: retryResult.company || fallbackCompany || 'Unknown',
                  full_name: `${retryResult.first_name} ${retryResult.last_name}`.trim(),
                  first_name: retryResult.first_name,
                  last_name: retryResult.last_name,
                  title: retryResult.title || '',
                  email: retryResult.email,
                  phone: retryResult.phone,
                  linkedin_url: retryResult.linkedin_url || googleResult.url,
                  confidence: retryResult.confidence,
                  source: `linkedin_enrichment:google_corrected:${retryResult.source}`,
                  enriched_at: new Date().toISOString(),
                  search_query: `linkedin:${linkedinUrl}`,
                },
                { onConflict: 'workspace_id,linkedin_url', ignoreDuplicates: false },
              );

              return {
                data: {
                  found: true,
                  name: `${retryResult.first_name} ${retryResult.last_name}`.trim(),
                  email: retryResult.email,
                  phone: retryResult.phone,
                  title: retryResult.title,
                  company: retryResult.company,
                  linkedin_url: retryResult.linkedin_url || googleResult.url,
                  confidence: retryResult.confidence,
                  source: retryResult.source,
                  saved_to_enriched: true,
                  crm_contact_id: fallbackCrmContactId || undefined,
                  crm_action: fallbackCrmContactId ? 'updated' : undefined,
                  original_linkedin_url: linkedinUrl,
                  corrected_linkedin_url: googleResult.url,
                  google_verification: googleResult.verification,
                  message: `Original LinkedIn URL returned no results. Google found correct profile: ${googleResult.url}. Email: ${retryResult.email} (confidence: ${retryResult.confidence})`,
                },
              };
            }
          }
        } catch (googleErr) {
          console.warn(
            `[enrich-linkedin] Google fallback failed: ${googleErr instanceof Error ? googleErr.message : String(googleErr)}`,
          );
        }
      }

      // Clay was already tried as primary — no further fallback
      return {
        data: {
          linkedin_url: linkedinUrl,
          found: false,
          message: `Could not find email for this LinkedIn profile. Both Clay and Prospeo returned no results.${fallbackCompany ? ` Google search for ${fallbackFirstName} ${fallbackLastName} at ${fallbackCompany} also did not find a match.` : ''} Try providing the person's company domain (e.g. company_domain: "acme.com") for a name+domain fallback.`,
        },
      };
    }

    // Save to enriched_contacts for audit trail
    const contactData = {
      workspace_id: userId,
      company_name: result.company || 'Unknown',
      full_name: `${result.first_name} ${result.last_name}`.trim(),
      first_name: result.first_name,
      last_name: result.last_name,
      title: result.title || '',
      email: result.email,
      phone: result.phone,
      linkedin_url: result.linkedin_url || linkedinUrl,
      confidence: result.confidence,
      source: `linkedin_enrichment:${result.source}`,
      enriched_at: new Date().toISOString(),
      search_query: `linkedin:${linkedinUrl}`,
    };

    await supabase
      .from('enriched_contacts')
      .upsert(contactData, { onConflict: 'workspace_id,linkedin_url', ignoreDuplicates: false });

    // Check if this person exists in our CRM contacts — update or create
    let crmContactId: string | null = null;
    let crmAction: 'created' | 'updated' | null = null;
    if (result.email) {
      const normalizedUrl = linkedinUrl
        .replace('https://www.', '')
        .replace('https://', '')
        .replace('http://', '');

      // First: try matching by LinkedIn URL
      const { data: existingContacts } = await supabase
        .from('contacts')
        .select('id, email, phone, linkedin_url, first_name, last_name')
        .or(`linkedin_url.ilike.%${normalizedUrl}%`)
        .eq('archived', false)
        .limit(1);

      if (existingContacts && existingContacts.length > 0) {
        const existing = existingContacts[0] as Record<string, unknown>;
        const updates: Record<string, unknown> = {};
        if (!existing.email && result.email) updates.email = result.email;
        if (!existing.phone && result.phone) updates.phone = result.phone;

        if (Object.keys(updates).length > 0) {
          await supabase.from('contacts').update(updates).eq('id', existing.id);
          console.log(`[enrich-linkedin] Updated CRM contact ${existing.id} with enriched data`);
        }
        crmContactId = existing.id as string;
        crmAction = 'updated';
      } else if (result.first_name && result.last_name) {
        // Second: try matching by name — catches CRM contacts with stale/different LinkedIn URL
        const { data: nameMatches } = await supabase
          .from('contacts')
          .select('id, email, phone, linkedin_url, first_name, last_name')
          .eq('archived', false)
          .ilike('first_name', result.first_name)
          .ilike('last_name', result.last_name)
          .is('email', null)
          .limit(5);

        if (nameMatches?.length === 1) {
          // Exactly one match without email — safe to update with enriched data + correct LinkedIn URL
          const existing = nameMatches[0] as Record<string, unknown>;
          const updates: Record<string, unknown> = {
            email: result.email,
            linkedin_url: result.linkedin_url || linkedinUrl,
          };
          if (result.phone && !existing.phone) updates.phone = result.phone;

          await supabase.from('contacts').update(updates).eq('id', existing.id);
          crmContactId = existing.id as string;
          crmAction = 'updated';
          console.log(
            `[enrich-linkedin] Updated CRM contact ${existing.id} by name match — corrected LinkedIn URL: ${(existing.linkedin_url as string) || 'none'} → ${linkedinUrl}`,
          );
        } else {
          // No name match or ambiguous — create new contact
          const { data: newContact } = await supabase
            .from('contacts')
            .insert({
              first_name: result.first_name,
              last_name: result.last_name,
              email: result.email,
              phone: result.phone || null,
              title: result.title || null,
              linkedin_url: result.linkedin_url || linkedinUrl,
              company_name: result.company || null,
              contact_type: 'buyer',
              source: 'ai_command_center',
              created_by: userId,
              archived: false,
            })
            .select('id')
            .single();

          if (newContact) {
            crmContactId = newContact.id;
            crmAction = 'created';
            console.log(`[enrich-linkedin] Created new CRM contact ${newContact.id}`);
          }
        }
      } else {
        // No name info — create new contact
        const { data: newContact } = await supabase
          .from('contacts')
          .insert({
            first_name: result.first_name,
            last_name: result.last_name,
            email: result.email,
            phone: result.phone || null,
            title: result.title || null,
            linkedin_url: result.linkedin_url || linkedinUrl,
            company_name: result.company || null,
            contact_type: 'buyer',
            source: 'ai_command_center',
            created_by: userId,
            archived: false,
          })
          .select('id')
          .single();

        if (newContact) {
          crmContactId = newContact.id;
          crmAction = 'created';
          console.log(`[enrich-linkedin] Created new CRM contact ${newContact.id}`);
        }
      }
    }

    return {
      data: {
        found: true,
        name: `${result.first_name} ${result.last_name}`.trim(),
        email: result.email,
        phone: result.phone,
        title: result.title,
        company: result.company,
        linkedin_url: result.linkedin_url || linkedinUrl,
        confidence: result.confidence,
        source: result.source,
        saved_to_enriched: true,
        crm_contact_id: crmContactId || undefined,
        crm_action: crmAction || undefined,
        message: result.email
          ? `Found email for ${result.first_name} ${result.last_name}: ${result.email} (confidence: ${result.confidence})${crmAction === 'created' ? ' — new CRM contact created' : crmAction === 'updated' ? ' — existing CRM contact updated' : ''}`
          : `Found contact info but no email. Phone: ${result.phone || 'none'}. Try providing company_domain for a name+domain fallback.`,
      },
    };
  } catch (err) {
    return {
      error: `LinkedIn enrichment failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------- find_and_enrich_person ----------

export async function findAndEnrichPerson(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const personName = (args.person_name as string)?.trim();
  if (!personName) return { error: 'person_name is required' };

  const providedCompany = (args.company_name as string)?.trim() || '';
  const contactType = (args.contact_type as string) || 'all';
  const steps: string[] = [];

  // --- Step 1: Search CRM for existing contact ---
  const words = personName.split(/\s+/).filter((w) => w.length > 0);
  const orConditions: string[] = [];
  for (const word of words) {
    const escaped = word.replace(/[%_]/g, '\\$&');
    orConditions.push(`first_name.ilike.%${escaped}%`);
    orConditions.push(`last_name.ilike.%${escaped}%`);
  }

  let crmQuery = supabase
    .from('contacts')
    .select(
      'id, first_name, last_name, email, phone, title, contact_type, listing_id, remarketing_buyer_id, linkedin_url',
    )
    .eq('archived', false)
    .or(orConditions.join(','))
    .limit(10);

  if (contactType !== 'all') crmQuery = crmQuery.eq('contact_type', contactType);

  const { data: crmContacts } = await crmQuery;

  // Client-side refine: all words must match name
  const matched = (crmContacts || []).filter((c: Record<string, unknown>) => {
    const fullName =
      `${(c.first_name as string) || ''} ${(c.last_name as string) || ''}`.toLowerCase();
    return words.every((w) => fullName.includes(w.toLowerCase()));
  }) as Array<Record<string, unknown>>;

  steps.push(
    `1. CRM search for "${personName}": ${matched.length > 0 ? `found ${matched.length} match(es)` : 'no match'}`,
  );

  // If found with email — return immediately
  const withEmail = matched.find((c) => c.email);
  if (withEmail) {
    steps.push('2. Contact already has email — returning immediately');
    return {
      data: {
        found: true,
        source: 'crm_existing',
        contact_id: withEmail.id,
        name: `${withEmail.first_name} ${withEmail.last_name}`.trim(),
        email: withEmail.email,
        phone: withEmail.phone || null,
        title: withEmail.title || null,
        linkedin_url: withEmail.linkedin_url || null,
        contact_type: withEmail.contact_type,
        steps,
        message: `${withEmail.first_name} ${withEmail.last_name} already has email: ${withEmail.email}`,
      },
    };
  }

  // --- Step 2: Resolve company context ---
  const contact = matched[0]; // Best CRM match (if any)
  let companyName = providedCompany;

  if (!companyName && contact) {
    // Try to resolve from linked listing or buyer record
    if (contact.listing_id) {
      const { data: listing } = await supabase
        .from('listings')
        .select('title, category')
        .eq('id', contact.listing_id as string)
        .single();
      if (listing?.title) companyName = listing.title as string;
    }
    if (!companyName && contact.remarketing_buyer_id) {
      const { data: buyer } = await supabase
        .from('remarketing_buyers')
        .select('company_name, pe_firm_name')
        .eq('id', contact.remarketing_buyer_id as string)
        .single();
      if (buyer) companyName = ((buyer.company_name || buyer.pe_firm_name) as string) || '';
    }
  }

  steps.push(
    `2. Company resolution: ${companyName ? `"${companyName}"` : 'unknown (will use name-only search)'}`,
  );

  // --- Step 3: PRIMARY — Try Clay email lookup first ---
  {
    const clayFirstName = contact ? (contact.first_name as string) || '' : words[0] || '';
    const clayLastName = contact
      ? (contact.last_name as string) || ''
      : words.slice(1).join(' ') || '';
    const storedUrl = contact?.linkedin_url as string | undefined;
    const clayDomain = companyName ? inferDomain(companyName) : undefined;

    const hasClayLinkedIn = storedUrl?.includes('linkedin.com/in/');
    const hasClayNameDomain = !!clayFirstName && !!clayLastName && !!clayDomain;

    if (hasClayLinkedIn || hasClayNameDomain) {
      steps.push(
        `3. Trying Clay email lookup${hasClayLinkedIn ? ` (LinkedIn: ${storedUrl})` : ` (${clayFirstName} ${clayLastName} @ ${clayDomain})`}`,
      );

      try {
        const clayResult = await clayLookupEmail(supabase, userId, {
          linkedinUrl: hasClayLinkedIn ? storedUrl : undefined,
          firstName: clayFirstName || undefined,
          lastName: clayLastName || undefined,
          domain: clayDomain,
          company: companyName,
          sourceFunction: 'find_and_enrich_person',
          sourceEntityId: (contact?.id as string) || undefined,
        });

        if (clayResult.email) {
          steps.push(`3b. Clay found email: ${clayResult.email}`);

          // Update CRM contact
          if (contact?.id) {
            const updates: Record<string, unknown> = { email: clayResult.email };
            await supabase.from('contacts').update(updates).eq('id', contact.id);
            steps.push(`3c. Updated CRM contact ${contact.id} with email`);
          }

          // Save to enriched_contacts
          await supabase.from('enriched_contacts').upsert(
            {
              workspace_id: userId,
              company_name: companyName || 'Unknown',
              full_name: `${clayFirstName} ${clayLastName}`.trim(),
              first_name: clayFirstName,
              last_name: clayLastName,
              title: (contact?.title as string) || '',
              email: clayResult.email,
              phone: null,
              linkedin_url: storedUrl || '',
              confidence: 'high',
              source: clayResult.source,
              enriched_at: new Date().toISOString(),
              search_query: `person:${personName}`,
            },
            { onConflict: 'workspace_id,linkedin_url', ignoreDuplicates: false },
          );

          return {
            data: {
              found: true,
              source: clayResult.source,
              contact_id: contact?.id || null,
              name: `${clayFirstName} ${clayLastName}`.trim(),
              email: clayResult.email,
              phone: null,
              title: (contact?.title as string) || null,
              company: companyName || null,
              linkedin_url: storedUrl || null,
              confidence: 'high',
              crm_updated: !!contact?.id,
              steps,
              message: `Found email via Clay: ${clayResult.email}`,
            },
          };
        }

        steps.push(`3b. Clay did not find email — trying Prospeo fallback`);
      } catch (clayErr) {
        steps.push(
          `3b. Clay lookup failed: ${clayErr instanceof Error ? clayErr.message : String(clayErr)} — trying Prospeo`,
        );
      }
    }
  }

  // --- Step 4: If we have a LinkedIn URL, verify it and try Prospeo ---
  const storedLinkedinUrl = contact?.linkedin_url as string | undefined;
  if (storedLinkedinUrl?.includes('linkedin.com/in/')) {
    steps.push(
      `3. LinkedIn URL on record: ${storedLinkedinUrl} — verifying via Google before enriching`,
    );

    // VERIFICATION: Cross-check stored LinkedIn URL against Google discovery
    // This catches stale/wrong URLs (e.g. profile slug changed, wrong person stored)
    const firstName = (contact?.first_name as string) || words[0] || '';
    const lastName = (contact?.last_name as string) || words.slice(1).join(' ') || '';
    const title = (contact?.title as string) || '';

    let verifiedLinkedInUrl = storedLinkedinUrl;
    let linkedinVerified = false;

    try {
      const verifyDomain = companyName ? inferDomain(companyName) : undefined;
      const googleResult = await discoverLinkedInUrl(
        firstName,
        lastName,
        companyName,
        title,
        verifyDomain,
      );
      if (googleResult) {
        const storedSlug =
          storedLinkedinUrl.split('/in/')[1]?.split(/[/?#]/)[0]?.toLowerCase() || '';
        const googleSlug =
          googleResult.url.split('/in/')[1]?.split(/[/?#]/)[0]?.toLowerCase() || '';

        if (storedSlug === googleSlug) {
          steps.push(
            `3b. Google confirms stored LinkedIn URL (${googleResult.verification.join(', ')})`,
          );
          linkedinVerified = true;
        } else {
          // Google found a DIFFERENT LinkedIn profile — stored URL is likely wrong
          console.warn(
            `[find-person] Stored LinkedIn URL mismatch: stored=${storedLinkedinUrl}, google=${googleResult.url} (score: ${googleResult.score})`,
          );
          steps.push(
            `3b. Stored LinkedIn URL does NOT match Google discovery — stored: ${storedSlug}, Google found: ${googleSlug} (score: ${googleResult.score}, ${googleResult.verification.join(', ')})`,
          );

          if (googleResult.score >= 40) {
            verifiedLinkedInUrl = googleResult.url;
            steps.push(`3c. Using Google-discovered URL instead: ${googleResult.url}`);
            // Update CRM with corrected LinkedIn URL
            if (contact?.id) {
              await supabase
                .from('contacts')
                .update({ linkedin_url: googleResult.url })
                .eq('id', contact.id);
            }
          } else {
            steps.push(
              `3c. Google result score too low (${googleResult.score}) — will try stored URL first, then rediscover`,
            );
          }
        }
      } else {
        steps.push(`3b. Google search returned no LinkedIn results — proceeding with stored URL`);
      }
    } catch (err) {
      steps.push(
        `3b. Google verification failed: ${err instanceof Error ? err.message : String(err)} — proceeding with stored URL`,
      );
    }

    // Now enrich with the verified (or best available) LinkedIn URL
    try {
      const domain = companyName ? inferDomain(companyName) : undefined;
      const result = await enrichContact({
        firstName,
        lastName,
        linkedinUrl: verifiedLinkedInUrl,
        domain,
      });

      if (result?.email) {
        // Cross-validate: check that Prospeo result matches expected person
        if (companyName && result.company) {
          const validation = validateProspeoResult(result, firstName, lastName, companyName);
          if (!validation.valid && !linkedinVerified) {
            // Prospeo returned data for a different person AND we didn't verify via Google
            console.warn(`[find-person] Prospeo result mismatch: ${validation.details}`);
            steps.push(
              `4. Prospeo returned email but profile mismatch: ${validation.details} — discarding, will rediscover`,
            );
            // Fall through to Google discovery below
          } else {
            if (!validation.valid) {
              steps.push(
                `4. Note: Prospeo company doesn't match CRM (${validation.details}) but LinkedIn URL was Google-verified`,
              );
            }

            // Update CRM contact
            if (contact?.id) {
              const updates: Record<string, unknown> = { email: result.email };
              if (result.phone && !contact.phone) updates.phone = result.phone;
              if (verifiedLinkedInUrl !== storedLinkedinUrl)
                updates.linkedin_url = verifiedLinkedInUrl;
              await supabase.from('contacts').update(updates).eq('id', contact.id);
              steps.push(`4. Updated CRM contact ${contact.id} with email: ${result.email}`);
            }

            // Save to enriched_contacts for audit trail
            await supabase.from('enriched_contacts').upsert(
              {
                workspace_id: userId,
                company_name: companyName || result.company || 'Unknown',
                full_name: `${result.first_name} ${result.last_name}`.trim(),
                first_name: result.first_name,
                last_name: result.last_name,
                title: result.title || '',
                email: result.email,
                phone: result.phone,
                linkedin_url: result.linkedin_url || verifiedLinkedInUrl,
                confidence: result.confidence,
                source: `auto_enrich:${result.source}`,
                enriched_at: new Date().toISOString(),
                search_query: `person:${personName}`,
              },
              { onConflict: 'workspace_id,linkedin_url', ignoreDuplicates: false },
            );

            return {
              data: {
                found: true,
                source: 'prospeo_linkedin',
                contact_id: contact?.id || null,
                name: `${result.first_name} ${result.last_name}`.trim(),
                email: result.email,
                phone: result.phone,
                title: result.title,
                company: result.company || companyName,
                linkedin_url: result.linkedin_url || verifiedLinkedInUrl,
                confidence: result.confidence,
                linkedin_verified: linkedinVerified,
                linkedin_corrected:
                  verifiedLinkedInUrl !== storedLinkedinUrl ? storedLinkedinUrl : undefined,
                crm_updated: !!contact?.id,
                steps,
                message: `Found email for ${result.first_name} ${result.last_name}: ${result.email} (confidence: ${result.confidence})${verifiedLinkedInUrl !== storedLinkedinUrl ? ' — LinkedIn URL was corrected via Google verification' : ''}`,
              },
            };
          }
        } else {
          // No company to validate against — trust the result
          if (contact?.id) {
            const updates: Record<string, unknown> = { email: result.email };
            if (result.phone && !contact.phone) updates.phone = result.phone;
            await supabase.from('contacts').update(updates).eq('id', contact.id);
            steps.push(`4. Updated CRM contact ${contact.id} with email: ${result.email}`);
          }

          await supabase.from('enriched_contacts').upsert(
            {
              workspace_id: userId,
              company_name: result.company || 'Unknown',
              full_name: `${result.first_name} ${result.last_name}`.trim(),
              first_name: result.first_name,
              last_name: result.last_name,
              title: result.title || '',
              email: result.email,
              phone: result.phone,
              linkedin_url: result.linkedin_url || verifiedLinkedInUrl,
              confidence: result.confidence,
              source: `auto_enrich:${result.source}`,
              enriched_at: new Date().toISOString(),
              search_query: `person:${personName}`,
            },
            { onConflict: 'workspace_id,linkedin_url', ignoreDuplicates: false },
          );

          return {
            data: {
              found: true,
              source: 'prospeo_linkedin',
              contact_id: contact?.id || null,
              name: `${result.first_name} ${result.last_name}`.trim(),
              email: result.email,
              phone: result.phone,
              title: result.title,
              company: result.company || companyName,
              linkedin_url: result.linkedin_url || verifiedLinkedInUrl,
              confidence: result.confidence,
              crm_updated: !!contact?.id,
              steps,
              message: `Found email for ${result.first_name} ${result.last_name}: ${result.email} (confidence: ${result.confidence})`,
            },
          };
        }
      }
      steps.push('4. Prospeo LinkedIn lookup returned no email — trying fallback methods');
    } catch (err) {
      steps.push(
        `4. Prospeo LinkedIn enrichment failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // --- Step 4: Discover LinkedIn URL via scored Google search ---
  // This runs when: no stored URL, OR stored URL failed Prospeo, OR stored URL was invalidated
  const firstName = contact ? (contact.first_name as string) || '' : words[0] || '';
  const lastName = contact ? (contact.last_name as string) || '' : words.slice(1).join(' ') || '';
  const title = (contact?.title as string) || '';

  steps.push(`${steps.length + 1}. Discovering LinkedIn profile via scored Google search`);

  let discoveredLinkedIn: string | null = null;
  try {
    const discoverDomain = companyName ? inferDomain(companyName) : undefined;
    const googleResult = await discoverLinkedInUrl(
      firstName,
      lastName,
      companyName,
      title,
      discoverDomain,
    );

    if (googleResult) {
      discoveredLinkedIn = googleResult.url;
      steps.push(
        `${steps.length + 1}. LinkedIn found: ${discoveredLinkedIn} (score: ${googleResult.score}, ${googleResult.verification.join(', ') || 'basic match'})`,
      );

      // Update CRM with LinkedIn URL
      if (contact?.id) {
        await supabase
          .from('contacts')
          .update({ linkedin_url: discoveredLinkedIn })
          .eq('id', contact.id);
      }
    } else {
      steps.push(`${steps.length + 1}. No LinkedIn profile found via Google search`);
    }
  } catch (err) {
    steps.push(
      `${steps.length + 1}. Google search failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // --- Step 5: Enrich email from discovered LinkedIn ---
  if (discoveredLinkedIn) {
    try {
      const domain = companyName ? inferDomain(companyName) : undefined;
      const result = await enrichContact({
        firstName,
        lastName,
        linkedinUrl: discoveredLinkedIn,
        domain,
      });

      if (result?.email) {
        // Update CRM contact
        if (contact?.id) {
          const updates: Record<string, unknown> = { email: result.email };
          if (result.phone && !contact.phone) updates.phone = result.phone;
          await supabase.from('contacts').update(updates).eq('id', contact.id);
          steps.push(
            `${steps.length + 1}. Updated CRM contact ${contact.id} with email: ${result.email}`,
          );
        }

        // Save to enriched_contacts
        await supabase.from('enriched_contacts').upsert(
          {
            workspace_id: userId,
            company_name: companyName || result.company || 'Unknown',
            full_name: `${result.first_name} ${result.last_name}`.trim(),
            first_name: result.first_name,
            last_name: result.last_name,
            title: result.title || '',
            email: result.email,
            phone: result.phone,
            linkedin_url: result.linkedin_url || discoveredLinkedIn,
            confidence: result.confidence,
            source: `auto_enrich:${result.source}`,
            enriched_at: new Date().toISOString(),
            search_query: `person:${personName}`,
          },
          { onConflict: 'workspace_id,linkedin_url', ignoreDuplicates: false },
        );

        return {
          data: {
            found: true,
            source: 'auto_pipeline',
            contact_id: contact?.id || null,
            name: `${result.first_name} ${result.last_name}`.trim(),
            email: result.email,
            phone: result.phone,
            title: result.title,
            company: result.company || companyName,
            linkedin_url: result.linkedin_url || discoveredLinkedIn,
            confidence: result.confidence,
            crm_updated: !!contact?.id,
            steps,
            message: `Found email for ${result.first_name} ${result.last_name}: ${result.email} (confidence: ${result.confidence}, via LinkedIn discovery + Prospeo)`,
          },
        };
      }

      steps.push(`${steps.length + 1}. Prospeo returned no email for this LinkedIn profile`);
    } catch (err) {
      steps.push(
        `${steps.length + 1}. Prospeo enrichment failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // --- Step 6: Domain fallback — try multiple domain candidates ---
  if (companyName) {
    const domainCandidates = inferDomainCandidates(companyName);
    steps.push(
      `${steps.length + 1}. Trying name+domain fallback with ${domainCandidates.length} domain candidate(s): ${domainCandidates.join(', ')}`,
    );

    for (const domainCandidate of domainCandidates) {
      try {
        const result = await enrichContact({
          firstName,
          lastName,
          domain: domainCandidate,
        });

        if (result?.email) {
          if (contact?.id) {
            const updates: Record<string, unknown> = { email: result.email };
            if (result.phone && !contact.phone) updates.phone = result.phone;
            if (discoveredLinkedIn && !contact.linkedin_url)
              updates.linkedin_url = discoveredLinkedIn;
            await supabase.from('contacts').update(updates).eq('id', contact.id);
            steps.push(`${steps.length + 1}. Updated CRM contact with email: ${result.email}`);
          }

          return {
            data: {
              found: true,
              source: 'name_domain_fallback',
              contact_id: contact?.id || null,
              name: `${result.first_name} ${result.last_name}`.trim(),
              email: result.email,
              phone: result.phone,
              title: result.title,
              company: result.company || companyName,
              linkedin_url: discoveredLinkedIn || null,
              confidence: result.confidence,
              domain_used: domainCandidate,
              crm_updated: !!contact?.id,
              steps,
              message: `Found email via name+domain (${domainCandidate}): ${result.email} (confidence: ${result.confidence})`,
            },
          };
        }
      } catch {
        /* try next domain candidate */
      }
    }
    steps.push(
      `${steps.length + 1}. Name+domain fallback returned no email across all domain candidates`,
    );
  }

  // --- No email found through any method (Clay + Prospeo + domain fallback all failed) ---
  return {
    data: {
      found: false,
      contact_id: contact?.id || null,
      name: personName,
      company: companyName || null,
      linkedin_url: discoveredLinkedIn,
      steps,
      message:
        `Could not find email for ${personName}. Clay, Prospeo, and domain fallback all returned no results. ${discoveredLinkedIn ? `LinkedIn profile found: ${discoveredLinkedIn}` : 'No LinkedIn profile found.'} ${!companyName ? 'Providing a company_name might improve results.' : ''}`.trim(),
    },
  };
}

// ---------- find_decision_makers ----------

export async function findDecisionMakers(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const companyName = (args.company_name as string)?.trim();
  if (!companyName) return { error: 'company_name is required for decision_makers mode' };

  const companyDomain = (args.company_domain as string)?.trim() || undefined;
  const titleFilter = (args.title_filter as string[]) || [];
  const targetCount = Math.min((args.target_count as number) || 10, 25);
  const autoEnrich = args.auto_enrich !== false; // default true

  console.log(
    `[find-decision-makers] Discovering contacts at "${companyName}"${companyDomain ? ` (${companyDomain})` : ''}`,
  );

  // 1. Discover decision makers via Google search
  let discovered: DiscoveredContact[] = [];
  try {
    discovered = await discoverDecisionMakers(
      companyName,
      companyDomain,
      titleFilter.length > 0 ? titleFilter : undefined,
      Math.max(targetCount * 2, 30),
    );
  } catch (err) {
    return {
      error: `Google search for decision makers failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (discovered.length === 0) {
    return {
      data: {
        contacts: [],
        total_found: 0,
        total_enriched: 0,
        message: `No decision makers found for "${companyName}" via Google search. Try providing the company_domain or a more specific company name.`,
      },
    };
  }

  // 2. Check CRM for existing contacts — skip those already enriched
  const crmAlreadyKnown = new Set<string>();
  const { data: existingByName } = await supabase
    .from('contacts')
    .select('first_name, last_name, email')
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

  const needsEnrichment = discovered.filter((d) => {
    const nameKey = `${d.first_name.toLowerCase()}:${d.last_name.toLowerCase()}`;
    return !crmAlreadyKnown.has(nameKey);
  });

  const skippedFromCrm = discovered.length - needsEnrichment.length;
  const toProcess = needsEnrichment.slice(0, targetCount);

  // 3. Email enrichment — Clay first, Prospeo fallback
  // deno-lint-ignore no-explicit-any
  let prospeoEnrichedContacts: unknown[] = [];

  const domainCandidates = companyDomain
    ? [companyDomain, ...inferDomainCandidates(companyName).filter((d) => d !== companyDomain)]
    : inferDomainCandidates(companyName);
  const primaryDomain = domainCandidates[0] || inferDomain(companyName);

  // 3a. PRIMARY: Clay batch email lookup
  const clayEmailByLinkedIn = new Map<string, string>();

  if (autoEnrich && toProcess.length > 0) {
    const clayRequestIds = await clayBatchSend(
      supabase,
      userId,
      toProcess.map((d) => ({
        linkedinUrl: d.linkedin_url || undefined,
        firstName: d.first_name,
        lastName: d.last_name,
        domain: primaryDomain,
        company: companyName,
        title: d.title,
        sourceFunction: 'find_decision_makers',
      })),
    );

    const requestToContact = new Map<string, DiscoveredContact>();
    for (let i = 0; i < Math.min(clayRequestIds.length, toProcess.length); i++) {
      requestToContact.set(clayRequestIds[i], toProcess[i]);
    }

    const clayEmails = await clayBatchPoll(supabase, clayRequestIds);
    console.log(
      `[find-decision-makers] Clay returned ${clayEmails.size}/${clayRequestIds.length} emails`,
    );

    for (const [reqId, email] of clayEmails) {
      const c = requestToContact.get(reqId);
      if (c?.linkedin_url) {
        clayEmailByLinkedIn.set(c.linkedin_url.toLowerCase(), email);
      }
    }

    // 3b. FALLBACK: Prospeo for contacts Clay didn't find
    const stillNeedsEmail = toProcess.filter(
      (d) => !clayEmailByLinkedIn.has((d.linkedin_url || '').toLowerCase()),
    );

    if (stillNeedsEmail.length > 0) {
      try {
        prospeoEnrichedContacts = await batchEnrich(
          stillNeedsEmail.map((d) => ({
            firstName: d.first_name,
            lastName: d.last_name,
            linkedinUrl: d.linkedin_url,
            domain: primaryDomain,
            title: d.title,
            company: companyName,
          })),
          3,
        );
      } catch (err) {
        console.warn(
          `[find-decision-makers] Prospeo enrichment failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Domain search fallback if Prospeo didn't find enough
      if (prospeoEnrichedContacts.length < stillNeedsEmail.length / 2) {
        for (const domainCandidate of domainCandidates.slice(0, 3)) {
          if (prospeoEnrichedContacts.length >= stillNeedsEmail.length) break;
          try {
            const domainResults = await domainSearchEnrich(
              domainCandidate,
              stillNeedsEmail.length - prospeoEnrichedContacts.length,
            );
            prospeoEnrichedContacts = [...prospeoEnrichedContacts, ...domainResults];
          } catch {
            /* non-critical */
          }
        }
      }
    }
  }

  // 4. Build final results — merge Clay + Prospeo + discovered contacts
  // deno-lint-ignore no-explicit-any
  const prospeoByLinkedIn = new Map<string, any>();
  // deno-lint-ignore no-explicit-any
  for (const e of prospeoEnrichedContacts) {
    if (e.linkedin_url) {
      prospeoByLinkedIn.set(e.linkedin_url.toLowerCase(), e);
    }
  }

  const finalContacts = toProcess.map((d) => {
    const clayEmail = clayEmailByLinkedIn.get(d.linkedin_url?.toLowerCase() || '');
    const prospeoData = prospeoByLinkedIn.get(d.linkedin_url?.toLowerCase() || '');

    if (clayEmail) {
      return {
        first_name: d.first_name,
        last_name: d.last_name,
        title: d.title || '',
        email: clayEmail,
        phone: null as string | null,
        linkedin_url: d.linkedin_url,
        company_name: companyName,
        confidence: 'high' as string,
        source: 'clay',
        discovery_confidence: d.confidence,
      };
    }

    return {
      first_name: prospeoData?.first_name || d.first_name,
      last_name: prospeoData?.last_name || d.last_name,
      title: d.title || prospeoData?.title || '',
      email: (prospeoData?.email as string) || null,
      phone: (prospeoData?.phone as string) || null,
      linkedin_url: d.linkedin_url,
      company_name: companyName,
      confidence: (prospeoData?.confidence as string) || (d.confidence >= 60 ? 'medium' : 'low'),
      source: (prospeoData?.source as string) || 'google_discovery',
      discovery_confidence: d.confidence,
    };
  });

  // 5. Save to enriched_contacts
  if (finalContacts.length > 0) {
    const toSave = finalContacts
      .filter((c) => c.linkedin_url)
      .map((c) => ({
        workspace_id: userId,
        company_name: companyName,
        full_name: `${c.first_name} ${c.last_name}`.trim(),
        first_name: c.first_name,
        last_name: c.last_name,
        title: c.title,
        email: c.email,
        phone: c.phone,
        linkedin_url: c.linkedin_url,
        confidence: c.confidence,
        source: `decision_makers:${c.source}`,
        enriched_at: new Date().toISOString(),
        search_query: `decision_makers:${companyName}`,
      }));

    if (toSave.length > 0) {
      await supabase.from('enriched_contacts').upsert(toSave, {
        onConflict: 'workspace_id,linkedin_url',
        ignoreDuplicates: true,
      });
    }
  }

  const withEmail = finalContacts.filter((c) => c.email);
  return {
    data: {
      contacts: finalContacts,
      total_discovered: discovered.length,
      total_found: finalContacts.length,
      total_enriched: withEmail.length,
      skipped_already_in_crm: skippedFromCrm,
      message: `Found ${finalContacts.length} decision makers at "${companyName}" (${withEmail.length} with email)${skippedFromCrm > 0 ? ` — skipped ${skippedFromCrm} already in CRM` : ''}`,
    },
  };
}

// ---------- find_contact_linkedin ----------

export async function findContactLinkedIn(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  _userId: string,
): Promise<ToolResult> {
  const contactIds = args.contact_ids as string[] | undefined;
  const contactType = (args.contact_type as string) || 'seller';
  const limit = Math.min((args.limit as number) || 5, 10);
  const autoUpdate = (args.auto_update as boolean) || false;

  // 1. Fetch contacts that need LinkedIn URLs
  let contactQuery = supabase
    .from('contacts')
    .select('id, first_name, last_name, title, listing_id, remarketing_buyer_id, contact_type')
    .eq('archived', false)
    .is('linkedin_url', null)
    .limit(limit);

  if (contactIds?.length) {
    contactQuery = contactQuery.in('id', contactIds);
  } else {
    if (contactType !== 'all') contactQuery = contactQuery.eq('contact_type', contactType);
  }

  const { data: contacts, error: contactError } = await contactQuery;
  if (contactError) return { error: `Failed to fetch contacts: ${contactError.message}` };
  if (!contacts?.length) {
    return {
      data: {
        matches: [],
        total_searched: 0,
        message: 'No contacts found missing LinkedIn URLs matching the criteria.',
      },
    };
  }

  // 2. Resolve company names from linked listings or buyer records
  const listingIds = [
    ...new Set(
      contacts.map((c: Record<string, unknown>) => c.listing_id as string).filter(Boolean),
    ),
  ];
  const buyerIds = [
    ...new Set(
      contacts
        .map((c: Record<string, unknown>) => c.remarketing_buyer_id as string)
        .filter(Boolean),
    ),
  ];

  const listingMap: Record<string, { title: string; category: string }> = {};
  const buyerMap: Record<string, { company_name: string }> = {};

  if (listingIds.length > 0) {
    const { data: listings } = await supabase
      .from('listings')
      .select('id, title, category')
      .in('id', listingIds);
    if (listings) {
      for (const l of listings) {
        listingMap[l.id] = { title: l.title || '', category: l.category || '' };
      }
    }
  }

  if (buyerIds.length > 0) {
    const { data: buyers } = await supabase
      .from('remarketing_buyers')
      .select('id, company_name, pe_firm_name')
      .in('id', buyerIds);
    if (buyers) {
      for (const b of buyers) {
        buyerMap[b.id] = { company_name: b.company_name || b.pe_firm_name || '' };
      }
    }
  }

  // 3. Search Google for each contact's LinkedIn profile
  const matches: LinkedInMatch[] = [];
  const errors: string[] = [];

  for (const contact of contacts as Array<Record<string, unknown>>) {
    const firstName = (contact.first_name as string) || '';
    const lastName = (contact.last_name as string) || '';
    const title = (contact.title as string) || '';
    const fullName = `${firstName} ${lastName}`.trim();

    if (!fullName) {
      errors.push(`Contact ${contact.id}: skipped — no name`);
      continue;
    }

    // Resolve company context
    let companyName = '';
    if (contact.listing_id && listingMap[contact.listing_id as string]) {
      companyName = listingMap[contact.listing_id as string].title;
    } else if (contact.remarketing_buyer_id && buyerMap[contact.remarketing_buyer_id as string]) {
      companyName = buyerMap[contact.remarketing_buyer_id as string].company_name;
    }

    // Use discoverLinkedInUrl for scored, multi-strategy search
    const searchDomain = companyName ? inferDomain(companyName) : undefined;

    try {
      const googleResult = await discoverLinkedInUrl(
        firstName,
        lastName,
        companyName,
        title,
        searchDomain,
      );

      if (!googleResult) {
        matches.push({
          contact_id: contact.id as string,
          contact_name: fullName,
          contact_title: title,
          company_name: companyName,
          linkedin_url: null,
          confidence: 'low',
          verification: ['No LinkedIn profile found via scored Google search'],
          search_query: `"${fullName}" "${companyName}" site:linkedin.com/in`,
          updated: false,
        });
        // Rate limit between searches
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      // Map score to confidence levels
      const confidence: 'high' | 'medium' | 'low' =
        googleResult.score >= 50 ? 'high' : googleResult.score >= 30 ? 'medium' : 'low';

      const match: LinkedInMatch = {
        contact_id: contact.id as string,
        contact_name: fullName,
        contact_title: title,
        company_name: companyName,
        linkedin_url: googleResult.url,
        confidence,
        verification: googleResult.verification,
        search_query: `"${fullName}" "${companyName}" site:linkedin.com/in`,
        updated: false,
      };

      // Auto-update if requested and confidence is high
      if (autoUpdate && confidence === 'high') {
        const { error: updateError } = await supabase
          .from('contacts')
          .update({ linkedin_url: googleResult.url })
          .eq('id', contact.id);

        if (!updateError) {
          match.updated = true;
          console.log(
            `[find-contact-linkedin] Updated contact ${contact.id} with LinkedIn URL: ${googleResult.url}`,
          );
        } else {
          errors.push(`Failed to update contact ${contact.id}: ${updateError.message}`);
        }
      }

      matches.push(match);

      // Rate limit: 500ms between Google searches to avoid 429s
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      errors.push(
        `Contact ${contact.id} (${fullName}): search failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const highConfidence = matches.filter((m) => m.confidence === 'high' && m.linkedin_url);
  const mediumConfidence = matches.filter((m) => m.confidence === 'medium' && m.linkedin_url);
  const notFound = matches.filter((m) => !m.linkedin_url);
  const updated = matches.filter((m) => m.updated);

  return {
    data: {
      matches,
      total_searched: contacts.length,
      found: matches.filter((m) => m.linkedin_url).length,
      high_confidence: highConfidence.length,
      medium_confidence: mediumConfidence.length,
      not_found: notFound.length,
      auto_updated: updated.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Searched ${contacts.length} contacts: found ${matches.filter((m) => m.linkedin_url).length} LinkedIn profiles (${highConfidence.length} high confidence, ${mediumConfidence.length} medium)${updated.length > 0 ? ` — ${updated.length} auto-updated in CRM` : ''}`,
      next_steps: autoUpdate
        ? 'High-confidence matches have been saved. Review medium/low confidence matches and use enrich_contact(mode: "linkedin") to get their emails.'
        : 'Review the matches above. To save them, call find_contact(mode: "linkedin_search") again with auto_update=true, or manually update individual contacts. Then use enrich_contact(mode: "linkedin") on each LinkedIn URL to find their emails.',
    },
  };
}
