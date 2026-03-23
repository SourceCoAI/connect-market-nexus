import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  Building2,
  MapPin,
  Plus,
  Check,
  Loader2,
  DollarSign,
  Sparkles,
  ExternalLink,
  Link2,
  Upload,
  X,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';

interface ListingOption {
  id: string;
  title: string | null;
  internal_company_name: string | null;
  location: string | null;
  revenue: number | null;
  ebitda: number | null;
  enriched_at: string | null;
  geographic_states: string[] | null;
  website: string | null;
  internal_deal_memo_link: string | null;
  is_internal_deal: boolean;
  deal_source: string | null;
  pushed_to_all_deals: boolean | null;
  universes?: { id: string; name: string }[];
}

const LEAD_SOURCE_TYPES = ['captarget', 'valuation_calculator', 'valuation_lead', 'gp_partners'];

// Helper to extract website URL from memo link or website field
const getEffectiveWebsite = (listing: ListingOption): string | null => {
  // Prioritize the website field
  if (listing.website) return listing.website;

  // Fall back to extracting from memo link (exclude SharePoint/OneDrive links)
  if (listing.internal_deal_memo_link) {
    const memoLink = listing.internal_deal_memo_link;
    // Skip SharePoint/OneDrive links
    if (memoLink.includes('sharepoint.com') || memoLink.includes('onedrive')) {
      return null;
    }
    // Check if it looks like a regular website URL
    const urlMatch = memoLink.match(/https?:\/\/(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/);
    if (urlMatch) {
      return memoLink;
    }
  }

  return null;
};

interface AddDealToUniverseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  universeId: string;
  universeName?: string;
  existingDealIds?: string[];
  defaultTab?: 'existing' | 'new';
  onDealAdded?: () => void;
}

