import { describe, it, expect } from 'vitest';

/**
 * Pure business-rule tests for the deal pipeline.
 * No Supabase dependency — tests logic only.
 */

// --------------------------------------------------------------------------
// NDA / Fee Agreement status transitions
// --------------------------------------------------------------------------

type DocumentStatus = 'not_sent' | 'sent' | 'signed' | 'declined';

const VALID_NDA_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  not_sent: ['sent'],
  sent: ['signed', 'declined'],
  signed: [], // Terminal state — cannot go backward
  declined: ['sent'], // Can re-send after decline
};

function isValidNdaTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  return VALID_NDA_TRANSITIONS[from]?.includes(to) ?? false;
}

// Fee agreement follows the same rules
const isValidFeeAgreementTransition = isValidNdaTransition;

describe('NDA status transitions', () => {
  it('not_sent → sent: valid', () => {
    expect(isValidNdaTransition('not_sent', 'sent')).toBe(true);
  });

  it('sent → signed: valid', () => {
    expect(isValidNdaTransition('sent', 'signed')).toBe(true);
  });

  it('sent → declined: valid', () => {
    expect(isValidNdaTransition('sent', 'declined')).toBe(true);
  });

  it('signed → not_sent: INVALID (cannot regress)', () => {
    expect(isValidNdaTransition('signed', 'not_sent')).toBe(false);
  });

  it('signed → sent: INVALID (already signed)', () => {
    expect(isValidNdaTransition('signed', 'sent')).toBe(false);
  });

  it('not_sent → signed: INVALID (must send first)', () => {
    expect(isValidNdaTransition('not_sent', 'signed')).toBe(false);
  });

  it('declined → sent: valid (re-send after decline)', () => {
    expect(isValidNdaTransition('declined', 'sent')).toBe(true);
  });

  it('declined → signed: INVALID (must re-send first)', () => {
    expect(isValidNdaTransition('declined', 'signed')).toBe(false);
  });
});

describe('Fee agreement status transitions', () => {
  it('follows same pattern as NDA', () => {
    expect(isValidFeeAgreementTransition('not_sent', 'sent')).toBe(true);
    expect(isValidFeeAgreementTransition('sent', 'signed')).toBe(true);
    expect(isValidFeeAgreementTransition('sent', 'declined')).toBe(true);
    expect(isValidFeeAgreementTransition('signed', 'not_sent')).toBe(false);
    expect(isValidFeeAgreementTransition('declined', 'sent')).toBe(true);
  });
});

// --------------------------------------------------------------------------
// Deal stage position ordering
// --------------------------------------------------------------------------

describe('Deal stage position order', () => {
  // Typical stage positions
  const stages = [
    { name: 'New Inquiry', position: 1 },
    { name: 'Qualified', position: 2 },
    { name: 'NDA Signed', position: 3 },
    { name: 'Memo Sent', position: 4 },
    { name: 'Meeting', position: 5 },
    { name: 'LOI', position: 6 },
    { name: 'Due Diligence', position: 7 },
    { name: 'Closing', position: 8 },
    { name: 'Closed Won', position: 9 },
    { name: 'Closed Lost', position: 10 },
  ];

  it('stage positions are in ascending order', () => {
    for (let i = 1; i < stages.length; i++) {
      expect(stages[i].position).toBeGreaterThan(stages[i - 1].position);
    }
  });

  it('moving to a lower position number means going backward in pipeline', () => {
    const qualified = stages.find((s) => s.name === 'Qualified')!;
    const loi = stages.find((s) => s.name === 'LOI')!;

    // Forward movement: position increases
    expect(loi.position).toBeGreaterThan(qualified.position);

    // Backward movement: position decreases
    expect(qualified.position).toBeLessThan(loi.position);
  });

  it('Closed Won has highest active position', () => {
    const closedWon = stages.find((s) => s.name === 'Closed Won')!;
    const activeStages = stages.filter((s) => s.name !== 'Closed Won' && s.name !== 'Closed Lost');
    for (const stage of activeStages) {
      expect(closedWon.position).toBeGreaterThan(stage.position);
    }
  });
});

