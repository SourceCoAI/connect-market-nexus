/**
 * MyRequests (My Deals) — Premium buyer deal command center.
 *
 * Clean two-column layout:
 * 1. Slim account documents banner (only if unsigned)
 * 2. Sidebar (360px) with minimal deal cards
 * 3. Detail panel with action card, status, info, messages/activity tabs
 */

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { User } from '@/types';
import { useMarketplace } from '@/hooks/use-marketplace';
import {
  AlertCircle,
  FileText,
} from 'lucide-react';
import { useUnreadBuyerMessageCounts } from '@/hooks/use-connection-messages';
import { useIsMobile } from '@/hooks/use-mobile';
import { getProfileCompletionDetails } from '@/lib/buyer-metrics';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DealMessagesTab } from '@/components/deals/DealMessagesTab';
import { DealActivityLog } from '@/components/deals/DealActivityLog';
import { DealPipelineCard } from '@/components/deals/DealPipelineCard';
import { DealDetailHeader } from '@/components/deals/DealDetailHeader';
import { DealActionCard } from '@/components/deals/DealActionCard';
import { DealStatusSection } from '@/components/deals/DealStatusSection';
import { DealMessageEditor } from '@/components/deals/DealMessageEditor';
import { BuyerProfileStatus } from '@/components/deals/BuyerProfileStatus';
import { PostRejectionPanel } from '@/components/deals/PostRejectionPanel';
import { DealDocumentsCard } from '@/components/deals/DealDocumentsCard';
import { DealInfoCard } from '@/components/deals/DealInfoCard';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  useUserNotifications,
  useMarkRequestNotificationsAsRead,
  useMarkAllUserNotificationsAsRead,
} from '@/hooks/use-user-notifications';
import { useMyAgreementStatus } from '@/hooks/use-agreement-status';
import { useAgreementStatusSync } from '@/hooks/use-agreement-status-sync';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useBuyerNdaStatus } from '@/hooks/admin/use-pandadoc';

/* ═══════════════════════════════════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════════════════════════════════ */

