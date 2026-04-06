import { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAdmin } from '@/hooks/use-admin';
import { AlertCircle, RefreshCw, Loader2, Users, Zap } from 'lucide-react';
import { UsersTable } from '@/components/admin/UsersTable';
import { MobileUsersTable } from '@/components/admin/MobileUsersTable';
import { User } from '@/types';
import { UserActions } from '@/components/admin/UserActions';
import { ApprovalEmailDialog } from '@/components/admin/ApprovalEmailDialog';
import { ApprovalSuccessDialog } from '@/components/admin/ApprovalSuccessDialog';
import { UserConfirmationDialog } from '@/components/admin/UserConfirmationDialog';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRealtimeAdmin } from '@/hooks/use-realtime-admin';
import { EnhancedUserManagement } from '@/components/admin/EnhancedUserManagement';
import { useMarkUsersViewed } from '@/hooks/admin/use-mark-users-viewed';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';
import { useAIUIActionHandler } from '@/hooks/useAIUIActionHandler';
import { toast } from 'sonner';

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

const MarketplaceUsersPage = () => {
  const { users } = useAdmin();
  const { data: usersData = [], isLoading, error, refetch } = users;
  const isMobile = useIsMobile();
  useRealtimeAdmin();
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const { markAsViewed } = useMarkUsersViewed();
  const [isBulkScoring, setIsBulkScoring] = useState(false);

  const handleBulkScoreUnscored = async () => {
    const unscoredIds = usersData
      .filter((u) => u.buyer_type && u.buyer_quality_score == null)
      .map((u) => u.id);
    if (unscoredIds.length === 0) {
      toast.info('All users already have scores');
      return;
    }
    setIsBulkScoring(true);
    try {
      const { queueBuyerQualityScoring } = await import('@/lib/remarketing/queueScoring');
      const { scored, errors } = await queueBuyerQualityScoring(unscoredIds);
      toast.success(`Scored ${scored} user(s)${errors > 0 ? `, ${errors} failed` : ''}`);
      refetch();
    } catch (err) {
      toast.error('Bulk scoring failed');
      console.error(err);
    } finally {
      setIsBulkScoring(false);
    }
  };

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

  useEffect(() => {
    markAsViewed();
  }, []);

  // Register AI Command Center context
  const { setPageContext } = useAICommandCenterContext();
  useEffect(() => {
    setPageContext({ page: 'marketplace_users', entity_type: 'buyers' });
  }, [setPageContext]);

  // Wire AI UI actions
  useAIUIActionHandler({
    table: 'buyers',
  });

  // Initialize filteredUsers from usersData when it loads
  // EnhancedUserManagement will then manage the filtered state via onFilteredUsersChange
  useEffect(() => {
    if (usersData.length > 0) {
      setFilteredUsers(usersData);
    }
  }, [usersData]);

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

  const approveUser = (user: User) => handleUserApproval(user);
  const makeAdmin = (user: User) => handleMakeAdmin(user);
  const revokeAdmin = (user: User) => handleRevokeAdmin(user);
  const deleteUser = (user: User) => handleDeleteUser(user);

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center py-24">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold mb-2">Error Loading Users</h2>
        <Button onClick={() => refetch()} className="mt-4 gap-2">
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="px-4 md:px-8 py-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Marketplace Users</h1>
              <p className="text-sm text-muted-foreground">
                Manage buyer registrations, approvals, and profile data
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkScoreUnscored}
              disabled={isBulkScoring}
              className="gap-2"
            >
              {isBulkScoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Score All Unscored
            </Button>
          </div>
        </div>
      </div>

      <div className="px-8 py-8">
        {linkedBuyerCount > 0 && (
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

        <div className="mb-6">
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

        <div className="bg-card rounded-lg border overflow-hidden">
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
                  users={filteredUsers.length > 0 ? filteredUsers : usersData}
                  onApprove={approveUser}
                  onMakeAdmin={makeAdmin}
                  onRevokeAdmin={revokeAdmin}
                  onDelete={deleteUser}
                  isLoading={isLoading}
                />
              </TableErrorBoundary>
            </div>
          )}
        </div>

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
          confirmText="Grant Admin Access"
          onConfirm={confirmMakeAdmin}
          isLoading={actionsLoading}
        />
        <UserConfirmationDialog
          open={dialogState.revokeAdmin}
          onOpenChange={handleCloseDialog}
          user={selectedUser}
          title="Revoke Admin Privileges"
          description="Are you sure you want to revoke admin privileges from {userName}?"
          confirmText="Revoke Admin Access"
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

export default MarketplaceUsersPage;
