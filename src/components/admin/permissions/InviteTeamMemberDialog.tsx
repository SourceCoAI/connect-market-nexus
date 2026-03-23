import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, UserPlus, Shield, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import type { AppRole } from '@/hooks/permissions/usePermissions';

interface InviteTeamMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteTeamMemberDialog({ open, onOpenChange }: InviteTeamMemberDialogProps) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<'admin' | 'moderator'>('moderator');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setEmail('');
      setFirstName('');
      setLastName('');
      setRole('moderator');
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!isValidEmail) return;

    setIsSubmitting(true);
    try {
      // Check if user already exists
      const { data: existingProfile, error: existingProfileError } = await supabase
        .from('profiles')
        .select('id, email, is_admin')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();
      if (existingProfileError) throw existingProfileError;

      if (existingProfile) {
        // User exists — promote them to the selected role
        const { error } = await supabase.rpc('change_user_role', {
          _target_user_id: existingProfile.id,
          _new_role: role as AppRole,
          _reason: `Invited to team as ${role === 'admin' ? 'Admin' : 'Team Member'}`,
        });

        if (error) throw error;

        toast({
          title: 'Team member added',
          description: `${email} has been promoted to ${role === 'admin' ? 'Admin' : 'Team Member'}.`,
        });
      } else {
        // User doesn't exist — call invite edge function
        const { data, error } = await supabase.functions.invoke('invite-team-member', {
          body: {
            email: email.toLowerCase().trim(),
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            role,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        toast({
          title: 'Invitation sent',
          description: `An invite has been sent to ${email}.`,
        });
      }

      // Reset form and close
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
      queryClient.invalidateQueries({ queryKey: ['permission-audit-log'] });
      setEmail('');
      setFirstName('');
      setLastName('');
      setRole('moderator');
      onOpenChange(false);
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error
            ? String((error as { message: string }).message)
            : 'Something went wrong.';
      console.error('[InviteTeamMember] Error:', error);
      toast({
        title: 'Failed to invite',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Add a new member to the SourceCo admin team. If they already have an account, their role
            will be updated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="name@sourcecodeals.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="invite-first">First Name</Label>
              <Input
                id="invite-first"
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-last">Last Name</Label>
              <Input
                id="invite-last"
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <RadioGroup
              value={role}
              onValueChange={(v) => setRole(v as 'admin' | 'moderator')}
              className="space-y-2"
            >
              <div className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="moderator" id="role-team" className="mt-0.5" />
                <label htmlFor="role-team" className="cursor-pointer flex-1">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">Team Member</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    View access to deals, buyers, and analytics. Limited write actions.
                  </p>
                </label>
              </div>
              <div className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="admin" id="role-admin" className="mt-0.5" />
                <label htmlFor="role-admin" className="cursor-pointer flex-1">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Admin</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Full access to all pages and all actions.
                  </p>
                </label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValidEmail || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Inviting...
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
