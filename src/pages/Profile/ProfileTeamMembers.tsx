import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Mail, UserPlus } from 'lucide-react';

interface TeamMember {
  id: string;
  is_primary_contact: boolean | null;
  member_type: string;
  user_id: string | null;
  lead_name: string | null;
  lead_email: string | null;
  profile?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

function useTeamMembers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['team-members', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // First get the current user's firm_id
      const { data: membership } = await (
        supabase.from('firm_members' as never) as unknown as ReturnType<typeof supabase.from>
      )
        .select('firm_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      const membershipData = membership as unknown as { firm_id: string } | null;
      if (!membershipData?.firm_id) return [];

      // Then get all members of that firm, joined with profiles
      const { data: members, error } = await supabase
        .from('firm_members')
        .select(
          `
          id,
          is_primary_contact,
          member_type,
          user_id,
          lead_name,
          lead_email,
          profiles:user_id (
            first_name,
            last_name,
            email
          )
        `,
        )
        .eq('firm_id', membershipData.firm_id)
        .order('is_primary_contact', { ascending: false });

      if (error) throw error;
      return (members || []) as unknown as TeamMember[];
    },
    enabled: !!user?.id,
  });
}

export function ProfileTeamMembers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: members, isLoading } = useTeamMembers();
  const [inviteEmail, setInviteEmail] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !user) return;

    setIsSending(true);
    try {
      const { OZ_ADMIN_ID } = await import('@/constants');
      const userName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;

      await supabase.functions.invoke('notify-admin-document-question', {
        body: {
          admin_id: OZ_ADMIN_ID,
          user_id: user.id,
          document_type: 'Team Member Invite Request',
          question: `${userName} (${user.email}) requests adding ${inviteEmail.trim()} to their firm.`,
        },
      });

      toast({
        title: 'Invite request sent',
        description: 'Our team will add them within 1 business day.',
      });
      setInviteEmail('');
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Failed to send invite',
        description: (error as Error).message || 'Something went wrong. Please try again.',
      });
    } finally {
      setIsSending(false);
    }
  };

  const getMemberDisplayName = (member: TeamMember): string => {
    if (member.profile?.first_name || member.profile?.last_name) {
      return [member.profile.first_name, member.profile.last_name].filter(Boolean).join(' ');
    }
    if (member.lead_name) return member.lead_name;
    return 'Unknown Member';
  };

  const getMemberEmail = (member: TeamMember): string | null => {
    return member.profile?.email || member.lead_email || null;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members
          </CardTitle>
          <CardDescription>
            Members of your firm who can access deals and conversations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !members || members.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No team members found. You may not be associated with a firm yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{getMemberDisplayName(member)}</span>
                    {getMemberEmail(member) && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {getMemberEmail(member)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {member.is_primary_contact && (
                      <Badge variant="secondary">Primary Contact</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite a Team Member
          </CardTitle>
          <CardDescription>
            Send a request to add a new member to your firm. Our team will process it within 1
            business day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={isSending || !inviteEmail.trim()} className="w-full sm:w-auto">
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending...
                </>
              ) : (
                'Send Invite'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
