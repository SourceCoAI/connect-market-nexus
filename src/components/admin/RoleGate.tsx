/**
 * RoleGate.tsx
 *
 * Inline role gate for admin sub-routes. Wraps a page element and
 * redirects to /unauthorized when the current user's team role is
 * below the required minimum.
 *
 * Usage (inside App.tsx):
 *   <Route path="settings/team" element={<RoleGate min="admin"><InternalTeamPage /></RoleGate>} />
 *
 * AUDIT REF: CTO Audit February 2026 — restored from dev bypass
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { meetsRole, type TeamRole } from '@/config/role-permissions';

interface RoleGateProps {
  children: React.ReactNode;
  /** Minimum team role needed to render children. */
  min: TeamRole;
}

export function RoleGate({ children, min }: RoleGateProps) {
  const { teamRole, isLoading, authChecked, isAdmin } = useAuth();

  // While auth is still loading, show nothing to prevent flash redirect
  if (isLoading || !authChecked) return null;

  // Non-admin users have no team role — redirect immediately
  // Admin users whose role RPC hasn't resolved yet: teamRole is null briefly,
  // but isAdmin is already true from the profile. Wait for role to resolve.
  if (!isAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Admin user but role not yet resolved from RPC — wait
  if (teamRole === null) return null;

  if (!meetsRole(teamRole, min)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
