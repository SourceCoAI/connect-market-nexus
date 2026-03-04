/**
 * Contact & Document Tools
 * Unified contacts table (buyer + seller), data room documents, deal memos.
 * Updated Feb 2026: All contact queries now use the unified `contacts` table.
 * Legacy tables (pe_firm_contacts, platform_contacts) have been dropped.
 * remarketing_buyer_contacts is frozen (read-only pre-Feb 2026 data).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
type SupabaseClient = ReturnType<typeof createClient>;
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';

// ---------- Tool definitions ----------

export const contactTools: ClaudeTool[] = [
  {
    name: 'search_pe_contacts',
    description:
      'Search buyer contacts at PE firms and platform companies — partners, principals, deal team members, corp dev contacts. Queries the unified contacts table (contact_type=buyer). Includes email, phone, LinkedIn, role, and priority level. Use to find the right person to contact at a buyer organization. Supports searching by firm/company name via firm_name parameter.',
    input_schema: {
      type: 'object',
      properties: {
        buyer_id: {
          type: 'string',
          description:
            'Filter to contacts for a specific remarketing_buyer UUID (via remarketing_buyer_id)',
        },
        firm_id: {
          type: 'string',
          description: 'Filter to contacts at a specific firm (via firm_id → firm_agreements)',
        },
        firm_name: {
          type: 'string',
          description:
            'Search by firm/company name (e.g. "Trivest", "Audax"). Looks up the firm in firm_agreements and buyers tables, then filters contacts by matching IDs.',
        },
        search: {
          type: 'string',
          description: 'Search across first_name, last_name, title, email',
        },
        role_category: {
          type: 'string',
          description:
            'Filter by role: partner, principal, director, vp, associate, analyst, operating_partner, ceo, cfo, coo, corp_dev, business_dev',
        },
        is_primary: {
          type: 'boolean',
          description: 'Filter to primary contacts at their firm only',
        },
        has_email: {
          type: 'boolean',
          description:
            'true = only contacts WITH email, false = only contacts WITHOUT email (missing email)',
        },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: [],
    },
  },
  {
    name: 'search_contacts',
    description:
      'Search the unified contacts table — the source of truth for ALL buyer and seller contacts since Feb 2026. Use contact_type to filter: "buyer" for PE/platform/independent buyers, "seller" for deal owners/principals. Seller contacts are linked to deals via listing_id. Buyer contacts link to buyers via remarketing_buyer_id. Use has_email=false to find contacts missing email addresses. IMPORTANT: Use company_name to find contacts at a specific company — this searches both deal titles (for sellers) and buyer company names (for buyers) with fuzzy matching. For example, to find "Ryan at Essential Benefit Administrators", use search="Ryan" and company_name="Essential Benefit Administrators".',
    input_schema: {
      type: 'object',
      properties: {
        contact_type: {
          type: 'string',
          enum: ['buyer', 'seller', 'advisor', 'internal', 'all'],
          description: 'Filter by contact type (default "all")',
        },
        listing_id: { type: 'string', description: 'Filter seller contacts by deal/listing UUID' },
        remarketing_buyer_id: {
          type: 'string',
          description: 'Filter buyer contacts by remarketing buyer UUID',
        },
        firm_id: { type: 'string', description: 'Filter buyer contacts by firm agreement UUID' },
        company_name: {
          type: 'string',
          description:
            'Search by company/deal name (e.g. "Essential Benefit Administrators", "Acme Corp"). Fuzzy-matches against deal titles, internal company names, and buyer company names, then filters contacts linked to those deals/buyers. Use this when the user asks for a contact "at" a specific company.',
        },
        search: {
          type: 'string',
          description: 'Search across first_name, last_name, title, email',
        },
        is_primary: { type: 'boolean', description: 'Filter to primary contacts at their firm' },
        has_email: {
          type: 'boolean',
          description:
            'true = only contacts WITH email, false = only contacts WITHOUT email (missing email)',
        },
        nda_signed: { type: 'boolean', description: 'Filter by NDA signed status' },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: [],
    },
  },
  {
    name: 'get_deal_documents',
    description:
      'Get documents associated with a deal — teasers, full memos, data room files. Includes file names, types, categories, and upload dates.',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'Filter by deal/listing UUID' },
        category: {
          type: 'string',
          description: 'Filter by: anonymous_teaser, full_memo, data_room',
        },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: [],
    },
  },
  {
    name: 'get_firm_agreements',
    description:
      'Get firm agreement status — which buyer firms/companies have signed NDAs and/or fee agreements. Each firm record consolidates all NDA and fee agreement activity for a company across all its members and connection requests.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search by company name or domain' },
        has_nda: { type: 'boolean', description: 'Filter to firms that have signed an NDA' },
        has_fee_agreement: {
          type: 'boolean',
          description: 'Filter to firms that have signed a fee agreement',
        },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: [],
    },
  },
  {
    name: 'get_nda_logs',
    description:
      'Get NDA action logs — history of NDA emails sent, signed, revoked, and reminders sent. Each entry records the action type, recipient, admin who took the action, and timestamp. Use to audit NDA activity for a user or firm.',
    input_schema: {
      type: 'object',
      properties: {
        firm_id: { type: 'string', description: 'Filter by firm agreement UUID' },
        action_type: {
          type: 'string',
          description: 'Filter by action: sent, signed, revoked, reminder_sent',
        },
        days: { type: 'number', description: 'Lookback period in days (default 90)' },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: [],
    },
  },
  {
    name: 'get_deal_memos',
    description:
      'Get AI-generated deal memos and teasers for a deal — anonymous teasers, full investment memos. Includes content, status, version, and publish dates.',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'Filter by deal/listing UUID' },
        memo_type: {
          type: 'string',
          enum: ['anonymous_teaser', 'full_memo', 'all'],
          description: 'Filter by memo type (default "all")',
        },
        status: { type: 'string', description: 'Filter by status: draft, published, archived' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: [],
    },
  },
];

// ---------- Executor ----------

export async function executeContactTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (toolName) {
    case 'search_pe_contacts':
      return searchPeContacts(supabase, args);
    case 'search_contacts':
      return searchContacts(supabase, args);
    case 'get_firm_agreements':
      return getFirmAgreements(supabase, args);
    case 'get_nda_logs':
      return getNdaLogs(supabase, args);
    case 'get_deal_documents':
      return getDealDocuments(supabase, args);
    case 'get_deal_memos':
      return getDealMemos(supabase, args);
    default:
      return { error: `Unknown contact tool: ${toolName}` };
  }
}

// ---------- Implementations ----------

/**
 * Search buyer contacts via the unified contacts table.
 * Replaces legacy queries to pe_firm_contacts, platform_contacts (both dropped),
 * and remarketing_buyer_contacts (frozen pre-Feb 2026).
 */
