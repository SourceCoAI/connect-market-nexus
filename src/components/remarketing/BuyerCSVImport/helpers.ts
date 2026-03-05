/**
 * helpers.ts
 *
 * Pure utility functions, types, and constants for the Buyer CSV Import wizard.
 * No React dependencies — safe to unit-test independently.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CSVRow {
  [key: string]: string;
}

export interface ColumnMapping {
  csvColumn: string;
  targetField: string | null;
  confidence: number;
  aiSuggested: boolean;
}

export interface SkippedRowDetail {
  index: number;
  companyName: string;
  reason: string;
}

export interface DuplicateWarning {
  index: number;
  companyName: string;
  potentialDuplicates: Array<{
    id: string;
    companyName: string;
    confidence: number;
    matchType: 'domain' | 'name';
  }>;
}

export interface BuyerCSVImportProps {
  universeId?: string;
  onComplete?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export type WizardStep = 'upload' | 'mapping' | 'preview' | 'dedupe' | 'importing';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max file size: 5 MB */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Max rows allowed per import */
export const MAX_ROW_COUNT = 5000;

/** Extended target fields based on the spec */
export const TARGET_FIELDS = [
  {
    value: 'company_name',
    label: 'Platform Company Name',
    required: true,
    description: 'Name of the portfolio company',
  },
  {
    value: 'platform_website',
    label: 'Platform Website',
    required: false,
    description: 'Website URL of the portfolio company',
  },
  {
    value: 'pe_firm_name',
    label: 'PE Firm Name',
    required: false,
    description: 'Name of the private equity firm',
  },
  {
    value: 'pe_firm_website',
    label: 'PE Firm Website',
    required: false,
    description: 'Website URL of the PE firm',
  },
  {
    value: 'company_website',
    label: 'Company Website (General)',
    required: false,
    description: 'General website URL',
  },
  {
    value: 'buyer_type',
    label: 'Buyer Type',
    required: false,
    description: 'Type of buyer (private equity, corporate, family office)',
  },
  {
    value: 'investment_date',
    label: 'Investment Date',
    required: false,
    description: 'Date PE firm invested in the platform',
  },
  {
    value: 'hq_city_state',
    label: 'HQ City & State (combined)',
    required: false,
    description: 'Combined city and state (will be parsed)',
  },
  { value: 'hq_city', label: 'HQ City', required: false, description: 'Headquarters city' },
  {
    value: 'hq_state',
    label: 'HQ State',
    required: false,
    description: 'Headquarters state (2-letter code preferred)',
  },
  {
    value: 'hq_country',
    label: 'HQ Country',
    required: false,
    description: 'Headquarters country',
  },
  {
    value: 'thesis_summary',
    label: 'Investment Thesis',
    required: false,
    description: 'Investment thesis or focus areas',
  },
  {
    value: 'target_revenue_min',
    label: 'Min Revenue',
    required: false,
    description: 'Minimum target revenue',
  },
  {
    value: 'target_revenue_max',
    label: 'Max Revenue',
    required: false,
    description: 'Maximum target revenue',
  },
  {
    value: 'target_ebitda_min',
    label: 'Min EBITDA',
    required: false,
    description: 'Minimum target EBITDA',
  },
  {
    value: 'target_ebitda_max',
    label: 'Max EBITDA',
    required: false,
    description: 'Maximum target EBITDA',
  },
  {
    value: 'target_geographies',
    label: 'Target Geographies',
    required: false,
    description: 'Target states or regions',
  },
  {
    value: 'target_services',
    label: 'Target Services',
    required: false,
    description: 'Target services or industries',
  },
  {
    value: 'geographic_footprint',
    label: 'Current Footprint',
    required: false,
    description: 'Current operating locations',
  },
  { value: 'notes', label: 'Notes', required: false, description: 'Additional notes' },
  // Primary contact fields
  { value: 'contact_name', label: 'Contact Name', required: false, description: 'Full name of primary contact' },
  { value: 'contact_first_name', label: 'Contact First Name', required: false, description: 'First name of primary contact' },
  { value: 'contact_last_name', label: 'Contact Last Name', required: false, description: 'Last name of primary contact' },
  { value: 'contact_email', label: 'Contact Email', required: false, description: 'Email of primary contact' },
  { value: 'contact_phone', label: 'Contact Phone', required: false, description: 'Phone of primary contact' },
  { value: 'contact_title', label: 'Contact Title', required: false, description: 'Job title of primary contact' },
  { value: 'contact_linkedin_url', label: 'Contact LinkedIn URL', required: false, description: 'LinkedIn profile of primary contact' },
];

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/** Normalize domain for comparison -- validates URL structure */
export function normalizeDomain(url: string): string {
  if (!url) return '';
  let normalized = url.trim().toLowerCase();
  // Validate URL structure if it looks like a full URL
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      const parsed = new URL(normalized);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      normalized = parsed.hostname;
    } catch {
      return '';
    }
  } else {
    // Strip protocol-like prefixes and path components
    normalized = normalized.replace(/^www\./, '');
    normalized = normalized.split('/')[0];
    normalized = normalized.split(':')[0];
    // Basic domain validation: must contain a dot and only valid characters
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized)) return '';
  }
  normalized = normalized.replace(/^www\./, '');
  return normalized;
}

