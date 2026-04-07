import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Send, Users, Activity, Settings, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePortalOrganization, useUpdatePortalOrg } from '@/hooks/portal/use-portal-organizations';
import { usePortalUsers, useDeactivatePortalUser } from '@/hooks/portal/use-portal-users';
import { usePortalDealPushes, useConvertToPipelineDeal } from '@/hooks/portal/use-portal-deals';
import { usePortalActivity, usePortalAnalytics } from '@/hooks/portal/use-portal-activity';
import { OrgStatusBadge, PushStatusBadge, PriorityBadge } from '@/components/portal/PortalStatusBadge';
import { InvitePortalUserDialog } from '@/components/portal/InvitePortalUserDialog';
import type { PortalOrgStatus, PortalNotificationFrequency, PortalDealPushStatus } from '@/types/portal';

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

export default function ClientPortalDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: org, isLoading } = usePortalOrganization(slug);
  const { data: users } = usePortalUsers(org?.id);
  const { data: pushes } = usePortalDealPushes(org?.id);
  const { data: activity } = usePortalActivity(org?.id);
  const { data: analytics } = usePortalAnalytics(org?.id);
  const updateOrg = useUpdatePortalOrg();
  const deactivateUser = useDeactivatePortalUser();
  const convertToPipeline = useConvertToPipelineDeal();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  if (!org) return <div className="py-12 text-center text-muted-foreground">Portal not found.</div>;

  const filteredPushes = (pushes || []).filter(
    (p) => statusFilter === 'all' || p.status === statusFilter
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            to="/admin/client-portals"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
          >
            <ChevronLeft className="h-3 w-3" />
            All Portals
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{org.name}</h1>
            <OrgStatusBadge status={org.status} />
          </div>
          {org.relationship_owner && (
            <p className="text-sm text-muted-foreground mt-1">
              Relationship Owner: {org.relationship_owner.first_name} {org.relationship_owner.last_name}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {org.status === 'active' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateOrg.mutate({ id: org.id, status: 'archived' as PortalOrgStatus })}
            >
              Archive Portal
            </Button>
          )}
          {org.status === 'archived' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateOrg.mutate({ id: org.id, status: 'active' as PortalOrgStatus })}
            >
              Reactivate
            </Button>
          )}
        </div>
      </div>

      {/* Analytics summary */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-xl font-bold">{analytics.total_pushes}</div>
              <p className="text-xs text-muted-foreground">Total Pushes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-xl font-bold">{analytics.response_rate}%</div>
              <p className="text-xs text-muted-foreground">Response Rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-xl font-bold text-blue-600">{analytics.pending_count}</div>
              <p className="text-xs text-muted-foreground">Pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-xl font-bold text-green-600">{analytics.interested_count}</div>
              <p className="text-xs text-muted-foreground">Interested</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-xl font-bold text-red-600">{analytics.passed_count}</div>
              <p className="text-xs text-muted-foreground">Passed</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="deals">
        <TabsList>
          <TabsTrigger value="deals" className="flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Deals
            {(pushes || []).length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-[10px]">
                {(pushes || []).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Users
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-1.5">
            <Settings className="h-3.5 w-3.5" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Deals Tab */}
        <TabsContent value="deals" className="space-y-4">
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="interested">Interested</SelectItem>
                <SelectItem value="passed">Passed</SelectItem>
                <SelectItem value="needs_info">Needs Info</SelectItem>
                <SelectItem value="reviewing">Reviewing</SelectItem>
                <SelectItem value="under_nda">Under NDA</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredPushes.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No deals pushed to this portal yet.
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deal</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>EBITDA</TableHead>
                    <TableHead>Pushed By</TableHead>
                    <TableHead>Push Date</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPushes.map((push) => (
                    <TableRow key={push.id}>
                      <TableCell className="max-w-[250px]">
                        <div className="font-medium truncate">
                          {push.deal_snapshot?.headline || 'Untitled'}
                        </div>
                        {push.latest_response?.notes && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5 italic">
                            "{push.latest_response.notes}"
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {push.deal_snapshot?.industry || '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {push.deal_snapshot?.ebitda
                          ? `$${(push.deal_snapshot.ebitda / 1000000).toFixed(1)}M`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {push.pushed_by_profile
                          ? `${push.pushed_by_profile.first_name} ${push.pushed_by_profile.last_name}`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(push.created_at)}</TableCell>
                      <TableCell className="text-sm">{daysSince(push.created_at)}d</TableCell>
                      <TableCell>
                        <PushStatusBadge status={push.status} />
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={push.priority} />
                      </TableCell>
                      <TableCell>
                        {push.status === 'interested' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1 text-green-700 border-green-200 hover:bg-green-50"
                            disabled={convertToPipeline.isPending}
                            onClick={() =>
                              convertToPipeline.mutate({
                                pushId: push.id,
                                portalOrgId: org.id,
                                listingId: push.listing_id,
                                portalOrgName: org.name,
                              })
                            }
                          >
                            <ArrowRight className="h-3 w-3" />
                            Convert to Deal
                          </Button>
                        )}
                        {push.status === 'under_nda' && (
                          <span className="text-xs text-emerald-600 font-medium">In Pipeline</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Invite User
            </Button>
          </div>

          {(users || []).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No users invited yet.
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Invited</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(users || []).map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-sm">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {u.role.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.is_active ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 text-xs">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-50 text-gray-500 text-xs">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(u.invite_sent_at)}</TableCell>
                      <TableCell className="text-sm">{formatDate(u.last_login_at)}</TableCell>
                      <TableCell>
                        {u.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-red-600"
                            onClick={() => deactivateUser.mutate({ userId: u.id, portalOrgId: org.id })}
                          >
                            Deactivate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          {(activity || []).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No activity recorded yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {(activity || []).map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 px-4 py-3 border rounded-md text-sm"
                >
                  <Badge variant="outline" className="text-xs capitalize shrink-0">
                    {log.action.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-muted-foreground">
                    by {log.actor_type === 'admin' ? 'Admin' : 'Portal User'}
                  </span>
                  {log.metadata && typeof log.metadata === 'object' && 'headline' in log.metadata && (
                    <span className="truncate text-muted-foreground">
                      — {String(log.metadata.headline)}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">
                    {formatDate(log.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <PortalSettings org={org} />
        </TabsContent>
      </Tabs>

      <InvitePortalUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        portalOrgId={org.id}
      />
    </div>
  );
}

function PortalSettings({ org }: { org: NonNullable<ReturnType<typeof usePortalOrganization>['data']> }) {
  const updateOrg = useUpdatePortalOrg();
  const [welcomeMessage, setWelcomeMessage] = useState(org.welcome_message || '');
  const [frequency, setFrequency] = useState(org.notification_frequency);
  const [industries, setIndustries] = useState((org.preferred_industries || []).join(', '));
  const [geographies, setGeographies] = useState((org.preferred_geographies || []).join(', '));
  const [dealSizeMin, setDealSizeMin] = useState(org.preferred_deal_size_min?.toString() || '');
  const [dealSizeMax, setDealSizeMax] = useState(org.preferred_deal_size_max?.toString() || '');
  const [notes, setNotes] = useState(org.notes || '');

  const handleSave = () => {
    updateOrg.mutate({
      id: org.id,
      welcome_message: welcomeMessage.trim() || null,
      notification_frequency: frequency as PortalNotificationFrequency,
      preferred_industries: industries ? industries.split(',').map((s) => s.trim()).filter(Boolean) : [],
      preferred_geographies: geographies ? geographies.split(',').map((s) => s.trim()).filter(Boolean) : [],
      preferred_deal_size_min: dealSizeMin ? parseInt(dealSizeMin, 10) : null,
      preferred_deal_size_max: dealSizeMax ? parseInt(dealSizeMax, 10) : null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portal Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-w-lg">
        <div className="space-y-2">
          <Label>Welcome Message</Label>
          <Textarea
            value={welcomeMessage}
            onChange={(e) => setWelcomeMessage(e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label>Notification Frequency</Label>
          <Select value={frequency} onValueChange={(v) => setFrequency(v as PortalNotificationFrequency)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="instant">Instant</SelectItem>
              <SelectItem value="daily_digest">Daily Digest</SelectItem>
              <SelectItem value="weekly_digest">Weekly Digest</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Preferred Industries</Label>
            <Input value={industries} onChange={(e) => setIndustries(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Preferred Geographies</Label>
            <Input value={geographies} onChange={(e) => setGeographies(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Min EBITDA</Label>
            <Input type="number" value={dealSizeMin} onChange={(e) => setDealSizeMin(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Max EBITDA</Label>
            <Input type="number" value={dealSizeMax} onChange={(e) => setDealSizeMax(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Internal Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <Button onClick={handleSave} disabled={updateOrg.isPending}>
          {updateOrg.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </CardContent>
    </Card>
  );
}
