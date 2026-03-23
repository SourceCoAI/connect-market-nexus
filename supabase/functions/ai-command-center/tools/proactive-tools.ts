/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase client used with untyped tables */
/**
 * Proactive Operations Tools
 * Data quality monitoring, buyer conflict detection, deal health analysis,
 * and lead-to-deal matching.
 * Implements Epic 9 user stories: US-029, US-030, US-031, US-032.
 */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';

// ---------- Tool definitions ----------

export const proactiveTools: ClaudeTool[] = [
  {
    name: 'get_data_quality_report',
    description:
      'Analyze data quality across the platform — buyer profile completeness, deals missing key data, contacts without emails/phones, stale enrichment data, and unsynced transcripts. Use when the user asks "how\'s our data quality?", "which buyers have incomplete profiles?", or "data gaps?".',
    input_schema: {
      type: 'object',
      properties: {
        focus_area: {
          type: 'string',
          enum: ['all', 'buyers', 'deals', 'contacts', 'transcripts'],
          description: 'Focus on a specific area (default "all")',
        },
        completeness_threshold: {
          type: 'number',
          description: 'Flag buyers below this completeness % (default 30)',
        },
      },
      required: [],
    },
  },
  {
    name: 'detect_buyer_conflicts',
    description:
      'Find buyers that are active on multiple deals in the same industry or geography — potential conflicts where a buyer is being pitched competing deals. Use when the user asks "show buyer conflicts", "which buyers are on multiple deals?", or "buyer overlap analysis".',
    input_schema: {
      type: 'object',
      properties: {
        min_deals: {
          type: 'number',
          description: 'Minimum number of active deals to flag (default 2)',
        },
        include_closed: {
          type: 'boolean',
          description: 'Include closed/passed deals in analysis (default false)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_deal_health',
    description:
      'Analyze the health of active deals — stage duration vs average, activity velocity trends, buyer response times, overdue tasks. Identifies deals at risk of going cold. Use when the user asks "which deals are at risk?", "deal health check", or "are any deals going cold?".',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: {
          type: 'string',
          description: 'Analyze a specific deal (omit for all active deals)',
        },
        risk_threshold_days: {
          type: 'number',
          description: 'Days of inactivity to flag as at-risk (default 7)',
        },
      },
      required: [],
    },
  },
  {
    name: 'match_leads_to_deals',
    description:
      'Find new leads that match active deal criteria or buyer profiles. Cross-references inbound_leads and valuation_leads against active deals by industry, geography, and revenue range. Use when the user asks "any new leads matching our deals?", "lead matches?", or "which leads fit our pipeline?".',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: {
          type: 'string',
          description: 'Match against a specific deal (omit for all active deals)',
        },
        days: {
          type: 'number',
          description: 'Only consider leads from the last N days (default 30)',
        },
        min_score: {
          type: 'number',
          description: 'Minimum match quality score 0-100 (default 50)',
        },
      },
      required: [],
    },
  },
];

// ---------- Executor ----------

export async function executeProactiveTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (toolName) {
    case 'get_data_quality_report':
      return getDataQualityReport(supabase, args);
    case 'detect_buyer_conflicts':
      return detectBuyerConflicts(supabase, args);
    case 'get_deal_health':
      return getDealHealth(supabase, args);
    case 'match_leads_to_deals':
      return matchLeadsToDeals(supabase, args);
    default:
      return { error: `Unknown proactive tool: ${toolName}` };
  }
}

// ---------- Implementations ----------

