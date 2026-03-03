/**
 * generate-lead-memo: AI-generates a lead memo from deal data
 *
 * Admin-only. Collects all available deal data (transcripts, enrichment,
 * manual entries) and generates a structured memo via Claude Sonnet.
 *
 * POST body:
 *   - deal_id: UUID
 *   - memo_type: "anonymous_teaser" | "full_memo" | "both"
 *   - branding: "sourceco" | "new_heritage" | "renovus" | "cortec" | custom
 *   - project_name: optional custom project codename for anonymous teasers
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import {
  ANTHROPIC_API_URL,
  DEFAULT_CLAUDE_MODEL,
  getAnthropicHeaders,
  fetchWithAutoRetry,
} from '../_shared/ai-providers.ts';

// Memo section structure
interface MemoSection {
  key: string;
  title: string;
  content: string;
}

interface MemoContent {
  sections: MemoSection[];
  memo_type: string;
  branding: string;
  generated_at: string;
  company_name: string;
  company_address: string;
  company_website: string;
  company_phone: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const auth = await requireAdmin(req, supabaseAdmin);
  if (!auth.isAdmin) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.authenticated ? 403 : 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const {
      deal_id,
      memo_type,
      branding = 'sourceco',
      project_name: requestProjectName,
    } = await req.json();

    if (!deal_id) {
      return new Response(JSON.stringify({ error: 'deal_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['anonymous_teaser', 'full_memo', 'both'].includes(memo_type)) {
      return new Response(
        JSON.stringify({ error: 'memo_type must be anonymous_teaser, full_memo, or both' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // GUARD: Anonymous Teaser requires a Final PDF of the Full Lead Memo
    if (memo_type === 'anonymous_teaser' || memo_type === 'both') {
      const { data: fullMemoPdf } = await supabaseAdmin
        .from('data_room_documents')
        .select('id')
        .eq('deal_id', deal_id)
        .eq('document_category', 'full_memo')
        .limit(1);
      if (!fullMemoPdf?.length) {
        return new Response(
          JSON.stringify({
            error:
              'Cannot generate Anonymous Teaser until a Final PDF of the Full Lead Memo has been uploaded.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Fetch all deal data
    const { data: deal, error: dealError } = await supabaseAdmin
      .from('listings')
      .select('*')
      .eq('id', deal_id)
      .single();

    if (dealError || !deal) {
      return new Response(JSON.stringify({ error: 'Deal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch transcripts
    const { data: transcripts } = await supabaseAdmin
      .from('deal_transcripts')
      .select('transcript_text, extracted_data, call_date, title, extraction_status')
      .eq('listing_id', deal_id)
      .not('extraction_status', 'eq', 'failed')
      .order('call_date', { ascending: false })
      .limit(10);

    // Fetch valuation data if applicable
    const { data: valuationData } = await supabaseAdmin
      .from('valuation_leads')
      .select('*')
      .eq('pushed_listing_id', deal_id)
      .maybeSingle();

    // Build data context for AI
    const dataContext = buildDataContext(deal, transcripts || [], valuationData);

    // Generate memo(s)
    const results: Record<string, Record<string, unknown>> = {};

    // Resolve project name: request param > deal record > fallback auto-generated
    const resolvedProjectName = (requestProjectName || deal.project_name || '') as string;

    // Extract company info from deal for memo metadata
    const fullCompanyMeta = {
      company_name: (deal.internal_company_name || deal.title || '') as string,
      company_address: [deal.address_city, deal.address_state].filter(Boolean).join(', ') as string,
      company_website: (deal.website || '') as string,
      company_phone: (deal.main_contact_phone || '') as string,
    };

    // For anonymous teasers, strip all identifying information from metadata
    const anonCompanyMeta = {
      company_name: resolvedProjectName || '', // Only project codename, no real name
      company_address: '', // No address at all
      company_website: '', // No website
      company_phone: '', // No phone
    };

    if (memo_type === 'anonymous_teaser' || memo_type === 'both') {
      const teaserContent = await generateMemo(
        anthropicApiKey,
        dataContext,
        'anonymous_teaser',
        branding,
        anonCompanyMeta,
        resolvedProjectName,
      );

      // Save to lead_memos
      const { data: teaser, error: teaserError } = await supabaseAdmin
        .from('lead_memos')
        .insert({
          deal_id,
          memo_type: 'anonymous_teaser',
          branding,
          content: teaserContent,
          html_content: sectionsToHtml(teaserContent, 'anonymous_teaser', branding),
          status: 'draft',
          generated_from: {
            sources: dataContext.sources,
            generated_at: new Date().toISOString(),
          },
          created_by: auth.userId,
        })
        .select()
        .single();

      if (teaserError) throw teaserError;
      results.anonymous_teaser = teaser;

      // Sync anonymous teaser to listing as ONE unified text block.
      // Instead of splitting into separate custom_sections (which are hard to
      // manage/edit), we merge all sections into a single description with
      // section headers as bold dividers within the text.
      const contentSections = teaserContent.sections
        .filter((s: MemoSection) => s.key !== 'header_block' && s.key !== 'contact_information');

      // Also keep custom_sections populated for backwards compatibility
      // with landing pages and detail views that render them
      const customSections = contentSections
        .map((s: MemoSection) => ({ title: s.title, description: s.content }));

      // Build ONE unified description from all sections
      const unifiedDescription = contentSections
        .map((s: MemoSection) => `**${s.title}**\n\n${s.content}`)
        .join('\n\n---\n\n');

      // Build unified HTML
      const unifiedHtml = contentSections
        .map((s: MemoSection) => {
          const sectionContent = s.content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/^/, '<p>')
            .replace(/$/, '</p>');
          return `<h3 style="font-size:16px;font-weight:bold;color:#1a1a2e;margin:24px 0 8px 0;padding-bottom:4px;border-bottom:1px solid #e0e0e0;">${s.title}</h3>${sectionContent}`;
        })
        .join('');

      const listingUpdate: Record<string, unknown> = {
        custom_sections: customSections,
        description: unifiedDescription,
        description_html: `<div class="unified-memo">${unifiedHtml}</div>`,
      };

      // Generate a compelling hero_description from the memo content.
      // The hero is the first thing buyers see on cards and landing pages —
      // it must be a concise 2-3 sentence elevator pitch, not just a data dump.
      listingUpdate.hero_description = buildHeroFromMemo(teaserContent.sections, deal);

      const { error: syncError } = await supabaseAdmin
        .from('listings')
        .update(listingUpdate)
        .eq('id', deal_id);
      if (syncError) {
        console.error('Failed to sync teaser sections to listing:', syncError);
      }
    }

    if (memo_type === 'full_memo' || memo_type === 'both') {
      const fullContent = await generateMemo(
        anthropicApiKey,
        dataContext,
        'full_memo',
        branding,
        fullCompanyMeta,
        resolvedProjectName,
      );

      const { data: fullMemo, error: fullError } = await supabaseAdmin
        .from('lead_memos')
        .insert({
          deal_id,
          memo_type: 'full_memo',
          branding,
          content: fullContent,
          html_content: sectionsToHtml(fullContent, 'full_memo', branding),
          status: 'draft',
          generated_from: {
            sources: dataContext.sources,
            generated_at: new Date().toISOString(),
          },
          created_by: auth.userId,
        })
        .select()
        .single();

      if (fullError) throw fullError;
      results.full_memo = fullMemo;
    }

    // Log audit event (non-blocking — don't fail the request if audit logging fails)
    const { error: auditError } = await supabaseAdmin.rpc('log_data_room_event', {
      p_deal_id: deal_id,
      p_user_id: auth.userId,
      p_action: 'generate_memo',
      p_metadata: {
        memo_type,
        branding,
        sources_used: dataContext.sources,
        memo_ids: Object.values(results).map((r) => r.id),
      },
      p_ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      p_user_agent: req.headers.get('user-agent') || null,
    });
    if (auditError) {
      console.error('Audit log failed (non-blocking):', auditError);
    }

    return new Response(JSON.stringify({ success: true, memos: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Generate memo error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to generate memo',
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

// ─── Data Context Builder ───

interface DataContext {
  deal: Record<string, unknown>;
  transcriptExcerpts: string;
  enrichmentData: string;
  manualEntries: string;
  valuationData: string;
  sources: string[];
}

function buildDataContext(
  deal: Record<string, unknown>,
  transcripts: Record<string, unknown>[],
  valuationData: Record<string, unknown> | null,
): DataContext {
  const sources: string[] = [];

  // Transcript excerpts (highest priority)
  let transcriptExcerpts = '';
  if (transcripts.length > 0) {
    sources.push('transcripts');
    transcriptExcerpts = transcripts
      .map((t, i) => {
        const parts = [];
        if (t.title) parts.push(`Title: ${t.title}`);
        if (t.extracted_data) parts.push(`Extracted Insights: ${JSON.stringify(t.extracted_data)}`);
        if (t.transcript_text) {
          // Take first 25000 chars per transcript for comprehensive context
          parts.push(`Transcript: ${t.transcript_text.substring(0, 25000)}`);
        }
        return `--- Call ${i + 1} (${t.call_date || 'unknown date'}) ---\n${parts.join('\n')}`;
      })
      .join('\n\n');
  }

  // General Notes (separate data source — broker notes, call summaries, etc.)
  let notesExcerpt = '';
  const rawNotes = typeof deal.internal_notes === 'string' ? deal.internal_notes : '';
  if (rawNotes.trim()) {
    sources.push('general_notes');
    notesExcerpt = rawNotes;
  }

  // Enrichment data (website scrape + LinkedIn)
  const enrichmentFields = [
    'description',
    'executive_summary',
    'services',
    'service_mix',
    'geographic_states',
    'address_city',
    'address_state',
    'linkedin_employee_count',
    'founded_year',
    'end_market_description',
    'industry',
    'category',
    'revenue',
    'ebitda',
    'ebitda_margin',
    'full_time_employees',
    'number_of_locations',
  ];
  const enrichmentData = enrichmentFields
    .filter((f) => deal[f] != null && deal[f] !== '')
    .map((f) => `${f}: ${JSON.stringify(deal[f])}`)
    .join('\n');
  if (enrichmentData) sources.push('enrichment');

  // Manual data entries (structured fields entered by admin)
  const manualFields = [
    'internal_company_name',
    'title',
    'website',
    'main_contact_name',
    'main_contact_email',
    'main_contact_phone',
    'main_contact_title',
    'owner_response',
    'seller_motivation',
    'owner_goals',
    'transition_preferences',
  ];
  const manualEntries = manualFields
    .filter((f) => deal[f] != null && deal[f] !== '')
    .map((f) => `${f}: ${JSON.stringify(deal[f])}`)
    .join('\n');
  if (manualEntries) sources.push('manual_entries');

  // Valuation data
  let valuationStr = '';
  if (valuationData) {
    sources.push('valuation_calculator');
    const valFields = [
      'revenue',
      'ebitda',
      'industry',
      'region',
      'growth_trend',
      'revenue_model',
      'locations_count',
    ];
    valuationStr = valFields
      .filter((f) => valuationData[f] != null)
      .map((f) => `${f}: ${JSON.stringify(valuationData[f])}`)
      .join('\n');
  }

  return {
    deal,
    transcriptExcerpts,
    enrichmentData,
    manualEntries:
      manualEntries + (notesExcerpt ? `\n\n--- GENERAL NOTES ---\n${notesExcerpt}` : ''),
    valuationData: valuationStr,
    sources,
  };
}

// ─── Hero Description Builder ───

/**
 * Build a compelling hero_description (max 500 chars) from the generated memo sections.
 * Extracts the opening sentences from company_overview and combines with key financial
 * highlights from financial_overview to create a concise elevator pitch.
 */
