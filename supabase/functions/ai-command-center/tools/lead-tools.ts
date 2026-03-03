/**
 * Lead & Referral Tools
 * Inbound leads, referral partners, referral submissions.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
type SupabaseClient = ReturnType<typeof createClient>;
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';

// ---------- Tool definitions ----------

export const leadTools: ClaudeTool[] = [
  {
    name: 'search_inbound_leads',
    description: `Search inbound leads — contacts who reached out about deals, mapped or unmapped to listings.
DATA SOURCE: inbound_leads table.
USE WHEN: "show inbound leads", "who contacted us about HVAC", "pending inbound leads".
SEARCHABLE FIELDS: search param checks name, email, company_name, role, message, source_form_name, mapped_to_listing_title, phone_number.
Filter by status, source, or whether they've been converted to connection requests.`,
    input_schema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description:
            'Free-text search across name, email, company_name, role, message, source_form_name, mapped_to_listing_title, phone_number',
        },
        source: {
          type: 'string',
          description: 'Filter by lead source (e.g. "website", "referral", "manual")',
        },
        status: {
          type: 'string',
          description: 'Filter by status: pending, contacted, qualified, converted, rejected',
        },
        deal_id: {
          type: 'string',
          description: 'Filter leads mapped to a specific deal/listing UUID',
        },
        converted: {
          type: 'boolean',
          description: 'Filter by whether lead was converted to a connection request',
        },
        days: { type: 'number', description: 'Lookback period in days (default 30)' },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: [],
    },
  },
  {
    name: 'get_referral_data',
    description:
      'Get referral partner data and their submissions — broker/advisor partners who submit deals to SourceCo, their deal volume, and submitted opportunities with financial details.',
    input_schema: {
      type: 'object',
      properties: {
        partner_id: {
          type: 'string',
          description: 'Get data for a specific referral partner UUID',
        },
        search: { type: 'string', description: 'Search across partner name, company, email' },
        submission_status: {
          type: 'string',
          description: 'Filter submissions by status: pending, reviewed, accepted, rejected',
        },
        include_submissions: {
          type: 'boolean',
          description: 'Include submission details (default true)',
        },
        active_only: { type: 'boolean', description: 'Only show active partners (default true)' },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: [],
    },
  },
];

// ---------- Executor ----------

export async function executeLeadTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (toolName) {
    case 'search_inbound_leads':
      return searchInboundLeads(supabase, args);
    case 'get_referral_data':
      return getReferralData(supabase, args);
    default:
      return { error: `Unknown lead tool: ${toolName}` };
  }
}

// ---------- Implementations ----------

async function searchInboundLeads(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  // When client-side search is active, expand the DB fetch limit to avoid
  // silently missing matching records beyond the default top-N window.
  // Same pattern as queryDeals needsClientFilter expansion.
  const hasClientFilter = !!args.search;
  const limit = hasClientFilter
    ? Math.min(Number(args.limit) || 2000, 5000)
    : Math.min(Number(args.limit) || 50, 500);
  const days = Number(args.days) || 30;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  let query = supabase
    .from('inbound_leads')
    .select(
      'id, name, email, company_name, phone_number, role, message, source, source_form_name, mapped_to_listing_id, mapped_to_listing_title, mapped_at, converted_to_request_id, converted_at, status, priority_score, created_at, updated_at',
    )
    .gte('created_at', cutoff)
    .order('priority_score', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (args.status) query = query.eq('status', args.status as string);
  if (args.source) query = query.eq('source', args.source as string);
  if (args.deal_id) query = query.eq('mapped_to_listing_id', args.deal_id as string);
  if (args.converted === true) query = query.not('converted_to_request_id', 'is', null);
  if (args.converted === false) query = query.is('converted_to_request_id', null);

  const { data, error } = await query;
  if (error) return { error: error.message };

  let results = data || [];
  const totalFromDb = results.length;

  if (args.search) {
    const term = (args.search as string).toLowerCase();
    results = results.filter(
      (l: {
        name?: string;
        email?: string;
        company_name?: string;
        role?: string;
        message?: string;
        source_form_name?: string;
        mapped_to_listing_title?: string;
        phone_number?: string;
      }) =>
        l.name?.toLowerCase().includes(term) ||
        l.email?.toLowerCase().includes(term) ||
        l.company_name?.toLowerCase().includes(term) ||
        l.role?.toLowerCase().includes(term) ||
        l.message?.toLowerCase().includes(term) ||
        l.source_form_name?.toLowerCase().includes(term) ||
        l.mapped_to_listing_title?.toLowerCase().includes(term) ||
        l.phone_number?.toLowerCase().includes(term),
    );
  }

  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const l of results) {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    if (l.source) bySource[l.source] = (bySource[l.source] || 0) + 1;
  }

  const filtersApplied: Record<string, unknown> = { lookback_days: days };
  if (args.search) filtersApplied.search = args.search;
  if (args.status) filtersApplied.status = args.status;
  if (args.source) filtersApplied.source = args.source;
  if (args.deal_id) filtersApplied.deal_id = args.deal_id;
  if (args.converted !== undefined) filtersApplied.converted = args.converted;

  return {
    data: {
      leads: results,
      total: results.length,
      total_before_filtering: totalFromDb,
      by_status: byStatus,
      by_source: bySource,
      converted: results.filter(
        (l: { converted_to_request_id?: string }) => l.converted_to_request_id,
      ).length,
      filters_applied: filtersApplied,
      ...(results.length === 0
        ? {
            suggestion:
              totalFromDb > 0
                ? `${totalFromDb} inbound leads found in the last ${days} days but none matched your search "${args.search}". Try broader keywords or increase the lookback days.`
                : `No inbound leads found in the last ${days} days. Try increasing the days parameter (e.g. days=90) or removing status/source filters.`,
          }
        : {}),
    },
  };
}

async function getReferralData(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  // Expand fetch limit when search is active to avoid missing matching partners
  const hasClientFilter = !!args.search;
  const limit = hasClientFilter
    ? Math.min(Number(args.limit) || 500, 1000)
    : Math.min(Number(args.limit) || 50, 200);
  const includeSubmissions = args.include_submissions !== false;

  let partnerQuery = supabase
    .from('referral_partners')
    .select('id, name, company, email, phone, notes, deal_count, is_active, created_at, updated_at')
    .order('deal_count', { ascending: false })
    .limit(limit);

  if (args.active_only !== false) partnerQuery = partnerQuery.eq('is_active', true);
  if (args.partner_id) partnerQuery = partnerQuery.eq('id', args.partner_id as string);

  const { data: partners, error: partnerError } = await partnerQuery;
  if (partnerError) return { error: partnerError.message };

  let filteredPartners = partners || [];
  if (args.search) {
    const term = (args.search as string).toLowerCase();
    filteredPartners = filteredPartners.filter(
      (p: { name?: string; company?: string; email?: string }) =>
        p.name?.toLowerCase().includes(term) ||
        p.company?.toLowerCase().includes(term) ||
        p.email?.toLowerCase().includes(term),
    );
  }

  let submissions: unknown[] = [];
  if (includeSubmissions && filteredPartners.length > 0) {
    const partnerIds = filteredPartners.map((p: { id: string }) => p.id);
    let subQuery = supabase
      .from('referral_submissions')
      .select(
        'id, referral_partner_id, company_name, website, industry, revenue, ebitda, location, contact_name, contact_email, notes, status, listing_id, reviewed_at, created_at',
      )
      .in('referral_partner_id', partnerIds)
      .order('created_at', { ascending: false })
      .limit(500);

    if (args.submission_status) subQuery = subQuery.eq('status', args.submission_status as string);
    const { data: subData } = await subQuery;
    submissions = subData || [];
  }

  const byStatus: Record<string, number> = {};
  for (const s of submissions as Array<{ status: string }>) {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  }

  return {
    data: {
      partners: filteredPartners,
      total_partners: filteredPartners.length,
      submissions,
      total_submissions: submissions.length,
      submissions_by_status: byStatus,
    },
  };
}
