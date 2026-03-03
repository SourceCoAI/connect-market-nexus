import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { errorResponse } from '../_shared/error-response.ts';

// ============================================================================
// TYPES
// ============================================================================

interface ScoreRequest {
  profile_id: string;
  deal_request_message?: string | null;
  /** When set, also store the deal-specific score on a connection_request */
  connection_request_id?: string | null;
}

interface ScoreBreakdown {
  buyer_type: number;
  platform_signal: number;
  capital_credibility: number;
  profile_completeness: number;
}

interface ScoreResult {
  profile_id: string;
  total_score: number;
  tier: number;
  component_breakdown: ScoreBreakdown;
  platform_signal_detected: boolean;
  platform_signal_source: 'message' | 'profile' | 'enrichment' | null;
  platform_keywords_matched: string[];
}

// ============================================================================
// CONFIGURABLE CONSTANTS
// ============================================================================

// Platform / add-on keyword list — update here without redeploying logic
const PLATFORM_ADDON_KEYWORDS = [
  'add-on',
  'add on',
  'addon',
  'bolt-on',
  'bolt on',
  'tuck-in',
  'tuck in',
  'existing platform',
  'our platform',
  'we currently own',
  'we own a',
  'portfolio company',
  'portco',
  'platform acquisition',
  'we are looking to add',
  'building a platform in',
];

// Free / consumer email domains that score 0 for professional-email check
const CONSUMER_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'me.com',
  'aol.com',
];

// Buyer-type to Component 1 points map
// Supports both canonical (DB) values and marketplace profile (camelCase) values
const BUYER_TYPE_POINTS: Record<string, number> = {
  // Canonical DB values (remarketing_buyers)
  private_equity: 35,
  corporate: 28,
  family_office: 30,
  independent_sponsor: 15,
  search_fund: 10,
  individual_buyer: 5,
  // Marketplace profile values (camelCase)
  privateEquity: 35,
  familyOffice: 30,
  independentSponsor: 15,
  searchFund: 10,
  individual: 5,
  advisor: 5,
  businessOwner: 5,
  // Legacy display values (may still appear in older profiles)
  'Private Equity': 35,
  'Family Office': 30,
  Corporate: 28,
  'Strategic Acquirer': 28,
  'Independent Sponsor': 15,
  'Search Fund': 10,
  // Legacy DB values
  pe_firm: 35,
  strategic: 28,
  platform: 28,
  Buyer: 5,
};

// Capital-credibility keyword triggers (case-insensitive scan)
const CAPITAL_KEYWORDS = [
  'fund size',
  'aum',
  'committed capital',
  'closed fund',
  'fund i',
  'fund ii',
  'fund iii',
  'fund iv',
  'fund v',
  'lp',
];

// Active acquisition-stage values that earn points
const ACTIVE_ACQ_STAGES = ['actively sourcing', 'under loi', 'closed deal', 'have closed'];

// ============================================================================
// SCORING HELPERS
// ============================================================================

function calcBuyerTypeScore(
  profileBuyerType: string | null,
  remarketingBuyerType: string | null,
): number {
  const bt = profileBuyerType || remarketingBuyerType || '';
  return BUYER_TYPE_POINTS[bt] ?? 5;
}

function calcPlatformSignal(
  dealMessage: string | null,
  profileTexts: string[],
): {
  score: number;
  detected: boolean;
  source: ScoreResult['platform_signal_source'];
  keywords: string[];
} {
  const matchedKeywords: string[] = [];

  // 1. Check deal request message first (highest priority = 30 pts)
  if (dealMessage) {
    const lower = dealMessage.toLowerCase();
    for (const kw of PLATFORM_ADDON_KEYWORDS) {
      if (lower.includes(kw)) {
        matchedKeywords.push(kw);
      }
    }
    if (matchedKeywords.length > 0) {
      return { score: 30, detected: true, source: 'message', keywords: matchedKeywords };
    }
  }

  // 2. Check profile texts (25 pts)
  const combined = profileTexts.filter(Boolean).join(' ').toLowerCase();
  for (const kw of PLATFORM_ADDON_KEYWORDS) {
    if (combined.includes(kw)) {
      matchedKeywords.push(kw);
    }
  }
  if (matchedKeywords.length > 0) {
    return { score: 25, detected: true, source: 'profile', keywords: matchedKeywords };
  }

  return { score: 0, detected: false, source: null, keywords: [] };
}

