import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, untypedFrom } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import { Checkbox } from '@/components/ui/checkbox';
import { useShiftSelect } from '@/hooks/useShiftSelect';
import {
  FileSignature,
  Shield,
  Search,
  AlertCircle,
  Loader2,
  ArrowUpDown,
  Users,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  History,
  UserMinus,
  X,
} from 'lucide-react';
import { formatDistanceToNow, format, differenceInDays } from 'date-fns';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';
import { useAIUIActionHandler } from '@/hooks/useAIUIActionHandler';
import { AgreementStatusDropdown } from '@/components/admin/firm-agreements/AgreementStatusDropdown';
import type { FirmAgreement, FirmMember, AgreementStatus } from '@/hooks/admin/use-firm-agreements';
import { useRemoveFirmMember } from '@/hooks/admin/use-firm-agreements';
import { useAgreementAuditLog } from '@/hooks/admin/use-firm-agreements';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─── Types ───────────────────────────────────────────────────────────

interface DocumentRequestRecord {
  id: string;
  agreement_type: string;
  status: string;
  created_at: string;
  recipient_email: string | null;
  recipient_name: string | null;
  email_provider_message_id: string | null;
  last_email_error: string | null;
}

interface FirmRow {
  id: string;
  primary_company_name: string;
  email_domain: string | null;
  member_count: number;
  nda_status: AgreementStatus;
  nda_sent_at: string | null;
  nda_email_sent_at: string | null;
  nda_signed_at: string | null;
  nda_signed_by_name: string | null;
  nda_requested_at: string | null;
  nda_marked_by_admin: string | null;
  fee_agreement_status: AgreementStatus;
  fee_agreement_sent_at: string | null;
  fee_agreement_email_sent_at: string | null;
  fee_agreement_signed_at: string | null;
  fee_agreement_signed_by_name: string | null;
  fee_agreement_requested_at: string | null;
  fee_marked_by_admin: string | null;
  hasPendingRequest: boolean;
  contactName: string | null;
  contactEmail: string | null;
  firmAgreement: FirmAgreement;
  members: FirmMember[];
  documentRequests: DocumentRequestRecord[];
}

interface OrphanUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}

// ─── Data Hook ───────────────────────────────────────────────────────

