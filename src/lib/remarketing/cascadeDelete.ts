import { supabase } from "@/integrations/supabase/client";

/**
 * Delete all related records for a universe before deleting the universe
 * Works with remarketing_buyer_universes table
 */
export async function deleteUniverseWithRelated(universeId: string): Promise<{ error: Error | null }> {
  try {
    // Get all buyers for this universe
    const { data: buyers, error: buyersError } = await supabase
      .from("remarketing_buyers")
      .select("id")
      .eq("universe_id", universeId);
    if (buyersError) throw buyersError;

    // Delete all buyer-related records
    if (buyers && buyers.length > 0) {
      const buyerIds = buyers.map(b => b.id);

      // Archive contacts linked to these buyers in the unified contacts table
      await supabase.from("contacts").update({ archived: true }).in("remarketing_buyer_id", buyerIds);

      // Delete buyer_transcripts
      await supabase.from("buyer_transcripts").delete().in("buyer_id", buyerIds);

      // Delete remarketing_scores for all buyers
      await supabase.from("remarketing_scores").delete().in("buyer_id", buyerIds);

      // Delete call_intelligence for all buyers
      await supabase.from("call_intelligence").delete().in("buyer_id", buyerIds);
    }

    // Delete all buyers from remarketing_buyers for this universe
    await supabase.from("remarketing_buyers").delete().eq("universe_id", universeId);

    // Delete remarketing_scores for this universe
    await supabase.from("remarketing_scores").delete().eq("universe_id", universeId);

    // Finally delete the universe
    const { error } = await supabase.from("remarketing_buyer_universes").delete().eq("id", universeId);

    if (error) throw error;

    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}
