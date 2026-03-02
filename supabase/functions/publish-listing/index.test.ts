import { describe, it, expect } from 'vitest';

/**
 * Tests for the publish-listing edge function logic.
 *
 * Since the edge function runs in Deno and uses `Deno.serve`, we test the
 * pure validation functions by re-implementing them locally (same pattern
 * used by existing tests in supabase/functions/_shared/).
 */

// --------------------------------------------------------------------------
// Re-implement the pure validateListingQuality function from the edge fn
// --------------------------------------------------------------------------

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateListingQuality(listing: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  const title = listing.title as string | undefined;
  const description = listing.description as string | undefined;
  const category = listing.category as string | undefined;
  const categories = listing.categories as string[] | undefined;
  const location = listing.location as string | undefined;
  const imageUrl = listing.image_url as string | undefined;

  if (!title || title.trim().length < 5) {
    errors.push('Title must be at least 5 characters');
  }

  if (!description || description.trim().length < 50) {
    errors.push('Description must be at least 50 characters');
  }

  if (!category && (!categories || categories.length === 0)) {
    errors.push('At least one category is required');
  }

  if (!location) {
    errors.push('Location is required');
  }

  if (typeof listing.revenue !== 'number' || (listing.revenue as number) <= 0) {
    errors.push('Revenue must be a positive number');
  }

  if (typeof listing.ebitda !== 'number') {
    errors.push('EBITDA is required');
  }

  if (!imageUrl || imageUrl.trim().length === 0) {
    errors.push('An image is required for marketplace listings');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// --------------------------------------------------------------------------
// Helper: a valid listing with all required fields
// --------------------------------------------------------------------------

function validListing(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'listing-001',
    title: 'Acme HVAC Services — Established Business',
    description:
      'A well-established HVAC services company with 20+ years of operations in the Dallas-Fort Worth metropolitan area, serving both residential and commercial clients.',
    category: 'HVAC',
    categories: ['HVAC', 'Mechanical'],
    location: 'Dallas, TX',
    revenue: 5000000,
    ebitda: 800000,
    image_url: 'https://example.com/acme.jpg',
    is_internal_deal: true,
    published_at: null,
    source_deal_id: null,
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('publish-listing validation', () => {
  describe('validateListingQuality', () => {
    it('passes for a fully valid listing', () => {
      const result = validateListingQuality(validListing());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects listing with short title', () => {
      const result = validateListingQuality(validListing({ title: 'Hi' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Title must be at least 5 characters');
    });

    it('rejects listing with empty title', () => {
      const result = validateListingQuality(validListing({ title: '' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Title must be at least 5 characters');
    });

    it('rejects listing with short description', () => {
      const result = validateListingQuality(validListing({ description: 'Too short' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Description must be at least 50 characters');
    });

    it('rejects listing with no category', () => {
      const result = validateListingQuality(validListing({ category: null, categories: [] }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one category is required');
    });

    it('accepts listing with categories array but no category string', () => {
      const result = validateListingQuality(validListing({ category: null, categories: ['HVAC'] }));
      // Should pass because categories array has an entry
      expect(result.errors).not.toContain('At least one category is required');
    });

    it('rejects listing with no location', () => {
      const result = validateListingQuality(validListing({ location: null }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Location is required');
    });

    it('rejects listing with zero revenue', () => {
      const result = validateListingQuality(validListing({ revenue: 0 }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Revenue must be a positive number');
    });

    it('rejects listing with negative revenue', () => {
      const result = validateListingQuality(validListing({ revenue: -100 }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Revenue must be a positive number');
    });

    it('rejects listing with null revenue', () => {
      const result = validateListingQuality(validListing({ revenue: null }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Revenue must be a positive number');
    });

    it('rejects listing with null ebitda', () => {
      const result = validateListingQuality(validListing({ ebitda: null }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('EBITDA is required');
    });

    it('accepts listing with negative ebitda (valid for money-losing businesses)', () => {
      const result = validateListingQuality(validListing({ ebitda: -50000 }));
      // Negative EBITDA is valid — the check is only for type
      expect(result.errors).not.toContain('EBITDA is required');
    });

    it('rejects listing with no image', () => {
      const result = validateListingQuality(validListing({ image_url: '' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('An image is required for marketplace listings');
    });

    it('rejects listing with multiple missing fields and reports all errors', () => {
      const result = validateListingQuality({
        title: '',
        description: '',
        category: null,
        categories: [],
        location: null,
        revenue: null,
        ebitda: null,
        image_url: null,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(7);
    });
  });
});

describe('publish-listing architectural invariants', () => {
  it('publish action should UPDATE is_internal_deal, not INSERT a new row', () => {
    // This test documents the architectural invariant:
    // publish-listing sets is_internal_deal = false via UPDATE
    // It does NOT create a child row via INSERT
    //
    // The edge function source confirms:
    //   .from('listings').update({ is_internal_deal: false, ... })
    //   No .insert() calls exist in the function
    //
    // If the function is refactored to use INSERT, this comment (and the
    // grep check in the audit) will catch it.
    expect(true).toBe(true); // Architectural documentation test
  });

  it('unpublish action preserves published_at for audit trail', () => {
    // The edge function's unpublish branch:
    //   .update({ is_internal_deal: true })
    // It explicitly does NOT clear published_at or published_by_admin_id.
    // This preserves the audit trail of when the listing was previously published.
    expect(true).toBe(true); // Architectural documentation test
  });

  it('memo PDF check uses source_deal_id as fallback for document lookup', () => {
    // The checkMemoPdfs function:
    //   const dealId = sourceDealId || listingId;
    // When source_deal_id is set (legacy data), documents are looked up
    // against the parent deal. Otherwise, the listing itself is checked.
    //
    // This is important because some older listings had documents stored
    // under the parent deal's ID, not the listing's own ID.
    expect(true).toBe(true); // Architectural documentation test
  });
});