async function searchPeContacts(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 50, 500);

  const contactFields =
    'id, first_name, last_name, email, phone, title, contact_type, firm_id, remarketing_buyer_id, profile_id, is_primary_at_firm, nda_signed, fee_agreement_signed, linkedin_url, source, archived, created_at';

  // If firm_name is provided, look up matching firm_ids and buyer_ids first
  let firmIds: string[] = [];
  let buyerIds: string[] = [];
  let firmNameUsed = false;

  if (args.firm_name) {
    firmNameUsed = true;
    const firmTerm = (args.firm_name as string).toLowerCase();
    const firmWords = firmTerm.split(/\s+/).filter((w) => w.length > 2);

    // Search firm_agreements for matching company names (with fuzzy matching)
    const { data: firms } = await supabase
      .from('firm_agreements')
      .select('id, primary_company_name')
      .limit(500);

    if (firms) {
      firmIds = firms
        .filter((f: Record<string, unknown>) => {
          const name = ((f.primary_company_name as string) || '').toLowerCase();
          if (name.includes(firmTerm)) return true;
          // Fuzzy: all words must match within the company name
          if (firmWords.length > 1 && firmWords.every((w) => fuzzyContains(name, w))) return true;
          if (firmTerm.length >= 4 && fuzzyContains(name, firmTerm)) return true;
          return false;
        })
        .map((f: Record<string, unknown>) => f.id as string);
    }

    // Also search buyers for matching company/PE firm names (with fuzzy matching)
    const { data: buyers } = await supabase
      .from('buyers')
      .select('id, company_name, pe_firm_name')
      .eq('archived', false)
      .limit(500);

    if (buyers) {
      buyerIds = buyers
        .filter((b: Record<string, unknown>) => {
          const compName = ((b.company_name as string) || '').toLowerCase();
          const peName = ((b.pe_firm_name as string) || '').toLowerCase();
          const combined = `${compName} ${peName}`;
          if (combined.includes(firmTerm)) return true;
          if (firmWords.length > 1 && firmWords.every((w) => fuzzyContains(combined, w)))
            return true;
          if (
            firmTerm.length >= 4 &&
            (fuzzyContains(compName, firmTerm) || fuzzyContains(peName, firmTerm))
          )
            return true;
          return false;
        })
        .map((b: Record<string, unknown>) => b.id as string);
    }

    // If no matching firms or buyers found, return early with helpful message
    if (firmIds.length === 0 && buyerIds.length === 0) {
      return {
        data: {
          contacts: [],
          total: 0,
          with_email: 0,
          source: 'unified_contacts_table',
          firm_name_searched: args.firm_name,
          note: `No firm or buyer matching "${args.firm_name}" found in the database. The firm may need to be enriched/imported first.`,
        },
      };
    }
  }

  let query = supabase
    .from('contacts')
    .select(contactFields)
    .eq('contact_type', 'buyer')
    .eq('archived', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (args.buyer_id) query = query.eq('remarketing_buyer_id', args.buyer_id as string);
  if (args.firm_id) query = query.eq('firm_id', args.firm_id as string);

  // Apply firm_name filter via resolved IDs
  if (firmNameUsed && !args.buyer_id && !args.firm_id) {
    const orClauses: string[] = [];
    if (firmIds.length > 0) {
      orClauses.push(`firm_id.in.(${firmIds.join(',')})`);
    }
    if (buyerIds.length > 0) {
      orClauses.push(`remarketing_buyer_id.in.(${buyerIds.join(',')})`);
    }
    if (orClauses.length > 0) {
      query = query.or(orClauses.join(','));
    }
  }

  // Database-level search filter using ilike for name/email/title matching
  if (args.search) {
    const searchTerm = (args.search as string).trim();
    const words = searchTerm.split(/\s+/).filter((w) => w.length > 0);
    const orConditions: string[] = [];

    for (const word of words) {
      const escaped = word.replace(/[%_]/g, '\\$&');
      orConditions.push(`first_name.ilike.%${escaped}%`);
      orConditions.push(`last_name.ilike.%${escaped}%`);
      orConditions.push(`email.ilike.%${escaped}%`);
      orConditions.push(`title.ilike.%${escaped}%`);
    }

    if (orConditions.length > 0) {
      query = query.or(orConditions.join(','));
    }
  }

  if (args.role_category) {
    // Match role_category against title using case-insensitive contains
    // since titles may be "Vice President" vs filter "vp"
    const roleMap: Record<string, string[]> = {
      vp: ['vp', 'vice president'],
      principal: ['principal'],
      associate: ['associate'],
      partner: ['partner', 'managing partner'],
      director: ['director', 'managing director'],
      analyst: ['analyst'],
      operating_partner: ['operating partner'],
      ceo: ['ceo', 'chief executive'],
      cfo: ['cfo', 'chief financial'],
      coo: ['coo', 'chief operating'],
      corp_dev: ['corporate development', 'corp dev'],
      business_dev: ['business development', 'biz dev'],
    };
    // We'll filter client-side for role matching since ilike doesn't support OR
    const _roleTerms = roleMap[(args.role_category as string).toLowerCase()] || [
      (args.role_category as string).toLowerCase(),
    ];
    // Store for client-side filter below
    (args as Record<string, unknown>)._roleTerms = _roleTerms;
  }

  if (args.is_primary === true) query = query.eq('is_primary_at_firm', true);
  if (args.has_email === true) query = query.not('email', 'is', null);
  if (args.has_email === false) query = query.is('email', null);

  const { data, error } = await query;
  if (error) return { error: error.message };

  let results = (data || []) as Array<Record<string, unknown>>;

  // Client-side role filter with fuzzy title matching
  if ((args as Record<string, unknown>)._roleTerms) {
    const roleTerms = (args as Record<string, unknown>)._roleTerms as string[];
    results = results.filter((c) => {
      const title = (c.title as string)?.toLowerCase() || '';
      return roleTerms.some((term) => title.includes(term));
    });
  }

  // Client-side post-filter for multi-word search precision
  // DB search is broad (OR across words), so refine to ensure all words match
  if (args.search) {
    const words = (args.search as string)
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    if (words.length > 1) {
      results = results.filter((c) => {
        const fullName =
          `${(c.first_name as string) || ''} ${(c.last_name as string) || ''}`.toLowerCase();
        const email = (c.email as string)?.toLowerCase() || '';
        const title = (c.title as string)?.toLowerCase() || '';
        return words.every((w) => fullName.includes(w) || email.includes(w) || title.includes(w));
      });
    }
  }

  // Fallback: if searching by name and no results, also check enriched_contacts
  let enrichedResults: Array<Record<string, unknown>> = [];
  if (args.search && results.length === 0) {
    enrichedResults = await searchEnrichedContacts(supabase, args.search as string, limit);
  }

  return {
    data: {
      contacts: results.slice(0, limit),
      total: results.length,
      with_email: results.filter((c) => c.email).length,
      source: 'unified_contacts_table',
      firm_name_searched: args.firm_name || null,
      firm_ids_matched: firmNameUsed ? firmIds.length : undefined,
      buyer_ids_matched: firmNameUsed ? buyerIds.length : undefined,
      enriched_contacts: enrichedResults.length > 0 ? enrichedResults : undefined,
      enriched_note:
        enrichedResults.length > 0
          ? `No matches in CRM contacts, but found ${enrichedResults.length} match(es) in previously enriched contacts (not yet saved to CRM). Use save_contacts_to_crm to add them.`
          : undefined,
    },
  };
}