function useAllFirmsTracking() {
  return useQuery<FirmRow[]>({
    queryKey: ['admin-document-tracking'],
    staleTime: 60_000,
    queryFn: async () => {
      // Fetch firms + members
      const { data: firms, error } = await supabase
        .from('firm_agreements')
        .select(
          `
          *,
          firm_members(
            id,
            user_id,
            is_primary_contact,
            lead_name,
            lead_email,
            member_type,
            lead_company,
            connection_request_id,
            inbound_lead_id,
            added_at,
            user:profiles(
              id, first_name, last_name, email, company_name, buyer_type
            )
          )
        `,
        )
        .order('primary_company_name');

      if (error) throw error;
      if (!firms || firms.length === 0) return [];

      // Fetch audit entries + document requests in parallel
      const [auditRes, docReqRes] = await Promise.all([
        supabase
          .from('agreement_audit_log')
          .select('firm_id, agreement_type, changed_by_name, created_at')
          .eq('new_status', 'signed')
          .order('created_at', { ascending: false }),
        untypedFrom('document_requests')
          .select('id, firm_id, agreement_type, status, created_at, recipient_email, recipient_name, email_provider_message_id, last_email_error')
          .order('created_at', { ascending: false })
          .limit(500),
      ]);

      const auditEntries = auditRes.data;
      const allDocRequests = (docReqRes.data || []) as Array<DocumentRequestRecord & { firm_id: string | null }>;

      // Build doc requests per firm
      const docRequestsByFirm = new Map<string, DocumentRequestRecord[]>();
      for (const dr of allDocRequests) {
        if (dr.firm_id) {
          const existing = docRequestsByFirm.get(dr.firm_id) || [];
          existing.push(dr);
          docRequestsByFirm.set(dr.firm_id, existing);
        }
      }

      // Build lookup: firmId -> { nda: adminName, fee_agreement: adminName }
      const adminMap = new Map<string, { nda?: string; fee_agreement?: string }>();
      if (auditEntries) {
        for (const entry of auditEntries) {
          const existing = adminMap.get(entry.firm_id) || {};
          const type = entry.agreement_type as 'nda' | 'fee_agreement';
          if (!existing[type]) {
            existing[type] = entry.changed_by_name || undefined;
            adminMap.set(entry.firm_id, existing);
          }
        }
      }

      return firms.map((firm: Record<string, unknown>) => {
        const firmMembers = (firm.firm_members || []) as Record<string, unknown>[];
        const primaryMember = firmMembers.find((m) => m.is_primary_contact);
        const anyMember = firmMembers[0];
        const member = primaryMember || anyMember;

        const memberUser = member?.user as Record<string, string | null> | undefined;
        const contactName = memberUser
          ? `${memberUser.first_name || ''} ${memberUser.last_name || ''}`.trim()
          : (member?.lead_name as string) || null;
        const contactEmail = memberUser?.email || (member?.lead_email as string) || null;

        // Build FirmMember[] for the dropdown
        const members = firmMembers.map((m) => ({
          id: m.id,
          firm_id: firm.id,
          user_id: m.user_id,
          member_type: m.member_type || 'marketplace_user',
          lead_email: m.lead_email,
          lead_name: m.lead_name,
          lead_company: m.lead_company,
          connection_request_id: m.connection_request_id,
          inbound_lead_id: m.inbound_lead_id,
          is_primary_contact: m.is_primary_contact || false,
          added_at: m.added_at,
          user: m.user || null,
        })) as FirmMember[];

        const ndaRequestedAt = (firm.nda_requested_at as string) || null;
        const feeRequestedAt = (firm.fee_agreement_requested_at as string) || null;
        const hasPendingRequest = (
          (ndaRequestedAt && (firm.nda_status as string) !== 'signed') ||
          (feeRequestedAt && (firm.fee_agreement_status as string) !== 'signed')
        );

        const adminAttribution = adminMap.get(firm.id as string);

        return {
          id: firm.id,
          primary_company_name: firm.primary_company_name,
          email_domain: firm.email_domain,
          member_count: firm.member_count || 0,
          nda_status: (firm.nda_status || 'not_started') as AgreementStatus,
          nda_sent_at: firm.nda_sent_at || firm.nda_email_sent_at,
          nda_email_sent_at: firm.nda_email_sent_at,
          nda_signed_at: firm.nda_signed_at,
          nda_signed_by_name: firm.nda_signed_by_name,
          nda_requested_at: ndaRequestedAt,
          nda_marked_by_admin: adminAttribution?.nda || null,
          fee_agreement_status: (firm.fee_agreement_status || 'not_started') as AgreementStatus,
          fee_agreement_sent_at: firm.fee_agreement_sent_at || firm.fee_agreement_email_sent_at,
          fee_agreement_email_sent_at: firm.fee_agreement_email_sent_at,
          fee_agreement_signed_at: firm.fee_agreement_signed_at,
          fee_agreement_signed_by_name: firm.fee_agreement_signed_by_name,
          fee_agreement_requested_at: feeRequestedAt,
          fee_marked_by_admin: adminAttribution?.fee_agreement || null,
          hasPendingRequest: !!hasPendingRequest,
          contactName,
          contactEmail,
          firmAgreement: firm as unknown as FirmAgreement,
          members,
          documentRequests: docRequestsByFirm.get(firm.id as string) || [],
        } as FirmRow;
      });
    },
  });
}

function useOrphanUsers() {
  return useQuery<OrphanUser[]>({
    queryKey: ['admin-orphan-users'],
    staleTime: 120_000,
    queryFn: async () => {
      // Get all approved profiles
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, company')
        .eq('approval_status', 'approved')
        .is('deleted_at', null)
        .eq('is_admin', false);

      if (pErr) throw pErr;
      if (!profiles || profiles.length === 0) return [];

      // Get all user_ids that have firm memberships
      const { data: memberships, error: mErr } = await supabase
        .from('firm_members' as never)
        .select('user_id')
        .not('user_id', 'is', null);

      if (mErr) throw mErr;

      const memberUserIds = new Set(
        (memberships || []).map((m) => (m as Record<string, unknown>).user_id as string),
      );
      return profiles.filter((p) => !memberUserIds.has(p.id)) as OrphanUser[];
    },
  });
}

// ─── Pending Request Queue Hook ──────────────────────────────────────

interface PendingRequest {
  id: string;
  user_id: string | null;
  agreement_type: string;
  status: string;
  created_at: string;
  recipient_email: string | null;
  recipient_name: string | null;
  firm_id: string | null;
  email_correlation_id: string | null;
  email_provider_message_id: string | null;
  last_email_error: string | null;
}

interface DeliveryEvent {
  email: string;
  status: string;
  correlation_id: string | null;
  error_message: string | null;
  sent_at: string | null;
}

