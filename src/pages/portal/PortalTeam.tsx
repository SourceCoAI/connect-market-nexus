import { useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { ChevronLeft, Plus, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useMyPortalUser, usePortalUsers, useInvitePortalUser } from '@/hooks/portal/use-portal-users';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function PortalTeam() {
  const { slug } = useParams<{ slug: string }>();
  const { data: portalUser, isLoading: userLoading } = useMyPortalUser(slug);
  const { data: teamMembers } = usePortalUsers(portalUser?.portal_org?.id);
  const invite = useInvitePortalUser();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  if (userLoading) return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  if (!portalUser) return <Navigate to="/" replace />;

  // Only portal admins can manage team
  if (portalUser.role !== 'admin') {
    return <Navigate to={`/portal/${slug}`} replace />;
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !email.trim()) return;
    if (!EMAIL_REGEX.test(email.trim())) return;

    await invite.mutateAsync({
      portal_org_id: portalUser.portal_org.id,
      portal_slug: slug || '',
      first_name: firstName.trim(),
      last_name: lastName.trim() || undefined,
      email: email.trim().toLowerCase(),
      role: 'primary_contact',
    });

    setFirstName('');
    setLastName('');
    setEmail('');
    setInviteOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link
            to={`/portal/${slug}`}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
          >
            <ChevronLeft className="h-3 w-3" />
            Dashboard
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Team Members</h1>
              <p className="text-muted-foreground text-sm">
                Manage who has access to {portalUser.portal_org.name}.
              </p>
            </div>
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Invite
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {(teamMembers || []).map((member) => (
            <Card key={member.id}>
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs capitalize">
                    {member.role.replace('_', ' ')}
                  </Badge>
                  {member.is_active ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 text-xs">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-gray-50 text-gray-500 text-xs">Inactive</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {(!teamMembers || teamMembers.length === 0) && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No team members yet.
              </CardContent>
            </Card>
          )}
        </div>

        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Alex" required />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex@company.com" required />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={invite.isPending || !firstName.trim() || !email.trim()}>
                  {invite.isPending ? 'Inviting...' : 'Send Invite'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
