import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAdmin } from '@/hooks/use-admin';
import { AdminConnectionRequest } from '@/types/admin';
import ConnectionRequestsTable from '@/components/admin/ConnectionRequestsTable';
import { ConnectionRequestEmailDialog } from '@/components/admin/ConnectionRequestEmailDialog';
import { ApprovalEmailDialog } from '@/components/admin/ApprovalEmailDialog';
import { PipelineFilters } from '@/components/admin/PipelineFilters';
import {
  usePipelineFilters,
  type StatusFilter,
  type BuyerTypeFilter,
  type NdaFilter,
  type FeeAgreementFilter,
  
  type SortOption,
} from '@/hooks/admin/use-pipeline-filters';
import { toast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileConnectionRequests } from '@/components/admin/MobileConnectionRequests';
import { AdminRequestsWrapper } from '@/components/admin/AdminRequestsWrapper';
import { invalidateConnectionRequests } from '@/lib/query-client-helpers';
import { EmailTestButton } from '@/components/admin/EmailTestButton';
import { ListingFilterSelect } from '@/components/admin/ListingFilterSelect';
import { RequestsGridView } from '@/components/admin/RequestsGridView';
import { ViewSwitcher } from '@/components/admin/ViewSwitcher';
import { supabase } from '@/integrations/supabase/client';
import { useMarkConnectionRequestsViewed } from '@/hooks/admin/use-mark-connection-requests-viewed';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';
import { useAIUIActionHandler } from '@/hooks/useAIUIActionHandler';

