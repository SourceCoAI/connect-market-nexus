import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cloud } from 'lucide-react';
import { format } from 'date-fns';

interface SalesforceInfoCardProps {
  deal: Record<string, any>;
}

export function SalesforceInfoCard({ deal }: SalesforceInfoCardProps) {
  if (deal.deal_source !== 'salesforce_remarketing') return null;

  const interestBadgeClass =
    deal.sf_interest_in_selling === 'Yes, right now'
      ? 'bg-green-50 text-green-700 border-green-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <Card className="border-teal-200 bg-teal-50/30">
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center gap-2 text-teal-800">
          <Cloud className="h-5 w-5" />
          Salesforce Info
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Top grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {deal.sf_remarketing_reason && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Remarketing Reason
              </p>
              <p className="text-sm font-medium">{deal.sf_remarketing_reason}</p>
            </div>
          )}
          {deal.sf_interest_in_selling && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Interest in Selling
              </p>
              <Badge variant="outline" className={interestBadgeClass}>
                {deal.sf_interest_in_selling}
              </Badge>
            </div>
          )}
          {deal.sf_tier && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Tier
              </p>
              <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">
                Tier {deal.sf_tier}
              </Badge>
            </div>
          )}
          {deal.sf_target_stage && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Target Stage
              </p>
              <p className="text-sm">{deal.sf_target_stage}</p>
            </div>
          )}
        </div>

        {/* Secondary fields */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          {deal.sf_target_sub_stage && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Target Sub-Stage
              </p>
              <p>{deal.sf_target_sub_stage}</p>
            </div>
          )}
          {deal.sf_marketplace_sub_stage && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Marketplace Sub-Stage
              </p>
              <p>{deal.sf_marketplace_sub_stage}</p>
            </div>
          )}
          {deal.sf_remarketing_target_stages && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Remarketing Target Stages
              </p>
              <p>{deal.sf_remarketing_target_stages}</p>
            </div>
          )}
          {deal.sf_remarketing_cb_create_date && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Conversion Date
              </p>
              <p>{format(new Date(deal.sf_remarketing_cb_create_date), 'MMM d, yyyy')}</p>
            </div>
          )}
        </div>

        {/* SF IDs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          {deal.salesforce_account_id && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                SF Account ID
              </p>
              <p className="font-mono text-xs">{deal.salesforce_account_id}</p>
            </div>
          )}
          {deal.sf_owner_id && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                SF Owner ID
              </p>
              <p className="font-mono text-xs">{deal.sf_owner_id}</p>
            </div>
          )}
          {deal.sf_previous_search_opportunity_id && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Previous Search Opp
              </p>
              <p className="font-mono text-xs">{deal.sf_previous_search_opportunity_id}</p>
            </div>
          )}
          {deal.sf_primary_opportunity_id && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Primary Opportunity
              </p>
              <p className="font-mono text-xs">{deal.sf_primary_opportunity_id}</p>
            </div>
          )}
          {deal.sf_primary_client_account_id && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Primary Client Account
              </p>
              <p className="font-mono text-xs">{deal.sf_primary_client_account_id}</p>
            </div>
          )}
        </div>

        {/* Collapsible notes */}
        {deal.sf_note_summary && (
          <details>
            <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
              Note Summary
            </summary>
            <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap bg-white/60 rounded-md p-3 border">
              {deal.sf_note_summary}
            </p>
          </details>
        )}
        {deal.sf_historic_note_summary && (
          <details>
            <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
              Historic Notes
            </summary>
            <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap bg-white/60 rounded-md p-3 border">
              {deal.sf_historic_note_summary}
            </p>
          </details>
        )}
        {deal.sf_remarks_internal && (
          <details>
            <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
              Internal Remarks
            </summary>
            <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap bg-white/60 rounded-md p-3 border">
              {deal.sf_remarks_internal}
            </p>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
