/**
 * AddDealDialog.tsx
 *
 * Dialog wrapper for adding a deal -- either from the marketplace or by
 * creating a new one. Orchestrates the two tabs and delegates form rendering
 * to AddDealForm and submission logic to useAddDealSubmit.
 */
import { useState, useRef, useCallback } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Search,
  Building2,
  MapPin,
  DollarSign,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  ArrowRight,
} from 'lucide-react';
import { AddDealForm } from './AddDealForm';
import { useAddDealSubmit, INITIAL_FORM_DATA, type AddDealFormData } from './useAddDealSubmit';

interface AddDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDealCreated?: () => void;
  referralPartnerId?: string;
}

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return null;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
};

export const AddDealDialog = ({
  open,
  onOpenChange,
  onDealCreated,
  referralPartnerId,
}: AddDealDialogProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'marketplace' | 'new'>('marketplace');
  const [searchQuery, setSearchQuery] = useState('');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingToRemarketing, setAddingToRemarketing] = useState<string | null>(null);
  const [formData, setFormData] = useState<AddDealFormData>(INITIAL_FORM_DATA);
  const [transcriptFiles, setTranscriptFiles] = useState<File[]>([]);

  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  const transcriptFilesRef = useRef<File[]>([]);

  const updateFiles = (files: File[]) => {
    setTranscriptFiles(files);
    transcriptFilesRef.current = files;
  };

  const resetForm = () => {
    setFormData(INITIAL_FORM_DATA);
    updateFiles([]);
  };

  const { createDealMutation, handleAddFromMarketplace } = useAddDealSubmit({
    referralPartnerId,
    onDealCreated,
    onOpenChange,
    formDataRef,
    transcriptFilesRef,
    resetForm,
  });

  const handleFormChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // ─── Marketplace search ───

  const PAGE_SIZE = 50;

  const {
    data: marketplaceData,
    isLoading: searchLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['marketplace-search', searchQuery],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from('listings')
        .select(
          'id, title, internal_company_name, location, revenue, ebitda, website, category, status, is_internal_deal, description, executive_summary, created_at',
        )
        .is('deleted_at', null)
        .eq('is_internal_deal', false)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      if (searchQuery.trim()) {
        query = query.textSearch('fts', searchQuery, { type: 'websearch', config: 'english' });
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length * PAGE_SIZE;
    },
    enabled: open && activeTab === 'marketplace',
  });

  const marketplaceListings = marketplaceData?.pages.flat() ?? [];

  // Infinite scroll sentinel callback
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastItemRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isFetchingNextPage) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage) {
          fetchNextPage();
        }
      });
      if (node) observerRef.current.observe(node);
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage],
  );

  // Check which listings are already remarketing deals
  const { data: _existingDealIds } = useQuery({
    queryKey: ['existing-remarketing-deal-ids'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('id')
        .eq('is_internal_deal', true);
      if (error) throw error;
      return new Set((data || []).map((d) => d.id));
    },
    enabled: open && activeTab === 'marketplace',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Deal</DialogTitle>
          <DialogDescription>
            Add an existing marketplace listing or create a new deal
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'marketplace' | 'new')}
          className="flex-1 overflow-hidden flex flex-col"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="marketplace">From Marketplace</TabsTrigger>
            <TabsTrigger value="new">Create New</TabsTrigger>
          </TabsList>

          {/* Marketplace Tab */}
          <TabsContent
            value="marketplace"
            className="flex-1 overflow-hidden flex flex-col mt-4 space-y-3"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by company name or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex-1 max-h-[50vh] overflow-y-auto border rounded-md">
              <div className="space-y-2 p-2">
                {searchLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                      </div>
                    </div>
                  ))
                ) : !marketplaceListings?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">
                      {searchQuery
                        ? 'No listings match your search'
                        : 'No marketplace listings found'}
                    </p>
                  </div>
                ) : (
                  marketplaceListings.map((listing, index) => {
                    const displayName =
                      listing.internal_company_name || listing.title || 'Untitled';
                    const isAlreadyAdded = addedIds.has(listing.id);
                    const isLast = index === marketplaceListings.length - 1;
                    const isExpanded = expandedId === listing.id;
                    const isAdding = addingToRemarketing === listing.id;

                    return (
                      <div
                        key={listing.id}
                        ref={isLast ? lastItemRef : undefined}
                        className={`border rounded-lg transition-colors ${isExpanded ? 'bg-accent/30 border-primary/30' : 'hover:bg-accent/50'}`}
                      >
                        {/* Collapsed row */}
                        <div
                          className="flex items-center gap-3 p-3 cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : listing.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm truncate">{displayName}</p>
                              {listing.category && (
                                <Badge variant="secondary" className="text-xs shrink-0">
                                  {listing.category}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              {listing.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {listing.location}
                                </span>
                              )}
                              {listing.revenue != null && (
                                <span className="flex items-center gap-1">
                                  <DollarSign className="h-3 w-3" />
                                  {formatCurrency(listing.revenue)} Rev
                                </span>
                              )}
                              {listing.ebitda != null && (
                                <span>{formatCurrency(listing.ebitda)} EBITDA</span>
                              )}
                            </div>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-3 pb-3 space-y-3 border-t border-border/50 pt-3">
                            {listing.executive_summary && (
                              <p className="text-xs text-muted-foreground line-clamp-3">
                                {listing.executive_summary}
                              </p>
                            )}
                            {!listing.executive_summary && listing.description && (
                              <p className="text-xs text-muted-foreground line-clamp-3">
                                {listing.description}
                              </p>
                            )}

                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {listing.revenue != null && (
                                <div className="bg-muted/50 rounded p-2">
                                  <span className="text-muted-foreground">Revenue</span>
                                  <p className="font-medium">{formatCurrency(listing.revenue)}</p>
                                </div>
                              )}
                              {listing.ebitda != null && (
                                <div className="bg-muted/50 rounded p-2">
                                  <span className="text-muted-foreground">EBITDA</span>
                                  <p className="font-medium">{formatCurrency(listing.ebitda)}</p>
                                </div>
                              )}
                              {listing.revenue != null &&
                                listing.ebitda != null &&
                                listing.revenue > 0 && (
                                  <div className="bg-muted/50 rounded p-2">
                                    <span className="text-muted-foreground">Margin</span>
                                    <p className="font-medium">
                                      {((listing.ebitda / listing.revenue) * 100).toFixed(0)}%
                                    </p>
                                  </div>
                                )}
                              {listing.website && (
                                <div className="bg-muted/50 rounded p-2">
                                  <span className="text-muted-foreground">Website</span>
                                  <p className="font-medium truncate flex items-center gap-1">
                                    <Globe className="h-3 w-3" />
                                    {listing.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddFromMarketplace(
                                    { id: listing.id, title: listing.title, internal_company_name: listing.internal_company_name ?? undefined },
                                    setAddingToRemarketing,
                                    (id) => setAddedIds((prev) => new Set(prev).add(id)),
                                  );
                                }}
                                disabled={isAlreadyAdded || isAdding}
                                className="flex-1"
                              >
                                {isAdding ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                    Adding...
                                  </>
                                ) : isAlreadyAdded ? (
                                  <>
                                    <Check className="h-3.5 w-3.5 mr-1" />
                                    Added to Remarketing
                                  </>
                                ) : (
                                  <>
                                    <ArrowRight className="h-3.5 w-3.5 mr-1" />
                                    Add to Remarketing
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenChange(false);
                                  navigate(`/admin/deals/${listing.id}`, { state: { from: location.pathname } });
                                }}
                              >
                                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                Open
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                {isFetchingNextPage && (
                  <div className="flex justify-center py-3">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {hasNextPage && !isFetchingNextPage && marketplaceListings.length > 0 && (
                  <div className="flex justify-center py-2">
                    <Button variant="ghost" size="sm" onClick={() => fetchNextPage()}>
                      Load more listings...
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Create New Tab */}
          <TabsContent value="new" className="flex-1 overflow-auto mt-4">
            <AddDealForm
              formData={formData}
              onFormChange={handleFormChange}
              transcriptFiles={transcriptFiles}
              onFilesChange={updateFiles}
              onSubmit={() => createDealMutation.mutate()}
              isSubmitting={createDealMutation.isPending}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AddDealDialog;
