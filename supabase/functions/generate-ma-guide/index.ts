import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  GEMINI_API_URL,
  getGeminiHeaders,
  DEFAULT_GEMINI_MODEL,
  callGeminiWithTool,
} from '../_shared/ai-providers.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

class GenerationError extends Error {
  code: string;
  recoverable: boolean;
  constructor(message: string, code: string, recoverable: boolean) {
    super(message);
    this.code = code;
    this.recoverable = recoverable;
  }
}

// Phase definitions for the 13-phase SSE streaming generator
const GENERATION_PHASES = [
  {
    id: '1a',
    name: 'Industry Definition',
    focus: 'NAICS codes, market size, industry segmentation',
  },
  {
    id: '1b',
    name: 'Terminology & Business Models',
    focus: 'Glossary, revenue models, operational structures',
  },
  { id: '1c', name: 'Industry Economics', focus: 'P&L benchmarks, unit economics, margin drivers' },
  {
    id: '1d',
    name: 'Ecosystem & Competitive Landscape',
    focus: 'Customers, suppliers, active acquirers, consolidation trends',
  },
  {
    id: '1e',
    name: 'Target Buyer Profiles',
    focus: 'Industry-specific buyer types with buy boxes - CRITICAL',
  },
  {
    id: '2a',
    name: 'Financial Attractiveness',
    focus: 'EBITDA categories, margin quality, revenue mix',
  },
  {
    id: '2b',
    name: 'Operational Attractiveness',
    focus: 'KPIs, management quality, technology systems',
  },
  {
    id: '2c',
    name: 'Strategic & Geographic',
    focus: 'Market tiers, geographic preferences, deal killers',
  },
  { id: '3a', name: 'Seller Evaluation Scorecards', focus: 'Scoring matrix, evaluation rubrics' },
  {
    id: '3b',
    name: 'Buyer Fit Criteria Summary',
    focus: 'Size/Service/Geography/Buyer Types - CRITICAL',
  },
  { id: '3c', name: 'Example Evaluation', focus: 'Worked example with scoring rationale' },
  {
    id: '4a',
    name: 'Structured Criteria Output',
    focus: 'Machine-parseable format for extraction',
  },
  { id: '4b', name: 'Quality Validation', focus: 'Completeness check and gap identification' },
  {
    id: '5a',
    name: 'References & Sources',
    focus: 'Industry sources, data citations, research references',
  },
];

interface ClarificationContext {
  industry_overview?: string;
  segments?: string[];
  example_companies?: string;
  geography_focus?: string;
  revenue_range?: string;
  [key: string]: string | string[] | undefined;
}

interface GeminiRequestBody {
  model: string;
  max_tokens: number;
  messages: Array<{ role: string; content: string }>;
}

interface QualityResult {
  passed: boolean;
  score: number;
  wordCount: number;
  tableCount: number;
  placeholderCount: number;
  hasCriteria: boolean;
  hasBuyerTypes: boolean;
  hasPrimaryFocus: boolean;
  missingElements: string[];
}

interface BuyerProfile {
  id: string;
  rank: number;
  name: string;
  description: string;
  locations_min?: number;
  locations_max?: number;
  revenue_per_location?: number;
  deal_requirements?: string;
  enabled: boolean;
}

interface ExtractedCriteria {
  size_criteria: {
    revenue_min?: number;
    revenue_max?: number;
    ebitda_min?: number;
    ebitda_max?: number;
    locations_min?: number;
    locations_max?: number;
  };
  geography_criteria: {
    target_states?: string[];
    target_regions?: string[];
    coverage?: string;
  };
  service_criteria: {
    primary_focus?: string[];
    required_services?: string[];
    preferred_services?: string[];
    excluded_services?: string[];
    business_model?: string;
  };
  buyer_types_criteria: {
    include_pe_firms?: boolean;
    include_platforms?: boolean;
    include_strategic?: boolean;
    include_family_office?: boolean;
  };
  target_buyer_types?: BuyerProfile[];
}

// Quality validation function
function validateQuality(content: string): QualityResult {
  const wordCount = content.split(/\s+/).length;
  const tableCount = (content.match(/<table|^\|.*\|$/gm) || []).length;
  const placeholderPatterns = /\[X\]|\$\[X\]|X\.X|TBD|PLACEHOLDER|\[VALUE\]|\[INSERT\]/gi;
  const placeholderCount = (content.match(placeholderPatterns) || []).length;

  const hasCriteria =
    content.toLowerCase().includes('size criteria') ||
    content.toLowerCase().includes('revenue') ||
    content.toLowerCase().includes('ebitda');
  const hasBuyerTypes =
    content.toLowerCase().includes('buyer type') ||
    content.toLowerCase().includes('pe firm') ||
    content.toLowerCase().includes('platform');
  const hasPrimaryFocus =
    content.toLowerCase().includes('primary focus') ||
    content.toLowerCase().includes('core service') ||
    content.toLowerCase().includes('primary service');

  const missingElements: string[] = [];
  if (wordCount < 7500) missingElements.push('Word count below 7,500 minimum');
  if (tableCount < 10) missingElements.push('Need more data tables');
  if (placeholderCount > 10) missingElements.push('Too many placeholders remaining');
  if (!hasCriteria) missingElements.push('Missing size/financial criteria section');
  if (!hasBuyerTypes) missingElements.push('Missing buyer types section');
  if (!hasPrimaryFocus) missingElements.push('Missing primary focus definition');

  // Calculate weighted score
  let score = 0;
  score += Math.min(40, (wordCount / 15000) * 40); // Up to 40 points for word count (target 15k)
  score += Math.min(20, (tableCount / 14) * 20); // Up to 20 points for tables
  score += Math.max(0, 15 - placeholderCount * 2); // 15 points minus penalties for placeholders
  score += hasCriteria ? 10 : 0;
  score += hasBuyerTypes ? 8 : 0;
  score += hasPrimaryFocus ? 7 : 0;

  const passed = score >= 70 && hasPrimaryFocus && hasCriteria;

  return {
    passed,
    score: Math.round(score),
    wordCount,
    tableCount,
    placeholderCount,
    hasCriteria,
    hasBuyerTypes,
    hasPrimaryFocus,
    missingElements,
  };
}

