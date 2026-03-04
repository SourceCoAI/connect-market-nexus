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

      // Sync anonymous teaser content to the appropriate listing row.
      //
      // The deal row (is_internal_deal=true) should NOT have its description
      // overwritten with marketplace teaser content — that causes the deal
      // page to display marketplace listing text instead of deal notes.
      //
      // Strategy:
      //  - Always save custom_sections on the deal row (used by memo renderers).
      //  - Only write description/description_html/hero_description to the
      //    marketplace listing child row (source_deal_id → deal_id,
      //    is_internal_deal=false), if one exists.
      const contentSections = teaserContent.sections.filter(
        (s: MemoSection) => s.key !== 'header_block' && s.key !== 'contact_information',
      );

      // Keep custom_sections populated for backwards compatibility
      // with landing pages and detail views that render them
      const customSections = contentSections.map((s: MemoSection) => ({
        title: s.title,
        description: s.content,
      }));

      // Save custom_sections on the deal row (does NOT touch description)
      const { error: dealSyncError } = await supabaseAdmin
        .from('listings')
        .update({ custom_sections: customSections })
        .eq('id', deal_id);
      if (dealSyncError) {
        console.error('Failed to sync custom_sections to deal:', dealSyncError);
      }

      // Check if a marketplace listing (child row) exists for this deal
      const { data: marketplaceListing } = await supabaseAdmin
        .from('listings')
        .select('id')
        .eq('source_deal_id', deal_id)
        .eq('is_internal_deal', false)
        .maybeSingle();

      if (marketplaceListing) {
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
          .eq('id', marketplaceListing.id);
        if (syncError) {
          console.error('Failed to sync teaser sections to marketplace listing:', syncError);
        }
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
function buildHeroFromMemo(sections: MemoSection[], _deal: Record<string, unknown>): string {
  // Support both new keys (business_overview, deal_snapshot) and legacy keys (company_overview, financial_overview)
  const overview =
    sections.find((s) => s.key === 'business_overview') ||
    sections.find((s) => s.key === 'company_overview');
  const financial =
    sections.find((s) => s.key === 'deal_snapshot') ||
    sections.find((s) => s.key === 'financial_overview');
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
  'healthy',
  'recession-resistant',
  'scalable',
  'turnkey',
  'world-class',
  'industry-leading',
  'deep bench',
  'blue-chip',
  'mission-critical',
  'sticky revenue',
  'white-space',
  'low-hanging fruit',
  'runway',
  'tailwinds',
  'fragmented market',
  'platform opportunity',
  'notable',
  'consistent',
  'solid',
  'substantial',
  'meaningful',
  'considerable',
  'positioned for',
  'well-established',
  'high-quality',
  'top-tier',
  'premier',
  'best-of-breed',
  'differentiated',
  'defensible',
  'diversified',
];

// Post-process: strip any banned words that slipped through.
// Preserves text inside quotation marks (owner quotes may contain banned language).
function enforceBannedWords(sections: MemoSection[]): MemoSection[] {
  return sections.map((s) => {
    let content = s.content;
    // Split on quoted segments to preserve owner quotes
    const parts = content.split(/("[^"]*")/g);
    for (let i = 0; i < parts.length; i++) {
      // Only process non-quoted segments (odd indices are quoted matches)
      if (i % 2 === 0) {
        for (const banned of BANNED_WORDS) {
          const escaped = banned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
          parts[i] = parts[i].replace(regex, '');
        }
      }
    }
    content = parts.join('');
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

// ─── Full Lead Memo Generation (institutional factual memo) ───

// Expected section headers for full lead memo
const FULL_MEMO_EXPECTED_SECTIONS = [
  'COMPANY OVERVIEW',
  'FINANCIAL SNAPSHOT',
  'SERVICES AND OPERATIONS',
  'OWNERSHIP AND TRANSACTION',
  'MANAGEMENT AND STAFFING',
  'KEY STRUCTURAL NOTES',
];

const FULL_MEMO_REQUIRED_SECTIONS = ['COMPANY OVERVIEW'];

// Evaluative adjectives for audit warning (Check 6)
const EVALUATIVE_ADJECTIVES = [
  'strong',
  'large',
  'high',
  'good',
  'great',
  'excellent',
  'growing',
  'stable',
  'mature',
  'efficient',
  'clean',
  'lean',
  'tight',
  'reliable',
];

// Parse markdown with ## headers into MemoSection array
function parseMarkdownToSections(markdown: string): MemoSection[] {
  const sections: MemoSection[] = [];
  // Split on ## headers — parts[0] is text before first ##, rest are sections
  const parts = markdown.split(/^## /gm);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const newlineIdx = trimmed.indexOf('\n');
    if (newlineIdx === -1) continue;
    const title = trimmed.substring(0, newlineIdx).trim();
    const content = trimmed.substring(newlineIdx + 1).trim();
    if (!content) continue;
    const key = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/(^_|_$)/g, '');
    sections.push({ key, title, content });
  }
  return sections;
}

interface ValidationResult {
  passed: boolean;
  reason: string;
}

// Blocking validation checks for full lead memo (Checks 2, 3, 4)
function validateFullMemoSections(sections: MemoSection[]): ValidationResult {
  // Check 2: Required sections exist
  const sectionTitles = sections.map((s) => s.title.toUpperCase().trim());
  for (const required of FULL_MEMO_REQUIRED_SECTIONS) {
    if (!sectionTitles.includes(required)) {
      return { passed: false, reason: `Missing required section: "${required}"` };
    }
  }

  // Check 4: No unexpected section headers
  for (const title of sectionTitles) {
    if (!FULL_MEMO_EXPECTED_SECTIONS.includes(title)) {
      return {
        passed: false,
        reason: `Unexpected section header: "${title}". Expected one of: ${FULL_MEMO_EXPECTED_SECTIONS.join(', ')}`,
      };
    }
  }

  // Check 3: Word count <= 1000
  const allContent = sections.map((s) => s.content).join(' ');
  const wordCount = allContent.split(/\s+/).filter((w) => w.length > 0).length;
  if (wordCount > 1000) {
    return {
      passed: false,
      reason: `Word count is ${wordCount}. The maximum is 1,000 words. Shorten by removing lowest-priority content (enrichment details first, then operational details).`,
    };
  }

  return { passed: true, reason: '' };
}

// Non-blocking warning checks for full lead memo (Checks 5, 6)
function runMemoWarnings(sections: MemoSection[]): { warnings: string[] } {
  const warnings: string[] = [];

  // Check 5: Financial Figure Repetition
  const figuresBySection: Map<string, string[]> = new Map();
  for (const section of sections) {
    const figures = section.content.match(/\$[\d,.]+[KMBkmb]?|\d+(\.\d+)?%/g) || [];
    for (const fig of figures) {
      const existing = figuresBySection.get(fig);
      if (existing) {
        existing.push(section.title);
      } else {
        figuresBySection.set(fig, [section.title]);
      }
    }
  }
  for (const [figure, sectionNames] of figuresBySection) {
    if (sectionNames.length > 1) {
      warnings.push(
        `Financial figure "${figure}" appears in multiple sections: ${sectionNames.join(', ')}`,
      );
    }
  }

  // Check 6: Adjective Audit — flag evaluative adjectives not within 30 chars of a number
  for (const section of sections) {
    // Strip quoted text (owner quotes are acceptable)
    const unquoted = section.content.replace(/"[^"]*"/g, '');
    for (const adj of EVALUATIVE_ADJECTIVES) {
      const regex = new RegExp(`\\b${adj}\\b`, 'gi');
      let match;
      while ((match = regex.exec(unquoted)) !== null) {
        const start = Math.max(0, match.index - 30);
        const end = Math.min(unquoted.length, match.index + adj.length + 30);
        const surrounding = unquoted.substring(start, end);
        if (!/\d/.test(surrounding)) {
          warnings.push(
            `Adjective "${adj}" in ${section.title} without nearby number: "...${surrounding.trim()}..."`,
          );
        }
      }
    }
  }

  return { warnings };
}

// Generate a Full Lead Memo using the institutional factual prompt pipeline
async function generateFullMemo(
  apiKey: string,
  context: DataContext,
  branding: string,
  companyMeta: {
    company_name: string;
    company_address: string;
    company_website: string;
    company_phone: string;
  },
): Promise<MemoContent> {
  const systemPrompt = `You are a senior analyst at a tech-enabled investment bank writing an internal lead memo. This is a confidential document. Your audience is partners and deal team members who need to evaluate this opportunity quickly and consistently.

PURPOSE: Create a structured factual summary that preserves facts exactly as stated, provides enough clarity to determine buyer fit and risk profile, and removes ambiguity around financial quality, operational structure, and ownership dynamics. A partner should be able to read this memo in under 5 minutes and know whether to pursue the deal.

This is not a marketing document. It is not a teaser. It is an institutional record. It is meant to inform, not persuade.

FORMAT RULES:
- The complete memo must be 600-900 words. Do not exceed 1,000 words under any circumstance.
- Use bullet points for all content outside the Company Overview section. Do not use prose paragraphs in any other section.
- Company Overview should be 1 short paragraph (3-5 sentences max).
- Use bold labels for the following fields: Transaction type, Reason for sale, Valuation context, Real estate, EBITDA, Revenue, Headcount, and any structured data field. Do not bold every bullet.
- Include facts in this priority order: (1) financial figures, (2) transaction preferences and valuation context, (3) ownership and management structure, (4) services and operations, (5) enrichment details.

CORE DISCIPLINE:
- Every statement must be traceable to the provided source data (transcripts, financials, enrichment data, manual entries).
- If information was not directly stated, it must not be included. There is no room for inference.
- If margins appear high, do not comment on it. If a growth opportunity seems obvious but was not stated by the owner, it does not go in the memo.
- When data is missing, simply omit it. Do not state that it is missing or not provided.
- Do not characterize any data point. Do not describe revenue as "consistent," margins as "healthy," growth as "notable," or any metric with any evaluative adjective. State the number. The reader will interpret.
- Do not make comparisons to industry benchmarks, competitors, or market averages unless the source data contains a specific stated comparison.
- Do not use language that implies quality, risk, or opportunity. The memo presents facts. It does not evaluate them.
- When the same source provides contradictory figures (e.g., monthly revenue that does not annualize to stated annual revenue), include both figures exactly as stated and flag the discrepancy: "Owner stated $X monthly and $Y annually — these figures do not reconcile and should be clarified."
- If the owner provides a revenue or EBITDA range, present the range exactly as stated. Do not use the midpoint or either bound as a single figure.

WRITING STANDARD:
- Neutral, factual, controlled.
- No adjectives that imply quality. No promotional phrasing. No narrative storytelling. No emotional framing.
- Replace qualitative language with measurable facts. Wrong: "Diversified customer base." Right: "No customer represents more than 12% of revenue."
- When the owner's exact words are important to understanding their position (especially on transaction preferences, business description, or management involvement), use a direct quote attributed to the owner. Keep quotes to one sentence maximum.

SOURCE HIERARCHY:
- If financial statements or tax returns are provided, they take priority over verbal owner statements for financial figures specifically. Note the discrepancy: "Owner stated $X; financial statements show $Y."
- For all other facts: Transcripts > General Notes > Enrichment/Website > Manual entries.
- If multiple transcripts are provided, treat the most recent transcript as the highest priority. If figures differ between transcripts, use the most recent figure and note: "Updated from earlier call."
- For verifiable objective facts (founding year, legal name, number of locations), cross-reference transcript statements with enrichment data. If they conflict, include both: "Owner stated founded in 2005; website states 2009."
- If no call transcript is provided, note at the top of the memo: "This memo is based on enrichment data and manual entries only. No owner call transcript is available."

SECTIONS — use only the following section headers, in this order, when data exists for the section. COMPANY OVERVIEW is always included. Omit any other section that has no data. Do not include an "INFORMATION NOT YET PROVIDED" section. If data is missing, simply omit it — do not call out what is missing.

## COMPANY OVERVIEW
One paragraph, 3-5 sentences. Legal name, DBA if relevant, founded year, headquarters, number of locations and geography, employee count if known, ownership structure, core industry and service category. What the company does in plain terms. Business model defined clearly. This section should allow someone unfamiliar with the company to understand the nature of the business without interpretation.

## FINANCIAL SNAPSHOT
Present only the financial data points that are explicitly stated in the source data. Use simple labeled lines, one per data point. Format each line as: [Year] [Metric]: $[Amount]

Example format:
- 2025 Revenue: $5,200,000
- 2025 EBITDA: $1,100,000
- Owner Compensation: $350,000

Rules:
- Only include data points that are explicitly stated or confirmed in the source data.
- If adjusted EBITDA is mentioned, list each add-back individually with its dollar amount.
- Do not include any data point that was not stated. Do not write "not provided", "not stated", or "not yet provided" for any missing data — simply omit it.
- Do not characterize any trend. State the numbers.

## SERVICES AND OPERATIONS
What services are performed, how revenue is generated, and relevant operational details. All bullet points:
- Primary and secondary services
- Revenue mix by category if available (% breakdown)
- Recurring vs. project-based revenue if discussed
- Customer base type (retail, commercial, fleet, government) and concentration data if available.
- Vertical-specific KPIs when available:
  - Automotive repair: service mix %, avg ticket, car count, bay count, ASE certs, warranty programs, fleet vs retail, franchise/affiliate memberships
  - Collision repair: DRP %, OEM certs, ADAS capability, enterprise relationships, revenue per location
  - Infrastructure/construction: backlog, avg contract size, bonding capacity, public vs private mix, licensing
  - Staffing: gross margin, bill rate, contract vs perm mix, recruiter headcount
  - HVAC/mechanical: service vs install mix, commercial vs residential, maintenance agreement count, union status
  - Marine: yard capacity, dock size, certs, government work
  - IT/MSP: MRR, seat count, contract length, stack details
- Include only KPIs that appear in the provided data.

## OWNERSHIP AND TRANSACTION
Combine ownership details and transaction preferences into one section. All bullet points:
- Owner name(s), roles, and involvement level
- Transaction type (full sale, majority recap, partnership, etc.)
- Reason for sale
- Valuation expectation if stated (exact figures or multiples as given — do not comment on reasonableness)
- Management continuity post-transaction
- Real estate ownership (owned vs leased, included or excluded from deal)
- Any prior transaction history stated by the owner

## MANAGEMENT AND STAFFING
All bullet points:
- Management structure (who runs day-to-day operations)
- Owner involvement level (be specific — what does the owner do daily)
- Key personnel and their roles
- Store/location-level management details
- Total headcount if available.
- Compensation, benefits, and retention data if available.

## KEY STRUCTURAL NOTES
Include only if relevant structural complexity exists. All bullet points:
- Separate LLCs or entity structure
- Personally owned real estate with lease terms to the business
- Related businesses under same ownership (and whether shared overhead exists)
- Government designations (HUBZone, 8(a), SDVOSB, etc.)
- Non-compete structures, earn-out preferences, seller financing willingness
- Any other structural detail that affects deal evaluation

BANNED LANGUAGE — never use any of these words or phrases:
strong, robust, impressive, attractive, compelling, well-positioned, significant opportunity, poised for growth, track record of success, best-in-class, proven, demonstrated, synergies, uniquely positioned, market leader, value creation opportunity, healthy, diversified (as adjective without data), recession-resistant (without data), scalable (without specifics), turnkey, world-class, industry-leading, deep bench, blue-chip, mission-critical, sticky revenue, white-space, low-hanging fruit, runway, tailwinds, fragmented market, platform opportunity, notable, consistent (as characterization), solid, substantial, meaningful, considerable, positioned for, well-established, high-quality, top-tier, premier, best-of-breed, differentiated, defensible, platform (when used to characterize or elevate the business)`;

  const userPrompt = `Generate a Full Lead Memo from the following company data.

IMPORTANT: Call transcripts may include conversations between SourceCo associates and the business owner. Extract only facts about the target company stated by the owner or confirmed by the owner. Do not include information about prospective buyers, the SourceCo associate's pitch, buyer expansion plans, or negotiation framing. The memo is about the seller's business only.

=== CALL TRANSCRIPTS (highest priority — treat as primary source) ===
${context.transcriptExcerpts || 'No transcripts available.'}

=== ENRICHMENT DATA (website + LinkedIn — secondary source) ===
${context.enrichmentData || 'No enrichment data available.'}

=== MANUAL DATA ENTRIES & GENERAL NOTES ===
${context.manualEntries || 'No manual entries or notes.'}

=== VALUATION CALCULATOR DATA ===
${context.valuationData || 'No valuation data.'}

DATA SOURCE PRIORITY: Financial statements/tax returns (for financial figures) > Transcripts (most recent first) > General Notes > Enrichment/Website > Manual entries.
When sources conflict, use the highest-priority source and note the discrepancy.
When data is absent from all sources, simply omit it. Do not guess, and do not state that it was not provided.

Return the memo as markdown using ## headers for each section. Section headers must exactly match: COMPANY OVERVIEW, FINANCIAL SNAPSHOT, SERVICES AND OPERATIONS, OWNERSHIP AND TRANSACTION, MANAGEMENT AND STAFFING, KEY STRUCTURAL NOTES. Omit sections with no data except COMPANY OVERVIEW. Do not include an "INFORMATION NOT YET PROVIDED" section.

Present financial data in a table when location or year breakdowns are available. Use standard markdown table format:
| Column | Column |
| --- | --- |
| Data | Data |

Include all identifying information. Flag any data points where sources conflict.`;

  // Regeneration loop: up to 3 retries for blocking validation failures
  let bestSections: MemoSection[] = [];
  let retryAppendix = '';

  for (let attempt = 0; attempt < 4; attempt++) {
    const promptToSend = retryAppendix ? `${userPrompt}\n\n${retryAppendix}` : userPrompt;

    const response = await fetchWithAutoRetry(
      ANTHROPIC_API_URL,
      {
        method: 'POST',
        headers: getAnthropicHeaders(apiKey),
        body: JSON.stringify({
          model: DEFAULT_CLAUDE_MODEL,
          system: systemPrompt,
          messages: [{ role: 'user', content: promptToSend }],
          temperature: 0.2,
          max_tokens: 4096,
        }),
      },
      { callerName: 'generate-lead-memo-full', maxRetries: 2 },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const rawContent = result.content?.[0]?.text;

    if (!rawContent) {
      throw new Error('No content returned from AI');
    }

    // Parse markdown output into sections
    let sections = parseMarkdownToSections(rawContent);

    // Post-process: enforce banned words removal (preserves quoted text)
    sections = enforceBannedWords(sections);

    // Post-process: strip [DATA NEEDED: ...] and [VERIFY: ...] tags
    sections = stripDataNeededTags(sections);

    bestSections = sections;

    // Run blocking validation checks (Checks 2, 3, 4)
    const validation = validateFullMemoSections(sections);
    if (validation.passed) {
      break; // All blocking checks passed
    }

    // Failed validation — retry if attempts remain
    if (attempt < 3) {
      retryAppendix = `Your previous output failed validation: ${validation.reason}. Please correct and regenerate.`;
      console.warn(`Full memo validation failed (attempt ${attempt + 1}): ${validation.reason}`);
    } else {
      console.warn(
        `Full memo validation failed after 4 attempts. Using best attempt. Reason: ${validation.reason}`,
      );
    }
  }

  // Run non-blocking warning checks (Checks 5, 6)
  const { warnings } = runMemoWarnings(bestSections);
  if (warnings.length > 0) {
    console.warn('Full memo warnings:', warnings);
  }

  return {
    sections: bestSections,
    memo_type: 'full_memo',
    branding,
    generated_at: new Date().toISOString(),
    ...companyMeta,
  };
}

// ─── Anonymous Teaser Generation (institutional factual teaser) ───

// Expected section headers for anonymous teaser
const TEASER_EXPECTED_SECTIONS = [
  'BUSINESS OVERVIEW',
  'DEAL SNAPSHOT',
  'KEY FACTS',
  'GROWTH CONTEXT',
  'OWNER OBJECTIVES',
];

const TEASER_REQUIRED_SECTIONS = ['BUSINESS OVERVIEW', 'DEAL SNAPSHOT'];

// Blocking validation checks for anonymous teaser (Checks 3, 4, 5)
function validateTeaserSections(sections: MemoSection[]): ValidationResult {
  // Check 3: Required sections exist
  const sectionTitles = sections.map((s) => s.title.toUpperCase().trim());
  for (const required of TEASER_REQUIRED_SECTIONS) {
    if (!sectionTitles.includes(required)) {
      return { passed: false, reason: `Missing required section: "${required}"` };
    }
  }

  // Check 5: No unexpected section headers
  for (const title of sectionTitles) {
    if (!TEASER_EXPECTED_SECTIONS.includes(title)) {
      return {
        passed: false,
        reason: `Unexpected section header: "${title}". Expected one of: ${TEASER_EXPECTED_SECTIONS.join(', ')}`,
      };
    }
  }

  // Check 4: Word count <= 600
  const allContent = sections.map((s) => s.content).join(' ');
  const wordCount = allContent.split(/\s+/).filter((w) => w.length > 0).length;
  if (wordCount > 600) {
    return {
      passed: false,
      reason: `Word count is ${wordCount}. The maximum is 600 words. Shorten by removing lowest-priority content.`,
    };
  }

  return { passed: true, reason: '' };
}

// Generate an Anonymous Teaser using the institutional factual teaser pipeline
async function generateAnonymousTeaser(
  apiKey: string,
  context: DataContext,
  branding: string,
  companyMeta: {
    company_name: string;
    company_address: string;
    company_website: string;
    company_phone: string;
  },
  projectCodename: string,
  regionName: string,
): Promise<MemoContent> {
  // Build banned terms list for anonymity enforcement in the prompt
  const companyName = (context.deal.internal_company_name || context.deal.title || '') as string;
  const companyWebsite = (context.deal.website || '') as string;
  const contactName = (context.deal.main_contact_name || '') as string;
  const addressCity = (context.deal.address_city || '') as string;
  const geoStates = Array.isArray(context.deal.geographic_states)
    ? context.deal.geographic_states
    : [];

  const bannedIdentifiers: string[] = [];
  if (companyName) bannedIdentifiers.push(`"${companyName}"`);
  if (companyWebsite) {
    bannedIdentifiers.push(`"${companyWebsite}"`);
    const domain = companyWebsite
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');
    bannedIdentifiers.push(`"${domain}"`);
  }
  if (contactName) bannedIdentifiers.push(`"${contactName}"`);
  if (addressCity) bannedIdentifiers.push(`"${addressCity}"`);
  for (const s of geoStates) {
    if (s) bannedIdentifiers.push(`"${s}"`);
  }
  const bannedTermsLine =
    bannedIdentifiers.length > 0
      ? `\nBANNED IDENTIFYING TERMS (never include any of these): ${bannedIdentifiers.join(', ')}`
      : '';

  const systemPrompt = `You are a senior analyst at a tech-enabled investment bank writing an anonymous marketplace listing. Your audience is PE firms, family offices, and strategic acquirers in the lower-middle market ($500K-$10M EBITDA range) who evaluate dozens of opportunities per week.

PURPOSE: Create a factual, structured blind profile that gives qualified buyers enough information to determine fit and request a connection — without revealing the company identity. A buyer should be able to read the entire teaser in under 2 minutes.

FORMAT RULES:
- The complete teaser must be 300-500 words. Do not exceed 600 words under any circumstance.
- Use bullet points for all content outside the Business Overview section. Do not use prose paragraphs in any other section.
- Business Overview should be 2-3 sentences maximum.
- Include facts in this priority order: (1) financial figures, (2) transaction type and structure, (3) business model and services, (4) management and operations. If a fact must be omitted for length, it is acceptable to drop it entirely.

WRITING PRINCIPLES:
- Every claim must be traceable to the provided data. Do not infer, speculate, or editorialize.
- Replace adjectives with measurable facts.
- If information is not available, omit the topic entirely. Never use placeholders, estimates, or filler.
- Tone: neutral, factual, controlled.
- Do not characterize any data point. State the numbers and let the reader interpret.
- Do not make comparisons to industry benchmarks, competitors, or market averages.
- When the owner's exact words clarify the business model or transaction preference, use a direct quote without identifying the owner by name. Example: The business is described as "an automotive maintenance and repair facility that also installs tires."
- If the owner provides a range, present the range. Do not use midpoints.

SOURCE HIERARCHY:
- If financial statements or tax returns are provided, they take priority over verbal owner statements for financial figures specifically. Note the discrepancy: "Stated $X; financial statements show $Y."
- For all other facts: Transcripts > General Notes > Enrichment/Website > Manual entries.
- If multiple transcripts are provided, treat the most recent transcript as the highest priority. If figures differ between transcripts, use the most recent figure.
- For verifiable objective facts (founding year, number of locations), cross-reference transcript statements with enrichment data. If they conflict, use the most conservative/anonymous-safe version.
- If no call transcript is provided, note: "Based on enrichment data only. No owner call transcript available."

ANONYMITY RULES (absolute — violations break the listing):
- Use "${projectCodename}" only. Never include the company name, owner name, or any identifying proper nouns.
- Never include city or state names. Use "${regionName}" or similar regional descriptors only.
- Never include URLs, email addresses, or social media references.
- Present all financial figures as approximate ranges (plus or minus 10-15%).
- Do not include any detail specific enough to identify the company through triangulation (e.g., exact founding year + exact headcount + exact metro area together may be identifying).
- After drafting, perform a final anonymity audit: re-read every sentence and confirm no combination of details could identify the business.${bannedTermsLine}

SECTIONS — use only the following section headers, in this order, when data exists for the section. BUSINESS OVERVIEW and DEAL SNAPSHOT are always included regardless of data availability. Omit any other section that has no data.

## BUSINESS OVERVIEW
2-3 sentences. What the company does, how it makes money, approximate scale and geography (using regional descriptors only). No adjectives.

## DEAL SNAPSHOT
Structured labeled bullet points. Include only fields where data is available:
- **Revenue:** (range, anonymized with plus or minus 10-15%)
- **EBITDA / SDE:** (range, anonymized)
- **EBITDA Margin:** (range)
- **Employees:** (approximate)
- **Region:** (no city/state — use regional descriptors only)
- **Years in Operation:** (approximate range, e.g., "15-20 years")
- **Transaction Type:** (majority sale, full sale, recapitalization, etc.)

## KEY FACTS
3-5 bullet points. Each must be a specific, sourced fact — not a characterization.

Wrong: "Significant growth opportunity in adjacent markets"
Right: "Owner has not pursued commercial contracts, which represent approximately 40% of the regional market according to owner statements"

Wrong: "Recession-resistant business model"
Right: "Revenue has remained within a 5% band over the past four years including 2020"

Wrong: "Strong management team in place"
Right: "General manager has been with the company for 12 years and oversees daily operations without owner involvement"

## GROWTH CONTEXT
Only include if the owner explicitly stated growth plans. Bullet points with facts as stated. If no growth was discussed, omit this section entirely.

## OWNER OBJECTIVES
Transaction preference, timeline, transition willingness, reason for sale. Bullet points, stated exactly as provided. If not discussed, omit.

COMPLETENESS RULES:
- Omit any section where no data exists (except BUSINESS OVERVIEW and DEAL SNAPSHOT).
- Never repeat the same data point across sections.
- 300-500 words. Every bullet must earn its place.

BANNED LANGUAGE — never use any of these words or phrases:
strong, robust, impressive, attractive, compelling, well-positioned, significant opportunity, poised for growth, track record of success, best-in-class, proven, demonstrated, synergies, uniquely positioned, market leader, value creation opportunity, healthy, diversified (as adjective without data), recession-resistant (without data), scalable (without specifics), turnkey, world-class, industry-leading, deep bench, blue-chip, mission-critical, sticky revenue, white-space, low-hanging fruit, runway, tailwinds, fragmented market, platform opportunity, notable, consistent (as characterization), solid, substantial, meaningful, considerable, positioned for, well-established, high-quality, top-tier, premier, best-of-breed, differentiated, defensible, platform (when used to characterize or elevate the business)`;

  const userPrompt = `Generate an Anonymous Teaser from the following company data.

Codename: ${projectCodename}

IMPORTANT: Call transcripts may include conversations between SourceCo associates and the business owner. Extract only facts about the target company stated by the owner or confirmed by the owner. Do not include information about prospective buyers, the SourceCo associate's pitch, buyer expansion plans, or negotiation framing. The memo is about the seller's business only.

=== CALL TRANSCRIPTS (highest priority — treat as primary source) ===
${context.transcriptExcerpts || 'No transcripts available.'}

=== ENRICHMENT DATA (website + LinkedIn — secondary source) ===
${context.enrichmentData || 'No enrichment data available.'}

=== MANUAL DATA ENTRIES & GENERAL NOTES ===
${context.manualEntries || 'No manual entries or notes.'}

=== VALUATION CALCULATOR DATA ===
${context.valuationData || 'No valuation data.'}

DATA SOURCE PRIORITY: Financial statements/tax returns (for financial figures) > Transcripts (most recent first) > General Notes > Enrichment/Website > Manual entries.
When sources conflict, use the highest-priority source and note the discrepancy.
When data is absent from all sources, simply omit it. Do not guess, and do not state that it was not provided.

Return the memo as markdown using ## headers for each section. Section headers must exactly match: BUSINESS OVERVIEW, DEAL SNAPSHOT, KEY FACTS, GROWTH CONTEXT, OWNER OBJECTIVES. Omit sections with no data except BUSINESS OVERVIEW and DEAL SNAPSHOT.

FINAL ANONYMITY CHECK: Before returning the memo, re-read every sentence. Confirm that no combination of details (founding year + headcount + metro + industry) could identify the business. If in doubt, generalize further.`;

  // Regeneration loop: up to 3 retries for blocking validation failures
  let bestSections: MemoSection[] = [];
  let retryAppendix = '';

  for (let attempt = 0; attempt < 4; attempt++) {
    const promptToSend = retryAppendix ? `${userPrompt}\n\n${retryAppendix}` : userPrompt;

    const response = await fetchWithAutoRetry(
      ANTHROPIC_API_URL,
      {
        method: 'POST',
        headers: getAnthropicHeaders(apiKey),
        body: JSON.stringify({
          model: DEFAULT_CLAUDE_MODEL,
          system: systemPrompt,
          messages: [{ role: 'user', content: promptToSend }],
          temperature: 0.2,
          max_tokens: 4096,
        }),
      },
      { callerName: 'generate-lead-memo-teaser', maxRetries: 2 },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const rawContent = result.content?.[0]?.text;

    if (!rawContent) {
      throw new Error('No content returned from AI');
    }

    // Parse markdown output into sections
    let sections = parseMarkdownToSections(rawContent);

    // Post-process: enforce banned words removal (preserves quoted text)
    sections = enforceBannedWords(sections);

    // Post-process: strip [DATA NEEDED: ...] and [VERIFY: ...] tags
    sections = stripDataNeededTags(sections);

    // Post-process: enforce anonymization by stripping any identifying info that leaked
    sections = enforceAnonymization(sections, context.deal, projectCodename, regionName);

    bestSections = sections;

    // Run blocking validation checks (Checks 3, 4, 5)
    const validation = validateTeaserSections(sections);
    if (validation.passed) {
      break; // All blocking checks passed
    }

    // Failed validation — retry if attempts remain
    if (attempt < 3) {
      retryAppendix = `Your previous output failed validation: ${validation.reason}. Please correct and regenerate.`;
      console.warn(`Teaser validation failed (attempt ${attempt + 1}): ${validation.reason}`);
    } else {
      console.warn(
        `Teaser validation failed after 4 attempts. Using best attempt. Reason: ${validation.reason}`,
      );
    }
  }

  // Run non-blocking warning checks (Checks 6, 7)
  const { warnings } = runMemoWarnings(bestSections);
  if (warnings.length > 0) {
    console.warn('Teaser warnings:', warnings);
  }

  return {
    sections: bestSections,
    memo_type: 'anonymous_teaser',
    branding,
    generated_at: new Date().toISOString(),
    ...companyMeta,
  };
}

// ─── Memo Generation Router ───

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

  // Route to the appropriate generation pipeline
  if (!isAnonymous) {
    return await generateFullMemo(apiKey, context, branding, companyMeta);
  }

  return await generateAnonymousTeaser(
    apiKey,
    context,
    branding,
    companyMeta,
    projectCodename,
    regionName,
  );
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
      const headerCells = lines[0]
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      let tableHtml =
        '<table style="width:100%;border-collapse:collapse;margin:12px 0;"><thead><tr>';
      for (const cell of headerCells) {
        tableHtml += `<th style="border:1px solid #ddd;padding:8px;text-align:left;background:#f5f5f5;">${applyInlineFormatting(cell)}</th>`;
      }
      tableHtml += '</tr></thead><tbody>';
      for (let r = 2; r < lines.length; r++) {
        if (!lines[r].includes('|')) break;
        const cells = lines[r]
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean);
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
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
}