async function getDataQualityReport(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const focusArea = (args.focus_area as string) || 'all';
  const completenessThreshold = (args.completeness_threshold as number) || 30;

  const results: Record<string, unknown> = {};

  // Buyer profile quality
  if (focusArea === 'all' || focusArea === 'buyers') {
    const { data: buyers } = await (supabase as any)
      .from('buyers')
      .select(
        'id, company_name, data_completeness, geographic_footprint, target_services, target_revenue_min, target_revenue_max, website_url, buyer_type',
      )
      .order('data_completeness', { ascending: true, nullsFirst: true });

    const allBuyers = buyers || [];
    const lowCompleteness = allBuyers.filter(
      (b: { data_completeness: number | null }) =>
        (b.data_completeness || 0) < completenessThreshold,
    );
    const missingGeo = allBuyers.filter(
      (b: { geographic_footprint: unknown }) =>
        !b.geographic_footprint ||
        (Array.isArray(b.geographic_footprint) && b.geographic_footprint.length === 0),
    );
    const missingServices = allBuyers.filter(
      (b: { target_services: unknown }) =>
        !b.target_services || (Array.isArray(b.target_services) && b.target_services.length === 0),
    );
    const missingRevenue = allBuyers.filter(
      (b: { target_revenue_min: number | null; target_revenue_max: number | null }) =>
        !b.target_revenue_min && !b.target_revenue_max,
    );
    const missingWebsite = allBuyers.filter((b: { website_url: string | null }) => !b.website_url);

    const completenessValues = allBuyers
      .map((b: { data_completeness: number | null }) => b.data_completeness || 0)
      .sort((a: number, b: number) => a - b);
    const avgCompleteness =
      completenessValues.length > 0
        ? Math.round(
            completenessValues.reduce((s: number, v: number) => s + v, 0) /
              completenessValues.length,
          )
        : 0;

    results.buyers = {
      total: allBuyers.length,
      avg_completeness: avgCompleteness,
      below_threshold: lowCompleteness.length,
      below_threshold_pct: allBuyers.length
        ? Math.round((lowCompleteness.length / allBuyers.length) * 100)
        : 0,
      missing_geographic_data: missingGeo.length,
      missing_target_services: missingServices.length,
      missing_revenue_range: missingRevenue.length,
      missing_website: missingWebsite.length,
      worst_profiles: lowCompleteness
        .slice(0, 10)
        .map((b: { id: string; company_name: string; data_completeness: number | null }) => ({
          id: b.id,
          company_name: b.company_name,
          completeness: b.data_completeness || 0,
        })),
    };
  }

  // Deal data quality
  if (focusArea === 'all' || focusArea === 'deals') {
    const [dealsResult, unownedResult, unscoredResult] = await Promise.all([
      (supabase as any)
        .from('listings')
        .select('id, title, primary_owner_id, revenue, ebitda, industry, remarketing_status')
        .is('deleted_at', null),
      (supabase as any)
        .from('listings')
        .select('id, title')
        .is('deleted_at', null)
        .is('primary_owner_id', null),
      (supabase as any).rpc('count_unscored_deals').catch(() => ({ data: null })),
    ]);

    const deals = dealsResult.data || [];
    const unowned = unownedResult.data || [];
    const missingRevenue = deals.filter((d: { revenue: number | null }) => !d.revenue);
    const missingIndustry = deals.filter((d: { industry: string | null }) => !d.industry);

    results.deals = {
      total: deals.length,
      missing_owner: unowned.length,
      missing_revenue: missingRevenue.length,
      missing_industry: missingIndustry.length,
      unscored_deals: unscoredResult.data || 'unable to count',
      unowned_deals: unowned.slice(0, 10).map((d: { id: string; title: string }) => ({
        id: d.id,
        title: d.title,
      })),
    };
  }

  // Contact data quality
  if (focusArea === 'all' || focusArea === 'contacts') {
    const { data: contacts } = await (supabase as any)
      .from('contacts')
      .select('id, email, phone, title, remarketing_buyer_id, contact_type')
      .eq('archived', false);

    const allContacts = contacts || [];
    const missingEmail = allContacts.filter((c: { email: string | null }) => !c.email);
    const missingPhone = allContacts.filter((c: { phone: string | null }) => !c.phone);
    const missingTitle = allContacts.filter((c: { title: string | null }) => !c.title);
    const missingBoth = allContacts.filter(
      (c: { email: string | null; phone: string | null }) => !c.email && !c.phone,
    );

    const byType: Record<string, number> = {};
    for (const c of allContacts) {
      const t = (c as { contact_type: string }).contact_type || 'unknown';
      byType[t] = (byType[t] || 0) + 1;
    }

    results.contacts = {
      total: allContacts.length,
      by_type: byType,
      missing_email: missingEmail.length,
      missing_phone: missingPhone.length,
      missing_title: missingTitle.length,
      missing_both_email_and_phone: missingBoth.length,
      unreachable_pct: allContacts.length
        ? Math.round((missingBoth.length / allContacts.length) * 100)
        : 0,
    };
  }

  // Transcript quality
  if (focusArea === 'all' || focusArea === 'transcripts') {
    const [transcriptsResult, noInsightsResult] = await Promise.all([
      (supabase as any)
        .from('deal_transcripts')
        .select('id, has_content, extracted_data')
        .order('created_at', { ascending: false })
        .limit(500),
      (supabase as any)
        .from('call_transcripts')
        .select('id')
        .is('extracted_insights', null)
        .limit(100),
    ]);

    const transcripts = transcriptsResult.data || [];
    const noContent = transcripts.filter((t: { has_content: boolean | null }) => !t.has_content);
    const noExtracted = transcripts.filter(
      (t: { extracted_data: unknown | null }) => !t.extracted_data,
    );

    results.transcripts = {
      total: transcripts.length,
      missing_content: noContent.length,
      missing_extracted_data: noExtracted.length,
      call_transcripts_missing_insights: (noInsightsResult.data || []).length,
    };
  }

  return {
    data: {
      ...results,
      completeness_threshold: completenessThreshold,
      focus_area: focusArea,
      generated_at: new Date().toISOString(),
    },
  };
}