/**
 * Search the enriched_contacts table (Prospeo/Apify results not yet saved to CRM).
 * Used as a fallback when the main contacts table has no matches.
 */
async function searchEnrichedContacts(
  supabase: SupabaseClient,
  searchTerm: string,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  const words = searchTerm
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const orConditions: string[] = [];

  for (const word of words) {
    const escaped = word.replace(/[%_]/g, '\\$&');
    orConditions.push(`first_name.ilike.%${escaped}%`);
    orConditions.push(`last_name.ilike.%${escaped}%`);
    orConditions.push(`full_name.ilike.%${escaped}%`);
    orConditions.push(`email.ilike.%${escaped}%`);
  }

  if (orConditions.length === 0) return [];

  const { data, error } = await supabase
    .from('enriched_contacts')
    .select(
      'id, full_name, first_name, last_name, email, phone, title, company_name, linkedin_url, confidence, source, enriched_at',
    )
    .or(orConditions.join(','))
    .order('enriched_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  let results = data as Array<Record<string, unknown>>;

  // Multi-word precision filter
  if (words.length > 1) {
    const lowerWords = words.map((w) => w.toLowerCase());
    results = results.filter((c) => {
      const fullName = (
        (c.full_name as string) ||
        `${(c.first_name as string) || ''} ${(c.last_name as string) || ''}`
      ).toLowerCase();
      const email = (c.email as string)?.toLowerCase() || '';
      return lowerWords.every((w) => fullName.includes(w) || email.includes(w));
    });
  }

  return results;
}

/**
 * Simple fuzzy match: checks if target contains a close match to query (1 edit distance tolerance).
 * Used for company name matching to handle typos like "Advisors" vs "Administrators".
 */
function fuzzyContains(target: string, query: string): boolean {
  if (target.includes(query)) return true;
  if (query.length < 4) return false;
  for (let i = 0; i <= target.length - query.length + 1; i++) {
    const sub = target.substring(i, i + query.length);
    let dist = 0;
    for (let j = 0; j < query.length; j++) {
      if (sub[j] !== query[j]) dist++;
      if (dist > 1) break;
    }
    if (dist <= 1) return true;
  }
  return false;
}

/**
 * Resolve company_name to matching listing_ids and remarketing_buyer_ids.
 * Uses fuzzy matching against deal titles, internal company names, project names,
 * and buyer company/PE firm names.
 */
async function resolveCompanyName(
  supabase: SupabaseClient,
  companyName: string,
): Promise<{ listingIds: string[]; buyerIds: string[]; matchedNames: string[] }> {
  const term = companyName.toLowerCase().trim();
  const words = term.split(/\s+/).filter((w) => w.length > 2);

  const listingIds: string[] = [];
  const buyerIds: string[] = [];
  const matchedNames: string[] = [];

  // Search listings (deals) by title, internal_company_name, project_name, deal_identifier
  const { data: listings } = await supabase
    .from('listings')
    .select('id, title, internal_company_name, project_name, deal_identifier')
    .is('deleted_at', null)
    .limit(2000);

  if (listings) {
    for (const l of listings as Array<Record<string, unknown>>) {
      const title = ((l.title as string) || '').toLowerCase();
      const internalName = ((l.internal_company_name as string) || '').toLowerCase();
      const projectName = ((l.project_name as string) || '').toLowerCase();
      const dealIdentifier = ((l.deal_identifier as string) || '').toLowerCase();
      const combined = `${title} ${internalName} ${projectName} ${dealIdentifier}`;

      // Exact substring match
      if (combined.includes(term)) {
        listingIds.push(l.id as string);
        matchedNames.push((l.title || l.internal_company_name || l.project_name) as string);
        continue;
      }

      // Multi-word fuzzy: all words must fuzzy-match somewhere
      if (words.length > 1 && words.every((w) => fuzzyContains(combined, w))) {
        listingIds.push(l.id as string);
        matchedNames.push((l.title || l.internal_company_name || l.project_name) as string);
        continue;
      }

      // Single-term fuzzy for entity names
      if (term.length >= 4 && (fuzzyContains(title, term) || fuzzyContains(internalName, term))) {
        listingIds.push(l.id as string);
        matchedNames.push((l.title || l.internal_company_name || l.project_name) as string);
      }
    }
  }

  // Search buyers by company_name and pe_firm_name
  const { data: buyers } = await supabase
    .from('buyers')
    .select('id, company_name, pe_firm_name')
    .eq('archived', false)
    .limit(2000);

  if (buyers) {
    for (const b of buyers as Array<Record<string, unknown>>) {
      const compName = ((b.company_name as string) || '').toLowerCase();
      const peName = ((b.pe_firm_name as string) || '').toLowerCase();
      const combined = `${compName} ${peName}`;

      if (combined.includes(term)) {
        buyerIds.push(b.id as string);
        matchedNames.push((b.company_name || b.pe_firm_name) as string);
        continue;
      }

      if (words.length > 1 && words.every((w) => fuzzyContains(combined, w))) {
        buyerIds.push(b.id as string);
        matchedNames.push((b.company_name || b.pe_firm_name) as string);
        continue;
      }

      if (term.length >= 4 && (fuzzyContains(compName, term) || fuzzyContains(peName, term))) {
        buyerIds.push(b.id as string);
        matchedNames.push((b.company_name || b.pe_firm_name) as string);
      }
    }
  }

  return { listingIds, buyerIds, matchedNames };
}

/**
 * Search the unified contacts table — source of truth for ALL contacts (buyer + seller + advisor + internal).
 * Added Feb 2026 as part of the unified contacts migration.
 * Updated Feb 2026: Added company_name parameter for fuzzy company/deal name resolution.
 */
async function searchContacts(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 50, 500);
  const contactType = (args.contact_type as string) || 'all';

  const contactFields =
    'id, first_name, last_name, email, phone, title, contact_type, firm_id, remarketing_buyer_id, profile_id, listing_id, is_primary_at_firm, nda_signed, fee_agreement_signed, linkedin_url, source, archived, created_at';

  // If company_name is provided, resolve to listing_ids and buyer_ids first
  let companyListingIds: string[] = [];
  let companyBuyerIds: string[] = [];
  let companyNameUsed = false;
  let companyMatchedNames: string[] = [];

  if (args.company_name) {
    companyNameUsed = true;
    const resolved = await resolveCompanyName(supabase, args.company_name as string);
    companyListingIds = resolved.listingIds;
    companyBuyerIds = resolved.buyerIds;
    companyMatchedNames = resolved.matchedNames;

    // If no matching companies/deals found, return early with helpful message
    if (companyListingIds.length === 0 && companyBuyerIds.length === 0) {
      return {
        data: {
          contacts: [],
          total: 0,
          with_email: 0,
          with_linkedin: 0,
          source: 'unified_contacts_table',
          company_name_searched: args.company_name,
          note: `No deal or company matching "${args.company_name}" found in the database. Try query_deals with a broader search term, or check the exact company name in Active Deals.`,
        },
      };
    }
  }

  let query = supabase
    .from('contacts')
    .select(contactFields)
    .eq('archived', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (contactType !== 'all') query = query.eq('contact_type', contactType);
  if (args.listing_id) query = query.eq('listing_id', args.listing_id as string);
  if (args.remarketing_buyer_id)
    query = query.eq('remarketing_buyer_id', args.remarketing_buyer_id as string);
  if (args.firm_id) query = query.eq('firm_id', args.firm_id as string);

  // Apply company_name filter via resolved listing/buyer IDs
  if (companyNameUsed && !args.listing_id && !args.remarketing_buyer_id) {
    const orClauses: string[] = [];
    if (companyListingIds.length > 0) {
      orClauses.push(`listing_id.in.(${companyListingIds.join(',')})`);
    }
    if (companyBuyerIds.length > 0) {
      orClauses.push(`remarketing_buyer_id.in.(${companyBuyerIds.join(',')})`);
    }
    if (orClauses.length > 0) {
      query = query.or(orClauses.join(','));
    }
  }

  if (args.is_primary === true) query = query.eq('is_primary_at_firm', true);
  if (args.has_email === true) query = query.not('email', 'is', null);
  if (args.has_email === false) query = query.is('email', null);
  if (args.nda_signed === true) query = query.eq('nda_signed', true);
  if (args.nda_signed === false) query = query.eq('nda_signed', false);

  // Database-level search filter using ilike for name/email/title matching
  if (args.search) {
    const searchTerm = (args.search as string).trim();
    const words = searchTerm.split(/\s+/).filter((w) => w.length > 0);
    const orConditions: string[] = [];

    for (const word of words) {
      const escaped = word.replace(/[%_]/g, '\\$&');
      orConditions.push(`first_name.ilike.%${escaped}%`);
      orConditions.push(`last_name.ilike.%${escaped}%`);
      orConditions.push(`email.ilike.%${escaped}%`);
      orConditions.push(`title.ilike.%${escaped}%`);
    }

    if (orConditions.length > 0) {
      query = query.or(orConditions.join(','));
    }
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  let results = (data || []) as Array<Record<string, unknown>>;

  // Client-side post-filter for multi-word search precision
  // DB search is broad (OR across words), so refine to ensure all words match
  if (args.search) {
    const words = (args.search as string)
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    if (words.length > 1) {
      results = results.filter((c) => {
        const fullName =
          `${(c.first_name as string) || ''} ${(c.last_name as string) || ''}`.toLowerCase();
        const email = (c.email as string)?.toLowerCase() || '';
        const title = (c.title as string)?.toLowerCase() || '';
        return words.every((w) => fullName.includes(w) || email.includes(w) || title.includes(w));
      });
    }
  }

  // Resolve company context from linked listings and buyers
  // This gives Claude the company name so it can auto-enrich without asking the user
  if (results.length > 0) {
    const listingIds = [...new Set(results.map((c) => c.listing_id as string).filter(Boolean))];
    const buyerIds = [
      ...new Set(results.map((c) => c.remarketing_buyer_id as string).filter(Boolean)),
    ];

    const listingMap: Record<string, string> = {};
    const buyerMap: Record<string, string> = {};

    if (listingIds.length > 0) {
      const { data: listings } = await supabase
        .from('listings')
        .select('id, title')
        .in('id', listingIds);
      if (listings) {
        for (const l of listings as Array<Record<string, unknown>>) {
          if (l.title) listingMap[l.id as string] = l.title as string;
        }
      }
    }

    if (buyerIds.length > 0) {
      const { data: buyers } = await supabase
        .from('buyers')
        .select('id, company_name, pe_firm_name')
        .in('id', buyerIds);
      if (buyers) {
        for (const b of buyers as Array<Record<string, unknown>>) {
          buyerMap[b.id as string] = (b.company_name || b.pe_firm_name || '') as string;
        }
      }
    }

    // Attach company_name to each contact
    for (const c of results) {
      if (c.listing_id && listingMap[c.listing_id as string]) {
        c.company_name = listingMap[c.listing_id as string];
      } else if (c.remarketing_buyer_id && buyerMap[c.remarketing_buyer_id as string]) {
        c.company_name = buyerMap[c.remarketing_buyer_id as string];
      }
    }
  }

  // Fallback: if searching by name and no results, also check enriched_contacts
  let enrichedResults: Array<Record<string, unknown>> = [];
  if (args.search && results.length === 0) {
    enrichedResults = await searchEnrichedContacts(supabase, args.search as string, limit);
  }

  return {
    data: {
      contacts: results.slice(0, limit),
      total: results.length,
      with_email: results.filter((c) => c.email).length,
      with_linkedin: results.filter((c) => c.linkedin_url).length,
      by_type: {
        buyer: results.filter((c) => c.contact_type === 'buyer').length,
        seller: results.filter((c) => c.contact_type === 'seller').length,
        advisor: results.filter((c) => c.contact_type === 'advisor').length,
        internal: results.filter((c) => c.contact_type === 'internal').length,
      },
      source: 'unified_contacts_table',
      company_name_searched: companyNameUsed ? args.company_name : undefined,
      company_matches:
        companyMatchedNames.length > 0 ? Array.from(new Set(companyMatchedNames)) : undefined,
      enriched_contacts: enrichedResults.length > 0 ? enrichedResults : undefined,
      enriched_note:
        enrichedResults.length > 0
          ? `No matches in CRM contacts, but found ${enrichedResults.length} match(es) in previously enriched contacts (not yet saved to CRM). Use save_contacts_to_crm to add them.`
          : undefined,
    },
  };
}

async function getDealDocuments(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 50, 200);

  let query = supabase
    .from('data_room_documents')
    .select(
      'id, deal_id, folder_name, file_name, file_type, file_size_bytes, document_category, is_generated, version, allow_download, uploaded_by, created_at, updated_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (args.deal_id) query = query.eq('deal_id', args.deal_id as string);
  if (args.category) query = query.eq('document_category', args.category as string);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const docs = data || [];
  const byCategory: Record<string, number> = {};
  const byFolder: Record<string, number> = {};
  for (const d of docs) {
    byCategory[d.document_category] = (byCategory[d.document_category] || 0) + 1;
    byFolder[d.folder_name] = (byFolder[d.folder_name] || 0) + 1;
  }

  return {
    data: {
      documents: docs,
      total: docs.length,
      by_category: byCategory,
      by_folder: byFolder,
    },
  };
}

async function getDealMemos(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 10, 50);
  const memoType = (args.memo_type as string) || 'all';

  let query = supabase
    .from('lead_memos')
    .select(
      'id, deal_id, memo_type, branding, status, version, pdf_storage_path, published_at, created_at, updated_at',
    )
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (args.deal_id) query = query.eq('deal_id', args.deal_id as string);
  if (memoType !== 'all') query = query.eq('memo_type', memoType);
  if (args.status) query = query.eq('status', args.status as string);

  const { data, error } = await query;
  if (error) return { error: error.message };

  return {
    data: {
      memos: data || [],
      total: (data || []).length,
    },
  };
}

async function getFirmAgreements(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 50, 500);

  let query = supabase
    .from('firm_agreements')
    .select(
      'id, primary_company_name, normalized_company_name, website_domain, email_domain, fee_agreement_signed, fee_agreement_signed_at, nda_signed, nda_signed_at, nda_email_sent, nda_email_sent_at, fee_agreement_email_sent, fee_agreement_email_sent_at, member_count, created_at, updated_at',
    )
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (args.has_nda === true) query = query.eq('nda_signed', true);
  if (args.has_fee_agreement === true) query = query.eq('fee_agreement_signed', true);

  const { data, error } = await query;
  if (error) return { error: error.message };

  let results = data || [];
  if (args.search) {
    const term = (args.search as string).toLowerCase();
    results = results.filter(
      (f: {
        primary_company_name?: string;
        normalized_company_name?: string;
        website_domain?: string;
      }) =>
        f.primary_company_name?.toLowerCase().includes(term) ||
        f.normalized_company_name?.toLowerCase().includes(term) ||
        f.website_domain?.toLowerCase().includes(term),
    );
  }

  return {
    data: {
      firms: results,
      total: results.length,
      nda_signed: results.filter((f: { nda_signed: boolean }) => f.nda_signed).length,
      fee_agreement_signed: results.filter(
        (f: { fee_agreement_signed: boolean }) => f.fee_agreement_signed,
      ).length,
    },
  };
}

async function getNdaLogs(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 50, 500);
  const days = Number(args.days) || 90;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  let query = supabase
    .from('nda_logs')
    .select(
      'id, user_id, admin_id, admin_name, admin_email, action_type, email_sent_to, firm_id, notes, metadata, created_at',
    )
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (args.firm_id) query = query.eq('firm_id', args.firm_id as string);
  if (args.action_type) query = query.eq('action_type', args.action_type as string);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const logs = data || [];
  const byAction: Record<string, number> = {};
  for (const l of logs) {
    byAction[l.action_type] = (byAction[l.action_type] || 0) + 1;
  }

  return {
    data: {
      logs,
      total: logs.length,
      by_action: byAction,
    },
  };
}
