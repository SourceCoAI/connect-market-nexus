import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { History, Mail, Phone, UserPlus } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { AddBuyerToDealDialog } from './AddBuyerToDealDialog';

interface BuyerHistoryEntry {
  id: string;
  title: string | null;
  contact_name: string | null;
  contact_company: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  nda_status: string | null;
  fee_agreement_status: string | null;
  memo_sent: boolean | null;
  created_at: string;
  updated_at: string | null;
  stage_name: string | null;
  stage_color: string | null;
  owner_first: string | null;
  owner_last: string | null;
  remarketing_buyer_id: string | null;
  buyer_company_name: string | null;
  buyer_type: string | null;
  connection_request_id: string | null;
}

interface DealBuyerHistoryTabProps {
  listingId: string;
  listingTitle?: string;
}

export function DealBuyerHistoryTab({ listingId, listingTitle }: DealBuyerHistoryTabProps) {
  const [addBuyerOpen, setAddBuyerOpen] = useState(false);
  const { data: entries, isLoading } = useQuery({
    queryKey: ['deal-buyer-history', listingId],
    queryFn: async () => {
       
      const { data, error } = (await supabase
        .from('deal_pipeline')
        .select(
          `
          id,
          title,
          contact_name,
          contact_company,
          contact_email,
          contact_phone,
          nda_status,
          fee_agreement_status,
          created_at,
          updated_at,
          remarketing_buyer_id,
          connection_request_id,
          deal_stages!deals_stage_id_fkey ( name, color ),
          profiles!deals_assigned_to_fkey ( first_name, last_name ),
          buyers!deals_remarketing_buyer_id_fkey ( company_name, buyer_type )
        `,
        )
        .eq('listing_id', listingId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })) as { data: any[] | null; error: any };

      if (error) throw error;

      return (data || []).map((d: Record<string, unknown>) => {
        const deal_stages = d.deal_stages as { name: string; color: string } | null;
        const profiles = d.profiles as { first_name: string; last_name: string } | null;
        const buyers = d.buyers as {
          company_name: string;
          buyer_type: string;
        } | null;
        return {
          id: d.id as string,
          title: d.title as string | null,
          contact_name: d.contact_name as string | null,
          contact_company: d.contact_company as string | null,
          contact_email: d.contact_email as string | null,
          contact_phone: d.contact_phone as string | null,
          nda_status: d.nda_status as string | null,
          fee_agreement_status: d.fee_agreement_status as string | null,
          memo_sent: false,
          created_at: d.created_at as string,
          updated_at: d.updated_at as string | null,
          stage_name: deal_stages?.name || null,
          stage_color: deal_stages?.color || null,
          owner_first: profiles?.first_name || null,
          owner_last: profiles?.last_name || null,
          remarketing_buyer_id: d.remarketing_buyer_id as string | null,
          buyer_company_name: buyers?.company_name || null,
          buyer_type: buyers?.buyer_type || null,
          connection_request_id: d.connection_request_id as string | null,
        };
      }) as BuyerHistoryEntry[];
    },
    enabled: !!listingId,
  });

  // Group by stage for summary
  const stageSummary = entries?.reduce(
    (acc, e) => {
      const stage = e.stage_name || 'Unknown';
      acc[stage] = (acc[stage] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const closedWon = entries?.filter((e) => e.stage_name === 'Closed Won').length || 0;
  const closedLost = entries?.filter((e) => e.stage_name === 'Closed Lost').length || 0;
  const active = (entries?.length || 0) - closedWon - closedLost;

  const StatusIndicator = ({ status, label }: { status: string | null; label: string }) => {
    const color =
      status === 'signed'
        ? 'bg-emerald-500'
        : status === 'sent'
          ? 'bg-amber-500'
          : status === 'declined'
            ? 'bg-destructive'
            : 'bg-muted-foreground/30';
    return (
      <div className="flex items-center gap-1.5">
        <div className={cn('w-2 h-2 rounded-full', color)} />
        <span className="text-xs text-muted-foreground">
          {label}:{' '}
          {status === 'signed'
            ? 'Signed'
            : status === 'sent'
              ? 'Sent'
              : status === 'declined'
                ? 'Declined'
                : 'Not Sent'}
        </span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <>
        <Card>
          <CardContent className="py-12 text-center">
            <History className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No buyer history for this deal yet</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-2"
              onClick={() => setAddBuyerOpen(true)}
            >
              <UserPlus className="h-4 w-4" />
              Add Buyer to Deal
            </Button>
          </CardContent>
        </Card>
        <AddBuyerToDealDialog
          open={addBuyerOpen}
          onOpenChange={setAddBuyerOpen}
          listingId={listingId}
          listingTitle={listingTitle || 'This Deal'}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-4">
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold">{entries.length}</div>
            <div className="text-xs text-muted-foreground">Total Buyers</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-primary">{active}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">{closedWon}</div>
            <div className="text-xs text-muted-foreground">Closed Won</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-destructive">{closedLost}</div>
            <div className="text-xs text-muted-foreground">Closed Lost</div>
          </CardContent>
        </Card>
      </div>

      {/* Stage Breakdown */}
      {stageSummary && Object.keys(stageSummary).length > 1 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium">Stage Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stageSummary).map(([stage, count]) => (
                <Badge key={stage} variant="outline" className="text-xs">
                  {stage}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Buyer List */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5" />
              Buyer History
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setAddBuyerOpen(true)}
            >
              <UserPlus className="h-4 w-4" />
              Add Buyer
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="p-4 rounded-lg border border-border/40 hover:border-border/60 transition-colors space-y-2"
            >
              {/* Row 1: Name + Stage */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground">
                      {entry.buyer_company_name ||
                        entry.contact_company ||
                        entry.contact_name ||
                        'Unknown Buyer'}
                    </span>
                    {entry.buyer_type && (
                      <Badge variant="outline" className="text-[10px]">
                        {entry.buyer_type.replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </div>
                  {(entry.buyer_company_name || entry.contact_company) && entry.contact_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">{entry.contact_name}</p>
                  )}
                </div>
                {entry.stage_name && (
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0"
                    style={{
                      borderColor: entry.stage_color || undefined,
                      color: entry.stage_color || undefined,
                    }}
                  >
                    {entry.stage_name}
                  </span>
                )}
              </div>

              {/* Row 2: Contact info */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {entry.contact_email && (
                  <a
                    href={`mailto:${entry.contact_email}`}
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    <Mail className="h-3 w-3" />
                    <span className="font-mono truncate max-w-[180px]">{entry.contact_email}</span>
                  </a>
                )}
                {entry.contact_phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {entry.contact_phone}
                  </span>
                )}
              </div>

              {/* Row 3: Status indicators */}
              <div className="flex items-center gap-4 flex-wrap">
                <StatusIndicator status={entry.nda_status} label="NDA" />
                <StatusIndicator status={entry.fee_agreement_status} label="Fee" />
                {entry.memo_sent && (
                  <Badge variant="secondary" className="text-[10px] h-5">
                    Memo Sent
                  </Badge>
                )}
                {entry.owner_first && (
                  <span className="text-xs text-muted-foreground">
                    Owner: {entry.owner_first} {entry.owner_last}
                  </span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  Added {format(new Date(entry.created_at), 'MMM d, yyyy')}
                  {entry.updated_at && (
                    <>
                      {' '}
                      · Updated{' '}
                      {formatDistanceToNow(new Date(entry.updated_at), { addSuffix: true })}
                    </>
                  )}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <AddBuyerToDealDialog
        open={addBuyerOpen}
        onOpenChange={setAddBuyerOpen}
        listingId={listingId}
        listingTitle={listingTitle || 'This Deal'}
      />
    </div>
  );
}
