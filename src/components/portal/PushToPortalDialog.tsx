import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Send, FileText, Loader2 } from 'lucide-react';
import { usePortalOrganizations } from '@/hooks/portal/use-portal-organizations';
import { usePushDealToPortal, useCheckDuplicatePush } from '@/hooks/portal/use-portal-deals';

import type { PortalDealPriority } from '@/types/portal';

interface PushToPortalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Single listing (detail page usage) */
  listingId?: string;
  listingTitle?: string;
  /** Multiple listings (bulk bar usage) */
  listingIds?: string[];
}

export function PushToPortalDialog({
  open,
  onOpenChange,
  listingId,
  listingTitle,
  listingIds,
}: PushToPortalDialogProps) {
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [pushNote, setPushNote] = useState('');
  const [priority, setPriority] = useState<PortalDealPriority>('standard');
  const [includeDataRoom, setIncludeDataRoom] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null);

  const isBulk = !!(listingIds && listingIds.length > 0);
  const effectiveIds = isBulk ? listingIds : listingId ? [listingId] : [];

  const { data: orgs, isLoading: orgsLoading } = usePortalOrganizations();
  // Only check duplicate for single-deal mode
  const { data: duplicate } = useCheckDuplicatePush(
    !isBulk ? (selectedOrgId || undefined) : undefined,
    !isBulk ? listingId : undefined,
  );
  const pushDeal = usePushDealToPortal();

  // Fetch existing data room access tokens for this listing (single mode only)
  const { data: dataRoomAccess } = useQuery({
    queryKey: ['data-room-access-for-push', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_data_room_access')
        .select('id, access_token, buyer_name, buyer_firm, is_active')
        .eq('deal_id', listingId!)
        .eq('is_active', true)
        .order('granted_at', { ascending: false })
        .limit(10);

      if (error) return [];
      return data || [];
    },
    enabled: open && includeDataRoom && !isBulk && !!listingId,
  });

  const activeOrgs = (orgs || []).filter((o) => o.status === 'active');

  // Auto-select matching data room token based on selected portal org
  const selectedOrg = activeOrgs.find((o) => o.id === selectedOrgId);
  const matchingToken = dataRoomAccess?.find(
    (a) => selectedOrg && (
      a.buyer_name?.toLowerCase().includes(selectedOrg.name.toLowerCase()) ||
      a.buyer_firm?.toLowerCase().includes(selectedOrg.name.toLowerCase())
    )
  );

  const resetForm = () => {
    setSelectedOrgId('');
    setPushNote('');
    setPriority('standard');
    setIncludeDataRoom(false);
    setBulkProgress(null);
  };

  const handleSubmit = async () => {
    if (!selectedOrgId || effectiveIds.length === 0) return;

    if (isBulk) {
      // Bulk push: iterate over all listing IDs
      const errors: string[] = [];
      const total = effectiveIds.length;
      setBulkProgress({ done: 0, total, errors: [] });

      for (let i = 0; i < total; i++) {
        try {
          await pushDeal.mutateAsync({
            portal_org_id: selectedOrgId,
            listing_id: effectiveIds[i],
            push_note: pushNote.trim() || undefined,
            priority,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`Deal ${i + 1}: ${msg}`);
        }
        setBulkProgress({ done: i + 1, total, errors: [...errors] });
      }

      if (errors.length === 0) {
        resetForm();
        onOpenChange(false);
      }
      // If there were errors, keep dialog open so user can see them
    } else {
      // Single deal push
      await pushDeal.mutateAsync({
        portal_org_id: selectedOrgId,
        listing_id: effectiveIds[0],
        push_note: pushNote.trim() || undefined,
        priority,
        data_room_access_token: includeDataRoom ? (matchingToken?.access_token || undefined) : undefined,
      });

      resetForm();
      onOpenChange(false);
    }
  };

  const isPushing = pushDeal.isPending || (bulkProgress !== null && bulkProgress.done < bulkProgress.total);
  const bulkDone = bulkProgress && bulkProgress.done === bulkProgress.total;
  const bulkHasErrors = bulkProgress && bulkProgress.errors.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isPushing) { resetForm(); onOpenChange(v); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Push to Client Portal
          </DialogTitle>
          {!isBulk && listingTitle && (
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {listingTitle}
            </p>
          )}
          {isBulk && (
            <p className="text-sm text-muted-foreground mt-1">
              {effectiveIds.length} deal(s) selected
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Client Portal *</Label>
            {orgsLoading ? (
              <p className="text-sm text-muted-foreground">Loading portals...</p>
            ) : activeOrgs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active portals. Create one from Admin &gt; Client Portals first.
              </p>
            ) : (
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId} disabled={isPushing}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a portal client..." />
                </SelectTrigger>
                <SelectContent>
                  {activeOrgs.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      <div className="flex items-center gap-2">
                        <span>{org.name}</span>
                        {org.buyer?.buyer_type && (
                          <span className="text-xs text-muted-foreground">
                            ({org.buyer.buyer_type.replace(/_/g, ' ')})
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {!isBulk && duplicate && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This deal was already pushed to this portal on{' '}
                {new Date(duplicate.created_at).toLocaleDateString()}.
                Current status: <strong>{duplicate.status}</strong>.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as PortalDealPriority)} disabled={isPushing}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="high">High Priority</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Note to Client</Label>
            <Textarea
              value={pushNote}
              onChange={(e) => setPushNote(e.target.value)}
              placeholder="Add a few sentences about why this deal is relevant..."
              rows={3}
              disabled={isPushing}
            />
          </div>

          {/* Data room toggle (single deal only) */}
          {!isBulk && (
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <input
                type="checkbox"
                checked={includeDataRoom}
                onChange={(e) => setIncludeDataRoom(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
                id="include-data-room"
                disabled={isPushing}
              />
              <label htmlFor="include-data-room" className="flex items-center gap-2 text-sm cursor-pointer">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Include data room access
              </label>
              {includeDataRoom && matchingToken && (
                <span className="text-xs text-green-600 ml-auto">Token found</span>
              )}
              {includeDataRoom && !matchingToken && selectedOrgId && (
                <span className="text-xs text-muted-foreground ml-auto">No matching token</span>
              )}
            </div>
          )}

          {/* Bulk progress */}
          {bulkProgress && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                {!bulkDone && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>
                  {bulkProgress.done} / {bulkProgress.total} deals pushed
                </span>
              </div>
              {bulkProgress.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs space-y-1">
                    {bulkProgress.errors.map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }} disabled={isPushing}>
            {bulkDone && bulkHasErrors ? 'Close' : 'Cancel'}
          </Button>
          {!(bulkDone && !bulkHasErrors) && (
            <Button
              onClick={handleSubmit}
              disabled={isPushing || !selectedOrgId || (!isBulk && !!duplicate)}
            >
              {isPushing ? 'Pushing...' : isBulk ? `Push ${effectiveIds.length} Deal(s)` : 'Push Deal'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