function calcCapitalCredibility(profile: Record<string, unknown>): number {
  let points = 0;

  // 1. Professional email domain (+5)
  const email = (profile.email as string) || '';
  const domain = email.split('@')[1]?.toLowerCase() || '';
  if (domain && !CONSUMER_EMAIL_DOMAINS.includes(domain)) {
    points += 5;
  }

  // 2. Company website provided (+3)
  const website = (profile.website as string) || (profile.buyer_org_url as string) || '';
  if (website.trim().length > 0) {
    points += 3;
  }

  // 3. Fund size / AUM mentioned (+5)
  const textToScan = [
    (profile.ideal_target_description as string) || '',
    (profile.specific_business_search as string) || '',
    (profile.mandate_blurb as string) || '',
    (profile.fund_size as string) || '',
    (profile.aum as string) || '',
  ]
    .join(' ')
    .toLowerCase();

  const hasFundKeyword = CAPITAL_KEYWORDS.some((kw) => textToScan.includes(kw));
  // Also award if fund_size or aum fields are populated
  const hasFundData = Boolean(
    (profile.fund_size && String(profile.fund_size).trim()) ||
    (profile.aum && String(profile.aum).trim()),
  );
  if (hasFundKeyword || hasFundData) {
    points += 5;
  }

  // 4. Active acquisition strategy (+4)
  const stage = ((profile.search_stage as string) || '').toLowerCase();
  const deployingNow = ((profile.deploying_capital_now as string) || '').toLowerCase();
  if (
    ACTIVE_ACQ_STAGES.some((s) => stage.includes(s)) ||
    deployingNow === 'yes' ||
    deployingNow === 'true'
  ) {
    points += 4;
  }

  // 5. Multiple deal sourcing methods (+3)
  let methods: unknown[] = [];
  if (Array.isArray(profile.deal_sourcing_methods)) {
    methods = profile.deal_sourcing_methods;
  } else if (typeof profile.deal_sourcing_methods === 'string') {
    try {
      const parsed = JSON.parse(profile.deal_sourcing_methods);
      if (Array.isArray(parsed)) methods = parsed;
    } catch {
      /* ignore */
    }
  }
  if (methods.length >= 2) {
    points += 3;
  }

  return Math.min(points, 20);
}

function calcProfileCompleteness(profile: Record<string, unknown>): number {
  let points = 0;

  // 1. Investment criteria filled out (+3)
  const desc = (profile.ideal_target_description as string) || '';
  if (desc.length > 50) {
    points += 3;
  }

  // 2. Industry/category preferences (+2)
  let cats: unknown[] = [];
  if (Array.isArray(profile.business_categories)) {
    cats = profile.business_categories;
  } else if (typeof profile.business_categories === 'string') {
    try {
      const parsed = JSON.parse(profile.business_categories);
      if (Array.isArray(parsed)) cats = parsed;
    } catch {
      /* ignore */
    }
  }
  if (cats.length > 0) {
    points += 2;
  }

  // 3. Geographic focus (+2)
  let hasGeo = false;
  if (profile.target_locations) {
    const locs = Array.isArray(profile.target_locations) ? profile.target_locations : [];
    hasGeo = locs.length > 0;
  }
  if (!hasGeo && profile.geographic_focus) {
    const geo = Array.isArray(profile.geographic_focus) ? profile.geographic_focus : [];
    hasGeo = geo.length > 0;
  }
  if (hasGeo) {
    points += 2;
  }

  // 4. Phone number (+1)
  const phone = (profile.phone_number as string) || '';
  if (phone.trim().length > 0) {
    points += 1;
  }

  // 5. LinkedIn profile (+1)
  const linkedin = (profile.linkedin_profile as string) || '';
  if (linkedin.trim().length > 0) {
    points += 1;
  }

  // 6. Deal size range specified (+1)
  if (profile.target_deal_size_min != null && profile.target_deal_size_max != null) {
    points += 1;
  }

  return Math.min(points, 10);
}

