import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Skeleton } from '@/components/ui/skeleton';

import NavbarLogo from './navbar/NavbarLogo';
import DesktopNavItems from './navbar/DesktopNavItems';
import UserMenu from './navbar/UserMenu';
import AuthButtons from './navbar/AuthButtons';
import { AdminNotificationBell } from './admin/AdminNotificationBell';
import { BuyerNotificationBell } from './buyer/BuyerNotificationBell';

const Navbar = () => {
  const { user, isLoading, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Determine where the logo should navigate to
  const getLogoDestination = () => {
    if (!user) return '/login';
    if (user.approval_status !== 'approved') return '/pending-approval';
    return '/';
  };

  const handleNavigateToAdmin = () => navigate('/admin');

  return (
    <header className="bg-background border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <NavbarLogo destination={getLogoDestination()} />
          </div>

          <div className="flex items-center gap-2">
            {isLoading ? (
              <div className="flex items-center gap-4">
                {!isMobile && (
                  <>
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                  </>
                )}
                <Skeleton className="h-9 w-9 rounded-full" />
              </div>
            ) : user ? (
              <>
                {!isMobile && (
                  <DesktopNavItems
                    isAdmin={isAdmin}
                    isApproved={user.approval_status === 'approved'}
                    onNavigateToAdmin={handleNavigateToAdmin}
                  />
                )}

                {isAdmin ? <AdminNotificationBell /> : <BuyerNotificationBell />}

                <UserMenu
                  user={user}
                  isAdmin={isAdmin}
                  isMobile={isMobile}
                  handleLogout={handleLogout}
                  onNavigateToAdmin={handleNavigateToAdmin}
                />
              </>
            ) : (
              <AuthButtons />
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
