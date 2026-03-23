import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, ExternalLink, Target } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface CapTargetInfoCardProps {
  deal: Record<string, any>;
  dealId: string;
}

export function CapTargetInfoCard({ deal, dealId }: CapTargetInfoCardProps) {
  const queryClient = useQueryClient();

  if (deal.deal_source !== 'captarget') return null;

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center gap-2 text-blue-800">
          <Target className="h-5 w-5" />
          CapTarget Info
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {deal.captarget_client_name && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Client
              </p>
              <p className="text-sm font-medium">{deal.captarget_client_name}</p>
            </div>
          )}
          {deal.captarget_contact_date && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Contact Date
              </p>
              <p className="text-sm">
                {format(new Date(deal.captarget_contact_date), 'MMM d, yyyy')}
              </p>
            </div>
          )}
          {deal.captarget_outreach_channel && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Outreach Channel
              </p>
              <p className="text-sm">{deal.captarget_outreach_channel}</p>
            </div>
          )}
          {deal.captarget_interest_type && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Interest Type
              </p>
              <Badge
                variant="outline"
                className={
                  deal.captarget_interest_type === 'interest'
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : deal.captarget_interest_type === 'no_interest'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : deal.captarget_interest_type === 'keep_in_mind'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-gray-50 text-gray-600 border-gray-200'
                }
              >
                {deal.captarget_interest_type === 'interest'
                  ? 'Interest'
                  : deal.captarget_interest_type === 'no_interest'
                    ? 'No Interest'
                    : deal.captarget_interest_type === 'keep_in_mind'
                      ? 'Keep in Mind'
                      : 'Unknown'}
              </Badge>
            </div>
          )}
        </div>
        {/* Push status */}
        <div className="mt-3 flex items-center gap-4">
          {deal.pushed_to_all_deals ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
              <Check className="h-3 w-3" />
              Pushed to Active Deals
              {deal.pushed_to_all_deals_at && (
                <span className="text-green-500 ml-1">
                  {format(new Date(deal.pushed_to_all_deals_at), 'MMM d, yyyy')}
                </span>
              )}
            </Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={async () => {
                const { error } = await supabase
                  .from('listings')
                  .update({
                    status: 'active',
                    remarketing_status: 'active',
                    pushed_to_all_deals: true,
                    pushed_to_all_deals_at: new Date().toISOString(),
                  })
                  .eq('id', dealId);
                if (error) {
                  toast.error('Failed to push deal');
                } else {
                  toast.success('Deal pushed to Active Deals');
                  queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal', dealId] });
                  queryClient.invalidateQueries({ queryKey: ['remarketing', 'captarget-deals'] });
                  queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
                }
              }}
            >
              Push to Active Deals
            </Button>
          )}
          {deal.captarget_source_url && (
            <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground" asChild>
              <a href={deal.captarget_source_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3" />
                View in Google Sheet
              </a>
            </Button>
          )}
        </div>
        {/* Call notes collapsible */}
        {deal.captarget_call_notes && (
          <details className="mt-3">
            <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
              Original Call Notes
            </summary>
            <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap bg-white/60 rounded-md p-3 border">
              {deal.captarget_call_notes}
            </p>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
