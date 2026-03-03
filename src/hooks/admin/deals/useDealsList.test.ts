import { describe, it, expect } from 'vitest';
import { mapRpcRowToDeal } from './useDealsList';

/** Helper: creates a full RPC row with all fields populated. */
function fullRpcRow(overrides: Record<string, unknown> = {}) {
  return {
    deal_id: 'deal-001',
    deal_title: 'Acme Acquisition',
    deal_description: 'Acquiring Acme Corp',
    deal_value: 1500000,
    deal_priority: 'high',
    deal_probability: 75,
    deal_expected_close_date: '2026-06-15',
    deal_source: 'inbound',
    deal_created_at: '2026-01-01T00:00:00Z',
    deal_updated_at: '2026-03-01T00:00:00Z',
    deal_stage_entered_at: '2026-02-15T00:00:00Z',

    stage_id: 'stage-qualified',
    stage_name: 'Qualified',
    stage_color: '#22c55e',
    stage_position: 2,

    listing_id: 'listing-001',
    listing_title: 'Acme Corp – HVAC Services',
    listing_revenue: 5000000,
    listing_ebitda: 800000,
    listing_location: 'Dallas, TX',
    listing_category: 'HVAC',
    listing_internal_company_name: 'Acme Corp',
    listing_image_url: 'https://example.com/acme.jpg',
    listing_deal_total_score: 85,
    listing_is_priority_target: true,
    listing_needs_owner_contact: false,
    listing_needs_buyer_search: false,

    // Contact info (sourced from connection_requests via RPC JOIN)
    contact_name: 'John Doe',
    contact_email: 'john@example.com',
    contact_company: 'Doe Ventures',
    contact_phone: '555-1234',
    contact_role: 'Managing Partner',

    // Admin assignment
    admin_id: 'admin-001',
    admin_first_name: 'Jane',
    admin_last_name: 'Smith',
    admin_email: 'jane@sourceco.com',

    // Buyer profile (pre-joined)
    buyer_type: 'corporate',
    buyer_website: 'https://doecapital.com',
    buyer_quality_score: 90,
    buyer_tier: 1,
    buyer_first_name: 'Sarah',
    buyer_last_name: 'Chen',
    buyer_email: 'sarah@doecapital.com',
    buyer_company: 'Doe Capital',
    buyer_phone: '555-5678',

    // Status
    nda_status: 'signed',
    fee_agreement_status: 'sent',
    followed_up: true,
    followed_up_at: '2026-02-20T00:00:00Z',
    negative_followed_up: false,
    negative_followed_up_at: null,
    meeting_scheduled: true,

    connection_request_id: 'cr-001',
    ...overrides,
  };
}