const AdminRequests = () => {
  const queryClient = useQueryClient();
  const {
    useConnectionRequests,
    useConnectionRequestsMutation,
    sendCustomApprovalEmail,
  } = useAdmin();
  const { markAsViewed } = useMarkConnectionRequestsViewed();

  const { data: requests = [], isLoading, error, refetch } = useConnectionRequests();
  
  const { mutateAsync: updateRequest, isPending: isUpdating } = useConnectionRequestsMutation();

  const isMobile = useIsMobile();

  // URL-persisted filter state (survives browser Back navigation)
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') ?? '';
  const setSearchQuery = useCallback(
    (v: string) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v) n.set('q', v);
          else n.delete('q');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const selectedListingId = searchParams.get('listing') ?? null;
  const setSelectedListingId = useCallback(
    (v: string | null) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v) n.set('listing', v);
          else n.delete('listing');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const viewMode = (searchParams.get('view') as 'table' | 'grid') ?? 'table';
  const setViewMode = useCallback(
    (v: 'table' | 'grid') => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'table') n.set('view', v);
          else n.delete('view');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const [selectedRequest, setSelectedRequest] = useState<AdminConnectionRequest | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedUserForApprovalEmail, setSelectedUserForApprovalEmail] = useState<any>(null);
  const [isApprovalEmailDialogOpen, setIsApprovalEmailDialogOpen] = useState(false);

  // Mark connection requests as viewed when component mounts
  useEffect(() => {
    markAsViewed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register AI Command Center context
  const { setPageContext } = useAICommandCenterContext();
  useEffect(() => {
    setPageContext({ page: 'admin_requests', entity_type: 'leads' });
  }, [setPageContext]);

  // Wire AI UI actions
  useAIUIActionHandler({
    table: 'leads',
    onApplyFilter: (filters, clearExisting) => {
      if (clearExisting) {
        setStatusFilter('all');
        setBuyerTypeFilter('all');
        setNdaFilter('all');
        setFeeAgreementFilter('all');
        setDateRangeFilter('all');
        setSearchQuery('');
      }
      filters.forEach((f) => {
        switch (f.field) {
          case 'status':
            setStatusFilter(f.value as StatusFilter);
            break;
          case 'buyer_type':
            setBuyerTypeFilter(f.value as BuyerTypeFilter);
            break;
          case 'nda':
          case 'nda_status':
            setNdaFilter(f.value as NdaFilter);
            break;
          case 'fee_agreement':
          case 'fee_agreement_status':
            setFeeAgreementFilter(f.value as FeeAgreementFilter);
            break;
          case 'search':
          case 'query':
            setSearchQuery(f.value as string);
            break;
        }
      });
    },
    onSortColumn: (field) => {
      const sortMap: Record<string, string> = {
        created_at: 'newest',
        date: 'newest',
        name: 'name_asc',
        company: 'company',
        status: 'status',
      };
      setSortOption((sortMap[field] || field) as SortOption);
    },
    onClearSelection: () => {
      setStatusFilter('all');
      setBuyerTypeFilter('all');
      setNdaFilter('all');
      setFeeAgreementFilter('all');
      setDateRangeFilter('all');
      setSearchQuery('');
    },
  });

  // Realtime subscriptions for instant updates
  useEffect(() => {
    const requestsChannel = supabase
      .channel('connection-requests-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connection_requests',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(requestsChannel);
    };
  }, [queryClient]);

  // Pipeline filtering and sorting
  const {
    statusFilter,
    buyerTypeFilter,
    ndaFilter,
    feeAgreementFilter,
    dateRangeFilter,
    sortOption,
    filteredAndSortedRequests: pipelineFilteredRequests,
    setStatusFilter,
    setBuyerTypeFilter,
    setNdaFilter,
    setFeeAgreementFilter,
    setDateRangeFilter,
    setSortOption,
  } = usePipelineFilters(requests);

  if (error) {
    console.error('Connection requests error:', error);
  }

  // Apply search and listing filters to pipeline-filtered requests
  const filteredRequests = pipelineFilteredRequests.filter((request) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      request.user?.first_name?.toLowerCase().includes(searchLower) ||
      request.user?.last_name?.toLowerCase().includes(searchLower) ||
      request.user?.company?.toLowerCase().includes(searchLower) ||
      request.user?.email?.toLowerCase().includes(searchLower) ||
      request.lead_name?.toLowerCase().includes(searchLower) ||
      request.lead_email?.toLowerCase().includes(searchLower) ||
      request.lead_company?.toLowerCase().includes(searchLower) ||
      request.listing?.title?.toLowerCase().includes(searchLower) ||
      request.listing?.category?.toLowerCase().includes(searchLower);

    const matchesListing = !selectedListingId || request.listing?.id === selectedListingId;

    return matchesSearch && matchesListing;
  });

  // Get selected listing details for grid view
  const selectedListing = selectedListingId
    ? requests.find((r) => r.listing?.id === selectedListingId)?.listing
    : null;

  const handleAction = (request: AdminConnectionRequest, action: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setActionType(action);
    setIsDialogOpen(true);
  };

  const confirmAction = async (comment: string, senderEmail?: string, customBody?: string) => {
    if (selectedRequest && actionType) {
      try {
        await updateRequest({
          requestId: selectedRequest.id,
          status: actionType === 'approve' ? 'approved' : 'rejected',
          adminComment: comment,
        });

        // Force refetch
        await refetch();

        // Resolve sender details
        const { DEAL_OWNER_SENDERS } = await import('@/lib/admin-profiles');
        const sender = DEAL_OWNER_SENDERS.find(s => s.email === senderEmail);
        const finalSenderEmail = senderEmail || 'support@sourcecodeals.com';
        const finalSenderName = sender?.name || 'SourceCo';

        // Send email notification via proper edge functions (non-blocking)
        if (actionType === 'approve') {
          supabase.functions.invoke('send-connection-notification', {
            body: {
              type: 'buyer_approval',
              connectionRequestId: selectedRequest.id,
              buyerEmail: selectedRequest.user?.email,
              buyerName: `${selectedRequest.user?.first_name || ''} ${selectedRequest.user?.last_name || ''}`.trim(),
              listingTitle: selectedRequest.listing?.title || '',
              companyName: selectedRequest.listing?.internal_company_name || selectedRequest.listing?.title || '',
              senderEmail: finalSenderEmail,
              senderName: finalSenderName,
              replyTo: finalSenderEmail,
              customBodyText: customBody || undefined,
            },
          }).catch((e: Error) => console.error('Email send failed:', e));
          toast({
            title: 'Request approved',
            description: 'Connection request has been approved',
          });
        } else {
          supabase.functions.invoke('notify-buyer-rejection', {
            body: {
              connectionRequestId: selectedRequest.id,
              buyerEmail: selectedRequest.user?.email,
              buyerName: `${selectedRequest.user?.first_name || ''} ${selectedRequest.user?.last_name || ''}`.trim(),
              companyName: selectedRequest.listing?.internal_company_name || selectedRequest.listing?.title || '',
              senderEmail: finalSenderEmail,
              senderName: finalSenderName,
              replyTo: finalSenderEmail,
              customBodyText: customBody || undefined,
            },
          }).catch((e: Error) => console.error('Email send failed:', e));
          toast({
            title: 'Request rejected',
            description: 'Connection request has been rejected',
          });
        }

        setIsDialogOpen(false);
        setSelectedRequest(null);
        setActionType(null);
         
      } catch (error: unknown) {
        console.error(`[AdminRequests] confirmAction failed:`, error);
        toast({
          variant: 'destructive',
          title: 'Update failed',
          description: (error as Error)?.message || 'Could not update connection request status',
        });
      }
    }
  };

  // Mobile Layout
  if (isMobile) {
    return (
      <AdminRequestsWrapper>
        <MobileConnectionRequests
          requests={filteredRequests}
          onApprove={(request) => handleAction(request, 'approve')}
          onReject={(request) => handleAction(request, 'reject')}
          isLoading={isLoading}
        />
      </AdminRequestsWrapper>
    );
  }

  // Desktop Layout
  return (
    <AdminRequestsWrapper>
      <div className="space-y-4 md:space-y-6">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Request Management</h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Manage buyer connection requests
            </p>
          </div>
        </div>

        <div className="space-y-6">
            {/* Consolidated Filter Bar */}
            <PipelineFilters
              requests={requests}
              filteredCount={filteredRequests.length}
              statusFilter={statusFilter}
              buyerTypeFilter={buyerTypeFilter}
              ndaFilter={ndaFilter}
              feeAgreementFilter={feeAgreementFilter}
              dateRangeFilter={dateRangeFilter}
              sortOption={sortOption}
              searchQuery={searchQuery}
              onStatusFilterChange={setStatusFilter}
              onBuyerTypeFilterChange={(filter) => setBuyerTypeFilter(filter)}
              onNdaFilterChange={setNdaFilter}
              onFeeAgreementFilterChange={setFeeAgreementFilter}
              onDateRangeFilterChange={setDateRangeFilter}
              onSortChange={(sort) => setSortOption(sort)}
              onSearchChange={setSearchQuery}
              listingFilter={
                <ListingFilterSelect
                  requests={requests}
                  selectedListingId={selectedListingId}
                  onListingChange={setSelectedListingId}
                />
              }
              viewSwitcher={
                selectedListingId ? (
                  <ViewSwitcher viewMode={viewMode} onViewChange={setViewMode} />
                ) : undefined
              }
            />

            {/* Content area */}
            {selectedListingId && viewMode === 'grid' ? (
              <RequestsGridView
                requests={filteredRequests}
                selectedListing={
                  selectedListing
                    ? {
                        id: selectedListing.id,
                        title: selectedListing.title,
                        internal_company_name: selectedListing.internal_company_name,
                      }
                    : null
                }
              />
            ) : (
              <div className="bg-card/30 backdrop-blur-sm rounded-xl border border-border/50 overflow-hidden shadow-sm">
                <ConnectionRequestsTable
                  requests={filteredRequests}
                  isLoading={isLoading}
                  onRefresh={() => refetch()}
                />
              </div>
            )}
        </div>

        <ConnectionRequestEmailDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onConfirm={confirmAction}
          selectedRequest={selectedRequest}
          actionType={actionType}
          isLoading={isUpdating}
        />

        <ApprovalEmailDialog
          open={isApprovalEmailDialogOpen}
          onOpenChange={setIsApprovalEmailDialogOpen}
          user={selectedUserForApprovalEmail}
          onSendApprovalEmail={async (user, options) => {
            try {
              // Immediately close dialog and update cache for instant UI response
              setIsApprovalEmailDialogOpen(false);
              setSelectedUserForApprovalEmail(null);

              // Immediate cache invalidation without waiting
              invalidateConnectionRequests(queryClient);

              // Send email in background
              sendCustomApprovalEmail(user, options).catch((error) => {
                console.error('Error sending approval email:', error);
              });
            } catch (error) {
              console.error('Error processing approval:', error);
            }
          }}
        />

        {/* Edge Case Tools */}
        <details className="group">
          <summary className="flex items-center justify-between py-2 cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <span>🔧 Edge Case Tools (Rarely Used)</span>
            <span className="group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="mt-4">
            <EmailTestButton />
          </div>
        </details>
      </div>
    </AdminRequestsWrapper>
  );
};

export default AdminRequests;