function buildHeroFromMemo(
  sections: MemoSection[],
  deal: Record<string, unknown>,
): string {
  const overview = sections.find((s) => s.key === 'company_overview');
  const financial = sections.find((s) => s.key === 'financial_overview');
  const growth = sections.find((s) => s.key === 'growth_opportunities');

  const heroParts: string[] = [];

  // Extract first 1-2 sentences from company overview (strip markdown formatting)
  if (overview?.content) {
    const plainText = overview.content
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^[-•]\s*/gm, '')
      .trim();
    // Get first 2 sentences
    const sentences = plainText.match(/[^.!?]+[.!?]+/g) || [];
    if (sentences.length >= 2) {
      heroParts.push(sentences.slice(0, 2).join('').trim());
    } else if (sentences.length === 1) {
      heroParts.push(sentences[0].trim());
    } else if (plainText.length > 0) {
      // No sentence endings found — take first 200 chars
      heroParts.push(plainText.substring(0, 200).trim() + '.');
    }
  }

  // Add a financial highlight if company overview didn't cover it
  const heroSoFar = heroParts.join(' ');
  const hasRevenue = /\$[\d.]+[MKB]/i.test(heroSoFar) || /revenue/i.test(heroSoFar);
  if (!hasRevenue && financial?.content) {
    const plainFinancial = financial.content
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .trim();
    const finSentences = plainFinancial.match(/[^.!?]+[.!?]+/g) || [];
    if (finSentences.length > 0) {
      heroParts.push(finSentences[0].trim());
    }
  }

  // Add growth angle if we have room
  if (growth?.content && heroParts.join(' ').length < 350) {
    const plainGrowth = growth.content
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .trim();
    const growthSentences = plainGrowth.match(/[^.!?]+[.!?]+/g) || [];
    if (growthSentences.length > 0) {
      heroParts.push(growthSentences[0].trim());
    }
  }

  let hero = heroParts.join(' ').trim();

  // Enforce 500 char limit — trim to last complete sentence
  if (hero.length > 500) {
    const trimmed = hero.substring(0, 500);
    const lastPeriod = trimmed.lastIndexOf('.');
    hero = lastPeriod > 100 ? trimmed.substring(0, lastPeriod + 1).trim() : trimmed.trim();
  }

  return hero;
}

