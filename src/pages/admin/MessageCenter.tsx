import { useState, useMemo, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Inbox,
  Search,
  Filter,
  Clock,
  Circle,
  MailWarning,
  Archive,
  LayoutList,
  FolderOpen,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useAdminProfiles } from '@/hooks/admin/use-admin-profiles';
import { resolveAgreementStatus } from '@/lib/agreement-status';

import type { InboxThread, InboxFilter, ViewMode, DealGroup } from './message-center/types';
import { ThreadListItem } from './message-center/ThreadListItem';
import { ThreadView } from './message-center/ThreadView';
import { DealGroupSection } from './message-center/DealGroupSection';
import { MessageCenterSkeleton, MessageCenterEmpty } from './message-center/MessageCenterShells';

// ─── Inbox Threads Hook ───

function useInboxThreads() {
  return useQuery({
    queryKey: ['inbox-threads'],
    queryFn: async () => {
      const { data: requestsRaw, error: reqError } = await supabase
        .from('connection_requests')
        .select(
          `
          id, status, user_id, listing_id, user_message, created_at,
          conversation_state, last_message_at, last_message_preview, last_message_sender_role,
          claimed_by, firm_id,
          user:profiles!connection_requests_user_id_profiles_fkey(first_name, last_name, email, company, buyer_type),
          listing:listings!connection_requests_listing_id_fkey(title)
        `,
        )
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(200);

      if (reqError) throw reqError;
      const requests = (requestsRaw || []) as unknown as Array<
        Record<string, unknown> & {
          id: string;
          user: Record<string, unknown> | null;
          listing: Record<string, unknown> | null;
        }
      >;

      // Fetch unread counts
      const { data: unreadMessagesRaw, error: unreadError } = await (
        supabase.from('connection_messages') as unknown as ReturnType<typeof supabase.from>
      )
        .select('connection_request_id')
        .eq('is_read_by_admin', false)
        .eq('sender_role', 'buyer');

      if (unreadError) throw unreadError;
      const unreadMessages = (unreadMessagesRaw || []) as unknown as Array<{
        connection_request_id: string;
      }>;

      const unreadMap: Record<string, number> = {};
      unreadMessages.forEach((msg) => {
        unreadMap[msg.connection_request_id] = (unreadMap[msg.connection_request_id] || 0) + 1;
      });

      // Fetch pipeline deal IDs for these connection requests
      const requestIds = requests.map((r) => r.id);
      let deals: { id: string; connection_request_id: string | null }[] | null = null;
      if (requestIds.length > 0) {
        const { data } = await supabase
          .from('deal_pipeline')
          .select('id, connection_request_id')
          .in('connection_request_id', requestIds);
        deals = data as typeof deals;
      }

      const dealMap: Record<string, string> = {};
      (deals || []).forEach((d: { id: string; connection_request_id: string | null }) => {
        if (d.connection_request_id) dealMap[d.connection_request_id] = d.id;
      });

      // Fetch firm agreement statuses for all unique user IDs
      const uniqueUserIds = [...new Set(requests.map((r) => r.user_id as string).filter(Boolean))];
      const firmStatusMap: Record<
        string,
        { nda_status: string | null; fee_status: string | null; firm_name: string | null }
      > = {};

      if (uniqueUserIds.length > 0) {
        // Use canonical firm resolver — batch resolve via firm_members only (no connection_requests.firm_id)
        const { data: memberships } = await supabase
          .from('firm_members')
          .select('user_id, firm_id')
          .in('user_id', uniqueUserIds);

        const userFirmMap: Record<string, string> = {};
        (memberships || []).forEach((m: { user_id: string | null; firm_id: string }) => {
          if (m.user_id) userFirmMap[m.user_id] = m.firm_id;
        });

        // NOTE: We no longer fall back to connection_requests.firm_id here.
        // The firm_members table is the canonical source of user→firm associations.

        const firmIds = [...new Set(Object.values(userFirmMap).filter(Boolean))];
        if (firmIds.length > 0) {
          const { data: firms } = await supabase
            .from('firm_agreements')
            .select(
              'id, primary_company_name, nda_signed, nda_status, fee_agreement_signed, fee_agreement_status',
            )
            .in('id', firmIds);

          const firmDataMap: Record<string, Record<string, unknown>> = {};
          (firms || []).forEach((f) => {
            firmDataMap[(f as Record<string, unknown>).id as string] = f as unknown as Record<
              string,
              unknown
            >;
          });

          // Map user IDs to their firm status
          Object.entries(userFirmMap).forEach(([userId, firmId]) => {
            const firm = firmDataMap[firmId];
            if (firm) {
              firmStatusMap[userId] = {
                nda_status: resolveAgreementStatus(
                  firm.nda_status as string | null,
                  null,
                ),
                fee_status: resolveAgreementStatus(
                  firm.fee_agreement_status as string | null,
                  null,
                ),
                firm_name: (firm.primary_company_name as string) || null,
              };
            }
          });
        }
      }

      const threads: InboxThread[] = requests.map((req) => {
        const user = req.user;
        const userId = req.user_id as string;
        const firmInfo = firmStatusMap[userId] || {
          nda_status: null,
          fee_status: null,
          firm_name: null,
        };
        return {
          connection_request_id: req.id,
          user_id: userId || null,
          buyer_name: user
            ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown'
            : 'Unknown',
          buyer_company: (user?.company as string) || null,
          buyer_email: (user?.email as string) || null,
          buyer_type: (user?.buyer_type as string) || null,
          deal_title: (req.listing?.title as string) || null,
          listing_id: req.listing_id as string,
          request_status: (req.status as string) || 'pending',
          conversation_state: (req.conversation_state as string) || 'new',
          last_message_at: req.last_message_at as string,
          last_message_preview: req.last_message_preview as string,
          last_message_sender_role: req.last_message_sender_role as string,
          claimed_by: req.claimed_by as string,
          unread_count: unreadMap[req.id] || 0,
          total_messages: 0,
          user_message: req.user_message as string,
          created_at: req.created_at as string,
          pipeline_deal_id: dealMap[req.id] || null,
          nda_status: firmInfo.nda_status,
          fee_status: firmInfo.fee_status,
          firm_name: firmInfo.firm_name,
        };
      });

      return threads.sort((a, b) => {
        if (a.unread_count > 0 && b.unread_count === 0) return -1;
        if (a.unread_count === 0 && b.unread_count > 0) return 1;
        const aTime = a.last_message_at || a.created_at;
        const bTime = b.last_message_at || b.created_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
    },
    staleTime: 15000,
  });
}

// ─── Main Component ───

export default function MessageCenter() {
  const queryClient = useQueryClient();
  const { data: threads = [], isLoading } = useInboxThreads();
  const { data: adminProfiles } = useAdminProfiles();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<InboxFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  // Realtime subscription for new messages
  useEffect(() => {
    const channel = supabase
      .channel('admin-inbox-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'connection_messages' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['inbox-threads'] });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'connection_requests' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['inbox-threads'] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const selectedThread = threads.find((t) => t.connection_request_id === selectedThreadId);

  // Filter threads
  const filteredThreads = useMemo(() => {
    let filtered = threads;
    switch (activeFilter) {
      case 'unread':
        filtered = filtered.filter((t) => t.unread_count > 0);
        break;
      case 'waiting_on_admin':
        filtered = filtered.filter(
          (t) => t.conversation_state === 'waiting_on_admin' || t.unread_count > 0,
        );
        break;
      case 'waiting_on_buyer':
        filtered = filtered.filter((t) => t.conversation_state === 'waiting_on_buyer');
        break;
      case 'claimed':
        filtered = filtered.filter((t) => t.conversation_state === 'claimed');
        break;
      case 'closed':
        filtered = filtered.filter((t) => t.conversation_state === 'closed');
        break;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.buyer_name.toLowerCase().includes(q) ||
          (t.deal_title || '').toLowerCase().includes(q) ||
          (t.buyer_company || '').toLowerCase().includes(q) ||
          (t.buyer_email || '').toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [threads, activeFilter, searchQuery]);

  // Group by deal
  const dealGroups = useMemo((): DealGroup[] => {
    const groupMap = new Map<string, DealGroup>();
    filteredThreads.forEach((t) => {
      const key = t.listing_id || `no-deal-${t.connection_request_id}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          listing_id: t.listing_id || key,
          deal_title: t.deal_title || 'No Deal Linked',
          threads: [],
          total_unread: 0,
          last_activity: t.last_message_at || t.created_at,
        });
      }
      const group = groupMap.get(key)!;
      group.threads.push(t);
      group.total_unread += t.unread_count;
      const tTime = t.last_message_at || t.created_at;
      if (new Date(tTime) > new Date(group.last_activity)) {
        group.last_activity = tTime;
      }
    });
    return Array.from(groupMap.values()).sort((a, b) => {
      if (a.total_unread > 0 && b.total_unread === 0) return -1;
      if (a.total_unread === 0 && b.total_unread > 0) return 1;
      return new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime();
    });
  }, [filteredThreads]);

  // Counts
  const counts = useMemo(
    () => ({
      all: threads.length,
      unread: threads.filter((t) => t.unread_count > 0).length,
      waiting_on_admin: threads.filter(
        (t) => t.conversation_state === 'waiting_on_admin' || t.unread_count > 0,
      ).length,
      waiting_on_buyer: threads.filter((t) => t.conversation_state === 'waiting_on_buyer').length,
      claimed: threads.filter((t) => t.conversation_state === 'claimed').length,
      closed: threads.filter((t) => t.conversation_state === 'closed').length,
    }),
    [threads],
  );

  const filters: { key: InboxFilter; label: string; icon: React.ReactNode }[] = [
    { key: 'all', label: 'All', icon: <Inbox className="w-3.5 h-3.5" /> },
    { key: 'unread', label: 'Unread', icon: <Circle className="w-3.5 h-3.5" /> },
    {
      key: 'waiting_on_admin',
      label: 'Needs Reply',
      icon: <MailWarning className="w-3.5 h-3.5" />,
    },
    { key: 'waiting_on_buyer', label: 'Waiting', icon: <Clock className="w-3.5 h-3.5" /> },
    { key: 'closed', label: 'Closed', icon: <Archive className="w-3.5 h-3.5" /> },
  ];

  return (
    <div
      className="h-[calc(100vh-80px)] flex flex-col"
      style={{ fontFamily: 'Montserrat, Inter, sans-serif' }}
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: '#0E101A' }}>
            Inbox{counts.unread > 0 ? ` (${counts.unread})` : ''}
          </h1>

          {/* View mode toggle */}
          <div
            className="flex items-center gap-1 rounded-lg p-0.5"
            style={{ border: '1px solid #F0EDE6', backgroundColor: '#FFFFFF' }}
          >
            <button
              onClick={() => setViewMode('all')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                viewMode === 'all' ? 'shadow-sm' : 'hover:opacity-80',
              )}
              style={
                viewMode === 'all'
                  ? { backgroundColor: '#FAFAF8', color: '#0E101A' }
                  : { color: '#9A9A9A' }
              }
            >
              <LayoutList className="w-3.5 h-3.5" />
              All
            </button>
            <button
              onClick={() => setViewMode('by_deal')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                viewMode === 'by_deal' ? 'shadow-sm' : 'hover:opacity-80',
              )}
              style={
                viewMode === 'by_deal'
                  ? { backgroundColor: '#FAFAF8', color: '#0E101A' }
                  : { color: '#9A9A9A' }
              }
            >
              <FolderOpen className="w-3.5 h-3.5" />
              By Deal
            </button>
          </div>
        </div>

        {/* Filter tabs — underline style */}
        <div
          className="flex items-center gap-4 mt-4 overflow-x-auto"
          style={{ borderBottom: '1px solid #F0EDE6' }}
        >
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className="inline-flex items-center gap-1.5 px-1 pb-2 text-xs transition-colors whitespace-nowrap -mb-px"
              style={
                activeFilter === f.key
                  ? { color: '#0E101A', fontWeight: 600, borderBottom: '2px solid #DEC76B' }
                  : { color: '#9A9A9A', fontWeight: 500, borderBottom: '2px solid transparent' }
              }
            >
              {f.label}
              {counts[f.key] > 0 && (
                <span
                  className="ml-0.5 px-1.5 py-0 rounded-full text-[10px] font-semibold min-w-[18px] text-center"
                  style={
                    f.key === 'unread' || f.key === 'waiting_on_admin'
                      ? { backgroundColor: '#DEC76B', color: '#0E101A' }
                      : { backgroundColor: '#F0EDE6', color: '#9A9A9A' }
                  }
                >
                  {counts[f.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      {isLoading ? (
        <div className="flex-1 px-6 pb-6">
          <MessageCenterSkeleton />
        </div>
      ) : threads.length === 0 ? (
        <div className="flex-1 px-6 pb-6">
          <MessageCenterEmpty />
        </div>
      ) : (
        <div
          className="flex-1 min-h-0 mx-6 mb-6 rounded-xl overflow-hidden flex"
          style={{ border: '1px solid #F0EDE6', backgroundColor: '#FFFFFF' }}
        >
          {/* Thread List (left panel) */}
          <div
            className={cn(
              'w-[380px] flex-shrink-0 flex flex-col min-h-0',
              selectedThreadId ? 'hidden md:flex' : 'flex',
            )}
            style={{ borderRight: '1px solid #F0EDE6' }}
          >
            {/* Search */}
            <div className="p-3 flex-shrink-0" style={{ borderBottom: '1px solid #F0EDE6' }}>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
                  style={{ color: '#CBCBCB' }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by buyer, company, or deal..."
                  className="w-full text-xs rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-1"
                  style={{
                    border: '1px solid #F0EDE6',
                    backgroundColor: '#FFFFFF',
                    color: '#0E101A',
                  }}
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              {viewMode === 'all' ? (
                <div>
                  {filteredThreads.map((thread) => (
                    <ThreadListItem
                      key={thread.connection_request_id}
                      thread={thread}
                      isSelected={selectedThreadId === thread.connection_request_id}
                      onClick={() => setSelectedThreadId(thread.connection_request_id)}
                      adminProfiles={adminProfiles}
                    />
                  ))}
                  {filteredThreads.length === 0 && (
                    <div className="p-8 text-center">
                      <Filter className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">
                        {searchQuery
                          ? 'No conversations match your search'
                          : 'No conversations in this filter'}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {dealGroups.map((group) => (
                    <DealGroupSection
                      key={group.listing_id}
                      group={group}
                      selectedThreadId={selectedThreadId}
                      onSelectThread={setSelectedThreadId}
                      adminProfiles={adminProfiles}
                    />
                  ))}
                  {dealGroups.length === 0 && (
                    <div className="p-8 text-center">
                      <Filter className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">No deals with conversations</p>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Thread View (right panel) */}
          <div
            className={cn(
              'flex-1 flex flex-col min-h-0',
              !selectedThreadId ? 'hidden md:flex' : 'flex',
            )}
          >
            {selectedThreadId && selectedThread ? (
              <ThreadView
                thread={selectedThread}
                onBack={() => setSelectedThreadId(null)}
                adminProfiles={adminProfiles}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Inbox className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">Select a conversation</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Choose from the list to view messages
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