/** Heuristic column-to-field mapper used as fallback when AI mapping fails */
export function guessMapping(column: string): string | null {
  const lower = column.toLowerCase();

  // Platform/Company name
  if (lower.includes('platform') && (lower.includes('company') || lower.includes('name')))
    return 'company_name';
  if (lower.includes('company') || lower.includes('name') || lower.includes('firm'))
    return 'company_name';

  // Websites - be specific about platform vs PE firm
  if (lower.includes('platform') && (lower.includes('website') || lower.includes('url')))
    return 'platform_website';
  if (
    (lower.includes('pe') || lower.includes('firm')) &&
    (lower.includes('website') || lower.includes('url'))
  )
    return 'pe_firm_website';
  if (lower.includes('website') || lower.includes('url') || lower.includes('site'))
    return 'company_website';

  // PE Firm name
  if (
    (lower.includes('pe') || lower.includes('private equity') || lower.includes('sponsor')) &&
    lower.includes('name')
  )
    return 'pe_firm_name';
  if (lower.includes('pe firm') || lower.includes('sponsor')) return 'pe_firm_name';

  // Location
  if (lower.includes('hq') && lower.includes('city') && lower.includes('state'))
    return 'hq_city_state';
  if (lower.includes('city') && lower.includes('state')) return 'hq_city_state';
  if (lower.includes('city')) return 'hq_city';
  if (lower.includes('state') && !lower.includes('target')) return 'hq_state';
  if (lower.includes('country')) return 'hq_country';

  // Type
  if (lower.includes('type') || lower.includes('category')) return 'buyer_type';

  // Thesis
  if (lower.includes('thesis') || lower.includes('focus') || lower.includes('strategy'))
    return 'thesis_summary';

  // Financial
  if ((lower.includes('revenue') || lower.includes('rev')) && lower.includes('min'))
    return 'target_revenue_min';
  if ((lower.includes('revenue') || lower.includes('rev')) && lower.includes('max'))
    return 'target_revenue_max';
  if (lower.includes('ebitda') && lower.includes('min')) return 'target_ebitda_min';
  if (lower.includes('ebitda') && lower.includes('max')) return 'target_ebitda_max';

  // Geography and services
  if (
    lower.includes('target') &&
    (lower.includes('geography') || lower.includes('state') || lower.includes('region'))
  )
    return 'target_geographies';
  if (lower.includes('service') || lower.includes('industry') || lower.includes('sector'))
    return 'target_services';
  if (
    lower.includes('footprint') ||
    lower.includes('location') ||
    lower.includes('presence') ||
    lower.includes('current')
  )
    return 'geographic_footprint';

  // Investment date
  if (lower.includes('investment') && lower.includes('date')) return 'investment_date';
  if (lower.includes('invested') && lower.includes('date')) return 'investment_date';
  if (lower === 'investment date') return 'investment_date';

  // Notes
  if (lower.includes('note')) return 'notes';

  // Contact fields
  if ((lower.includes('contact') || lower.includes('primary')) && lower.includes('name') && !lower.includes('first') && !lower.includes('last'))
    return 'contact_name';
  if ((lower.includes('contact') && lower.includes('first')) || lower === 'first name')
    return 'contact_first_name';
  if ((lower.includes('contact') && lower.includes('last')) || lower === 'last name')
    return 'contact_last_name';
  if ((lower.includes('contact') || lower.includes('primary')) && lower.includes('email'))
    return 'contact_email';
  if (lower === 'email' || lower === 'e-mail') return 'contact_email';
  if ((lower.includes('contact') || lower.includes('primary')) && lower.includes('phone'))
    return 'contact_phone';
  if (lower === 'phone' || lower === 'phone number') return 'contact_phone';
  if ((lower.includes('contact') || lower.includes('primary')) && (lower.includes('title') || lower.includes('role')))
    return 'contact_title';
  if (lower === 'title' || lower === 'job title' || lower === 'role') return 'contact_title';
  if (lower.includes('linkedin')) return 'contact_linkedin_url';

  return null;
}