async function detectBuyerConflicts(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const minDeals = (args.min_deals as number) || 2;
  const includeClosed = args.include_closed === true;

  // Get all active deals with industry/geography
  let dealsQuery = (supabase as any)
    .from('listings')
    .select(
      'id, title, internal_company_name, industry, category, address_state, remarketing_status',
    )
    .is('deleted_at', null);

  if (!includeClosed) {
    dealsQuery = dealsQuery.not(
      'remarketing_status',
      'in',
      '("closed","passed","archived","dead")',
    );
  }

  const { data: deals } = await dealsQuery;
  if (!deals?.length) return { data: { conflicts: [], message: 'No active deals found' } };

  const dealMap = new Map<string, { id: string; title: string; industry: string; state: string }>();
  for (const d of deals) {
    dealMap.set(d.id, {
      id: d.id,
      title: d.title || d.internal_company_name,
      industry: d.industry || d.category || '',
      state: d.address_state || '',
    });
  }

  // Get buyer scores across active deals
  const dealIds = deals.map((d: { id: string }) => d.id);
  const { data: scores } = await (supabase as any)
    .from('remarketing_scores')
    .select('buyer_id, listing_id, composite_score, status, tier')
    .in('listing_id', dealIds)
    .not('status', 'in', '("passed","excluded")');

  if (!scores?.length) return { data: { conflicts: [], message: 'No buyer scores found' } };

  // Group by buyer
  const buyerDeals = new Map<
    string,
    Array<{ deal_id: string; score: number; status: string; tier: string }>
  >();
  for (const s of scores) {
    if (!buyerDeals.has(s.buyer_id)) buyerDeals.set(s.buyer_id, []);
    buyerDeals.get(s.buyer_id)!.push({
      deal_id: s.listing_id,
      score: s.composite_score,
      status: s.status,
      tier: s.tier,
    });
  }

  // Filter to buyers on >= minDeals
  const multiBuyers = [...buyerDeals.entries()].filter(([, deals]) => deals.length >= minDeals);

  if (multiBuyers.length === 0) {
    return { data: { conflicts: [], message: `No buyers found active on ${minDeals}+ deals` } };
  }

  // Get buyer names
  const buyerIds = multiBuyers.map(([id]) => id);
  const { data: buyerNames } = await (supabase as any)
    .from('buyers')
    .select('id, company_name, pe_firm_name')
    .in('id', buyerIds);

  const buyerNameMap = new Map<string, string>();
  for (const b of buyerNames || []) {
    buyerNameMap.set(b.id, b.company_name || b.pe_firm_name || 'Unknown');
  }

  // Detect conflicts (same industry or same state)
  const conflicts: Array<{
    buyer_id: string;
    buyer_name: string;
    deal_count: number;
    deals: Array<{
      deal_id: string;
      deal_title: string;
      industry: string;
      state: string;
      score: number;
      tier: string;
    }>;
    conflict_type: string[];
    severity: string;
  }> = [];

  for (const [buyerId, buyerDealList] of multiBuyers) {
    const dealDetails = buyerDealList.map((bd) => {
      const deal = dealMap.get(bd.deal_id);
      return {
        deal_id: bd.deal_id,
        deal_title: deal?.title || 'Unknown',
        industry: deal?.industry || '',
        state: deal?.state || '',
        score: bd.score,
        tier: bd.tier || '',
      };
    });

    // Check for conflicts
    const conflictTypes: string[] = [];
    const industries = dealDetails.map((d) => d.industry.toLowerCase()).filter(Boolean);
    const states = dealDetails.map((d) => d.state).filter(Boolean);

    const industryDupes = industries.filter((ind, i) => industries.indexOf(ind) !== i);
    const stateDupes = states.filter((st, i) => states.indexOf(st) !== i);

    if (industryDupes.length > 0) conflictTypes.push('same_industry');
    if (stateDupes.length > 0) conflictTypes.push('same_geography');

    const severity =
      conflictTypes.length >= 2 ? 'high' : conflictTypes.length === 1 ? 'medium' : 'low';

    conflicts.push({
      buyer_id: buyerId,
      buyer_name: buyerNameMap.get(buyerId) || 'Unknown',
      deal_count: dealDetails.length,
      deals: dealDetails,
      conflict_type: conflictTypes.length > 0 ? conflictTypes : ['multiple_deals'],
      severity,
    });
  }

  // Sort by severity then deal count
  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  conflicts.sort(
    (a, b) =>
      (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3) ||
      b.deal_count - a.deal_count,
  );

  const highConflicts = conflicts.filter((c) => c.severity === 'high');

  return {
    data: {
      conflicts: conflicts.slice(0, 25),
      total_multi_deal_buyers: multiBuyers.length,
      high_severity_conflicts: highConflicts.length,
      summary: {
        buyers_on_multiple_deals: multiBuyers.length,
        industry_conflicts: conflicts.filter((c) => c.conflict_type.includes('same_industry'))
          .length,
        geography_conflicts: conflicts.filter((c) => c.conflict_type.includes('same_geography'))
          .length,
      },
    },
  };
}

