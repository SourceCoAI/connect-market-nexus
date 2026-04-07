import { useState, useEffect, useMemo } from 'react';
import { useRoleManagement } from '@/hooks/permissions/useRoleManagement';
import { usePermissions, type AppRole } from '@/hooks/permissions/usePermissions';
import { TeamMemberCard } from '@/components/admin/permissions/TeamMemberCard';
import { PermissionAuditLog } from '@/components/admin/permissions/PermissionAuditLog';
import { InviteTeamMemberDialog } from '@/components/admin/permissions/InviteTeamMemberDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Search, Users, History, Loader2 } from 'lucide-react';
import type { User, BuyerType } from '@/types';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';

const InternalTeamPage = () => {
  const { allUserRoles, isLoadingRoles, auditLog, isLoadingAudit } = useRoleManagement();
  const { isAdmin, canInviteTeamMembers } = usePermissions();
  const [search, setSearch] = useState('');

  // Register AI Command Center context
  const { setPageContext } = useAICommandCenterContext();
  useEffect(() => {
    setPageContext({ page: 'team', entity_type: 'team' });
  }, [setPageContext]);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  // Filter to only show internal team members (owner, admin, moderator)
  const teamMembers = useMemo(() => {
    if (!allUserRoles) return [];
    return allUserRoles.filter((u) => ['owner', 'admin', 'moderator'].includes(u.role));
  }, [allUserRoles]);

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return teamMembers;
    const q = search.toLowerCase();
    return teamMembers.filter(
      (m) =>
        (m.user_email || '').toLowerCase().includes(q) ||
        (m.user_first_name || '').toLowerCase().includes(q) ||
        (m.user_last_name || '').toLowerCase().includes(q),
    );
  }, [teamMembers, search]);

  // Convert role data to User-compatible shape for TeamMemberCard
  const toUserShape = (member: {
    user_id: string;
    user_email?: string | null;
    user_first_name?: string | null;
    user_last_name?: string | null;
    granted_at?: string | null;
    role: string;
  }): User => {
    const firstName = member.user_first_name || '';
    const lastName = member.user_last_name || '';
    const now = member.granted_at || new Date().toISOString();
    return {
      id: member.user_id,
      email: member.user_email || '',
      first_name: firstName,
      last_name: lastName,
      company: '',
      website: '',
      phone_number: '',
      role: 'admin' as const,
      buyer_type: 'individual' as const,
      created_at: now,
      updated_at: now,
      is_admin: true,
      approval_status: 'approved' as const,
      email_verified: true,
      get firstName() {
        return firstName;
      },
      get lastName() {
        return lastName;
      },
      get phoneNumber() {
        return '';
      },
      get isAdmin() {
        return true;
      },
      get buyerType(): BuyerType {
        return 'individual';
      },
      get emailVerified() {
        return true;
      },
      get isApproved() {
        return true;
      },
      get createdAt() {
        return now;
      },
      get updatedAt() {
        return now;
      },
    };
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="px-4 md:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Internal Team</h1>
              <p className="text-sm text-muted-foreground">
                Manage SourceCo team members and their admin panel access.
              </p>
            </div>
            {canInviteTeamMembers && (
              <Button onClick={() => setInviteDialogOpen(true)} size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Team Member
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-8">
        <Tabs defaultValue="active" className="space-y-6">
          <TabsList>
            <TabsTrigger value="active" className="gap-2">
              <Users className="h-3.5 w-3.5" />
              Active Team
              {teamMembers.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {teamMembers.length}
                </Badge>
              )}
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="audit" className="gap-2">
                <History className="h-3.5 w-3.5" />
                Audit Log
              </TabsTrigger>
            )}
          </TabsList>

          {/* Active Team Tab */}
          <TabsContent value="active" className="space-y-4">
            {/* Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Team List */}
            {isLoadingRoles ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{search ? 'No team members match your search.' : 'No team members found.'}</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {filteredMembers.map((member) => (
                  <TeamMemberCard
                    key={member.user_id}
                    user={toUserShape(member)}
                    role={member.role as AppRole}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Audit Log Tab */}
          {isAdmin && (
            <TabsContent value="audit">
              {isLoadingAudit ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <PermissionAuditLog auditLog={auditLog || []} />
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Invite Dialog */}
      <InviteTeamMemberDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} />
    </div>
  );
};

export default InternalTeamPage;