// ─── AI Memo Generation ───

// Banned words/phrases that must never appear in the output
const BANNED_WORDS = [
  'strong',
  'robust',
  'impressive',
  'attractive',
  'compelling',
  'well-positioned',
  'significant opportunity',
  'poised for growth',
  'track record of success',
  'best-in-class',
  'proven',
  'demonstrated',
  'synergies',
  'uniquely positioned',
  'market leader',
  'value creation opportunity',
];

// Post-process: strip any banned words that slipped through
function enforceBannedWords(sections: MemoSection[]): MemoSection[] {
  return sections.map((s) => {
    let content = s.content;
    for (const banned of BANNED_WORDS) {
      const regex = new RegExp(`\\b${banned}\\b`, 'gi');
      content = content.replace(regex, '');
    }
    // Clean up double spaces left by removals
    content = content.replace(/  +/g, ' ').replace(/ ,/g, ',').replace(/ \./g, '.');
    return { ...s, content };
  });
}

// Post-process: strip all [DATA NEEDED: ...] and [VERIFY: ...] tags
function stripDataNeededTags(sections: MemoSection[]): MemoSection[] {
  return sections.map((s) => {
    let content = s.content;
    // Remove [DATA NEEDED: ...] and [VERIFY: ...] tags
    content = content.replace(/\[DATA NEEDED:[^\]]*\]/g, '');
    content = content.replace(/\[VERIFY:[^\]]*\]/g, '');
    // Clean up orphaned sentences/lines that now only contain whitespace
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
    // Clean up double spaces and trailing spaces
    content = content.replace(/  +/g, ' ').replace(/ +\n/g, '\n').trim();
    return { ...s, content };
  });
}

