import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AppRole = 'owner' | 'admin' | 'moderator' | 'viewer';

/** Display label for each role. 'moderator' shows as 'Team Member' everywhere. */
export const ROLE_DISPLAY_LABELS: Record<AppRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  moderator: 'Team Member',
  viewer: 'Viewer',
};

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  granted_by: string | null;
  granted_at: string;
  reason: string | null;
}

export const usePermissions = () => {
  const { user } = useAuth();

  const { data: userRole, isLoading } = useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // Use get_my_role() which has explicit GRANT EXECUTE to authenticated,
      // unlike get_user_role() which may lack the grant and silently fail.
      const { data, error } = await supabase.rpc('get_my_role');

      if (error) {
        console.error('Error fetching user role:', error);
        return null;
      }

      return data as AppRole | null;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  const isOwner = userRole === 'owner';
  const isAdmin = userRole === 'admin' || isOwner;
  const isTeamMember = userRole === 'moderator';
  /** True for anyone on the internal team (owner, admin, or team member/moderator) */
  const isInternalTeam = isAdmin || isTeamMember;

  const roleHierarchy: Record<AppRole, number> = {
    owner: 4,
    admin: 3,
    moderator: 2,
    viewer: 1,
  };

  const checkPermission = (requiredRole: AppRole): boolean => {
    if (!userRole) return false;
    return (roleHierarchy[userRole] || 0) >= (roleHierarchy[requiredRole] || 0);
  };

  const canManagePermissions = isOwner;

  // Role-based capability checks
  const canEditDeals = isAdmin;
  const canApproveUsers = isAdmin;
  const canSendAgreements = isAdmin;
  const canManageConnectionRequests = isAdmin;
  const canAccessSettings = isAdmin;
  const canExportData = isAdmin;
  const canInviteTeamMembers = isAdmin;
  const canEditBuyers = isAdmin;
  const canManageUniverses = isAdmin;
  const canAccessDataRecovery = isAdmin;

  return {
    userRole,
    isOwner,
    isAdmin,
    isTeamMember,
    isInternalTeam,
    isLoading,
    checkPermission,
    canManagePermissions,
    // Capability checks
    canEditDeals,
    canApproveUsers,
    canSendAgreements,
    canManageConnectionRequests,
    canAccessSettings,
    canExportData,
    canInviteTeamMembers,
    canEditBuyers,
    canManageUniverses,
    canAccessDataRecovery,
  };
};
