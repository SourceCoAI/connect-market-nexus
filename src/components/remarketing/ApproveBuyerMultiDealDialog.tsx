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
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { createBuyerIntroductionFromApproval } from '@/lib/remarketing/createBuyerIntroduction';
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

interface ApproveBuyerMultiDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyerId: string;
  buyerName: string;
  /** The listing currently being viewed — pre-checked */
  currentListingId: string;
  universeId?: string;
}

interface ScoredDeal {
  scoreId: string | null;
  listingId: string;
  listingTitle: string;
  listingLocation: string | null;
  listingCategory: string | null;
  compositeScore: number | null;
  status: string;
}

export function ApproveBuyerMultiDealDialog({
  open,
  onOpenChange,
  buyerId,
  buyerName,
  currentListingId,
  universeId,
}: ApproveBuyerMultiDealDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all deals where this buyer has been scored + all universe deals
  const { data: scoredDeals, isLoading } = useQuery({
    queryKey: ['buyer-scored-deals', buyerId, universeId],
    queryFn: async () => {
      const [scoresResult, universeDealsResult] = await Promise.all([
        supabase
          .from('remarketing_scores')
          .select(
            `
            id,
            listing_id,
            composite_score,
            status,
            listing:listings!remarketing_scores_listing_id_fkey(id, title, location, category)
          `,
          )
          .eq('buyer_id', buyerId)
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

      const dealMap = new Map<string, ScoredDeal>();

      // Seed from universe deals (unscored)
      for (const ud of universeDealsResult.data || []) {
        const listing = ud.listing as {
          id: string;
          title: string;
          location: string | null;
          category: string | null;
        } | null;
        if (!ud.listing_id || !listing) continue;
        if (!dealMap.has(ud.listing_id)) {
          dealMap.set(ud.listing_id, {
            scoreId: null,
            listingId: ud.listing_id,
            listingTitle: listing.title || 'Unknown Deal',
            listingLocation: listing.location || null,
            listingCategory: listing.category || null,
            compositeScore: null,
            status: 'unscored',
          });
        }
      }

      // Override with actual scores
      for (const s of scoresResult.data || []) {
        const listing = s.listing as {
          id: string;
          title: string;
          location: string | null;
          category: string | null;
        } | null;
        dealMap.set(s.listing_id, {
          scoreId: s.id,
          listingId: s.listing_id,
          listingTitle: listing?.title || 'Unknown Deal',
          listingLocation: listing?.location || null,
          listingCategory: listing?.category || null,
          compositeScore: s.composite_score,
          status: s.status,
        });
      }

      return Array.from(dealMap.values());
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

  // Use listingId as selection key instead of scoreId so unscored deals can be selected
  const [selectedListingIds, setSelectedListingIds] = useState<Set<string>>(new Set());

  const approvedDeals = useMemo(() => {
    return deals.filter((d) => d.status === 'approved');
  }, [deals]);

  // Reset selections when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      const hasCurrent = deals.some((d) => d.listingId === currentListingId);
      setSelectedListingIds(hasCurrent ? new Set([currentListingId]) : new Set());
    }
    onOpenChange(newOpen);
  };

  // When deals load, pre-select current listing
  useMemo(() => {
    if (deals.length > 0 && open) {
      const hasCurrent = deals.some((d) => d.listingId === currentListingId);
      if (hasCurrent && selectedListingIds.size === 0) {
        setSelectedListingIds(new Set([currentListingId]));
      }
    }
  }, [deals, open, currentListingId]);

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

  const selectAllPending = () => {
    setSelectedListingIds(new Set(pendingDeals.map((d) => d.listingId)));
  };

  // Mutation to approve across multiple deals
  const approveMutation = useMutation({
    mutationFn: async (listingIds: string[]) => {
      const selectedDeals = deals.filter((d) => listingIds.includes(d.listingId));
      const existingScoreIds = selectedDeals
        .filter((d) => d.scoreId && d.status !== 'approved' && d.status !== 'passed')
        .map((d) => d.scoreId!);
      const unscoredDeals = selectedDeals.filter((d) => !d.scoreId);

      // Update existing pending scores to approved
      if (existingScoreIds.length > 0) {
        const { error } = await supabase
          .from('remarketing_scores')
          .update({ status: 'approved' })
          .in('id', existingScoreIds);
        if (error) throw error;
      }

      // Create score records for unscored deals and approve them directly
      let newScoreIds: string[] = [];
      if (unscoredDeals.length > 0) {
        const rows = unscoredDeals.map((d) => ({
          listing_id: d.listingId,
          buyer_id: buyerId,
          status: 'approved' as const,
        }));
        const { data: inserted, error } = await supabase
          .from('remarketing_scores')
          .upsert(rows, { onConflict: 'listing_id,buyer_id', ignoreDuplicates: false })
          .select('id');
        if (error) throw error;
        if (inserted) {
          newScoreIds = inserted.map((r: { id: string }) => r.id);
        }
      }

      const allScoreIds = [...existingScoreIds, ...newScoreIds];

      // Auto-create outreach records for each approved score
      for (let i = 0; i < allScoreIds.length; i++) {
        const scoreId = allScoreIds[i];
        const deal =
          i < existingScoreIds.length
            ? selectedDeals.find((d) => d.scoreId === scoreId)
            : unscoredDeals[i - existingScoreIds.length];
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

      // Fire-and-forget: auto-discover contacts via Serper + Clay + Prospeo pipeline
      findIntroductionContacts(buyerId)
        .then((result) => {
          if (result && result.total_saved > 0) {
            queryClient.invalidateQueries({ queryKey: ['remarketing', 'contacts'] });
            toast.success(
              `${result.total_saved} contact${result.total_saved !== 1 ? 's' : ''} found at ${result.firmName} — see Contacts tab`,
            );
          } else if (result && result.total_saved === 0 && !result.message) {
            toast.info(`No contacts found for ${result.firmName} — try manual search`);
          }
        })
        .catch((err) => {
          console.error('[ApproveBuyerMultiDealDialog] Contact discovery failed:', err);
          toast.error('Contact discovery failed — try manual search in the AI Command Center');
        });

      // Auto-create buyer introductions at first Kanban stage for each approved deal
      if (user?.id) {
        for (const deal of selectedDeals) {
          try {
            await createBuyerIntroductionFromApproval({
              buyerId,
              listingId: deal.listingId,
              userId: user.id,
            });
          } catch {
            // Non-blocking
          }
        }
      }
    },
    onSuccess: () => {
      // Invalidate all affected listing score queries
      for (const lid of selectedListingIds) {
        queryClient.invalidateQueries({ queryKey: ['remarketing', 'scores', lid] });
        queryClient.invalidateQueries({ queryKey: ['remarketing', 'outreach', lid] });
        queryClient.invalidateQueries({ queryKey: ['buyer-introductions', lid] });
      }
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'learning-insights'] });

      toast.success(
        `Approved ${buyerName} for ${selectedListingIds.size} deal${selectedListingIds.size > 1 ? 's' : ''}`,
      );
      onOpenChange(false);
      setSelectedListingIds(new Set());
    },
    onError: () => {
      toast.error('Failed to approve buyer for selected deals');
    },
  });

  const handleApprove = () => {
    if (selectedListingIds.size === 0) return;
    approveMutation.mutate(Array.from(selectedListingIds));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Approve {buyerName} for Multiple Deals</DialogTitle>
          <DialogDescription>
            Select which deals to approve this buyer for. Already-approved deals are shown for
            reference.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[400px] overflow-y-auto py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : deals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No deals found. Add deals to this universe first.
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
                      key={deal.listingId}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                        selectedListingIds.has(deal.listingId)
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-border hover:bg-muted/50',
                        deal.listingId === currentListingId && 'ring-1 ring-primary/30',
                      )}
                    >
                      <Checkbox
                        checked={selectedListingIds.has(deal.listingId)}
                        onCheckedChange={() => toggleListing(deal.listingId)}
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
                        {deal.compositeScore != null ? (
                          <>
                            <div className="text-sm font-bold">
                              {Math.round(deal.compositeScore)}
                            </div>
                            <div className="text-[10px] text-muted-foreground">score</div>
                          </>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-orange-600 border-orange-300"
                          >
                            Not Scored
                          </Badge>
                        )}
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
                      key={deal.listingId}
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
            disabled={selectedListingIds.size === 0 || approveMutation.isPending}
          >
            {approveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Approve for {selectedListingIds.size} Deal{selectedListingIds.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