async function getDealHealth(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const specificDealId = args.deal_id as string | undefined;
  const riskThresholdDays = (args.risk_threshold_days as number) || 7;

  // Get active deals
  let dealsQuery = (supabase as any)
    .from('listings')
    .select(
      'id, title, internal_company_name, remarketing_status, updated_at, created_at, industry, revenue, address_state',
    )
    .is('deleted_at', null)
    .not('remarketing_status', 'in', '("closed","passed","archived","dead")');

  if (specificDealId) {
    dealsQuery = dealsQuery.eq('id', specificDealId);
  }

  const { data: deals, error: dealsError } = await dealsQuery.limit(100);
  if (dealsError) return { error: dealsError.message };
  if (!deals?.length) return { data: { deals: [], message: 'No active deals found' } };

  const dealIds = deals.map((d: { id: string }) => d.id);
  const now = Date.now();

  // Parallel: activities, tasks, outreach for all deals
  const [activitiesResult, tasksResult, outreachResult] = await Promise.all([
    (supabase as any)
      .from('deal_activities')
      .select('deal_id, created_at, activity_type')
      .in('deal_id', dealIds)
      .order('created_at', { ascending: false })
      .limit(2000),
    (supabase as any)
      .from('daily_standup_tasks')
      .select('entity_id, status, due_date, completed_at')
      .eq('entity_type', 'deal')
      .in('entity_id', dealIds),
    (supabase as any)
      .from('outreach_records')
      .select('deal_id, last_action_date, stage')
      .in('deal_id', dealIds),
  ]);

  const activities = activitiesResult.data || [];
  const tasks = tasksResult.data || [];
  const outreach = outreachResult.data || [];

  // Group by deal
  const actByDeal = new Map<string, Array<{ created_at: string; activity_type: string }>>();
  for (const a of activities) {
    if (!actByDeal.has(a.deal_id)) actByDeal.set(a.deal_id, []);
    actByDeal.get(a.deal_id)!.push(a);
  }

  const tasksByDeal = new Map<
    string,
    Array<{ status: string; due_date: string | null; completed_at: string | null }>
  >();
  for (const t of tasks) {
    if (!tasksByDeal.has(t.entity_id)) tasksByDeal.set(t.entity_id, []);
    tasksByDeal.get(t.entity_id)!.push(t);
  }

  const outreachByDeal = new Map<string, Array<{ last_action_date: string; stage: string }>>();
  for (const o of outreach) {
    if (!outreachByDeal.has(o.deal_id)) outreachByDeal.set(o.deal_id, []);
    outreachByDeal.get(o.deal_id)!.push(o);
  }

  // Analyze each deal
  interface DealHealthReport {
    deal_id: string;
    title: string;
    status: string;
    industry: string;
    revenue: number | null;
    days_since_last_activity: number;
    activity_count_7d: number;
    activity_count_30d: number;
    velocity_trend: 'increasing' | 'stable' | 'declining' | 'no_data';
    overdue_tasks: number;
    total_open_tasks: number;
    stale_outreach_count: number;
    risk_level: 'healthy' | 'watch' | 'at_risk' | 'critical';
    risk_factors: string[];
  }

  const dealHealthReports: DealHealthReport[] = [];

  for (const deal of deals) {
    const dealActs = actByDeal.get(deal.id) || [];
    const dealTasks = tasksByDeal.get(deal.id) || [];
    const dealOutreach = outreachByDeal.get(deal.id) || [];

    // Days since last activity
    const lastActivity = dealActs[0]?.created_at
      ? new Date(dealActs[0].created_at).getTime()
      : new Date(deal.updated_at).getTime();
    const daysSinceActivity = Math.floor((now - lastActivity) / 86400000);

    // Activity velocity
    const sevenDaysAgo = now - 7 * 86400000;
    const thirtyDaysAgo = now - 30 * 86400000;
    const fourteenDaysAgo = now - 14 * 86400000;

    const act7d = dealActs.filter((a) => new Date(a.created_at).getTime() > sevenDaysAgo).length;
    const act30d = dealActs.filter((a) => new Date(a.created_at).getTime() > thirtyDaysAgo).length;
    const actPrev14d = dealActs.filter((a) => {
      const t = new Date(a.created_at).getTime();
      return t > fourteenDaysAgo && t <= sevenDaysAgo;
    }).length;

    let velocityTrend: 'increasing' | 'stable' | 'declining' | 'no_data' = 'no_data';
    if (act7d + actPrev14d > 0) {
      if (act7d > actPrev14d * 1.2) velocityTrend = 'increasing';
      else if (act7d < actPrev14d * 0.5) velocityTrend = 'declining';
      else velocityTrend = 'stable';
    }

    // Tasks
    const openTasks = dealTasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
    const overdueTasks = openTasks.filter(
      (t) => t.due_date && new Date(t.due_date).getTime() < now,
    );

    // Stale outreach
    const staleOutreach = dealOutreach.filter(
      (o) => o.last_action_date && new Date(o.last_action_date).getTime() < now - 14 * 86400000,
    );

    // Risk assessment
    const riskFactors: string[] = [];
    if (daysSinceActivity > riskThresholdDays * 3)
      riskFactors.push(`No activity in ${daysSinceActivity} days`);
    else if (daysSinceActivity > riskThresholdDays)
      riskFactors.push(`${daysSinceActivity} days since last activity`);
    if (velocityTrend === 'declining') riskFactors.push('Activity velocity declining');
    if (overdueTasks.length > 0) riskFactors.push(`${overdueTasks.length} overdue task(s)`);
    if (staleOutreach.length > 0)
      riskFactors.push(`${staleOutreach.length} stale outreach (14+ days)`);

    let riskLevel: 'healthy' | 'watch' | 'at_risk' | 'critical' = 'healthy';
    if (riskFactors.length >= 3) riskLevel = 'critical';
    else if (riskFactors.length === 2) riskLevel = 'at_risk';
    else if (riskFactors.length === 1) riskLevel = 'watch';

    dealHealthReports.push({
      deal_id: deal.id,
      title: deal.title || deal.internal_company_name,
      status: deal.remarketing_status,
      industry: deal.industry || '',
      revenue: deal.revenue,
      days_since_last_activity: daysSinceActivity,
      activity_count_7d: act7d,
      activity_count_30d: act30d,
      velocity_trend: velocityTrend,
      overdue_tasks: overdueTasks.length,
      total_open_tasks: openTasks.length,
      stale_outreach_count: staleOutreach.length,
      risk_level: riskLevel,
      risk_factors: riskFactors,
    });
  }

  // Sort: critical first, then at_risk, etc.
  const riskOrder: Record<string, number> = { critical: 0, at_risk: 1, watch: 2, healthy: 3 };
  dealHealthReports.sort((a, b) => (riskOrder[a.risk_level] || 4) - (riskOrder[b.risk_level] || 4));

  const summary = {
    total_deals: dealHealthReports.length,
    healthy: dealHealthReports.filter((d) => d.risk_level === 'healthy').length,
    watch: dealHealthReports.filter((d) => d.risk_level === 'watch').length,
    at_risk: dealHealthReports.filter((d) => d.risk_level === 'at_risk').length,
    critical: dealHealthReports.filter((d) => d.risk_level === 'critical').length,
    avg_days_since_activity: dealHealthReports.length
      ? Math.round(
          dealHealthReports.reduce((s, d) => s + d.days_since_last_activity, 0) /
            dealHealthReports.length,
        )
      : 0,
    total_overdue_tasks: dealHealthReports.reduce((s, d) => s + d.overdue_tasks, 0),
  };

  return {
    data: {
      deals: dealHealthReports,
      summary,
      risk_threshold_days: riskThresholdDays,
    },
  };
}

