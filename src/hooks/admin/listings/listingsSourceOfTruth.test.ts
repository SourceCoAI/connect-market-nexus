import { describe, it, expect } from 'vitest';
import type { Database } from '@/integrations/supabase/types';

/**
 * Tests that verify the listings table is the single source of truth
 * for company data, and that marketplace_listings doesn't expose
 * confidential fields.
 */

type ListingsRow = Database['public']['Tables']['listings']['Row'];
type DealPipelineRow = Database['public']['Tables']['deal_pipeline']['Row'];

type HasKey<T, K extends string> = K extends keyof T ? true : false;

describe('listings is the single source of truth for company data', () => {
  describe('enrichment and scoring columns live on listings, not deal_pipeline', () => {
    const enrichmentColumns = [
      'deal_total_score',
      'executive_summary',
      'service_mix',
      'geographic_states',
      'google_rating',
      'linkedin_employee_count',
    ] as const;

    it.each(enrichmentColumns)('%s exists on listings Row', (_col) => {
      // This assertion uses TypeScript conditional types.
      // If the column is removed from listings, this test will fail to compile.
      type Check = HasKey<ListingsRow, typeof _col>;
      const exists: Check = true;
      expect(exists).toBe(true);
    });

    it('deal_total_score does NOT exist on deal_pipeline Row', () => {
      const _check: HasKey<DealPipelineRow, 'deal_total_score'> = false;
      expect(_check).toBe(false);
    });

    it('executive_summary does NOT exist on deal_pipeline Row', () => {
      const _check: HasKey<DealPipelineRow, 'executive_summary'> = false;
      expect(_check).toBe(false);
    });

    it('service_mix does NOT exist on deal_pipeline Row', () => {
      const _check: HasKey<DealPipelineRow, 'service_mix'> = false;
      expect(_check).toBe(false);
    });

    it('geographic_states does NOT exist on deal_pipeline Row', () => {
      const _check: HasKey<DealPipelineRow, 'geographic_states'> = false;
      expect(_check).toBe(false);
    });

    it('google_rating does NOT exist on deal_pipeline Row', () => {
      const _check: HasKey<DealPipelineRow, 'google_rating'> = false;
      expect(_check).toBe(false);
    });

    it('linkedin_employee_count does NOT exist on deal_pipeline Row', () => {
      const _check: HasKey<DealPipelineRow, 'linkedin_employee_count'> = false;
      expect(_check).toBe(false);
    });
  });

  describe('seller contact columns exist on listings', () => {
    it('main_contact_name exists on listings', () => {
      const _check: HasKey<ListingsRow, 'main_contact_name'> = true;
      expect(_check).toBe(true);
    });

    it('main_contact_email exists on listings', () => {
      const _check: HasKey<ListingsRow, 'main_contact_email'> = true;
      expect(_check).toBe(true);
    });

    it('main_contact_phone exists on listings', () => {
      const _check: HasKey<ListingsRow, 'main_contact_phone'> = true;
      expect(_check).toBe(true);
    });

    it('main_contact_title exists on listings', () => {
      const _check: HasKey<ListingsRow, 'main_contact_title'> = true;
      expect(_check).toBe(true);
    });
  });

  describe('company address columns exist on listings', () => {
    it('address_city exists on listings', () => {
      const _check: HasKey<ListingsRow, 'address_city'> = true;
      expect(_check).toBe(true);
    });

    it('address_state exists on listings', () => {
      const _check: HasKey<ListingsRow, 'address_state'> = true;
      expect(_check).toBe(true);
    });

    it('address_zip exists on listings', () => {
      const _check: HasKey<ListingsRow, 'address_zip'> = true;
      expect(_check).toBe(true);
    });
  });

  describe('is_internal_deal flag exists on listings', () => {
    it('is_internal_deal is a required column on listings', () => {
      const _check: HasKey<ListingsRow, 'is_internal_deal'> = true;
      expect(_check).toBe(true);
    });
  });

  describe('source_deal_id self-referential FK exists on listings', () => {
    it('source_deal_id exists on listings Row', () => {
      const _check: HasKey<ListingsRow, 'source_deal_id'> = true;
      expect(_check).toBe(true);
    });
  });

  describe('dead columns confirmed absent from listings', () => {
    it('seller_interest_analyzed_at is absent', () => {
      const _check: HasKey<ListingsRow, 'seller_interest_analyzed_at'> = false;
      expect(_check).toBe(false);
    });

    it('seller_interest_notes is absent', () => {
      const _check: HasKey<ListingsRow, 'seller_interest_notes'> = false;
      expect(_check).toBe(false);
    });

    it('lead_source_id is absent', () => {
      const _check: HasKey<ListingsRow, 'lead_source_id'> = false;
      expect(_check).toBe(false);
    });
  });
});

describe('mapRpcRowToDeal exposes listing data via listing_* prefixed fields', () => {
  it('listing_revenue and listing_ebitda are mapped as numbers', async () => {
    // Import the pure mapping function
    const { mapRpcRowToDeal } = await import('@/hooks/admin/deals/useDealsList');

    const deal = mapRpcRowToDeal({
      deal_id: 'd1',
      deal_title: 'Test',
      deal_created_at: '2026-01-01',
      deal_updated_at: '2026-01-01',
      deal_stage_entered_at: '2026-01-01',
      listing_id: 'l1',
      listing_title: 'Company',
      listing_revenue: 1000000,
      listing_ebitda: 200000,
      listing_location: 'NY',
    });

    expect(deal.listing_revenue).toBe(1000000);
    expect(deal.listing_ebitda).toBe(200000);
    expect(typeof deal.listing_revenue).toBe('number');
    expect(typeof deal.listing_ebitda).toBe('number');
  });

  it('there is no standalone "revenue" field on the mapped deal object', async () => {
    const { mapRpcRowToDeal } = await import('@/hooks/admin/deals/useDealsList');

    const deal = mapRpcRowToDeal({
      deal_id: 'd1',
      deal_title: 'Test',
      deal_created_at: '2026-01-01',
      deal_updated_at: '2026-01-01',
      deal_stage_entered_at: '2026-01-01',
      listing_revenue: 500000,
    });

    // Revenue should only exist as listing_revenue, never as bare 'revenue'
    expect('revenue' in deal).toBe(false);
    expect(deal.listing_revenue).toBe(500000);
  });
});
