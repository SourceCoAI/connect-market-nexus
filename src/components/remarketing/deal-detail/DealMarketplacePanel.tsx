import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Globe, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { usePublishListing } from "@/hooks/admin/listings/use-publish-listing";

interface DealMarketplacePanelProps {
  listingId: string;
  isInternalDeal: boolean | null;
  status: string | null;
  title: string | null;
}

export const DealMarketplacePanel = ({
  listingId,
  isInternalDeal,
  status,
  title: _title,
}: DealMarketplacePanelProps) => {
  const queryClient = useQueryClient();
  const isListed = isInternalDeal === false && status === 'active';

  const { publishListing, unpublishListing, isPublishing } = usePublishListing();

  // Fetch marketplace analytics for this listing
  const { data: marketplaceStats } = useQuery({
    queryKey: ['marketplace-stats', listingId],
    queryFn: async () => {
      // Count connection requests
      const { count: requestCount, error: reqError } = await supabase
        .from('connection_requests')
        .select('*', { count: 'exact', head: true })
        .eq('listing_id', listingId);

      // Count views from analytics
      const { count: viewCount, error: viewError } = await supabase
        .from('listing_analytics' as never)
        .select('*', { count: 'exact', head: true })
        .eq('listing_id', listingId)
        .eq('event_type', 'view');

      return {
        connectionRequests: reqError ? 0 : (requestCount || 0),
        views: viewError ? 0 : (viewCount || 0),
      };
    },
    enabled: isListed,
  });

  const handlePublish = () => {
    publishListing(listingId);
    // Invalidate deal queries after publish settles
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal', listingId] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
    }, 1000);
  };

  const handleUnpublish = () => {
    unpublishListing(listingId);
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal', listingId] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
    }, 1000);
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Marketplace
          </CardTitle>
          {isListed ? (
            <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
              Listed
            </Badge>
          ) : (
            <Badge variant="secondary">Not Listed</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isListed ? (
          <div className="space-y-4">
            {/* Marketplace stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-xl font-bold">{marketplaceStats?.views ?? 0}</div>
                <div className="text-xs text-muted-foreground">Views</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-xl font-bold">{marketplaceStats?.connectionRequests ?? 0}</div>
                <div className="text-xs text-muted-foreground">Connection Requests</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to={`/listing/${listingId}`} target="_blank">
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                  View on Marketplace
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnpublish}
                disabled={isPublishing}
                className="text-amber-600 border-amber-200 hover:bg-amber-50"
              >
                <EyeOff className="h-3.5 w-3.5 mr-1.5" />
                Unlist from Marketplace
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This deal is not currently listed on the marketplace. Publishing will validate quality requirements (title, description, image, memos) before making it visible to buyers.
            </p>
            <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Publishing requires: title, description, category, location, revenue, image, and memo PDFs.</span>
            </div>
            <Button
              onClick={handlePublish}
              disabled={isPublishing}
              className="gap-2"
            >
              <Globe className="h-4 w-4" />
              {isPublishing ? 'Publishing...' : 'Publish to Marketplace'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