async function matchLeadsToDeals(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const specificDealId = args.deal_id as string | undefined;
  const days = (args.days as number) || 30;
  const minScore = (args.min_score as number) || 50;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  // Get active deals
  let dealsQuery = (supabase as any)
    .from('listings')
    .select(
      'id, title, internal_company_name, industry, category, address_state, revenue, ebitda, services',
    )
    .is('deleted_at', null)
    .not('remarketing_status', 'in', '("closed","passed","archived","dead")');

  if (specificDealId) {
    dealsQuery = dealsQuery.eq('id', specificDealId);
  }

  const { data: deals } = await dealsQuery.limit(50);
  if (!deals?.length) return { data: { matches: [], message: 'No active deals found' } };

  // Get recent leads
  const [inboundResult, valuationResult] = await Promise.all([
    (supabase as any)
      .from('inbound_leads')
      .select('id, company_name, industry, revenue, state, source, status, created_at')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(200),
    (supabase as any)
      .from('valuation_leads')
      .select('id, company_name, industry, revenue, state, lead_type, status, created_at')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const inboundLeads = (inboundResult.data || []).map(
    (l: {
      id: string;
      company_name: string;
      industry: string;
      revenue: number;
      state: string;
      source: string;
      status: string;
      created_at: string;
    }) => ({
      ...l,
      lead_source: 'inbound',
    }),
  );
  const valuationLeads = (valuationResult.data || []).map(
    (l: {
      id: string;
      company_name: string;
      industry: string;
      revenue: number;
      state: string;
      lead_type: string;
      status: string;
      created_at: string;
    }) => ({
      ...l,
      lead_source: 'valuation',
    }),
  );
  const allLeads = [...inboundLeads, ...valuationLeads];

  if (allLeads.length === 0) {
    return { data: { matches: [], message: `No leads found in the last ${days} days` } };
  }

  // Match leads to deals
  const matches: Array<{
    lead_id: string;
    lead_name: string;
    lead_source: string;
    lead_industry: string;
    lead_state: string;
    lead_revenue: number | null;
    deal_id: string;
    deal_title: string;
    match_score: number;
    match_reasons: string[];
  }> = [];

  for (const lead of allLeads) {
    for (const deal of deals) {
      const matchReasons: string[] = [];
      let score = 0;

      // Industry match
      const leadIndustry = (lead.industry || '').toLowerCase();
      const dealIndustry = (deal.industry || deal.category || '').toLowerCase();
      if (leadIndustry && dealIndustry && leadIndustry.includes(dealIndustry.split(' ')[0])) {
        score += 40;
        matchReasons.push('Same industry');
      } else if (leadIndustry && dealIndustry) {
        // Partial match
        const leadWords = leadIndustry.split(/[\s,]+/);
        const dealWords = dealIndustry.split(/[\s,]+/);
        const overlap = leadWords.filter((w: string) =>
          dealWords.some((dw: string) => dw.includes(w) || w.includes(dw)),
        );
        if (overlap.length > 0) {
          score += 25;
          matchReasons.push('Related industry');
        }
      }

      // Geography match
      if (lead.state && deal.address_state && lead.state === deal.address_state) {
        score += 30;
        matchReasons.push('Same state');
      }

      // Revenue range match
      if (lead.revenue && deal.revenue) {
        const ratio = lead.revenue / deal.revenue;
        if (ratio >= 0.5 && ratio <= 2.0) {
          score += 30;
          matchReasons.push('Similar revenue range');
        } else if (ratio >= 0.25 && ratio <= 4.0) {
          score += 15;
          matchReasons.push('Comparable revenue');
        }
      }

      if (score >= minScore && matchReasons.length > 0) {
        matches.push({
          lead_id: lead.id,
          lead_name: lead.company_name,
          lead_source: lead.lead_source,
          lead_industry: lead.industry || '',
          lead_state: lead.state || '',
          lead_revenue: lead.revenue,
          deal_id: deal.id,
          deal_title: deal.title || deal.internal_company_name,
          match_score: Math.min(score, 100),
          match_reasons: matchReasons,
        });
      }
    }
  }

  // Sort by score
  matches.sort((a, b) => b.match_score - a.match_score);

  return {
    data: {
      matches: matches.slice(0, 30),
      total_matches: matches.length,
      total_leads_analyzed: allLeads.length,
      total_deals_compared: deals.length,
      lookback_days: days,
      min_score_threshold: minScore,
      message:
        matches.length > 0
          ? `Found ${matches.length} lead-deal matches above score ${minScore}`
          : `No leads matched active deals above score ${minScore} in the last ${days} days`,
    },
  };
}
