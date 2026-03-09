/**
 * Domain Inference Utilities
 *
 * Helpers for inferring company domains from names.
 * Used by find-contacts, enrich-list-contacts, and AI command center.
 */

/**
 * Infer company domain from name (best-effort).
 * "New Heritage Capital" → "newheritagecapital.com"
 */
export function inferDomain(companyName: string): string {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '')
    .trim();

  return `${slug}.com`;
}

/**
 * Return multiple domain candidates for waterfall lookups.
 *
 * Strategy:
 *  1. Full concatenation: "New Heritage Capital" → "newheritagecapital.com"
 *  2. Without common suffixes: strip Partners/Capital/Group/etc → "newheritage.com"
 *  3. Initials: "New Heritage Capital" → "nhc.com"
 */
export function inferDomainCandidates(companyName: string): string[] {
  const candidates: string[] = [];
  const clean = companyName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);

  // 1. Full concatenation
  candidates.push(`${words.join('')}.com`);

  // 2. Without common PE/finance suffixes
  const suffixes = ['partners', 'capital', 'group', 'holdings', 'advisors', 'advisory',
    'management', 'investments', 'equity', 'fund', 'ventures', 'associates', 'llc', 'inc', 'corp'];
  const core = words.filter(w => !suffixes.includes(w));
  if (core.length > 0 && core.length < words.length) {
    candidates.push(`${core.join('')}.com`);
  }

  // 3. Initials (e.g., "New Heritage Capital" → "nhc.com")
  if (words.length >= 2) {
    const initials = words.map(w => w[0]).join('');
    if (initials.length >= 2 && initials.length <= 5) {
      candidates.push(`${initials}.com`);
    }
  }

  // Deduplicate
  return [...new Set(candidates)];
}