// Build context string from clarification answers
function buildClarificationContext(context: ClarificationContext | undefined): string {
  if (!context || Object.keys(context).length === 0) {
    return '';
  }

  const parts: string[] = [];

  // Include industry overview/description if provided
  if (context.industry_overview) {
    parts.push(`INDUSTRY OVERVIEW: ${context.industry_overview}`);
  }
  if (context.segments?.length > 0) {
    parts.push(`FOCUS SEGMENTS: ${context.segments.join(', ')}`);
  }
  if (context.example_companies) {
    parts.push(`EXAMPLE COMPANIES (for calibration): ${context.example_companies}`);
  }
  if (context.geography_focus) {
    parts.push(`GEOGRAPHIC FOCUS: ${context.geography_focus}`);
  }
  if (context.revenue_range) {
    parts.push(`TARGET SIZE: ${context.revenue_range} revenue`);
  }

  // Include any other custom answers
  Object.entries(context).forEach(([key, value]) => {
    if (
      ![
        'segments',
        'example_companies',
        'geography_focus',
        'revenue_range',
        'industry_overview',
      ].includes(key) &&
      value
    ) {
      const label = key.replace(/_/g, ' ').toUpperCase();
      parts.push(`${label}: ${Array.isArray(value) ? value.join(', ') : value}`);
    }
  });

  if (parts.length === 0) return '';

  return `\n\nIMPORTANT CONTEXT FROM USER:\n${parts.join('\n')}\n\nUse these details to calibrate your understanding of the industry scale, service offerings, and market positioning. The example companies help establish the target profile - research what makes companies like these attractive acquisition targets.`;
}

// Legacy generatePhaseContent - delegates to timeout-protected version
async function generatePhaseContent(
  phase: (typeof GENERATION_PHASES)[0],
  industryName: string,
  existingContent: string,
  apiKey: string,
  clarificationContext?: ClarificationContext,
  _retryCount = 0,
  firefliesIntelligence?: string,
): Promise<string> {
  // Delegate to the new timeout-protected version
  return generatePhaseWithTimeout(
    phase,
    industryName,
    existingContent,
    apiKey,
    clarificationContext,
    0,
    firefliesIntelligence,
  );
}

// Extract criteria from generated content using AI
async function extractCriteria(content: string, apiKey: string): Promise<ExtractedCriteria> {
  // First try regex extraction for criteria
  const criteriaMatch = content.match(/---BEGIN CRITERIA---([\s\S]*?)---END CRITERIA---/);
  const buyerProfilesMatch = content.match(
    /---BEGIN BUYER_PROFILES---([\s\S]*?)---END BUYER_PROFILES---/,
  );

  let criteria: ExtractedCriteria;

  if (criteriaMatch) {
    criteria = parseCriteriaBlock(criteriaMatch[1]);

    // Parse buyer profiles if found
    if (buyerProfilesMatch) {
      criteria.target_buyer_types = parseBuyerProfilesBlock(buyerProfilesMatch[1]);
    }

    // If we have criteria, try AI extraction for buyer profiles if not found
    if (!criteria.target_buyer_types || criteria.target_buyer_types.length === 0) {
      criteria.target_buyer_types = await extractBuyerProfilesWithAI(content, apiKey);
    }

    return criteria;
  }

  // Fallback to AI extraction with tool calling (Gemini)
  const tool = {
    type: 'function',
    function: {
      name: 'extract_criteria',
      description: 'Extract structured buyer fit criteria',
      parameters: {
        type: 'object',
        properties: {
          size_criteria: {
            type: 'object',
            properties: {
              revenue_min: { type: 'number' },
              revenue_max: { type: 'number' },
              ebitda_min: { type: 'number' },
              ebitda_max: { type: 'number' },
              locations_min: { type: 'number' },
              locations_max: { type: 'number' },
            },
          },
          geography_criteria: {
            type: 'object',
            properties: {
              target_states: { type: 'array', items: { type: 'string' } },
              target_regions: { type: 'array', items: { type: 'string' } },
              coverage: { type: 'string' },
            },
          },
          service_criteria: {
            type: 'object',
            properties: {
              primary_focus: {
                type: 'array',
                items: { type: 'string' },
                description: 'REQUIRED: The core service lines this buyer universe targets',
              },
              required_services: { type: 'array', items: { type: 'string' } },
              preferred_services: { type: 'array', items: { type: 'string' } },
              excluded_services: { type: 'array', items: { type: 'string' } },
              business_model: { type: 'string' },
            },
            required: ['primary_focus'],
          },
          buyer_types_criteria: {
            type: 'object',
            properties: {
              include_pe_firms: { type: 'boolean' },
              include_platforms: { type: 'boolean' },
              include_strategic: { type: 'boolean' },
              include_family_office: { type: 'boolean' },
            },
          },
        },
        required: [
          'size_criteria',
          'geography_criteria',
          'service_criteria',
          'buyer_types_criteria',
        ],
      },
    },
  };

  try {
    const { data: extracted, error: aiError } = await callGeminiWithTool(
      'Extract structured buyer universe criteria from the provided M&A guide content.',
      `Extract criteria from this M&A guide:\n\n${content.slice(-15000)}`,
      tool,
      apiKey,
    );

    if (!aiError && extracted) {
      criteria = extracted as ExtractedCriteria;
      criteria.target_buyer_types = await extractBuyerProfilesWithAI(content, apiKey);
      return criteria;
    }
    return getDefaultCriteria();
  } catch (error) {
    console.error(
      'Error extracting criteria:',
      error instanceof Error ? error.message : String(error),
    );
    return getDefaultCriteria();
  }
}

// Parse buyer profiles from structured block
function parseBuyerProfilesBlock(block: string): BuyerProfile[] {
  const profiles: BuyerProfile[] = [];
  const buyerBlocks = block.split(/BUYER_\d+:/);

  for (const buyerBlock of buyerBlocks) {
    if (!buyerBlock.trim()) continue;

    const profile: BuyerProfile = {
      id: '',
      rank: 99,
      name: '',
      description: '',
      enabled: true,
    };

    const lines = buyerBlock.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('-')) continue;

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) continue;

      const key = trimmed.slice(1, colonIndex).trim();
      const value = trimmed
        .slice(colonIndex + 1)
        .trim()
        .replace(/[[\]]/g, '');

      switch (key) {
        case 'id':
          profile.id = value;
          break;
        case 'rank':
          profile.rank = parseInt(value) || 99;
          break;
        case 'name':
          profile.name = value;
          break;
        case 'description':
          profile.description = value;
          break;
        case 'locations_min':
          profile.locations_min = parseInt(value.replace(/[,$]/g, '')) || undefined;
          break;
        case 'locations_max':
          profile.locations_max = parseInt(value.replace(/[,$]/g, '')) || undefined;
          break;
        case 'revenue_per_location':
          profile.revenue_per_location = parseInt(value.replace(/[,$]/g, '')) || undefined;
          break;
        case 'deal_requirements':
          profile.deal_requirements = value;
          break;
        case 'enabled':
          profile.enabled = value.toLowerCase() === 'true';
          break;
      }
    }

    if (profile.name && profile.id) {
      profiles.push(profile);
    }
  }

  return profiles.sort((a, b) => a.rank - b.rank);
}