const MyRequests = () => {
  const { user, isAdmin } = useAuth();
  const { useUserConnectionRequests, useUpdateConnectionMessage } = useMarketplace();
  const { data: requests = [], isLoading, error } = useUserConnectionRequests();
  const updateMessage = useUpdateConnectionMessage();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const [selectedDeal, setSelectedDeal] = useState<string | null>(null);
  const [innerTab, setInnerTab] = useState<Record<string, string>>({});
  const { unreadByRequest } = useUserNotifications();
  const markRequestNotificationsAsRead = useMarkRequestNotificationsAsRead();
  const markAllNotificationsAsRead = useMarkAllUserNotificationsAsRead();
  const { data: unreadMsgCounts } = useUnreadBuyerMessageCounts();
  const { data: ndaStatus } = useBuyerNdaStatus(!isAdmin ? user?.id : undefined);
  const { data: coverage } = useMyAgreementStatus(!isAdmin && !!user);
  useAgreementStatusSync();
  const [sortBy] = useState<'recent' | 'action' | 'status'>('recent');

  const getInnerTab = (requestId: string) => innerTab[requestId] || 'overview';
  const setDealInnerTab = (requestId: string, tab: string) =>
    setInnerTab((prev) => ({ ...prev, [requestId]: tab }));

  const { data: freshProfile } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });

  const profileForCalc = useMemo((): User | null => {
    const src = (freshProfile ?? user) as User | null;
    if (!src) return null;
    return { ...src, company: src.company ?? src.company_name ?? '' };
  }, [freshProfile, user]);

  const sortedRequests = useMemo(() => {
    const sorted = [...requests];
    switch (sortBy) {
      case 'recent':
        sorted.sort((a, b) => {
          const dateA = new Date(a.updated_at || a.created_at).getTime();
          const dateB = new Date(b.updated_at || b.created_at).getTime();
          return dateB - dateA;
        });
        break;
      case 'action': {
        const actionScore = (r: (typeof requests)[number]) => {
          let score = 0;
          if (!ndaStatus?.ndaSigned) score += 1;
          if (!coverage?.fee_covered) score += 1;
          const unread = (unreadByRequest[r.id] || 0) + (unreadMsgCounts?.byRequest[r.id] || 0);
          if (unread > 0) score += 1;
          if (r.status === 'pending') score += 1;
          return score;
        };
        sorted.sort((a, b) => {
          const diff = actionScore(b) - actionScore(a);
          if (diff !== 0) return diff;
          return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
        });
        break;
      }
      case 'status': {
        const statusOrder: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };
        sorted.sort((a, b) => {
          const diff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
          if (diff !== 0) return diff;
          return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
        });
        break;
      }
    }
    return sorted;
  }, [requests, sortBy, ndaStatus, coverage, unreadByRequest, unreadMsgCounts]);

  const handleSelectDeal = (dealId: string, tab?: string) => {
    setSelectedDeal(dealId);
    if (tab) setDealInnerTab(dealId, tab);
  };

  useEffect(() => {
    if (requests && requests.length > 0) {
      const requestIdFromUrl = searchParams.get('request') || searchParams.get('deal');
      if (requestIdFromUrl && requests.find((r) => r.id === requestIdFromUrl)) {
        setSelectedDeal(requestIdFromUrl);
        const tabParam = searchParams.get('tab');
        if (tabParam && ['overview', 'messages', 'activity'].includes(tabParam)) {
          setDealInnerTab(requestIdFromUrl, tabParam);
        }
      } else if (!selectedDeal) {
        setSelectedDeal(requests[0].id);
      }
    }
  }, [requests, selectedDeal, searchParams]);

  useEffect(() => {
    markAllNotificationsAsRead.mutate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedDeal) markRequestNotificationsAsRead.mutate(selectedDeal);
  }, [selectedDeal]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRequest = requests.find((r) => r.id === selectedDeal);

  if (error) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Failed to load your deals. Please try again later.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full bg-white min-h-screen">
        <div className="max-w-[1280px] mx-auto px-6 pt-8">
          <Skeleton className="h-7 w-32 mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
            <div className="space-y-2">
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
            <Skeleton className="h-[500px] w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!requests || requests.length === 0) {
    return (
      <div className="w-full bg-white min-h-screen">
        <div className="max-w-[1280px] mx-auto px-6 pt-8">
          <h1 className="text-xl font-semibold text-[#0E101A] tracking-tight">My Deals</h1>
        </div>
        <div className="min-h-[50vh] flex items-center justify-center px-4">
          <div className="text-center space-y-3 max-w-xs">
            <div className="flex justify-center">
              <div className="rounded-full bg-[#F5F3EE] p-3">
                <FileText className="h-5 w-5 text-[#0E101A]/30" />
              </div>
            </div>
            <h2 className="text-[15px] font-semibold text-[#0E101A]">No deals yet</h2>
            <p className="text-[13px] text-[#0E101A]/50 leading-relaxed">
              Browse the marketplace to find opportunities and express interest.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white min-h-screen">
      {/* Page Header */}
      <div className="max-w-[1280px] mx-auto px-6 pt-8 pb-5">
        <h1 className="text-xl font-semibold text-[#0E101A] tracking-tight">My Deals</h1>
      </div>

      <div className="max-w-[1280px] mx-auto px-6 pb-8">
      {/* Main container */}
        <div className="rounded-xl border border-[#F0EDE6] overflow-hidden">
          {/* Two-column layout */}
          <div className={cn('flex', isMobile ? 'flex-col' : 'flex-row')}>
            {/* Sidebar */}
            <div className={cn(
              'shrink-0 border-r border-[#F0EDE6] bg-[#FAFAF8]',
              isMobile ? 'w-full border-r-0 border-b' : 'w-[340px]',
            )}>
              <div className="px-4 py-3 border-b border-[#F0EDE6]">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-[#0E101A]/30 uppercase tracking-[0.12em]">
                    Deals
                  </span>
                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#0E101A] px-1.5 text-[9px] font-semibold text-white">
                    {requests.length}
                  </span>
                </div>
              </div>
              <div className="p-2 space-y-0.5 max-h-[calc(100vh-200px)] overflow-y-auto">
                {sortedRequests.map((request) => {
                  const unreadForRequest = (unreadByRequest[request.id] || 0) + (unreadMsgCounts?.byRequest[request.id] || 0);
                  return (
                    <DealPipelineCard
                      key={request.id}
                      request={request}
                      isSelected={selectedDeal === request.id}
                      unreadCount={unreadForRequest}
                      ndaSigned={ndaStatus?.ndaSigned ?? undefined}
                      onSelect={() => handleSelectDeal(request.id)}
                    />
                  );
                })}
              </div>
            </div>

            {/* Detail Panel */}
            {selectedRequest ? (
              <div className="flex-1 min-w-0 bg-white">
                <DetailPanel
                  request={selectedRequest}
                  innerTab={getInnerTab(selectedRequest.id)}
                  onInnerTabChange={(tab) => setDealInnerTab(selectedRequest.id, tab)}
                  unreadMsgCounts={unreadMsgCounts}
                  updateMessage={updateMessage}
                  profileForCalc={profileForCalc}
                  ndaSigned={ndaStatus?.ndaSigned ?? false}
                  feeCovered={coverage?.fee_covered ?? false}
                  feeStatus={coverage?.fee_status}
                />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center py-20">
                <p className="text-[13px] text-[#0E101A]/30">Select a deal to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   Detail Panel — Action card + Status + Info + Messages/Activity tabs
   ═══════════════════════════════════════════════════════════════════════ */

interface DetailPanelProps {
  request: import('@/types').ConnectionRequest;
  innerTab: string;
  onInnerTabChange: (tab: string) => void;
  unreadMsgCounts?: { byRequest: Record<string, number> };
  updateMessage: {
    mutateAsync: (args: { requestId: string; message: string }) => Promise<unknown>;
  };
  profileForCalc: User | null;
  ndaSigned: boolean;
  feeCovered: boolean;
  feeStatus?: string;
}

function DetailPanel({
  request,
  innerTab,
  onInnerTabChange,
  unreadMsgCounts,
  updateMessage,
  profileForCalc,
  ndaSigned,
  feeCovered,
  feeStatus,
}: DetailPanelProps) {
  const requestStatus = request.status as 'pending' | 'approved' | 'rejected' | 'on_hold';
  const msgUnread = unreadMsgCounts?.byRequest[request.id] || 0;
  const profileDetails = profileForCalc ? getProfileCompletionDetails(profileForCalc) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <DealDetailHeader
        listingId={request.listing_id}
        title={request.listing?.title || 'Untitled'}
        category={request.listing?.category}
        location={request.listing?.location}
        acquisitionType={request.listing?.acquisition_type}
        ebitda={request.listing?.ebitda}
        revenue={request.listing?.revenue}
        requestStatus={requestStatus as 'pending' | 'approved' | 'rejected'}
        ndaSigned={ndaSigned}
      />

      {/* Tabs */}
      <Tabs value={innerTab} onValueChange={onInnerTabChange} className="flex-1 flex flex-col">
        <div className="border-b border-[#F0EDE6] px-6 bg-white">
          <TabsList className="inline-flex h-auto items-center bg-transparent p-0 gap-0 w-full justify-start rounded-none">
            <TabsTrigger
              value="overview"
              className={cn(
                'px-4 py-3 text-[12px] font-medium rounded-none border-b-2 transition-colors',
                innerTab === 'overview'
                  ? 'border-[#0E101A] text-[#0E101A] font-semibold'
                  : 'border-transparent text-[#0E101A]/35 hover:text-[#0E101A]/60',
              )}
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="messages"
              className={cn(
                'px-4 py-3 text-[12px] font-medium rounded-none border-b-2 transition-colors flex items-center gap-1.5',
                innerTab === 'messages'
                  ? 'border-[#0E101A] text-[#0E101A] font-semibold'
                  : 'border-transparent text-[#0E101A]/35 hover:text-[#0E101A]/60',
              )}
            >
              Messages
              {msgUnread > 0 && (
                <div className="h-1.5 w-1.5 rounded-full bg-[#DEC76B]" />
              )}
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className={cn(
                'px-4 py-3 text-[12px] font-medium rounded-none border-b-2 transition-colors',
                innerTab === 'activity'
                  ? 'border-[#0E101A] text-[#0E101A] font-semibold'
                  : 'border-transparent text-[#0E101A]/35 hover:text-[#0E101A]/60',
              )}
            >
              Activity
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="overview" className="mt-0 p-6 space-y-5">
            {/* Row 1: Action Card — full width */}
            <DealActionCard
              requestStatus={requestStatus as 'pending' | 'approved' | 'rejected'}
              ndaSigned={ndaSigned}
              feeCovered={feeCovered}
              feeStatus={feeStatus}
              requestCreatedAt={request.created_at}
            />

            {/* Row 2: Two-column grid — Documents + Deal Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DealDocumentsCard
                dealId={request.listing_id}
                requestStatus={requestStatus as 'pending' | 'approved' | 'rejected'}
                ndaSigned={ndaSigned}
                feeCovered={feeCovered}
                feeStatus={feeStatus}
              />
              <DealInfoCard
                category={request.listing?.category}
                location={request.listing?.location}
                revenue={request.listing?.revenue}
                ebitda={request.listing?.ebitda}
                acquisitionType={request.listing?.acquisition_type}
                createdAt={request.created_at}
                description={request.listing?.description}
              />
            </div>

            {/* Row 3: Deal Progress — full width */}
            <DealStatusSection
              requestStatus={requestStatus as 'pending' | 'approved' | 'rejected'}
              ndaSigned={ndaSigned}
              feeCovered={feeCovered}
              feeStatus={feeStatus}
              requestCreatedAt={request.created_at}
            />

            {/* Post-rejection panel */}
            {requestStatus === 'rejected' && (
              <PostRejectionPanel
                listingCategory={request.listing?.category}
                listingLocation={request.listing?.location}
              />
            )}

            {/* Row 4: Two-column — Your Message + Profile Status */}
            {requestStatus !== 'rejected' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-[#F0EDE6] bg-white p-5">
                  <h4 className="text-[10px] font-semibold text-[#0E101A]/30 uppercase tracking-[0.12em] mb-3">
                    Your Message
                  </h4>
                  <DealMessageEditor
                    requestId={request.id}
                    initialMessage={request.user_message || ''}
                    onMessageUpdate={async (newMessage) => {
                      await updateMessage.mutateAsync({ requestId: request.id, message: newMessage });
                    }}
                  />
                </div>
                {profileDetails && (
                  <div className="rounded-lg border border-[#F0EDE6] bg-white p-5">
                    <h4 className="text-[10px] font-semibold text-[#0E101A]/30 uppercase tracking-[0.12em] mb-3">
                      Buyer Profile
                    </h4>
                    <BuyerProfileStatus
                      isComplete={profileDetails.isComplete}
                      completionPercentage={profileDetails.percentage}
                    />
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="messages" className="mt-0 p-6">
            <DealMessagesTab requestId={request.id} requestStatus={requestStatus} />
          </TabsContent>

          <TabsContent value="activity" className="mt-0 p-6">
            <DealActivityLog requestId={request.id} requestStatus={requestStatus} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default MyRequests;
