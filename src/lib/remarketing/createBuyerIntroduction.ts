/**
 * createBuyerIntroduction.ts
 *
 * Creates a buyer_introduction record when a buyer is approved from the
 * buyer universe or deal matching page.  The new record lands in the first
 * Kanban stage ("Buyers to Introduce" / need_to_show_deal) on the deal
 * tab's introduction pipeline.
 *
 * Deduplicates by (remarketing_buyer_id, listing_id) so that approving the
 * same buyer twice for the same deal is a safe no-op.
 */
import { supabase } from '@/integrations/supabase/client';

interface CreateBuyerIntroductionParams {
  /** The remarketing buyer ID (from the `buyers` table) */
  buyerId: string;
  /** The listing/deal to associate the introduction with */
  listingId: string;
  /** The authenticated user performing the approval */
  userId: string;
}

/**
 * Fetches buyer details and inserts a buyer_introduction record at the first
 * Kanban stage.  Returns the new record id, or null if the introduction
 * already exists or the buyer cannot be found.
 */
export async function createBuyerIntroductionFromApproval({
  buyerId,
  listingId,
  userId,
}: CreateBuyerIntroductionParams): Promise<string | null> {
  try {
    // Check for existing introduction for this buyer + listing (dedup)
    const { data: existing } = await supabase
      .from('buyer_introductions' as never)
      .select('id')
      .eq('remarketing_buyer_id', buyerId)
      .eq('listing_id', listingId)
      .is('archived_at', null)
      .limit(1);

    if (existing && existing.length > 0) {
      // Already has an introduction — skip
      return (existing[0] as { id: string }).id;
    }

    // Fetch buyer details
    const { data: buyer, error: buyerError } = await supabase
      .from('buyers')
      .select(
        'id, company_name, pe_firm_name, company_website, hq_city, hq_state, buyer_type, is_pe_backed, has_fee_agreement, alignment_score, alignment_reasoning',
      )
      .eq('id', buyerId)
      .single();

    if (buyerError || !buyer) {
      console.error('Failed to fetch buyer for introduction creation:', buyerError);
      return null;
    }

    // Create the buyer_introduction at the first Kanban stage
    const { data: intro, error: introError } = await supabase
      .from('buyer_introductions' as never)
      .insert({
        remarketing_buyer_id: buyerId,
        buyer_name: buyer.company_name || 'Unknown',
        buyer_firm_name: buyer.pe_firm_name || buyer.company_name || 'Unknown',
        listing_id: listingId,
        company_name: buyer.company_name || 'Unknown',
        introduction_status: 'need_to_show_deal',
        targeting_reason: buyer.alignment_reasoning || null,
        score_snapshot: {
          composite_score: buyer.alignment_score || 0,
          hq_city: buyer.hq_city,
          hq_state: buyer.hq_state,
          buyer_type: buyer.buyer_type,
          has_fee_agreement: buyer.has_fee_agreement || false,
          pe_firm_name: buyer.pe_firm_name,
          company_website: buyer.company_website,
          is_pe_backed: buyer.is_pe_backed || false,
        },
        created_by: userId,
      } as never)
      .select('id')
      .single();

    if (introError) {
      console.error('Failed to create buyer introduction:', introError);
      return null;
    }

    return (intro as { id: string } | null)?.id || null;
  } catch (error) {
    console.error('Unexpected error creating buyer introduction:', error);
    return null;
  }
}

/**
 * Batch-creates buyer introductions for multiple buyer-deal pairs.
 * Non-blocking — failures are logged but do not throw.
 */
export async function batchCreateBuyerIntroductions(
  pairs: Array<{ buyerId: string; listingId: string }>,
  userId: string,
): Promise<void> {
  for (const { buyerId, listingId } of pairs) {
    await createBuyerIntroductionFromApproval({ buyerId, listingId, userId });
  }
}
