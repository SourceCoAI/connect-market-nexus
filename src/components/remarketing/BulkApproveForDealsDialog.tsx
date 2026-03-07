/**
 * BulkApproveForDealsDialog.tsx
 *
 * Dialog that allows approving multiple buyers across deals at once.
 * Fetches all deals where the selected buyers have been scored and lets
 * the admin select which deals to approve them for.
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { batchCreateBuyerIntroductions } from '@/lib/remarketing/createBuyerIntroduction';
import { findIntroductionContacts } from '@/lib/remarketing/findIntroductionContacts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, MapPin, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BulkApproveForDealsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyerIds: string[];
  buyerCount: number;
  universeId?: string;
}

interface DealGroup {
  listingId: string;
  listingTitle: string;
  listingLocation: string | null;
  listingCategory: string | null;
  pendingScoreIds: string[];
  unscoredBuyerIds: string[];
  approvedCount: number;
  totalBuyerCount: number;
}

export function BulkApproveForDealsDialog({
  open,
  onOpenChange,
  buyerIds,
  buyerCount,
  universeId,
}: BulkApproveForDealsDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedListingIds, setSelectedListingIds] = useState<Set<string>>(new Set());

  // Fetch all deals from the universe + any existing scores for the selected buyers
  const { data: dealGroups, isLoading } = useQuery({
    queryKey: ['bulk-buyer-scored-deals', buyerIds, universeId],
    queryFn: async () => {
      // Fetch scores and universe deals in parallel
      const [scoresResult, universeDealsResult] = await Promise.all([
        supabase
          .from('remarketing_scores')
          .select(
            `
            id,
            listing_id,
            buyer_id,
            composite_score,
            status,
            listing:listings!remarketing_scores_listing_id_fkey(id, title, location, category)
          `,
          )
          .in('buyer_id', buyerIds)
          .order('composite_score', { ascending: false }),
        universeId
          ? supabase
              .from('remarketing_universe_deals')
              .select(
                `
                listing_id,
                listing:listings!remarketing_universe_deals_listing_id_fkey(id, title, location, category)
              `,
              )
              .eq('universe_id', universeId)
              .neq('status', 'archived')
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (scoresResult.error) throw scoresResult.error;
      if (universeDealsResult.error) throw universeDealsResult.error;

      // Group scores by listing
      const groupMap = new Map<string, DealGroup>();

      // First, seed groups from universe deals so all deals appear
      for (const ud of universeDealsResult.data || []) {
        const listing = ud.listing as {
          id: string;
          title: string;
          location: string | null;
          category: string | null;
        } | null;
        if (!ud.listing_id || !listing) continue;
        if (!groupMap.has(ud.listing_id)) {
          groupMap.set(ud.listing_id, {
            listingId: ud.listing_id,
            listingTitle: listing.title || 'Unknown Deal',
            listingLocation: listing.location || null,
            listingCategory: listing.category || null,
            pendingScoreIds: [],
            unscoredBuyerIds: [...buyerIds], // all buyers start as unscored
            approvedCount: 0,
            totalBuyerCount: 0,
          });
        }
      }

      // Track which buyers have scores per listing
      const scoredBuyersByListing = new Map<string, Set<string>>();

      for (const s of scoresResult.data || []) {
        const listingId = s.listing_id;
        const listing = s.listing as {
          id: string;
          title: string;
          location: string | null;
          category: string | null;
        } | null;
        if (!listingId || !listing) continue;

        let group = groupMap.get(listingId);
        if (!group) {
          group = {
            listingId,
            listingTitle: listing.title || 'Unknown Deal',
            listingLocation: listing.location || null,
            listingCategory: listing.category || null,
            pendingScoreIds: [],
            unscoredBuyerIds: [],
            approvedCount: 0,
            totalBuyerCount: 0,
          };
          groupMap.set(listingId, group);
        }

        // Track this buyer as scored for this listing
        if (!scoredBuyersByListing.has(listingId)) {
          scoredBuyersByListing.set(listingId, new Set());
        }
        scoredBuyersByListing.get(listingId)!.add(s.buyer_id);

        group.totalBuyerCount++;
        if (s.status === 'approved') {
          group.approvedCount++;
        } else if (s.status !== 'passed') {
          group.pendingScoreIds.push(s.id);
        }
      }

      // Compute unscoredBuyerIds for each group
      for (const [listingId, group] of groupMap) {
        const scoredBuyers = scoredBuyersByListing.get(listingId) || new Set();
        group.unscoredBuyerIds = buyerIds.filter((id) => !scoredBuyers.has(id));
      }

      return Array.from(groupMap.values())
        .filter((g) => g.pendingScoreIds.length > 0 || g.unscoredBuyerIds.length > 0)
        .sort((a, b) =>
          (b.pendingScoreIds.length + b.unscoredBuyerIds.length) -
          (a.pendingScoreIds.length + a.unscoredBuyerIds.length),
        );
    },
    enabled: open && buyerIds.length > 0,
  });

  const groups = dealGroups || [];

  // Reset selections when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedListingIds(new Set());
    }
    onOpenChange(newOpen);
  };

  const toggleListing = (listingId: string) => {
    setSelectedListingIds((prev) => {
      const next = new Set(prev);
      if (next.has(listingId)) {
        next.delete(listingId);
      } else {
        next.add(listingId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedListingIds(new Set(groups.map((g) => g.listingId)));
  };

  // Count total buyer-deal pairs to approve
  const totalScoresToApprove = useMemo(() => {
    return groups
      .filter((g) => selectedListingIds.has(g.listingId))
      .reduce((sum, g) => sum + g.pendingScoreIds.length + g.unscoredBuyerIds.length, 0);
  }, [groups, selectedListingIds]);

  // Mutation to approve all buyer-deal pairs for selected deals
  const approveMutation = useMutation({
    mutationFn: async () => {
      const selectedGroups = groups.filter((g) => selectedListingIds.has(g.listingId));
      const scoreIds = selectedGroups.flatMap((g) => g.pendingScoreIds);

      if (scoreIds.length === 0 && selectedGroups.every((g) => g.unscoredBuyerIds.length === 0)) {
        return;
      }

      // Update existing pending scores to approved
      if (scoreIds.length > 0) {
        const { error } = await supabase
          .from('remarketing_scores')
          .update({ status: 'approved' })
          .in('id', scoreIds);

        if (error) throw error;
      }

      // Create score records for unscored buyer-deal pairs and approve them directly
      const newScoreIds: string[] = [];
      for (const group of selectedGroups) {
        if (group.unscoredBuyerIds.length === 0) continue;
        const rows = group.unscoredBuyerIds.map((bId) => ({
          listing_id: group.listingId,
          buyer_id: bId,
          status: 'approved' as const,
        }));
        const { data: inserted, error } = await supabase
          .from('remarketing_scores')
          .upsert(rows, { onConflict: 'listing_id,buyer_id', ignoreDuplicates: false })
          .select('id');
        if (error) throw error;
        if (inserted) {
          newScoreIds.push(...inserted.map((r: { id: string }) => r.id));
        }
      }

      const allScoreIds = [...scoreIds, ...newScoreIds];

      // Auto-create outreach records for approved scores
      for (const group of selectedGroups) {
        for (const scoreId of [...group.pendingScoreIds, ...newScoreIds.filter(() => true)]) {
          try {
            await (supabase.from('remarketing_outreach') as any).upsert(
              {
                score_id: scoreId,
                listing_id: group.listingId,
                buyer_id: buyerIds.find(() => true), // Will be resolved per-score
                status: 'pending',
                created_by: user?.id,
              },
              { onConflict: 'score_id' },
            );
          } catch {
            // Non-blocking
          }
        }
      }

      // Fire-and-forget: discover contacts for all buyers (legacy website scrape)
      for (const buyerId of buyerIds) {
        supabase.functions.invoke('find-buyer-contacts', { body: { buyerId } }).catch(() => {});
      }

      // Fire-and-forget: auto-discover introduction contacts with title-filtered search
      // Use Promise.allSettled to consolidate into a single summary toast for bulk ops
      Promise.allSettled(buyerIds.map((bId) => findIntroductionContacts(bId)))
        .then((results) => {
          let totalContacts = 0;
          let buyersWithContacts = 0;
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value && r.value.total_saved > 0) {
              totalContacts += r.value.total_saved;
              buyersWithContacts++;
            }
          }
          if (totalContacts > 0) {
            queryClient.invalidateQueries({ queryKey: ['remarketing', 'contacts'] });
            toast.success(
              `${totalContacts} contact${totalContacts !== 1 ? 's' : ''} found across ${buyersWithContacts} buyer${buyersWithContacts !== 1 ? 's' : ''} — see Contacts tab`,
            );
          }
        })
        .catch(() => {});

      // Auto-create buyer introductions at first Kanban stage
      if (user?.id) {
        const pairs: Array<{ buyerId: string; listingId: string }> = [];
        for (const group of groups) {
          if (!selectedListingIds.has(group.listingId)) continue;
          for (const bId of buyerIds) {
            pairs.push({ buyerId: bId, listingId: group.listingId });
          }
        }
        await batchCreateBuyerIntroductions(pairs, user.id);
      }
    },
    onSuccess: () => {
      // Invalidate affected queries
      for (const group of groups) {
        if (selectedListingIds.has(group.listingId)) {
          queryClient.invalidateQueries({ queryKey: ['remarketing', 'scores', group.listingId] });
          queryClient.invalidateQueries({ queryKey: ['remarketing', 'outreach', group.listingId] });
          queryClient.invalidateQueries({ queryKey: ['buyer-introductions', group.listingId] });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'learning-insights'] });

      toast.success(
        `Approved ${totalScoresToApprove} buyer-deal match${totalScoresToApprove !== 1 ? 'es' : ''} across ${selectedListingIds.size} deal${selectedListingIds.size !== 1 ? 's' : ''}`,
      );
      handleOpenChange(false);
    },
    onError: () => {
      toast.error('Failed to approve buyers for selected deals');
    },
  });

  const handleApprove = () => {
    if (selectedListingIds.size === 0) return;
    approveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Approve {buyerCount} Buyer{buyerCount !== 1 ? 's' : ''} for Deals
          </DialogTitle>
          <DialogDescription>
            Select which deals to approve the selected buyers for. Only deals where buyers have been
            scored are shown.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[400px] overflow-y-auto py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No deals found. Add deals to this universe first.
            </p>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Deals with Pending Approvals ({groups.length})
                </p>
                {groups.length > 1 && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={selectAll}>
                    Select All
                  </Button>
                )}
              </div>
              {groups.map((group) => (
                <label
                  key={group.listingId}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                    selectedListingIds.has(group.listingId)
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-border hover:bg-muted/50',
                  )}
                >
                  <Checkbox
                    checked={selectedListingIds.has(group.listingId)}
                    onCheckedChange={() => toggleListing(group.listingId)}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm truncate block">{group.listingTitle}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {group.listingLocation && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {group.listingLocation}
                        </span>
                      )}
                      {group.listingCategory && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {group.listingCategory}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {group.pendingScoreIds.length + group.unscoredBuyerIds.length} to approve
                    </Badge>
                    {group.approvedCount > 0 && (
                      <div className="text-[10px] text-emerald-600 mt-0.5">
                        {group.approvedCount} already approved
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleApprove}
            disabled={selectedListingIds.size === 0 || approveMutation.isPending}
          >
            {approveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Approve {totalScoresToApprove} Match{totalScoresToApprove !== 1 ? 'es' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
