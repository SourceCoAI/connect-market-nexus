/**
 * MyRequests (My Deals) — The buyer's deal pipeline page.
 *
 * This is the primary hub for buyers to track all their active opportunities,
 * take required actions, and communicate with the SourceCo deal team.
 *
 * Layout (desktop):
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  Page Header: "My Deals" + subtitle + deal count                    │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │  Action Hub: Navy bar with aggregated action chips across ALL deals │
 * ├──────────────────┬───────────────────────────────────────────────────┤
 * │  Deal Cards      │  Detail Panel                                    │
 * │  (340px sidebar) │  ┌──────────────────────────────────────────────┐│
 * │  ┌──────────┐    │  │ Navy Header: icon + title + tags + EBITDA   ││
 * │  │ Card 1 ● │    │  │ Pipeline progress: 6-stage checklist        ││
 * │  └──────────┘    │  ├──────────────────────────────────────────────┤│
 * │  ┌──────────┐    │  │ Tabs: Overview | Messages | Documents | Log ││
 * │  │ Card 2   │    │  ├──────────────────────────────────────────────┤│
 * │  └──────────┘    │  │ Tab Content                                 ││
 * │  ┌──────────┐    │  │  - Overview: Stats + Next Steps + Process   ││
 * │  │ Card 3   │    │  │  - Messages: Human-only chat thread         ││
 * │  └──────────┘    │  │  - Documents: Agreements + data room        ││
 * │                  │  │  - Activity: System notification timeline    ││
 * │                  │  └──────────────────────────────────────────────┘│
 * └──────────────────┴───────────────────────────────────────────────────┘
 *
 * Key design decisions:
 *
 *   • The Overview tab layers THREE information types:
 *     1. DealNextSteps — the per-deal action checklist (Sign NDA, Fee, Deal Memo)
 *     2. DealMetricsCard — financial summary and key stats
 *     3. DealProcessSteps — request lifecycle progress + DealReviewPanel +
 *        WhileYouWaitChecklist + PostRejectionPanel
 *     4. DealDetailsCard — about the opportunity, submission date
 *
 *     The Next Steps checklist is placed FIRST because it answers the
 *     buyer's most urgent question: "What do I need to do right now?"
 *
 *   • The detail panel header (DealDetailHeader) uses a navy background
 *     to create clear visual separation from the tab content below.  It
 *     shows EBITDA prominently (the primary valuation metric) and a
 *     6-stage pipeline progress bar so buyers always know where the deal
 *     stands in the full M&A lifecycle.
 *
 *   • Existing features from the previous implementation are preserved:
 *     - DealReviewPanel (edit connection message while under review)
 *     - WhileYouWaitChecklist (contextual actions during waiting)
 *     - PostRejectionPanel (similar deals + re-engagement after rejection)
 *     These appear inside DealProcessSteps in the Overview tab.
 *
 * State management:
 *   - selectedDeal: which deal card is active (persisted across renders)
 *   - innerTab: per-deal tab state (tracks which tab is open per deal)
 *   - URL params: supports ?request=<id>&tab=<tab> for deep linking
 */

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { User } from '@/types';
import { useMarketplace } from '@/hooks/use-marketplace';
import {
  AlertCircle,
  FileText,
  MessageSquare,
  FolderOpen,
  Activity,
  ArrowUpDown,
  Sparkles,
  Bell,
  Mail,
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DealProcessSteps } from '@/components/deals/DealProcessSteps';
import { DealDetailsCard } from '@/components/deals/DealDetailsCard';
import { DealMetricsCard } from '@/components/deals/DealMetricsCard';
import { DealMessagesTab } from '@/components/deals/DealMessagesTab';
import { DealDocumentsTab } from '@/components/deals/DealDocumentsTab';
import { DealActivityLog } from '@/components/deals/DealActivityLog';
import { ActionHub } from '@/components/deals/ActionHub';
import { DealPipelineCard } from '@/components/deals/DealPipelineCard';
import { DealDetailHeader } from '@/components/deals/DealDetailHeader';
import { DealNextSteps } from '@/components/deals/DealNextSteps';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  useUserNotifications,
  useMarkRequestNotificationsAsRead,
  useMarkAllUserNotificationsAsRead,
} from '@/hooks/use-user-notifications';
import { useMyAgreementStatus } from '@/hooks/use-agreement-status';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useBuyerNdaStatus } from '@/hooks/admin/use-docuseal';

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
  const { unreadByRequest, unreadDocsByDeal } = useUserNotifications();
  const markRequestNotificationsAsRead = useMarkRequestNotificationsAsRead();
  const markAllNotificationsAsRead = useMarkAllUserNotificationsAsRead();
  const { data: unreadMsgCounts } = useUnreadBuyerMessageCounts();
  const { data: ndaStatus } = useBuyerNdaStatus(!isAdmin ? user?.id : undefined);
  const { data: coverage } = useMyAgreementStatus(!isAdmin && !!user);
  const [sortBy, setSortBy] = useState<'recent' | 'action' | 'status'>('recent');

  /** Get the active inner tab for a specific deal (defaults to "overview") */
  const getInnerTab = (requestId: string) => innerTab[requestId] || 'overview';

  /** Set the inner tab for a specific deal */
  const setDealInnerTab = (requestId: string, tab: string) =>
    setInnerTab((prev) => ({ ...prev, [requestId]: tab }));

  /**
   * Fetch fresh profile data to avoid stale completeness calculations.
   * The profile determines whether the "complete your profile" nudges
   * appear in DealProcessSteps and WhileYouWaitChecklist.
   */
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
    return {
      ...src,
      company: src.company ?? src.company_name ?? '',
    };
  }, [freshProfile, user]);

  /**
   * Sorted requests based on the user's chosen sort order.
   * - "recent": by updated_at (then created_at) descending
   * - "action": deals needing buyer action first (pending NDA, pending fee, unread messages)
   * - "status": pending first, then approved, then rejected
   */
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
          // Pending NDA adds urgency
          if (!ndaStatus?.ndaSigned) score += 1;
          // Pending fee adds urgency
          if (!coverage?.fee_covered) score += 1;
          // Unread messages add urgency
          const unread = (unreadByRequest[r.id] || 0) + (unreadMsgCounts?.byRequest[r.id] || 0);
          if (unread > 0) score += 1;
          // Pending status means review needed
          if (r.status === 'pending') score += 1;
          return score;
        };
        sorted.sort((a, b) => {
          const diff = actionScore(b) - actionScore(a);
          if (diff !== 0) return diff;
          // Tie-break by most recent
          return (
            new Date(b.updated_at || b.created_at).getTime() -
            new Date(a.updated_at || a.created_at).getTime()
          );
        });
        break;
      }
      case 'status': {
        const statusOrder: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };
        sorted.sort((a, b) => {
          const diff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
          if (diff !== 0) return diff;
          return (
            new Date(b.updated_at || b.created_at).getTime() -
            new Date(a.updated_at || a.created_at).getTime()
          );
        });
        break;
      }
    }
    return sorted;
  }, [requests, sortBy, ndaStatus, coverage, unreadByRequest, unreadMsgCounts]);

  /**
   * Handle deal selection from URL parameters, ActionHub clicks,
   * or direct card clicks.  Optionally jumps to a specific tab.
   */
  const handleSelectDeal = (dealId: string, tab?: string) => {
    setSelectedDeal(dealId);
    if (tab) {
      setDealInnerTab(dealId, tab);
    }
  };

  // Set selected deal from URL parameter or default to first request
  useEffect(() => {
    if (requests && requests.length > 0) {
      const requestIdFromUrl = searchParams.get('request') || searchParams.get('deal');
      if (requestIdFromUrl && requests.find((r) => r.id === requestIdFromUrl)) {
        setSelectedDeal(requestIdFromUrl);
        const tabParam = searchParams.get('tab');
        if (tabParam && ['overview', 'documents', 'messages', 'activity'].includes(tabParam)) {
          setDealInnerTab(requestIdFromUrl, tabParam);
        }
      } else if (!selectedDeal) {
        setSelectedDeal(requests[0].id);
      }
    }
  }, [requests, selectedDeal, searchParams]);

  // Mark all user notifications as read when visiting My Deals page
  useEffect(() => {
    markAllNotificationsAsRead.mutate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark request-specific notifications as read when a deal is selected
  useEffect(() => {
    if (selectedDeal) {
      markRequestNotificationsAsRead.mutate(selectedDeal);
    }
  }, [selectedDeal]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRequest = requests.find((r) => r.id === selectedDeal);

  /* ── Error state ── */
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

  /* ── Loading state — skeleton placeholder matching the final layout ── */
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

  /* ── Empty state — no deals yet ── */
  if (!requests || requests.length === 0) {
    return (
      <div className="w-full bg-[#FCF9F0] min-h-screen">
        <div className="px-4 sm:px-8 pt-8 pb-6 max-w-[1200px] mx-auto">
          <h1 className="text-[28px] font-semibold text-[#0E101A] tracking-tight">My Deals</h1>
          <p className="text-sm text-[#0E101A]/50 mt-1">
            Track your active opportunities and required actions across your pipeline
          </p>
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
              You haven't submitted any connection requests yet. Browse the marketplace to find
              opportunities.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Main render ── */
  return (
    <div className="w-full bg-[#FCF9F0] min-h-screen">
      {/* ─── Page Header ─── */}
      <div className="px-4 sm:px-8 pt-8 pb-5 max-w-[1200px] mx-auto">
        <h1 className="text-[28px] font-semibold text-[#0E101A] tracking-tight">My Deals</h1>
        <p className="text-sm text-[#0E101A]/50 mt-1">
          Track your active opportunities and required actions across your pipeline
        </p>
      </div>

      <div className="px-4 sm:px-8 pb-8 max-w-[1200px] mx-auto space-y-7">
        {/* ─── Action Hub (aggregated pending actions across all deals) ─── */}
        <ActionHub
          requests={requests}
          unreadByRequest={unreadByRequest}
          unreadMsgCounts={unreadMsgCounts}
          onSelectDeal={handleSelectDeal}
        />

        {/* ─── What's New — compact summary of recent activity ─── */}
        <WhatsNewSection requests={requests} unreadMsgCounts={unreadMsgCounts} />

        {/* ─── Main Grid: Deal Cards (left) + Detail Panel (right) ─── */}
        <div
          className={cn(
            'grid gap-5',
            isMobile ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[340px_1fr]',
          )}
        >
          {/* ─── Left Column: Deal Cards ─── */}
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
              <Select
                value={sortBy}
                onValueChange={(v) => setSortBy(v as 'recent' | 'action' | 'status')}
              >
                <SelectTrigger className="h-7 w-[140px] text-[11px] border-slate-200 bg-white">
                  <ArrowUpDown className="h-3 w-3 mr-1 text-slate-400 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent" className="text-[12px]">
                    Most Recent
                  </SelectItem>
                  <SelectItem value="action" className="text-[12px]">
                    Action Required
                  </SelectItem>
                  <SelectItem value="status" className="text-[12px]">
                    Status
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2.5">
              {sortedRequests.map((request) => {
                const unreadForRequest =
                  (unreadByRequest[request.id] || 0) +
                  (unreadMsgCounts?.byRequest[request.id] || 0);

                // Show "Under Review" badge on pending deals
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

          {/* ─── Right Column: Deal Detail Panel ─── */}
          {selectedRequest && (
            <div className="min-w-0">
              <DetailPanel
                request={selectedRequest}
                innerTab={getInnerTab(selectedRequest.id)}
                onInnerTabChange={(tab) => setDealInnerTab(selectedRequest.id, tab)}
                unreadMsgCounts={unreadMsgCounts}
                unreadDocsByDeal={unreadDocsByDeal}
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
   What's New Section — compact activity summary between Action Hub and grid
   ═══════════════════════════════════════════════════════════════════════ */

interface WhatsNewSectionProps {
  requests: import('@/types').ConnectionRequest[];
  unreadMsgCounts?: { byRequest: Record<string, number>; total: number };
}

function WhatsNewSection({ requests, unreadMsgCounts }: WhatsNewSectionProps) {
  const totalUnreadMessages = unreadMsgCounts?.total || 0;

  // Count deals with "pending" status as deals with recent status updates
  const pendingDeals = requests.filter((r) => r.status === 'pending').length;

  // Count deals updated in the last 7 days (excluding pending, which we already counted)
  const recentlyUpdated = requests.filter((r) => {
    if (r.status === 'pending') return false;
    const updated = new Date(r.updated_at || r.created_at);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return updated >= sevenDaysAgo;
  }).length;

  const statusUpdates = recentlyUpdated;

  // Hide the section entirely if there's nothing to report
  if (totalUnreadMessages === 0 && pendingDeals === 0 && statusUpdates === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2.5 flex-wrap px-1">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-500">
        <Sparkles className="h-3.5 w-3.5 text-[#DEC76B]" />
        What's New
      </div>
      {pendingDeals > 0 && (
        <Badge
          variant="secondary"
          className="bg-[#FBF7EC] text-[#8B6F47] border-[#E5DDD0] text-[11px] font-medium gap-1 px-2 py-0.5"
        >
          <Bell className="h-3 w-3" />
          {pendingDeals} new matched {pendingDeals === 1 ? 'deal' : 'deals'} awaiting review
        </Badge>
      )}
      {statusUpdates > 0 && (
        <Badge
          variant="secondary"
          className="bg-[#FCF9F0] text-[#0E101A]/70 border-[#E5DDD0] text-[11px] font-medium gap-1 px-2 py-0.5"
        >
          <Activity className="h-3 w-3" />
          {statusUpdates} status {statusUpdates === 1 ? 'update' : 'updates'} on your deals
        </Badge>
      )}
      {totalUnreadMessages > 0 && (
        <Badge
          variant="secondary"
          className="bg-[#FBF7EC] text-[#8B6F47] border-[#DEC76B] text-[11px] font-medium gap-1 px-2 py-0.5"
        >
          <Mail className="h-3 w-3" />
          {totalUnreadMessages} unread {totalUnreadMessages === 1 ? 'message' : 'messages'}
        </Badge>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Detail Panel — Right-hand side when a deal card is selected
   ═══════════════════════════════════════════════════════════════════════

   Structure:
   1. DealDetailHeader  — navy header with company info + pipeline progress
   2. Tab bar           — Overview | Messages | Documents | Activity Log
   3. Tab content       — rendered below the tab bar

   The Overview tab combines:
   - DealNextSteps (new: per-deal action checklist)
   - DealMetricsCard (existing: financial stats)
   - DealProcessSteps (existing: request lifecycle + review panel +
     while-you-wait checklist + post-rejection panel)
   - DealDetailsCard (existing: about + submission date)
   ═══════════════════════════════════════════════════════════════════════ */

interface DetailPanelProps {
  request: import('@/types').ConnectionRequest;
  innerTab: string;
  onInnerTabChange: (tab: string) => void;
  unreadMsgCounts?: { byRequest: Record<string, number> };
  unreadDocsByDeal: Record<string, number>;
  updateMessage: {
    mutateAsync: (args: { requestId: string; message: string }) => Promise<unknown>;
  };
  profileForCalc: User | null;
  /** Whether the buyer's firm has signed the NDA */
  ndaSigned: boolean;
  /** Whether the buyer's firm has fee agreement coverage */
  feeCovered: boolean;
  /** The fee agreement's current status (e.g. 'sent', 'signed') */
  feeStatus?: string;
}

function DetailPanel({
  request,
  innerTab,
  onInnerTabChange,
  unreadMsgCounts,
  unreadDocsByDeal,
  updateMessage,
  profileForCalc,
  ndaSigned,
  feeCovered,
  feeStatus,
}: DetailPanelProps) {
  const requestStatus = request.status as 'pending' | 'approved' | 'rejected' | 'on_hold';
  const msgUnread = unreadMsgCounts?.byRequest[request.id] || 0;
  const docUnread = unreadDocsByDeal[request.listing_id] || 0;

  return (
    <div className="bg-white rounded-xl border border-[#E5DDD0] shadow-[0_4px_16px_rgba(14,16,26,0.06)] overflow-hidden">
      {/* ─── Navy Header with company info + pipeline progress ─── */}
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

      {/* ─── Tab Navigation ──
           Uses the same tab IDs as before (overview, documents, messages,
           activity) to preserve URL deep-linking compatibility. */}
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
              value="documents"
              className={cn(
                'px-4 py-3 text-[13px] font-medium rounded-none border-b-2 transition-colors flex items-center gap-1.5',
                innerTab === 'documents'
                  ? 'border-[#0E101A] text-[#0E101A] font-semibold'
                  : 'border-transparent text-[#0E101A]/40 hover:text-[#0E101A]',
              )}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Documents
              {docUnread > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                  {docUnread > 99 ? '99+' : docUnread}
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
          {/* ─── Overview Tab ───
               Layers four information sections:
               1. Next Steps — what the buyer needs to do right now
               2. Metrics — financial snapshot
               3. Process — request lifecycle + inline review/wait/rejection panels
               4. Details — about the opportunity + submission timestamp */}
          <TabsContent value="overview" className="mt-0 space-y-6">
            {/* Per-deal action checklist */}
            <DealNextSteps
              requestCreatedAt={request.created_at}
              ndaSigned={ndaSigned}
              feeCovered={feeCovered}
              feeStatus={feeStatus}
              requestStatus={requestStatus as 'pending' | 'approved' | 'rejected'}
              onNavigateToDocuments={() => onInnerTabChange('documents')}
            />

            {/* Financial metrics card */}
            <DealMetricsCard
              listing={{
                id: request.listing_id,
                title: request.listing?.title || 'Untitled',
                category: request.listing?.category,
                location: request.listing?.location,
                image_url: request.listing?.image_url,
                revenue: request.listing?.revenue,
                ebitda: request.listing?.ebitda,
                full_time_employees: request.listing?.full_time_employees,
                part_time_employees: request.listing?.part_time_employees,
                acquisition_type: request.listing?.acquisition_type,
              }}
              status={request.status}
            />

            {/* Request lifecycle progress + inline panels
                (DealReviewPanel, WhileYouWaitChecklist, PostRejectionPanel) */}
            <DealProcessSteps
              requestStatus={request.status as 'pending' | 'approved' | 'rejected'}
              requestId={request.id}
              userMessage={request.user_message}
              onMessageUpdate={async (newMessage) => {
                await updateMessage.mutateAsync({
                  requestId: request.id,
                  message: newMessage,
                });
              }}
              isProfileComplete={getProfileCompletionDetails(profileForCalc).isComplete}
              profileCompletionPercentage={getProfileCompletionDetails(profileForCalc).percentage}
              listingCategory={request.listing?.category}
              listingLocation={request.listing?.location}
              requestCreatedAt={request.created_at}
            />

            {/* About the opportunity + submission date */}
            <DealDetailsCard
              listing={{
                category: request.listing?.category,
                location: request.listing?.location,
                description: request.listing?.description,
              }}
              createdAt={request.created_at}
            />
          </TabsContent>

          {/* ─── Messages Tab — Human-only conversation thread ─── */}
          <TabsContent value="messages" className="mt-0">
            <DealMessagesTab requestId={request.id} requestStatus={requestStatus} />
          </TabsContent>

          {/* ─── Documents Tab — Agreements + data room ─── */}
          <TabsContent value="documents" className="mt-0">
            <DealDocumentsTab
              requestId={request.id}
              requestStatus={requestStatus}
              dealId={request.listing_id}
            />
          </TabsContent>

          {/* ─── Activity Log Tab — System notifications timeline ─── */}
          <TabsContent value="activity" className="mt-0">
            <DealActivityLog requestId={request.id} requestStatus={requestStatus} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default MyRequests;
