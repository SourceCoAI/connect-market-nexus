import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Deal } from '@/hooks/admin/use-deals';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface PipelineDetailOtherBuyersProps {
  deal: Deal;
}

interface OtherBuyerDeal {
  id: string;
  title: string;
  contact_name: string | null;
  contact_company: string | null;
  contact_email: string | null;
  nda_status: string | null;
  fee_agreement_status: string | null;
  assigned_to: string | null;
  updated_at: string | null;
  created_at: string;
  stage_name: string | null;
  stage_color: string | null;
  owner_name: string | null;
}

export function PipelineDetailOtherBuyers({ deal }: PipelineDetailOtherBuyersProps) {
  const { data: otherBuyers, isLoading } = useQuery({
    queryKey: ['pipeline-other-buyers', deal.listing_id, deal.deal_id],
    queryFn: async () => {
      if (!deal.listing_id) return [];

       
      const { data, error } = (await supabase
        .from('deal_pipeline')
        .select(
          `
          id,
          title,
          contact_name,
          contact_company,
          contact_email,
          nda_status,
          fee_agreement_status,
          assigned_to,
          updated_at,
          created_at,
          deal_stages!deals_stage_id_fkey ( name, color ),
          profiles!deals_assigned_to_fkey ( first_name, last_name )
        `,
        )
        .eq('listing_id', deal.listing_id)
        .neq('id', deal.deal_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50)) as {
        data: Record<string, unknown>[] | null;
        error: { message: string } | null;
      };

      if (error) throw error;

      return (data || []).map((d: Record<string, unknown>) => {
        const stages = d.deal_stages as Record<string, unknown> | null;
        const profiles = d.profiles as Record<string, unknown> | null;
        return {
          id: d.id,
          title: d.title,
          contact_name: d.contact_name,
          contact_company: d.contact_company,
          contact_email: d.contact_email,
          nda_status: d.nda_status,
          fee_agreement_status: d.fee_agreement_status,
          assigned_to: d.assigned_to,
          updated_at: d.updated_at,
          created_at: d.created_at,
          stage_name: stages?.name || null,
          stage_color: stages?.color || null,
          owner_name: profiles
            ? `${profiles.first_name || ''} ${profiles.last_name || ''}`.trim() || null
            : null,
        };
      }) as OtherBuyerDeal[];
    },
    enabled: !!deal.listing_id,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!otherBuyers || otherBuyers.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <div className="text-center space-y-2">
          <Users className="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">No other buyers for this deal</p>
        </div>
      </div>
    );
  }

  const StatusDot = ({ status, label }: { status: string | null; label: string }) => (
    <div className="flex items-center gap-1.5">
      <div
        className={cn(
          'w-2 h-2 rounded-full',
          status === 'signed'
            ? 'bg-emerald-500'
            : status === 'sent'
              ? 'bg-amber-500'
              : status === 'declined'
                ? 'bg-destructive'
                : 'bg-muted-foreground/30',
        )}
      />
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );

  return (
    <ScrollArea className="flex-1">
      <div className="px-6 pb-8 space-y-2">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">
            {otherBuyers.length} Other Buyer{otherBuyers.length !== 1 ? 's' : ''}
          </h3>
        </div>

        {otherBuyers.map((buyer) => (
          <div
            key={buyer.id}
            className="p-4 border border-border/40 rounded-lg hover:border-border/60 transition-colors space-y-2"
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {buyer.contact_company || buyer.contact_name || 'Unknown'}
                </p>
                {buyer.contact_company && buyer.contact_name && (
                  <p className="text-xs text-muted-foreground truncate">{buyer.contact_name}</p>
                )}
                {buyer.contact_email && (
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {buyer.contact_email}
                  </p>
                )}
              </div>
              {buyer.stage_name && (
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0"
                  style={{
                    borderColor: buyer.stage_color || undefined,
                    color: buyer.stage_color || undefined,
                  }}
                >
                  {buyer.stage_name}
                </span>
              )}
            </div>

            <div className="flex items-center gap-4">
              <StatusDot status={buyer.nda_status} label="NDA" />
              <StatusDot status={buyer.fee_agreement_status} label="Fee" />
              {buyer.owner_name && (
                <span className="text-[11px] text-muted-foreground">Owner: {buyer.owner_name}</span>
              )}
              <span className="text-[11px] text-muted-foreground ml-auto">
                {formatDistanceToNow(new Date(buyer.updated_at || buyer.created_at), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
