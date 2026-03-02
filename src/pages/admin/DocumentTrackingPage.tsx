import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
} from 'lucide-react';
import { formatDistanceToNow, format, differenceInDays } from 'date-fns';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';
import { useAIUIActionHandler } from '@/hooks/useAIUIActionHandler';
import { AgreementStatusDropdown } from '@/components/admin/firm-agreements/AgreementStatusDropdown';
import type { FirmAgreement, FirmMember, AgreementStatus } from '@/hooks/admin/use-firm-agreements';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// ─── Types ───────────────────────────────────────────────────────────

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
  fee_agreement_status: AgreementStatus;
  fee_agreement_sent_at: string | null;
  fee_agreement_email_sent_at: string | null;
  fee_agreement_signed_at: string | null;
  fee_agreement_signed_by_name: string | null;
  contactName: string | null;
  contactEmail: string | null;
  // For AgreementStatusDropdown compatibility
  firmAgreement: FirmAgreement;
  members: FirmMember[];
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
      const { data: firms, error } = await supabase
        .from('firm_agreements')
        .select(`
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
        `)
        .order('primary_company_name');

      if (error) throw error;
      if (!firms || firms.length === 0) return [];

      return firms.map((firm: any) => {
        const primaryMember = firm.firm_members?.find((m: any) => m.is_primary_contact);
        const anyMember = firm.firm_members?.[0];
        const member = primaryMember || anyMember;

        const contactName = member?.user
          ? `${member.user.first_name || ''} ${member.user.last_name || ''}`.trim()
          : member?.lead_name || null;
        const contactEmail = member?.user?.email || member?.lead_email || null;

        // Build FirmMember[] for the dropdown
        const members: FirmMember[] = (firm.firm_members || []).map((m: any) => ({
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
        }));

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
          fee_agreement_status: (firm.fee_agreement_status || 'not_started') as AgreementStatus,
          fee_agreement_sent_at: firm.fee_agreement_sent_at || firm.fee_agreement_email_sent_at,
          fee_agreement_email_sent_at: firm.fee_agreement_email_sent_at,
          fee_agreement_signed_at: firm.fee_agreement_signed_at,
          fee_agreement_signed_by_name: firm.fee_agreement_signed_by_name,
          contactName,
          contactEmail,
          firmAgreement: firm as unknown as FirmAgreement,
          members,
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

      const memberUserIds = new Set((memberships || []).map((m: any) => m.user_id));
      return profiles.filter((p) => !memberUserIds.has(p.id)) as OrphanUser[];
    },
  });
}

// ─── Realtime subscription hook ──────────────────────────────────────

