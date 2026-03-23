import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User } from '@/types';
import { MoreHorizontal, UserCheck, Trash2, Mail, Shield } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { usePermissions } from '@/hooks/permissions/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { useRoleManagement } from '@/hooks/permissions/useRoleManagement';
import { RoleBadge } from '../permissions/RoleBadge';
import { RoleSelector } from '../permissions/RoleSelector';
import { AppRole } from '@/hooks/permissions/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UserActionButtonsProps {
  user: User;
  onApprove: (user: User) => void;
  onMakeAdmin: (user: User) => void;
  onRevokeAdmin: (user: User) => void;
  onDelete: (user: User) => void;
  isLoading: boolean;
}

// Component for user action buttons
export function UserActionButtons({
  user,
  onApprove,
  onDelete,
  isLoading,
}: UserActionButtonsProps) {
  const { toast } = useToast();
  const { canManagePermissions } = usePermissions();
  const { user: currentUser } = useAuth();
  const { allUserRoles } = useRoleManagement();
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);

  const getUserRole = (userId: string): AppRole => {
    return (allUserRoles?.find((ur) => ur.user_id === userId)?.role as AppRole) || 'user';
  };

  const currentUserRole = getUserRole(user.id);

  const handleSendPasswordReset = async () => {
    try {
      const { error } = await supabase.functions.invoke('password-reset', {
        body: { action: 'request', email: user.email },
      });
      if (error) throw error;
      toast({
        title: 'Password reset initiated',
        description: 'If the email exists, the user will receive a reset link.',
      });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Failed to send reset',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    }
  };

  return (
    <>
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={isLoading}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>User Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />

            {user.approval_status === 'pending' && (
              <DropdownMenuItem onClick={() => onApprove(user)} className="text-green-600">
                <UserCheck className="h-4 w-4 mr-2" />
                Approve User
              </DropdownMenuItem>
            )}

            {user.approval_status === 'rejected' && (
              <DropdownMenuItem onClick={() => onApprove(user)} className="text-green-600">
                <UserCheck className="h-4 w-4 mr-2" />
                Approve User
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            {canManagePermissions && (
              <DropdownMenuItem onClick={() => setIsRoleDialogOpen(true)} className="text-blue-600">
                <Shield className="h-4 w-4 mr-2" />
                Change Role
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSendPasswordReset}>
              <Mail className="h-4 w-4 mr-2" />
              Send password reset
            </DropdownMenuItem>

            {/* Only owner can delete users (not even self) */}
            {canManagePermissions && user.id !== currentUser?.id && (
              <DropdownMenuItem
                onClick={() => {
                  if (
                    window.confirm(
                      `Are you sure you want to permanently delete ${user.email}? This action cannot be undone.`,
                    )
                  ) {
                    onDelete(user);
                  }
                }}
                className="text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete User
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage User Role</DialogTitle>
            <DialogDescription>
              Change the role for <strong>{user.email}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Current Role</Label>
              <div>
                <RoleBadge role={currentUserRole} showTooltip={true} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Select New Role</Label>
              <RoleSelector
                userId={user.id}
                currentRole={currentUserRole}
                userEmail={user.email}
                disabled={false}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