// Extract buyer profiles using AI (Gemini)
async function extractBuyerProfilesWithAI(
  content: string,
  apiKey: string,
): Promise<BuyerProfile[]> {
  const relevantContent =
    content.match(/PHASE 1E[\s\S]*?(?=##\s*PHASE|$)/i)?.[0] ||
    content.match(/BUYER TYPE[\s\S]*?(?=##\s*PHASE|$)/i)?.[0] ||
    content.slice(-20000);

  const tool = {
    type: 'function',
    function: {
      name: 'extract_buyer_profiles',
      description: 'Extract industry-specific buyer type profiles',
      parameters: {
        type: 'object',
        properties: {
          buyer_profiles: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'snake_case id (e.g., large_mso, pe_platform)' },
                rank: { type: 'number', description: 'Priority rank 1-6' },
                name: { type: 'string', description: 'Display name' },
                description: { type: 'string', description: '2-3 sentence description' },
                locations_min: { type: 'number' },
                locations_max: { type: 'number' },
                revenue_per_location: {
                  type: 'number',
                  description: 'Revenue per location in dollars',
                },
                deal_requirements: { type: 'string', description: 'Key deal requirements' },
                enabled: { type: 'boolean' },
              },
              required: ['id', 'rank', 'name', 'description'],
            },
            description: '4-6 buyer profiles specific to this industry',
          },
        },
        required: ['buyer_profiles'],
      },
    },
  };

  try {
    const { data: extracted, error: aiError } = await callGeminiWithTool(
      'Extract industry-specific buyer profiles from the M&A guide content. These are the types of BUYERS active in the industry.',
      `Extract buyer profiles from this M&A guide section:\n\n${relevantContent}`,
      tool,
      apiKey,
    );

    if (!aiError && extracted) {
      return (
        (extracted as { buyer_profiles?: BuyerProfile[] }).buyer_profiles ||
        getDefaultBuyerProfiles()
      );
    }
    return getDefaultBuyerProfiles();
  } catch (error) {
    console.error(
      'Error extracting buyer profiles:',
      error instanceof Error ? error.message : String(error),
    );
    return getDefaultBuyerProfiles();
  }
}

// Default buyer profiles (fallback)
function getDefaultBuyerProfiles(): BuyerProfile[] {
  return [
    {
      id: 'national_consolidator',
      rank: 1,
      name: 'National Consolidators',
      description: 'Large operators with national presence seeking add-on acquisitions.',
      locations_min: 50,
      locations_max: 500,
      revenue_per_location: 2500000,
      deal_requirements: 'Prefer deals with $2M+ revenue, strong management team willing to stay',
      enabled: true,
    },
    {
      id: 'regional_platform',
      rank: 2,
      name: 'Regional Platforms',
      description: 'Regional operators expanding within their geographic footprint.',
      locations_min: 10,
      locations_max: 50,
      revenue_per_location: 2000000,
      deal_requirements: 'Looking for tuck-in acquisitions, prefer seller financing available',
      enabled: true,
    },
    {
      id: 'pe_backed_platform',
      rank: 3,
      name: 'PE-Backed Platforms',
      description:
        'Private equity portfolio companies actively deploying capital for roll-up strategies.',
      locations_min: 5,
      locations_max: 100,
      revenue_per_location: 1500000,
      deal_requirements: 'Need clean financials, will pay premium for EBITDA margin above 15%',
      enabled: true,
    },
    {
      id: 'independent_sponsor',
      rank: 4,
      name: 'Independent Sponsors',
      description: 'Dealmakers with committed capital seeking platform investments.',
      locations_min: 1,
      locations_max: 10,
      revenue_per_location: 1000000,
      deal_requirements: 'Flexible on structure, open to earnouts and seller notes',
      enabled: true,
    },
    {
      id: 'owner_operator',
      rank: 5,
      name: 'Owner-Operators',
      description: 'Existing operators looking to expand from 1-5 locations in their local market.',
      locations_min: 1,
      locations_max: 5,
      revenue_per_location: 800000,
      deal_requirements: 'Often need SBA financing, prefer deals under $1M',
      enabled: true,
    },
    {
      id: 'strategic_buyer',
      rank: 6,
      name: 'Strategic Buyers',
      description: 'Established local businesses seeking adjacent market expansion.',
      locations_min: 2,
      locations_max: 15,
      revenue_per_location: 1200000,
      deal_requirements: 'Looking for synergies, willing to pay for customer relationships',
      enabled: true,
    },
  ];
}

function parseCriteriaBlock(block: string): ExtractedCriteria {
  const criteria: ExtractedCriteria = {
    size_criteria: {},
    geography_criteria: {},
    service_criteria: {},
    buyer_types_criteria: {},
  };

  // Parse each line
  const lines = block.split('\n');
  let currentSection = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('SIZE_CRITERIA:')) currentSection = 'size';
    else if (trimmed.startsWith('SERVICE_CRITERIA:')) currentSection = 'service';
    else if (trimmed.startsWith('GEOGRAPHY_CRITERIA:')) currentSection = 'geography';
    else if (trimmed.startsWith('BUYER_TYPES:')) currentSection = 'buyer_types';
    else if (trimmed.startsWith('-')) {
      const [key, value] = trimmed
        .slice(1)
        .split(':')
        .map((s) => s.trim());
      if (key && value) {
        const cleanValue = value.replace(/[[\]]/g, '');

        if (currentSection === 'size') {
          const num = parseFloat(cleanValue.replace(/[,$]/g, ''));
          if (!isNaN(num)) {
            (criteria.size_criteria as Record<string, number>)[key] = num;
          }
        } else if (currentSection === 'geography') {
          if (key === 'coverage') {
            criteria.geography_criteria.coverage = cleanValue;
          } else {
            (criteria.geography_criteria as Record<string, string | string[]>)[key] = cleanValue
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
          }
        } else if (currentSection === 'service') {
          if (key === 'business_model') {
            criteria.service_criteria.business_model = cleanValue;
          } else {
            (criteria.service_criteria as Record<string, string | string[]>)[key] = cleanValue
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
          }
        } else if (currentSection === 'buyer_types') {
          (criteria.buyer_types_criteria as Record<string, boolean>)[key] =
            cleanValue.toLowerCase() === 'true';
        }
      }
    }
  }

  return criteria;
}

