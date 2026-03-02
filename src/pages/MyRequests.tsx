/**
 * MyRequests (My Deals) — The buyer's deal pipeline page.
 *
 * Clean, minimal layout:
 * 1. Account Status bar (only shown when documents need signing)
 * 2. Deal cards (left) + Detail panel (right)
 * 3. Tabs: Overview | Messages | Activity Log (no Documents tab)
 */

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { User } from '@/types';
import { useMarketplace } from '@/hooks/use-marketplace';
import {
  AlertCircle,
  FileText,
  MessageSquare,
  Activity,
  ArrowUpDown,
  Shield,
  FileSignature,
  ArrowRight,
  Check,
} from 'lucide-react';
import { useUnreadBuyerMessageCounts } from '@/hooks/use-connection-messages';
import { useIsMobile } from '@/hooks/use-mobile';
import { getProfileCompletionDetails } from '@/lib/buyer-metrics';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DealProcessSteps } from '@/components/deals/DealProcessSteps';
import { DealDetailsCard } from '@/components/deals/DealDetailsCard';
import { DealMessagesTab } from '@/components/deals/DealMessagesTab';
import { DealActivityLog } from '@/components/deals/DealActivityLog';
import { DealPipelineCard } from '@/components/deals/DealPipelineCard';
import { DealDetailHeader } from '@/components/deals/DealDetailHeader';
import { DealNextSteps } from '@/components/deals/DealNextSteps';
import { AgreementSigningModal } from '@/components/docuseal/AgreementSigningModal';
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
import { useBuyerNdaStatus } from '@/hooks/admin/use-docuseal';

/* ═══════════════════════════════════════════════════════════════════════
   Account Status Bar — Firm-level document signing status
   ═══════════════════════════════════════════════════════════════════════ */

interface AccountStatusBarProps {
  ndaSigned: boolean;
  feeCovered: boolean;
  feeStatus?: string;
}