/** Extract contact fields from a CSV row based on mappings */
export function extractContactFromRow(
  row: CSVRow,
  mappings: ColumnMapping[],
): Record<string, string> | null {
  const contact: Record<string, string> = {};

  mappings.forEach((mapping) => {
    if (mapping.targetField && row[mapping.csvColumn]) {
      const value = row[mapping.csvColumn].trim();
      if (mapping.targetField === 'contact_name') contact.name = value;
      if (mapping.targetField === 'contact_first_name') contact.first_name = value;
      if (mapping.targetField === 'contact_last_name') contact.last_name = value;
      if (mapping.targetField === 'contact_email') contact.email = value;
      if (mapping.targetField === 'contact_phone') contact.phone = value;
      if (mapping.targetField === 'contact_title') contact.title = value;
      if (mapping.targetField === 'contact_linkedin_url') contact.linkedin_url = value;
    }
  });

  // Need at least a name or email to create a contact
  const hasName = contact.name || contact.first_name || contact.last_name;
  if (!hasName && !contact.email) return null;

  // Build first/last name from full name if needed
  if (contact.name && !contact.first_name && !contact.last_name) {
    const parts = contact.name.split(/\s+/);
    contact.first_name = parts[0] || '';
    contact.last_name = parts.slice(1).join(' ') || '';
  }

  return contact;
}

/** Build a buyer record from a CSV row based on the column mappings */
export function buildBuyerFromRow(
  row: CSVRow,
  mappings: ColumnMapping[],
  universeId?: string,
): Record<string, unknown> {
  const buyer: Record<string, unknown> = {
    universe_id: universeId || null,
  };

  mappings.forEach((mapping) => {
    if (mapping.targetField && row[mapping.csvColumn]) {
      const value = row[mapping.csvColumn].trim();

      // Handle combined city/state
      if (mapping.targetField === 'hq_city_state') {
        const parts = value.split(',').map((p) => p.trim());
        if (parts.length >= 2) {
          buyer['hq_city'] = parts[0];
          buyer['hq_state'] = parts[parts.length - 1]; // Last part is usually state
        } else {
          buyer['hq_city'] = value;
        }
        return;
      }

      // Handle website normalization
      if (
        ['platform_website', 'pe_firm_website', 'company_website'].includes(mapping.targetField)
      ) {
        buyer[mapping.targetField] = normalizeDomain(value);
        return;
      }

      // Handle arrays
      if (
        ['target_geographies', 'target_services', 'geographic_footprint'].includes(
          mapping.targetField,
        )
      ) {
        buyer[mapping.targetField] = value
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean);
        return;
      }

      // Handle numbers
      if (
        [
          'target_revenue_min',
          'target_revenue_max',
          'target_ebitda_min',
          'target_ebitda_max',
        ].includes(mapping.targetField)
      ) {
        const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
        if (!isNaN(num)) {
          buyer[mapping.targetField] = num;
        }
        return;
      }

      // Handle buyer type
      if (mapping.targetField === 'buyer_type') {
        const lower = value.toLowerCase();
        if (lower.includes('pe') || lower.includes('private equity'))
          buyer.buyer_type = 'private_equity';
        else if (lower.includes('platform') || lower.includes('strategic') || lower.includes('corporate'))
          buyer.buyer_type = 'corporate';
        else if (lower.includes('family')) buyer.buyer_type = 'family_office';
        else buyer.buyer_type = null;
        return;
      }

      // Handle investment date - parse various formats
      if (mapping.targetField === 'investment_date') {
        let dateValue = value;

        // Handle "2025-11" format (YYYY-MM) by adding day
        if (/^\d{4}-\d{1,2}$/.test(value)) {
          dateValue = `${value}-01`;
        }
        // Handle "11/2025" or "11-2025" format (MM/YYYY)
        else if (/^\d{1,2}[/-]\d{4}$/.test(value)) {
          const parts = value.split(/[/-]/);
          dateValue = `${parts[1]}-${parts[0].padStart(2, '0')}-01`;
        }
        // Handle "Nov 2025" or "November 2025" format
        else if (/^[a-zA-Z]+\s+\d{4}$/.test(value)) {
          const parsed = new Date(value + ' 01');
          if (!isNaN(parsed.getTime())) {
            dateValue = parsed.toISOString().split('T')[0];
          }
        }

        buyer[mapping.targetField] = dateValue;
        return;
      }

      // Standard field assignment
      buyer[mapping.targetField] = value;
    }
  });

  // If pe_firm_name not set but we have it as company name, infer
  if (!buyer.pe_firm_name && buyer.buyer_type === 'private_equity') {
    buyer.pe_firm_name = buyer.company_name;
  }

  // Ensure company_website is always set (DB constraint requires it for active buyers).
  // Fall back to platform_website or pe_firm_website if company_website wasn't mapped.
  if (!buyer.company_website) {
    buyer.company_website = buyer.platform_website || buyer.pe_firm_website || null;
  }

  return buyer;
}

