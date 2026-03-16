import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RefreshCw, Plus, Mail, Users, BarChart3, ExternalLink, Search, Send } from 'lucide-react';
import {
  useSmartleadCampaigns,
  useCreateSmartleadCampaign,
  useSyncSmartleadCampaigns,
  useSmartleadCampaignStats,
} from '@/hooks/smartlead';
import type { SmartleadCampaign } from '@/types/smartlead';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';
import { useAIUIActionHandler } from '@/hooks/useAIUIActionHandler';

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFTED: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
    ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    COMPLETED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    STOPPED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    PAUSED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] || 'bg-muted text-muted-foreground'}`}
    >
      {status}
    </span>
  );
}

function CampaignStatsInline({ campaignId }: { campaignId: number }) {
  const { data } = useSmartleadCampaignStats(campaignId);
  const stats = data?.statistics;
  if (!stats) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="flex items-center gap-3 text-xs">
      <span title="Sent">{stats.sent ?? 0} sent</span>
      <span title="Opened" className="text-blue-600">
        {stats.opened ?? 0} opened
      </span>
      <span title="Replied" className="text-emerald-600">
        {stats.replied ?? 0} replied
      </span>
      <span title="Bounced" className="text-red-600">
        {stats.bounced ?? 0} bounced
      </span>
    </div>
  );
}

export default function SmartleadCampaignsPage() {
  const { data: campaignsData, isLoading } = useSmartleadCampaigns();
  const createMutation = useCreateSmartleadCampaign();
  const syncMutation = useSyncSmartleadCampaigns();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [newCampaignName, setNewCampaignName] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Register AI Command Center context
  const { setPageContext } = useAICommandCenterContext();
  useEffect(() => {
    setPageContext({ page: 'smartlead_campaigns', entity_type: 'leads' });
  }, [setPageContext]);

  // Wire AI UI actions
  useAIUIActionHandler({
    table: 'leads',
    onApplyFilter: (filters, clearExisting) => {
      if (clearExisting) {
        setSearch('');
        setStatusFilter('all');
      }
      filters.forEach((f) => {
        switch (f.field) {
          case 'status':
          case 'campaign_status':
            setStatusFilter(f.value as string);
            break;
          case 'search':
          case 'query':
          case 'name':
            setSearch(f.value as string);
            break;
        }
      });
    },
    onClearSelection: () => {
      setSearch('');
      setStatusFilter('all');
    },
  });

  const remoteCampaigns = (campaignsData?.campaigns || []) as SmartleadCampaign[];
  const localCampaigns = (campaignsData?.local_campaigns || []) as Array<Record<string, unknown> & { smartlead_campaign_id: number }>;

  // Build a merged view: remote campaigns enriched with local data
  const localMap = new Map(localCampaigns.map((lc) => [lc.smartlead_campaign_id, lc]));

  const mergedCampaigns = remoteCampaigns.map((rc) => ({
    ...rc,
    local: localMap.get(rc.id) || null,
  }));

  const filtered = mergedCampaigns.filter((c) => {
    const matchesSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreate = () => {
    if (!newCampaignName.trim()) return;
    createMutation.mutate(
      { name: newCampaignName.trim() },
      {
        onSuccess: () => {
          setNewCampaignName('');
          setDialogOpen(false);
        },
      },
    );
  };

  // Aggregate stats
  const activeCount = remoteCampaigns.filter((c) => c.status === 'ACTIVE').length;
  const draftCount = remoteCampaigns.filter((c) => c.status === 'DRAFTED').length;
  const totalLeads = localCampaigns.reduce((sum, lc) => sum + ((lc as Record<string, unknown>).lead_count as number || 0), 0);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Smartlead Campaigns</h1>
          <p className="text-muted-foreground">Manage cold email campaigns powered by Smartlead</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            Sync
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Smartlead Campaign</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="campaign-name">Campaign Name</Label>
                  <Input
                    id="campaign-name"
                    value={newCampaignName}
                    onChange={(e) => setNewCampaignName(e.target.value)}
                    placeholder="e.g. Q1 Buyer Outreach — HVAC Services"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreate();
                    }}
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleCreate}
                  disabled={!newCampaignName.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Mail className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Total Campaigns</p>
            <p className="text-xl font-bold">{remoteCampaigns.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <BarChart3 className="h-5 w-5 mx-auto mb-1 text-emerald-600" />
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-xl font-bold text-emerald-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Mail className="h-5 w-5 mx-auto mb-1 text-slate-500" />
            <p className="text-xs text-muted-foreground">Drafts</p>
            <p className="text-xl font-bold text-slate-600">{draftCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-blue-600" />
            <p className="text-xs text-muted-foreground">Total Leads Pushed</p>
            <p className="text-xl font-bold text-blue-600">{totalLeads}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="DRAFTED">Drafted</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PAUSED">Paused</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="STOPPED">Stopped</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Campaigns Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {remoteCampaigns.length === 0
                ? 'No campaigns found. Create one or sync from Smartlead.'
                : 'No campaigns match your filters.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Stats</TableHead>
                  <TableHead>Linked Deal</TableHead>
                  <TableHead>Last Synced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium">{campaign.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={campaign.status} />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{(campaign.local as Record<string, unknown>)?.lead_count as React.ReactNode ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <CampaignStatsInline campaignId={campaign.id} />
                    </TableCell>
                    <TableCell>
                      {campaign.local?.deal_id ? (
                        <Badge variant="outline" className="text-xs">
                          Linked
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {campaign.local?.last_synced_at
                          ? new Date(campaign.local.last_synced_at).toLocaleDateString()
                          : '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* External Link */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" asChild>
          <a href="https://app.smartlead.ai" target="_blank" rel="noopener noreferrer">
            Open Smartlead Dashboard
            <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}
