import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Store,
  Search,
  ExternalLink,
  Building2,
  DollarSign,
  MapPin,
  Calendar,
  X,
  Loader2,
  ArrowUpDown,
  Plus,
  Eye,
  CheckCircle2,
  GripVertical,
} from 'lucide-react';
import { CopyDealInfoButton } from './remarketing/ReMarketingDealDetail/CopyDealInfoButton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface MarketplaceQueueDeal {
  id: string;
  title: string | null;
  internal_company_name: string | null;
  description: string | null;
  executive_summary: string | null;
  industry: string | null;
  category: string | null;
  revenue: number | null;
  ebitda: number | null;
  location: string | null;
  address_state: string | null;
  website: string | null;
  main_contact_name: string | null;
  main_contact_email: string | null;
  deal_total_score: number | null;
  pushed_to_marketplace_at: string | null;
  pushed_to_marketplace_by: string | null;
  status: string | null;
  created_at: string;
  deal_source: string | null;
  marketplace_queue_rank: number | null;
}

const formatCurrency = (value: number | null) => {
  if (value == null) return '-';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
};

// ─── Sortable Deal Card ───

function SortableDealCard({
  deal,
  index,
  existingListing,
  getListingGaps,
  onRemove,
  memoStatusByDeal,
}: {
  deal: MarketplaceQueueDeal;
  index: number;
  existingListing?: { id: string; title: string };
  getListingGaps: (deal: MarketplaceQueueDeal) => string[];
  onRemove: (dealId: string, dealName: string) => void;
  memoStatusByDeal: Record<string, { hasLeadMemo: boolean; hasTeaser: boolean }>;
}) {
  const navigate = useNavigate();
  const hasExistingListing = !!existingListing;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'hover:border-blue-200 transition-colors cursor-pointer',
        isDragging && 'opacity-80 shadow-lg z-50 bg-muted/80',
      )}
      onClick={() =>
        navigate(`/admin/deals/${deal.id}`, {
          state: { from: '/admin/marketplace/queue' },
        })
      }
    >
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          {/* Drag handle + rank */}
          <div
            className="flex items-center gap-1.5 shrink-0 pt-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none p-0.5 rounded hover:bg-muted transition-colors"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <span className="text-xs font-medium text-muted-foreground tabular-nums w-5 text-center">
              {index + 1}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-base truncate">
                {deal.internal_company_name || deal.title || 'Untitled Deal'}
              </h3>
              {deal.deal_total_score != null && (
                <Badge
                  variant="outline"
                  className={`text-xs shrink-0 ${
                    deal.deal_total_score >= 75
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : deal.deal_total_score >= 50
                        ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                        : 'bg-gray-50 text-gray-600 border-gray-200'
                  }`}
                >
                  Score: {deal.deal_total_score}
                </Badge>
              )}
              {hasExistingListing && (
                <Badge
                  variant="outline"
                  className="text-xs shrink-0 bg-green-50 text-green-700 border-green-200 gap-1"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Listing Created
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              {(deal.industry || deal.category) && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {deal.industry || deal.category}
                </span>
              )}
              {deal.revenue != null && (
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  Rev: {formatCurrency(deal.revenue)}
                </span>
              )}
              {deal.ebitda != null && <span>EBITDA: {formatCurrency(deal.ebitda)}</span>}
              {deal.address_state && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {deal.address_state}
                </span>
              )}
              {deal.pushed_to_marketplace_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Queued {format(new Date(deal.pushed_to_marketplace_at), 'MMM d, yyyy')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasExistingListing ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/admin/deals/${existingListing!.id}?tab=marketplace`, {
                    state: { from: '/admin/marketplace/queue' },
                  });
                }}
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                View Listing
              </Button>
            ) : (
              (() => {
                const gaps = getListingGaps(deal);
                const canCreate = gaps.length === 0;
                return (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            variant="outline"
                            size="sm"
                            className={`h-8 text-xs ${!canCreate ? 'border-gray-200 text-gray-400 cursor-not-allowed' : ''}`}
                            disabled={!canCreate}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(
                                `/admin/marketplace/create-listing?fromDeal=${deal.id}`,
                              );
                            }}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Create Listing
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {canCreate
                          ? 'Create an anonymous marketplace listing from this deal.'
                          : `Complete these before creating a listing:\n${gaps.map((g) => `• ${g}`).join('\n')}`}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })()
            )}
            <CopyDealInfoButton deal={deal} iconOnly />
            {deal.website && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(
                    deal.website!.startsWith('http')
                      ? deal.website!
                      : `https://${deal.website}`,
                    '_blank',
                  );
                }}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(
                  deal.id,
                  deal.internal_company_name || deal.title || 'Deal',
                );
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───

