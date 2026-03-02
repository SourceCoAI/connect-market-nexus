import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAgreementStatusSync } from '@/hooks/use-agreement-status-sync';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Shield,
  FileSignature,
  Check,
  Clock,
  Send,
  Eye,
  AlertCircle,
  ExternalLink,
  Building2,
  ChevronRight,
  Ban,
  FileText,
  MessageSquare,
  UserPlus,
  CheckCircle2,
  XCircle,
  Mail,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { resolveAgreementStatus, type AgreementDisplayStatus } from '@/lib/agreement-status';
import { formatDistanceToNow, format } from 'date-fns';
import type { UserActivityEvent } from './types';

interface ThreadContextPanelProps {
  userId: string | null;
  buyerName: string;
  buyerEmail: string | null;
  buyerCompany: string | null;
}

const STATUS_CONFIG: Record<AgreementDisplayStatus, {
  label: string;
  className: string;
  icon: typeof Check;
}> = {
  signed: { label: 'Signed', className: 'border-emerald-500/20 bg-emerald-50 text-emerald-700', icon: Check },
  declined: { label: 'Declined', className: 'border-red-500/20 bg-red-50 text-red-700', icon: AlertCircle },
  expired: { label: 'Expired', className: 'border-red-500/20 bg-red-50 text-red-700', icon: Ban },
  viewed: { label: 'Viewed', className: 'border-amber-500/20 bg-amber-50 text-amber-700', icon: Eye },
  sent: { label: 'Sent', className: 'border-blue-500/20 bg-blue-50 text-blue-700', icon: Send },
  pending: { label: 'Pending', className: 'border-blue-500/20 bg-blue-50 text-blue-700', icon: Clock },
  not_sent: { label: 'Not Sent', className: 'border-border/40 bg-muted/30 text-muted-foreground', icon: Clock },
  no_firm: { label: 'No Firm', className: 'border-border/40 bg-muted/30 text-muted-foreground', icon: Clock },
};

// ─── Data hooks ───

