import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileText, CheckCircle, XCircle, HelpCircle, Clock, Users, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMyPortalUser } from '@/hooks/portal/use-portal-users';
import { useMyPortalDeals } from '@/hooks/portal/use-portal-deals';
import { usePortalMessageSummaries } from '@/hooks/portal/use-portal-messages';
import { PushStatusBadge } from '@/components/portal/PortalStatusBadge';
import { CompanyDetailsModal } from '@/components/portal/CompanyDetailsModal';
import type { PortalDealPush } from '@/types/portal';

export default function PortalDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const { data: portalUser, isLoading: userLoading, status } = useMyPortalUser(slug);
  const { data: deals, isLoading: dealsLoading } = useMyPortalDeals(portalUser?.portal_org?.id);
  const { data: messageSummaries } = usePortalMessageSummaries(
    portalUser?.portal_org?.id,
    'portal_user',
  );

  if (userLoading || status === 'pending') return <div className="py-12 text-center text-muted-foreground">Loading portal...</div>;
  if (!portalUser) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground mb-4">You do not have access to this portal.</p>
        <Link to="/">
          <Button variant="outline">Go to Marketplace</Button>
        </Link>
      </div>
    );
  }

  const [companyModalDeal, setCompanyModalDeal] = useState<PortalDealPush | null>(null);

  const statusCounts: Record<string, number> = {};
  (deals || []).forEach((d) => {
    statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
  });

  const pending = statusCounts['pending_review'] || 0;
  const interested = statusCounts['interested'] || 0;
  const passed = statusCounts['passed'] || 0;
  const needsInfo = statusCounts['needs_info'] || 0;

  // Unread messages across all deals
  const totalUnread = Object.values(messageSummaries || {}).reduce((sum, s) => sum + s.unread, 0);
  const dealsWithUnread = Object.values(messageSummaries || {}).filter((s) => s.unread > 0).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{portalUser.portal_org.name}</h1>
            {portalUser.portal_org.welcome_message && (
              <p className="text-muted-foreground mt-2 max-w-2xl">
                {portalUser.portal_org.welcome_message}
              </p>
            )}
          </div>
          {portalUser.role === 'admin' && (
            <Link to={`/portal/${slug}/team`}>
              <Button variant="outline" size="sm">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Manage Team
              </Button>
            </Link>
          )}
        </div>

        {/* Unread messages banner */}
        {totalUnread > 0 && (
          <Link to={`/portal/${slug}/deals`}>
            <Card className="border-blue-200 bg-blue-50 hover:bg-blue-100/80 transition-colors cursor-pointer">
              <CardContent className="pt-5 pb-5 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    {totalUnread} new message{totalUnread !== 1 ? 's' : ''} across {dealsWithUnread} deal{dealsWithUnread !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-blue-700">Click to view your deals and respond</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <Clock className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{pending}</div>
                <p className="text-sm text-muted-foreground">Awaiting Review</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{interested}</div>
                <p className="text-sm text-muted-foreground">Interested</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-400" />
              <div>
                <div className="text-2xl font-bold">{passed}</div>
                <p className="text-sm text-muted-foreground">Passed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <HelpCircle className="h-8 w-8 text-orange-400" />
              <div>
                <div className="text-2xl font-bold">{needsInfo}</div>
                <p className="text-sm text-muted-foreground">Needs Info</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent deals */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Deals</CardTitle>
            <Link to={`/portal/${slug}/deals`}>
              <Button variant="outline" size="sm">View All Deals</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {dealsLoading ? (
              <p className="text-muted-foreground">Loading deals...</p>
            ) : (deals || []).length === 0 ? (
              <p className="text-muted-foreground py-4 text-center">
                No deals have been shared with you yet. Check back soon.
              </p>
            ) : (
              <div className="space-y-2">
                {(deals || []).slice(0, 5).map((deal) => {
                  const msgSummary = messageSummaries?.[deal.id];
                  const hasUnread = (msgSummary?.unread || 0) > 0;

                  return (
                    <Link
                      key={deal.id}
                      to={`/portal/${slug}/deals/${deal.id}`}
                      className="block"
                    >
                      <div className={`flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors ${hasUnread ? 'border-blue-200 bg-blue-50/50' : ''}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <button
                              type="button"
                              className="font-medium text-sm truncate text-blue-600 hover:text-blue-800 hover:underline text-left"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setCompanyModalDeal(deal);
                              }}
                            >
                              {deal.deal_snapshot?.headline || 'Untitled Deal'}
                            </button>
                            <p className="text-xs text-muted-foreground truncate">
                              {deal.deal_snapshot?.industry}
                              {deal.deal_snapshot?.geography && ` — ${deal.deal_snapshot.geography}`}
                            </p>
                            {/* Latest message preview */}
                            {msgSummary && msgSummary.total > 0 && (
                              <p className={`text-xs truncate mt-0.5 ${hasUnread ? 'text-blue-700 font-medium' : 'text-muted-foreground'}`}>
                                <MessageSquare className="h-3 w-3 inline mr-1" />
                                {msgSummary.latest_sender_type === 'admin' ? 'SourceCo' : 'You'}:{' '}
                                {msgSummary.latest_message || ''}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {hasUnread && (
                            <span className="flex items-center justify-center bg-blue-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full">
                              {msgSummary!.unread}
                            </span>
                          )}
                          <PushStatusBadge status={deal.status} />
                          {deal.priority !== 'standard' && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${deal.priority === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                              {deal.priority}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {companyModalDeal && (
        <CompanyDetailsModal
          open={!!companyModalDeal}
          onOpenChange={(open) => {
            if (!open) setCompanyModalDeal(null);
          }}
          push={companyModalDeal}
          portalSlug={slug!}
        />
      )}
    </div>
  );
}
