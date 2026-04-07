import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  DEFAULT_GEMINI_MODEL,
  callGeminiWithTool,
  getGeminiApiKey,
} from '../_shared/ai-providers.ts';

interface ExtractionSource {
  type: string;
  transcript_id: string;
  extracted_at: string;
  fields_extracted?: string[];
  status?: string;
  note?: string;
}

interface RecentAcquisition {
  company_name: string;
  date?: string;
  location?: string;
}
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

interface ExtractTranscriptRequest {
  buyerId?: string;
  transcriptText?: string;
  source?: string;
  transcriptId?: string;
  transcript_id?: string;
  entity_type?: 'deal' | 'buyer' | 'both';
}

interface DealInsights {
  financial_metrics?: {
    revenue?: { value?: number; period?: string; source_quote?: string };
    ebitda?: { value?: number; margin?: number; source_quote?: string };
    growth_rate?: { value?: number; period?: string; source_quote?: string };
    other_metrics?: Array<{ metric_name: string; value: number | string; source_quote: string }>;
  };
  owner_details?: {
    name?: string;
    role?: string;
    age_or_tenure?: string;
    motivation?: string;
    timeline?: string;
    compensation?: string;
  };
  company_details?: {
    name?: string;
    industry?: string;
    location?: string;
    employees?: number;
    founded?: number;
    services?: string[];
  };
  deal_details?: {
    asking_price?: number;
    valuation_multiple?: string;
    deal_type?: string;
    deal_stage?: string;
    broker_involved?: boolean;
    broker_name?: string;
  };
  key_takeaways?: string[];
  follow_up_needed?: string[];
}

interface BuyerInsights {
  thesis_summary?: string;
  is_evaluation_call?: boolean;
  strategic_priorities?: string[];
  target_industries?: string[];
  target_geography?: { regions?: string[]; states?: string[]; notes?: string };
  deal_size_range?: {
    revenue_min?: number;
    revenue_max?: number;
    ebitda_min?: number;
    ebitda_max?: number;
    notes?: string;
  };
  acquisition_timeline?: string;
  acquisition_appetite?: string;
  acquisition_frequency?: string;
  services_offered?: string[];
  target_services?: string[];
  business_summary?: string;
  operating_locations?: string[];
  geographic_footprint?: string[];
  missing_information?: string[];
  buyer_type?: string;
  industry_vertical?: string;
  revenue_model?: string;
  recent_acquisitions?: Array<{ company_name: string; date?: string; location?: string }>;
  portfolio_companies?: string[];
  deal_structure_preferences?: string;
  management_team_notes?: string;
  integration_approach?: string;
  key_quotes?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const GEMINI_API_KEY = getGeminiApiKey();
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: ExtractTranscriptRequest = await req.json();
    const {
      buyerId,
      transcriptText,
      source: _source,
      transcriptId,
      transcript_id,
      entity_type = 'both',
    } = body;

    let transcriptTextToProcess: string;
    let buyerIdToUpdate: string | undefined = buyerId;
    let listingIdToUpdate: string | undefined;
    const transcriptIdForTracking: string | undefined = transcriptId || transcript_id;
    const buyerTranscriptIdToUpdate: string | undefined = transcriptId;

