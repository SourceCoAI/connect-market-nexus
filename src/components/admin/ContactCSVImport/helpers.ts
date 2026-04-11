/**
 * helpers.ts — Contact CSV Import
 *
 * Pure utility functions, types, and constants for the Contact CSV Import wizard.
 */

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
  name: string;
  reason: string;
}

export interface ContactCSVImportProps {
  /** Pre-set remarketing_buyer_id for all imported contacts */
  buyerId?: string;
  onComplete?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export type WizardStep = 'upload' | 'mapping' | 'preview' | 'importing';

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_ROW_COUNT = 5000;

export const TARGET_FIELDS = [
  { value: 'first_name', label: 'First Name', required: true, description: 'Contact first name' },
  { value: 'last_name', label: 'Last Name', required: true, description: 'Contact last name' },
  { value: 'full_name', label: 'Full Name', required: false, description: 'Full name (auto-splits into first/last)' },
  { value: 'email', label: 'Email', required: false, description: 'Email address — used for dedup' },
  { value: 'linkedin_url', label: 'LinkedIn URL', required: false, description: 'LinkedIn profile URL — used for dedup' },
  { value: 'title', label: 'Title / Role', required: false, description: 'Job title or role' },
  { value: 'company', label: 'Company', required: false, description: 'Company name (resolved to buyer)' },
  { value: 'mobile_phone_1', label: 'Mobile Phone 1', required: false, description: 'Primary mobile number' },
  { value: 'mobile_phone_2', label: 'Mobile Phone 2', required: false, description: 'Secondary mobile number' },
  { value: 'mobile_phone_3', label: 'Mobile Phone 3', required: false, description: 'Tertiary mobile number' },
  { value: 'office_phone', label: 'Office Phone', required: false, description: 'Office / main line' },
  { value: 'phone', label: 'Phone (Generic)', required: false, description: 'Phone number (stored as mobile_phone_1)' },
  { value: 'contact_type', label: 'Contact Type', required: false, description: 'buyer, seller, advisor, etc.' },
];

/**
 * Check if minimum required mappings are present.
 * Need at least a name field AND (email or linkedin_url).
 */
export function hasRequiredMapping(mappings: ColumnMapping[]): boolean {
  const mapped = new Set(mappings.map((m) => m.targetField).filter(Boolean));
  const hasName = mapped.has('first_name') || mapped.has('full_name');
  const hasIdentity = mapped.has('email') || mapped.has('linkedin_url');
  return hasName && hasIdentity;
}

/**
 * Heuristic column mapping based on header names.
 */
export function guessMapping(headers: string[]): ColumnMapping[] {
  return headers.map((header) => {
    const lower = header.toLowerCase().trim();
    let targetField: string | null = null;
    let confidence = 0;

    if (/^(first[_ ]?name|fname|given[_ ]?name)$/i.test(lower)) {
      targetField = 'first_name'; confidence = 0.9;
    } else if (/^(last[_ ]?name|lname|surname|family[_ ]?name)$/i.test(lower)) {
      targetField = 'last_name'; confidence = 0.9;
    } else if (/^(full[_ ]?name|name|contact[_ ]?name)$/i.test(lower)) {
      targetField = 'full_name'; confidence = 0.85;
    } else if (/^(email|e-?mail|email[_ ]?address)$/i.test(lower)) {
      targetField = 'email'; confidence = 0.95;
    } else if (/linkedin/i.test(lower)) {
      targetField = 'linkedin_url'; confidence = 0.9;
    } else if (/^(title|role|job[_ ]?title|position)$/i.test(lower)) {
      targetField = 'title'; confidence = 0.85;
    } else if (/^(company|company[_ ]?name|organization|firm)$/i.test(lower)) {
      targetField = 'company'; confidence = 0.85;
    } else if (/mobile.*1|primary.*mobile|cell.*1|mobile.*phone.*1/i.test(lower)) {
      targetField = 'mobile_phone_1'; confidence = 0.9;
    } else if (/mobile.*2|cell.*2|mobile.*phone.*2/i.test(lower)) {
      targetField = 'mobile_phone_2'; confidence = 0.85;
    } else if (/mobile.*3|cell.*3|mobile.*phone.*3/i.test(lower)) {
      targetField = 'mobile_phone_3'; confidence = 0.85;
    } else if (/office.*phone|work.*phone|direct.*line/i.test(lower)) {
      targetField = 'office_phone'; confidence = 0.85;
    } else if (/^(phone|phone[_ ]?number|telephone|mobile|cell)$/i.test(lower)) {
      targetField = 'phone'; confidence = 0.8;
    } else if (/contact[_ ]?type|type/i.test(lower)) {
      targetField = 'contact_type'; confidence = 0.7;
    }

    return { csvColumn: header, targetField, confidence, aiSuggested: false };
  });
}

export interface ParsedContact {
  first_name: string;
  last_name: string;
  email: string | null;
  linkedin_url: string | null;
  title: string | null;
  company: string | null;
  mobile_phone_1: string | null;
  mobile_phone_2: string | null;
  mobile_phone_3: string | null;
  office_phone: string | null;
  contact_type: string;
  phone_source: string;
}

/**
 * Build a contact record from a CSV row using the column mappings.
 */
export function buildContactFromRow(
  row: CSVRow,
  mappings: ColumnMapping[],
): ParsedContact | null {
  const fieldMap: Record<string, string> = {};
  for (const m of mappings) {
    if (m.targetField && row[m.csvColumn] !== undefined) {
      fieldMap[m.targetField] = row[m.csvColumn].trim();
    }
  }

  // Resolve name
  let firstName = fieldMap.first_name || '';
  let lastName = fieldMap.last_name || '';
  if (!firstName && fieldMap.full_name) {
    const parts = fieldMap.full_name.trim().split(/\s+/);
    firstName = parts[0] || '';
    lastName = parts.slice(1).join(' ') || '';
  }

  if (!firstName) return null;

  // Require at least email or linkedin_url
  const email = fieldMap.email || null;
  const linkedinUrl = fieldMap.linkedin_url || null;
  if (!email && !linkedinUrl) return null;

  // Route generic "phone" to mobile_phone_1
  const mobilePhone1 = fieldMap.mobile_phone_1 || fieldMap.phone || null;

  return {
    first_name: firstName,
    last_name: lastName,
    email,
    linkedin_url: linkedinUrl,
    title: fieldMap.title || null,
    company: fieldMap.company || null,
    mobile_phone_1: mobilePhone1,
    mobile_phone_2: fieldMap.mobile_phone_2 || null,
    mobile_phone_3: fieldMap.mobile_phone_3 || null,
    office_phone: fieldMap.office_phone || null,
    contact_type: fieldMap.contact_type || 'buyer',
    phone_source: 'csv_import',
  };
}

/**
 * Validate rows and split into valid + skipped.
 */
export function computeRowValidation(
  rows: CSVRow[],
  mappings: ColumnMapping[],
): { valid: CSVRow[]; skipped: SkippedRowDetail[] } {
  const valid: CSVRow[] = [];
  const skipped: SkippedRowDetail[] = [];

  for (let i = 0; i < rows.length; i++) {
    const contact = buildContactFromRow(rows[i], mappings);
    if (!contact) {
      const name = rows[i][mappings.find((m) => m.targetField === 'full_name' || m.targetField === 'first_name')?.csvColumn || ''] || `Row ${i + 1}`;
      skipped.push({
        index: i,
        name,
        reason: !contact ? 'Missing required field (name + email or LinkedIn URL)' : 'Unknown',
      });
    } else {
      valid.push(rows[i]);
    }
  }

  return { valid, skipped };
}
