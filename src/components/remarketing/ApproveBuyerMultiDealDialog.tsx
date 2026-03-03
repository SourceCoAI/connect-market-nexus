/**
 * ApproveBuyerMultiDealDialog.tsx
 *
 * Dialog that allows approving a buyer across multiple deals at once.
 * Fetches all deals where the buyer has been scored and lets the admin
 * select which deals to approve the buyer for.
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

interface ApproveBuyerMultiDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyerId: string;
  buyerName: string;
  /** The listing currently being viewed — pre-checked */
  currentListingId: string;
}

interface ScoredDeal {
  scoreId: string;
  listingId: string;
  listingTitle: string;
  listingLocation: string | null;
  listingCategory: string | null;
  compositeScore: number;
  status: string;
}

export function ApproveBuyerMultiDealDialog({
  open,
  onOpenChange,
  buyerId,
  buyerName,
  currentListingId,
}: ApproveBuyerMultiDealDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedScoreIds, setSelectedScoreIds] = useState<Set<string>>(new Set());

  // Fetch all deals where this buyer has been scored
  const { data: scoredDeals, isLoading } = useQuery({
    queryKey: ['buyer-scored-deals', buyerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remarketing_scores')
        .select(`
          id,
          listing_id,
          composite_score,
          status,
          listing:listings!remarketing_scores_listing_id_fkey(id, title, location, category)
        `)
        .eq('buyer_id', buyerId)
        .order('composite_score', { ascending: false });

      if (error) throw error;

      return (data || []).map((s: any) => ({
        scoreId: s.id,
        listingId: s.listing_id,
        listingTitle: s.listing?.title || 'Unknown Deal',
        listingLocation: s.listing?.location || null,
        listingCategory: s.listing?.category || null,
        compositeScore: s.composite_score,
        status: s.status,
      })) as ScoredDeal[];
    },
    enabled: open && !!buyerId,
  });

  // Pre-select the current listing's score and any non-approved scores on open
  const deals = useMemo(() => {
    if (!scoredDeals) return [];
    return scoredDeals;
  }, [scoredDeals]);

  // Initialize selections when data loads — pre-select the current deal
  const pendingDeals = useMemo(() => {
    return deals.filter((d) => d.status !== 'approved' && d.status !== 'passed');
  }, [deals]);

  const approvedDeals = useMemo(() => {
    return deals.filter((d) => d.status === 'approved');
  }, [deals]);

  // Reset selections when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      // Pre-select the current deal's score
      const currentScore = deals.find((d) => d.listingId === currentListingId);
      if (currentScore) {
        setSelectedScoreIds(new Set([currentScore.scoreId]));
      } else {
        setSelectedScoreIds(new Set());
      }
    }
    onOpenChange(newOpen);
  };

  // When deals load, pre-select current listing
  useMemo(() => {
    if (deals.length > 0 && open) {
      const currentScore = deals.find((d) => d.listingId === currentListingId);
      if (currentScore && selectedScoreIds.size === 0) {
        setSelectedScoreIds(new Set([currentScore.scoreId]));
      }
    }
  }, [deals, open, currentListingId]);

  const toggleScore = (scoreId: string) => {
    setSelectedScoreIds((prev) => {
      const next = new Set(prev);
      if (next.has(scoreId)) {
        next.delete(scoreId);
      } else {
        next.add(scoreId);
      }
      return next;
    });
  };

  const selectAllPending = () => {
    setSelectedScoreIds(new Set(pendingDeals.map((d) => d.scoreId)));
  };

  // Mutation to approve across multiple deals
  const approveMutation = useMutation({
    mutationFn: async (scoreIds: string[]) => {
      const { error } = await supabase
        .from('remarketing_scores')
        .update({ status: 'approved' })
        .in('id', scoreIds);

      if (error) throw error;

      // Auto-create outreach records for each approved score
      for (const scoreId of scoreIds) {
        const deal = deals.find((d) => d.scoreId === scoreId);
        if (!deal) continue;

        try {
          await supabase.from('remarketing_outreach').upsert(
            {
              score_id: scoreId,
              listing_id: deal.listingId,
              buyer_id: buyerId,
              status: 'pending',
              created_by: user?.id,
            },
            { onConflict: 'score_id' },
          );
        } catch {
          // Non-blocking
        }
      }

      // Fire-and-forget: discover contacts
      supabase.functions
        .invoke('find-buyer-contacts', { body: { buyerId } })
        .catch(() => {});
    },
    onSuccess: () => {
      // Invalidate all affected listing score queries
      const affectedListingIds = deals
        .filter((d) => selectedScoreIds.has(d.scoreId))
        .map((d) => d.listingId);

      for (const lid of affectedListingIds) {
        queryClient.invalidateQueries({ queryKey: ['remarketing', 'scores', lid] });
        queryClient.invalidateQueries({ queryKey: ['remarketing', 'outreach', lid] });
      }
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'learning-insights'] });

      toast.success(
        `Approved ${buyerName} for ${selectedScoreIds.size} deal${selectedScoreIds.size > 1 ? 's' : ''}`,
      );
      onOpenChange(false);
      setSelectedScoreIds(new Set());
    },
    onError: () => {
      toast.error('Failed to approve buyer for selected deals');
    },
  });

  const handleApprove = () => {
    if (selectedScoreIds.size === 0) return;
    approveMutation.mutate(Array.from(selectedScoreIds));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Approve {buyerName} for Multiple Deals</DialogTitle>
          <DialogDescription>
            Select which deals to approve this buyer for. Already-approved deals are shown for reference.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[400px] overflow-y-auto py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : deals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No scored deals found for this buyer.
            </p>
          ) : (
            <>
              {/* Pending deals — selectable */}
              {pendingDeals.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Available to Approve ({pendingDeals.length})
                    </p>
                    {pendingDeals.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={selectAllPending}
                      >
                        Select All
                      </Button>
                    )}
                  </div>
                  {pendingDeals.map((deal) => (
                    <label
                      key={deal.scoreId}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                        selectedScoreIds.has(deal.scoreId)
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-border hover:bg-muted/50',
                        deal.listingId === currentListingId && 'ring-1 ring-primary/30',
                      )}
                    >
                      <Checkbox
                        checked={selectedScoreIds.has(deal.scoreId)}
                        onCheckedChange={() => toggleScore(deal.scoreId)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{deal.listingTitle}</span>
                          {deal.listingId === currentListingId && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              Current
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          {deal.listingLocation && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {deal.listingLocation}
                            </span>
                          )}
                          {deal.listingCategory && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {deal.listingCategory}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold">{Math.round(deal.compositeScore)}</div>
                        <div className="text-[10px] text-muted-foreground">score</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Already approved deals — shown for reference */}
              {approvedDeals.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Already Approved ({approvedDeals.length})
                  </p>
                  {approvedDeals.map((deal) => (
                    <div
                      key={deal.scoreId}
                      className="flex items-center gap-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 opacity-60"
                    >
                      <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm truncate">{deal.listingTitle}</span>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          {deal.listingLocation && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {deal.listingLocation}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                        Approved
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleApprove}
            disabled={selectedScoreIds.size === 0 || approveMutation.isPending}
          >
            {approveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Approve for {selectedScoreIds.size} Deal{selectedScoreIds.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