function determineTier(score: number): number {
  if (score >= 70) return 1;
  if (score >= 45) return 2;
  if (score >= 15) return 3;
  return 4;
}

// ============================================================================
// HANDLER
// ============================================================================

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Auth guard: require valid JWT + admin role
    const authHeader = req.headers.get('Authorization') || '';
    const callerToken = authHeader.replace('Bearer ', '').trim();
    if (!callerToken) {
      return errorResponse('Unauthorized', 401, corsHeaders, 'unauthorized');
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${callerToken}` } },
    });
    const {
      data: { user: callerUser },
      error: callerError,
    } = await anonClient.auth.getUser();
    if (callerError || !callerUser) {
      return errorResponse('Unauthorized', 401, corsHeaders, 'unauthorized');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: isAdmin } = await supabase.rpc('is_admin', { user_id: callerUser.id });
    if (!isAdmin) {
      return errorResponse('Forbidden: admin access required', 403, corsHeaders, 'forbidden');
    }

    const body = await req.json();

    // ─── BATCH MODE: score all unscored buyers ────────────────────────
    if (body.batch_all_unscored) {
      const batchLimit = Math.min(body.batch_limit || 30, 500);
      const { data: unscored, error: unscoredErr } = await supabase
        .from('profiles')
        .select('id')
        .is('buyer_quality_score', null)
        .not('buyer_type', 'is', null)
        .limit(batchLimit);
      if (unscoredErr) throw unscoredErr;

      // Also get their latest connection request messages
      const profileIds = (unscored || []).map((p: { id: string }) => p.id);
      const messageMap: Record<string, string> = {};
      if (profileIds.length > 0) {
        const { data: crs } = await supabase
          .from('connection_requests')
          .select('user_id, user_message')
          .in('user_id', profileIds)
          .order('created_at', { ascending: false });
        (crs || []).forEach((cr: { user_id: string; user_message?: string }) => {
          if (cr.user_message && !messageMap[cr.user_id]) {
            messageMap[cr.user_id] = cr.user_message;
          }
        });
      }

      // Score each buyer sequentially (to avoid overwhelming DB)
      const results: Array<{ id: string; score: number; tier: number }> = [];
      for (const p of unscored || []) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', p.id)
            .single();
          if (!profile) continue;

          let remarketingBuyer: Record<string, unknown> | null = null;
          const { data: rmBuyers } = await supabase
            .from('remarketing_buyers')
            .select('buyer_type, thesis_summary')
            .or(`primary_contact_email.eq.${profile.email},marketplace_firm_id.not.is.null`)
            .limit(1);
          if (rmBuyers && rmBuyers.length > 0)
            remarketingBuyer = rmBuyers[0] as Record<string, unknown>;

          const c1 = calcBuyerTypeScore(
            profile.buyer_type,
            remarketingBuyer?.buyer_type as string | null,
          );
          const profileTexts = [
            profile.ideal_target_description || '',
            profile.specific_business_search || '',
            profile.mandate_blurb || '',
            profile.portfolio_company_addon || '',
            (remarketingBuyer?.thesis_summary as string) || '',
          ];
          const platformResult = calcPlatformSignal(messageMap[p.id] || null, profileTexts);
          const c2 = platformResult.score;
          const c3 = calcCapitalCredibility(profile);
          const c4 = calcProfileCompleteness(profile);
          const totalScore = c1 + c2 + c3 + c4;
          let tier = determineTier(totalScore);
          if (profile.admin_tier_override != null) tier = profile.admin_tier_override;

          await supabase
            .from('profiles')
            .update({
              buyer_quality_score: totalScore,
              buyer_tier: tier,
              platform_signal_detected: platformResult.detected,
              platform_signal_source: platformResult.source,
              buyer_quality_score_last_calculated: new Date().toISOString(),
            })
            .eq('id', p.id);

          results.push({ id: p.id, score: totalScore, tier });
        } catch (e) {
          console.error(`Failed to score ${p.id}:`, e);
        }
      }

      return new Response(JSON.stringify({ scored: results.length, results }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── SINGLE MODE ──────────────────────────────────────────────────
    const { profile_id, deal_request_message, connection_request_id } = body as ScoreRequest;

    if (!profile_id) {
      return errorResponse('profile_id is required', 400, corsHeaders, 'validation_error');
    }

    // ─── STEP 1: Fetch buyer data ──────────────────────────────────────
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profile_id)
      .single();

    if (profileErr || !profile) {
      return errorResponse('Profile not found', 404, corsHeaders, 'not_found');
    }

    // Try to find a linked remarketing_buyer record
    let remarketingBuyer: Record<string, unknown> | null = null;
    const { data: rmBuyers } = await supabase
      .from('remarketing_buyers')
      .select('buyer_type, thesis_summary')
      .or(`primary_contact_email.eq.${profile.email},marketplace_firm_id.not.is.null`)
      .limit(1);
    if (rmBuyers && rmBuyers.length > 0) {
      remarketingBuyer = rmBuyers[0] as Record<string, unknown>;
    }

    // ─── STEP 2: Component 1 — Buyer Type (max 40) ────────────────────
    const component1 = calcBuyerTypeScore(
      profile.buyer_type,
      remarketingBuyer?.buyer_type as string | null,
    );

    // ─── STEP 3: Component 2 — Platform Signal (max 30) ───────────────
    const profileTexts = [
      profile.ideal_target_description || '',
      profile.specific_business_search || '',
      profile.mandate_blurb || '',
      profile.portfolio_company_addon || '',
      (remarketingBuyer?.thesis_summary as string) || '',
    ];

    const platformResult = calcPlatformSignal(deal_request_message || null, profileTexts);
    const component2 = platformResult.score;

    // ─── STEP 4: Component 3 — Capital Credibility (max 20) ───────────
    const component3 = calcCapitalCredibility(profile);

    // ─── STEP 5: Component 4 — Profile Completeness (max 10) ──────────
    const component4 = calcProfileCompleteness(profile);

    // ─── STEP 6: Total + Tier ──────────────────────────────────────────
    const totalScore = component1 + component2 + component3 + component4;
    let tier = determineTier(totalScore);

    // Apply admin override if set
    if (profile.admin_tier_override != null) {
      tier = profile.admin_tier_override;
    }

    // ─── STEP 7: Write back to database ────────────────────────────────
    const now = new Date().toISOString();

    // Update profiles table
    await supabase
      .from('profiles')
      .update({
        buyer_quality_score: totalScore,
        buyer_tier: tier,
        platform_signal_detected: platformResult.detected,
        platform_signal_source: platformResult.source,
        buyer_quality_score_last_calculated: now,
      })
      .eq('id', profile_id);

    // If deal-specific scoring, update the connection_request
    if (connection_request_id && deal_request_message) {
      await supabase
        .from('connection_requests')
        .update({
          deal_specific_buyer_score: totalScore,
          deal_specific_platform_signal: platformResult.detected,
          deal_specific_platform_keywords: platformResult.keywords,
        })
        .eq('id', connection_request_id);
    }

    // ─── Build response ────────────────────────────────────────────────
    const result: ScoreResult = {
      profile_id,
      total_score: totalScore,
      tier,
      component_breakdown: {
        buyer_type: component1,
        platform_signal: component2,
        capital_credibility: component3,
        profile_completeness: component4,
      },
      platform_signal_detected: platformResult.detected,
      platform_signal_source: platformResult.source,
      platform_keywords_matched: platformResult.keywords,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('calculate-buyer-quality-score error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      corsHeaders,
      'internal_error',
    );
  }
};

serve(handler);
