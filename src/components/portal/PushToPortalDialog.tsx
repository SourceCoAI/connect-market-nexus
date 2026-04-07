import { useState } from 'react';
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
import { AlertTriangle, Send } from 'lucide-react';
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

  const { data: orgs, isLoading: orgsLoading } = usePortalOrganizations();
  const { data: duplicate } = useCheckDuplicatePush(selectedOrgId || undefined, listingId);
  const pushDeal = usePushDealToPortal();

  const activeOrgs = (orgs || []).filter((o) => o.status === 'active');

  const handleSubmit = async () => {
    if (!selectedOrgId) return;

    await pushDeal.mutateAsync({
      portal_org_id: selectedOrgId,
      listing_id: listingId,
      push_note: pushNote.trim() || undefined,
      priority,
    });

    setSelectedOrgId('');
    setPushNote('');
    setPriority('standard');
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
                        <OrgStatusBadge status={org.status} />
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
            <Label>Note to Client (optional)</Label>
            <Textarea
              value={pushNote}
              onChange={(e) => setPushNote(e.target.value)}
              placeholder="This aligns with your services thesis. Strong recurring revenue and owner willing to stay on."
              rows={3}
            />
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
