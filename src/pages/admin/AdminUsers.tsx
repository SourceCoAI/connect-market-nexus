import { useState, useEffect, Component, type ErrorInfo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAdmin } from '@/hooks/use-admin';
import {
  AlertCircle,
  RefreshCw,
  Building2,
  Loader2,
  Phone,
  XCircle,
  ThumbsDown,
  Users,
  Zap,
} from 'lucide-react';
import { UsersTable } from '@/components/admin/UsersTable';
import { MobileUsersTable } from '@/components/admin/MobileUsersTable';
import { User } from '@/types';
import { UserActions } from '@/components/admin/UserActions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRealtimeAdmin } from '@/hooks/use-realtime-admin';
import { EnhancedUserManagement } from '@/components/admin/EnhancedUserManagement';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNonMarketplaceUsers } from '@/hooks/admin/use-non-marketplace-users';
import { NonMarketplaceUsersTable } from '@/components/admin/NonMarketplaceUsersTable';
import { UserViewSwitcher } from '@/components/admin/UserViewSwitcher';
import { useMarkUsersViewed } from '@/hooks/admin/use-mark-users-viewed';
import {
  useOwnerLeads,
  useUpdateOwnerLeadStatus,
  useUpdateOwnerLeadContacted,
} from '@/hooks/admin/use-owner-leads';
import { useUpdateOwnerLeadNotes } from '@/hooks/admin/use-update-owner-lead-notes';
import { useMarkOwnerLeadsViewed } from '@/hooks/admin/use-mark-owner-leads-viewed';
import { OwnerLeadsStats } from '@/components/admin/OwnerLeadsStats';
import { OwnerLeadsFilters } from '@/components/admin/OwnerLeadsFilters';
import { OwnerLeadsTableContent } from '@/components/admin/OwnerLeadsTableContent';
import { OwnerLead } from '@/hooks/admin/use-owner-leads';
import { cn } from '@/lib/utils';
import { ApprovalEmailDialog } from '@/components/admin/ApprovalEmailDialog';
import { ApprovalSuccessDialog } from '@/components/admin/ApprovalSuccessDialog';
import { UserConfirmationDialog } from '@/components/admin/UserConfirmationDialog';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';
import { useAIUIActionHandler } from '@/hooks/useAIUIActionHandler';
import { PushToDialerModal } from '@/components/remarketing/PushToDialerModal';
import { PushToSmartleadModal } from '@/components/remarketing/PushToSmartleadModal';
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
import { supabase } from '@/integrations/supabase/client';
import { toast as toastDirect } from '@/hooks/use-toast';
import { invokeEdgeFunction } from '@/lib/invoke-edge-function';
import { useQuery } from '@tanstack/react-query';

type PrimaryView = 'buyers' | 'owners';
type SecondaryView = 'marketplace' | 'non-marketplace';