// --------------------------------------------------------------------------
// Pipeline deal title fallback
// --------------------------------------------------------------------------

describe('Pipeline deal title fallback', () => {
  it('uses deal_title when set', async () => {
    const { mapRpcRowToDeal } = await import('@/hooks/admin/deals/useDealsList');
    const deal = mapRpcRowToDeal({
      deal_id: 'd1',
      deal_title: 'Custom Title',
      listing_title: 'Listing Title',
      deal_created_at: '2026-01-01',
      deal_updated_at: '2026-01-01',
      deal_stage_entered_at: '2026-01-01',
    });
    expect(deal.title).toBe('Custom Title');
  });

  it('falls back to listing_title when deal_title is blank', async () => {
    const { mapRpcRowToDeal } = await import('@/hooks/admin/deals/useDealsList');
    const deal = mapRpcRowToDeal({
      deal_id: 'd1',
      deal_title: null,
      listing_title: 'Listing Title',
      deal_created_at: '2026-01-01',
      deal_updated_at: '2026-01-01',
      deal_stage_entered_at: '2026-01-01',
    });
    expect(deal.title).toBe('Listing Title');
  });

  it('falls back to "Deal" when both are blank', async () => {
    const { mapRpcRowToDeal } = await import('@/hooks/admin/deals/useDealsList');
    const deal = mapRpcRowToDeal({
      deal_id: 'd1',
      deal_title: null,
      listing_title: null,
      deal_created_at: '2026-01-01',
      deal_updated_at: '2026-01-01',
      deal_stage_entered_at: '2026-01-01',
    });
    expect(deal.title).toBe('Deal');
  });
});

// --------------------------------------------------------------------------
// Buyer contact resolution priority
// --------------------------------------------------------------------------

describe('Buyer contact resolution priority', () => {
  it('uses profile data when buyer has a registered profile', async () => {
    const { mapRpcRowToDeal } = await import('@/hooks/admin/deals/useDealsList');
    const deal = mapRpcRowToDeal({
      deal_id: 'd1',
      deal_title: 'Test',
      deal_created_at: '2026-01-01',
      deal_updated_at: '2026-01-01',
      deal_stage_entered_at: '2026-01-01',
      buyer_first_name: 'Sarah',
      buyer_last_name: 'Chen',
      buyer_email: 'sarah@profile.com',
      contact_name: 'Anonymous Lead',
      contact_email: 'lead@anon.com',
    });
    expect(deal.buyer_name).toBe('Sarah Chen');
    expect(deal.buyer_email).toBe('sarah@profile.com');
  });

  it('uses lead contact data when buyer has no profile', async () => {
    const { mapRpcRowToDeal } = await import('@/hooks/admin/deals/useDealsList');
    const deal = mapRpcRowToDeal({
      deal_id: 'd1',
      deal_title: 'Test',
      deal_created_at: '2026-01-01',
      deal_updated_at: '2026-01-01',
      deal_stage_entered_at: '2026-01-01',
      buyer_first_name: null,
      buyer_last_name: null,
      contact_name: 'Anonymous Lead',
      contact_email: 'lead@anon.com',
    });
    expect(deal.buyer_name).toBeUndefined();
    expect(deal.contact_name).toBe('Anonymous Lead');
    expect(deal.contact_email).toBe('lead@anon.com');
  });

  it('handles both null gracefully without crashing', async () => {
    const { mapRpcRowToDeal } = await import('@/hooks/admin/deals/useDealsList');
    const deal = mapRpcRowToDeal({
      deal_id: 'd1',
      deal_title: 'Test',
      deal_created_at: '2026-01-01',
      deal_updated_at: '2026-01-01',
      deal_stage_entered_at: '2026-01-01',
      buyer_first_name: null,
      buyer_last_name: null,
      contact_name: null,
      contact_email: null,
    });
    expect(deal.buyer_name).toBeUndefined();
    expect(deal.contact_name).toBeUndefined();
    expect(deal.contact_email).toBeUndefined();
  });
});
