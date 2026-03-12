/**
 * CsvParser.ts
 *
 * CSV parsing logic, field normalization, validation, and role mapping
 * for the bulk deal import workflow.
 *
 * Extracted from BulkDealImportDialog.tsx for maintainability.
 */
import Papa from 'papaparse';
import { parse } from 'date-fns';

export interface ParsedDeal {
  csvRowNumber: number;
  date: Date | null;
  name: string;
  email: string;
  companyName: string;
  phoneNumber: string;
  role: string;
  message: string;
  errors: string[];
  isValid: boolean;
}

export interface ParseResult {
  deals: ParsedDeal[];
  errors: string[];
}

// ─── Helpers ───

export const extractCompanyFromEmail = (email: string, existingCompany?: string): string => {
  if (existingCompany && existingCompany.trim()) return existingCompany;

  const domain = email.split('@')[1];
  if (!domain) return '';

  const parts = domain.split('.');
  if (parts.length > 1) parts.pop(); // Remove TLD

  const company = parts.join('.');
  return company.charAt(0).toUpperCase() + company.slice(1);
};

export const cleanCompanyName = (company: string): string => {
  if (!company) return '';
  return company
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/^www\./i, '')
    .trim();
};

export const standardizePhone = (phone: string): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
};

export const mapRole = (role: string): string => {
  const normalized = role?.toLowerCase().trim() || '';
  const tokens = new Set(normalized.match(/[a-z]+/g) || []);

  if (
    normalized === 'privateequity' ||
    normalized.includes('private equity') ||
    tokens.has('pe')
  ) {
    return 'private_equity';
  }
  if (normalized === 'familyoffice' || normalized.includes('family office') || tokens.has('fo')) {
    return 'family_office';
  }
  if (normalized === 'independentsponsor' || normalized.includes('independent sponsor')) {
    return 'independent_sponsor';
  }
  if (normalized === 'searchfund' || normalized.includes('search fund') || tokens.has('sf')) {
    return 'search_fund';
  }
  if (normalized === 'corporate' || normalized.includes('corporate') || tokens.has('corp')) {
    return 'corporate';
  }
  if (
    normalized === 'individual' ||
    normalized.includes('individual') ||
    normalized.includes('investor')
  ) {
    return 'individual_buyer';
  }
  return 'corporate';
};

export const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  try {
    return parse(dateStr, 'M/d/yyyy h:mm:ss a', new Date());
  } catch {
    return null;
  }
};

export const validateEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// ─── Main parser ───

export const MAX_FILE_SIZE_MB = 10;
export const MAX_ROWS = 500;

export function parseCsvText(csvText: string): ParseResult {
  if (!csvText.trim()) {
    return { deals: [], errors: ['Please upload a CSV file first'] };
  }

  const errors: string[] = [];
  const deals: ParsedDeal[] = [];

  try {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        // Row count validation
        if (results.data.length > MAX_ROWS) {
          errors.push(
            `Too many rows (${results.data.length}). Maximum is ${MAX_ROWS} rows per import.`,
          );
          return;
        }

        (results.data as Record<string, string>[]).forEach((row, index) => {
          const rowNumber = index + 2;
          const dealErrors: string[] = [];

          const email = row['Email address']?.trim() || '';
          const name = row['Name']?.trim() || '';
          const message = row['Message']?.trim() || '';
          const rawCompany = cleanCompanyName(row['Company name']);

          // Validation
          if (!email || !validateEmail(email)) {
            dealErrors.push('Invalid or missing email');
          }
          if (!name || name.length < 2) {
            dealErrors.push('Name is required (min 2 chars)');
          }
          if (!message || message.length < 20) {
            dealErrors.push('Message must be at least 20 characters');
          }

          // Extract company from email if not provided
          const companyName = extractCompanyFromEmail(email, rawCompany);

          deals.push({
            csvRowNumber: rowNumber,
            date: parseDate(row['Date']),
            name,
            email,
            companyName,
            phoneNumber: standardizePhone(row['Phone number']),
            role: mapRole(row['Role']),
            message,
            errors: dealErrors,
            isValid: dealErrors.length === 0,
          });
        });
      },
      error: (error: Error) => {
        errors.push(`CSV parsing error: ${error.message}`);
      },
    });
  } catch (error: unknown) {
    errors.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { deals, errors };
}
