import { useState } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  useDataRoomAccess,
  useUpdateAccess,
  useRevokeAccess,
  useBulkUpdateAccess,
  DataRoomAccessRecord,
} from '@/hooks/admin/data-room/use-data-room';

export interface UnifiedBuyer {
  id: string;
  remarketing_buyer_id: string;
  display_name: string;
  subtitle: string | null;
  buyer_type: string | null;
  has_fee_agreement: boolean;
  entry_type: 'firm' | 'contact';
}

export function useAccessMatrix(dealId: string, projectName?: string | null) {
  const { data: accessRecords = [], isLoading } = useDataRoomAccess(dealId);
  const updateAccess = useUpdateAccess();
  const revokeAccess = useRevokeAccess();
  const bulkUpdate = useBulkUpdateAccess();
  const queryClient = useQueryClient();

  const [showAddBuyer, setShowAddBuyer] = useState(false);
  const [selectedBuyers, setSelectedBuyers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [buyerSearch, setBuyerSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sendLinkRecord, setSendLinkRecord] = useState<DataRoomAccessRecord | null>(null);
  const [sendEmail, setSendEmail] = useState('');
  const [expirationRecord, setExpirationRecord] = useState<DataRoomAccessRecord | null>(null);
  const [expirationDate, setExpirationDate] = useState<Date | undefined>();
  const [addBuyerSelected, setAddBuyerSelected] = useState<Set<string>>(new Set());
  const [showFeeWarning, setShowFeeWarning] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{
    deal_id: string;
    remarketing_buyer_id?: string;
    marketplace_user_id?: string;
    can_view_teaser: boolean;
    can_view_full_memo: boolean;
    can_view_data_room: boolean;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  // Fetch available buyers (firms + contacts) for add dialog
  const { data: availableBuyers = [] } = useQuery({
    queryKey: ['available-buyers-for-access', dealId, buyerSearch],
    queryFn: async () => {
      let firmsQuery = supabase
        .from('buyers')
        .select(
          `
          id, company_name, pe_firm_name, email_domain, buyer_type,
          firm_agreement:firm_agreements!remarketing_buyers_marketplace_firm_id_fkey(
            fee_agreement_signed
          )
        `,
        )
        .eq('archived', false)
        .order('company_name')
        .limit(100);

      if (buyerSearch) {
        firmsQuery = firmsQuery.or(
          `company_name.ilike.%${buyerSearch}%,pe_firm_name.ilike.%${buyerSearch}%`,
        );
      }

      let contactsQuery = supabase
        .from('contacts')
        .select(
          `
          id, first_name, last_name, email, title,
          buyer:buyers!contacts_remarketing_buyer_id_fkey(id, company_name, pe_firm_name, buyer_type, archived)
        `,
        )
        .eq('contact_type', 'buyer')
        .eq('archived', false)
        .not('remarketing_buyer_id', 'is', null)
        .order('first_name')
        .limit(100);

      if (buyerSearch) {
        contactsQuery = contactsQuery.or(
          `first_name.ilike.%${buyerSearch}%,last_name.ilike.%${buyerSearch}%,email.ilike.%${buyerSearch}%`,
        );
      }

      const [firmsResult, contactsResult] = await Promise.all([firmsQuery, contactsQuery]);

      if (firmsResult.error) throw firmsResult.error;

      const firms: UnifiedBuyer[] = (firmsResult.data || []).map((b) => ({
        id: b.id,
        remarketing_buyer_id: b.id,
        display_name: b.company_name || b.pe_firm_name || 'Unknown',
        subtitle: b.email_domain || null,
        buyer_type: b.buyer_type,
        has_fee_agreement: !!b.firm_agreement?.fee_agreement_signed,
        entry_type: 'firm' as const,
      }));

      const contacts: UnifiedBuyer[] = (contactsResult.data || []).map(
        (c: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          title: string | null;
          buyer: {
            id: string;
            company_name: string | null;
            pe_firm_name: string | null;
            buyer_type: string | null;
            archived: boolean;
          } | null;
        }) => ({
          id: `contact:${c.id}`,
          remarketing_buyer_id: c.buyer?.id || '',
          display_name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
          subtitle: c.title
            ? `${c.title} at ${c.buyer?.company_name || c.buyer?.pe_firm_name || ''}`
            : c.buyer?.company_name || c.buyer?.pe_firm_name || null,
          buyer_type: c.buyer?.buyer_type || null,
          has_fee_agreement: false,
          entry_type: 'contact' as const,
        }),
      );

      return [...firms, ...contacts];
    },
    enabled: showAddBuyer,
  });

  const activeRecords = accessRecords.filter((r) => !r.revoked_at);
  const filteredRecords = activeRecords.filter(
    (r) =>
      !searchQuery ||
      r.buyer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.buyer_company?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleToggle = async (
    record: DataRoomAccessRecord,
    field: 'can_view_teaser' | 'can_view_full_memo' | 'can_view_data_room',
    newValue: boolean,
  ) => {
    const updates = {
      deal_id: dealId,
      remarketing_buyer_id: record.remarketing_buyer_id || undefined,
      marketplace_user_id: record.marketplace_user_id || undefined,
      can_view_teaser: field === 'can_view_teaser' ? newValue : record.can_view_teaser,
      can_view_full_memo: field === 'can_view_full_memo' ? newValue : record.can_view_full_memo,
      can_view_data_room: field === 'can_view_data_room' ? newValue : record.can_view_data_room,
    };

    if (
      (field === 'can_view_full_memo' || field === 'can_view_data_room') &&
      newValue &&
      !record.fee_agreement_signed
    ) {
      setPendingUpdate(updates);
      setShowFeeWarning(true);
      return;
    }

    updateAccess.mutate(updates);
  };

  const handleFeeOverride = () => {
    if (pendingUpdate) {
      const params: Parameters<typeof updateAccess.mutate>[0] = {
        ...pendingUpdate,
        fee_agreement_override_reason: overrideReason,
      };
      updateAccess.mutate(params);
    }
    setShowFeeWarning(false);
    setPendingUpdate(null);
    setOverrideReason('');
  };

  const handleAddBuyers = () => {
    const buyerIdsToAdd = new Set<string>();
    addBuyerSelected.forEach((selectedId) => {
      const buyer = availableBuyers.find((b) => b.id === selectedId);
      if (buyer?.remarketing_buyer_id) {
        buyerIdsToAdd.add(buyer.remarketing_buyer_id);
      }
    });

    buyerIdsToAdd.forEach((rmBuyerId) => {
      updateAccess.mutate({
        deal_id: dealId,
        remarketing_buyer_id: rmBuyerId,
        can_view_teaser: true,
        can_view_full_memo: false,
        can_view_data_room: false,
      });
    });
    setShowAddBuyer(false);
    setAddBuyerSelected(new Set());
    setBuyerSearch('');
  };

  const handleCopyLink = async (record: DataRoomAccessRecord) => {
    if (!record.access_token) {
      toast.error('No access token generated for this buyer');
      return;
    }

    const baseUrl = window.location.origin;
    const link = `${baseUrl}/data-room/${dealId}?token=${record.access_token}`;

    await navigator.clipboard.writeText(link);

    await supabase
      .from('data_room_access')
      .update({
        link_sent_at: new Date().toISOString(),
        link_sent_via: 'manual_copy',
      })
      .eq('id', record.access_id);

    queryClient.invalidateQueries({ queryKey: ['data-room-access', dealId] });
    toast.success('Link copied to clipboard');
  };

  const handleSendEmail = async () => {
    if (!sendLinkRecord || !sendEmail) return;

    const baseUrl = window.location.origin;
    const link = `${baseUrl}/data-room/${dealId}?token=${sendLinkRecord.access_token}`;

    await supabase
      .from('data_room_access')
      .update({
        link_sent_at: new Date().toISOString(),
        link_sent_to_email: sendEmail,
        link_sent_via: 'email',
      })
      .eq('id', sendLinkRecord.access_id);

    const subject = encodeURIComponent(`${projectName || 'Deal'} — Document Access`);
    const body = encodeURIComponent(
      `You have been granted access to view documents.\n\nClick here to view: ${link}\n\nPlease do not share this link.`,
    );
    window.open(`mailto:${sendEmail}?subject=${subject}&body=${body}`, '_blank');

    queryClient.invalidateQueries({ queryKey: ['data-room-access', dealId] });
    setSendLinkRecord(null);
    setSendEmail('');
    toast.success('Email opened & link tracked');
  };

  const handleSetExpiration = async () => {
    if (!expirationRecord || !expirationDate) return;

    await supabase
      .from('data_room_access')
      .update({ expires_at: expirationDate.toISOString() })
      .eq('id', expirationRecord.access_id);

    queryClient.invalidateQueries({ queryKey: ['data-room-access', dealId] });
    setExpirationRecord(null);
    setExpirationDate(undefined);
    toast.success('Expiration date set');
  };

  const toggleRowExpanded = (id: string) => {
    const next = new Set(expandedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedRows(next);
  };

  const handleBulkToggle = (
    field: 'can_view_teaser' | 'can_view_full_memo' | 'can_view_data_room',
    value: boolean,
  ) => {
    const eligibleRecords = Array.from(selectedBuyers)
      .map((id) => activeRecords.find((r) => r.access_id === id))
      .filter((record): record is DataRoomAccessRecord => {
        if (!record) return false;
        if (
          (field === 'can_view_full_memo' || field === 'can_view_data_room') &&
          value &&
          !record.fee_agreement_signed
        ) {
          return false;
        }
        return true;
      });

    if (eligibleRecords.length === 0) {
      toast.error('No eligible buyers. Selected buyers need a signed fee agreement first.');
      return;
    }

    const buyerIds = eligibleRecords.map((record) => ({
      remarketing_buyer_id: record.remarketing_buyer_id || undefined,
      marketplace_user_id: record.marketplace_user_id || undefined,
    }));

    bulkUpdate.mutate({
      deal_id: dealId,
      buyer_ids: buyerIds,
      can_view_teaser: field === 'can_view_teaser' ? value : false,
      can_view_full_memo: field === 'can_view_full_memo' ? value : false,
      can_view_data_room: field === 'can_view_data_room' ? value : false,
    });
    setSelectedBuyers(new Set());
  };

  return {
    // Data
    isLoading,
    activeRecords,
    filteredRecords,
    availableBuyers,

    // Search
    searchQuery,
    setSearchQuery,

    // Selection
    selectedBuyers,
    setSelectedBuyers,

    // Expanded rows
    expandedRows,
    toggleRowExpanded,

    // Add buyer dialog
    showAddBuyer,
    setShowAddBuyer,
    buyerSearch,
    setBuyerSearch,
    addBuyerSelected,
    setAddBuyerSelected,
    handleAddBuyers,

    // Toggle access
    handleToggle,
    handleBulkToggle,

    // Fee override dialog
    showFeeWarning,
    setShowFeeWarning,
    pendingUpdate,
    setPendingUpdate,
    overrideReason,
    setOverrideReason,
    handleFeeOverride,

    // Link management
    handleCopyLink,
    sendLinkRecord,
    setSendLinkRecord,
    sendEmail,
    setSendEmail,
    handleSendEmail,

    // Expiration
    expirationRecord,
    setExpirationRecord,
    expirationDate,
    setExpirationDate,
    handleSetExpiration,

    // Revoke
    revokeAccess,
    dealId,
  };
}
