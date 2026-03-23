import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { GEMINI_API_URL, getGeminiHeaders, DEFAULT_GEMINI_MODEL } from '../_shared/ai-providers.ts';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

// Bump this when deploying to verify the active function version
const VERSION = 'map-csv-columns@2026-02-03.2';

interface MappingRequest {
  columns: string[];
  targetType: 'buyer' | 'deal';
  sampleData?: Record<string, string>[];
}

interface ColumnMapping {
  csvColumn: string;
  targetField: string | null;
  confidence: number;
  aiSuggested: boolean;
}

// Extended buyer fields based on the technical spec
const BUYER_FIELDS = [
  { field: 'company_name', description: 'Platform/portfolio company name (REQUIRED)' },
  { field: 'platform_website', description: 'Website URL of the portfolio company' },
  { field: 'pe_firm_name', description: 'Name of the private equity firm/sponsor' },
  { field: 'pe_firm_website', description: 'Website URL of the PE firm' },
  {
    field: 'company_website',
    description: 'General website URL (if not separated into platform/PE)',
  },
  {
    field: 'buyer_type',
    description: 'Type of buyer (PE firm, platform, strategic, family office)',
  },
  {
    field: 'hq_city_state',
    description: 'Combined headquarters city and state (e.g., "Phoenix, AZ")',
  },
  { field: 'hq_city', description: 'Headquarters city only' },
  { field: 'hq_state', description: 'Headquarters state (2-letter code preferred, e.g., TX, CA)' },
  { field: 'hq_country', description: 'Headquarters country' },
  { field: 'thesis_summary', description: 'Investment thesis or focus areas' },
  { field: 'target_revenue_min', description: 'Minimum target company revenue' },
  { field: 'target_revenue_max', description: 'Maximum target company revenue' },
  { field: 'target_ebitda_min', description: 'Minimum target EBITDA' },
  { field: 'target_ebitda_max', description: 'Maximum target EBITDA' },
  { field: 'target_geographies', description: 'Target states or regions for acquisitions' },
  { field: 'target_services', description: 'Target services or industries' },
  { field: 'geographic_footprint', description: 'Current operating locations' },
  { field: 'investment_date', description: 'Date PE firm invested in the platform (various date formats)' },
  { field: 'notes', description: 'Additional notes' },
  // Primary contact fields (creates a contact linked to the buyer)
  { field: 'contact_name', description: 'Full name of primary contact person' },
  { field: 'contact_first_name', description: 'First name of primary contact person' },
  { field: 'contact_last_name', description: 'Last name of primary contact person' },
  { field: 'contact_email', description: 'Email of primary contact person' },
  { field: 'contact_phone', description: 'Phone number of primary contact person' },
  { field: 'contact_title', description: 'Job title of primary contact person' },
  { field: 'contact_linkedin_url', description: 'LinkedIn profile URL of primary contact person' },
];

