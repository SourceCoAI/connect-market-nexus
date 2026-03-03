import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  MoreHorizontal,
  Handshake,
  Copy,
  Edit,
  KeyRound,
  XCircle,
  Loader2,
  Archive,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { AddPartnerDialog } from '@/components/remarketing/AddPartnerDialog';
import { SubmissionReviewQueue } from '@/components/remarketing/SubmissionReviewQueue';
import { FilterBar } from '@/components/filters/FilterBar';
import { REFERRAL_PARTNERS_LIST_FIELDS } from '@/components/filters/filter-definitions';
import { useFilterEngine } from '@/hooks/use-filter-engine';

interface ReferralPartner {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  deal_count: number | null;
  is_active: boolean | null;
  share_token: string | null;
  created_at: string | null;
}

export default function ReMarketingReferralPartners() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'partners';
  const setActiveTab = useCallback(
    (v: string) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'partners') n.set('tab', v);
          else n.delete('tab');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<ReferralPartner | null>(null);

  // Fetch partners
  const { data: partners, isLoading: partnersLoading } = useQuery({
    queryKey: ['referral-partners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_partners')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch actual deal counts from listings table
      const partnerIds = (data || []).map((p: { id: string }) => p.id);
      if (partnerIds.length > 0) {
        const { data: listings, error: listingsError } = await supabase
          .from('listings')
          .select('referral_partner_id')
          .in('referral_partner_id', partnerIds);
        if (listingsError) throw listingsError;

        const countMap: Record<string, number> = {};
        listings?.forEach((l: { referral_partner_id: string | null }) => {
          if (l.referral_partner_id)
            countMap[l.referral_partner_id] = (countMap[l.referral_partner_id] || 0) + 1;
        });

        return (data as ReferralPartner[]).map((p) => ({
          ...p,
          deal_count: countMap[p.id] || 0,
        }));
      }

      return data as ReferralPartner[];
    },
  });

  // Fetch pending submissions count per partner
  const { data: submissionCounts } = useQuery({
    queryKey: ['referral-submissions', 'counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_submissions')
        .select('referral_partner_id, status')
        .eq('status', 'pending');

      if (error) throw error;

      const counts: Record<string, number> = {};
      data?.forEach((s) => {
        counts[s.referral_partner_id] = (counts[s.referral_partner_id] || 0) + 1;
      });
      return counts;
    },
  });

  // Fetch all pending submissions for review queue
  const { data: pendingSubmissions, isLoading: submissionsLoading } = useQuery({
    queryKey: ['referral-submissions', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_submissions')
        .select('*, referral_partners(name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const totalPending = pendingSubmissions?.length || 0;

  // Copy share link
  const handleCopyShareLink = (partner: ReferralPartner) => {
    if (!partner.share_token) {
      toast.error('No share token available');
      return;
    }
    const url = `${window.location.origin}/referrals/${partner.share_token}`;
    navigator.clipboard.writeText(url);
    toast.success('Share link copied to clipboard');
  };

  // Reset password
  const resetPasswordMutation = useMutation({
    mutationFn: async (partnerId: string) => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      const array = new Uint8Array(12);
      crypto.getRandomValues(array);
      const password = Array.from(array, (b) => chars[b % chars.length]).join('');

      const { data: hashResult, error: hashResultError } = await supabase.functions.invoke(
        'validate-referral-access',
        { body: { action: 'hash-password', password } },
      );
      if (hashResultError) throw hashResultError;

      const hash = hashResult?.hash || password;

      const { error } = await supabase
        .from('referral_partners')
        .update({ share_password_hash: hash } as never)
        .eq('id', partnerId);

      if (error) throw error;
      return password;
    },
    onSuccess: (password) => {
      toast.success(`New password: ${password}`, { duration: 15000 });
      queryClient.invalidateQueries({ queryKey: ['referral-partners'] });
    },
    onError: (error) => {
      toast.error(`Failed to reset password: ${error.message}`);
    },
  });

  // Deactivate partner
  const deactivateMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('referral_partners')
        .update({ is_active: active } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-partners'] });
      toast.success('Partner status updated');
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  // Archive partner
  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('referral_partners')
        .update({ is_active: false, notes: '[ARCHIVED]' } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-partners'] });
      toast.success('Partner archived');
    },
    onError: (error) => {
      toast.error(`Failed to archive: ${error.message}`);
    },
  });

  // Delete partner
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('referral_partners').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-partners'] });
      toast.success('Partner deleted');
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  // Filter engine (search + advanced filters)
  const {
    filteredItems: filteredPartners,
    filterState,
    setFilterState,
    fieldDefinitions,
    dynamicOptions,
    totalCount,
    filteredCount,
  } = useFilterEngine(partners || [], REFERRAL_PARTNERS_LIST_FIELDS);

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Handshake className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Referral Partners</h1>
            <p className="text-muted-foreground text-sm">
              Manage referral partners and review submissions
            </p>
          </div>
        </div>
        <Button
          onClick={() => {
            setEditingPartner(null);
            setAddDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Partner
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="submissions" className="gap-2">
            Pending Submissions
            {totalPending > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs">
                {totalPending}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Partners Tab */}
        <TabsContent value="partners" className="space-y-4">
          <FilterBar
            filterState={filterState}
            onFilterStateChange={setFilterState}
            fieldDefinitions={fieldDefinitions}
            dynamicOptions={dynamicOptions}
            totalCount={totalCount}
            filteredCount={filteredCount}
            compact
          />

          <Card>
            <CardContent className="p-0">
              {partnersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !filteredPartners.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Handshake className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {filterState.search || filterState.rules.length > 0
                      ? 'No partners match your filters'
                      : 'No referral partners yet'}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partner Name</TableHead>
                      <TableHead>Firm / Company</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="text-center">Deals</TableHead>
                      <TableHead className="text-center">Pending</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date Added</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPartners.map((partner) => {
                      const pending = submissionCounts?.[partner.id] || 0;
                      return (
                        <TableRow
                          key={partner.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() =>
                            navigate(`/admin/remarketing/leads/referrals/${partner.id}`)
                          }
                        >
                          <TableCell className="font-medium">{partner.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {partner.company || '-'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {partner.email || '-'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {partner.phone || '-'}
                          </TableCell>
                          <TableCell className="text-center">{partner.deal_count || 0}</TableCell>
                          <TableCell className="text-center">
                            {pending > 0 ? (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                                {pending}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={partner.is_active ? 'default' : 'secondary'}>
                              {partner.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {partner.created_at
                              ? format(new Date(partner.created_at), 'MMM d, yyyy')
                              : '-'}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditingPartner(partner);
                                    setAddDialogOpen(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleCopyShareLink(partner)}>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy Share Link
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => resetPasswordMutation.mutate(partner.id)}
                                >
                                  <KeyRound className="h-4 w-4 mr-2" />
                                  Reset Password
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    deactivateMutation.mutate({
                                      id: partner.id,
                                      active: !partner.is_active,
                                    })
                                  }
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  {partner.is_active ? 'Deactivate' : 'Activate'}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Archive "${partner.name}"? This will deactivate them.`,
                                      )
                                    ) {
                                      archiveMutation.mutate(partner.id);
                                    }
                                  }}
                                >
                                  <Archive className="h-4 w-4 mr-2" />
                                  Archive
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Permanently delete "${partner.name}"? This cannot be undone.`,
                                      )
                                    ) {
                                      deleteMutation.mutate(partner.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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

        {/* Pending Submissions Tab */}
        <TabsContent value="submissions">
          <Card>
            <CardContent className="p-4">
              <SubmissionReviewQueue
                submissions={pendingSubmissions || []}
                isLoading={submissionsLoading}
                showPartnerColumn={true}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Partner Dialog */}
      <AddPartnerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        editingPartner={editingPartner}
      />
    </div>
  );
}
