import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GitBranch, ExternalLink, Users, Shield, FileCheck, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { AgreementStatusBadge } from '@/components/admin/firm-agreements/AgreementStatusBadge';
import type { AgreementStatus } from '@/hooks/admin/use-firm-agreements';
import { AddBuyerToDealDialog } from './AddBuyerToDealDialog';

interface DealPipelineEntry {
  id: string;
  title: string | null;
  status: string | null;
  probability: number | null;
  nda_status: string | null;
  fee_agreement_status: string | null;
  created_at: string;
  remarketing_buyer_id: string | null;
  remarketing_buyer: {
    id: string;
    company_name: string | null;
    buyer_type: string | null;
  } | null;
  stage: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  assigned_to_profile: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export const DealPipelinePanel = ({
  listingId,
  listingTitle,
}: {
  listingId: string;
  listingTitle?: string;
}) => {
  const [addBuyerOpen, setAddBuyerOpen] = useState(false);
  const { data: pipelineEntries, isLoading } = useQuery({
    queryKey: ['deal-pipeline', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_pipeline')
        .select(
          `
          id,
          title,
          status,
          probability,
          nda_status,
          fee_agreement_status,
          created_at,
          remarketing_buyer_id,
          remarketing_buyer:buyers(id, company_name, buyer_type),
          stage:deal_stages(id, name, color),
          assigned_to_profile:profiles!deals_assigned_to_fkey(id, first_name, last_name)
        `,
        )
        .eq('listing_id', listingId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as DealPipelineEntry[];
    },
    enabled: !!listingId,
  });

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Buyer Pipeline
            {pipelineEntries && pipelineEntries.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pipelineEntries.length} {pipelineEntries.length === 1 ? 'buyer' : 'buyers'}
              </Badge>
            )}
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
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !pipelineEntries || pipelineEntries.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No buyers in pipeline for this deal</p>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link to={`/admin/deals/pipeline`}>View Pipeline</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {pipelineEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to={`/admin/buyers/${entry.remarketing_buyer_id}`}
                      className="font-medium text-sm hover:underline text-primary"
                    >
                      {entry.remarketing_buyer?.company_name || entry.title || 'Unknown Buyer'}
                    </Link>
                    {entry.remarketing_buyer?.buyer_type && (
                      <Badge variant="outline" className="text-xs">
                        {entry.remarketing_buyer.buyer_type.replace('_', ' ')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {entry.stage && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                        style={{
                          backgroundColor: entry.stage.color ? `${entry.stage.color}20` : undefined,
                          borderColor: entry.stage.color || undefined,
                          color: entry.stage.color || undefined,
                        }}
                      >
                        {entry.stage.name}
                      </span>
                    )}
                    {entry.probability != null && <span>{entry.probability}% probability</span>}
                    {entry.nda_status &&
                      entry.nda_status !== 'none' &&
                      entry.nda_status !== 'not_sent' && (
                        <span className="inline-flex items-center gap-1">
                          <Shield className="h-3 w-3 text-muted-foreground" />
                          <AgreementStatusBadge
                            status={
                              (entry.nda_status === 'not_sent'
                                ? 'not_started'
                                : entry.nda_status) as AgreementStatus
                            }
                            size="sm"
                          />
                        </span>
                      )}
                    {entry.fee_agreement_status &&
                      entry.fee_agreement_status !== 'none' &&
                      entry.fee_agreement_status !== 'not_sent' && (
                        <span className="inline-flex items-center gap-1">
                          <FileCheck className="h-3 w-3 text-muted-foreground" />
                          <AgreementStatusBadge
                            status={
                              (entry.fee_agreement_status === 'not_sent'
                                ? 'not_started'
                                : entry.fee_agreement_status) as AgreementStatus
                            }
                            size="sm"
                          />
                        </span>
                      )}
                    <span>Added {format(new Date(entry.created_at), 'MMM d, yyyy')}</span>
                  </div>
                </div>
                {entry.assigned_to_profile && (
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">
                    {entry.assigned_to_profile.first_name} {entry.assigned_to_profile.last_name}
                  </span>
                )}
              </div>
            ))}
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/deals/pipeline">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  View Full Pipeline
                </Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <AddBuyerToDealDialog
        open={addBuyerOpen}
        onOpenChange={setAddBuyerOpen}
        listingId={listingId}
        listingTitle={listingTitle || 'This Deal'}
      />
    </Card>
  );
};
