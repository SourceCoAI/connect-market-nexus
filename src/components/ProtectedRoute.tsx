import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { meetsRole, type TeamRole } from '@/config/role-permissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireApproved?: boolean;
  requireRole?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAdmin = false,
  requireApproved = false,
  requireRole,
}) => {
  const { user, isLoading, isAdmin, authChecked, teamRole } = useAuth();
  const location = useLocation();

  // Show nothing while auth state is loading to prevent flash of content
  if (isLoading || !authChecked) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Not authenticated — redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Buyer approval check
  if (requireApproved && user.approval_status !== 'approved') {
    return <Navigate to="/pending-approval" replace />;
  }

  // Admin check
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Team role check (e.g., requireRole="admin" or "owner")
  if (requireRole && !meetsRole(teamRole, requireRole as TeamRole)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
