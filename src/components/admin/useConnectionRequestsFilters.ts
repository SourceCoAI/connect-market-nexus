/**
 * useConnectionRequestsFilters.ts
 *
 * Filter, sort, selection, and bulk-action logic for the ConnectionRequestsTable.
 */
import { useState, useCallback } from "react";
import { AdminConnectionRequest } from "@/types/admin";
import { useUpdateConnectionRequestStatus } from "@/hooks/admin/use-connection-request-status";
import { useSendMessage } from "@/hooks/use-connection-messages";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function useConnectionRequestsFilters(
  requests: AdminConnectionRequest[],
  selectedSources: string[],
) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkRejectDialog, setShowBulkRejectDialog] = useState(false);
  const [bulkRejectNote, setBulkRejectNote] = useState("");
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const updateStatus = useUpdateConnectionRequestStatus();
  const sendMessage = useSendMessage();
  const { toast } = useToast();

  // Filter requests by selected sources, then by flagged status
  const sourceFilteredRequests =
    selectedSources.length > 0
      ? requests.filter((req) => selectedSources.includes(req.source || "marketplace"))
      : requests;

  const filteredRequests = showFlaggedOnly
    ? sourceFilteredRequests.filter((req) => req.flagged_for_review)
    : sourceFilteredRequests;

  const flaggedCount = requests.filter((req) => req.flagged_for_review).length;

  const toggleExpanded = useCallback(
    (requestId: string) => {
      const newExpanded = new Set(expandedRows);
      if (newExpanded.has(requestId)) {
        newExpanded.delete(requestId);
      } else {
        newExpanded.add(requestId);
      }
      setExpandedRows(newExpanded);
    },
    [expandedRows],
  );

  const toggleSelection = useCallback(
    (requestId: string, checked: boolean) => {
      const next = new Set(selectedIds);
      if (checked) {
        next.add(requestId);
      } else {
        next.delete(requestId);
      }
      setSelectedIds(next);
    },
    [selectedIds],
  );

  const selectAll = useCallback(() => {
    if (selectedIds.size === filteredRequests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRequests.map((r) => r.id)));
    }
  }, [selectedIds.size, filteredRequests]);

  const handleBulkAction = useCallback(
    async (status: "approved" | "rejected", notes?: string) => {
      const ids = Array.from(selectedIds);
      let successCount = 0;
      let errorCount = 0;

      for (const id of ids) {
        try {
          await updateStatus.mutateAsync({ requestId: id, status, notes });

          // Find the request to get buyer/listing info for emails & notifications
          const req = requests.find((r) => r.id === id);
          if (!req) { successCount++; continue; }

          const buyerName = req.user
            ? `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim()
            : '';
          const listingTitle = req.listing?.title || 'the listing';

          // Send system message in deal thread
          try {
            await sendMessage.mutateAsync({
              connection_request_id: id,
              body: status === 'approved'
                ? `Your introduction to ${listingTitle} has been approved. You now have access to the deal overview and supporting documents in the data room. Our team will facilitate the introduction to the business owner — expect to hear from us within one business day. If you have any questions in the meantime, reply here.`
                : notes || 'Request declined.',
              sender_role: 'admin',
              message_type: 'decision',
            });
          } catch { /* best-effort */ }

          // Send email notification
          const buyerEmail = req.user?.email;
          if (buyerEmail) {
            if (status === 'approved') {
              supabase.functions
                .invoke('send-connection-notification', {
                  body: {
                    type: 'approval_notification',
                    recipientEmail: buyerEmail,
                    recipientName: buyerName || buyerEmail,
                    requesterName: buyerName || buyerEmail,
                    requesterEmail: buyerEmail,
                    listingTitle,
                    listingId: req.listing?.id,
                    requestId: id,
                  },
                })
                .catch(() => {});
            } else {
              supabase.functions
                .invoke('notify-buyer-rejection', {
                  body: {
                    connectionRequestId: id,
                    buyerEmail,
                    buyerName: buyerName || buyerEmail,
                    companyName: listingTitle,
                  },
                })
                .catch(() => {});
            }
          }

          // Insert persistent user_notification
          if (req.user?.id) {
            supabase
              .from('user_notifications')
              .insert({
                user_id: req.user.id,
                notification_type: status === 'approved' ? 'request_approved' : 'status_changed',
                title: status === 'approved' ? 'Connection Approved' : 'Connection Update',
                message: status === 'approved'
                  ? `Your introduction request for "${listingTitle}" has been approved.`
                  : `Your introduction request for "${listingTitle}" was not approved at this time.`,
                connection_request_id: id,
                metadata: { listing_id: req.listing?.id },
              })
              .then(() => {});
          }

          successCount++;
        } catch {
          errorCount++;
        }
      }

      setSelectedIds(new Set());
      setShowBulkRejectDialog(false);
      setBulkRejectNote("");

      const label = status === "approved" ? "approved" : "rejected";
      toast({
        title: `Bulk ${label}`,
        description: `${successCount} request${successCount !== 1 ? "s" : ""} ${label}${errorCount > 0 ? `, ${errorCount} failed` : ""}.`,
      });
    },
    [selectedIds, requests, updateStatus, sendMessage, toast],
  );

  const allSelected =
    selectedIds.size === filteredRequests.length && filteredRequests.length > 0;
  const someSelected = selectedIds.size > 0;

  return {
    // Expansion
    expandedRows,
    toggleExpanded,
    // Selection
    selectedIds,
    toggleSelection,
    selectAll,
    allSelected,
    someSelected,
    setSelectedIds,
    // Filtering
    filteredRequests,
    flaggedCount,
    showFlaggedOnly,
    setShowFlaggedOnly,
    // Bulk actions
    showBulkRejectDialog,
    setShowBulkRejectDialog,
    bulkRejectNote,
    setBulkRejectNote,
    handleBulkAction,
    updateStatusIsPending: updateStatus.isPending,
  };
}