const MarketplaceQueue = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'rank' | 'pushed_at' | 'name' | 'score'>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [localOrder, setLocalOrder] = useState<MarketplaceQueueDeal[]>([]);
  const localOrderRef = useRef<MarketplaceQueueDeal[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { data: deals, isLoading } = useQuery({
    queryKey: ['marketplace-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(
          `id, title, internal_company_name, description, executive_summary,
           industry, category, revenue, ebitda, location, address_state, website,
           main_contact_name, main_contact_email, deal_total_score,
           pushed_to_marketplace_at, pushed_to_marketplace_by, status, created_at,
           deal_source, marketplace_queue_rank`,
        )
        .eq('pushed_to_marketplace', true)
        .eq('is_internal_deal', true)
        .order('marketplace_queue_rank', { ascending: true, nullsFirst: false })
        .order('pushed_to_marketplace_at', { ascending: false });

      if (error) throw error;
      return data as MarketplaceQueueDeal[];
    },
  });

  // Sync local order from server data
  useEffect(() => {
    if (deals) {
      setLocalOrder(deals);
      localOrderRef.current = deals;
    }
  }, [deals]);

  // Query for existing listings that were created from deals (duplicate prevention)
  const { data: existingListingsMap } = useQuery({
    queryKey: ['marketplace-queue-existing-listings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('id, title, source_deal_id')
        .not('source_deal_id', 'is', null);

      if (error) throw error;
      const map: Record<string, { id: string; title: string }> = {};
      data?.forEach((listing: { source_deal_id: string | null; id: string; title: string }) => {
        if (listing.source_deal_id) {
          map[listing.source_deal_id] = { id: listing.id, title: listing.title };
        }
      });
      return map;
    },
  });

  // Fetch memo documents for all queued deals to check PDF prerequisites
  const dealIds = deals?.map((d) => d.id) ?? [];
  const { data: memoDocsRaw } = useQuery({
    queryKey: ['marketplace-queue-memo-docs', dealIds],
    enabled: dealIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_room_documents')
        .select('deal_id, document_category, storage_path')
        .in('deal_id', dealIds)
        .in('document_category', ['full_memo', 'anonymous_teaser']);
      if (error) throw error;
      return data ?? [];
    },
  });

  const memoStatusByDeal = useMemo(() => {
    const map: Record<string, { hasLeadMemo: boolean; hasTeaser: boolean }> = {};
    memoDocsRaw?.forEach((doc) => {
      if (!doc.deal_id || !doc.storage_path) return;
      if (!map[doc.deal_id]) map[doc.deal_id] = { hasLeadMemo: false, hasTeaser: false };
      if (doc.document_category === 'full_memo') map[doc.deal_id].hasLeadMemo = true;
      if (doc.document_category === 'anonymous_teaser') map[doc.deal_id].hasTeaser = true;
    });
    return map;
  }, [memoDocsRaw]);

  const getListingGaps = useCallback(
    (deal: MarketplaceQueueDeal): string[] => {
      const gaps: string[] = [];
      if (deal.revenue == null) gaps.push('Revenue');
      if (deal.ebitda == null) gaps.push('EBITDA');
      if (!deal.address_state && !deal.location) gaps.push('Location');
      if (!deal.category && !deal.industry) gaps.push('Category / Industry');
      if (!deal.executive_summary) gaps.push('Executive Summary');
      if (!deal.main_contact_name) gaps.push('Main contact name');

      const memos = memoStatusByDeal[deal.id];
      if (!memos?.hasLeadMemo) gaps.push('Lead Memo PDF');
      if (!memos?.hasTeaser) gaps.push('Teaser PDF');
      return gaps;
    },
    [memoStatusByDeal],
  );

  const handleRemoveFromQueue = useCallback(
    async (dealId: string, dealName: string) => {
      const { error } = await supabase
        .from('listings')
        .update({
          pushed_to_marketplace: false,
          pushed_to_marketplace_at: null,
          pushed_to_marketplace_by: null,
          marketplace_queue_rank: null,
        })
        .eq('id', dealId);

      if (error) {
        toast.error('Failed to remove from queue');
        return;
      }

      toast.success(`${dealName} removed from Marketplace Queue`);
      queryClient.invalidateQueries({ queryKey: ['marketplace-queue'] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
    },
    [queryClient],
  );

  // ─── Drag & Drop ───

  const persistRankChanges = useCallback(
    async (reordered: MarketplaceQueueDeal[]) => {
      const updated = reordered.map((deal, idx) => ({
        ...deal,
        marketplace_queue_rank: idx + 1,
      }));

      const changed = updated.filter((deal, idx) => {
        const orig = localOrderRef.current.find((d) => d.id === deal.id);
        return !orig || orig.marketplace_queue_rank !== idx + 1;
      });

      setLocalOrder(updated);
      localOrderRef.current = updated;

      try {
        if (changed.length > 0) {
          await Promise.all(
            changed.map((d) =>
              supabase
                .from('listings')
                .update({ marketplace_queue_rank: d.marketplace_queue_rank })
                .eq('id', d.id)
                .throwOnError(),
            ),
          );
        }
        await queryClient.invalidateQueries({ queryKey: ['marketplace-queue'] });
        toast.success('Queue order updated');
      } catch {
        await queryClient.invalidateQueries({ queryKey: ['marketplace-queue'] });
        toast.error('Failed to update queue order');
      }
    },
    [queryClient],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const current = [...localOrder];
      const oldIdx = current.findIndex((d) => d.id === active.id);
      const newIdx = current.findIndex((d) => d.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;

      const reordered = arrayMove(current, oldIdx, newIdx);
      await persistRankChanges(reordered);
    },
    [localOrder, persistRankChanges],
  );

  // ─── Sorting & Filtering ───

  const filteredDeals = useMemo(() => {
    let result = [...localOrder];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          (d.internal_company_name || '').toLowerCase().includes(q) ||
          (d.title || '').toLowerCase().includes(q) ||
          (d.industry || '').toLowerCase().includes(q) ||
          (d.category || '').toLowerCase().includes(q) ||
          (d.address_state || '').toLowerCase().includes(q) ||
          (d.main_contact_name || '').toLowerCase().includes(q) ||
          (d.main_contact_email || '').toLowerCase().includes(q) ||
          (d.description || '').toLowerCase().includes(q) ||
          (d.deal_source || '').toLowerCase().includes(q) ||
          (d.location || '').toLowerCase().includes(q),
      );
    }

    // When sorting by rank, use local order (drag position). Otherwise apply sort.
    if (sortBy !== 'rank') {
      result = [...result].sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;

        switch (sortBy) {
          case 'name':
            aVal = (a.internal_company_name || a.title || '').toLowerCase();
            bVal = (b.internal_company_name || b.title || '').toLowerCase();
            break;
          case 'score':
            aVal = a.deal_total_score ?? 0;
            bVal = b.deal_total_score ?? 0;
            break;
          case 'pushed_at':
          default:
            aVal = new Date(a.pushed_to_marketplace_at ?? a.created_at).getTime() || 0;
            bVal = new Date(b.pushed_to_marketplace_at ?? b.created_at).getTime() || 0;
            break;
        }

        if (typeof aVal === 'string') {
          const cmp = aVal.localeCompare(bVal as string);
          return sortDir === 'asc' ? cmp : -cmp;
        }
        return sortDir === 'asc'
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number);
      });
    }

    return result;
  }, [localOrder, searchQuery, sortBy, sortDir]);

  const handleSort = (col: 'rank' | 'pushed_at' | 'name' | 'score') => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'name' ? 'asc' : col === 'rank' ? 'asc' : 'desc');
    }
  };

  const isDragEnabled = sortBy === 'rank' && !searchQuery.trim();
  const sortableIds = useMemo(() => filteredDeals.map((d) => d.id), [filteredDeals]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Store className="h-6 w-6" />
            Marketplace Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Deals pushed to marketplace for review before publishing. {deals?.length ?? 0} deal
            {(deals?.length ?? 0) !== 1 ? 's' : ''} in queue.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search deals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span>Sort:</span>
          {(['rank', 'pushed_at', 'name', 'score'] as const).map((col) => (
            <Button
              key={col}
              variant={sortBy === col ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleSort(col)}
            >
              {col === 'rank'
                ? 'Rank'
                : col === 'pushed_at'
                  ? 'Date Added'
                  : col === 'name'
                    ? 'Name'
                    : 'Score'}
              {sortBy === col && <ArrowUpDown className="h-3 w-3 ml-1" />}
            </Button>
          ))}
        </div>
      </div>

      {!isDragEnabled && sortBy === 'rank' && searchQuery.trim() && (
        <p className="text-xs text-muted-foreground">
          Drag-to-reorder is disabled while searching. Clear the search to reorder.
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredDeals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Store className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">
              {searchQuery
                ? 'No deals match your search.'
                : 'No deals in the marketplace queue yet. Push deals from Active Deals.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={isDragEnabled ? handleDragEnd : undefined}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="grid gap-3">
              {filteredDeals.map((deal, index) => (
                <SortableDealCard
                  key={deal.id}
                  deal={deal}
                  index={index}
                  existingListing={existingListingsMap?.[deal.id]}
                  getListingGaps={getListingGaps}
                  onRemove={handleRemoveFromQueue}
                  memoStatusByDeal={memoStatusByDeal}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};

export default MarketplaceQueue;