function usePendingRequestQueue() {
  return useQuery<PendingRequest[]>({
    queryKey: ['admin-pending-request-queue'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await untypedFrom('document_requests')
        .select('id, user_id, agreement_type, status, created_at, recipient_email, recipient_name, firm_id, email_correlation_id, email_provider_message_id, last_email_error')
        .in('status', ['requested', 'email_sent'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as PendingRequest[];
    },
  });
}

/** Fetch latest delivery events — checks new outbound_emails first, falls back to legacy email_delivery_logs */
function useDeliveryEvents(providerMessageIds: string[]) {
  return useQuery<DeliveryEvent[]>({
    queryKey: ['admin-delivery-events', providerMessageIds],
    staleTime: 30_000,
    enabled: providerMessageIds.length > 0,
    queryFn: async () => {
      if (providerMessageIds.length === 0) return [];
      const normalized = providerMessageIds.map(id => id.replace(/^<|>$/g, '').trim());
      const withBrackets = normalized.map(id => `<${id}>`);
      const allVariants = [...normalized, ...withBrackets];

      // Try new outbound_emails table first
      const { data: newData } = await untypedFrom('outbound_emails')
        .select('recipient_email, status, provider_message_id, last_error, delivered_at, opened_at, failed_at')
        .in('provider_message_id', allVariants)
        .order('created_at', { ascending: false });

      if (newData && newData.length > 0) {
        return (newData as Array<Record<string, unknown>>).map(row => ({
          email: row.recipient_email as string,
          status: row.status as string,
          correlation_id: (row.provider_message_id as string)?.replace(/^<|>$/g, '').trim() || null,
          error_message: row.last_error as string | null,
          sent_at: (row.delivered_at || row.opened_at || row.failed_at) as string | null,
        }));
      }

      // Fallback to legacy
      const { data, error } = await supabase
        .from('email_delivery_logs')
        .select('email, status, correlation_id, error_message, sent_at')
        .eq('email_type', 'brevo_webhook')
        .in('correlation_id', normalized)
        .order('sent_at', { ascending: false });

      if (error) throw error;
      return (data || []) as DeliveryEvent[];
    },
  });
}


function useRealtimeFirmAgreements() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('firm-agreements-tracking')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'firm_agreements' }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin-document-tracking'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'document_requests' }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin-document-tracking'] });
        queryClient.invalidateQueries({ queryKey: ['admin-pending-doc-requests'] });
        queryClient.invalidateQueries({ queryKey: ['admin-pending-request-queue'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

// ─── Component ───────────────────────────────────────────────────────

type FilterStatus = 'all' | 'signed' | 'sent' | 'not_started' | 'unsigned' | 'needs_attention' | 'pending_requests';
type SortField = 'company' | 'nda_status' | 'fee_status' | 'members' | 'last_signed' | 'last_requested';

export default function DocumentTrackingPage() {
  const { data: firms = [], isLoading, error } = useAllFirmsTracking();
  const { data: orphanUsers = [] } = useOrphanUsers();
  const { data: pendingRequests = [] } = usePendingRequestQueue();

  // Gather provider message IDs from pending requests for delivery event lookup
  const providerMessageIds = useMemo(() =>
    pendingRequests
      .map(r => r.email_provider_message_id)
      .filter((id): id is string => !!id),
    [pendingRequests]
  );
  const { data: deliveryEvents = [] } = useDeliveryEvents(providerMessageIds);

  // Build lookup: normalized provider message id -> latest delivery event
  const deliveryMap = useMemo(() => {
    const map = new Map<string, DeliveryEvent>();
    for (const ev of deliveryEvents) {
      if (ev.correlation_id && !map.has(ev.correlation_id)) {
        map.set(ev.correlation_id, ev);
      }
    }
    return map;
  }, [deliveryEvents]);

  useRealtimeFirmAgreements();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortField, setSortField] = useState<SortField>('last_requested');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [orphansOpen, setOrphansOpen] = useState(false);
  const [marketplaceOnly, setMarketplaceOnly] = useState(false);

  // AI Command Center
  const { setPageContext } = useAICommandCenterContext();
  useEffect(() => {
    setPageContext({ page: 'document_tracking', entity_type: 'firms' });
  }, [setPageContext]);

  useAIUIActionHandler({
    table: 'documents',
    onSelectRows: (rowIds, mode) => {
      if (mode === 'replace') setSelectedIds(new Set(rowIds));
      else if (mode === 'add')
        setSelectedIds((p) => {
          const n = new Set(p);
          rowIds.forEach((id) => n.add(id));
          return n;
        });
      else
        setSelectedIds((p) => {
          const n = new Set(p);
          rowIds.forEach((id) => (n.has(id) ? n.delete(id) : n.add(id)));
          return n;
        });
    },
    onClearSelection: () => setSelectedIds(new Set()),
    onSortColumn: (field) => {
      const map: Record<string, SortField> = {
        company_name: 'company',
        nda: 'nda_status',
        fee: 'fee_status',
        members: 'members',
        last_signed: 'last_signed',
      };
      const f = map[field];
      if (f) toggleSort(f);
    },
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Filter + Search
  const filteredFirms = useMemo(() => {
    let result = [...firms];

    if (marketplaceOnly) {
      result = result.filter(f =>
        f.members.some(m => m.member_type === 'marketplace_user' && m.user_id)
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((f) => {
        if (
          f.primary_company_name.toLowerCase().includes(q) ||
          f.contactName?.toLowerCase().includes(q) ||
          f.contactEmail?.toLowerCase().includes(q) ||
          f.email_domain?.toLowerCase().includes(q)
        )
          return true;
        if (f.members?.length) {
          return f.members.some((m) => {
            const memberName = m.user
              ? `${m.user.first_name || ''} ${m.user.last_name || ''}`.trim().toLowerCase()
              : (m.lead_name || '').toLowerCase();
            const memberEmail = (m.user?.email || m.lead_email || '').toLowerCase();
            return memberName.includes(q) || memberEmail.includes(q);
          });
        }
        return false;
      });
    }

    if (filterStatus === 'pending_requests') {
      result = result.filter((f) => f.hasPendingRequest);
    }

    if (filterStatus === 'signed') {
      result = result.filter(
        (f) => f.nda_status === 'signed' || f.fee_agreement_status === 'signed',
      );
    } else if (filterStatus === 'sent') {
      result = result.filter((f) => f.nda_status === 'sent' || f.fee_agreement_status === 'sent');
    } else if (filterStatus === 'not_started') {
      result = result.filter(
        (f) => f.nda_status === 'not_started' && f.fee_agreement_status === 'not_started',
      );
    } else if (filterStatus === 'unsigned') {
      result = result.filter(
        (f) => f.nda_status !== 'signed' || f.fee_agreement_status !== 'signed',
      );
    } else if (filterStatus === 'needs_attention') {
      const now = new Date();
      result = result.filter((f) => {
        const ndaSent = f.nda_sent_at
          ? differenceInDays(now, new Date(f.nda_sent_at)) > 7 && f.nda_status === 'sent'
          : false;
        const feeSent = f.fee_agreement_sent_at
          ? differenceInDays(now, new Date(f.fee_agreement_sent_at)) > 7 &&
            f.fee_agreement_status === 'sent'
          : false;
        return ndaSent || feeSent;
      });
    }

    const statusOrder: Record<string, number> = {
      sent: 0,
      redlined: 1,
      under_review: 2,
      declined: 3,
      expired: 4,
      signed: 5,
      not_started: 6,
    };

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'company')
        cmp = a.primary_company_name.localeCompare(b.primary_company_name);
      else if (sortField === 'nda_status')
        cmp = (statusOrder[a.nda_status] ?? 9) - (statusOrder[b.nda_status] ?? 9);
      else if (sortField === 'fee_status')
        cmp =
          (statusOrder[a.fee_agreement_status] ?? 9) - (statusOrder[b.fee_agreement_status] ?? 9);
      else if (sortField === 'members') cmp = b.member_count - a.member_count;
      else if (sortField === 'last_requested') {
        const aDate = Math.max(
          a.nda_requested_at ? new Date(a.nda_requested_at).getTime() : 0,
          a.fee_agreement_requested_at ? new Date(a.fee_agreement_requested_at).getTime() : 0,
        );
        const bDate = Math.max(
          b.nda_requested_at ? new Date(b.nda_requested_at).getTime() : 0,
          b.fee_agreement_requested_at ? new Date(b.fee_agreement_requested_at).getTime() : 0,
        );
        if (aDate === 0 && bDate === 0) cmp = 0;
        else if (aDate === 0) cmp = 1;
        else if (bDate === 0) cmp = -1;
        else cmp = aDate - bDate;
      }
      else if (sortField === 'last_signed') {
        const aDate = Math.max(
          a.nda_signed_at ? new Date(a.nda_signed_at).getTime() : 0,
          a.fee_agreement_signed_at ? new Date(a.fee_agreement_signed_at).getTime() : 0,
        );
        const bDate = Math.max(
          b.nda_signed_at ? new Date(b.nda_signed_at).getTime() : 0,
          b.fee_agreement_signed_at ? new Date(b.fee_agreement_signed_at).getTime() : 0,
        );
        if (aDate === 0 && bDate === 0) cmp = 0;
        else if (aDate === 0) cmp = 1;
        else if (bDate === 0) cmp = -1;
        else cmp = aDate - bDate;
      }

      // Pending requests always sort to the top
      if (a.hasPendingRequest !== b.hasPendingRequest) {
        return a.hasPendingRequest ? -1 : 1;
      }

      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [firms, searchQuery, filterStatus, sortField, sortAsc, marketplaceOnly]);

  // Stats
  const totalFirms = firms.length;
  const ndaSigned = firms.filter((f) => f.nda_status === 'signed').length;
  const feeSigned = firms.filter((f) => f.fee_agreement_status === 'signed').length;
  const needsAttention = useMemo(() => {
    const now = new Date();
    return firms.filter((f) => {
      const ndaSent = f.nda_sent_at
        ? differenceInDays(now, new Date(f.nda_sent_at)) > 7 && f.nda_status === 'sent'
        : false;
      const feeSent = f.fee_agreement_sent_at
        ? differenceInDays(now, new Date(f.fee_agreement_sent_at)) > 7 &&
          f.fee_agreement_status === 'sent'
        : false;
      return ndaSent || feeSent;
    }).length;
  }, [firms]);

  // Selection
  const allFilteredKeys = useMemo(() => filteredFirms.map((f) => f.id), [filteredFirms]);
  const allSelected = filteredFirms.length > 0 && allFilteredKeys.every((k) => selectedIds.has(k));
  const someSelected = allFilteredKeys.some((k) => selectedIds.has(k));

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) allFilteredKeys.forEach((k) => next.delete(k));
      else allFilteredKeys.forEach((k) => next.add(k));
      return next;
    });
  }, [allSelected, allFilteredKeys]);

  const { handleToggle: toggleRow } = useShiftSelect(allFilteredKeys, selectedIds, setSelectedIds);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Document Tracking</h1>
        <p className="text-muted-foreground mt-1">
          Track NDA and Fee Agreement status for all marketplace firms
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <StatCard label="Total Firms" value={totalFirms} />
        <StatCard
          label="NDA Signed"
          value={ndaSigned}
          subtitle={`/ ${totalFirms}`}
          color="emerald"
        />
        <StatCard
          label="Fee Signed"
          value={feeSigned}
          subtitle={`/ ${totalFirms}`}
          color="emerald"
        />
        <StatCard
          label="Pending Requests"
          value={firms.filter(f => f.hasPendingRequest).length}
          color="amber"
          onClick={() => setFilterStatus('pending_requests')}
        />
        <StatCard
          label="Needs Attention"
          value={needsAttention}
          color="amber"
          onClick={() => setFilterStatus('needs_attention')}
        />
        <StatCard
          label="Orphan Users"
          value={orphanUsers.length}
          color={orphanUsers.length > 0 ? 'red' : 'gray'}
          onClick={() => setOrphansOpen(!orphansOpen)}
        />
      </div>

      {/* Orphan Users Alert */}
      {orphanUsers.length > 0 && (
        <Collapsible open={orphansOpen} onOpenChange={setOrphansOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100 transition-colors">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-medium">
              {orphanUsers.length} approved users have no firm record
            </span>
            {orphansOpen ? (
              <ChevronDown className="h-4 w-4 ml-auto" />
            ) : (
              <ChevronRight className="h-4 w-4 ml-auto" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 border border-border rounded-lg overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                      Company
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orphanUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2">
                        {[u.first_name, u.last_name].filter(Boolean).join(' ') || '--'}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-2 text-muted-foreground">{u.company || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Pending Request Queue */}
      {pendingRequests.length > 0 && (
        <div className="border border-amber-200 rounded-xl bg-amber-50/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Pending Requests ({pendingRequests.length})
            </h3>
            <span className="text-xs text-amber-700">Check inbox at adam.haile@sourcecodeals.com</span>
          </div>
          <div className="divide-y divide-amber-200">
            {pendingRequests.map((req) => {
              const normalizedId = req.email_provider_message_id?.replace(/^<|>$/g, '').trim();
              return (
                <PendingRequestRow key={req.id} req={req} deliveryEvent={normalizedId ? deliveryMap.get(normalizedId) : undefined} />
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by firm, contact, email, or domain..."
            className="w-full text-sm border border-border rounded-lg pl-9 pr-3 py-2.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
          />
        </div>
        <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-2">
          <Switch
            id="marketplace-only"
            checked={marketplaceOnly}
            onCheckedChange={setMarketplaceOnly}
          />
          <Label htmlFor="marketplace-only" className="text-sm whitespace-nowrap cursor-pointer">
            Marketplace Only
          </Label>
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
          className="text-sm border border-border rounded-lg px-3 py-2.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring/20"
        >
          <option value="all">All Statuses</option>
          <option value="signed">Has Signed</option>
          <option value="sent">Awaiting Signature</option>
          <option value="not_started">Not Started</option>
          <option value="unsigned">Not Fully Signed</option>
          <option value="needs_attention">Needs Attention (&gt;7d)</option>
          <option value="pending_requests">Pending Requests</option>
        </select>
      </div>

      {/* Selection bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm">
          <span className="font-medium">{selectedIds.size} selected</span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-muted-foreground hover:text-foreground underline text-xs"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      {error ? (
        <div className="border border-border rounded-xl bg-card flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-8 w-8 text-destructive mb-2" />
          <p className="text-sm text-destructive">Failed to load firms</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredFirms.length === 0 ? (
        <div className="border border-border rounded-xl bg-card flex flex-col items-center justify-center py-16">
          <FileSignature className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">No firms found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {searchQuery || filterStatus !== 'all'
              ? 'Try adjusting your filters.'
              : 'Firms will appear here as users sign up.'}
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 w-10">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button
                      onClick={() => toggleSort('company')}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      Firm Name <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Domain</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button
                      onClick={() => toggleSort('members')}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      <Users className="h-3 w-3" /> Members <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button
                      onClick={() => toggleSort('nda_status')}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      <Shield className="h-3 w-3" /> NDA <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button
                      onClick={() => toggleSort('last_signed')}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      NDA Date <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button
                      onClick={() => toggleSort('fee_status')}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      <FileSignature className="h-3 w-3" /> Fee Agmt{' '}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button
                      onClick={() => toggleSort('last_signed')}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      Fee Date <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button
                      onClick={() => toggleSort('last_requested')}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      Requested <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Primary Contact
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredFirms.map((firm) => (
                  <FirmExpandableRow
                    key={firm.id}
                    firm={firm}
                    isSelected={selectedIds.has(firm.id)}
                    onToggleSelect={(checked, e) => toggleRow(firm.id, checked, e)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-border bg-muted/30 text-xs text-muted-foreground">
            Showing {filteredFirms.length} of {firms.length} firms
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Expandable Firm Row ─────────────────────────────────────────────

function FirmExpandableRow({
  firm,
  isSelected,
  onToggleSelect,
}: {
  firm: FirmRow;
  isSelected: boolean;
  onToggleSelect: (checked: boolean, e: React.MouseEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const removeMember = useRemoveFirmMember();
  const { data: auditLog = [] } = useAgreementAuditLog(expanded ? firm.id : null);

  return (
    <>
      <tr
        className={`hover:bg-muted/30 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : firm.hasPendingRequest ? 'bg-amber-50/60' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <td
          className="px-4 py-3 w-10"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(!isSelected, e);
          }}
        >
          <Checkbox checked={isSelected} onCheckedChange={() => {}} aria-label={`Select ${firm.primary_company_name}`} />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            <span className="font-medium text-foreground">{firm.primary_company_name}</span>
            {firm.hasPendingRequest && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                Requested
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-muted-foreground text-xs">{firm.email_domain || '--'}</td>
        <td className="px-4 py-3 text-center"><span className="text-muted-foreground">{firm.member_count}</span></td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <AgreementStatusDropdown firm={firm.firmAgreement} members={firm.members} agreementType="nda" />
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {firm.nda_signed_at ? (
            <div>
              <span className="text-emerald-600 font-medium">{format(new Date(firm.nda_signed_at), 'MMM d, yyyy')}</span>
              {firm.nda_signed_by_name && <p className="text-[10px]">{firm.nda_signed_by_name}</p>}
              {firm.nda_marked_by_admin && <p className="text-[10px] text-muted-foreground/70">Marked by {firm.nda_marked_by_admin}</p>}
            </div>
          ) : firm.nda_sent_at ? (
            <span>{formatDistanceToNow(new Date(firm.nda_sent_at), { addSuffix: true })}</span>
          ) : '--'}
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <AgreementStatusDropdown firm={firm.firmAgreement} members={firm.members} agreementType="fee_agreement" />
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {firm.fee_agreement_signed_at ? (
            <div>
              <span className="text-emerald-600 font-medium">{format(new Date(firm.fee_agreement_signed_at), 'MMM d, yyyy')}</span>
              {firm.fee_agreement_signed_by_name && <p className="text-[10px]">{firm.fee_agreement_signed_by_name}</p>}
              {firm.fee_marked_by_admin && <p className="text-[10px] text-muted-foreground/70">Marked by {firm.fee_marked_by_admin}</p>}
            </div>
          ) : firm.fee_agreement_sent_at ? (
            <span>{formatDistanceToNow(new Date(firm.fee_agreement_sent_at), { addSuffix: true })}</span>
          ) : '--'}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {(() => {
            const reqDate = firm.nda_requested_at || firm.fee_agreement_requested_at
              ? new Date(Math.max(
                  firm.nda_requested_at ? new Date(firm.nda_requested_at).getTime() : 0,
                  firm.fee_agreement_requested_at ? new Date(firm.fee_agreement_requested_at).getTime() : 0,
                )).toISOString()
              : null;
            return reqDate ? (
              <span className={firm.hasPendingRequest ? 'text-amber-600 font-medium' : ''}>
                {formatDistanceToNow(new Date(reqDate), { addSuffix: true })}
              </span>
            ) : '--';
          })()}
        </td>
        <td className="px-4 py-3">
          {firm.contactName || firm.contactEmail ? (
            <div>
              {firm.contactName && <p className="text-foreground text-xs">{firm.contactName}</p>}
              {firm.contactEmail && <p className="text-[10px] text-muted-foreground">{firm.contactEmail}</p>}
            </div>
          ) : <span className="text-muted-foreground">--</span>}
        </td>
      </tr>

      {/* Expanded detail panel */}
      {expanded && (
        <tr>
          <td colSpan={10} className="px-0 py-0">
            <div className="bg-muted/20 border-t border-b border-border px-6 py-4 space-y-4">
              {/* Members section */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Members ({firm.members.length})
                </h4>
                {firm.members.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No members</p>
                ) : (
                  <div className="grid gap-1.5">
                    {firm.members.map((m) => {
                      const name = m.user
                        ? `${(m.user as Record<string, string>).first_name || ''} ${(m.user as Record<string, string>).last_name || ''}`.trim()
                        : m.lead_name || '--';
                      const email = m.user ? (m.user as Record<string, string>).email : m.lead_email;
                      return (
                        <div key={m.id} className="flex items-center justify-between text-xs bg-background rounded px-3 py-2 border border-border">
                          <div>
                            <span className="font-medium text-foreground">{name}</span>
                            {email && <span className="text-muted-foreground ml-2">{email}</span>}
                            <span className="ml-2 text-[10px] text-muted-foreground/60">{m.member_type}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (confirm(`Remove ${name} from ${firm.primary_company_name}?`)) {
                                removeMember.mutate({ memberId: m.id, firmId: firm.id });
                              }
                            }}
                          >
                            <UserMinus className="h-3 w-3 mr-1" /> Remove
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Document Requests History */}
              {(firm.documentRequests || []).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <FileSignature className="h-3.5 w-3.5" /> Document Requests ({(firm.documentRequests || []).length})
                  </h4>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {firm.documentRequests.map((dr) => (
                      <div key={dr.id} className="flex items-center justify-between text-[11px] bg-background rounded px-3 py-1.5 border border-border">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">
                            {format(new Date(dr.created_at), 'MMM d, yyyy')}
                          </span>
                          <span className="font-medium text-foreground">
                            {dr.agreement_type === 'nda' ? 'NDA' : 'Fee Agmt'}
                          </span>
                          {dr.recipient_name && (
                            <span className="text-muted-foreground">{dr.recipient_name}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                            dr.status === 'signed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            dr.status === 'dismissed' ? 'bg-muted text-muted-foreground border-border' :
                            dr.status === 'email_sent' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-muted text-muted-foreground border-border'
                          }`}>
                            {dr.status === 'signed' ? 'Signed' :
                             dr.status === 'dismissed' ? 'Dismissed' :
                             dr.status === 'email_sent' ? 'Email Sent' :
                             'Requested'}
                          </span>
                          {dr.last_email_error && (
                            <span className="text-[10px] text-destructive" title={dr.last_email_error}>Error</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Audit Log section */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" /> Audit Log
                </h4>
                {auditLog.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No changes recorded</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {auditLog.slice(0, 20).map((entry) => (
                      <div key={entry.id} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                        <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap mt-0.5">
                          {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                        <span>
                          <span className="font-medium text-foreground">{entry.agreement_type === 'nda' ? 'NDA' : 'Fee Agmt'}</span>
                          {' → '}
                          <span className="font-medium">{entry.new_status}</span>
                          {entry.changed_by_name && <span> by {entry.changed_by_name}</span>}
                          {entry.notes && <span className="italic"> — {entry.notes}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Pending Request Row (with Mark Signed dialog) ───────────────────

function PendingRequestRow({ req, deliveryEvent }: { req: PendingRequest; deliveryEvent?: DeliveryEvent }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signedByName, setSignedByName] = useState<string | null>(req.recipient_name || null);
  const [signedByUserId, setSignedByUserId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState('manual');
  const [submitting, setSubmitting] = useState(false);

  const handleMarkSigned = async () => {
    const adminName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : null;
    const now = new Date().toISOString();
    setSubmitting(true);
    try {
      await untypedFrom('document_requests')
        .update({
          status: 'signed',
          signed_toggled_by: user?.id || null,
          signed_toggled_by_name: adminName,
          signed_at: now,
        })
        .eq('id', req.id);

      if (req.firm_id) {
        const statusCol = req.agreement_type === 'nda' ? 'nda_status' : 'fee_agreement_status';
        const signedAtCol = req.agreement_type === 'nda' ? 'nda_signed_at' : 'fee_agreement_signed_at';
        const signedByCol = req.agreement_type === 'nda' ? 'nda_signed_by_name' : 'fee_agreement_signed_by_name';
        const signedByIdCol = req.agreement_type === 'nda' ? 'nda_signed_by' : 'fee_agreement_signed_by';
        await supabase
          .from('firm_agreements')
          .update({
            [statusCol]: 'signed',
            [signedAtCol]: now,
            [signedByCol]: signedByName || req.recipient_name || adminName,
            [signedByIdCol]: signedByUserId || null,
          } as never)
          .eq('id', req.firm_id);

        await supabase
          .from('agreement_audit_log')
          .insert({
            firm_id: req.firm_id,
            agreement_type: req.agreement_type === 'nda' ? 'nda' : 'fee_agreement',
            old_status: 'sent',
            new_status: 'signed',
            changed_by: user?.id || null,
            changed_by_name: adminName,
            notes: notes || `Marked signed via pending queue (source: ${source})`,
          });
      }

      queryClient.invalidateQueries({ queryKey: ['admin-pending-request-queue'] });
      queryClient.invalidateQueries({ queryKey: ['admin-document-tracking'] });
      queryClient.invalidateQueries({ queryKey: ['admin-pending-doc-requests'] });
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
      toast({ title: 'Marked as signed', description: `${req.agreement_type === 'nda' ? 'NDA' : 'Fee Agreement'} marked as signed.` });
      setSignDialogOpen(false);
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="px-4 py-3 flex items-center justify-between hover:bg-amber-100/50 transition-colors">
        <div className="flex items-center gap-3">
          {req.agreement_type === 'nda' ? (
            <Shield className="h-4 w-4 text-primary" />
          ) : (
            <FileSignature className="h-4 w-4 text-primary" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">
              {req.recipient_name || req.recipient_email || 'Unknown'}
              <span className="ml-2 text-xs text-muted-foreground">
                {req.agreement_type === 'nda' ? 'NDA' : 'Fee Agreement'}
              </span>
            </p>
            {req.recipient_email && req.recipient_name && (
              <p className="text-xs text-muted-foreground">{req.recipient_email}</p>
            )}
            {/* Delivery state indicator */}
            <div className="flex items-center gap-1.5 mt-0.5">
              {req.last_email_error ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-destructive/10 text-destructive border border-destructive/20">
                  ⚠ {req.last_email_error.length > 40 ? req.last_email_error.substring(0, 40) + '…' : req.last_email_error}
                </span>
              ) : deliveryEvent ? (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                  deliveryEvent.status === 'delivered' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  deliveryEvent.status === 'opened' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  deliveryEvent.status === 'bounced' || deliveryEvent.status === 'blocked' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                  'bg-muted text-muted-foreground border-border'
                }`}>
                  {deliveryEvent.status === 'delivered' ? '✓ Delivered' :
                   deliveryEvent.status === 'opened' ? '👁 Opened' :
                   deliveryEvent.status === 'bounced' ? '✕ Bounced' :
                   deliveryEvent.status === 'blocked' ? '✕ Blocked' :
                   deliveryEvent.status === 'spam_complaint' ? '⚠ Spam' :
                   deliveryEvent.status}
                </span>
              ) : req.status === 'email_sent' ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  ✉ Accepted by Brevo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                  Requested
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            onClick={() => setSignDialogOpen(true)}
          >
            Mark Signed
          </Button>
          <DismissButton requestId={req.id} label={req.recipient_name || req.recipient_email || 'request'} />
        </div>
      </div>

      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mark {req.agreement_type === 'nda' ? 'NDA' : 'Fee Agreement'} as Signed</DialogTitle>
            <DialogDescription>
              Confirm signing details for {req.recipient_name || req.recipient_email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Signer Name</Label>
              <Input
                value={signedByName || ''}
                onChange={(e) => { setSignedByName(e.target.value); setSignedByUserId(null); }}
                placeholder="Name of person who signed..."
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Email (manual exchange)</SelectItem>
                  <SelectItem value="platform">Platform</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Admin Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about the signing..."
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setSignDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleMarkSigned}
              disabled={submitting || !signedByName}
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
              Confirm Signed
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Dismiss Button ──────────────────────────────────────────────────

function DismissButton({ requestId, label }: { requestId: string; label: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dismissing, setDismissing] = useState(false);

  const handleDismiss = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissing(true);
    try {
      const { error } = await untypedFrom('document_requests')
        .update({ status: 'dismissed' })
        .eq('id', requestId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['admin-pending-request-queue'] });
      queryClient.invalidateQueries({ queryKey: ['admin-pending-doc-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-document-tracking'] });
      toast({ title: 'Request dismissed', description: `Dismissed request from ${label}` });
    } catch {
      toast({ title: 'Failed to dismiss', variant: 'destructive' });
    } finally {
      setDismissing(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
      onClick={handleDismiss}
      disabled={dismissing}
      title="Dismiss this request"
    >
      {dismissing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
    </Button>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  subtitle,
  color,
  onClick,
}: {
  label: string;
  value: number;
  subtitle?: string;
  color?: 'emerald' | 'amber' | 'gray' | 'red';
  onClick?: () => void;
}) {
  const colorClasses =
    color === 'emerald'
      ? 'text-emerald-600'
      : color === 'amber'
        ? 'text-amber-600'
        : color === 'red'
          ? 'text-red-600'
          : color === 'gray'
            ? 'text-gray-500'
            : 'text-foreground';

  return (
    <div
      className={`border border-border rounded-xl bg-card px-4 py-3 ${onClick ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
      onClick={onClick}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colorClasses}`}>
        {value}
        {subtitle && (
          <span className="text-sm font-normal text-muted-foreground ml-0.5">{subtitle}</span>
        )}
      </p>
    </div>
  );
}
