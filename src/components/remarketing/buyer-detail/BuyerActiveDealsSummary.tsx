import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

export function BuyerActiveDealsSummary({ buyerId }: { buyerId: string }) {
  const { data: activeDeals = [] } = useQuery({
    queryKey: ['buyer-active-deals', buyerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('deal_pipeline')
        .select('id, listing_id, title, last_activity_at, stage_id')
        .eq('remarketing_buyer_id', buyerId)
        .is('deleted_at', null)
        .order('last_activity_at', { ascending: false });
      if (error) return [];
      return data || [];
    },
    enabled: !!buyerId,
  });

  if (activeDeals.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
      <Badge variant="outline" className="text-xs font-medium">
        Active on {activeDeals.length} deals
      </Badge>
      {activeDeals.slice(0, 3).map((d: any) => (
        <Link
          key={d.id}
          to={`/admin/remarketing/deals/${d.listing_id}`}
          className="text-xs text-primary hover:underline"
        >
          {d.title || 'Untitled'}
          {d.last_activity_at && (
            <span className="text-muted-foreground ml-1">
              ({formatDistanceToNow(new Date(d.last_activity_at), { addSuffix: true })})
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