// Error boundary to catch silent rendering crashes in the table
class TableErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('UsersTable render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center space-y-2">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm text-destructive font-medium">Table rendering error</p>
          <p className="text-xs text-muted-foreground">{this.state.error?.message}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
const AdminUsers = () => {
  const { users } = useAdmin();
  const { data: usersData = [], isLoading, error, refetch } = users;
  const [searchParams, setSearchParams] = useSearchParams();
  const primaryView: PrimaryView = searchParams.get('view') === 'owners' ? 'owners' : 'buyers';
  const setPrimaryView = (view: PrimaryView) => {
    setSearchParams(view === 'owners' ? { view: 'owners' } : {}, { replace: true });
  };
  const [secondaryView, setSecondaryView] = useState<SecondaryView>('marketplace');
  const isBuyersView = primaryView === 'buyers';
  const { data: nonMarketplaceUsers = [], isLoading: isLoadingNonMarketplace } =
    useNonMarketplaceUsers({ enabled: isBuyersView && secondaryView === 'non-marketplace' });
  const { data: ownerLeads = [], isLoading: isLoadingOwnerLeads } = useOwnerLeads({
    enabled: primaryView === 'owners',
  });
  const updateOwnerStatus = useUpdateOwnerLeadStatus();
  const updateOwnerNotes = useUpdateOwnerLeadNotes();
  const updateOwnerContacted = useUpdateOwnerLeadContacted();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  useRealtimeAdmin();

  // Query remarketing buyers that have a marketplace_firm_id link
  const { data: linkedBuyerCount = 0 } = useQuery({
    queryKey: ['remarketing-buyers-marketplace-linked-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('buyers')
        .select('id', { count: 'exact', head: true })
        .not('marketplace_firm_id', 'is', null);
      return count ?? 0;
    },
    staleTime: 60_000,
  });
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [isBulkScoring, setIsBulkScoring] = useState(false);
  const [filteredOwnerLeads, setFilteredOwnerLeads] = useState<OwnerLead[]>([]);
  const { markAsViewed: markUsersAsViewed } = useMarkUsersViewed();
  const { markAsViewed: markOwnerLeadsAsViewed } = useMarkOwnerLeadsViewed();

  // Owner bulk-action state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialerOpen, setDialerOpen] = useState(false);
  const [smartleadOpen, setSmartleadOpen] = useState(false);
  const [hideNotFit, setHideNotFit] = useState(true);
  const [showNotFitDialog, setShowNotFitDialog] = useState(false);
  const [isMarkingNotFit, setIsMarkingNotFit] = useState(false);

  // Register AI Command Center context
  const { setPageContext } = useAICommandCenterContext();
  useEffect(() => {
    setPageContext({ page: 'admin_users', entity_type: 'buyers' });
  }, [setPageContext]);

  // Wire AI UI actions
  useAIUIActionHandler({
    table: 'buyers',
  });

  useEffect(() => {
    markUsersAsViewed();
  }, []);

  useEffect(() => {
    if (primaryView === 'owners') {
      markOwnerLeadsAsViewed();
    }
  }, [primaryView]);

  useEffect(() => {
    setFilteredUsers(usersData);
  }, [usersData]);

  useEffect(() => {
    setFilteredOwnerLeads(ownerLeads);
  }, [ownerLeads]);

  // Clear selection when switching views
  useEffect(() => {
    setSelectedIds(new Set());
  }, [primaryView]);

  const {
    handleUserApproval,
    handleMakeAdmin,
    handleRevokeAdmin,
    handleDeleteUser,
    handleCustomApprovalEmail,
    confirmMakeAdmin,
    confirmRevokeAdmin,
    confirmDeleteUser,
    dialogState,
    selectedUser,
    approvedUser,
    emailSent,
    handleCloseDialog,
    handleCloseApprovalSuccess,
    isLoading: actionsLoading,
  } = UserActions({ onUserStatusUpdated: () => refetch() });

  useEffect(() => {
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error loading users',
        description: 'Failed to load user data. Please try refreshing the page.',
      });
    }
  }, [error, toast]);

  const handleRetry = () => {
    refetch();
    toast({
      title: 'Refreshing data',
      description: 'Reloading user data...',
    });
  };

  const approveUser = (user: User) => handleUserApproval(user);
  const makeAdmin = (user: User) => handleMakeAdmin(user);
  const revokeAdmin = (user: User) => handleRevokeAdmin(user);
  const deleteUser = (user: User) => handleDeleteUser(user);

  const handleOwnerStatusChange = (id: string, status: string) => {
    updateOwnerStatus.mutate({ id, status });
  };

  const handleOwnerNotesUpdate = (id: string, notes: string) => {
    updateOwnerNotes.mutate({ id, notes });
  };

  const handleOwnerContactedChange = (id: string, contacted: boolean) => {
    updateOwnerContacted.mutate({ id, contacted });
  };

  const handleMarkNotFit = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsMarkingNotFit(true);
    try {
      const { error } = await supabase
        .from('inbound_leads')
        .update({ status: 'not_a_fit', updated_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      toastDirect({
        title: 'Marked as Not a Fit',
        description: `${ids.length} lead(s) marked as not a fit.`,
      });
      setSelectedIds(new Set());
    } catch {
      toastDirect({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to mark leads as not a fit.',
      });
    } finally {
      setIsMarkingNotFit(false);
    }
  };

  // Apply hideNotFit filter on top of filtered leads
  const displayedLeads = hideNotFit
    ? filteredOwnerLeads.filter((l) => l.status !== 'not_a_fit')
    : filteredOwnerLeads;

  if (error) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-16 w-16 text-destructive mb-4" />
          <h2 className="text-xl md:text-2xl font-bold mb-2">Error Loading Users</h2>
          <p className="text-muted-foreground text-center mb-6 max-w-md text-sm md:text-base">
            There was an error loading the user data.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleRetry} className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const unscoredCount = usersData.filter((u) => u.buyer_type && u.buyer_quality_score == null).length;

  const handleBulkScoreUnscored = async () => {
    if (unscoredCount === 0) return;
    setIsBulkScoring(true);
    let totalScored = 0;
    toast({ title: `Starting scoring for ${unscoredCount} users…` });
    console.log('[AdminUsers] Starting bulk score for', unscoredCount, 'unscored users');
    try {
      // Step 1: Verify auth is available before looping
      toast({ title: 'Preparing auth…' });
      console.log('[AdminUsers] Checking auth before scoring…');
      
      for (let round = 0; round < 10; round++) {
        console.log('[AdminUsers] Scoring round', round + 1);
        toast({ title: `Calling scorer (round ${round + 1})…` });
        const result = await invokeEdgeFunction<{ scored: number; results: unknown[] }>(
          'calculate-buyer-quality-score',
          {
            body: { batch_all_unscored: true, batch_limit: 30 },
            timeoutMs: 45_000,   // 45s per attempt
            maxRetries: 0,       // no retries for bulk admin action
          },
        );
        const scored = result?.scored ?? 0;
        totalScored += scored;
        console.log('[AdminUsers] Round', round + 1, 'scored', scored, 'total', totalScored);
        if (scored === 0) break;
        toast({ title: `Progress: scored ${totalScored} so far…` });
      }
      toast({ title: 'Scoring complete', description: `Scored ${totalScored} users` });
      refetch();
    } catch (err) {
      console.error('[AdminUsers] Bulk scoring failed:', err);
      const msg = (err as Error).message || 'Unknown error';
      toast({ variant: 'destructive', title: 'Scoring failed', description: msg });
    } finally {
      setIsBulkScoring(false);
    }
  };

  const isOwnersView = primaryView === 'owners';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="px-8 py-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
              <p className="text-sm text-muted-foreground">
                {isBuyersView
                  ? 'Manage buyer registrations, approvals, and profile data'
                  : 'Manage owner/seller inquiries and leads'}
              </p>
            </div>
            {isBuyersView && unscoredCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkScoreUnscored}
                disabled={isBulkScoring}
                className="shrink-0"
              >
                {isBulkScoring ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-1" />
                )}
                {isBulkScoring ? 'Scoring…' : `Score All Unscored (${unscoredCount})`}
              </Button>
            )}
          </div>

          <Tabs defaultValue="users" className="mt-6">
            <TabsList className="h-auto p-0 bg-transparent border-0 gap-6">
              <TabsTrigger
                value="users"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 pb-2 pt-0 font-medium text-sm data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-colors"
              >
                Users
              </TabsTrigger>
              <TabsTrigger
                value="firms"
                asChild
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 pb-2 pt-0 font-medium text-sm data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-colors"
              >
                <Link to="/admin/buyers/firm-agreements" className="inline-flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Firm Agreements
                </Link>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main content */}
      <div className="px-8 py-8">
        {/* Remarketing linked buyers banner */}
        {isBuyersView && linkedBuyerCount > 0 && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <Users className="h-4 w-4 shrink-0" />
            <span>
              <strong>{linkedBuyerCount}</strong> remarketing{' '}
              {linkedBuyerCount === 1 ? 'buyer' : 'buyers'} linked to marketplace firms.{' '}
              <Link to="/admin/buyers" className="underline font-medium hover:text-blue-900">
                View All Buyers
              </Link>
            </span>
          </div>
        )}

        {/* View Switcher */}
        <div className="mb-6">
          <UserViewSwitcher
            primaryView={primaryView}
            secondaryView={secondaryView}
            onPrimaryViewChange={setPrimaryView}
            onSecondaryViewChange={setSecondaryView}
            marketplaceCount={usersData.length}
            nonMarketplaceCount={nonMarketplaceUsers.length}
            ownerLeadsCount={ownerLeads.length}
          />
        </div>

        {/* Stats & Filters */}
        <div className="mb-6">
          <div className={cn(!isBuyersView && 'hidden')}>
            <EnhancedUserManagement
              users={usersData}
              onApprove={approveUser}
              onMakeAdmin={makeAdmin}
              onRevokeAdmin={revokeAdmin}
              onDelete={deleteUser}
              isLoading={isLoading}
              onFilteredUsersChange={setFilteredUsers}
            />
          </div>

          <div className={cn(!isOwnersView && 'hidden', 'space-y-6')}>
            <OwnerLeadsStats leads={ownerLeads} />
            <OwnerLeadsFilters leads={ownerLeads} onFilteredLeadsChange={setFilteredOwnerLeads} />
          </div>
        </div>

        {/* Hide Not Fit Toggle - only for owners view */}
        {isOwnersView && (
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setHideNotFit(!hideNotFit)}
              className={cn(
                'flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border transition-colors',
                hideNotFit
                  ? 'bg-orange-100 border-orange-300 text-orange-700 font-medium'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
              {hideNotFit ? 'Not Fit Hidden' : 'Show Not Fit'}
            </button>
          </div>
        )}

        {/* Table Container */}
        <div className="bg-card rounded-lg border overflow-hidden">
          {/* Buyers table - marketplace */}
          {isBuyersView && secondaryView === 'marketplace' && (
            <>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : isMobile ? (
                <div className="p-4">
                  <TableErrorBoundary>
                    <MobileUsersTable
                      users={filteredUsers}
                      onApprove={approveUser}
                      onMakeAdmin={makeAdmin}
                      onRevokeAdmin={revokeAdmin}
                      onDelete={deleteUser}
                      isLoading={isLoading}
                      onSendFeeAgreement={() => {}}
                      onSendNDAEmail={() => {}}
                    />
                  </TableErrorBoundary>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <TableErrorBoundary>
                    <UsersTable
                      users={filteredUsers}
                      onApprove={approveUser}
                      onMakeAdmin={makeAdmin}
                      onRevokeAdmin={revokeAdmin}
                      onDelete={deleteUser}
                      isLoading={isLoading}
                    />
                  </TableErrorBoundary>
                </div>
              )}
            </>
          )}

          {/* Buyers table - non-marketplace */}
          {isBuyersView && secondaryView === 'non-marketplace' && (
            <NonMarketplaceUsersTable
              users={nonMarketplaceUsers}
              isLoading={isLoadingNonMarketplace}
              filters={{}}
              selectedIds={new Set()}
              onToggleSelect={() => {}}
              onToggleSelectAll={() => {}}
            />
          )}

          {/* Owners table */}
          {isOwnersView && (
            <>
              {isLoadingOwnerLeads ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : displayedLeads.length === 0 ? (
                <div className="text-center py-12">
                  <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-1">
                    No owner inquiries yet
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {hideNotFit && filteredOwnerLeads.length > 0
                      ? 'All leads in this view are marked as "Not a Fit". Toggle the filter above to see them.'
                      : 'Owner inquiries from the /sell form will appear here.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <OwnerLeadsTableContent
                    leads={displayedLeads}
                    onStatusChange={handleOwnerStatusChange}
                    onNotesUpdate={handleOwnerNotesUpdate}
                    onContactedChange={handleOwnerContactedChange}
                    selectedIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Owner bulk actions floating bar */}
        {isOwnersView && selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 p-3 bg-background border border-primary/20 rounded-lg shadow-lg">
            <Badge variant="secondary" className="text-sm font-medium">
              {selectedIds.size} selected
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              <XCircle className="h-4 w-4 mr-1" />
              Clear
            </Button>
            <div className="h-5 w-px bg-border" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDialerOpen(true)}
              className="gap-2"
            >
              <Phone className="h-4 w-4" />
              Push to Dialer
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSmartleadOpen(true)}
              className="gap-2"
            >
              <Phone className="h-4 w-4" />
              Push to Smartlead
            </Button>
            <div className="h-5 w-px bg-border" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowNotFitDialog(true)}
              disabled={isMarkingNotFit}
              className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
            >
              {isMarkingNotFit ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ThumbsDown className="h-4 w-4" />
              )}
              Not a Fit
            </Button>
          </div>
        )}

        {/* Not a Fit Confirmation Dialog */}
        <AlertDialog open={showNotFitDialog} onOpenChange={setShowNotFitDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark {selectedIds.size} Lead(s) as Not a Fit?</AlertDialogTitle>
              <AlertDialogDescription>
                These leads will be marked as "Not a Fit" and hidden from the default view. You can
                show them again using the "Show Not Fit" toggle.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  handleMarkNotFit();
                  setShowNotFitDialog(false);
                }}
                disabled={isMarkingNotFit}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {isMarkingNotFit ? 'Marking...' : 'Mark as Not a Fit'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialer & Smartlead modals for owner leads */}
        <PushToDialerModal
          open={dialerOpen}
          onOpenChange={setDialerOpen}
          contactIds={Array.from(selectedIds)}
          contactCount={selectedIds.size}
          entityType="leads"
        />
        <PushToSmartleadModal
          open={smartleadOpen}
          onOpenChange={setSmartleadOpen}
          contactIds={Array.from(selectedIds)}
          contactCount={selectedIds.size}
          entityType="leads"
        />

        {/* Dialogs */}
        <ApprovalEmailDialog
          open={dialogState.approval}
          onOpenChange={handleCloseDialog}
          user={selectedUser}
          onSendApprovalEmail={handleCustomApprovalEmail}
        />
        <ApprovalSuccessDialog
          open={dialogState.approvalSuccess}
          onOpenChange={handleCloseApprovalSuccess}
          user={approvedUser}
          emailSent={emailSent}
        />
        <UserConfirmationDialog
          open={dialogState.makeAdmin}
          onOpenChange={handleCloseDialog}
          user={selectedUser}
          title="Grant Admin Privileges"
          description="Are you sure you want to grant admin privileges to {userName}?"
          confirmText="Make Admin"
          onConfirm={confirmMakeAdmin}
          isLoading={actionsLoading}
        />
        <UserConfirmationDialog
          open={dialogState.revokeAdmin}
          onOpenChange={handleCloseDialog}
          user={selectedUser}
          title="Revoke Admin Privileges"
          description="Are you sure you want to revoke admin privileges from {userName}?"
          confirmText="Revoke Admin"
          confirmVariant="destructive"
          onConfirm={confirmRevokeAdmin}
          isLoading={actionsLoading}
        />
        <UserConfirmationDialog
          open={dialogState.delete}
          onOpenChange={handleCloseDialog}
          user={selectedUser}
          title="Delete User"
          description="Are you sure you want to permanently delete {userName}? This action cannot be undone."
          confirmText="Delete User"
          confirmVariant="destructive"
          onConfirm={confirmDeleteUser}
          isLoading={actionsLoading}
        />
      </div>
    </div>
  );
};

export default AdminUsers;
