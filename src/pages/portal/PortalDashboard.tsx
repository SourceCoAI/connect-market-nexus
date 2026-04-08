import { useParams, Link } from 'react-router-dom';
import { FileText, CheckCircle, XCircle, HelpCircle, Clock, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMyPortalUser } from '@/hooks/portal/use-portal-users';
import { useMyPortalDeals } from '@/hooks/portal/use-portal-deals';

export default function PortalDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const { data: portalUser, isLoading: userLoading } = useMyPortalUser(slug);
  const { data: deals, isLoading: dealsLoading } = useMyPortalDeals(portalUser?.portal_org?.id);

  if (userLoading) return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
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

  const statusCounts: Record<string, number> = {};
  (deals || []).forEach((d) => {
    statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
  });

  
  const pending = statusCounts['pending_review'] || 0;
  const interested = statusCounts['interested'] || 0;
  const passed = statusCounts['passed'] || 0;
  const needsInfo = statusCounts['needs_info'] || 0;

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
              <div className="space-y-3">
                {(deals || []).slice(0, 5).map((deal) => (
                  <Link
                    key={deal.id}
                    to={`/portal/${slug}/deals/${deal.id}`}
                    className="block"
                  >
                    <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">
                            {deal.deal_snapshot?.project_name || deal.deal_snapshot?.headline || 'Untitled Deal'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {deal.deal_snapshot?.industry}
                            {deal.deal_snapshot?.geography && ` — ${deal.deal_snapshot.geography}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {deal.priority !== 'standard' && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${deal.priority === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                            {deal.priority}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(deal.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
