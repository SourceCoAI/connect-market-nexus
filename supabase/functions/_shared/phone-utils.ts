/**
 * Shared Phone Number Utilities
 *
 * Centralized phone normalization and validation used by:
 * - phoneburner-push-contacts (dial session creation)
 * - find-contacts (enrichment pipeline)
 * - clay-webhook-phone (webhook phone results)
 * - import-contacts (CSV import)
 */

/**
 * Normalize a phone number to digits only.
 * Strips non-digit characters and removes leading "1" for 11-digit US numbers.
 */
export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

/**
 * Validate that a phone number has a reasonable length.
 * Returns true for numbers with 7-15 digits (after normalization).
 */
export function isValidPhone(value: string | null | undefined): boolean {
  const normalized = normalizePhone(value);
  if (!normalized) return false;
  return normalized.length >= 7 && normalized.length <= 15;
}

/**
 * Collect all non-null phone numbers from structured fields into an array.
 * Used for webhook matching and deduplication.
 */
export function collectPhones(contact: {
  mobile_phone_1?: string | null;
  mobile_phone_2?: string | null;
  mobile_phone_3?: string | null;
  office_phone?: string | null;
  phone?: string | null;
}): string[] {
  const phones: string[] = [];
  const seen = new Set<string>();

  for (const raw of [
    contact.mobile_phone_1,
    contact.mobile_phone_2,
    contact.mobile_phone_3,
    contact.office_phone,
    contact.phone,
  ]) {
    const normalized = normalizePhone(raw);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      phones.push(normalized);
    }
  }

  return phones;
}

/**
 * Pick the best phone numbers for PhoneBurner's 3 phone fields.
 * Returns [phone, phone2, phone3] with mobile numbers prioritized.
 */
export function pickDialerPhones(contact: {
  mobile_phone_1?: string | null;
  mobile_phone_2?: string | null;
  mobile_phone_3?: string | null;
  office_phone?: string | null;
  phone?: string | null;
}): [string | null, string | null, string | null] {
  const candidates = [
    contact.mobile_phone_1,
    contact.mobile_phone_2,
    contact.mobile_phone_3,
    contact.office_phone,
    contact.phone,
  ];

  const seen = new Set<string>();
  const unique: string[] = [];

  for (const raw of candidates) {
    const normalized = normalizePhone(raw);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      unique.push(raw!);
    }
  }

  return [unique[0] || null, unique[1] || null, unique[2] || null];
}
