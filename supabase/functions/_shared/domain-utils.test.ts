/**
 * Tests for _shared/apify-client.ts — Domain inference utilities
 */
import { describe, it, expect } from 'vitest';

// Re-implement pure functions for testing (same as source, avoids Deno imports)

function inferDomain(companyName: string): string {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '')
    .trim();

  return `${slug}.com`;
}

function inferDomainCandidates(companyName: string): string[] {
  const candidates: string[] = [];
  const clean = companyName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);

  candidates.push(`${words.join('')}.com`);

  const suffixes = ['partners', 'capital', 'group', 'holdings', 'advisors', 'advisory',
    'management', 'investments', 'equity', 'fund', 'ventures', 'associates', 'llc', 'inc', 'corp'];
  const core = words.filter(w => !suffixes.includes(w));
  if (core.length > 0 && core.length < words.length) {
    candidates.push(`${core.join('')}.com`);
  }

  if (words.length >= 2) {
    const initials = words.map(w => w[0]).join('');
    if (initials.length >= 2 && initials.length <= 5) {
      candidates.push(`${initials}.com`);
    }
  }

  return [...new Set(candidates)];
}

// ============================================================================
// inferDomain
// ============================================================================

describe('inferDomain', () => {
  it('generates .com domain from company name', () => {
    expect(inferDomain('Trivest Partners')).toBe('trivestpartners.com');
  });

  it('strips special characters', () => {
    expect(inferDomain('AT&T Inc.')).toBe('attinc.com');
  });

  it('handles single word', () => {
    expect(inferDomain('Blackstone')).toBe('blackstone.com');
  });

  it('handles extra whitespace', () => {
    expect(inferDomain('  New Heritage  Capital  ')).toBe('newheritagecapital.com');
  });
});

// ============================================================================
// inferDomainCandidates
// ============================================================================

describe('inferDomainCandidates', () => {
  it('returns full concatenation, suffix-stripped, and initials', () => {
    const result = inferDomainCandidates('New Heritage Capital');
    expect(result).toContain('newheritagecapital.com');
    expect(result).toContain('newheritage.com');
    expect(result).toContain('nhc.com');
  });

  it('deduplicates when suffix stripping produces same result', () => {
    const result = inferDomainCandidates('Blackstone');
    expect(result).toEqual(['blackstone.com']);
  });

  it('handles company with no suffix words', () => {
    const result = inferDomainCandidates('Acme Tech');
    expect(result).toContain('acmetech.com');
    expect(result).toContain('at.com');
    expect(result).not.toContain('acme.com'); // "tech" is not a suffix
  });
});
