import { User, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { User as AuthUser } from '@/types';
import MobileNavItems from './MobileNavItems';
import { useAuth } from '@/contexts/AuthContext';

interface UserMenuProps {
  user: AuthUser;
  isAdmin: boolean;
  isMobile: boolean;
  handleLogout: () => void;
  onNavigateToAdmin: () => void;
}

const UserMenu = ({
  user,
  isAdmin,
  isMobile,
  handleLogout: _handleLogout,
  onNavigateToAdmin,
}: UserMenuProps) => {
  const { logout } = useAuth();

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
  };

  const handleSimpleLogout = async () => {
    try {
      // Debug log removed
      await logout();
    } catch (error) {
      console.error('Logout error in UserMenu:', error);
      // Force navigation on error
      window.location.href = '/login';
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarFallback>{getInitials(user?.first_name, user?.last_name)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isMobile && (
          <>
            <MobileNavItems
              isAdmin={isAdmin}
              isApproved={user.approval_status === 'approved'}
              onNavigateToAdmin={onNavigateToAdmin}
            />
            {user.approval_status === 'approved' && <DropdownMenuSeparator />}
          </>
        )}

        <DropdownMenuItem asChild>
          <Link to="/profile">
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSimpleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserMenu;
