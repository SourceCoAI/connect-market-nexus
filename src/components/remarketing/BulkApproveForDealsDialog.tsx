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
}

interface DealGroup {
  listingId: string;
  listingTitle: string;
  listingLocation: string | null;
  listingCategory: string | null;
  pendingScoreIds: string[];
  approvedCount: number;
  totalBuyerCount: number;
}

export function BulkApproveForDealsDialog({
  open,
  onOpenChange,
  buyerIds,
  buyerCount,
}: BulkApproveForDealsDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedListingIds, setSelectedListingIds] = useState<Set<string>>(new Set());

  // Fetch all scores for the selected buyers, grouped by deal
  const { data: dealGroups, isLoading } = useQuery({
    queryKey: ['bulk-buyer-scored-deals', buyerIds],
    queryFn: async () => {
      const { data, error } = await supabase
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
        .order('composite_score', { ascending: false });

      if (error) throw error;

      // Group scores by listing
      const groupMap = new Map<string, DealGroup>();
      for (const s of data || []) {
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
            approvedCount: 0,
            totalBuyerCount: 0,
          };
          groupMap.set(listingId, group);
        }

        group.totalBuyerCount++;
        if (s.status === 'approved') {
          group.approvedCount++;
        } else if (s.status !== 'passed') {
          group.pendingScoreIds.push(s.id);
        }
      }

      return Array.from(groupMap.values())
        .filter((g) => g.pendingScoreIds.length > 0)
        .sort((a, b) => b.pendingScoreIds.length - a.pendingScoreIds.length);
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

  // Count total scores to approve
  const totalScoresToApprove = useMemo(() => {
    return groups
      .filter((g) => selectedListingIds.has(g.listingId))
      .reduce((sum, g) => sum + g.pendingScoreIds.length, 0);
  }, [groups, selectedListingIds]);

  // Mutation to approve all buyer-deal pairs for selected deals
  const approveMutation = useMutation({
    mutationFn: async () => {
      const scoreIds = groups
        .filter((g) => selectedListingIds.has(g.listingId))
        .flatMap((g) => g.pendingScoreIds);

      if (scoreIds.length === 0) return;

      const { error } = await supabase
        .from('remarketing_scores')
        .update({ status: 'approved' })
        .in('id', scoreIds);

      if (error) throw error;

      // Auto-create outreach records for approved scores
      for (const group of groups) {
        if (!selectedListingIds.has(group.listingId)) continue;
        for (const scoreId of group.pendingScoreIds) {
          try {
            await supabase.from('remarketing_outreach').upsert(
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

      // Fire-and-forget: discover contacts for all buyers
      for (const buyerId of buyerIds) {
        supabase.functions.invoke('find-buyer-contacts', { body: { buyerId } }).catch(() => {});
      }
    },
    onSuccess: () => {
      // Invalidate affected queries
      for (const group of groups) {
        if (selectedListingIds.has(group.listingId)) {
          queryClient.invalidateQueries({ queryKey: ['remarketing', 'scores', group.listingId] });
          queryClient.invalidateQueries({ queryKey: ['remarketing', 'outreach', group.listingId] });
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
              No scored deals found for the selected buyers. Score the buyers against deals first.
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
                      {group.pendingScoreIds.length} to approve
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
