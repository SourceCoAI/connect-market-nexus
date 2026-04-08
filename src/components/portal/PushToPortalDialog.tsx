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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Send, FileText } from 'lucide-react';
import { usePortalOrganizations } from '@/hooks/portal/use-portal-organizations';
import { usePushDealToPortal, useCheckDuplicatePush } from '@/hooks/portal/use-portal-deals';
import { OrgStatusBadge } from '@/components/portal/PortalStatusBadge';
import type { PortalDealPriority } from '@/types/portal';

interface PushToPortalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  listingTitle?: string;
}

export function PushToPortalDialog({
  open,
  onOpenChange,
  listingId,
  listingTitle,
}: PushToPortalDialogProps) {
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [pushNote, setPushNote] = useState('');
  const [priority, setPriority] = useState<PortalDealPriority>('standard');
  const [includeDataRoom, setIncludeDataRoom] = useState(false);

  const { data: orgs, isLoading: orgsLoading } = usePortalOrganizations();
  const { data: duplicate } = useCheckDuplicatePush(selectedOrgId || undefined, listingId);
  const pushDeal = usePushDealToPortal();

  // Fetch existing data room access tokens for this listing
  const { data: dataRoomAccess } = useQuery({
    queryKey: ['data-room-access-for-push', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_data_room_access')
        .select('id, access_token, buyer_name, buyer_firm, is_active')
        .eq('deal_id', listingId)
        .eq('is_active', true)
        .order('granted_at', { ascending: false })
        .limit(10);

      if (error) return [];
      return data || [];
    },
    enabled: open && includeDataRoom,
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

  const handleSubmit = async () => {
    if (!selectedOrgId) return;

    await pushDeal.mutateAsync({
      portal_org_id: selectedOrgId,
      listing_id: listingId,
      push_note: pushNote.trim() || undefined,
      priority,
      data_room_access_token: includeDataRoom ? (matchingToken?.access_token || undefined) : undefined,
    });

    setSelectedOrgId('');
    setPushNote('');
    setPriority('standard');
    setIncludeDataRoom(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Push to Client Portal
          </DialogTitle>
          {listingTitle && (
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {listingTitle}
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
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
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

          {duplicate && (
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
            <Select value={priority} onValueChange={(v) => setPriority(v as PortalDealPriority)}>
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
            />
          </div>

          {/* Data room toggle */}
          <div className="flex items-center gap-3 p-3 border rounded-lg">
            <input
              type="checkbox"
              checked={includeDataRoom}
              onChange={(e) => setIncludeDataRoom(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
              id="include-data-room"
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pushDeal.isPending || !selectedOrgId || !!duplicate}
          >
            {pushDeal.isPending ? 'Pushing...' : 'Push Deal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
