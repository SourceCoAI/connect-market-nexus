import {
  GENERIC_EMAIL_DOMAINS,
  isGenericEmailDomain as _isGeneric,
} from '@/lib/generic-email-domains';

// Re-export the canonical set so existing imports keep working.
export { GENERIC_EMAIL_DOMAINS };

/**
 * Returns true if the domain is a generic/personal email provider
 * that should not be used for company identification.
 */
export function isGenericEmailDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  const normalized = normalizeDomain(domain);
  if (!normalized) return false;
  return _isGeneric(normalized);
}

/**
 * Normalize a domain/URL to a consistent format for unique identification.
 * Removes protocol, www prefix, trailing slashes, and converts to lowercase.
 *
 * @example
 * normalizeDomain("https://www.example.com/") // "example.com"
 * normalizeDomain("WWW.Example.COM") // "example.com"
 * normalizeDomain("http://example.com/page") // "example.com"
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;

  try {
    // Trim whitespace
    let domain = input.trim();

    // Handle email addresses: extract domain part after @
    if (domain.includes('@')) {
      const atIndex = domain.lastIndexOf('@');
      domain = domain.substring(atIndex + 1);
    }

    // If it looks like a URL, parse it
    if (domain.includes('://') || domain.includes('/')) {
      try {
        const url = new URL(domain.startsWith('http') ? domain : `https://${domain}`);
        domain = url.hostname;
      } catch {
        // If URL parsing fails, continue with string manipulation
      }
    }

    // Remove protocol prefixes if still present
    domain = domain.replace(/^https?:\/\//i, '');

    // Remove www. prefix
    domain = domain.replace(/^www\./i, '');

    // Remove trailing slashes and paths
    domain = domain.split('/')[0];

    // Remove port number
    domain = domain.split(':')[0];

    // Convert to lowercase
    domain = domain.toLowerCase();

    // Validate: must have at least one dot and no spaces
    if (!domain.includes('.') || domain.includes(' ')) {
      return null;
    }

    return domain;
  } catch {
    return null;
  }
}