    if (transcriptText && buyerId) {
      console.log(`[TranscriptExtraction] Processing direct text for buyer ${buyerId}`);
      transcriptTextToProcess = transcriptText;
    } else if (transcript_id) {
      const { data: transcript, error: transcriptError } = await supabase
        .from('call_transcripts')
        .select('*')
        .eq('id', transcript_id)
        .single();

      if (transcriptError || !transcript) {
        return new Response(JSON.stringify({ error: 'Transcript not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      transcriptTextToProcess = transcript.transcript_text;
      buyerIdToUpdate = transcript.buyer_id;
      listingIdToUpdate = transcript.listing_id;

      await supabase
        .from('call_transcripts')
        .update({ processing_status: 'processing', processed_at: new Date().toISOString() })
        .eq('id', transcript_id);
    } else {
      return new Response(
        JSON.stringify({ error: 'Must provide either transcriptText+buyerId or transcript_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const insights: Record<string, unknown> = {};
    const keyQuotes: string[] = [];

    const ceoDetected = detectCEOInvolvement(transcriptTextToProcess);
    if (ceoDetected) {
      console.log(`[TranscriptExtraction] CEO detected in transcript`);
      insights.ceo_detected = true;

      if (buyerIdToUpdate && listingIdToUpdate) {
        await createEngagementSignal(
          supabase,
          listingIdToUpdate,
          buyerIdToUpdate,
          'ceo_involvement',
          40,
        );
      }
    }

    if ((entity_type === 'deal' || entity_type === 'both') && listingIdToUpdate) {
      console.log(`[TranscriptExtraction] Extracting deal insights`);
      const dealInsights = await extractDealInsights(transcriptTextToProcess, GEMINI_API_KEY);
      insights.deal = dealInsights;
      await updateListingFromTranscript(
        supabase,
        listingIdToUpdate,
        dealInsights,
        transcriptIdForTracking || 'direct',
      );
    }

    if ((entity_type === 'buyer' || entity_type === 'both') && buyerIdToUpdate) {
      console.log(`[TranscriptExtraction] Extracting buyer insights for ${buyerIdToUpdate}`);

      const { data: buyerContext } = await supabase
        .from('buyers')
        .select('company_name, pe_firm_name')
        .eq('id', buyerIdToUpdate)
        .single();

      const buyerInsights = await extractBuyerInsights(
        transcriptTextToProcess,
        GEMINI_API_KEY,
        buyerContext?.company_name || undefined,
        buyerContext?.pe_firm_name || undefined,
      );
      insights.buyer = buyerInsights;

      await updateBuyerFromTranscript(
        supabase,
        buyerIdToUpdate,
        buyerInsights,
        transcriptIdForTracking || 'direct',
      );

      if (buyerTranscriptIdToUpdate) {
        const { error: transcriptUpdateError } = await supabase
          .from('buyer_transcripts')
          .update({
            processed_at: new Date().toISOString(),
            extracted_insights: buyerInsights,
            extraction_status: 'completed',
          })
          .eq('id', buyerTranscriptIdToUpdate);

        if (transcriptUpdateError) {
          console.error(
            `[TranscriptExtraction] Failed to update buyer_transcripts record:`,
            transcriptUpdateError,
          );
        } else {
          console.log(
            `[TranscriptExtraction] Updated buyer_transcripts ${buyerTranscriptIdToUpdate} as processed`,
          );
        }
      }
    }

    if (transcriptIdForTracking && transcript_id) {
      const { error: updateError } = await supabase
        .from('call_transcripts')
        .update({
          extracted_insights: insights,
          key_quotes: keyQuotes,
          ceo_detected: ceoDetected,
          processing_status: 'completed',
        })
        .eq('id', transcript_id);

      if (updateError) {
        console.error('Failed to update transcript:', updateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        transcript_id: transcriptIdForTracking,
        buyer_id: buyerIdToUpdate,
        insights,
        key_quotes: keyQuotes,
        ceo_detected: ceoDetected,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Extract transcript error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

function detectCEOInvolvement(transcript: string): boolean {
  const ceoPatterns = [
    /\bCEO\b/i,
    /\bchief executive officer\b/i,
    /\bowner\b/i,
    /\bfounder\b/i,
    /\bpresident\b/i,
    /\bI started (the|this) (business|company)/i,
    /\bI (own|founded|built) (the|this) (business|company)/i,
    /\bI('m| am) the owner/i,
  ];
  return ceoPatterns.some((pattern) => pattern.test(transcript));
}

async function createEngagementSignal(
  supabase: SupabaseClient,
  listingId: string,
  buyerId: string,
  signalType: string,
  signalValue: number,
) {
  const { error } = await supabase.from('engagement_signals').insert({
    listing_id: listingId,
    buyer_id: buyerId,
    signal_type: signalType,
    signal_value: signalValue,
    source: 'system_detected',
    notes: 'Auto-detected from call transcript',
  });
  if (error) {
    console.error('Failed to create engagement signal:', error);
  } else {
    console.log(`[EngagementSignal] Created ${signalType} signal (+${signalValue} pts)`);
  }
}

async function extractDealInsights(transcriptText: string, apiKey: string): Promise<DealInsights> {
  const systemPrompt = `You are an M&A analyst extracting structured deal information from call transcripts. Your job is to pull out every financial metric, owner detail, and deal-relevant data point.

RULES:
1. Be precise with numbers: "two million" = 2000000, "about seven and a half million" = 7500000, "six fifty" in context of thousands = 650000, "six fifty" in context of millions = 6500000. Use context to determine scale.
2. Always convert to raw numbers — no dollar signs, commas, or abbreviations.
3. Percentages as decimals: 18% = 0.18.
4. If unsure about a figure, include it rather than omitting it.
5. Extract financial data even when embedded in casual conversation: "yeah, we cleared about two million after expenses last year" = EBITDA/profit ~2000000.
6. Distinguish between: revenue, gross profit, EBITDA, SDE, net income, cash flow. Owners use these terms loosely — categorize based on context, not the word they used.`;

  const tool = {
    type: 'function',
    function: {
      name: 'extract_deal_insights',
      description:
        'Extract all deal-relevant information from a transcript including financials, owner details, company details, and deal specifics',
      parameters: {
        type: 'object',
        properties: {
          financial_metrics: {
            type: 'object',
            properties: {
              revenue: {
                type: 'object',
                properties: {
                  value: {
                    type: 'number',
                    description: 'Annual revenue in raw dollars (e.g., 5000000 for $5M)',
                  },
                  period: { type: 'string', description: 'Time period: TTM, FY2025, etc.' },
                  source_quote: {
                    type: 'string',
                    description: 'Exact verbatim quote where revenue was mentioned',
                  },
                },
              },
              ebitda: {
                type: 'object',
                properties: {
                  value: { type: 'number', description: 'EBITDA/SDE in raw dollars' },
                  margin: {
                    type: 'number',
                    description: 'EBITDA margin as decimal (0.18 for 18%)',
                  },
                  source_quote: { type: 'string', description: 'Exact verbatim quote' },
                },
              },
              growth_rate: {
                type: 'object',
                properties: {
                  value: { type: 'number', description: 'Growth rate as decimal (0.15 for 15%)' },
                  period: { type: 'string', description: 'Time period for growth rate' },
                  source_quote: { type: 'string' },
                },
              },
              other_metrics: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    metric_name: {
                      type: 'string',
                      description: 'E.g., average job size, customer count, backlog',
                    },
                    value: {
                      type: 'string',
                      description: 'Value of the metric (number or description)',
                    },
                    source_quote: { type: 'string' },
                  },
                  required: ['metric_name', 'value'],
                },
                description: "Any financial metrics that don't fit main categories",
              },
            },
          },
          owner_details: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              role: { type: 'string' },
              age_or_tenure: { type: 'string', description: 'Age or years in business' },
              motivation: { type: 'string', description: "Why they're selling/exploring options" },
              timeline: { type: 'string', description: 'Desired timeline for transaction' },
              compensation: {
                type: 'string',
                description: 'Owner compensation if mentioned (salary, benefits, perks)',
              },
            },
          },
          company_details: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              industry: { type: 'string', description: 'Most specific industry label' },
              location: { type: 'string', description: 'City, ST format' },
              employees: { type: 'number', description: 'Total employee count (FT + PT)' },
              founded: { type: 'number', description: '4-digit founding year' },
              services: {
                type: 'array',
                items: { type: 'string' },
                description: 'All services/products mentioned',
              },
            },
          },
          deal_details: {
            type: 'object',
            properties: {
              asking_price: { type: 'number', description: 'Asking price in raw dollars' },
              valuation_multiple: {
                type: 'string',
                description: "E.g., '4-6x EBITDA', '1.2x revenue'",
              },
              deal_type: {
                type: 'string',
                description: 'Full sale, majority recap, partnership, etc.',
              },
              deal_stage: {
                type: 'string',
                description: 'Early exploration, LOI, due diligence, etc.',
              },
              broker_involved: { type: 'boolean' },
              broker_name: { type: 'string' },
            },
          },
          key_takeaways: {
            type: 'array',
            items: { type: 'string' },
            description:
              '5-8 most important facts from this call. Prioritize: financial data, owner situation, deal timing, red flags, competitive advantages.',
          },
          follow_up_needed: {
            type: 'array',
            items: { type: 'string' },
            description: 'Questions that remain unanswered after this call.',
          },
        },
      },
    },
  };

  const result = await callGeminiWithTool(
    systemPrompt,
    `Extract all deal-relevant information from this transcript. Capture every financial figure, owner detail, and deal-relevant data point.\n\nTRANSCRIPT:\n${transcriptText}`,
    tool,
    apiKey,
    DEFAULT_GEMINI_MODEL,
    45000,
    8192,
  );

  return (result.data as DealInsights) || {};
}

async function extractBuyerInsights(
  transcriptText: string,
  apiKey: string,
  platformCompanyName?: string,
  peFirmName?: string,
): Promise<BuyerInsights> {
  const companyContext = platformCompanyName
    ? `\n\nKNOWN ENTITIES:
- PLATFORM COMPANY (the buyer / operating company): "${platformCompanyName}"
- PE FIRM SPONSOR: "${peFirmName || 'unknown'}"`
    : '';

  const systemPrompt = `You are an M&A analyst extracting the PLATFORM COMPANY'S acquisition thesis from a call transcript. You must distinguish between the platform company and the PE firm sponsor using BOTH names and contextual clues.
${companyContext}

CRITICAL — EVALUATION CALLS vs THESIS CALLS:
Some transcripts are calls where the BUYER is EVALUATING a potential acquisition target. In these calls:
- The TARGET company describes THEIR operations, services, locations, and financials
- The BUYER asks questions to evaluate fit
- DO NOT extract the target company's data as if it belongs to the buyer
- ONLY extract what you learn about the BUYER's acquisition criteria, strategy, and preferences
- If the call is primarily about evaluating a target, set is_evaluation_call to true and leave services_offered, business_summary, operating_locations, and geographic_footprint EMPTY

DISTINGUISHING PLATFORM vs PE FIRM — USE THESE CONTEXTUAL SIGNALS:

PLATFORM COMPANY signals (use for business_summary, services_offered, operating_locations, geographic_footprint):
- Discussions about the PLATFORM's own day-to-day operations, service delivery, crews, trucks, jobs
- "We do [service]", "our technicians", "we serve [area]", "our office in [city]" — ONLY when spoken BY the platform company
- Mentions of the platform's own specific service types (restoration, roofing, HVAC, plumbing, etc.)
- The platform company's own customer relationships, project descriptions, seasonal patterns
- Where the PLATFORM physically has offices, warehouses, or serves customers

PE FIRM signals (NEVER use for platform operational fields):
- Investment thesis, fund structure, LP discussions, portfolio strategy
- "Our fund", "our portfolio companies", "we've invested in"
- HQ of the PE firm — this is NOT an operating location
- Board-level strategy that doesn't describe day-to-day operations

TARGET COMPANY signals (NEVER use for buyer/platform fields):
- The person being interviewed describes THEIR company's operations
- "We have X employees", "we do $Y in revenue", "we're based in [city]"
- When spoken by someone who is NOT part of the buyer/platform organization
- Financial metrics of the company being evaluated for acquisition

GEOGRAPHIC FOOTPRINT — Only include states where the PLATFORM COMPANY physically operates. Never include:
- PE firm HQ location
- Target company locations
- States mentioned only as potential expansion targets

If the transcript is primarily an evaluation of a target company (not a discussion of the platform's own thesis), return:
- is_evaluation_call: true
- business_summary: "" (empty)
- services_offered: [] (empty)
- operating_locations: [] (empty)
- geographic_footprint: [] (empty)
- missing_information: explain that this was a target evaluation call`;

  const tool = {
    type: 'function',
    function: {
      name: 'extract_buyer_thesis',
      description:
        "Extract the platform company's acquisition thesis and buyer profile from a transcript. NEVER extract a target company's data as if it belongs to the buyer.",
      parameters: {
        type: 'object',
        properties: {
          thesis_summary: {
            type: 'string',
            description:
              "The platform company's OWN acquisition thesis — what they're looking to buy and why. NOT the target company's description. Leave empty if this is a target evaluation call.",
          },
          is_evaluation_call: {
            type: 'boolean',
            description:
              'Set to true if this is primarily a target evaluation call rather than a thesis discussion. When true, operational fields should be empty.',
          },
          strategic_priorities: {
            type: 'array',
            items: { type: 'string' },
            description:
              "The platform company's strategic goals and priorities. NOT the target's goals.",
          },
          target_industries: {
            type: 'array',
            items: { type: 'string' },
            description: 'Industries the buyer is targeting for acquisitions.',
          },
          target_geography: {
            type: 'object',
            properties: {
              regions: {
                type: 'array',
                items: { type: 'string' },
                description: "Regional targets (e.g., 'Southeast', 'Mid-Atlantic')",
              },
              states: {
                type: 'array',
                items: { type: 'string' },
                description: '2-letter state codes of target geographies',
              },
              notes: { type: 'string', description: 'Additional geographic context' },
            },
            description: 'Where the buyer wants to acquire companies.',
          },
          deal_size_range: {
            type: 'object',
            properties: {
              revenue_min: { type: 'number' },
              revenue_max: { type: 'number' },
              ebitda_min: { type: 'number' },
              ebitda_max: { type: 'number' },
              notes: { type: 'string' },
            },
            description: 'Target acquisition size criteria.',
          },
          acquisition_timeline: {
            type: 'string',
            description:
              "How actively is the buyer looking? E.g., 'active', 'exploring', 'paused'. Use 'insufficient' if not discussed.",
          },
          acquisition_appetite: {
            type: 'string',
            description:
              "Activity level and pace. E.g., 'Very Active - doing 3-4 deals per year', 'Moderate - 1-2 per year', 'Just starting acquisition strategy'. Include any specifics about how many deals they want to do.",
          },
          acquisition_frequency: {
            type: 'string',
            description:
              "How often they acquire. E.g., '2-3 per year', 'Monthly', 'Opportunistic'. Extract from statements like 'we try to do about one deal a quarter'.",
          },
          target_services: {
            type: 'array',
            items: { type: 'string' },
            description:
              "Specific service types the buyer wants to acquire. E.g., ['HVAC', 'plumbing', 'electrical'], ['commercial roofing', 'waterproofing']. Different from services_offered — these are what they WANT to buy.",
          },
          buyer_type: {
            type: 'string',
            description:
              "Classify the buyer: 'private_equity' (PE fund with LP capital), 'corporate' (operating company acquiring for growth), 'family_office', 'search_fund', 'independent_sponsor', or 'individual_buyer'. If the company has real operations/revenue/customers, always use 'corporate' regardless of acquisition volume.",
          },
          industry_vertical: {
            type: 'string',
            description:
              "The buyer's primary industry vertical. E.g., 'Home Services - HVAC', 'Facility Services', 'Environmental Services', 'Healthcare Services'.",
          },
          revenue_model: {
            type: 'string',
            description:
              "How the platform company generates revenue. E.g., 'Recurring maintenance contracts (60%) and project-based installation work (40%)', 'Insurance restoration referrals and direct-to-consumer'. 1-3 sentences.",
          },
          deal_structure_preferences: {
            type: 'string',
            description:
              "Preferred deal structures discussed. E.g., 'Prefers majority recaps with owner rollover', 'Full buyouts only', 'Open to earnouts', 'Wants seller to stay 2-3 years'. Include any mention of earnouts, rollover equity, seller notes, transition periods.",
          },
          management_team_notes: {
            type: 'string',
            description:
              "Notes about the buyer's management team or operating capabilities discussed. E.g., 'Has a dedicated integration team', 'CEO has 20 years industry experience', 'Looking for deals where owner stays to run operations'.",
          },
          integration_approach: {
            type: 'string',
            description:
              "How the buyer integrates acquisitions. E.g., 'Keep the brand and local management, centralize back-office', 'Full rebrand within 6 months', 'Light touch - just add shared services'. Include any operational integration details discussed.",
          },
          recent_acquisitions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                company_name: { type: 'string' },
                date: { type: 'string', description: 'YYYY-MM or YYYY format' },
                location: { type: 'string', description: 'City, ST format' },
              },
              required: ['company_name'],
            },
            description:
              "Any acquisitions the buyer mentions having completed. E.g., 'We just closed on ABC Plumbing in Dallas last month'.",
          },
          portfolio_companies: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Names of portfolio companies or platforms the buyer mentions owning or operating.',
          },
          key_quotes: {
            type: 'array',
            items: { type: 'string' },
            description:
              '5-8 most revealing verbatim quotes from the BUYER that capture their acquisition thesis, preferences, deal criteria, or strategic priorities. NOT quotes from the target company.',
          },
          services_offered: {
            type: 'array',
            items: { type: 'string' },
            description:
              "Services the PLATFORM COMPANY itself provides (NOT the target's services). Leave empty if this is a target evaluation call.",
          },
          business_summary: {
            type: 'string',
            description:
              "Summary of the PLATFORM COMPANY's own business (NOT the target being evaluated). Leave empty if this is a target evaluation call.",
          },
          operating_locations: {
            type: 'array',
            items: { type: 'string' },
            description:
              "'City, ST' format. Only the PLATFORM COMPANY's own physical locations. NOT PE firm HQ. NOT target company locations.",
          },
          geographic_footprint: {
            type: 'array',
            items: { type: 'string' },
            description:
              '2-letter state codes where the PLATFORM COMPANY physically operates. NOT PE firm HQ states. NOT target company states.',
          },
          missing_information: {
            type: 'array',
            items: { type: 'string' },
            description:
              "EVERYTHING the transcript did NOT cover. If this is a target evaluation call, note that the buyer's thesis/criteria were not discussed.",
          },
        },
      },
    },
  };

  const result = await callGeminiWithTool(
    systemPrompt,
    `Analyze the following transcript and extract the platform company's acquisition thesis and profile. Remember: every statement must be traceable to what was said in the call. If the call is primarily about evaluating a target company for acquisition (not about the buyer's own thesis), set is_evaluation_call to true and leave operational fields empty.\n\nTRANSCRIPT:\n${transcriptText}`,
    tool,
    apiKey,
    DEFAULT_GEMINI_MODEL,
    45000,
    8192,
  );

  const insights = (result.data as BuyerInsights) || {};

  if (
    insights.is_evaluation_call &&
    (!insights.missing_information || insights.missing_information.length === 0)
  ) {
    insights.missing_information = [
      'What specific services/verticals are you targeting for add-ons?',
      'What geographic markets are you prioritizing?',
      'What is your target size range (revenue/EBITDA)?',
      'What is your acquisition timeline?',
      'What are your deal structure preferences?',
    ];
  }

  if (insights.is_evaluation_call) {
    insights.business_summary = '';
    insights.services_offered = [];
    insights.operating_locations = [];
    insights.geographic_footprint = [];
    insights.thesis_summary = '';
    insights.strategic_priorities = [];
    insights.revenue_model = '';
    insights.industry_vertical = '';
    insights.key_quotes = [];
  }

  return insights;
}

async function updateListingFromTranscript(
  supabase: SupabaseClient,
  listingId: string,
  insights: DealInsights,
  transcriptId: string,
) {
  const updates: Record<string, unknown> = {};

  // Financial metrics
  if (insights.financial_metrics?.revenue?.value) {
    updates.revenue = insights.financial_metrics.revenue.value;
    if (insights.financial_metrics.revenue.source_quote)
      updates.revenue_source_quote = insights.financial_metrics.revenue.source_quote;
  }
  if (insights.financial_metrics?.ebitda?.value) {
    updates.ebitda = insights.financial_metrics.ebitda.value;
    if (insights.financial_metrics.ebitda.margin)
      updates.ebitda_margin = insights.financial_metrics.ebitda.margin;
  }
  if (insights.financial_metrics?.growth_rate?.value) {
    // Append growth rate info to financial_notes if not already captured
    const growthNote = `Growth rate: ${(insights.financial_metrics.growth_rate.value * 100).toFixed(1)}%${insights.financial_metrics.growth_rate.period ? ` (${insights.financial_metrics.growth_rate.period})` : ''}`;
    if (insights.financial_metrics.growth_rate.source_quote) {
      updates.growth_trajectory = `${growthNote}. Source: "${insights.financial_metrics.growth_rate.source_quote}"`;
    }
  }
  if (insights.financial_metrics?.other_metrics?.length) {
    // Append other metrics to financial_notes
    const otherMetricsText = insights.financial_metrics.other_metrics
      .map((m) => `${m.metric_name}: ${m.value}`)
      .join('; ');
    const existingNotes = (updates.financial_notes as string) || '';
    updates.financial_notes = existingNotes
      ? `${existingNotes}\n\nAdditional Metrics: ${otherMetricsText}`
      : `Additional Metrics: ${otherMetricsText}`;
  }

  // Owner & transaction details
  if (insights.owner_details?.motivation) updates.owner_goals = insights.owner_details.motivation;
  if (insights.owner_details?.timeline)
    updates.transition_preferences = insights.owner_details.timeline;
  if (insights.owner_details?.compensation) {
    // Append owner compensation to financial_notes
    const existingNotes = (updates.financial_notes as string) || '';
    const compNote = `Owner Compensation: ${insights.owner_details.compensation}`;
    updates.financial_notes = existingNotes ? `${existingNotes}\n\n${compNote}` : compNote;
  }

  // Company details
  if (insights.company_details?.industry) updates.industry = insights.company_details.industry;
  if (insights.company_details?.employees)
    updates.full_time_employees = insights.company_details.employees;
  if (insights.company_details?.founded) updates.founded_year = insights.company_details.founded;
  if (insights.company_details?.services?.length)
    updates.services = insights.company_details.services;
  if (insights.company_details?.location) {
    // Extract city and state from "City, ST" format
    const locMatch = insights.company_details.location.match(/^(.+),\s*([A-Z]{2})$/);
    if (locMatch) {
      updates.address_city = locMatch[1].trim();
      updates.address_state = locMatch[2].trim();
    }
  }

  // Deal details
  if (insights.deal_details?.asking_price)
    updates.asking_price = insights.deal_details.asking_price;
  if (insights.deal_details?.deal_type) {
    // Append deal type info to owner_goals if not already there
    const existingGoals = (updates.owner_goals as string) || '';
    if (existingGoals && !existingGoals.includes(insights.deal_details.deal_type)) {
      updates.owner_goals = `${existingGoals} Preferred deal type: ${insights.deal_details.deal_type}.`;
    } else if (!existingGoals) {
      updates.owner_goals = `Preferred deal type: ${insights.deal_details.deal_type}.`;
    }
  }
  if (insights.deal_details?.deal_stage) {
    updates.timeline_notes = insights.deal_details.deal_stage;
  }

  // Key takeaways and follow-ups
  if (insights.key_takeaways?.length) {
    const existingNotes = (updates.financial_notes as string) || '';
    const takeawayText = insights.key_takeaways.join('\n');
    updates.financial_notes = existingNotes
      ? `${existingNotes}\n\nKey Takeaways:\n${takeawayText}`
      : `Key Takeaways:\n${takeawayText}`;
  }
  if (insights.follow_up_needed?.length)
    updates.financial_followup_questions = insights.follow_up_needed;

  if (Object.keys(updates).length > 0) {
    updates.extraction_sources = {
      transcript_id: transcriptId,
      extracted_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('listings').update(updates).eq('id', listingId);
    if (error) {
      console.error('Failed to update listing from transcript:', error);
    } else {
      console.log(
        `[TranscriptExtraction] Updated listing ${listingId} with ${Object.keys(updates).length} fields`,
      );
    }
  }
}

async function updateBuyerFromTranscript(
  supabase: SupabaseClient,
  buyerId: string,
  insights: BuyerInsights,
  transcriptId: string,
) {
  const { data: existingBuyer } = await supabase
    .from('buyers')
    .select(
      'extraction_sources, thesis_summary, strategic_priorities, target_industries, services_offered, business_summary, operating_locations, geographic_footprint, key_quotes, target_geographies, acquisition_timeline, acquisition_appetite, acquisition_frequency, target_services, buyer_type, industry_vertical, revenue_model, recent_acquisitions, portfolio_companies, notes',
    )
    .eq('id', buyerId)
    .single();

  const existing = existingBuyer || {};
  const updates: Record<string, unknown> = {};

  const shouldUpdate = (_field: string, newValue: unknown): boolean => {
    if (newValue === null || newValue === undefined) return false;
    if (typeof newValue === 'string' && newValue.trim() === '') return false;
    if (Array.isArray(newValue) && newValue.length === 0) return false;
    return true;
  };

  const mergeArrays = (existingVal: unknown, newArr: string[]): string[] => {
    const existingArr = Array.isArray(existingVal) ? existingVal : [];
    const merged = new Set([...existingArr, ...newArr]);
    return Array.from(merged);
  };

  if (shouldUpdate('thesis_summary', insights.thesis_summary) && !insights.is_evaluation_call) {
    // Always update thesis if we have new data and existing is empty, or new is longer
    if (
      !existing.thesis_summary ||
      insights.thesis_summary!.length > (existing.thesis_summary || '').length
    ) {
      updates.thesis_summary = insights.thesis_summary;
    }
  }

  if (insights.strategic_priorities?.length) {
    const merged = mergeArrays(existing.strategic_priorities, insights.strategic_priorities);
    if (merged.length > 0) updates.strategic_priorities = merged;
  }

  if (insights.target_industries?.length) {
    const merged = mergeArrays(existing.target_industries, insights.target_industries);
    if (merged.length > 0) updates.target_industries = merged;
  }

  if (insights.target_geography?.states?.length) {
    const merged = mergeArrays(existing.target_geographies, insights.target_geography.states);
    if (merged.length > 0) updates.target_geographies = merged;
  }

  if (
    shouldUpdate('acquisition_timeline', insights.acquisition_timeline) &&
    insights.acquisition_timeline !== 'insufficient'
  ) {
    if (!existing.acquisition_timeline || existing.acquisition_timeline === 'insufficient') {
      updates.acquisition_timeline = insights.acquisition_timeline;
    }
  }

  if (insights.deal_size_range) {
    if (insights.deal_size_range.revenue_min)
      updates.target_revenue_min = insights.deal_size_range.revenue_min;
    if (insights.deal_size_range.revenue_max)
      updates.target_revenue_max = insights.deal_size_range.revenue_max;
    if (insights.deal_size_range.ebitda_min)
      updates.target_ebitda_min = insights.deal_size_range.ebitda_min;
    if (insights.deal_size_range.ebitda_max)
      updates.target_ebitda_max = insights.deal_size_range.ebitda_max;
  }

  if (shouldUpdate('services_offered', insights.services_offered)) {
    const newServices = Array.isArray(insights.services_offered)
      ? insights.services_offered.join(', ')
      : String(insights.services_offered);
    if (!existing.services_offered || existing.services_offered.trim() === '') {
      updates.services_offered = newServices;
    }
  }

  if (shouldUpdate('business_summary', insights.business_summary)) {
    if (!existing.business_summary || existing.business_summary.trim() === '') {
      updates.business_summary = insights.business_summary;
    } else if (insights.business_summary!.length > existing.business_summary.length) {
      updates.business_summary = insights.business_summary;
    }
  }

  if (insights.operating_locations?.length) {
    const existingLocs = Array.isArray(existing.operating_locations)
      ? existing.operating_locations
      : [];
    const merged = mergeArrays(existingLocs, insights.operating_locations);
    if (merged.length > 0) updates.operating_locations = merged;
  }

  if (insights.geographic_footprint?.length) {
    const existingGeo = Array.isArray(existing.geographic_footprint)
      ? existing.geographic_footprint
      : [];
    const merged = mergeArrays(existingGeo, insights.geographic_footprint);
    if (merged.length > 0) updates.geographic_footprint = merged;
  }

  // New buyer enrichment fields from transcript
  if (shouldUpdate('acquisition_appetite', insights.acquisition_appetite)) {
    if (!existing.acquisition_appetite || existing.acquisition_appetite.trim() === '') {
      updates.acquisition_appetite = insights.acquisition_appetite;
    }
  }

  if (shouldUpdate('acquisition_frequency', insights.acquisition_frequency)) {
    if (!existing.acquisition_frequency || existing.acquisition_frequency.trim() === '') {
      updates.acquisition_frequency = insights.acquisition_frequency;
    }
  }

  if (insights.target_services?.length) {
    const merged = mergeArrays(existing.target_services, insights.target_services);
    if (merged.length > 0) updates.target_services = merged;
  }

  if (shouldUpdate('buyer_type', insights.buyer_type) && !insights.is_evaluation_call) {
    if (!existing.buyer_type || existing.buyer_type.trim() === '') {
      updates.buyer_type = insights.buyer_type;
    }
  }

  if (
    shouldUpdate('industry_vertical', insights.industry_vertical) &&
    !insights.is_evaluation_call
  ) {
    if (!existing.industry_vertical || existing.industry_vertical.trim() === '') {
      updates.industry_vertical = insights.industry_vertical;
    }
  }

  if (shouldUpdate('revenue_model', insights.revenue_model) && !insights.is_evaluation_call) {
    if (!existing.revenue_model || existing.revenue_model.trim() === '') {
      updates.revenue_model = insights.revenue_model;
    }
  }

  if (insights.recent_acquisitions?.length) {
    const existingAcqs = Array.isArray(existing.recent_acquisitions)
      ? existing.recent_acquisitions
      : [];
    const existingNames = new Set(
      existingAcqs.map((a: RecentAcquisition) => (a.company_name || '').toLowerCase()),
    );
    const newAcqs = insights.recent_acquisitions.filter(
      (a) => !existingNames.has((a.company_name || '').toLowerCase()),
    );
    if (newAcqs.length > 0) {
      updates.recent_acquisitions = [...existingAcqs, ...newAcqs];
    }
  }

  if (insights.portfolio_companies?.length) {
    const merged = mergeArrays(existing.portfolio_companies, insights.portfolio_companies);
    if (merged.length > 0) updates.portfolio_companies = merged;
  }

  if (insights.key_quotes?.length && !insights.is_evaluation_call) {
    const existingQuotes = Array.isArray(existing.key_quotes) ? existing.key_quotes : [];
    const merged = mergeArrays(existingQuotes, insights.key_quotes);
    if (merged.length > 0) updates.key_quotes = merged;
  }

  // Append deal structure preferences, management team notes, and integration approach to notes
  const noteAppendments: string[] = [];
  if (shouldUpdate('deal_structure_preferences', insights.deal_structure_preferences)) {
    noteAppendments.push(`Deal Structure Preferences: ${insights.deal_structure_preferences}`);
  }
  if (shouldUpdate('management_team_notes', insights.management_team_notes)) {
    noteAppendments.push(`Management Team: ${insights.management_team_notes}`);
  }
  if (shouldUpdate('integration_approach', insights.integration_approach)) {
    noteAppendments.push(`Integration Approach: ${insights.integration_approach}`);
  }
  if (noteAppendments.length > 0) {
    const existingNotes = existing.notes || '';
    const newNoteBlock = `\n\n--- Transcript Insights (${new Date().toISOString().split('T')[0]}) ---\n${noteAppendments.join('\n')}`;
    // Only append if these insights aren't already in the notes
    if (!existingNotes.includes(noteAppendments[0].substring(0, 50))) {
      updates.notes = (existingNotes + newNoteBlock).trim();
    }
  }

  if (Object.keys(updates).length > 0) {
    const existingSources = (existing.extraction_sources || []) as ExtractionSource[];
    const newSource = {
      type: 'transcript',
      transcript_id: transcriptId,
      extracted_at: new Date().toISOString(),
      fields_extracted: Object.keys(updates).filter((k) => k !== 'extraction_sources'),
    };
    updates.extraction_sources = [...existingSources, newSource];
    updates.data_last_updated = new Date().toISOString();

    const { error } = await supabase.from('buyers').update(updates).eq('id', buyerId);
    if (error) {
      console.error('Failed to update buyer from transcript:', error);
    } else {
      console.log(
        `[TranscriptExtraction] Updated buyer ${buyerId} with ${Object.keys(updates).length} fields (thesis_summary: ${!!updates.thesis_summary}). Total extraction sources: ${(updates.extraction_sources as ExtractionSource[]).length}`,
      );
    }
  } else if (insights.is_evaluation_call) {
    const existingSources = (existing.extraction_sources || []) as ExtractionSource[];
    const insufficientUpdate: Record<string, unknown> = {
      extraction_sources: [
        ...existingSources,
        {
          type: 'transcript',
          transcript_id: transcriptId,
          extracted_at: new Date().toISOString(),
          status: 'insufficient_data',
          note: 'Target evaluation call — no buyer thesis data extracted',
        },
      ],
      data_last_updated: new Date().toISOString(),
    };

    const { error } = await supabase.from('buyers').update(insufficientUpdate).eq('id', buyerId);
    if (error) {
      console.error('Failed to update buyer with insufficient status:', error);
    } else {
      console.log(
        `[TranscriptExtraction] Marked transcript ${transcriptId} as insufficient for buyer ${buyerId} — no overwrites. Total extraction sources: ${(insufficientUpdate.extraction_sources as ExtractionSource[]).length}`,
      );
    }
  }
}
