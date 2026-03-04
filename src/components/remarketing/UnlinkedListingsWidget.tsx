import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle,
  Link as LinkIcon,
  Sparkles,
  ExternalLink,
  Loader2,
  Target,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface UniverseSuggestion {
  universe_id: string;
  universe_name: string;
  confidence: number;
  reason: string;
  matching_criteria: string[];
}

export const UnlinkedListingsWidget = () => {
  const queryClient = useQueryClient();
  const [selectedListing, setSelectedListing] = useState<{
    id: string;
    title: string;
    category: string | null;
    location: string | null;
    revenue: number | null;
    created_at: string;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUniverse, setSelectedUniverse] = useState<string>('');
  const [suggestions, setSuggestions] = useState<UniverseSuggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  // Fetch unlinked active listings
  const { data: unlinkedListings, isLoading } = useQuery({
    queryKey: ['remarketing', 'unlinked-listings'],
    queryFn: async () => {
      // Get all active listings
      const { data: listings, error: listingsError } = await supabase
        .from('listings')
        .select('id, title, category, location, revenue, created_at')
        .is('deleted_at', null)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (listingsError) throw listingsError;

      // Get all linked listing IDs
      const { data: links, error: linksError } = await supabase
        .from('remarketing_universe_deals')
        .select('listing_id');

      if (linksError) throw linksError;

      const linkedIds = new Set((links || []).map((l) => l.listing_id));

      // Filter to unlinked only
      return (listings || []).filter((l) => !linkedIds.has(l.id));
    },
  });

  // Fetch all universes for the dropdown
  const { data: universes } = useQuery({
    queryKey: ['remarketing', 'universes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buyer_universes')
        .select('id, name')
        .eq('archived', false)
        .order('name');

      if (error) throw error;
      return data || [];
    },
  });

  // Link listing to universe mutation
  const linkMutation = useMutation({
    mutationFn: async ({ listingId, universeId }: { listingId: string; universeId: string }) => {
      const { error } = await supabase.from('remarketing_universe_deals').insert({
        listing_id: listingId,
        universe_id: universeId,
        status: 'active',
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'unlinked-listings'] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'universes'] });
      toast.success('Listing linked to universe');
      setDialogOpen(false);
      setSelectedListing(null);
      setSelectedUniverse('');
      setSuggestions([]);
    },
    onError: () => {
      toast.error('Failed to link listing');
    },
  });

  // Get AI suggestions
  const handleGetSuggestions = async (listingId: string) => {
    setIsSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-universe', {
        body: { listing_id: listingId },
      });

      if (error) throw error;

      setSuggestions(data.suggestions || []);
      if (data.suggestions?.length === 0) {
        toast.info('No strong universe matches found - select manually');
      }
    } catch (error) {
      toast.error('Failed to get AI suggestions');
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleOpenDialog = async (listing: {
    id: string;
    title: string;
    category: string | null;
    location: string | null;
    revenue: number | null;
    created_at: string;
  }) => {
    setSelectedListing(listing);
    setDialogOpen(true);
    setSelectedUniverse('');
    setSuggestions([]);
    // Auto-get suggestions
    await handleGetSuggestions(listing.id);
  };

  const handleLink = () => {
    if (!selectedListing || !selectedUniverse) return;
    linkMutation.mutate({
      listingId: selectedListing.id,
      universeId: selectedUniverse,
    });
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return '—';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Unlinked Listings</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!unlinkedListings || unlinkedListings.length === 0) {
    return null; // Don't show widget if all listings are linked
  }

  return (
    <>
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-lg">Unlinked Listings</CardTitle>
            </div>
            <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
              {unlinkedListings.length} not being matched
            </Badge>
          </div>
          <CardDescription>
            These marketplace listings aren't linked to any buyer universe yet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px] pr-4">
            <div className="space-y-2">
              {unlinkedListings.slice(0, 10).map((listing) => (
                <div
                  key={listing.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{listing.title}</p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{listing.category || 'Uncategorized'}</span>
                      {listing.revenue && <span>{formatCurrency(listing.revenue)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button variant="outline" size="sm" onClick={() => handleOpenDialog(listing)}>
                      <LinkIcon className="h-4 w-4 mr-1" />
                      Link
                    </Button>
                    <Button variant="ghost" size="icon" asChild>
                      <Link to={`/admin/remarketing/matching/${listing.id}`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          {unlinkedListings.length > 10 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              +{unlinkedListings.length - 10} more unlinked listings
            </p>
          )}
        </CardContent>
      </Card>

      {/* Link Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link to Buyer Universe</DialogTitle>
            <DialogDescription>
              Connect "{selectedListing?.title}" to a buyer universe for matching
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* AI Suggestions */}
            {isSuggesting ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Getting AI suggestions...
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-1">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  AI Suggestions
                </p>
                <div className="space-y-2">
                  {suggestions.map((s) => (
                    <button
                      key={s.universe_id}
                      onClick={() => setSelectedUniverse(s.universe_id)}
                      className={`w-full p-3 rounded-lg border text-left transition-colors ${
                        selectedUniverse === s.universe_id
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4 text-primary" />
                          <span className="font-medium">{s.universe_name}</span>
                        </div>
                        <Badge variant={s.confidence >= 80 ? 'default' : 'secondary'}>
                          {s.confidence}% match
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{s.reason}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No strong matches found - select a universe manually
              </p>
            )}

            {/* Manual Selection */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Or select manually:</p>
              <Select value={selectedUniverse} onValueChange={setSelectedUniverse}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a universe..." />
                </SelectTrigger>
                <SelectContent>
                  {universes?.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {u.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleLink} disabled={!selectedUniverse || linkMutation.isPending}>
                {linkMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Linking...
                  </>
                ) : (
                  <>
                    <LinkIcon className="h-4 w-4 mr-2" />
                    Link to Universe
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
