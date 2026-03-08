/**
 * CTO-Level Audit: Tests for client-side match scoring (marketplace buyer-deal matching).
 */
import { describe, it, expect } from 'vitest';
import { computeMatchScore, extractBuyerCriteria, getMatchBadge } from './match-scoring';
import type { Listing, User } from '@/types';

// Helper to create a minimal listing with all required fields
function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: '1',
    title: 'Test Company',
    category: 'HVAC',
    categories: ['HVAC'],
    location: 'Texas',
    revenue: 5_000_000,
    ebitda: 1_000_000,
    acquisition_type: 'add_on',
    description: 'Test company description',
    tags: [],
    status: 'active' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Listing;
}

describe('computeMatchScore()', () => {
  it('returns max score for perfect match', () => {
    const listing = makeListing({
      category: 'HVAC',
      categories: ['HVAC'],
      location: 'Texas',
      revenue: 5_000_000,
      ebitda: 1_000_000,
      acquisition_type: 'add_on',
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    });
    const result = computeMatchScore(
      listing,
      ['HVAC'],
      ['Texas'],
      1_000_000,
      10_000_000,
      500_000,
      5_000_000,
      'add_on',
    );
    // 3 (cat) + 2 (loc) + 2 (rev) + 2 (ebitda) + 1 (acq) + 1 (recency) = 11
    // percentage = min(11/10 * 100, 100) = 100
    expect(result.percentage).toBe(100);
    expect(result.reasons.filter((r) => r.matched).length).toBeGreaterThanOrEqual(4);
  });

  it('returns 0 for no criteria at all (excluding recency)', () => {
    const listing = makeListing({
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // old listing
    });
    const result = computeMatchScore(listing, [], [], null, null, null, null, null);
    expect(result.score).toBe(0);
    expect(result.percentage).toBe(0);
  });

  it('scores category match correctly (3 pts)', () => {
    const listing = makeListing({
      category: 'HVAC',
      categories: ['HVAC'],
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // old
    });
    const result = computeMatchScore(listing, ['HVAC'], [], null, null, null, null, null);
    expect(result.score).toBe(3);
    expect(result.reasons[0].matched).toBe(true);
    expect(result.reasons[0].type).toBe('sector');
  });

  it('handles case-insensitive category match', () => {
    const listing = makeListing({
      category: 'HVAC',
      categories: ['HVAC'],
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const result = computeMatchScore(listing, ['hvac'], [], null, null, null, null, null);
    expect(result.score).toBe(3);
  });

  it('scores location match correctly (2 pts)', () => {
    const listing = makeListing({
      location: 'Houston, Texas',
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const result = computeMatchScore(listing, [], ['Texas'], null, null, null, null, null);
    expect(result.score).toBe(2);
  });

  it('scores revenue in range (2 pts)', () => {
    const listing = makeListing({
      revenue: 5_000_000,
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const result = computeMatchScore(listing, [], [], 1_000_000, 10_000_000, null, null, null);
    expect(result.score).toBe(2);
    expect(result.reasons.find((r) => r.label === 'Revenue fit')?.matched).toBe(true);
  });

  it('marks revenue out of range', () => {
    const listing = makeListing({ revenue: 50_000_000 });
    const result = computeMatchScore(listing, [], [], 1_000_000, 10_000_000, null, null, null);
    expect(result.reasons.find((r) => r.label === 'Revenue')?.matched).toBe(false);
  });

  it('scores EBITDA in range (2 pts)', () => {
    const listing = makeListing({
      ebitda: 1_000_000,
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const result = computeMatchScore(listing, [], [], null, null, 500_000, 5_000_000, null);
    expect(result.score).toBe(2);
  });

  it('scores acquisition type match (1 pt)', () => {
    const listing = makeListing({
      acquisition_type: 'add_on',
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const result = computeMatchScore(listing, [], [], null, null, null, null, 'add_on');
    expect(result.score).toBe(1);
  });

  it('scores "either" deal intent as matching any type', () => {
    const listing = makeListing({
      acquisition_type: 'platform',
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const result = computeMatchScore(listing, [], [], null, null, null, null, 'either');
    expect(result.score).toBe(1);
  });

  it('adds recency boost for new listings (< 7 days)', () => {
    const listing = makeListing({
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const result = computeMatchScore(listing, ['HVAC'], [], null, null, null, null, null);
    expect(result.score).toBe(4); // 3 (cat) + 1 (recency)
  });

  it('adds partial recency boost for listings 7-14 days old', () => {
    const listing = makeListing({
      created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const result = computeMatchScore(listing, ['HVAC'], [], null, null, null, null, null);
    expect(result.score).toBe(3.5); // 3 (cat) + 0.5 (recency)
  });

  it('no recency boost for old listings', () => {
    const listing = makeListing({
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const result = computeMatchScore(listing, ['HVAC'], [], null, null, null, null, null);
    expect(result.score).toBe(3); // 3 (cat) only
  });

  it('percentage caps at 100', () => {
    const listing = makeListing({
      category: 'HVAC',
      categories: ['HVAC'],
      location: 'Texas',
      revenue: 5_000_000,
      ebitda: 1_000_000,
      acquisition_type: 'add-on',
      created_at: new Date().toISOString(), // just created
    });
    const result = computeMatchScore(
      listing,
      ['HVAC'],
      ['Texas'],
      1_000_000,
      10_000_000,
      500_000,
      5_000_000,
      'add-on',
    );
    expect(result.percentage).toBeLessThanOrEqual(100);
  });
});

describe('extractBuyerCriteria()', () => {
  it('returns empty criteria for null user', () => {
    const criteria = extractBuyerCriteria(null);
    expect(criteria.buyerCategories).toEqual([]);
    expect(criteria.criteriaCount).toBe(0);
  });

  it('extracts categories from user profile', () => {
    const user = { business_categories: ['HVAC', 'Plumbing'] } as unknown as User;
    const criteria = extractBuyerCriteria(user);
    expect(criteria.buyerCategories).toEqual(['HVAC', 'Plumbing']);
  });

  it('counts criteria correctly', () => {
    const user = {
      business_categories: ['HVAC'],
      target_locations: ['Texas'],
      revenue_range_min: 1_000_000,
      ebitda_min: 500_000,
      deal_intent: 'add-on',
    } as unknown as User;
    const criteria = extractBuyerCriteria(user);
    expect(criteria.criteriaCount).toBe(5);
  });
});

describe('getMatchBadge()', () => {
  it('returns Strong Match for 80+', () => {
    const badge = getMatchBadge(85);
    expect(badge?.label).toBe('Strong Match');
  });

  it('returns Good Match for 60-79', () => {
    const badge = getMatchBadge(65);
    expect(badge?.label).toBe('Good Match');
  });

  it('returns Partial Match for 40-59', () => {
    const badge = getMatchBadge(45);
    expect(badge?.label).toBe('Partial Match');
  });

  it('returns null for <40', () => {
    const badge = getMatchBadge(30);
    expect(badge).toBeNull();
  });
});