export const AddDealToUniverseDialog = ({
  open,
  onOpenChange,
  universeId,
  universeName = '',
  existingDealIds = [],
  defaultTab = 'existing',
  onDealAdded,
}: AddDealToUniverseDialogProps) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [selectedListings, setSelectedListings] = useState<string[]>([]);
  const [transcriptFiles, setTranscriptFiles] = useState<File[]>([]);
  const transcriptFilesRef = useRef<File[]>([]);
  const [createDealError, setCreateDealError] = useState<string | null>(null);
  const [newDealForm, setNewDealForm] = useState({
    title: '',
    website: '',
    location: '',
    revenue: '',
    ebitda: '',
    description: '',
    transcriptLink: '',
  });

  // Fetch available listings (not already in universe)
  // Shows internal deals + active marketplace deals, but excludes lead-source-only entries
  const { data: availableListings, isLoading: loadingListings } = useQuery({
    queryKey: ['listings', 'available-for-universe', universeId, search],
    queryFn: async (): Promise<ListingOption[]> => {
      // Fetch internal deals and active deals (marketplace, manual, referral, etc.)
      const result = await supabase
        .from('listings')
        .select(
          'id, title, internal_company_name, location, revenue, ebitda, enriched_at, geographic_states, website, internal_deal_memo_link, is_internal_deal, status, deal_source, pushed_to_all_deals',
        )
        .is('deleted_at', null)
        .or('is_internal_deal.eq.true,status.eq.active')
        .order('created_at', { ascending: false })
        .limit(500);

      if (result.error) throw result.error;

      // Fetch universe associations for all listings
      const universeResult = await supabase
        .from('remarketing_universe_deals')
        .select(
          `
          listing_id,
          universe:buyer_universes(id, name)
        `,
        )
        .eq('status', 'active');

      const universeMap: Record<string, { id: string; name: string }[]> = {};
      if (universeResult.data) {
        for (const link of universeResult.data) {
          if (!universeMap[link.listing_id]) {
            universeMap[link.listing_id] = [];
          }
          if (link.universe) {
            universeMap[link.listing_id].push(link.universe);
          }
        }
      }

      let data = ((result.data as ListingOption[]) || []).map((listing) => ({
        ...listing,
        universes: universeMap[listing.id] || [],
      }));

      // Exclude deals already in THIS universe
      data = data.filter((listing) => !existingDealIds.includes(listing.id));

      // Exclude lead-source-only deals that haven't been pushed to "All Deals"
      data = data.filter((listing) => {
        if (listing.is_internal_deal) return true;
        if (listing.deal_source && LEAD_SOURCE_TYPES.includes(listing.deal_source)) {
          return listing.pushed_to_all_deals === true;
        }
        return true;
      });

      if (search) {
        const searchLower = search.toLowerCase();
        data = data.filter(
          (listing) =>
            listing.title?.toLowerCase().includes(searchLower) ||
            listing.internal_company_name?.toLowerCase().includes(searchLower) ||
            listing.location?.toLowerCase().includes(searchLower),
        );
      }

      return data;
    },
    enabled: open,
  });

  // Add existing deals to universe with auto-scoring
  const addDealsMutation = useMutation({
    mutationFn: async (listingIds: string[]) => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;

      const inserts = listingIds.map((listing_id) => ({
        universe_id: universeId,
        listing_id,
        added_by: user?.id,
        status: 'active',
      }));

      const { error } = await supabase.from('remarketing_universe_deals').insert(inserts);

      if (error) throw error;
      return listingIds;
    },
    onSuccess: async (listingIds) => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'universe-deals', universeId] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals', 'universe', universeId] });
      toast.success(
        `Added ${listingIds.length} deal${listingIds.length > 1 ? 's' : ''} to universe`,
      );

      // Queue background scoring for each deal
      const { queueDealScoring } = await import('@/lib/remarketing/queueScoring');
      await queueDealScoring({ universeId, listingIds });

      setSelectedListings([]);
      onDealAdded?.();
      onOpenChange(false);
    },
    onError: (error: Error & { code?: string }) => {
      const msg = error?.message || 'Failed to add deals to universe';
      if (error?.code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
        toast.error('One or more deals are already in this universe');
      } else {
        toast.error(msg);
      }
    },
  });

  // Create new deal and add to universe
  const createDealMutation = useMutation({
    mutationFn: async () => {
      setCreateDealError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('You must be signed in to create a deal.');

      // Admin-only guard (matches RLS policies on listings/universe_deals/deal_transcripts)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.is_admin) {
        throw new Error(
          'Admin access required: your account is not permitted to create deals in a universe.',
        );
      }

      // Check for duplicate website across ALL listings
      const websiteUrl = newDealForm.website?.trim();
      if (websiteUrl) {
        // Normalize: strip protocol, trailing slash, www prefix for comparison
        const normalizeUrl = (url: string) =>
          url
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/\/+$/, '')
            .toLowerCase();
        const normalizedInput = normalizeUrl(websiteUrl);

        const { data: existingListings, error: existingListingsError } = await supabase
          .from('listings')
          .select('id, title, internal_company_name, website')
          .not('website', 'is', null);
        if (existingListingsError) throw existingListingsError;

        const duplicate = existingListings?.find(
          (l) => l.website && normalizeUrl(l.website) === normalizedInput,
        );

        if (duplicate) {
          const dupName = duplicate.internal_company_name || duplicate.title || 'Unknown';
          throw new Error(
            `A deal with this website already exists: "${dupName}". Use "Add Existing" tab to link it to this universe instead.`,
          );
        }
      }

      const insertData = {
        title: newDealForm.title,
        website: websiteUrl || null,
        location: newDealForm.location?.trim() || null,
        revenue: newDealForm.revenue ? parseFloat(newDealForm.revenue) : null,
        ebitda: newDealForm.ebitda ? parseFloat(newDealForm.ebitda) : null,
        description: newDealForm.description || null,
        is_internal_deal: true,
        status: 'active',
      };

      const { data: listing, error: listingError } = await supabase
        .from('listings')
        .insert(insertData as never)
        .select()
        .maybeSingle();

      if (listingError) throw listingError;
      if (!listing)
        throw new Error(
          'Failed to create listing (no row returned). This is usually an RLS or policy issue.',
        );

      // Link to universe
      const { error: linkError } = await supabase.from('remarketing_universe_deals').insert({
        universe_id: universeId,
        listing_id: listing.id,
        added_by: user.id,
        status: 'active',
      });

      if (linkError) throw linkError;

      return { listing, userId: user.id };
    },
    onSuccess: async ({ listing, userId }) => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'universe-deals', universeId] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals', 'universe', universeId] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      toast.success(`Created "${listing.title}" and added to universe`);

      // Handle transcript file uploads (multiple)
      const filesToUpload = [...transcriptFilesRef.current];
      if (filesToUpload.length > 0 && userId) {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        for (let fi = 0; fi < filesToUpload.length; fi++) {
          const file = filesToUpload[fi];
          try {
            // Add delay between files to avoid rate-limiting the AI parser
            if (fi > 0) {
              await new Promise((r) => setTimeout(r, 1500));
            }

            const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
            const filePath = `${listing.id}/${Date.now()}-${file.name}`;

            const { error: uploadError } = await supabase.storage
              .from('deal-transcripts')
              .upload(filePath, file);

            if (uploadError) {
              toast.error(`Failed to upload ${file.name}`);
              continue;
            }

            const {
              data: { publicUrl },
            } = supabase.storage.from('deal-transcripts').getPublicUrl(filePath);

            // Extract text content
            let transcriptText = '';
            if (['txt', 'vtt', 'srt'].includes(fileExt)) {
              transcriptText = await file.text();
            } else {
              // For PDF/DOC/DOCX, call parse-transcript-file edge function
              try {
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-transcript-file`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${session?.access_token}`,
                  },
                  body: formData,
                });

                if (response.ok) {
                  const result = await response.json();
                  transcriptText = result.text || '';
                } else {
                  // Parse failed — will use fallback text
                }
              } catch (parseErr) {
                // Parse failed — will use fallback text
              }
            }

            await supabase.from('deal_transcripts').insert({
              listing_id: listing.id,
              transcript_url: publicUrl,
              transcript_text: transcriptText || '[text extraction pending]',
              title: file.name,
              created_by: userId,
              source: 'file_upload',
            });
          } catch (err) {
            // Transcript handling error — non-blocking
          }
        }
        if (filesToUpload.length > 0) {
          toast.success(`${filesToUpload.length} transcript(s) uploaded`);
        }
      }

      // Handle transcript link
      if (newDealForm.transcriptLink) {
        try {
          // Save transcript link
          await supabase.from('deal_transcripts').insert({
            listing_id: listing.id,
            transcript_url: newDealForm.transcriptLink,
            transcript_text: 'Pending text extraction from link',
            title: 'Linked Transcript',
            created_by: userId,
            source: 'link',
          });
          toast.success('Transcript link saved');
        } catch (err) {
          // Transcript link error — non-blocking
        }
      }

      // Queue background scoring
      const { queueDealScoring: queueNewDealScoring } =
        await import('@/lib/remarketing/queueScoring');
      await queueNewDealScoring({ universeId, listingIds: [listing.id] });

      setNewDealForm({
        title: '',
        website: '',
        location: '',
        revenue: '',
        ebitda: '',
        description: '',
        transcriptLink: '',
      });
      setTranscriptFiles([]);
      transcriptFilesRef.current = [];
      onDealAdded?.();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      const message =
        typeof error?.message === 'string' && error.message.trim()
          ? error.message
          : 'Failed to create deal';
      setCreateDealError(message);
      toast.error(message);
    },
  });

  const toggleListing = (id: string) => {
    setSelectedListings((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '—';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Deal to {universeName}</DialogTitle>
          <DialogDescription>
            Add existing marketplace listings or create a new deal
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="existing">Add Existing</TabsTrigger>
            <TabsTrigger value="new">Create New</TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="flex-1 flex flex-col min-h-0 mt-4">
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by company name, marketplace title, or location..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Results count */}
            <div className="text-xs text-muted-foreground mb-2">
              {availableListings?.length || 0} listings available
            </div>

            {/* Listings List */}
            <ScrollArea className="h-[350px] border rounded-lg">
              <div className="p-2 space-y-2">
                {loadingListings ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))
                ) : availableListings?.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No listings available</p>
                    <p className="text-sm">All marketplace listings are already in this universe</p>
                  </div>
                ) : (
                  availableListings?.map((listing) => {
                    const isSelected = selectedListings.includes(listing.id);
                    const displayName = listing.internal_company_name || listing.title;
                    const hasRealName = !!listing.internal_company_name;

                    return (
                      <div
                        key={listing.id}
                        onClick={() => toggleListing(listing.id)}
                        className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-primary/10 border-primary shadow-sm'
                            : 'hover:bg-muted/50 border-border hover:border-muted-foreground/30'
                        }`}
                      >
                        {/* Checkbox */}
                        <div
                          className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 mt-0.5 ${
                            isSelected
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'border-muted-foreground/50'
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          {/* Primary name row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground truncate max-w-[280px]">
                              {displayName}
                            </span>
                            {listing.enriched_at && (
                              <Badge
                                variant="secondary"
                                className="text-xs shrink-0 bg-emerald-500/10 text-emerald-600 border-emerald-200"
                              >
                                <Sparkles className="h-3 w-3 mr-1" />
                                Enriched
                              </Badge>
                            )}
                          </div>

                          {/* Secondary title (if different from display name) */}
                          {hasRealName && listing.title && (
                            <p className="text-xs text-muted-foreground truncate">
                              Marketplace: {listing.title}
                            </p>
                          )}

                          {/* Meta row */}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {(() => {
                              const effectiveWebsite = getEffectiveWebsite(listing);
                              return effectiveWebsite ? (
                                <a
                                  href={
                                    effectiveWebsite.startsWith('http')
                                      ? effectiveWebsite
                                      : `https://${effectiveWebsite}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1 text-primary hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Website
                                </a>
                              ) : null;
                            })()}
                            {listing.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {listing.location}
                              </span>
                            )}
                            {listing.revenue && (
                              <span className="flex items-center gap-1 font-medium text-foreground/70">
                                <DollarSign className="h-3 w-3" />
                                {formatCurrency(listing.revenue)}
                              </span>
                            )}
                          </div>

                          {/* Universe badges */}
                          {listing.universes && listing.universes.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap pt-1">
                              <span className="text-xs text-muted-foreground">In:</span>
                              {listing.universes.slice(0, 3).map((u) => (
                                <Badge
                                  key={u.id}
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 h-5 bg-muted/50"
                                >
                                  {u.name}
                                </Badge>
                              ))}
                              {listing.universes.length > 3 && (
                                <span className="text-xs text-muted-foreground">
                                  +{listing.universes.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            {/* Add Button */}
            <div className="pt-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedListings.length} selected
              </span>
              <Button
                onClick={() => addDealsMutation.mutate(selectedListings)}
                disabled={selectedListings.length === 0 || addDealsMutation.isPending}
              >
                {addDealsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Add {selectedListings.length || ''} Deal{selectedListings.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="new" className="flex-1 overflow-auto mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Company Name *</Label>
                <Input
                  id="title"
                  placeholder="Enter company name"
                  value={newDealForm.title}
                  onChange={(e) => setNewDealForm((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Website *</Label>
                <Input
                  id="website"
                  placeholder="https://example.com"
                  value={newDealForm.website}
                  onChange={(e) => setNewDealForm((prev) => ({ ...prev, website: e.target.value }))}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Required for AI enrichment to extract company data
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="City, State"
                  value={newDealForm.location}
                  onChange={(e) =>
                    setNewDealForm((prev) => ({ ...prev, location: e.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="revenue">Revenue</Label>
                  <Input
                    id="revenue"
                    placeholder="$0"
                    value={newDealForm.revenue}
                    onChange={(e) =>
                      setNewDealForm((prev) => ({ ...prev, revenue: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ebitda">EBITDA</Label>
                  <Input
                    id="ebitda"
                    placeholder="$0"
                    value={newDealForm.ebitda}
                    onChange={(e) =>
                      setNewDealForm((prev) => ({ ...prev, ebitda: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of the business..."
                  value={newDealForm.description}
                  onChange={(e) =>
                    setNewDealForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  rows={3}
                />
              </div>

              {/* Transcript Section */}
              <div className="space-y-3 border-t pt-4">
                <Label className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Call Transcripts (Optional)
                </Label>

                {/* Transcript Link */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="transcriptLink"
                      placeholder="Fireflies, Otter.ai, or other transcript link..."
                      value={newDealForm.transcriptLink}
                      onChange={(e) =>
                        setNewDealForm((prev) => ({ ...prev, transcriptLink: e.target.value }))
                      }
                      disabled={transcriptFiles.length > 0}
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex-1 border-t" />
                  <span>or</span>
                  <div className="flex-1 border-t" />
                </div>

                {/* File Upload - Multiple */}
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.vtt,.srt,.pdf,.doc,.docx"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) {
                        setTranscriptFiles((prev) => {
                          const updated = [...prev, ...files];
                          transcriptFilesRef.current = updated;
                          return updated;
                        });
                        setNewDealForm((prev) => ({ ...prev, transcriptLink: '' }));
                      }
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="hidden"
                    id="transcript-file-universe"
                  />

                  {transcriptFiles.length > 0 && (
                    <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                      {transcriptFiles.map((file, idx) => (
                        <div
                          key={file.name}
                          className="flex items-center gap-2 p-2 bg-muted rounded-md"
                        >
                          <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                          <span className="text-sm flex-1 truncate">{file.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setTranscriptFiles((prev) => {
                                const updated = prev.filter((_, i) => i !== idx);
                                transcriptFilesRef.current = updated;
                                return updated;
                              });
                            }}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!!newDealForm.transcriptLink}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {transcriptFiles.length > 0
                      ? `Add More Files (${transcriptFiles.length} selected)`
                      : 'Upload Transcript Files'}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Supports .txt, .vtt, .srt, .pdf, .doc, .docx — select multiple files
                  </p>
                </div>
              </div>

              {createDealError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {createDealError}
                </div>
              )}

              <Button
                onClick={() => createDealMutation.mutate()}
                disabled={
                  !newDealForm.title || !newDealForm.website || createDealMutation.isPending
                }
                className="w-full"
              >
                {createDealMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Create & Add to Universe
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AddDealToUniverseDialog;