function getDefaultCriteria(): ExtractedCriteria {
  return {
    size_criteria: {},
    geography_criteria: {},
    service_criteria: { primary_focus: [] },
    buyer_types_criteria: {
      include_pe_firms: true,
      include_platforms: true,
      include_strategic: true,
      include_family_office: true,
    },
    target_buyer_types: getDefaultBuyerProfiles(),
  };
}

// Generate gap-fill content for missing elements (Gemini)
async function generateGapFill(
  missingElements: string[],
  industryName: string,
  apiKey: string,
): Promise<string> {
  const prompt = `Generate additional M&A guide content to address these gaps for "${industryName}":
${missingElements.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Focus especially on:
- Primary focus services (core service lines the buyer universe targets)
- Specific numeric criteria (revenue ranges, EBITDA ranges)
- Buyer type configurations

Be comprehensive and specific.`;

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: getGeminiHeaders(apiKey),
      body: JSON.stringify({
        model: DEFAULT_GEMINI_MODEL,
        max_tokens: 4000,
        messages: [
          {
            role: 'system',
            content:
              'You are an M&A advisor filling gaps in an industry guide. Be specific and detailed.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error('Gap fill generation failed');
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error(
      'Error in gap fill generation:',
      error instanceof Error ? error.message : String(error),
    );
    return '';
  }
}

// Batch configuration: 1 phase per batch for safer timeout budget
// Each batch runs in a separate HTTP request, resetting the 150s edge timeout
const BATCH_SIZE = 1;

// Phase timeout configuration
// CRITICAL: Keep well below 150s hard limit. Single phase should complete in ~40-60s max.
const PHASE_TIMEOUT_MS = 45000; // 45 seconds per phase (reduced from 50s for more buffer)
// Retrying inside the same request can push the function over the hard timeout and kill the stream mid-flight.
// Allow 1 retry with backoff for transient failures, then fail fast
const MAX_RETRIES = 1;

// Inter-phase delay to prevent hitting rate limits
const INTER_PHASE_DELAY_MS = 1000; // 1 second between API calls (reduced for efficiency)

// Function-level timeout tracking - exit gracefully before platform hard timeout (~150s)
// With BATCH_SIZE=1, each batch = 1 phase, so we have ~100s overhead for streaming + setup
const FUNCTION_TIMEOUT_MS = 120000; // 120 seconds - exit earlier to avoid hard cutoff
const MIN_TIME_FOR_PHASE_MS = 50000; // Need at least 50s to safely complete a phase

// Model selection: Use same model for all phases (Gemini Flash)
const CRITICAL_PHASES = ['1e', '3b', '4a', '5a']; // Buyer profiles, Fit criteria, Structured output, References
const getModelForPhase = (_phaseId: string) => DEFAULT_GEMINI_MODEL;

// Define which phases can run in parallel (don't depend on each other's output)
const PARALLEL_PHASE_GROUPS = [
  ['1a', '1b'], // Industry definition & terminology can run together
  ['1c', '1d'], // Economics & ecosystem can run together
  ['2a', '2b'], // Financial & operational attractiveness can run together
];

function canRunInParallel(phaseId1: string, phaseId2: string): boolean {
  return PARALLEL_PHASE_GROUPS.some(
    (group) => group.includes(phaseId1) && group.includes(phaseId2),
  );
}

// Timeout wrapper for phase generation
async function generatePhaseWithTimeout(
  phase: (typeof GENERATION_PHASES)[0],
  industryName: string,
  existingContent: string,
  apiKey: string,
  clarificationContext?: ClarificationContext,
  retryCount = 0,
  firefliesIntelligence?: string,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PHASE_TIMEOUT_MS);

  try {
    const result = await generatePhaseContentWithModel(
      phase,
      industryName,
      existingContent,
      apiKey,
      clarificationContext,
      getModelForPhase(phase.id),
      firefliesIntelligence,
    );
    clearTimeout(timeoutId);
    return result;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    const err = error as Error;
    // Retry on transient errors: timeout, 429 rate limit, 5xx errors
    const isTransient =
      err.name === 'AbortError' ||
      err.message?.includes('timeout') ||
      err.message?.includes('429') ||
      err.message?.includes('5');

    if (isTransient && retryCount < MAX_RETRIES) {
      const backoffMs = Math.min(3000 * Math.pow(2, retryCount), 30000); // 3s, 6s, 12s, 24s...
      console.error(
        `Phase ${phase.id} failed with transient error (attempt ${retryCount + 1}/${MAX_RETRIES + 1}): ${err.message}. Waiting ${backoffMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      console.log(`Retrying phase ${phase.id} after backoff...`);
      return generatePhaseWithTimeout(
        phase,
        industryName,
        existingContent,
        apiKey,
        clarificationContext,
        retryCount + 1,
        firefliesIntelligence,
      );
    }

    if (err.name === 'AbortError' || err.message?.includes('timeout')) {
      throw new Error(`Phase ${phase.id} timed out after ${MAX_RETRIES + 1} attempts`);
    }
    throw error;
  }
}

// Phase generation with model parameter (Gemini)
async function generatePhaseContentWithModel(
  phase: (typeof GENERATION_PHASES)[0],
  industryName: string,
  existingContent: string,
  apiKey: string,
  clarificationContext: ClarificationContext | undefined,
  model: string,
  firefliesIntelligence?: string,
): Promise<string> {
  const contextStr = buildClarificationContext(clarificationContext);

  // Build Fireflies context for relevant phases
  let firefliesContext = '';
  if (firefliesIntelligence && firefliesIntelligence.length > 100) {
    const firefliesPhases = ['1d', '1e', '2a', '2c', '3b', '4a'];
    if (firefliesPhases.includes(phase.id)) {
      firefliesContext = `\n\nINTERNAL INTELLIGENCE FROM OUR CALL TRANSCRIPTS:\nThe following summaries are from actual calls our team has had with buyers and sellers in or adjacent to this industry. Use this information to ground your analysis in real buyer preferences, deal structures, and market intelligence. Reference specific insights where relevant, but present them naturally (e.g., "Active acquirers in this space include..." rather than "According to our call transcripts...").\n\n${firefliesIntelligence}\n\nIMPORTANT: Prioritize insights from these real conversations over general training data when there is a conflict. These represent actual buyer preferences and market conditions our team has observed.`;
    }
  }

  const systemPrompt = `You are an expert M&A advisor creating comprehensive industry research guides.
Generate detailed, actionable content for the specified phase of an M&A guide.

FORMATTING REQUIREMENTS (CRITICAL):
- Use ONLY pure Markdown syntax
- Headings: ## H2, ### H3, #### H4
- Tables: | Column1 | Column2 | format with | separators
- Lists: - bullet items or 1. numbered items
- Bold: **text**, Italic: *text*
- NEVER use HTML tags (<h2>, <table>, <tr>, <td>, <dl>, <dt>, etc.)

Include specific numbers, ranges, and concrete examples wherever possible.
Target 2,000-3,000 words per phase.
Do NOT use placeholders like [X] or TBD - use realistic example values.${contextStr}${firefliesContext}`;

  // CRITICAL FIX: Build context from previous phases
  let contextPrefix = '';
  if (existingContent && existingContent.length > 200) {
    // Include last 8000 chars of previous content for context
    const recentContext = existingContent.slice(-8000);
    contextPrefix = `
INDUSTRY CONTEXT (from previous phases):
The following content has already been generated for "${industryName}". Build upon this foundation and maintain consistency. Reference specific details from earlier phases.

${recentContext}

---

NOW GENERATE THE FOLLOWING SECTION:

`;
  }

  const phasePrompts: Record<string, string> = getPhasePrompts(industryName);
  const basePrompt = phasePrompts[phase.id] || `Generate content for ${phase.name}: ${phase.focus}`;
  const userPrompt = contextPrefix + basePrompt;

  // Determine if this phase should use web search
  const webSearchPhases = ['1a', '1c', '1d', '5a'];
  const _useWebSearch = webSearchPhases.includes(phase.id);

  try {
    // Build the request body for Gemini (OpenAI-compatible format)
    const requestBody: GeminiRequestBody = {
      model,
      max_tokens: CRITICAL_PHASES.includes(phase.id) ? 8000 : 6000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: getGeminiHeaders(apiKey),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Phase ${phase.id} generation failed:`, response.status, text);

      if (response.status === 429) {
        throw new GenerationError(
          `Rate limit exceeded for phase ${phase.id}`,
          'rate_limited',
          true,
        );
      }
      if (response.status === 402) {
        throw new GenerationError(
          `AI credits depleted. Please add credits to continue.`,
          'payment_required',
          false,
        );
      }
      if (response.status >= 500) {
        throw new GenerationError(
          `AI service temporarily unavailable for phase ${phase.id}`,
          'service_unavailable',
          true,
        );
      }
      throw new Error(`Failed to generate phase ${phase.id}`);
    }

    const result = await response.json();
    const responseText = result.choices?.[0]?.message?.content || '';
    return responseText;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new GenerationError(
        `Network error while generating phase ${phase.id}: ${error.message}`,
        'network_error',
        true,
      );
    }
    if (error instanceof GenerationError) {
      throw error;
    }
    throw new GenerationError(
      `Error generating phase ${phase.id}: ${error instanceof Error ? error.message : String(error)}`,
      'generation_error',
      true,
    );
  }
}

// Extract phase prompts to separate function for cleaner code
function getPhasePrompts(industryName: string): Record<string, string> {
  return {
    '1a': `## PHASE 1A: INDUSTRY DEFINITION

Generate comprehensive content for "${industryName}" covering:
1. NAICS codes and industry classification
2. Total addressable market size with breakdowns
3. Industry segmentation (by service, geography, customer type)
4. Key industry associations and trade groups
5. Regulatory environment overview

Include at least 2 data tables.

Search the web for current market size data, NAICS codes, and industry classification for "${industryName}". Use actual published statistics rather than estimates. Cite your sources.`,

    '1b': `## PHASE 1B: TERMINOLOGY & BUSINESS MODELS

For "${industryName}", create:
1. Comprehensive glossary of industry-specific terms (30+ terms)
2. Common business model variants
3. Revenue model breakdowns (recurring vs. project vs. service)
4. Operational structure patterns
5. Key differentiators between business types

Format the glossary as a definition list.`,

    '1c': `## PHASE 1C: INDUSTRY ECONOMICS

For "${industryName}", detail:
1. Typical P&L structure with benchmarks
2. Unit economics by business size
3. Margin drivers and detractors
4. Working capital requirements
5. CapEx patterns and equipment needs
6. Labor economics and wage trends

Include a benchmark P&L table.

Search the web for current P&L benchmarks, profit margin data, and unit economics for "${industryName}" businesses. Use industry reports and published benchmarks. Cite your sources.`,

    '1d': `## PHASE 1D: ECOSYSTEM & COMPETITIVE LANDSCAPE

For "${industryName}", cover:
1. Customer segments and buying patterns
2. Supplier landscape and key vendors
3. Active acquirers (PE firms, platforms, strategics)
4. Recent transaction activity and multiples
5. Consolidation trends and drivers
6. Market concentration analysis

Include a table of recent transactions if applicable.

Search the web for recent M&A transactions, active acquirers, and consolidation activity in "${industryName}". Look for actual deal announcements, PE firm activity, and transaction multiples. Cite your sources.`,

    '1e': `## PHASE 1E: TARGET BUYER PROFILES & BUY BOXES (CRITICAL)

Research and define the specific types of BUYERS active in the "${industryName}" industry. This is NOT about the businesses being sold - it's about who is BUYING them.

For EACH buyer type, define:
1. **Buyer Profile Name** - Industry-specific name (e.g., "Large MSOs" for collision, "Regional Consolidators" for HVAC)
2. **Description** - Who they are and their acquisition strategy
3. **Buy Box Criteria**:
   - Location count range they target (min-max)
   - Revenue per location sweet spot
   - Deal size preferences
   - Deal structure requirements (SBA, seller financing, cash, etc.)
4. **Deal Requirements** - What they specifically look for
5. **Rank/Priority** - Their typical deal volume and market presence (1=most active)

Research the ACTUAL buyer landscape for "${industryName}". Consider:
- National consolidators / Large platforms (PE-backed or strategic)
- Regional operators looking to expand
- PE-backed add-on acquirers
- Independent sponsors seeking platforms
- Owner-operators looking to grow
- Local strategic buyers (adjacent businesses)

For each buyer category that EXISTS in this industry, provide:
- Specific examples of real companies in this category
- Their typical acquisition criteria
- Their preferred deal structures

OUTPUT FORMAT (Create 4-6 buyer profiles):

### BUYER TYPE 1: [Name]
**Rank:** 1
**Description:** [2-3 sentences about who they are]
**Locations Target:** [X - Y locations]
**Revenue/Location:** $[X]M
**Deal Requirements:** [Key requirements]
**Examples:** [Real company names if known, or "Companies like X"]

### BUYER TYPE 2: [Name]
...

Be specific to "${industryName}" - don't use generic buyer types. Research what types of acquirers are actually active in this specific industry.`,

    '2a': `## PHASE 2A: FINANCIAL ATTRACTIVENESS CRITERIA

For "${industryName}", define:
1. EBITDA attractiveness tiers (A/B/C/D)
2. Revenue quality indicators
3. Margin quality assessment framework
4. Revenue mix optimization targets
5. Financial red flags and deal killers
6. Valuation multiple drivers

Create a scoring rubric table.`,

    '2b': `## PHASE 2B: OPERATIONAL ATTRACTIVENESS CRITERIA

For "${industryName}", specify:
1. Key operational KPIs and benchmarks
2. Management team evaluation criteria
3. Technology and systems requirements
4. Customer concentration thresholds
5. Employee metrics and retention
6. Quality and safety indicators

Include KPI benchmark tables.`,

    '2c': `## PHASE 2C: STRATEGIC & GEOGRAPHIC CRITERIA

For "${industryName}", outline:
1. Geographic market tier definitions (Tier 1/2/3)
2. Regional preference frameworks
3. Market density requirements
4. Strategic fit factors
5. Absolute deal killers checklist
6. Growth market identification

Create a geographic scoring matrix.`,

    '3a': `## PHASE 3A: SELLER EVALUATION SCORECARDS

For "${industryName}", create:
1. Comprehensive scoring matrix (0-100 scale)
2. Category weights and rationale
3. Individual factor rubrics
4. Scoring examples and edge cases
5. Threshold definitions (pass/fail)
6. Adjustment factors

Include complete scorecard template.`,

    '3b': `## PHASE 3B: BUYER FIT CRITERIA SUMMARY (CRITICAL)

For "${industryName}", define the complete buyer universe criteria:

### SIZE CRITERIA
- Revenue ranges: minimum, maximum, sweet spot
- EBITDA ranges: minimum, maximum, with rationale
- Location count requirements by buyer type
- Employee count considerations

### SERVICE CRITERIA
- **PRIMARY FOCUS**: The core service lines that buyers MUST target (this is critical for scoring)
- Required services for consideration
- Preferred services that add value
- Excluded services (deal breakers)
- Business model requirements

### GEOGRAPHY CRITERIA
- Target regions and states with priority rankings
- Coverage type preferences (local/regional/national)
- HQ location requirements
- Expansion adjacency preferences

### BUYER TYPES
- PE Firm fit characteristics
- Platform company requirements
- Strategic acquirer profiles
- Family office considerations

Be SPECIFIC with numbers and ranges, not vague.`,

    '3c': `## PHASE 3C: EXAMPLE EVALUATION

For "${industryName}", create a worked example:
1. Sample target company profile
2. Complete scoring walkthrough
3. Category-by-category analysis
4. Final recommendation with rationale
5. Key discussion points
6. Risk assessment summary

Show the math and reasoning.`,

    '4a': `## PHASE 4A: STRUCTURED CRITERIA OUTPUT

Generate machine-parseable criteria in this exact format:

---BEGIN CRITERIA---
SIZE_CRITERIA:
- revenue_min: [number in dollars]
- revenue_max: [number in dollars]
- ebitda_min: [number in dollars]
- ebitda_max: [number in dollars]
- locations_min: [number]
- locations_max: [number]

SERVICE_CRITERIA:
- primary_focus: [comma-separated list of core services - REQUIRED]
- required_services: [comma-separated list]
- preferred_services: [comma-separated list]
- excluded_services: [comma-separated list]
- business_model: [description]

GEOGRAPHY_CRITERIA:
- target_states: [comma-separated list]
- target_regions: [comma-separated list]
- coverage: [local|regional|national]

BUYER_TYPES:
- include_pe_firms: [true|false]
- include_platforms: [true|false]
- include_strategic: [true|false]
- include_family_office: [true|false]
---END CRITERIA---

---BEGIN BUYER_PROFILES---
BUYER_1:
- id: [snake_case_id]
- rank: [1-6]
- name: [Display Name]
- description: [2-3 sentence description]
- locations_min: [number]
- locations_max: [number]
- revenue_per_location: [number in dollars]
- deal_requirements: [key requirements text]
- enabled: true

BUYER_2:
...repeat for each buyer type (4-6 total)
---END BUYER_PROFILES---

Use actual values based on the industry analysis from Phase 1E.`,

    '4b': `## PHASE 4B: QUALITY VALIDATION

Perform a final quality check:
1. Verify all criteria sections are populated
2. Check for any remaining placeholders
3. Confirm primary_focus is defined
4. Validate number ranges are realistic
5. Ensure buyer types are configured

Provide a validation summary.`,

    '5a': `## PHASE 5A: REFERENCES & SOURCES

Compile a references section based on ACTUAL sources used or found during this guide's generation. Search the web to verify and supplement with current, real sources for "${industryName}".

For each source, include:
- Full name/title of the source
- URL where it can be accessed (if web-based)
- Date or year of publication
- Brief description of what data it provides

Categories:
1. Market data and industry statistics
2. M&A transaction databases and deal activity
3. Industry associations and trade publications
4. Regulatory and compliance sources
5. Professional resources

IMPORTANT: Only include sources that actually exist and can be verified. Do NOT fabricate citations. If you cannot find a real source for a data point, note that the estimate is based on industry analysis rather than a specific publication.`,
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const encoder = new TextEncoder();
  const FUNCTION_START = Date.now(); // Track when the function started

  try {
    // ── Auth guard: require valid JWT + admin role, OR internal service call ──
    const authHeader = req.headers.get('Authorization') || '';
    const callerToken = authHeader.replace('Bearer ', '').trim();
    if (!callerToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Allow internal service-to-service calls (e.g., from process-ma-guide-queue)
    const isInternalCall = callerToken === supabaseServiceKey;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    if (!isInternalCall) {
      const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${callerToken}` } },
      });
      const {
        data: { user: callerUser },
        error: callerError,
      } = await callerClient.auth.getUser();
      if (callerError || !callerUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: isAdmin } = await supabaseAdmin.rpc('is_admin', { user_id: callerUser.id });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden: admin access required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    // ── End auth guard ──

    const {
      industry_name,
      industry_description,
      universe_id: _universe_id,
      existing_content: _existing_content,
      clarification_context,
      fireflies_intelligence,
      stream = true,
      batch_index = 0, // Which batch to generate (0, 1, 2)
      previous_content = '', // Content from previous batches
    } = await req.json();

    // Merge industry_description into clarification_context if provided
    const enrichedContext = {
      ...clarification_context,
      ...(industry_description ? { industry_overview: industry_description } : {}),
    };

    if (!industry_name) {
      return new Response(JSON.stringify({ error: 'industry_name is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    console.log(
      `GEMINI_API_KEY configured: ${!!GEMINI_API_KEY}, length: ${GEMINI_API_KEY?.length || 0}`,
    );
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    // Calculate which phases to generate for this batch
    const startPhase = batch_index * BATCH_SIZE;
    const endPhase = Math.min(startPhase + BATCH_SIZE, GENERATION_PHASES.length);
    const batchPhases = GENERATION_PHASES.slice(startPhase, endPhase);
    const isLastBatch = endPhase >= GENERATION_PHASES.length;
    const totalBatches = Math.ceil(GENERATION_PHASES.length / BATCH_SIZE);

    console.log(
      `Generating M&A Guide batch ${batch_index + 1}/${totalBatches} for: ${industry_name}`,
      enrichedContext ? 'with context' : 'without context',
      `phases ${startPhase + 1}-${endPhase}`,
    );

    // If not streaming, generate batch at once
    if (!stream) {
      let fullContent = previous_content;
      for (const phase of batchPhases) {
        try {
          const phaseContent = await generatePhaseContent(
            phase,
            industry_name,
            fullContent,
            GEMINI_API_KEY,
            enrichedContext,
            0,
            fireflies_intelligence,
          );
          fullContent += phaseContent + '\n\n';
        } catch (phaseError: unknown) {
          if (phaseError instanceof GenerationError) {
            if (
              phaseError.code === 'rate_limited' ||
              phaseError.message?.includes('Rate limit') ||
              phaseError.message?.includes('429')
            ) {
              return new Response(
                JSON.stringify({ error: phaseError.message || 'Rate limited', recoverable: true }),
                { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
              );
            }
            if (phaseError.code === 'service_unavailable' || phaseError.recoverable) {
              return new Response(
                JSON.stringify({
                  error: phaseError.message || 'Service unavailable',
                  recoverable: true,
                }),
                { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
              );
            }
          }
          throw phaseError;
        }
      }

      // Only validate and extract on last batch
      if (isLastBatch) {
        const quality = validateQuality(fullContent);
        const criteria = await extractCriteria(fullContent, GEMINI_API_KEY);

        return new Response(
          JSON.stringify({
            content: fullContent,
            quality,
            criteria,
            batch_complete: true,
            is_final: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          content: fullContent,
          batch_complete: true,
          is_final: false,
          next_batch_index: batch_index + 1,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // SSE Streaming response for batch
    const readable = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        // Send heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
          send({ type: 'heartbeat', timestamp: Date.now() });
        }, 10000); // Every 10 seconds

        let fullContent = previous_content;

        try {
          // Helper to check if we're approaching function timeout
          const getRemainingTime = () => FUNCTION_TIMEOUT_MS - (Date.now() - FUNCTION_START);
          const hasTimeForPhase = () => getRemainingTime() > MIN_TIME_FOR_PHASE_MS;

          // Send batch start
          send({
            type: 'batch_start',
            batch_index,
            total_batches: totalBatches,
            start_phase: startPhase + 1,
            end_phase: endPhase,
            remaining_time_ms: getRemainingTime(),
          });

          // Check if we have enough time to even start this batch
          if (!hasTimeForPhase()) {
            console.warn(
              `[TIMEOUT_WARNING] Not enough time to start batch ${batch_index + 1}. Remaining: ${getRemainingTime()}ms`,
            );
            send({
              type: 'timeout_warning',
              message: 'Approaching time limit, saving progress...',
              remaining_ms: getRemainingTime(),
            });
            send({
              type: 'batch_complete',
              batch_index,
              content: fullContent,
              wordCount: fullContent.split(/\s+/).length,
              is_final: false,
              next_batch_index: batch_index, // Re-start from this batch
              timeout_approaching: true,
            });
            clearInterval(heartbeatInterval);
            controller.close();
            return;
          }

          // Generate phases in this batch - run in parallel if possible
          if (batchPhases.length === 2 && canRunInParallel(batchPhases[0].id, batchPhases[1].id)) {
            // Parallel generation for independent phases
            const globalPhaseIndex0 = startPhase;
            const globalPhaseIndex1 = startPhase + 1;

            // Notify both phases are starting
            send({
              type: 'phase_start',
              phase: globalPhaseIndex0 + 1,
              total: GENERATION_PHASES.length,
              id: batchPhases[0].id,
              name: batchPhases[0].name,
              batch: batch_index + 1,
              total_batches: totalBatches,
              parallel: true,
            });
            send({
              type: 'phase_start',
              phase: globalPhaseIndex1 + 1,
              total: GENERATION_PHASES.length,
              id: batchPhases[1].id,
              name: batchPhases[1].name,
              batch: batch_index + 1,
              total_batches: totalBatches,
              parallel: true,
            });

            // Generate both phases in parallel
            const [content0, content1] = await Promise.all([
              generatePhaseContent(
                batchPhases[0],
                industry_name,
                fullContent,
                GEMINI_API_KEY,
                enrichedContext,
                0,
                fireflies_intelligence,
              ),
              generatePhaseContent(
                batchPhases[1],
                industry_name,
                fullContent,
                GEMINI_API_KEY,
                enrichedContext,
                0,
                fireflies_intelligence,
              ),
            ]);

            // Stream content from both phases
            const allContent = content0 + '\n\n' + content1;
            fullContent += allContent + '\n\n';

            const chunks = allContent.match(/.{1,500}/g) || [];
            for (const chunk of chunks) {
              send({ type: 'content', content: chunk });
              await new Promise((r) => setTimeout(r, 20)); // Slightly faster streaming
            }

            // Send phase complete for both
            send({
              type: 'phase_complete',
              phase: globalPhaseIndex1 + 1, // Use higher phase for progress
              wordCount: fullContent.split(/\s+/).length,
              content: fullContent,
              phaseId: batchPhases[1].id,
              parallel: true,
              phasesCompleted: [batchPhases[0].id, batchPhases[1].id],
            });
          } else {
            // Sequential generation for dependent phases
            for (let i = 0; i < batchPhases.length; i++) {
              const phase = batchPhases[i];
              const globalPhaseIndex = startPhase + i;

              // Check if we have enough time for another phase
              if (!hasTimeForPhase()) {
                console.warn(
                  `[TIMEOUT_WARNING] Not enough time for phase ${phase.id}. Remaining: ${getRemainingTime()}ms`,
                );
                send({
                  type: 'timeout_warning',
                  message: `Approaching time limit after ${i} phases, saving progress...`,
                  remaining_ms: getRemainingTime(),
                  phases_completed_in_batch: i,
                });
                // End batch early but save progress
                send({
                  type: 'batch_complete',
                  batch_index,
                  content: fullContent,
                  wordCount: fullContent.split(/\s+/).length,
                  is_final: false,
                  next_batch_index: batch_index, // Client should resume from this batch
                  timeout_approaching: true,
                  phases_completed: i,
                });
                clearInterval(heartbeatInterval);
                controller.close();
                return;
              }

              // Add delay between phases to prevent rate limiting (skip first phase)
              if (i > 0) {
                send({ type: 'heartbeat', message: 'Cooling down before next phase...' });
                await new Promise((r) => setTimeout(r, INTER_PHASE_DELAY_MS));
              }

              // Send phase start with remaining time info
              send({
                type: 'phase_start',
                phase: globalPhaseIndex + 1,
                total: GENERATION_PHASES.length,
                id: phase.id,
                name: phase.name,
                batch: batch_index + 1,
                total_batches: totalBatches,
                remaining_time_ms: getRemainingTime(),
              });

              // Generate phase content with clarification context + Fireflies intelligence
              const phaseContent = await generatePhaseContent(
                phase,
                industry_name,
                fullContent,
                GEMINI_API_KEY,
                enrichedContext,
                0,
                fireflies_intelligence,
              );
              fullContent += phaseContent + '\n\n';

              // Send content chunks
              const chunks = phaseContent.match(/.{1,500}/g) || [];
              for (const chunk of chunks) {
                send({ type: 'content', content: chunk });
                // Small delay for smoother streaming
                await new Promise((r) => setTimeout(r, 30));
              }

              // Send phase complete with content for frontend progress saving
              send({
                type: 'phase_complete',
                phase: globalPhaseIndex + 1,
                wordCount: fullContent.split(/\s+/).length,
                // Include full content so frontend can save progress after each phase
                content: fullContent,
                phaseId: phase.id,
                remaining_time_ms: getRemainingTime(),
              });
            }
          }

          // Send batch complete
          send({
            type: 'batch_complete',
            batch_index,
            content: fullContent,
            wordCount: fullContent.split(/\s+/).length,
            is_final: isLastBatch,
            next_batch_index: isLastBatch ? null : batch_index + 1,
          });

          // Only do quality check and criteria extraction on last batch
          if (isLastBatch) {
            // Quality check
            send({ type: 'quality_check_start' });
            const quality = validateQuality(fullContent);
            send({ type: 'quality_check_result', result: quality });

            // Gap fill if needed
            if (!quality.passed && quality.missingElements.length > 0) {
              send({ type: 'gap_fill_start', missingElements: quality.missingElements });

              const gapContent = await generateGapFill(
                quality.missingElements,
                industry_name,
                GEMINI_API_KEY,
              );
              fullContent += '\n\n## GAP FILL CONTENT\n\n' + gapContent;

              // Stream gap fill content
              const chunks = gapContent.match(/.{1,500}/g) || [];
              for (const chunk of chunks) {
                send({ type: 'content', content: chunk });
                await new Promise((r) => setTimeout(r, 30));
              }

              send({ type: 'gap_fill_complete' });

              // Re-validate
              const finalQuality = validateQuality(fullContent);
              send({ type: 'final_quality', result: finalQuality });
            }

            // Extract criteria
            send({ type: 'criteria_extraction_start' });
            const criteria = await extractCriteria(fullContent, GEMINI_API_KEY);
            send({ type: 'criteria', criteria });

            // Complete
            send({
              type: 'complete',
              totalWords: fullContent.split(/\s+/).length,
              content: fullContent,
            });
          }
        } catch (error: unknown) {
          const err = error as Error & { code?: string; recoverable?: boolean };
          const errorCode = err.code || 'unknown';
          const recoverable = err.recoverable ?? true;

          // DIAGNOSTIC LOGGING: Enhanced error logging
          console.error(`[GUIDE_ERROR]`, {
            message: err.message,
            code: errorCode,
            recoverable,
            batch: batch_index,
            industry: industry_name,
            elapsed_ms: Date.now() - FUNCTION_START,
            totalPhasesCompleted: batchPhases.findIndex((_p) => true), // How many phases completed before error
            stack: err.stack?.split('\n').slice(0, 3).join(' | '), // First 3 lines of stack trace
          });

          // Send enhanced error event with more context
          send({
            type: 'error',
            message: err.message,
            error_code: errorCode,
            recoverable,
            batch_index,
            saved_word_count: fullContent.split(/\s+/).length,
            total_batches: totalBatches,
            elapsed_ms: Date.now() - FUNCTION_START,
            // Include retry timing hints for the client
            retry_after_ms:
              errorCode === 'rate_limited'
                ? 30000
                : errorCode === 'service_overloaded'
                  ? 15000
                  : undefined,
          });
        } finally {
          clearInterval(heartbeatInterval);
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error generating MA Guide:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