/** Check whether company_name AND at least one website mapping exist */
export function hasRequiredMapping(mappings: ColumnMapping[]): boolean {
  const hasName = mappings.some((m) => m.targetField === 'company_name');
  const hasWebsite = mappings.some(
    (m) =>
      m.targetField === 'platform_website' ||
      m.targetField === 'pe_firm_website' ||
      m.targetField === 'company_website',
  );
  return hasName && hasWebsite;
}

/** Check whether at least one website mapping exists */
export function hasWebsiteMapping(mappings: ColumnMapping[]): boolean {
  return mappings.some(
    (m) =>
      m.targetField === 'platform_website' ||
      m.targetField === 'pe_firm_website' ||
      m.targetField === 'company_website',
  );
}

/** Check whether any contact fields are mapped */
export function hasContactMapping(mappings: ColumnMapping[]): boolean {
  return mappings.some(
    (m) =>
      m.targetField === 'contact_name' ||
      m.targetField === 'contact_first_name' ||
      m.targetField === 'contact_email' ||
      m.targetField === 'contact_linkedin_url',
  );
}

/** Compute valid and skipped rows from data + mappings */
export function computeRowValidation(csvData: CSVRow[], mappings: ColumnMapping[]) {
  const valid: { index: number; row: CSVRow }[] = [];
  const skipped: { index: number; row: CSVRow }[] = [];
  const skippedDetails: SkippedRowDetail[] = [];

  csvData.forEach((row, index) => {
    let platformWebsite: string | null = null;
    let peFirmWebsite: string | null = null;
    let companyWebsite: string | null = null;
    let companyName: string | null = null;

    mappings.forEach((mapping) => {
      if (mapping.targetField && row[mapping.csvColumn]) {
        const value = row[mapping.csvColumn].trim();
        if (mapping.targetField === 'platform_website') platformWebsite = value;
        if (mapping.targetField === 'pe_firm_website') peFirmWebsite = value;
        if (mapping.targetField === 'company_website') companyWebsite = value;
        if (mapping.targetField === 'company_name') companyName = value;
      }
    });

    const hasAnyWebsite = !!platformWebsite || !!peFirmWebsite || !!companyWebsite;
    const hasCompanyName = !!companyName;

    if (hasCompanyName && hasAnyWebsite) {
      valid.push({ index, row });
    } else {
      // Missing company name or website — both are required
      skipped.push({ index, row });
      skippedDetails.push({
        index,
        companyName: companyName || `Row ${index + 2}`,
        reason: !hasCompanyName ? 'Missing company name' : 'Missing website',
      });
    }
  });

  return { validRows: valid, skippedRows: skipped, skippedRowDetails: skippedDetails };
}
