/**
 * useConnectionRequestActions.ts
 *
 * Custom hook that wraps the mutation logic for status changes,
 * flag-for-review, and document access toggling.
 */
import { useState } from 'react';
import { useUpdateConnectionRequestStatus } from '@/hooks/admin/use-connection-request-status';
import { useFlagConnectionRequest } from '@/hooks/admin/use-flag-connection-request';
import { useAdminProfiles } from '@/hooks/admin/use-admin-profiles';
import { useAddManualTask } from '@/hooks/useDailyTasks';
import { useUpdateAccess } from '@/hooks/admin/data-room/use-data-room';
import { useSendMessage } from '@/hooks/use-connection-messages';
import { useConnectionRequestFirm } from '@/hooks/admin/use-connection-request-firm';
import { useUserConnectionRequests } from '@/hooks/admin/use-user-connection-requests';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { User as UserType, Listing } from '@/types';
import type { AccessField, PendingAccessToggle, AccessRecord } from './types';

interface UseConnectionRequestActionsParams {
  user: UserType;
  listing?: Listing;
  requestId?: string;
}

export function useConnectionRequestActions({
  user,
  listing,
  requestId,
}: UseConnectionRequestActionsParams) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateStatus = useUpdateConnectionRequestStatus();
  const updateAccess = useUpdateAccess();
  const flagMutation = useFlagConnectionRequest();
  const { data: adminProfiles } = useAdminProfiles();
  const addTask = useAddManualTask();
  const sendMessage = useSendMessage();
  const { data: firmInfo } = useConnectionRequestFirm(requestId || null);

  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [sendAgreementOpen, setSendAgreementOpen] = useState(false);
  const [sendAgreementType, setSendAgreementType] = useState<'nda' | 'fee_agreement'>('nda');
  const [rejectNote, setRejectNote] = useState('');
  const [activeTab, setActiveTab] = useState<'thread' | 'notes'>('thread');
  const [pendingAccessToggle, setPendingAccessToggle] = useState<PendingAccessToggle | null>(null);
  const [flagPopoverOpen, setFlagPopoverOpen] = useState(false);

  const adminList = adminProfiles
    ? Object.values(adminProfiles).sort((a, b) => a.displayName.localeCompare(b.displayName))
    : [];

  // Fetch all connection requests for this user (for BuyerDealsOverview)
  const { data: userRequests = [] } = useUserConnectionRequests(user.id);

  // Fetch current data room access for this buyer + listing
  const { data: accessRecord } = useQuery({
    queryKey: ['buyer-access', listing?.id, user.id],
    queryFn: async () => {
      if (!listing?.id) return null;
      const { data, error } = await supabase
        .from('data_room_access')
        .select('id, can_view_teaser, can_view_full_memo, can_view_data_room')
        .eq('deal_id', listing.id)
        .eq('marketplace_user_id', user.id)
        .is('revoked_at', null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!listing?.id,
  });

  // Only use firm-level data — never fall back to stale profile-level booleans
  const hasFeeAgreement = firmInfo?.fee_agreement_signed || false;
  const hasNDA = firmInfo?.nda_signed || false;
  const ndaStatus = firmInfo?.nda_status || 'not_started';
  const feeStatus = firmInfo?.fee_agreement_status || 'not_started';

  // ─── Decision Handlers ───

  const handleAccept = async () => {
    if (!requestId || updateStatus.isPending) return;
    try {
      await updateStatus.mutateAsync({ requestId, status: 'approved' });
      const listingName = listing?.title || 'this deal';
      await sendMessage.mutateAsync({
        connection_request_id: requestId,
        body: `Your introduction to ${listingName} has been approved. You now have access to the deal overview and supporting documents in the data room. Our team will facilitate the introduction to the business owner — expect to hear from us within one business day. If you have any questions in the meantime, reply here.`,
        sender_role: 'admin',
        message_type: 'decision',
      });

      // Send dedicated connection approval email to buyer
      const buyerEmail = user.email;
      const buyerName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      const listingTitle = listing?.title || 'the listing';
      const listingId = listing?.id;
      if (buyerEmail && listingId) {
        supabase.functions
          .invoke('send-connection-notification', {
            body: {
              type: 'approval_notification',
              recipientEmail: buyerEmail,
              recipientName: buyerName || buyerEmail,
              requesterName: buyerName || buyerEmail,
              requesterEmail: buyerEmail,
              listingTitle,
              listingId,
              requestId,
            },
          })
          .catch((emailErr) => {
            console.error('[approval-email] Failed to send connection approval email:', emailErr);
          });
      }

      // Phase 87: Insert persistent user_notification so buyer's bell shows approval
      if (user.id) {
        supabase
          .from('user_notifications')
          .insert({
            user_id: user.id,
            notification_type: 'request_approved',
            title: 'Connection Approved',
            message: `Your introduction request for "${listingTitle}" has been approved.`,
            connection_request_id: requestId || null,
            metadata: { listing_id: listingId },
          })
          .then(({ error: notifErr }) => {
            if (notifErr) console.error('[Phase 87] Failed to insert approval notification:', notifErr);
          });
      }

      // Auto-provision data_room_access so buyer can see documents immediately
      if (listing?.id && user.id) {
        const { data: existingAccess } = await supabase
          .from('data_room_access')
          .select('id')
          .eq('deal_id', listing.id)
          .eq('marketplace_user_id', user.id)
          .is('revoked_at', null)
          .maybeSingle();

        if (!existingAccess) {
          // Query firm agreement status directly from DB to avoid stale frontend state
          let feeAgreementSigned = hasFeeAgreement;
          if (!feeAgreementSigned && user.id) {
            const { data: freshFirmId } = await supabase.rpc('resolve_user_firm_id', { p_user_id: user.id });
            if (freshFirmId) {
              const { data: freshFirm } = await supabase
                .from('firm_agreements')
                .select('fee_agreement_status, fee_agreement_signed')
                .eq('id', freshFirmId)
                .maybeSingle();
              if (freshFirm) {
                feeAgreementSigned = freshFirm.fee_agreement_signed === true || freshFirm.fee_agreement_status === 'signed';
              }
            }
          }

          const { error: accessErr } = await supabase
            .from('data_room_access')
            .insert({
              deal_id: listing.id,
              marketplace_user_id: user.id,
              can_view_teaser: true,
              can_view_full_memo: feeAgreementSigned,
              can_view_data_room: feeAgreementSigned,
            });

          if (accessErr) {
            console.error('[data-room-access] Failed to auto-provision access:', accessErr);
          } else {
            // Invalidate access queries so admin UI reflects the new record
            queryClient.invalidateQueries({ queryKey: ['buyer-access', listing.id, user.id] });
            queryClient.invalidateQueries({ queryKey: ['data-room-access', listing.id] });
          }
        }
      }

      toast({ title: 'Request approved', description: 'Buyer has been notified.' });
    } catch (err) {
      toast({
        title: 'Action failed',
        description: err instanceof Error ? err.message : 'Could not complete the action.',
        variant: 'destructive',
      });
    }
  };

  const handleReject = async () => {
    if (!requestId || isRejecting) return;
    setIsRejecting(true);
    const note = rejectNote.trim();
    try {
      await updateStatus.mutateAsync({
        requestId,
        status: 'rejected',
        notes: note || undefined,
      });
      await sendMessage.mutateAsync({
        connection_request_id: requestId,
        body: note || 'Request declined.',
        sender_role: 'admin',
        message_type: 'decision',
      });

      // Send rejection email to buyer
      const buyerEmail = user.email;
      const buyerName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      const companyName = listing?.title || 'the listing';
      if (buyerEmail) {
        supabase.functions
          .invoke('notify-buyer-rejection', {
            body: {
              connectionRequestId: requestId,
              buyerEmail,
              buyerName: buyerName || buyerEmail,
              companyName,
            },
          })
          .catch((emailErr) => {
            console.error('[rejection-email] Failed to send rejection email:', emailErr);
          });
      }

      // Phase 87: Insert persistent user_notification so buyer's bell shows rejection
      if (user.id) {
        const rejListingTitle = listing?.title || 'the listing';
        supabase
          .from('user_notifications')
          .insert({
            user_id: user.id,
            notification_type: 'status_changed',
            title: 'Connection Update',
            message: `Your introduction request for "${rejListingTitle}" was not approved at this time.`,
            connection_request_id: requestId || null,
            metadata: { listing_id: listing?.id },
          })
          .then(({ error: notifErr }) => {
            if (notifErr) console.error('[Phase 87] Failed to insert rejection notification:', notifErr);
          });
      }

      setShowRejectDialog(false);
      setRejectNote('');
      toast({ title: 'Request declined', description: 'Buyer has been notified via email.' });
    } catch (err) {
      toast({
        title: 'Action failed',
        description: err instanceof Error ? err.message : 'Could not complete the action.',
        variant: 'destructive',
      });
    } finally {
      setIsRejecting(false);
    }
  };

  const handleResetToPending = async () => {
    if (!requestId) return;
    try {
      await updateStatus.mutateAsync({ requestId, status: 'pending' });
      // Phase 94: Send a system message so both admin and buyer see the reversal
      await sendMessage.mutateAsync({
        connection_request_id: requestId,
        body: 'Status has been reverted to pending for further review.',
        sender_role: 'admin',
        message_type: 'decision',
      });
      // Insert clarifying user notification
      if (user.id) {
        const listingTitle = listing?.title || 'the listing';
        supabase
          .from('user_notifications')
          .insert({
            user_id: user.id,
            notification_type: 'status_changed',
            title: 'Request Under Review',
            message: `Your introduction request for "${listingTitle}" is back under review.`,
            connection_request_id: requestId,
            metadata: { listing_id: listing?.id },
          })
          .then(({ error: notifErr }) => {
            if (notifErr) console.error('[Phase 94] Failed to insert undo notification:', notifErr);
          });
      }
    } catch (err) {
      toast({
        title: 'Action failed',
        description: err instanceof Error ? err.message : 'Could not reset status.',
        variant: 'destructive',
      });
    }
  };

  // Phase 95: On Hold handler
  const handleOnHold = async () => {
    if (!requestId || updateStatus.isPending) return;
    try {
      await updateStatus.mutateAsync({ requestId, status: 'on_hold' });
      await sendMessage.mutateAsync({
        connection_request_id: requestId,
        body: 'This request has been placed on hold for further evaluation.',
        sender_role: 'admin',
        message_type: 'decision',
      });
    } catch (err) {
      toast({
        title: 'Action failed',
        description: err instanceof Error ? err.message : 'Could not place on hold.',
        variant: 'destructive',
      });
    }
  };

  // ─── Flag for Review ───

  const handleFlagForReview = async (assignedToId: string) => {
    if (!requestId) return;
    setFlagPopoverOpen(false);

    const assignedAdmin = adminProfiles?.[assignedToId];
    void assignedAdmin;
    const buyerLabel = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Buyer';
    const dealLabel = listing?.title || 'a deal';

    // Flag the connection request
    flagMutation.mutate({
      requestId,
      flagged: true,
      assignedTo: assignedToId,
    });

    // Create a task in the daily task dashboard for the assigned team member
    try {
      await addTask.mutateAsync({
        title: `Review flagged request: ${buyerLabel} → ${dealLabel}`,
        description: `A connection request from ${buyerLabel} for "${dealLabel}" has been flagged for your review. Please open the connection request in the admin dashboard to take action.`,
        assignee_id: assignedToId,
        task_type: 'follow_up_with_buyer',
        due_date: new Date().toISOString().split('T')[0],
        deal_reference: listing?.title || null,
        deal_id: null,
        tags: [],
      });
    } catch {
      // Task creation is best-effort; the flag itself already succeeded via the mutation
    }
  };

  const handleUnflag = () => {
    if (!requestId) return;
    flagMutation.mutate({ requestId, flagged: false });
  };

  // ─── Document Access ───

  const requestAccessToggle = (field: AccessField, newValue: boolean) => {
    if (!listing?.id) return;
    if (
      (field === 'can_view_full_memo' || field === 'can_view_data_room') &&
      newValue &&
      !hasFeeAgreement
    ) {
      toast({
        title: 'Fee Agreement Required',
        description:
          'A signed fee agreement is required before releasing the full memo or data room access.',
        variant: 'destructive',
      });
      return;
    }
    const labels: Record<string, string> = {
      can_view_teaser: 'Teaser',
      can_view_full_memo: 'Full Memo',
      can_view_data_room: 'Data Room',
    };
    setPendingAccessToggle({ field, newValue, label: labels[field] });
  };

  const confirmAccessToggle = () => {
    if (!pendingAccessToggle || !listing?.id) return;
    const { field, newValue } = pendingAccessToggle;
    updateAccess.mutate(
      {
        deal_id: listing.id,
        marketplace_user_id: user.id,
        can_view_teaser:
          field === 'can_view_teaser' ? newValue : (accessRecord?.can_view_teaser ?? false),
        can_view_full_memo:
          field === 'can_view_full_memo' ? newValue : (accessRecord?.can_view_full_memo ?? false),
        can_view_data_room:
          field === 'can_view_data_room' ? newValue : (accessRecord?.can_view_data_room ?? false),
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ['buyer-access', listing?.id, user.id],
          });
        },
      },
    );
    setPendingAccessToggle(null);
  };

  const otherRequests = userRequests.filter((r) => r.id !== requestId);

  return {
    // Mutations / loading states
    updateStatus,
    updateAccess,
    flagMutation,
    sendMessage,

    // Derived data
    firmInfo,
    adminList,
    accessRecord: accessRecord as AccessRecord | null | undefined,
    hasFeeAgreement,
    hasNDA,
    ndaStatus,
    feeStatus,
    otherRequests,

    // Dialog / popover state
    showRejectDialog,
    setShowRejectDialog,
    isRejecting,
    rejectNote,
    setRejectNote,
    sendAgreementOpen,
    setSendAgreementOpen,
    sendAgreementType,
    setSendAgreementType,
    activeTab,
    setActiveTab,
    pendingAccessToggle,
    setPendingAccessToggle,
    flagPopoverOpen,
    setFlagPopoverOpen,

    // Handlers
    handleAccept,
    handleReject,
    handleResetToPending,
    handleOnHold,
    handleFlagForReview,
    handleUnflag,
    requestAccessToggle,
    confirmAccessToggle,
  };
}