function useThreadBuyerFirm(userId: string | null) {
  return useQuery({
    queryKey: ['thread-buyer-firm', userId],
    queryFn: async () => {
      if (!userId) return null;

      // Use canonical resolver to get firm_id
      const { data: rpcData, error: rpcErr } = await supabase.rpc('resolve_user_firm_id', {
        p_user_id: userId,
      });

      const firmId = rpcErr ? null : rpcData;
      if (!firmId) return null;

      const { data: firm } = await supabase
        .from('firm_agreements')
        .select(
          'id, primary_company_name, nda_signed, nda_signed_at, nda_docuseal_status, nda_signed_document_url, nda_document_url, fee_agreement_signed, fee_agreement_signed_at, fee_docuseal_status, fee_signed_document_url, fee_agreement_document_url',
        )
        .eq('id', firmId)
        .maybeSingle();

      return firm;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

function useUserAllThreads(userId: string | null) {
  return useQuery({
    queryKey: ['user-all-threads', userId],
    queryFn: async () => {
      if (!userId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('connection_requests')
        .select(`
          id, status, listing_id, user_message, created_at,
          last_message_at, last_message_preview, last_message_sender_role, conversation_state,
          listing:listings!connection_requests_listing_id_fkey(title)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return [];
      return (data || []) as Array<Record<string, unknown>>;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

function useUserActivityTimeline(userId: string | null) {
  return useQuery<UserActivityEvent[]>({
    queryKey: ['user-activity-timeline', userId],
    queryFn: async () => {
      if (!userId) return [];
      const events: UserActivityEvent[] = [];

      // 1. Profile/signup info
      const { data: profile } = await supabase
        .from('profiles')
        .select('created_at, first_name, last_name, approval_status')
        .eq('id', userId)
        .maybeSingle();

      if (profile) {
        events.push({
          id: `signup-${userId}`,
          type: 'signup',
          title: 'Account Created',
          description: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() + ' signed up',
          timestamp: profile.created_at,
        });
      }

      // 2. Connection requests
      const { data: requests } = await supabase
        .from('connection_requests')
        .select('id, status, created_at, approved_at, rejected_at, listing_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      (requests || []).forEach((r) => {
        events.push({
          id: `req-${r.id}`,
          type: 'connection_request',
          title: 'Connection Request',
          description: `Status: ${r.status}`,
          timestamp: r.created_at,
        });
        if (r.approved_at) {
          events.push({
            id: `req-approved-${r.id}`,
            type: 'approval',
            title: 'Request Approved',
            timestamp: r.approved_at,
          });
        }
        if (r.rejected_at) {
          events.push({
            id: `req-rejected-${r.id}`,
            type: 'rejection',
            title: 'Request Rejected',
            timestamp: r.rejected_at,
          });
        }
      });

      // 3. Messages (last 20)
      const requestIds = (requests || []).map(r => r.id);
      if (requestIds.length > 0) {
        const { data: messages } = await supabase
          .from('connection_messages')
          .select('id, body, sender_role, created_at')
          .in('connection_request_id', requestIds)
          .order('created_at', { ascending: false })
          .limit(20);

        (messages || []).forEach((m) => {
          events.push({
            id: `msg-${m.id}`,
            type: m.sender_role === 'buyer' ? 'message_sent' : 'message_received',
            title: m.sender_role === 'buyer' ? 'Buyer Message' : 'Admin Reply',
            description: (m.body as string)?.substring(0, 80) + ((m.body as string)?.length > 80 ? '...' : ''),
            timestamp: m.created_at,
          });
        });
      }

      // 4. Agreement audit log — use canonical resolver
      const { data: resolvedFirmId } = await supabase.rpc('resolve_user_firm_id', {
        p_user_id: userId,
      });
      const membership = resolvedFirmId ? { firm_id: resolvedFirmId } : null;

      if (membership?.firm_id) {
        const { data: auditLogs } = await supabase
          .from('agreement_audit_log')
          .select('id, agreement_type, old_status, new_status, created_at, notes')
          .eq('firm_id', membership.firm_id)
          .order('created_at', { ascending: false })
          .limit(20);

        (auditLogs || []).forEach((log) => {
          const isNda = log.agreement_type === 'nda';
          const label = isNda ? 'NDA' : 'Fee Agreement';
          events.push({
            id: `audit-${log.id}`,
            type: log.new_status === 'signed' ? (isNda ? 'nda_signed' : 'fee_signed') : (isNda ? 'nda_sent' : 'fee_sent'),
            title: `${label}: ${log.new_status}`,
            description: log.notes || `${log.old_status || 'n/a'} → ${log.new_status}`,
            timestamp: log.created_at || '',
          });
        });
      }

      return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

// ─── Sub-components ───

function StatusBadge({ status }: { status: AgreementDisplayStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`h-5 px-2 font-medium text-[11px] ${config.className}`}>
      <Icon className="h-2.5 w-2.5 mr-1" />
      {config.label}
    </Badge>
  );
}

const TIMELINE_ICONS: Record<string, { icon: typeof Check; color: string }> = {
  signup: { icon: UserPlus, color: '#6366F1' },
  connection_request: { icon: FileText, color: '#DEC76B' },
  message_sent: { icon: MessageSquare, color: '#3B82F6' },
  message_received: { icon: Mail, color: '#0E101A' },
  nda_sent: { icon: Shield, color: '#3B82F6' },
  nda_signed: { icon: Shield, color: '#16A34A' },
  fee_sent: { icon: FileSignature, color: '#3B82F6' },
  fee_signed: { icon: FileSignature, color: '#16A34A' },
  approval: { icon: CheckCircle2, color: '#16A34A' },
  rejection: { icon: XCircle, color: '#DC2626' },
  status_change: { icon: Clock, color: '#F59E0B' },
};

// ─── Main component ───

export function ThreadContextPanel({ userId, buyerName, buyerEmail, buyerCompany }: ThreadContextPanelProps) {
  useAgreementStatusSync();
  const { data: firm, isLoading: firmLoading } = useThreadBuyerFirm(userId);
  const { data: allThreads = [], isLoading: threadsLoading } = useUserAllThreads(userId);
  const { data: timeline = [], isLoading: timelineLoading } = useUserActivityTimeline(userId);
  const navigate = useNavigate();

  const ndaStatus = firm ? resolveAgreementStatus(!!firm.nda_signed, firm.nda_docuseal_status) : null;
  const feeStatus = firm ? resolveAgreementStatus(!!firm.fee_agreement_signed, firm.fee_docuseal_status) : null;

  return (
    <div className="w-[280px] flex-shrink-0 flex flex-col min-h-0" style={{ borderLeft: '1px solid #E5DDD0', backgroundColor: '#FCF9F0' }}>
      <ScrollArea className="flex-1">
        {/* Header */}
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #E5DDD0' }}>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#9A9A9A' }}>Buyer Profile</p>
        </div>

        <div className="px-4 py-3 space-y-5">
          {/* Buyer info */}
          <div>
            <p className="text-sm font-semibold" style={{ color: '#0E101A' }}>{buyerName}</p>
            {buyerCompany && (
              <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: '#5A5A5A' }}>
                <Building2 className="h-3 w-3" />{buyerCompany}
              </p>
            )}
            {buyerEmail && (
              <p className="text-[11px] mt-0.5 truncate" style={{ color: '#5A5A5A' }}>{buyerEmail}</p>
            )}
          </div>

          {/* ── Agreements Section ── */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#9A9A9A' }}>Agreements</p>
            {firmLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !firm ? (
              <div className="rounded-lg p-2.5" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
                <p className="text-[11px] font-medium" style={{ color: '#991B1B' }}>No firm linked</p>
                <p className="text-[10px] mt-0.5" style={{ color: '#B91C1C' }}>
                  Buyer has no firm record.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] font-medium" style={{ color: '#0E101A' }}>{firm.primary_company_name}</p>

                {/* NDA row */}
                <div className="rounded-lg p-2.5" style={{ border: '1px solid #E5DDD0', backgroundColor: '#FFFFFF' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" style={{ color: '#5A5A5A' }} />
                      <span className="text-[11px] font-semibold" style={{ color: '#0E101A' }}>NDA</span>
                    </div>
                    {ndaStatus && <StatusBadge status={ndaStatus} />}
                  </div>
                  {firm.nda_signed_at && (
                    <p className="text-[10px] mt-1" style={{ color: '#9A9A9A' }}>
                      Signed {format(new Date(firm.nda_signed_at), 'MMM d, yyyy')}
                    </p>
                  )}
                  {ndaStatus === 'signed' && firm.nda_signed_document_url && (
                    <a href={firm.nda_signed_document_url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] underline flex items-center gap-1 mt-1" style={{ color: '#5A5A5A' }}>
                      Download signed NDA <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                  {ndaStatus !== 'signed' && firm.nda_document_url && (
                    <a href={firm.nda_document_url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] underline flex items-center gap-1 mt-1" style={{ color: '#5A5A5A' }}>
                      View draft <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>

                {/* Fee Agreement row */}
                <div className="rounded-lg p-2.5" style={{ border: '1px solid #E5DDD0', backgroundColor: '#FFFFFF' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <FileSignature className="h-3.5 w-3.5" style={{ color: '#5A5A5A' }} />
                      <span className="text-[11px] font-semibold" style={{ color: '#0E101A' }}>Fee Agreement</span>
                    </div>
                    {feeStatus && <StatusBadge status={feeStatus} />}
                  </div>
                  {firm.fee_agreement_signed_at && (
                    <p className="text-[10px] mt-1" style={{ color: '#9A9A9A' }}>
                      Signed {format(new Date(firm.fee_agreement_signed_at), 'MMM d, yyyy')}
                    </p>
                  )}
                  {feeStatus === 'signed' && firm.fee_signed_document_url && (
                    <a href={firm.fee_signed_document_url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] underline flex items-center gap-1 mt-1" style={{ color: '#5A5A5A' }}>
                      Download signed Fee Agmt <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                  {feeStatus !== 'signed' && firm.fee_agreement_document_url && (
                    <a href={firm.fee_agreement_document_url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] underline flex items-center gap-1 mt-1" style={{ color: '#5A5A5A' }}>
                      View draft <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── All Threads Section ── */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#9A9A9A' }}>
              All Threads ({allThreads.length})
            </p>
            {threadsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : allThreads.length === 0 ? (
              <p className="text-[10px]" style={{ color: '#9A9A9A' }}>No threads found</p>
            ) : (
              <div className="space-y-1.5">
                {allThreads.map((t) => {
                  const listing = t.listing as Record<string, unknown> | null;
                  return (
                    <div key={t.id as string}
                      className="rounded-lg p-2 cursor-pointer hover:bg-accent/30 transition-colors"
                      style={{ border: '1px solid #E5DDD0', backgroundColor: '#FFFFFF' }}
                    >
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3 w-3 flex-shrink-0" style={{ color: '#DEC76B' }} />
                        <p className="text-[11px] font-medium truncate" style={{ color: '#0E101A' }}>
                          {(listing?.title as string) || 'Untitled'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[9px] px-1 py-0 rounded font-medium"
                          style={
                            t.status === 'approved' ? { backgroundColor: '#DEC76B', color: '#0E101A' } :
                            t.status === 'rejected' ? { backgroundColor: '#8B0000', color: '#FFFFFF' } :
                            t.status === 'pending' ? { backgroundColor: '#F7F4DD', color: '#5A5A5A' } :
                            { backgroundColor: '#E8E8E8', color: '#5A5A5A' }
                          }>
                          {t.status as string}
                        </span>
                        <span className="text-[9px]" style={{ color: '#9A9A9A' }}>
                          {formatDistanceToNow(new Date(t.created_at as string), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Activity Timeline ── */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#9A9A9A' }}>
              Activity Timeline
            </p>
            {timelineLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : timeline.length === 0 ? (
              <p className="text-[10px]" style={{ color: '#9A9A9A' }}>No activity recorded</p>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px" style={{ backgroundColor: '#E5DDD0' }} />
                <div className="space-y-2.5">
                  {timeline.slice(0, 30).map((event) => {
                    const iconConfig = TIMELINE_ICONS[event.type] || TIMELINE_ICONS.status_change;
                    const Icon = iconConfig.icon;
                    return (
                      <div key={event.id} className="flex items-start gap-2.5 relative">
                        <div className="flex-shrink-0 z-10 w-[15px] h-[15px] rounded-full flex items-center justify-center"
                          style={{ backgroundColor: '#FCF9F0', border: `1.5px solid ${iconConfig.color}` }}>
                          <Icon className="w-2 h-2" style={{ color: iconConfig.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium leading-tight" style={{ color: '#0E101A' }}>
                            {event.title}
                          </p>
                          {event.description && (
                            <p className="text-[10px] truncate leading-tight mt-0.5" style={{ color: '#5A5A5A' }}>
                              {event.description}
                            </p>
                          )}
                          <p className="text-[9px] mt-0.5" style={{ color: '#9A9A9A' }}>
                            {format(new Date(event.timestamp), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Link to buyer page */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-[11px] justify-between"
            onClick={() => navigate(`/admin/marketplace/users`)}
          >
            View in All Buyers
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}