describe('mapRpcRowToDeal', () => {
  describe('basic mapping', () => {
    it('maps all core fields correctly from a fully populated RPC row', () => {
      const row = fullRpcRow();
      const deal = mapRpcRowToDeal(row);

      expect(deal.deal_id).toBe('deal-001');
      expect(deal.title).toBe('Acme Acquisition');
      expect(deal.stage_id).toBe('stage-qualified');
      expect(deal.listing_id).toBe('listing-001');
      expect(deal.nda_status).toBe('signed');
      expect(deal.deal_value).toBe(1500000);
      expect(deal.deal_probability).toBe(75);
    });

    it('maps contact_name from RPC row (sourced from connection_requests, not deal_pipeline column)', () => {
      const deal = mapRpcRowToDeal(fullRpcRow());
      expect(deal.contact_name).toBe('John Doe');
      expect(deal.contact_email).toBe('john@example.com');
    });

    it('concatenates buyer first_name + last_name', () => {
      const deal = mapRpcRowToDeal(fullRpcRow());
      expect(deal.buyer_name).toBe('Sarah Chen');
    });
  });

  describe('anonymous lead (no registered buyer)', () => {
    it('preserves contact_name when buyer_first_name is null', () => {
      const deal = mapRpcRowToDeal(
        fullRpcRow({
          buyer_first_name: null,
          buyer_last_name: null,
          contact_name: 'Anonymous Lead',
        }),
      );
      expect(deal.contact_name).toBe('Anonymous Lead');
      expect(deal.buyer_name).toBeUndefined();
    });

    it('does not produce an empty string for buyer_name', () => {
      const deal = mapRpcRowToDeal(fullRpcRow({ buyer_first_name: null, buyer_last_name: null }));
      expect(deal.buyer_name).toBeUndefined();
    });
  });

  describe('registered buyer (has profile)', () => {
    it('uses buyer profile data for buyer_name and buyer_email', () => {
      const deal = mapRpcRowToDeal(
        fullRpcRow({
          buyer_first_name: 'Sarah',
          buyer_last_name: 'Chen',
          buyer_email: 'sarah@buyer.com',
          contact_email: 'lead@anon.com',
        }),
      );
      expect(deal.buyer_name).toBe('Sarah Chen');
      expect(deal.buyer_email).toBe('sarah@buyer.com');
    });

    it('trims trailing space when buyer_last_name is empty', () => {
      const deal = mapRpcRowToDeal(fullRpcRow({ buyer_first_name: 'Sarah', buyer_last_name: '' }));
      expect(deal.buyer_name).toBe('Sarah');
    });
  });

  describe('null safety — default values', () => {
    it('defaults deal_value to 0', () => {
      expect(mapRpcRowToDeal(fullRpcRow({ deal_value: null })).deal_value).toBe(0);
    });

    it('defaults deal_priority to medium', () => {
      expect(mapRpcRowToDeal(fullRpcRow({ deal_priority: null })).deal_priority).toBe('medium');
    });

    it('defaults deal_probability to 50', () => {
      expect(mapRpcRowToDeal(fullRpcRow({ deal_probability: null })).deal_probability).toBe(50);
    });

    it('defaults nda_status to not_sent', () => {
      expect(mapRpcRowToDeal(fullRpcRow({ nda_status: null })).nda_status).toBe('not_sent');
    });

    it('defaults fee_agreement_status to not_sent', () => {
      expect(mapRpcRowToDeal(fullRpcRow({ fee_agreement_status: null })).fee_agreement_status).toBe(
        'not_sent',
      );
    });

    it('defaults meeting_scheduled to false', () => {
      expect(mapRpcRowToDeal(fullRpcRow({ meeting_scheduled: null })).meeting_scheduled).toBe(
        false,
      );
    });

    it('defaults followed_up to false', () => {
      expect(mapRpcRowToDeal(fullRpcRow({ followed_up: null })).followed_up).toBe(false);
    });
  });

  describe('listing data prefixed correctly', () => {
    it('maps listing_revenue as a number', () => {
      const deal = mapRpcRowToDeal(fullRpcRow({ listing_revenue: 5000000 }));
      expect(deal.listing_revenue).toBe(5000000);
      expect(typeof deal.listing_revenue).toBe('number');
    });

    it('maps listing_ebitda as a number', () => {
      const deal = mapRpcRowToDeal(fullRpcRow({ listing_ebitda: 800000 }));
      expect(deal.listing_ebitda).toBe(800000);
      expect(typeof deal.listing_ebitda).toBe('number');
    });

    it('maps listing_internal_company_name to listing_real_company_name', () => {
      const deal = mapRpcRowToDeal(fullRpcRow({ listing_internal_company_name: 'Secret Corp' }));
      expect(deal.listing_real_company_name).toBe('Secret Corp');
    });

    it('defaults listing_revenue and listing_ebitda to 0 when null', () => {
      const deal = mapRpcRowToDeal(fullRpcRow({ listing_revenue: null, listing_ebitda: null }));
      expect(deal.listing_revenue).toBe(0);
      expect(deal.listing_ebitda).toBe(0);
    });
  });

  describe('title fallback chain', () => {
    it('uses deal_title when set', () => {
      const deal = mapRpcRowToDeal(fullRpcRow({ deal_title: 'My Deal' }));
      expect(deal.title).toBe('My Deal');
    });

    it('falls back to listing_title when deal_title is null', () => {
      const deal = mapRpcRowToDeal(
        fullRpcRow({ deal_title: null, listing_title: 'Listing Title' }),
      );
      expect(deal.title).toBe('Listing Title');
    });

    it('falls back to "Deal" when both are null', () => {
      const deal = mapRpcRowToDeal(fullRpcRow({ deal_title: null, listing_title: null }));
      expect(deal.title).toBe('Deal');
    });

    it('falls back to "Deal" when both are empty strings', () => {
      const deal = mapRpcRowToDeal(fullRpcRow({ deal_title: '', listing_title: '' }));
      expect(deal.title).toBe('Deal');
    });
  });

  describe('Deal type does NOT have direct contact columns from deal_pipeline table', () => {
    it('does not have company_address field (compile-time canary)', () => {
      const deal = mapRpcRowToDeal(fullRpcRow());
      // company_address was dropped from deal_pipeline — it must not appear on the mapped Deal
      expect('company_address' in deal).toBe(false);
    });

    it('does not have contact_title field (dropped column)', () => {
      const deal = mapRpcRowToDeal(fullRpcRow());
      expect('contact_title' in deal).toBe(false);
    });
  });
});
