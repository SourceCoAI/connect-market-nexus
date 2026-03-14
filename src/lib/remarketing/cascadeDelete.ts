import { supabase } from '@/integrations/supabase/client';

/**
 * Delete all related records for a universe before deleting the universe
 * Works with buyer_universes table
 */
export async function deleteUniverseWithRelated(
  universeId: string,
): Promise<{ error: Error | null }> {
  try {
    // Get all buyers for this universe
    const { data: buyers, error: buyersError } = await supabase
      .from('buyers')
      .select('id')
      .eq('universe_id', universeId);
    if (buyersError) throw buyersError;

    // Delete all buyer-related records
    if (buyers && buyers.length > 0) {
      const buyerIds = buyers.map((b) => b.id);

      // Archive contacts linked to these buyers in the unified contacts table
      const { error: contactsError } = await supabase
        .from('contacts')
        .update({ archived: true })
        .in('remarketing_buyer_id', buyerIds);
      if (contactsError) throw contactsError;

      // Delete buyer_transcripts
      const { error: transcriptsError } = await supabase.from('buyer_transcripts').delete().in('buyer_id', buyerIds);
      if (transcriptsError) throw transcriptsError;

      // Delete remarketing_scores for all buyers
      const { error: scoresError } = await supabase.from('remarketing_scores').delete().in('buyer_id', buyerIds);
      if (scoresError) throw scoresError;

      // Delete call_intelligence for all buyers
      const { error: callIntelError } = await supabase.from('call_intelligence').delete().in('buyer_id', buyerIds);
      if (callIntelError) throw callIntelError;
    }

    // Delete all buyers from buyers for this universe
    const { error: deleteBuyersError } = await supabase.from('buyers').delete().eq('universe_id', universeId);
    if (deleteBuyersError) throw deleteBuyersError;

    // Delete remarketing_scores for this universe
    const { error: universeScoresError } = await supabase.from('remarketing_scores').delete().eq('universe_id', universeId);
    if (universeScoresError) throw universeScoresError;

    // Finally delete the universe
    const { error } = await supabase.from('buyer_universes').delete().eq('id', universeId);

    if (error) throw error;

    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}