function AccountStatusBar({ ndaSigned, feeCovered, feeStatus }: AccountStatusBarProps) {
  const [signingOpen, setSigningOpen] = useState(false);
  const [signingType, setSigningType] = useState<'nda' | 'fee_agreement'>('nda');

  const showFeeRow = !feeCovered && feeStatus === 'sent';
  const needsNda = !ndaSigned;

  // Hide entirely when everything is signed
  if (!needsNda && !showFeeRow) return null;

  const openSigning = (type: 'nda' | 'fee_agreement') => {
    setSigningType(type);
    setSigningOpen(true);
  };

  const rows: { key: string; icon: typeof Shield; label: string; signed: boolean; type: 'nda' | 'fee_agreement' }[] = [];

  rows.push({
    key: 'nda',
    icon: Shield,
    label: 'Non-Disclosure Agreement',
    signed: ndaSigned,
    type: 'nda',
  });

  if (showFeeRow || feeCovered) {
    rows.push({
      key: 'fee',
      icon: FileSignature,
      label: 'Fee Agreement',
      signed: feeCovered,
      type: 'fee_agreement',
    });
  }

  return (
    <>
      <div className="rounded-xl border border-[#E5DDD0] bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E5DDD0]/60">
          <p className="text-[11px] font-semibold text-[#0E101A]/40 uppercase tracking-[0.1em]">
            Account Documents
          </p>
        </div>
        <div className="divide-y divide-[#E5DDD0]/40">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <div key={row.key} className="flex items-center gap-3 px-5 py-3">
                {/* Status indicator */}
                <div
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                    row.signed
                      ? 'bg-emerald-500 text-white'
                      : 'bg-[#FBF7EC] border border-[#DEC76B]',
                  )}
                >
                  {row.signed ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : (
                    <Icon className="h-3 w-3 text-[#8B6F47]" />
                  )}
                </div>

                {/* Label */}
                <span
                  className={cn(
                    'text-sm font-medium flex-1',
                    row.signed ? 'text-[#0E101A]/70' : 'text-[#0E101A]',
                  )}
                >
                  {row.label}
                </span>

                {/* Status / Action */}
                {row.signed ? (
                  <span className="text-xs font-medium text-emerald-600">Signed</span>
                ) : (
                  <button
                    onClick={() => openSigning(row.type)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0E101A] text-white hover:bg-[#0E101A]/80 transition-colors"
                  >
                    Sign Now
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <AgreementSigningModal
        open={signingOpen}
        onOpenChange={setSigningOpen}
        documentType={signingType}
      />
    </>
  );
}

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
  const [sortBy, setSortBy] = useState<'recent' | 'action' | 'status'>('recent');

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
      <div className="w-full bg-[#FCF9F0] min-h-screen">
        <div className="px-4 sm:px-8 pt-8 pb-6 max-w-[1200px] mx-auto">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-72 mt-2" />
        </div>
        <div className="px-4 sm:px-8 max-w-[1200px] mx-auto">
          <Skeleton className="h-24 w-full rounded-xl mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
            <div className="space-y-3">
              <Skeleton className="h-36 w-full rounded-xl" />
              <Skeleton className="h-36 w-full rounded-xl" />
            </div>
            <Skeleton className="h-[500px] w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!requests || requests.length === 0) {
    return (
      <div className="w-full bg-[#FCF9F0] min-h-screen">
        <div className="px-4 sm:px-8 pt-8 pb-6 max-w-[1200px] mx-auto">
          <h1 className="text-[28px] font-semibold text-[#0E101A] tracking-tight">My Deals</h1>
          <p className="text-sm text-[#0E101A]/50 mt-1">Track your active opportunities</p>
        </div>
        <div className="min-h-[50vh] flex items-center justify-center px-4">
          <div className="text-center space-y-4 max-w-sm">
            <div className="flex justify-center">
              <div className="rounded-full bg-[#E5DDD0] p-3">
                <FileText className="h-6 w-6 text-[#0E101A]/40" />
              </div>
            </div>
            <h2 className="text-base font-semibold text-[#0E101A]">No deals yet</h2>
            <p className="text-sm text-slate-600 leading-6">
              You haven't submitted any connection requests yet. Browse the marketplace to find opportunities.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#FCF9F0] min-h-screen">
      {/* Page Header */}
      <div className="px-4 sm:px-8 pt-8 pb-5 max-w-[1200px] mx-auto">
        <h1 className="text-[28px] font-semibold text-[#0E101A] tracking-tight">My Deals</h1>
        <p className="text-sm text-[#0E101A]/50 mt-1">Track your active opportunities</p>
      </div>

      <div className="px-4 sm:px-8 pb-8 max-w-[1200px] mx-auto space-y-6">
        {/* Account Status Bar — only visible when documents need signing */}
        <AccountStatusBar
          ndaSigned={ndaStatus?.ndaSigned ?? false}
          feeCovered={coverage?.fee_covered ?? false}
          feeStatus={coverage?.fee_status}
        />

        {/* Main Grid */}
        <div className={cn('grid gap-5', isMobile ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[340px_1fr]')}>
          {/* Left Column: Deal Cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-semibold text-slate-500 uppercase tracking-[0.08em]">
                  Active Deals
                </h2>
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#0E101A] px-2 text-[11px] font-semibold text-white">
                  {requests.length}
                </span>
              </div>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'recent' | 'action' | 'status')}>
                <SelectTrigger className="h-7 w-[140px] text-[11px] border-slate-200 bg-white">
                  <ArrowUpDown className="h-3 w-3 mr-1 text-slate-400 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent" className="text-[12px]">Most Recent</SelectItem>
                  <SelectItem value="action" className="text-[12px]">Action Required</SelectItem>
                  <SelectItem value="status" className="text-[12px]">Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2.5">
              {sortedRequests.map((request) => {
                const unreadForRequest = (unreadByRequest[request.id] || 0) + (unreadMsgCounts?.byRequest[request.id] || 0);
                let pendingAction: string | undefined;
                if (request.status === 'pending') pendingAction = 'Under Review';

                return (
                  <DealPipelineCard
                    key={request.id}
                    request={request}
                    isSelected={selectedDeal === request.id}
                    unreadCount={unreadForRequest}
                    ndaSigned={ndaStatus?.ndaSigned ?? undefined}
                    onSelect={() => handleSelectDeal(request.id)}
                    pendingAction={pendingAction}
                  />
                );
              })}
            </div>
          </div>

          {/* Right Column: Detail Panel */}
          {selectedRequest && (
            <div className="min-w-0">
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
          )}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   Detail Panel — 3 tabs: Overview | Messages | Activity Log
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

  return (
    <div className="bg-white rounded-xl border border-[#E5DDD0] shadow-[0_4px_16px_rgba(14,16,26,0.06)] overflow-hidden">
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

      <Tabs value={innerTab} onValueChange={onInnerTabChange} className="w-full">
        <div className="border-b border-slate-100 px-6 bg-white">
          <TabsList className="inline-flex h-auto items-center bg-transparent p-0 gap-0.5 w-full justify-start rounded-none">
            <TabsTrigger
              value="overview"
              className={cn(
                'px-4 py-3 text-[13px] font-medium rounded-none border-b-2 transition-colors',
                innerTab === 'overview'
                  ? 'border-[#0E101A] text-[#0E101A] font-semibold'
                  : 'border-transparent text-[#0E101A]/40 hover:text-[#0E101A]',
              )}
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="messages"
              className={cn(
                'px-4 py-3 text-[13px] font-medium rounded-none border-b-2 transition-colors flex items-center gap-1.5',
                innerTab === 'messages'
                  ? 'border-[#0E101A] text-[#0E101A] font-semibold'
                  : 'border-transparent text-[#0E101A]/40 hover:text-[#0E101A]',
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Messages
              {msgUnread > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                  {msgUnread > 99 ? '99+' : msgUnread}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className={cn(
                'px-4 py-3 text-[13px] font-medium rounded-none border-b-2 transition-colors flex items-center gap-1.5',
                innerTab === 'activity'
                  ? 'border-[#0E101A] text-[#0E101A] font-semibold'
                  : 'border-transparent text-[#0E101A]/40 hover:text-[#0E101A]',
              )}
            >
              <Activity className="h-3.5 w-3.5" />
              Activity Log
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="p-6">
          <TabsContent value="overview" className="mt-0 space-y-6">
            <DealNextSteps
              requestCreatedAt={request.created_at}
              ndaSigned={ndaSigned}
              feeCovered={feeCovered}
              feeStatus={feeStatus}
              requestStatus={requestStatus as 'pending' | 'approved' | 'rejected'}
            />

            <DealProcessSteps
              requestStatus={request.status as 'pending' | 'approved' | 'rejected'}
              requestId={request.id}
              userMessage={request.user_message}
              onMessageUpdate={async (newMessage) => {
                await updateMessage.mutateAsync({ requestId: request.id, message: newMessage });
              }}
              isProfileComplete={getProfileCompletionDetails(profileForCalc).isComplete}
              profileCompletionPercentage={getProfileCompletionDetails(profileForCalc).percentage}
              listingCategory={request.listing?.category}
              listingLocation={request.listing?.location}
              requestCreatedAt={request.created_at}
            />

            <DealDetailsCard
              listing={{
                category: request.listing?.category,
                location: request.listing?.location,
                description: request.listing?.description,
              }}
              createdAt={request.created_at}
            />
          </TabsContent>

          <TabsContent value="messages" className="mt-0">
            <DealMessagesTab requestId={request.id} requestStatus={requestStatus} />
          </TabsContent>

          <TabsContent value="activity" className="mt-0">
            <DealActivityLog requestId={request.id} requestStatus={requestStatus} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default MyRequests;
