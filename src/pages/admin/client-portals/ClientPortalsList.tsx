import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, Send, Search, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePortalOrganizations } from '@/hooks/portal/use-portal-organizations';
import { CreatePortalDialog } from '@/components/portal/CreatePortalDialog';
import { OrgStatusBadge } from '@/components/portal/PortalStatusBadge';

export default function ClientPortalsList() {
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { data: orgs, isLoading } = usePortalOrganizations();

  const filteredOrgs = useMemo(() => {
    if (!orgs) return [];
    if (!searchQuery.trim()) return orgs;
    const q = searchQuery.toLowerCase();
    return orgs.filter((o) =>
      o.name.toLowerCase().includes(q) ||
      o.buyer?.company_name?.toLowerCase().includes(q) ||
      o.buyer?.buyer_type?.replace(/_/g, ' ').toLowerCase().includes(q) ||
      o.relationship_owner?.first_name?.toLowerCase().includes(q) ||
      o.relationship_owner?.last_name?.toLowerCase().includes(q)
    );
  }, [orgs, searchQuery]);

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

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, buyer, owner..."
          className="pl-9"
        />
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
      ) : filteredOrgs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No portals match "{searchQuery}".
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrgs.map((org) => (
            <Link key={org.id} to={`/admin/client-portals/${org.portal_slug}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{org.name}</CardTitle>
                    <OrgStatusBadge status={org.status} />
                  </div>
                  {org.buyer && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" />
                      <span>{org.buyer.company_name}</span>
                      {org.buyer.buyer_type && (
                        <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                          {org.buyer.buyer_type.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  )}
                  {org.relationship_owner && (
                    <p className="text-xs text-muted-foreground">
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