// Post-process: enforce anonymization by stripping any leaked identifying information
function enforceAnonymization(
  sections: MemoSection[],
  deal: Record<string, unknown>,
  projectCodename: string,
  regionName: string,
): MemoSection[] {
  // Build list of identifying terms to strip
  const identifyingTerms: string[] = [];

  const companyName = (deal.internal_company_name || '') as string;
  const title = (deal.title || '') as string;
  const website = (deal.website || '') as string;
  const contactName = (deal.main_contact_name || '') as string;
  const contactEmail = (deal.main_contact_email || '') as string;
  const contactPhone = (deal.main_contact_phone || '') as string;
  const addressCity = (deal.address_city || '') as string;
  const addressState = (deal.address_state || '') as string;

  if (companyName) {
    identifyingTerms.push(companyName);
    // Also strip without common suffixes
    const suffixes = [
      ' Inc',
      ' Inc.',
      ' LLC',
      ' Corp',
      ' Corp.',
      ' Ltd',
      ' Ltd.',
      ' Co',
      ' Co.',
      ' LP',
      ' LLP',
    ];
    for (const suffix of suffixes) {
      if (companyName.endsWith(suffix)) {
        identifyingTerms.push(companyName.slice(0, -suffix.length).trim());
      }
    }
  }
  if (title && title !== companyName) identifyingTerms.push(title);

  if (website) {
    identifyingTerms.push(website);
    const domain = website
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');
    identifyingTerms.push(domain);
    const domainBase = domain.split('.')[0];
    if (domainBase && domainBase.length >= 4) identifyingTerms.push(domainBase);
  }

  if (contactName) {
    identifyingTerms.push(contactName);
    const parts = contactName.split(/\s+/);
    if (parts.length >= 2) {
      parts.forEach((p) => {
        if (p.length >= 3) identifyingTerms.push(p);
      });
    }
  }
  if (contactEmail) identifyingTerms.push(contactEmail);
  if (contactPhone) {
    identifyingTerms.push(contactPhone);
    identifyingTerms.push(contactPhone.replace(/[\s\-().]/g, ''));
  }
  if (addressCity && addressCity.length >= 3) identifyingTerms.push(addressCity);

  // Build state-specific terms to replace
  const stateNames: Record<string, string> = {
    AL: 'Alabama',
    AK: 'Alaska',
    AZ: 'Arizona',
    AR: 'Arkansas',
    CA: 'California',
    CO: 'Colorado',
    CT: 'Connecticut',
    DE: 'Delaware',
    FL: 'Florida',
    GA: 'Georgia',
    HI: 'Hawaii',
    ID: 'Idaho',
    IL: 'Illinois',
    IN: 'Indiana',
    IA: 'Iowa',
    KS: 'Kansas',
    KY: 'Kentucky',
    LA: 'Louisiana',
    ME: 'Maine',
    MD: 'Maryland',
    MA: 'Massachusetts',
    MI: 'Michigan',
    MN: 'Minnesota',
    MS: 'Mississippi',
    MO: 'Missouri',
    MT: 'Montana',
    NE: 'Nebraska',
    NV: 'Nevada',
    NH: 'New Hampshire',
    NJ: 'New Jersey',
    NM: 'New Mexico',
    NY: 'New York',
    NC: 'North Carolina',
    ND: 'North Dakota',
    OH: 'Ohio',
    OK: 'Oklahoma',
    OR: 'Oregon',
    PA: 'Pennsylvania',
    RI: 'Rhode Island',
    SC: 'South Carolina',
    SD: 'South Dakota',
    TN: 'Tennessee',
    TX: 'Texas',
    UT: 'Utah',
    VT: 'Vermont',
    VA: 'Virginia',
    WA: 'Washington',
    WV: 'West Virginia',
    WI: 'Wisconsin',
    WY: 'Wyoming',
    DC: 'Washington D.C.',
  };
  // Collect specific states from the deal's geographic_states and address_state
  const statesInDeal: string[] = [];
  if (addressState) statesInDeal.push(addressState.toUpperCase());
  const geoStates = Array.isArray(deal.geographic_states)
    ? (deal.geographic_states as string[])
    : [];
  for (const s of geoStates) {
    if (s) statesInDeal.push(s.toUpperCase());
  }
  const uniqueStates = [...new Set(statesInDeal)];
  const stateNamesToReplace: string[] = [];
  for (const abbr of uniqueStates) {
    if (stateNames[abbr]) stateNamesToReplace.push(stateNames[abbr]);
    stateNamesToReplace.push(abbr);
  }

  // Deduplicate and sort by length (longest first for replacement priority)
  const uniqueTerms = [...new Set(identifyingTerms.filter((t) => t.length > 0))];
  uniqueTerms.sort((a, b) => b.length - a.length);

  return sections.map((s) => {
    let content = s.content;

    // Replace identifying company/contact terms
    for (const term of uniqueTerms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      content = content.replace(regex, projectCodename);
    }

    // Replace specific state names with region
    for (const stateName of stateNamesToReplace) {
      if (stateName.length <= 2) {
        // State abbreviation — only replace when it's a standalone word or preceded by a comma
        const regex = new RegExp(`\\b${stateName}\\b`, 'g');
        content = content.replace(regex, `the ${regionName}`);
      } else {
        // Full state name
        const escaped = stateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        content = content.replace(regex, `the ${regionName}`);
      }
    }

    // Strip any remaining email addresses
    content = content.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');

    // Strip any remaining phone numbers (US format)
    content = content.replace(/(\+?1?\s*[-.]?\s*)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '');

    // Strip any remaining URLs
    content = content.replace(/https?:\/\/[^\s)]+/g, '');
    content = content.replace(/www\.[^\s)]+/g, '');

    // Clean up double spaces, trailing spaces, orphan punctuation
    content = content.replace(/  +/g, ' ').replace(/ ,/g, ',').replace(/ \./g, '.').trim();

    return { ...s, content };
  });
}