// Deal/listing fields for import
const DEAL_FIELDS = [
  { field: 'title', description: 'Company name (REQUIRED)' },
  { field: 'website', description: 'Company website URL' },
  {
    field: 'category',
    description: 'Industry or business category (e.g., Collision, HVAC, Roofing)',
  },
  { field: 'revenue', description: 'Annual revenue amount (numeric)' },
  { field: 'ebitda', description: 'EBITDA amount (numeric)' },
  { field: 'description', description: 'Business description or AI-generated summary' },
  { field: 'executive_summary', description: 'Executive summary of the deal' },
  { field: 'general_notes', description: 'General notes, Bill Notes, or comments about the deal' },
  { field: 'services', description: 'Services offered by the company' },
  { field: 'geographic_states', description: 'States where the company operates' },
  { field: 'full_time_employees', description: 'Number of employees' },
  { field: 'address', description: 'Full street address' },
  { field: 'address_city', description: 'City name' },
  { field: 'address_state', description: 'State (2-letter code)' },
  { field: 'address_zip', description: 'ZIP code' },
  { field: 'main_contact_name', description: 'Full name of primary contact or owner' },
  { field: 'main_contact_first_name', description: 'First name only of primary contact' },
  { field: 'main_contact_last_name', description: 'Last name only of primary contact' },
  { field: 'main_contact_email', description: 'Primary contact email address' },
  { field: 'main_contact_phone', description: 'Primary contact phone number' },
  {
    field: 'main_contact_title',
    description: 'Job title or role of primary contact (e.g., Owner, CEO)',
  },
  { field: 'internal_company_name', description: 'Internal name for the company' },
  { field: 'internal_notes', description: 'Internal notes (not shown to buyers)' },
  { field: 'owner_goals', description: 'Owner goals or seller motivation' },
  { field: 'number_of_locations', description: 'Number of business locations' },
  { field: 'google_review_count', description: 'Number of Google reviews' },
  { field: 'google_rating', description: 'Google review score/rating (1-5)' },
  { field: 'linkedin_url', description: 'LinkedIn company profile URL' },
  { field: 'fireflies_url', description: 'URL to Fireflies call recording or transcript' },
  // status is intentionally omitted - it should never be imported from CSV
  { field: 'last_contacted_at', description: 'Date of last contact with the company' },
];

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    console.log(`[${VERSION}] Request received`, {
      method: req.method,
      url: req.url,
      ts: new Date().toISOString(),
    });

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const { columns, targetType, sampleData } = (await req.json()) as MappingRequest;

    if (!columns || columns.length === 0) {
      return new Response(JSON.stringify({ mappings: [], _version: VERSION }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fields = targetType === 'buyer' ? BUYER_FIELDS : DEAL_FIELDS;

    // Build sample data string for context
    let sampleDataStr = '';
    if (sampleData && sampleData.length > 0) {
      sampleDataStr = '\n\nSample data from first 3 rows:\n';
      sampleData.slice(0, 3).forEach((row, i) => {
        sampleDataStr += `Row ${i + 1}: ${columns.map((col) => `${col}="${row[col] || ''}"`).join(', ')}\n`;
      });
    }

    let systemPrompt: string;

    if (targetType === 'deal') {
      systemPrompt = `You are a data mapping expert for M&A deal/company data imports.
Given CSV column names and sample data, map them to target database fields for company listings.

Be intelligent about variations:
- "Company Name", "Business Name", "Name", "Account" → title
- "Website URL", "Site", "URL", "Web" → website
- "Industry", "Category", "Sector", "Type", "Vertical" → category
- "Revenue", "Annual Revenue", "Sales", "Top Line" → revenue (numeric financial data)
- "EBITDA", "Earnings", "EBIDA" → ebitda (numeric financial data)
- "Description", "Summary", "About", "AI Description" → description
- "Notes", "Comments", "Bill Notes", "General Notes", "Internal Notes", "Deal Notes" → general_notes
- "Services", "Main Services", "Offerings", "Products" → services
- "States", "Geography", "Locations", "Service Area" → geographic_states
- "Employees", "Employee Count", "Headcount", "Staff", "FTE" → full_time_employees
- "Address", "Location", "Street Address" → address
- "City" → address_city
- "State" (2-letter codes like TX, CA) → address_state
- "First Name" (contact's first name only) → main_contact_first_name
- "Last Name" (contact's last name only) → main_contact_last_name
- "Contact Name", "Owner Name", "Full Name" → main_contact_name
- "Title", "Role", "Position", "Job Title" (if about a person) → main_contact_title
- "Email", "Contact Email", "Owner Email" → main_contact_email
- "Phone", "Phone Number", "Contact Phone", "Mobile" → main_contact_phone
- "LinkedIn URL", "LinkedIn", "LI URL", "Company LinkedIn" → linkedin_url
- "Fireflies", "Fireflies URL", "Recording URL", "Call Recording" → fireflies_url
- "Google Reviews", "Review Count", "Reviews" → google_review_count
- "Google Score", "Rating", "Review Score" → google_rating
- "Locations", "Location Count", "# of Locations" → number_of_locations
- "Status", "Stage", "Deal Status", "Pipeline Stage" → status
- "Last Contacted", "Last Contact Date", "Last Touch" → last_contacted_at
- "Marketplace" (if it's a yes/no flag) → ignore (internal only)

Return null for columns that don't match any field.
Look at sample data to disambiguate - e.g., if a column contains URLs, map to website; if it contains names, check if first or full name.

CRITICAL RULES:
- NEVER map email addresses (containing @) to the website field. Emails go to main_contact_email.
- "Company" alone (without "Name") should map to title.
- "Title" with values like "Owner", "CEO", "President" should map to main_contact_title, NOT title.`;
    } else if (targetType === 'buyer') {
      systemPrompt = `You are a data mapping expert for M&A buyer data imports.
Given CSV column names and sample data, map them to target database fields.

Be intelligent about variations:
- "Firm Name", "Company", "Platform Name", "Name" → company_name
- "Platform Website", "Company URL", "Website" → platform_website or company_website
- "PE Firm", "PE Owner", "Sponsor", "Private Equity Firm" → pe_firm_name
- "PE Website", "Sponsor Website" → pe_firm_website
- "HQ", "Headquarters", "City, State" → hq_city_state
- Columns with URL-like sample data should map to website fields
- Columns with 2-letter codes (TX, CA) likely map to hq_state
- "Contact Name", "Primary Contact", "Contact Person" → contact_name
- "Contact First Name", "First Name" (if about a person) → contact_first_name
- "Contact Last Name", "Last Name" (if about a person) → contact_last_name
- "Contact Email", "Email" (if about a person, not a company) → contact_email
- "Contact Phone", "Phone" (if about a person) → contact_phone
- "Contact Title", "Title", "Role", "Job Title" (if about a person) → contact_title
- "Contact LinkedIn", "LinkedIn Profile", "LinkedIn URL" (if about a person, not a company) → contact_linkedin_url

Return null for columns that don't match any field.
Prioritize platform_website and pe_firm_website over generic company_website when you can distinguish them.
For LinkedIn URLs: if it contains "/in/" it's a person profile → contact_linkedin_url. If it contains "/company/" it's a company → map to notes or null.`;
    } else {
      systemPrompt = `You are a data mapping expert for M&A deal/company listings imports.
Given CSV column names and sample data, map them to target database fields.

Be intelligent about variations:
- "Company Name", "Business Name", "Name", "Title" → title
- "Website", "URL", "Site" → website
- "Location", "City", "Address" → location (or address_city if specifically city)
- "Revenue", "Sales", "Annual Revenue" → revenue
- "EBITDA", "Earnings", "Profit" → ebitda
- "Description", "About", "Overview", "Summary" → description
- "States", "Regions", "Operating States" → geographic_states
- "Services", "Industries", "Sectors" → services
- "Street", "Address Line 1" → street_address
- "City" → address_city
- "State", "ST" → address_state
- "ZIP", "Zip Code", "Postal Code" → address_zip
- "Country" → address_country

Return null for columns that don't match any field.
Location can be city+state combined or just a general location string.`;
    }

    const userPrompt = `Map these CSV columns to target fields:

CSV Columns: ${columns.join(', ')}
${sampleDataStr}

Target Fields:
${fields.map((f) => `- ${f.field}: ${f.description}`).join('\n')}

Map each CSV column to the most appropriate target field, or null if no match.
Consider the sample data to make better decisions.`;

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: getGeminiHeaders(GEMINI_API_KEY),
      body: JSON.stringify({
        model: DEFAULT_GEMINI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'map_columns',
              description: 'Map CSV columns to target database fields',
              parameters: {
                type: 'object',
                properties: {
                  mappings: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        csvColumn: { type: 'string' },
                        targetField: { type: 'string', nullable: true },
                        confidence: { type: 'number', minimum: 0, maximum: 1 },
                      },
                      required: ['csvColumn', 'targetField', 'confidence'],
                    },
                  },
                },
                required: ['mappings'],
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'map_columns' } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.log('Rate limited, falling back to heuristic mapping');
        const heuristic = heuristicMapping(columns, targetType);
        const complete = ensureCompleteMappings(columns, heuristic);
        return new Response(JSON.stringify({ mappings: complete, _version: VERSION }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        console.log('Payment required, falling back to heuristic mapping');
        const heuristic = heuristicMapping(columns, targetType);
        const complete = ensureCompleteMappings(columns, heuristic);
        return new Response(JSON.stringify({ mappings: complete, _version: VERSION }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      console.log('No tool call, falling back to heuristic');
      const heuristic = heuristicMapping(columns, targetType);
      const complete = ensureCompleteMappings(columns, heuristic);
      return new Response(JSON.stringify({ mappings: complete, _version: VERSION }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let aiMappings: ColumnMapping[];
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      aiMappings = parsed.mappings.map(
        (m: { csvColumn: string; targetField: string | null; confidence: number }) => ({
          ...m,
          aiSuggested: true,
        }),
      );
    } catch (e) {
      console.error('Failed to parse AI response, using heuristic');
      aiMappings = heuristicMapping(columns, targetType);
    }

    // CRITICAL: Ensure we return a complete mapping for every input column
    const completeMappings = ensureCompleteMappings(columns, aiMappings);

    console.log(
      `[${VERSION}] Mapping stats: requested=${columns.length}, ai_returned=${aiMappings.length}, final=${completeMappings.length}`,
    );

    return new Response(JSON.stringify({ mappings: completeMappings, _version: VERSION }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(`[${VERSION}] Map CSV columns error:`, error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        _version: VERSION,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

function heuristicMapping(
  columns: string[],
  targetType: 'buyer' | 'deal' = 'buyer',
): ColumnMapping[] {
  return columns.map((col) => {
    const lower = col.toLowerCase().trim();
    let targetField: string | null = null;
    let confidence = 0.5;

    if (targetType === 'deal') {
      // Deal/Company mappings - ORDER MATTERS (most specific first)

      // IGNORE columns - check FIRST before any other matches
      // Status should NEVER be imported - it's set by the system
      if (
        lower === 'marketplace' ||
        lower === 'fit / not fit' ||
        lower === 'fit/not fit' ||
        lower.includes('qualified') ||
        lower.includes('buyers shown') ||
        lower.includes('appointment') ||
        lower.includes('data source') ||
        lower === 'status' ||
        lower === 'deal status' ||
        lower === 'stage' ||
        lower === 'pipeline stage'
      ) {
        targetField = null;
        confidence = 0;
      }
      // Company name
      else if (
        (lower.includes('company') && lower.includes('name')) ||
        lower === 'company name' ||
        lower === 'company' ||
        lower === 'name' ||
        lower === 'business name' ||
        lower === 'business' ||
        lower === 'account' ||
        lower === 'account name'
      ) {
        targetField = 'title';
        confidence = 0.95;
      }
      // Website - but NOT LinkedIn, Fireflies, or Recording URLs
      else if (
        (lower.includes('website') || lower === 'url' || lower === 'site') &&
        !lower.includes('linkedin') &&
        !lower.includes('fireflies') &&
        !lower.includes('recording')
      ) {
        targetField = 'website';
        confidence = 0.9;
      }
      // Fireflies/Recording URL - specific patterns
      else if (
        lower.includes('fireflies') ||
        (lower.includes('recording') && !lower.includes('google'))
      ) {
        targetField = 'fireflies_url';
        confidence = 0.9;
      }
      // LinkedIn URL
      else if (lower.includes('linkedin')) {
        targetField = 'linkedin_url';
        confidence = 0.85;
      }
      // Industry/Category
      else if (
        lower.includes('industry') ||
        lower.includes('category') ||
        lower.includes('sector') ||
        lower.includes('vertical')
      ) {
        targetField = 'category';
        confidence = 0.85;
      }
      // Revenue
      else if (lower.includes('revenue') && !lower.includes('model')) {
        targetField = 'revenue';
        confidence = 0.95;
      }
      // EBITDA
      else if (lower.includes('ebitda') || lower.includes('ebida')) {
        targetField = 'ebitda';
        confidence = 0.95;
      }
      // AI Description / Description
      else if (lower.includes('ai description') || lower.includes('ai summary')) {
        targetField = 'description';
        confidence = 0.9;
      } else if (
        lower.includes('description') ||
        lower.includes('summary') ||
        lower.includes('about')
      ) {
        targetField = 'description';
        confidence = 0.8;
      }
      // Bill Notes / General Notes
      else if (lower.includes('bill') && lower.includes('note')) {
        targetField = 'general_notes';
        confidence = 0.95;
      } else if (lower.includes('notes') || lower.includes('comment')) {
        targetField = 'general_notes';
        confidence = 0.75;
      }
      // Main Services
      else if (
        lower.includes('service') ||
        lower.includes('offering') ||
        lower.includes('product')
      ) {
        targetField = 'services';
        confidence = 0.85;
      }
      // Employee Count (not Range - we skip range)
      else if (
        lower === 'employee count' ||
        lower.includes('headcount') ||
        lower.includes('fte') ||
        lower === 'employees' ||
        lower === 'staff'
      ) {
        targetField = 'full_time_employees';
        confidence = 0.85;
      } else if (lower === 'employee range') {
        // Skip - we only import the exact count
        targetField = null;
        confidence = 0;
      }
      // Address
      else if (lower === 'address' || lower === 'full address' || lower === 'street address') {
        targetField = 'address';
        confidence = 0.85;
      } else if (lower === 'city' || lower.includes('city')) {
        targetField = 'address_city';
        confidence = 0.8;
      } else if ((lower === 'state' || lower.includes('state')) && !lower.includes('united')) {
        targetField = 'address_state';
        confidence = 0.75;
      }
      // Contact - First Name
      else if (lower === 'first name' || (lower.includes('first') && lower.includes('name'))) {
        targetField = 'main_contact_first_name';
        confidence = 0.9;
      }
      // Contact - Last Name
      else if (lower === 'last name' || (lower.includes('last') && lower.includes('name'))) {
        targetField = 'main_contact_last_name';
        confidence = 0.9;
      }
      // Contact - Full Name
      else if ((lower.includes('contact') || lower.includes('owner')) && lower.includes('name')) {
        targetField = 'main_contact_name';
        confidence = 0.8;
      }
      // Contact - Title/Role
      else if (
        lower === 'title' ||
        lower.includes('job title') ||
        lower.includes('role') ||
        lower.includes('position')
      ) {
        targetField = 'main_contact_title';
        confidence = 0.75;
      }
      // Email
      else if (lower === 'email' || (lower.includes('email') && !lower.includes('sent'))) {
        targetField = 'main_contact_email';
        confidence = 0.9;
      }
      // Phone
      else if (
        lower === 'phone' ||
        lower.includes('phone') ||
        lower.includes('mobile') ||
        lower.includes('cell')
      ) {
        targetField = 'main_contact_phone';
        confidence = 0.9;
      }
      // Google Review Count
      else if (
        lower === 'google review count' ||
        (lower.includes('google') && lower.includes('review') && lower.includes('count'))
      ) {
        targetField = 'google_review_count';
        confidence = 0.95;
      }
      // Google Review Score/Rating
      else if (
        lower === 'google review score' ||
        lower === 'google rating' ||
        (lower.includes('google') && (lower.includes('score') || lower.includes('rating')))
      ) {
        targetField = 'google_rating';
        confidence = 0.95;
      }
      // Number of Locations
      else if (
        lower === 'locations' ||
        lower === '# of locations' ||
        lower.includes('location count') ||
        lower === 'number of locations'
      ) {
        targetField = 'number_of_locations';
        confidence = 0.85;
      }
      // Owner Goals
      else if (lower.includes('owner') && lower.includes('goal')) {
        targetField = 'owner_goals';
        confidence = 0.8;
      }
      // Status
      else if (
        lower === 'status' ||
        lower.includes('deal status') ||
        lower.includes('stage') ||
        lower.includes('pipeline')
      ) {
        targetField = 'status';
        confidence = 0.75;
      }
      // Last Contacted
      else if (lower.includes('last') && lower.includes('contact')) {
        targetField = 'last_contacted_at';
        confidence = 0.85;
      }
    } else {
      // Buyer mappings — ORDER MATTERS: specific fields before generic name/firm match
      // Contact fields (check first to avoid shadowing by generic "name"/"firm")
      if (lower.includes('linkedin')) {
        targetField = 'contact_linkedin_url';
        confidence = 0.7;
      } else if (
        (lower.includes('contact') || lower.includes('primary')) &&
        lower.includes('name') &&
        !lower.includes('first') &&
        !lower.includes('last')
      ) {
        targetField = 'contact_name';
        confidence = 0.85;
      } else if ((lower.includes('contact') && lower.includes('first')) || lower === 'first name') {
        targetField = 'contact_first_name';
        confidence = 0.85;
      } else if ((lower.includes('contact') && lower.includes('last')) || lower === 'last name') {
        targetField = 'contact_last_name';
        confidence = 0.85;
      } else if (
        (lower.includes('contact') || lower.includes('primary')) &&
        lower.includes('email')
      ) {
        targetField = 'contact_email';
        confidence = 0.85;
      } else if (lower === 'email' || lower === 'e-mail') {
        targetField = 'contact_email';
        confidence = 0.7;
      } else if (
        (lower.includes('contact') || lower.includes('primary') || lower.includes('owner')) &&
        lower.includes('phone')
      ) {
        targetField = 'contact_phone';
        confidence = 0.85;
      } else if (lower === 'phone' || lower === 'phone number') {
        targetField = 'contact_phone';
        confidence = 0.7;
      } else if (
        (lower.includes('contact') || lower.includes('primary')) &&
        (lower.includes('title') || lower.includes('role'))
      ) {
        targetField = 'contact_title';
        confidence = 0.85;
      } else if (lower === 'title' || lower === 'job title' || lower === 'role') {
        targetField = 'contact_title';
        confidence = 0.7;
      }
      // Websites (check before generic name/firm)
      else if (
        lower.includes('platform') &&
        (lower.includes('website') || lower.includes('url') || lower.includes('site'))
      ) {
        targetField = 'platform_website';
        confidence = 0.9;
      } else if (
        (lower.includes('pe') || lower.includes('sponsor') || lower.includes('firm')) &&
        (lower.includes('website') || lower.includes('url') || lower.includes('site'))
      ) {
        targetField = 'pe_firm_website';
        confidence = 0.9;
      } else if (lower.includes('website') || lower.includes('url') || lower.includes('site')) {
        targetField = 'company_website';
        confidence = 0.8;
      }
      // PE Firm name (check before generic company/name/firm)
      else if (
        (lower.includes('pe') || lower.includes('private equity') || lower.includes('sponsor')) &&
        (lower.includes('name') || lower.includes('owner') || lower === 'pe firm' || lower === 'sponsor')
      ) {
        targetField = 'pe_firm_name';
        confidence = 0.85;
      }
      // Platform/Company name — generic fallback
      else if (lower.includes('platform') && (lower.includes('company') || lower.includes('name'))) {
        targetField = 'company_name';
        confidence = 0.9;
      } else if (lower.includes('company') || lower.includes('name') || lower.includes('firm')) {
        targetField = 'company_name';
        confidence = 0.8;
      } else if (
        (lower.includes('hq') || lower.includes('headquarters')) &&
        (lower.includes('city') || lower.includes('state') || lower.includes('location'))
      ) {
        targetField = 'hq_city_state';
        confidence = 0.8;
      } else if (lower.includes('city') && lower.includes('state')) {
        targetField = 'hq_city_state';
        confidence = 0.85;
      } else if (lower.includes('city') && !lower.includes('state')) {
        targetField = 'hq_city';
        confidence = 0.8;
      } else if (lower.includes('state') && !lower.includes('city') && !lower.includes('target')) {
        targetField = 'hq_state';
        confidence = 0.75;
      } else if (lower.includes('country')) {
        targetField = 'hq_country';
        confidence = 0.8;
      } else if (lower.includes('type') || lower.includes('category')) {
        targetField = 'buyer_type';
        confidence = 0.7;
      } else if (
        lower.includes('thesis') ||
        lower.includes('focus') ||
        lower.includes('strategy')
      ) {
        targetField = 'thesis_summary';
        confidence = 0.8;
      } else if ((lower.includes('revenue') || lower.includes('rev')) && lower.includes('min')) {
        targetField = 'target_revenue_min';
        confidence = 0.9;
      } else if ((lower.includes('revenue') || lower.includes('rev')) && lower.includes('max')) {
        targetField = 'target_revenue_max';
        confidence = 0.9;
      } else if (lower.includes('ebitda') && lower.includes('min')) {
        targetField = 'target_ebitda_min';
        confidence = 0.9;
      } else if (lower.includes('ebitda') && lower.includes('max')) {
        targetField = 'target_ebitda_max';
        confidence = 0.9;
      } else if (
        lower.includes('target') &&
        (lower.includes('geography') || lower.includes('state') || lower.includes('region'))
      ) {
        targetField = 'target_geographies';
        confidence = 0.75;
      } else if (lower.includes('geography') || lower.includes('region')) {
        targetField = 'target_geographies';
        confidence = 0.6;
      } else if (
        lower.includes('service') ||
        lower.includes('industry') ||
        lower.includes('sector')
      ) {
        targetField = 'target_services';
        confidence = 0.7;
      } else if (
        lower.includes('footprint') ||
        lower.includes('location') ||
        lower.includes('presence') ||
        lower.includes('current')
      ) {
        targetField = 'geographic_footprint';
        confidence = 0.6;
      } else if (lower.includes('note')) {
        targetField = 'notes';
        confidence = 0.8;
      }
      // Investment date
      else if (
        (lower.includes('investment') || lower.includes('invested')) &&
        lower.includes('date')
      ) {
        targetField = 'investment_date';
        confidence = 0.85;
      }
    }

    return {
      csvColumn: col,
      targetField,
      confidence,
      aiSuggested: false,
    };
  });
}

/**
 * Ensure all input columns are represented in the mappings array.
 * This is CRITICAL: AI may return a partial list, but we must always
 * return one mapping per input column, in order.
 */
function ensureCompleteMappings(
  inputColumns: string[],
  partialMappings: ColumnMapping[],
): ColumnMapping[] {
  // Build lookup by normalized column name
  const lookup = new Map<string, ColumnMapping>();
  for (const m of partialMappings) {
    if (m.csvColumn) {
      const key = m.csvColumn.toLowerCase().trim();
      if (!lookup.has(key)) {
        lookup.set(key, m);
      }
    }
  }

  // Build complete array in input column order
  const complete: ColumnMapping[] = inputColumns.map((col) => {
    const key = col.toLowerCase().trim();
    const existing = lookup.get(key);
    if (existing) {
      return {
        ...existing,
        csvColumn: col, // Preserve original casing
      };
    }
    // Column not in AI response - return unmapped
    return {
      csvColumn: col,
      targetField: null,
      confidence: 0,
      aiSuggested: false,
    };
  });

  // Log any missing columns for debugging
  const missingCount = inputColumns.length - partialMappings.filter((m) => m.csvColumn).length;
  if (missingCount > 0) {
    const missing = inputColumns.filter((col) => !lookup.has(col.toLowerCase().trim()));
    console.log(
      `[ensureCompleteMappings] Filled ${missingCount} missing columns. First 10:`,
      missing.slice(0, 10),
    );
  }

  return complete;
}
