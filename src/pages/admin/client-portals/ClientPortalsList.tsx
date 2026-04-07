import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, Send, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePortalOrganizations } from '@/hooks/portal/use-portal-organizations';
import { CreatePortalDialog } from '@/components/portal/CreatePortalDialog';
import { OrgStatusBadge } from '@/components/portal/PortalStatusBadge';

export default function ClientPortalsList() {
  const [createOpen, setCreateOpen] = useState(false);
  const { data: orgs, isLoading } = usePortalOrganizations();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Client Portals</h1>
          <p className="text-muted-foreground">
            Manage dedicated deal portals for key buyer relationships.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Portal
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {(orgs || []).filter((o) => o.status === 'active').length}
            </div>
            <p className="text-sm text-muted-foreground">Active Portals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {(orgs || []).reduce((sum, o) => sum + (o.user_count || 0), 0)}
            </div>
            <p className="text-sm text-muted-foreground">Total Users</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {(orgs || []).reduce((sum, o) => sum + (o.active_push_count || 0), 0)}
            </div>
            <p className="text-sm text-muted-foreground">Active Deals Pushed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{(orgs || []).length}</div>
            <p className="text-sm text-muted-foreground">Total Portals</p>
          </CardContent>
        </Card>
      </div>

      {/* Portal list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading portals...</div>
      ) : (orgs || []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No client portals yet.</p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Portal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(orgs || []).map((org) => (
            <Link key={org.id} to={`/admin/client-portals/${org.portal_slug}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{org.name}</CardTitle>
                    <OrgStatusBadge status={org.status} />
                  </div>
                  {org.relationship_owner && (
                    <p className="text-sm text-muted-foreground">
                      Owner: {org.relationship_owner.first_name} {org.relationship_owner.last_name}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      <span>{org.user_count || 0} users</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Send className="h-3.5 w-3.5" />
                      <span>{org.active_push_count || 0} deals</span>
                    </div>
                  </div>
                  {org.preferred_industries && org.preferred_industries.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {org.preferred_industries.slice(0, 3).map((ind) => (
                        <span
                          key={ind}
                          className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground"
                        >
                          {ind}
                        </span>
                      ))}
                      {org.preferred_industries.length > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{org.preferred_industries.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CreatePortalDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