async function generateMemo(
  apiKey: string,
  context: DataContext,
  memoType: 'anonymous_teaser' | 'full_memo',
  branding: string,
  companyMeta: {
    company_name: string;
    company_address: string;
    company_website: string;
    company_phone: string;
  },
  projectName?: string,
): Promise<MemoContent> {
  const isAnonymous = memoType === 'anonymous_teaser';

  // Derive the actual region/state for anonymous codename
  const dealState =
    typeof context.deal.address_state === 'string' ? context.deal.address_state : '';
  const stateToRegion: Record<string, string> = {
    AL: 'Southeast',
    AK: 'Pacific Northwest',
    AZ: 'Southwest',
    AR: 'South Central',
    CA: 'West Coast',
    CO: 'Mountain West',
    CT: 'Northeast',
    DE: 'Mid-Atlantic',
    FL: 'Southeast',
    GA: 'Southeast',
    HI: 'Pacific',
    ID: 'Mountain West',
    IL: 'Midwest',
    IN: 'Midwest',
    IA: 'Midwest',
    KS: 'Central',
    KY: 'Southeast',
    LA: 'Gulf Coast',
    ME: 'New England',
    MD: 'Mid-Atlantic',
    MA: 'New England',
    MI: 'Great Lakes',
    MN: 'Upper Midwest',
    MS: 'Gulf Coast',
    MO: 'Central',
    MT: 'Mountain West',
    NE: 'Central',
    NV: 'Mountain West',
    NH: 'New England',
    NJ: 'Mid-Atlantic',
    NM: 'Southwest',
    NY: 'Northeast',
    NC: 'Southeast',
    ND: 'Upper Midwest',
    OH: 'Great Lakes',
    OK: 'South Central',
    OR: 'Pacific Northwest',
    PA: 'Mid-Atlantic',
    RI: 'New England',
    SC: 'Southeast',
    SD: 'Upper Midwest',
    TN: 'Southeast',
    TX: 'South Central',
    UT: 'Mountain West',
    VT: 'New England',
    VA: 'Mid-Atlantic',
    WA: 'Pacific Northwest',
    WV: 'Appalachian',
    WI: 'Great Lakes',
    WY: 'Mountain West',
    DC: 'Mid-Atlantic',
  };
  const regionName = stateToRegion[dealState.toUpperCase()] || 'Central';
  // Use user-provided project name if available, otherwise generate from region
  const projectCodename = projectName?.trim() || `Project ${regionName}`;

  // Build list of identifying terms to warn the AI about for anonymous teasers
  const companyName = (context.deal.internal_company_name || context.deal.title || '') as string;
  const companyWebsite = (context.deal.website || '') as string;
  const contactName = (context.deal.main_contact_name || '') as string;
  const addressCity = (context.deal.address_city || '') as string;
  const geoStates = Array.isArray(context.deal.geographic_states)
    ? context.deal.geographic_states
    : [];

  const systemPrompt = `You are a VP at a buy-side investment bank writing an investment memo for the partners at a private equity firm. This memo will go to the investment committee.
...
${
  isAnonymous
    ? `MEMO TYPE: Anonymous Teaser (blind profile)

CRITICAL ANONYMITY RULES — VIOLATION OF ANY OF THESE WILL RESULT IN THE MEMO BEING REJECTED:
- NO company name — use ONLY the codename "${projectCodename}" throughout the memo
- NO owner/CEO name or any individual's name — refer to as "the owner," "the founder," "senior leadership," etc.
- NO street address, city name, or specific state names (e.g., do NOT write "Arizona," "Texas," "New York," etc.)
- Use ONLY broad regional descriptors: "${regionName} United States" or "multiple markets across the ${regionName}" — NEVER name specific states or cities
- NO website URL, email address, or phone number
- NO specific client, customer, partner, vendor, or supplier names (e.g., do NOT name "Carfax," "Parts Plus," "ASA," specific brand partnerships, etc.)
- NO branded service program names that could identify the company
- Financial data as ranges only (e.g., "$4.5M–$5.5M revenue", "28%–32% EBITDA margin")
- Services described generically (e.g., "automotive maintenance and repair" not the brand name of the service)
- NO founding dates that combined with other details could identify the company — use approximate years in operation (e.g., "approximately 3–5 years")
${companyName ? `- BANNED TERMS (these are the actual company identifiers — NEVER include them): "${companyName}"` : ''}
${
  companyWebsite
    ? `, "${companyWebsite}", "${companyWebsite
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '')}"`
    : ''
}
${contactName ? `, "${contactName}"` : ''}
${addressCity ? `\n- BANNED LOCATION: "${addressCity}" — do NOT mention this city` : ''}
${geoStates.length > 0 ? `\n- BANNED STATES: ${geoStates.map((s: string) => `"${s}"`).join(', ')} — do NOT name these states individually` : ''}

REQUIRED SECTIONS (9 sections — follow this exact structure — be EXHAUSTIVE with detail, this is a comprehensive investment document for an investment committee, NOT a short summary):
1. key: "company_overview" / title: "Company Overview" — THIS IS THE MOST IMPORTANT SECTION. It becomes the primary listing description buyers see. Write 4-6 rich, substantive paragraphs. This must read like a compelling investment thesis, NOT a generic template.
   - Paragraph 1: What the company does, its business model (how it makes money — B2B/B2C/mixed, recurring/project/contract-based, subscription/transactional), and how services interrelate. Be specific about what sets the revenue model apart.
   - Paragraph 2: Geographic presence (region only — NEVER name states or cities), operational scale (employee count range, number of locations), and years in operation (approximate range). Paint a picture of the operational footprint.
   - Paragraph 3: Competitive advantages and market position — certifications (described generically), preferred relationships, proprietary processes or technology, customer lock-in mechanisms, brand reputation, barriers to entry. What makes this business hard to replicate?
   - Paragraph 4: Customer base quality — types of customers served (without naming specific accounts), recurring/repeat dynamics, contract vs. spot revenue, customer diversification or concentration characteristics, end-market exposure.
   - Paragraph 5 (if data supports): Growth trajectory and acquisition attractiveness — how the business has grown, why a PE buyer would want this (platform potential, add-on opportunity, geographic gap-filler), and what investment would unlock.
   - Paragraph 6 (if data supports): Owner context — why they are seeking a transaction, preferred deal structure, transition willingness. Only include if this information exists in the data.
   Every sentence must contain at least one SPECIFIC fact, metric, or concrete detail from the provided data. Do NOT use vague phrases like "well-positioned" or "strong reputation" — state the actual evidence.
2. key: "financial_overview" / title: "Financial Overview" — Present a 3-year (or best available) annual summary table PLUS YTD as ranges: Revenue range, Gross Profit range, EBITDA range, EBITDA margin range, owner compensation add-backs (range), adjusted EBITDA range. Then a narrative paragraph covering: revenue trend and CAGR, margin evolution, revenue concentration risk, recurring vs. project revenue split, capex requirements (range), and working capital characteristics.
3. key: "services_operations" / title: "Services & Operations" — 3-5 paragraphs. All service lines with estimated revenue mix percentages (as ranges), operational footprint and geographic reach (region only — NEVER name specific states or cities), certifications described generically (e.g., "industry-standard certifications" not specific named programs), facilities (size ranges without addresses), capacity utilization, seasonal patterns, and key operational differentiators. Do NOT name specific vendor or partner companies.
4. key: "ownership_management" / title: "Ownership & Management" — 2-3 paragraphs. Owner/operator background: years in industry (no name), how long they have owned the business, day-to-day role and involvement level, management team depth (tenure ranges, functional coverage), whether there is a layer of management that would allow a transition, and what the owner is seeking from a transaction partner. No names — refer to as "the owner," "the founder," "senior leadership," etc.
5. key: "employees_workforce" / title: "Employees & Workforce" — Total headcount range, breakdown by function (field/technical, office/admin, management), key management depth and average tenure range, compensation structure (hourly vs. salary, benefit programs), training and certification programs (described generically), union status, and retention characteristics. Describe the workforce quality and any concentration risk without naming individuals.
6. key: "facilities_locations" / title: "Facilities & Locations" — Number of locations (region only, no cities, states, or addresses), approximate total square footage range, owned vs. leased breakdown, lease term ranges and renewal options, condition of facilities, and any planned expansions or consolidations.
7. key: "growth_opportunities" / title: "Growth Opportunities" — 3-4 paragraphs. Organic expansion opportunities (geographic, service line, pricing), M&A bolt-on potential, cross-sell opportunities, technology-driven efficiencies or margin improvement levers, and any identified demand tailwinds. Be specific about actionable initiatives a buyer could execute.
8. key: "key_risks" / title: "Key Considerations" — Customer concentration (top-customer revenue share as range), key-person dependency, regulatory or licensing factors (described generically, no state-specific references), competitive dynamics, end-market cyclicality, capital requirements for growth, and any other material risks. Present a balanced assessment — do not omit negatives.
9. key: "transaction_overview" / title: "Transaction Overview" — Transaction structure the owner is seeking (full sale, majority recap, growth partner), asking price or valuation range if known, preferred timeline, ideal buyer profile and characteristics, owner's transition willingness and preferred period, and any deal requirements or deal-breakers. No names.

IMPORTANT — COMPLETENESS RULES:
- Only write about information you actually have from the data provided
- If you do not have data for a metric or topic, simply OMIT it — do NOT write placeholder text, do NOT add "[DATA NEEDED: ...]" or "[VERIFY: ...]" tags
- Write substantive paragraphs for topics where data exists; skip topics where it does not
- Each section should contain ONLY factual content derived from the provided data — no filler, no speculation, no placeholder markers
- Do NOT repeat the same information across multiple sections — each section should cover its assigned topic without restating content from other sections`
    : `MEMO TYPE: Full Lead Memo (confidential, post-NDA)

Include all identifying information: company name, owner, address, website, contact details. Use exact financial figures.

REQUIRED SECTIONS (follow this exact structure):
1. key: "header_block" / title: "Header" — Company name (or codename), date, branding. Confidential disclaimer.
2. key: "contact_information" / title: "Contact Information" — Company HQ address, phone, website. Owner/CEO name, email, phone.
3. key: "company_overview" / title: "Company Overview" — THIS IS THE MOST IMPORTANT SECTION. Write 4-6 rich, substantive paragraphs covering: (a) What the company does and its business model — how it makes money, B2B/B2C/mixed, recurring/project-based, subscription/contract/transactional; (b) Geographic presence, operational scale (employees, locations), and years in business; (c) Competitive advantages — certifications, preferred vendor/carrier relationships, proprietary processes, barriers to entry; (d) Customer base quality — segments, recurring dynamics, contract vs. spot, diversification; (e) Growth trajectory and acquisition attractiveness; (f) Owner context if available. Every sentence must contain a specific fact, number, or concrete detail.
4. key: "ownership_management" / title: "Ownership & Management" — 2-3 paragraphs. Owner/operator background, how they came to own, industry experience, day-to-day role, management team depth and tenure, transaction goals and motivation.
5. key: "services_operations" / title: "Services & Operations" — 3-5 paragraphs. Detailed services with revenue mix percentages, customer types by service line, operational footprint, equipment and fleet, facilities, technology systems, certifications, capacity utilization, seasonal patterns.
6. key: "financial_overview" / title: "Financial Overview" — Revenue, EBITDA, margins for last 3 years (or available). YTD numbers. Revenue concentration. Capex. Working capital. Present as a table with brief narrative paragraph covering trends, margin evolution, and revenue quality.
7. key: "employees_workforce" / title: "Employees & Workforce" — Total headcount, breakdown by role (field/technical, office/admin, management), key personnel and tenure, compensation structure, training programs, union status, retention characteristics.
8. key: "facilities_locations" / title: "Facilities & Locations" — Number of locations, owned vs leased, lease terms, square footage, condition, planned expansions or consolidations.
9. key: "transaction_overview" / title: "Transaction Overview" — Full sale, majority recap, growth partner. Valuation expectations or asking price. Preferred timeline. Ideal buyer profile. Owner transition willingness and preferred period. Deal requirements or deal-breakers.

IMPORTANT — COMPLETENESS RULES:
- Only write about information you actually have from the data provided
- If you do not have data for a metric or topic, simply OMIT it — do NOT write placeholder text, do NOT add "[DATA NEEDED: ...]" or "[VERIFY: ...]" tags
- Write substantive paragraphs for topics where data exists; skip topics where it does not
- Each section should contain ONLY factual content derived from the provided data — no filler, no speculation, no placeholder markers
- Do NOT repeat the same information across multiple sections — each section should cover its assigned topic without restating content from other sections`
}

OUTPUT FORMAT:
Return a JSON object with a "sections" array. Each section has:
- "key": snake_case identifier (as specified above)
- "title": Display title (as specified above)
- "content": Rich text content using markdown: **bold**, *italic*, bullet points with -, tables with | header | header |

=== FEW-SHOT EXAMPLES ===

Example 1 — Anonymous Teaser Company Overview (Correct depth and detail — this is the MINIMUM quality bar):
Company Overview:
"${projectCodename} is a full-service restoration and reconstruction business operating across the ${regionName} United States, providing fire restoration, water mitigation, mold remediation, and commercial roofing services. The company operates on a hybrid revenue model combining insurance-referred restoration work (approximately 55%–65% of revenue) with direct-to-consumer retail projects, creating a diversified demand profile that provides resilience across economic cycles.

The business operates from two locations in the ${regionName} region with a team of approximately 40–50 full-time employees, including dedicated project managers, certified technicians, and administrative support staff. The company has been in continuous operation for approximately 15–20 years, building deep institutional knowledge of regional building codes, insurance carrier processes, and subcontractor networks.

The company maintains multiple industry-standard certifications and preferred vendor relationships with several national insurance carriers, which serve as a recurring referral pipeline and create meaningful barriers to entry for competitors. The company's in-house textile cleaning capability eliminates reliance on third-party vendors for contents restoration, improving both margins and turnaround times. These operational advantages, combined with a decades-long regional reputation, create a defensible market position.

The customer base spans residential homeowners (approximately 55%–65%), commercial property managers and building owners (approximately 25%–35%), and government/municipal contracts (approximately 5%–10%). Insurance-referred work provides natural customer acquisition at minimal marketing cost, while commercial contracts tend to be recurring in nature with higher average project values.

Revenue has grown from approximately $3.5M–$4.5M to $7.5M–$8.5M over the past five years, driven by geographic expansion, the addition of commercial roofing services, and deepening insurance carrier relationships. The business represents a platform opportunity in the fragmented restoration services market, with clear organic growth levers including geographic expansion, commercial segment growth, and potential bolt-on acquisitions of smaller regional operators.

The owner is seeking a full exit within approximately 12–18 months, primarily motivated by retirement after an extended ownership period. The owner has expressed willingness to support a transition period of up to one year to ensure continuity of key carrier relationships and customer accounts."

Example 2 — Full Memo Company Overview (Correct factual style with specifics):
Company Overview:
"Brook Capital LLC is a fee-based registered investment advisory firm headquartered in Wayne, New Jersey. Founded in 2013 and originally based in New York City, the firm relocated to northern New Jersey in 2017. Brook Capital manages approximately $900 million in assets under management across more than 200 household client relationships, with an average client AUM of approximately $2-$3 million.

The firm employs 11 individuals, including 7 licensed financial advisors. Brook Capital operates a fee-based model and does not engage in commission-based product sales. The firm provides comprehensive wealth management services including portfolio management, financial planning, tax planning, and estate planning. Revenue is generated through a tiered fee schedule based on AUM, creating a highly recurring and predictable revenue stream with minimal customer churn.

The firm serves affluent individuals and families, predominantly in the New York/New Jersey metropolitan area, with client retention rates exceeding 95% annually. The average client relationship tenure is approximately 5 years, reflecting the long-term nature of wealth management engagements and the trust-based advisory model."

Example 3 — Financial Overview (Correct range-based approach):
Financial Overview:
"Revenue has ranged from approximately $15 million to $18 million over the past three fiscal years, reflecting a compound annual growth rate of approximately 8%–10%. EBITDA has been in the $2.5 million to $3.0 million range, with margins improving from approximately 15% to 17% as the service and maintenance segment has grown as a share of total revenue. The service and maintenance segment carries higher margins than the new construction segment, and ownership has been actively shifting the revenue mix toward recurring service contracts, which now represent approximately 35%–40% of total revenue compared to approximately 20% three years ago."

CRITICAL: Every paragraph must contain SPECIFIC facts, numbers, or concrete details. Do NOT write vague paragraphs like "The company has a strong reputation in the market" or "The business is well-positioned for growth." Instead write: "The company has maintained preferred vendor status with three national insurance carriers for over a decade, generating approximately 60% of annual revenue through carrier referrals.";

  const userPrompt = `Generate a ${isAnonymous ? 'Anonymous Teaser' : 'Full Lead Memo'} from the following company data.

=== CALL TRANSCRIPTS (highest priority — richest source of detail) ===
${context.transcriptExcerpts || 'No transcripts available.'}

=== ENRICHMENT DATA (website scrape + LinkedIn) ===
${context.enrichmentData || 'No enrichment data available.'}

=== MANUAL DATA ENTRIES & GENERAL NOTES ===
${context.manualEntries || 'No manual entries or notes.'}

=== VALUATION CALCULATOR DATA ===
${context.valuationData || 'No valuation data.'}

DATA SOURCE PRIORITY: Transcripts > General Notes > Enrichment/Website > Manual entries.
When sources conflict, prefer higher-priority sources.

Follow the memo template exactly. Use only the sections specified. Present financial data in a table.

CRITICAL: Do NOT include any [DATA NEEDED: ...] or [VERIFY: ...] tags in your output. If data is missing, simply omit that topic — do not flag it. Write only about what you know from the provided data.${isAnonymous ? `\n\nCRITICAL ANONYMITY CHECK: Before returning the memo, verify that NONE of the following appear anywhere in your output: company name, website URL, owner name, city name, specific state names (like "Arizona", "Texas", "New York"), specific partner/vendor names, or phone numbers. Use only "${projectCodename}" as the company reference and "${regionName} United States" as the geographic reference.` : ''}

Generate the memo now. Return ONLY the JSON object with "sections" array.`;

  const response = await fetchWithAutoRetry(
    ANTHROPIC_API_URL,
    {
      method: 'POST',
      headers: getAnthropicHeaders(apiKey),
      body: JSON.stringify({
        model: DEFAULT_CLAUDE_MODEL,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.3,
        max_tokens: 16384,
      }),
    },
    { callerName: 'generate-lead-memo', maxRetries: 2 },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  const content = result.content?.[0]?.text;

  if (!content) {
    throw new Error('No content returned from AI');
  }

  let parsed: { sections?: MemoSection[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try to extract JSON from markdown code block
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error('Failed to parse AI response as JSON');
    }
  }

  // Post-process: enforce banned words removal
  let cleanedSections = enforceBannedWords(parsed.sections || []);

  // Post-process: strip all [DATA NEEDED: ...] and [VERIFY: ...] tags from both memo types
  cleanedSections = stripDataNeededTags(cleanedSections);

  // Post-process: for anonymous teasers, enforce anonymization by stripping any
  // identifying information that may have leaked through the AI
  if (isAnonymous) {
    cleanedSections = enforceAnonymization(
      cleanedSections,
      context.deal,
      projectCodename,
      regionName,
    );
  }

  return {
    sections: cleanedSections,
    memo_type: memoType,
    branding,
    generated_at: new Date().toISOString(),
    ...companyMeta,
  };
}

// ─── HTML Generation ───

function escapeHtmlForMemo(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sectionsToHtml(memo: MemoContent, memoType: string, branding: string): string {
  const brandName =
    branding === 'sourceco'
      ? 'SourceCo'
      : branding === 'new_heritage'
        ? 'New Heritage Capital'
        : branding === 'renovus'
          ? 'Renovus Capital'
          : branding === 'cortec'
            ? 'Cortec Group'
            : escapeHtmlForMemo(branding);

  const isAnonymous = memoType === 'anonymous_teaser';
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let html = `<div class="lead-memo ${memoType}" style="font-family: Arial, Helvetica, sans-serif; max-width: 800px; margin: 0 auto; color: #333; line-height: 1.6;">`;

  // Professional letterhead
  html += `<div class="memo-letterhead" style="text-align: center; padding-bottom: 20px; border-bottom: 3px solid #1a1a2e; margin-bottom: 24px;">`;
  html += `<p style="font-size: 22px; font-weight: bold; letter-spacing: 2px; color: #1a1a2e; margin: 0 0 4px 0;">${brandName.toUpperCase()}</p>`;
  html += `</div>`;

  // Company info block at top — only for full memos (anonymous teasers show only project codename)
  if (isAnonymous) {
    // For anonymous teasers, only show the project codename if provided
    if (memo.company_name) {
      html += `<div class="company-info" style="margin-bottom: 20px; padding: 16px; background: #f8f9fa; border-left: 4px solid #1a1a2e;">`;
      html += `<p style="font-size: 18px; font-weight: bold; margin: 0; color: #1a1a2e;">${escapeHtmlForMemo(memo.company_name)}</p>`;
      html += `</div>`;
    }
  } else if (memo.company_name || memo.company_address || memo.company_website) {
    html += `<div class="company-info" style="margin-bottom: 20px; padding: 16px; background: #f8f9fa; border-left: 4px solid #1a1a2e;">`;
    if (memo.company_name) {
      html += `<p style="font-size: 18px; font-weight: bold; margin: 0 0 4px 0; color: #1a1a2e;">${escapeHtmlForMemo(memo.company_name)}</p>`;
    }
    if (memo.company_address) {
      html += `<p style="font-size: 14px; margin: 0 0 2px 0; color: #555;">${escapeHtmlForMemo(memo.company_address)}</p>`;
    }
    if (memo.company_website) {
      html += `<p style="font-size: 14px; margin: 0 0 2px 0; color: #555;">${escapeHtmlForMemo(memo.company_website)}</p>`;
    }
    if (memo.company_phone) {
      html += `<p style="font-size: 14px; margin: 0; color: #555;">${escapeHtmlForMemo(memo.company_phone)}</p>`;
    }
    html += `</div>`;
  }

  // Memo type and date
  html += `<div style="text-align: center; margin-bottom: 24px;">`;
  html += `<p style="font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 4px 0;">${isAnonymous ? 'Anonymous Teaser' : 'Confidential Lead Memo'}</p>`;
  html += `<p style="font-size: 13px; color: #888; margin: 0;">${dateStr}</p>`;
  html += `</div>`;

  // Confidential disclaimer
  html += `<div style="text-align: center; padding: 8px; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; margin-bottom: 24px;">`;
  html += `<p style="font-size: 11px; color: #cc0000; font-style: italic; margin: 0;">CONFIDENTIAL — FOR INTENDED RECIPIENT ONLY</p>`;
  html += `</div>`;

  // Sections as continuous document
  for (const section of memo.sections) {
    // Skip header_block and contact_information since info is now in the letterhead
    if (section.key === 'header_block' || section.key === 'contact_information') continue;

    html += `<div class="memo-section" data-key="${escapeHtmlForMemo(section.key)}" style="margin-bottom: 20px;">`;
    html += `<h2 style="font-size: 16px; margin: 0 0 8px 0; color: #1a1a2e; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px;">${escapeHtmlForMemo(section.title)}</h2>`;
    html += `<div class="section-content" style="font-size: 14px;">${markdownToHtml(section.content)}</div>`;
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function markdownToHtml(text: string): string {
  if (!text) return '';

  // Split on double newlines into blocks, process each block independently
  const blocks = text.split(/\n\n+/);
  const htmlBlocks: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const lines = trimmed.split('\n');

    // Check if this block is a list (all lines start with "- ")
    const isList = lines.every((line) => line.trimStart().startsWith('- '));

    if (isList) {
      const items = lines
        .map((line) => line.trimStart().replace(/^- /, ''))
        .map((item) => `<li>${applyInlineFormatting(item)}</li>`)
        .join('');
      htmlBlocks.push(`<ul>${items}</ul>`);
    } else if (
      lines.length >= 2 &&
      lines[0].includes('|') &&
      /^\|?\s*[-:]+\s*(\|\s*[-:]+\s*)+\|?\s*$/.test(lines[1])
    ) {
      // Markdown table: header row + separator row + data rows
      const headerCells = lines[0].split('|').map((c) => c.trim()).filter(Boolean);
      let tableHtml = '<table style="width:100%;border-collapse:collapse;margin:12px 0;"><thead><tr>';
      for (const cell of headerCells) {
        tableHtml += `<th style="border:1px solid #ddd;padding:8px;text-align:left;background:#f5f5f5;">${applyInlineFormatting(cell)}</th>`;
      }
      tableHtml += '</tr></thead><tbody>';
      for (let r = 2; r < lines.length; r++) {
        if (!lines[r].includes('|')) break;
        const cells = lines[r].split('|').map((c) => c.trim()).filter(Boolean);
        tableHtml += '<tr>';
        for (const cell of cells) {
          tableHtml += `<td style="border:1px solid #ddd;padding:8px;">${applyInlineFormatting(cell)}</td>`;
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table>';
      htmlBlocks.push(tableHtml);
    } else {
      // Regular paragraph — join internal newlines with <br>
      const formatted = lines.map((line) => applyInlineFormatting(line)).join('<br>');
      htmlBlocks.push(`<p>${formatted}</p>`);
    }
  }

  return htmlBlocks.join('');
}

function applyInlineFormatting(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
}