function useRealtimeFirmAgreements() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('firm-agreements-tracking')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'firm_agreements' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['admin-document-tracking'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

// ─── Component ───────────────────────────────────────────────────────

type FilterStatus = 'all' | 'signed' | 'sent' | 'not_started' | 'unsigned' | 'needs_attention';
type SortField = 'company' | 'nda_status' | 'fee_status' | 'members' | 'last_signed';

export default function DocumentTrackingPage() {
  const { data: firms = [], isLoading, error } = useAllFirmsTracking();
  const { data: orphanUsers = [] } = useOrphanUsers();
  useRealtimeFirmAgreements();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortField, setSortField] = useState<SortField>('last_signed');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [orphansOpen, setOrphansOpen] = useState(false);

  // AI Command Center
  const { setPageContext } = useAICommandCenterContext();
  useEffect(() => {
    setPageContext({ page: 'document_tracking', entity_type: 'firms' });
  }, [setPageContext]);

  useAIUIActionHandler({
    table: 'documents',
    onSelectRows: (rowIds, mode) => {
      if (mode === 'replace') setSelectedIds(new Set(rowIds));
      else if (mode === 'add') setSelectedIds((p) => { const n = new Set(p); rowIds.forEach((id) => n.add(id)); return n; });
      else setSelectedIds((p) => { const n = new Set(p); rowIds.forEach((id) => (n.has(id) ? n.delete(id) : n.add(id))); return n; });
    },
    onClearSelection: () => setSelectedIds(new Set()),
    onSortColumn: (field) => {
      const map: Record<string, SortField> = { company_name: 'company', nda: 'nda_status', fee: 'fee_status', members: 'members', last_signed: 'last_signed' };
      const f = map[field];
      if (f) toggleSort(f);
    },
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  // Filter + Search
  const filteredFirms = useMemo(() => {
    let result = [...firms];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((f) => {
        // Search firm name, domain, primary contact
        if (
          f.primary_company_name.toLowerCase().includes(q) ||
          f.contactName?.toLowerCase().includes(q) ||
          f.contactEmail?.toLowerCase().includes(q) ||
          f.email_domain?.toLowerCase().includes(q)
        ) return true;
        // Also search ALL member emails/names (Phase 4A)
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

    if (filterStatus === 'signed') {
      result = result.filter((f) => f.nda_status === 'signed' || f.fee_agreement_status === 'signed');
    } else if (filterStatus === 'sent') {
      result = result.filter((f) => f.nda_status === 'sent' || f.fee_agreement_status === 'sent');
    } else if (filterStatus === 'not_started') {
      result = result.filter((f) => f.nda_status === 'not_started' && f.fee_agreement_status === 'not_started');
    } else if (filterStatus === 'unsigned') {
      result = result.filter((f) => f.nda_status !== 'signed' || f.fee_agreement_status !== 'signed');
    } else if (filterStatus === 'needs_attention') {
      const now = new Date();
      result = result.filter((f) => {
        const ndaSent = f.nda_sent_at ? differenceInDays(now, new Date(f.nda_sent_at)) > 7 && f.nda_status === 'sent' : false;
        const feeSent = f.fee_agreement_sent_at ? differenceInDays(now, new Date(f.fee_agreement_sent_at)) > 7 && f.fee_agreement_status === 'sent' : false;
        return ndaSent || feeSent;
      });
    }

    const statusOrder: Record<string, number> = {
      sent: 0, redlined: 1, under_review: 2, declined: 3, expired: 4, signed: 5, not_started: 6,
    };

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'company') cmp = a.primary_company_name.localeCompare(b.primary_company_name);
      else if (sortField === 'nda_status') cmp = (statusOrder[a.nda_status] ?? 9) - (statusOrder[b.nda_status] ?? 9);
      else if (sortField === 'fee_status') cmp = (statusOrder[a.fee_agreement_status] ?? 9) - (statusOrder[b.fee_agreement_status] ?? 9);
      else if (sortField === 'members') cmp = b.member_count - a.member_count;
      else if (sortField === 'last_signed') {
        const aDate = Math.max(
          a.nda_signed_at ? new Date(a.nda_signed_at).getTime() : 0,
          a.fee_agreement_signed_at ? new Date(a.fee_agreement_signed_at).getTime() : 0,
        );
        const bDate = Math.max(
          b.nda_signed_at ? new Date(b.nda_signed_at).getTime() : 0,
          b.fee_agreement_signed_at ? new Date(b.fee_agreement_signed_at).getTime() : 0,
        );
        // Firms with signed docs first, then by date
        if (aDate === 0 && bDate === 0) cmp = 0;
        else if (aDate === 0) cmp = 1;
        else if (bDate === 0) cmp = -1;
        else cmp = bDate - aDate;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [firms, searchQuery, filterStatus, sortField, sortAsc]);

  // Stats
  const totalFirms = firms.length;
  const ndaSigned = firms.filter((f) => f.nda_status === 'signed').length;
  const feeSigned = firms.filter((f) => f.fee_agreement_status === 'signed').length;
  const needsAttention = useMemo(() => {
    const now = new Date();
    return firms.filter((f) => {
      const ndaSent = f.nda_sent_at ? differenceInDays(now, new Date(f.nda_sent_at)) > 7 && f.nda_status === 'sent' : false;
      const feeSent = f.fee_agreement_sent_at ? differenceInDays(now, new Date(f.fee_agreement_sent_at)) > 7 && f.fee_agreement_status === 'sent' : false;
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total Firms" value={totalFirms} />
        <StatCard label="NDA Signed" value={ndaSigned} subtitle={`/ ${totalFirms}`} color="emerald" />
        <StatCard label="Fee Signed" value={feeSigned} subtitle={`/ ${totalFirms}`} color="emerald" />
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
            <span className="font-medium">{orphanUsers.length} approved users have no firm record</span>
            {orphansOpen ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 border border-border rounded-lg overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Company</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orphanUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2">{[u.first_name, u.last_name].filter(Boolean).join(' ') || '--'}</td>
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

      {/* Filters */}
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
            {searchQuery || filterStatus !== 'all' ? 'Try adjusting your filters.' : 'Firms will appear here as users sign up.'}
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
                    <button onClick={() => toggleSort('company')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Firm Name <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Domain</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button onClick={() => toggleSort('members')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      <Users className="h-3 w-3" /> Members <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button onClick={() => toggleSort('nda_status')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      <Shield className="h-3 w-3" /> NDA <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button onClick={() => toggleSort('last_signed')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      NDA Date <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button onClick={() => toggleSort('fee_status')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      <FileSignature className="h-3 w-3" /> Fee Agmt <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button onClick={() => toggleSort('last_signed')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Fee Date <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Primary Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredFirms.map((firm) => (
                  <tr
                    key={firm.id}
                    className={`hover:bg-muted/30 transition-colors ${selectedIds.has(firm.id) ? 'bg-primary/5' : ''}`}
                  >
                    <td
                      className="px-4 py-3 w-10"
                      onClick={(e) => { e.stopPropagation(); toggleRow(firm.id, !selectedIds.has(firm.id), e); }}
                    >
                      <Checkbox checked={selectedIds.has(firm.id)} onCheckedChange={() => {}} aria-label={`Select ${firm.primary_company_name}`} />
                    </td>

                    {/* Firm Name */}
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{firm.primary_company_name}</span>
                    </td>

                    {/* Domain */}
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {firm.email_domain || '--'}
                    </td>

                    {/* Members */}
                    <td className="px-4 py-3 text-center">
                      <span className="text-muted-foreground">{firm.member_count}</span>
                    </td>

                    {/* NDA Status - inline dropdown */}
                    <td className="px-4 py-3">
                      <AgreementStatusDropdown
                        firm={firm.firmAgreement}
                        members={firm.members}
                        agreementType="nda"
                      />
                    </td>

                    {/* NDA Date */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {firm.nda_signed_at ? (
                        <div>
                          <span className="text-emerald-600 font-medium">{format(new Date(firm.nda_signed_at), 'MMM d, yyyy')}</span>
                          {firm.nda_signed_by_name && <p className="text-[10px]">{firm.nda_signed_by_name}</p>}
                        </div>
                      ) : firm.nda_sent_at ? (
                        <span title={format(new Date(firm.nda_sent_at), 'MMM d, yyyy h:mm a')}>
                          Sent {formatDistanceToNow(new Date(firm.nda_sent_at), { addSuffix: true })}
                        </span>
                      ) : '--'}
                    </td>

                    {/* Fee Status - inline dropdown */}
                    <td className="px-4 py-3">
                      <AgreementStatusDropdown
                        firm={firm.firmAgreement}
                        members={firm.members}
                        agreementType="fee_agreement"
                      />
                    </td>

                    {/* Fee Date */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {firm.fee_agreement_signed_at ? (
                        <div>
                          <span className="text-emerald-600 font-medium">{format(new Date(firm.fee_agreement_signed_at), 'MMM d, yyyy')}</span>
                          {firm.fee_agreement_signed_by_name && <p className="text-[10px]">{firm.fee_agreement_signed_by_name}</p>}
                        </div>
                      ) : firm.fee_agreement_sent_at ? (
                        <span title={format(new Date(firm.fee_agreement_sent_at), 'MMM d, yyyy h:mm a')}>
                          Sent {formatDistanceToNow(new Date(firm.fee_agreement_sent_at), { addSuffix: true })}
                        </span>
                      ) : '--'}
                    </td>

                    {/* Contact */}
                    <td className="px-4 py-3">
                      {firm.contactName || firm.contactEmail ? (
                        <div>
                          {firm.contactName && <p className="text-foreground text-xs">{firm.contactName}</p>}
                          {firm.contactEmail && <p className="text-[10px] text-muted-foreground">{firm.contactEmail}</p>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </td>
                  </tr>
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
        {subtitle && <span className="text-sm font-normal text-muted-foreground ml-0.5">{subtitle}</span>}
      </p>
    </div>
  );
}
