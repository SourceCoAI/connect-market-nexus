import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRestoreDeal } from '@/hooks/admin/use-deals';
import { useAdminProfiles } from '@/hooks/admin/use-admin-profiles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Archive, RotateCcw, Search, Building2, GitBranch } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

interface ArchivedDeal {
  id: string;
  title: string | null;
  listing_id: string | null;
  listing_title: string | null;
  deleted_at: string;
  metadata: Record<string, unknown> | null;
  stage_name: string | null;
  assigned_to: string | null;
  contact_name: string | null;
  contact_company: string | null;
}

interface ArchivedListing {
  id: string;
  title: string;
  internal_company_name: string | null;
  remarketing_status: string;
  updated_at: string;
  primary_owner_id: string | null;
}

function useArchivedPipelineDeals() {
  return useQuery({
    queryKey: ['deals', 'archived'],
    queryFn: async () => {
      // Fetch archived deals with basic fields
      const { data, error } = await (supabase
        .from('deal_pipeline') as any)
        .select('id, title, listing_id, deleted_at, metadata, assigned_to, stage_id')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (error) throw error;
      const deals = (data as any[]) || [];
      if (deals.length === 0) return [] as ArchivedDeal[];

      // Batch fetch listing titles
      const listingIds = [...new Set(deals.map(d => d.listing_id).filter(Boolean))] as string[];
      const listingMap = new Map<string, string>();
      if (listingIds.length > 0) {
        const { data: listings } = await supabase
          .from('listings')
          .select('id, title')
          .in('id', listingIds);
        for (const l of listings || []) listingMap.set(l.id, l.title || '');
      }

      // Batch fetch stage names
      const stageIds = [...new Set(deals.map(d => d.stage_id).filter(Boolean))] as string[];
      const stageMap = new Map<string, string>();
      if (stageIds.length > 0) {
        const { data: stages } = await (supabase
          .from('deal_stages') as any)
          .select('id, name')
          .in('id', stageIds);
        for (const s of (stages as any[]) || []) stageMap.set(s.id, s.name || '');
      }

      return deals.map((d) => ({
        id: d.id,
        title: d.title || listingMap.get(d.listing_id || '') || 'Unknown Deal',
        listing_id: d.listing_id,
        listing_title: listingMap.get(d.listing_id || '') || null,
        deleted_at: d.deleted_at!,
        metadata: d.metadata as Record<string, unknown> | null,
        stage_name: stageMap.get(d.stage_id || '') || null,
        assigned_to: d.assigned_to,
        contact_name: null,
        contact_company: null,
      } as ArchivedDeal));
    },
  });
}

function useArchivedRemarketingDeals() {
  return useQuery({
    queryKey: ['remarketing', 'archived-listings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('id, title, internal_company_name, remarketing_status, updated_at, primary_owner_id')
        .eq('remarketing_status', 'archived')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as ArchivedListing[];
    },
  });
}

export default function ArchivedDeals() {
  const [search, setSearch] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<{ id: string; name: string; type: 'pipeline' | 'remarketing' } | null>(null);
  const [activeTab, setActiveTab] = useState('pipeline');

  const pipelineQuery = useArchivedPipelineDeals();
  const remarketingQuery = useArchivedRemarketingDeals();
  const restoreDealMutation = useRestoreDeal();
  const { data: adminProfiles } = useAdminProfiles();
  const queryClient = useQueryClient();

  const getAdminName = (id: string | null) => {
    if (!id || !adminProfiles) return null;
    const profile = adminProfiles[id];
    return profile?.displayName ?? null;
  };

  const filteredPipelineDeals = (pipelineQuery.data || []).filter((d) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      d.title?.toLowerCase().includes(s) ||
      d.listing_title?.toLowerCase().includes(s) ||
      d.contact_name?.toLowerCase().includes(s) ||
      d.contact_company?.toLowerCase().includes(s)
    );
  });

  const filteredRemarketingDeals = (remarketingQuery.data || []).filter((d) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      d.title?.toLowerCase().includes(s) ||
      d.internal_company_name?.toLowerCase().includes(s)
    );
  });

  const handleRestore = async () => {
    if (!restoreTarget) return;

    if (restoreTarget.type === 'pipeline') {
      await restoreDealMutation.mutateAsync(restoreTarget.id);
      queryClient.invalidateQueries({ queryKey: ['deals', 'archived'] });
    } else {
      const { error } = await supabase
        .from('listings')
        .update({ remarketing_status: 'active', archive_reason: null } as never)
        .eq('id', restoreTarget.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'archived-listings'] });
      queryClient.invalidateQueries({ queryKey: ['remarketing'] });
    }

    setRestoreTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Archive className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Archived Deals</h1>
            <p className="text-sm text-muted-foreground">
              View and restore previously archived deals
            </p>
          </div>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search archived deals..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pipeline" className="gap-2">
            <GitBranch className="h-3.5 w-3.5" />
            Pipeline Deals
            {pipelineQuery.data && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {pipelineQuery.data.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="remarketing" className="gap-2">
            <Building2 className="h-3.5 w-3.5" />
            Remarketing Deals
            {remarketingQuery.data && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {remarketingQuery.data.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Archived Pipeline Deals</CardTitle>
            </CardHeader>
            <CardContent>
              {pipelineQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredPipelineDeals.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Archive className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No archived pipeline deals found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Deal</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Archived</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead className="w-[100px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPipelineDeals.map((deal) => {
                      const reason = (deal.metadata?.deletion_reason as string) || 'No reason';
                      return (
                        <TableRow key={deal.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{deal.title}</div>
                              {deal.listing_title && deal.listing_title !== deal.title && (
                                <div className="text-xs text-muted-foreground">{deal.listing_title}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {deal.contact_name || '—'}
                              {deal.contact_company && (
                                <div className="text-xs text-muted-foreground">{deal.contact_company}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {deal.stage_name || 'Unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{reason}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(deal.deleted_at), 'MMM d, yyyy')}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{getAdminName(deal.assigned_to) || '—'}</span>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5"
                              onClick={() => setRestoreTarget({ id: deal.id, name: deal.title || 'Deal', type: 'pipeline' })}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Restore
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="remarketing">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Archived Remarketing Deals</CardTitle>
            </CardHeader>
            <CardContent>
              {remarketingQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredRemarketingDeals.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Archive className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No archived remarketing deals found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Deal</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Archived</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead className="w-[100px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRemarketingDeals.map((deal) => (
                      <TableRow key={deal.id}>
                        <TableCell>
                          <div className="font-medium">{deal.title}</div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{deal.internal_company_name || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {'No reason'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(deal.updated_at), 'MMM d, yyyy')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{getAdminName(deal.primary_owner_id) || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={() => setRestoreTarget({ id: deal.id, name: deal.title, type: 'remarketing' })}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restore
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => { if (!open) setRestoreTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Deal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore <strong>{restoreTarget?.name}</strong>? It will be moved back to{' '}
              {restoreTarget?.type === 'pipeline' ? 'the pipeline' : 'active remarketing deals'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Restore Deal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
