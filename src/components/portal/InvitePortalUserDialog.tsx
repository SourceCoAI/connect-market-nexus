import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useInvitePortalUser } from '@/hooks/portal/use-portal-users';
import type { PortalUserRole } from '@/types/portal';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface InvitePortalUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portalOrgId: string;
  portalSlug?: string;
  buyerId?: string;
}

export function InvitePortalUserDialog({
  open,
  onOpenChange,
  portalOrgId,
  portalSlug,
  buyerId,
}: InvitePortalUserDialogProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PortalUserRole>('primary_contact');

  const invite = useInvitePortalUser();

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setRole('primary_contact');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !email.trim()) return;
    if (!EMAIL_REGEX.test(email.trim())) {
      toast.error('Please enter a valid email address');
      return;
    }

    await invite.mutateAsync({
      portal_org_id: portalOrgId,
      portal_slug: portalSlug || '',
      first_name: firstName.trim(),
      last_name: lastName.trim() || undefined,
      email: email.trim().toLowerCase(),
      role,
      buyer_id: buyerId,
    });

    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Portal User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user-first-name">First Name *</Label>
              <Input
                id="user-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Lindsay"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-last-name">Last Name</Label>
              <Input
                id="user-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Chen"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-email">Email *</Label>
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="lindsay@alpine.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as PortalUserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="primary_contact">Primary Contact</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="viewer">Viewer (view-only)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Primary contacts can respond to deals. Viewers can only browse.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending || !firstName.trim() || !email.trim()}>
              {invite.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {invite.isPending ? 'Sending...' : 'Send Invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
