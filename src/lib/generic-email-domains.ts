/**
 * Canonical list of generic / free / consumer email domains.
 * Import this instead of hardcoding domain arrays.
 *
 * Includes: webmail providers, ISP domains, and privacy-focused providers.
 */
export const GENERIC_EMAIL_DOMAINS = new Set([
  // Major webmail providers
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.com.au',
  'hotmail.com',
  'hotmail.se',
  'outlook.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'live.com',
  'msn.com',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'gmx.com',
  'gmx.net',
  'inbox.com',
  'rocketmail.com',
  'ymail.com',
  // Privacy-focused
  'protonmail.com',
  'proton.me',
  'pm.me',
  'fastmail.com',
  'tutanota.com',
  'hey.com',
  // ISP domains
  'comcast.net',
  'att.net',
  'sbcglobal.net',
  'verizon.net',
  'cox.net',
  'charter.net',
  'earthlink.net',
  'optonline.net',
  'frontier.com',
  'windstream.net',
  'mediacombb.net',
  'bellsouth.net',
  // Spam / disposable patterns seen in data
  'webxio.pro',
  'leabro.com',
  'coursora.com',
]);

export function isGenericEmailDomain(domain: string): boolean {
  return GENERIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}
