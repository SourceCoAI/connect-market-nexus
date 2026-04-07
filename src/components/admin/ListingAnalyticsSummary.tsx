import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Eye, Bookmark, UserPlus } from 'lucide-react';

interface ListingAnalyticsSummaryProps {
  listingId: string;
}

/**
 * Marketplace analytics summary for a listing.
 * Aggregates views, saves, and connection requests from listing_analytics table.
 */
export function ListingAnalyticsSummary({ listingId }: ListingAnalyticsSummaryProps) {
  const { data: analytics } = useQuery({
    queryKey: ['listing-analytics-summary', listingId],
    queryFn: async () => {
      // Fetch aggregated counts by action type from listing_analytics
      const [viewsResult, savesResult, connectionsResult] = await Promise.all([
        supabase
          .from('listing_analytics')
          .select('id', { count: 'exact', head: true })
          .eq('listing_id', listingId)
          .eq('action_type', 'view'),
        supabase
          .from('listing_analytics')
          .select('id', { count: 'exact', head: true })
          .eq('listing_id', listingId)
          .eq('action_type', 'save'),
        supabase
          .from('listing_analytics')
          .select('id', { count: 'exact', head: true })
          .eq('listing_id', listingId)
          .eq('action_type', 'request_connection'),
      ]);

      return {
        views: viewsResult.count ?? 0,
        saves: savesResult.count ?? 0,
        connections: connectionsResult.count ?? 0,
      };
    },
    staleTime: 60 * 1000,
  });

  const views = analytics?.views ?? 0;
  const saves = analytics?.saves ?? 0;
  const connections = analytics?.connections ?? 0;

  if (views === 0 && saves === 0 && connections === 0) {
    return null;
  }

  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 mb-2">
        Marketplace Activity
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Eye className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{views}</span>
          <span className="text-xs">views</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Bookmark className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{saves}</span>
          <span className="text-xs">saves</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <UserPlus className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{connections}</span>
          <span className="text-xs">requests</span>
        </div>
      </div>
    </div>
  );
}
