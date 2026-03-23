import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  LayoutDashboard,
  Users,
  Store,
  MessageSquare,
  ShoppingBag,
  Menu,
  X,
  Sparkles,
  GitBranch,
  Target,
  Building2,
  BarChart3,
  Settings,
  FileSignature,
  UserCog,
  Search,
  LogOut,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AdminNotificationBell } from './AdminNotificationBell';
import { useUnviewedDealSourcingCount } from '@/hooks/admin/use-unviewed-deal-sourcing';
import { useUnviewedConnectionRequests } from '@/hooks/admin/use-unviewed-connection-requests';
import { useUnviewedUsers } from '@/hooks/admin/use-unviewed-users';
import { useUnviewedOwnerLeads } from '@/hooks/admin/use-unviewed-owner-leads';

interface AdminNavbarProps {
  className?: string;
  onSearchClick?: () => void;
}

interface MobileNavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
  section?: string; // section header before this item
}

export function AdminNavbar({ className, onSearchClick }: AdminNavbarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { unviewedCount: unviewedDealSourcingCount } = useUnviewedDealSourcingCount();
  const { unviewedCount: unviewedConnectionRequestsCount } = useUnviewedConnectionRequests();
  const { unviewedCount: unviewedUsersCount } = useUnviewedUsers();
  const { unviewedCount: _unviewedOwnerLeadsCount } = useUnviewedOwnerLeads();

  const navItems: MobileNavItem[] = [
    {
      to: '/admin',
      label: 'Dashboard',
      icon: <LayoutDashboard className="h-4 w-4 mr-2" />,
      active: location.pathname === '/admin' || location.pathname === '/admin/dashboard',
    },
    // Deals
    {
      to: '/admin/deals',
      label: 'Active Deals',
      icon: <Building2 className="h-4 w-4 mr-2" />,
      active: location.pathname.startsWith('/admin/deals'),
      section: 'Deals',
    },
    {
      to: '/admin/deals/pipeline',
      label: 'Pipeline',
      icon: <GitBranch className="h-4 w-4 mr-2" />,
      active: location.pathname.startsWith('/admin/deals/pipeline'),
    },
    // Buyers
    {
      to: '/admin/buyers',
      label: 'All Buyers',
      icon: <Users className="h-4 w-4 mr-2" />,
      active: location.pathname.startsWith('/admin/buyers'),
      section: 'Buyers',
    },
    {
      to: '/admin/buyers/firm-agreements',
      label: 'Firm Agreements',
      icon: <FileSignature className="h-4 w-4 mr-2" />,
      active: location.pathname.startsWith('/admin/buyers/firm-agreements'),
    },
    {
      to: '/admin/buyers/deal-sourcing',
      label: 'Deal Sourcing',
      icon: <Sparkles className="h-4 w-4 mr-2" />,
      active: location.pathname.startsWith('/admin/buyers/deal-sourcing'),
      badge: unviewedDealSourcingCount,
    },
    // Marketplace
    {
      to: '/admin/marketplace/listings',
      label: 'Listings',
      icon: <Store className="h-4 w-4 mr-2" />,
      active: location.pathname.startsWith('/admin/marketplace/listings'),
      section: 'Marketplace',
    },
    {
      to: '/admin/marketplace/queue',
      label: 'Marketplace Queue',
      icon: <Store className="h-4 w-4 mr-2" />,
      active: location.pathname.startsWith('/admin/marketplace/queue'),
    },
    {
      to: '/admin/marketplace/requests',
      label: 'Connection Requests',
      icon: <MessageSquare className="h-4 w-4 mr-2" />,
      active: location.pathname.startsWith('/admin/marketplace/requests'),
      badge: unviewedConnectionRequestsCount,
    },
    {
      to: '/admin/marketplace/users',
      label: 'Marketplace Users',
      icon: <UserCog className="h-4 w-4 mr-2" />,
      active: location.pathname.startsWith('/admin/marketplace/users'),
      badge: unviewedUsersCount,
    },
    // Remarketing
    {
      to: '/admin/remarketing',
      label: 'Remarketing',
      icon: <Target className="h-4 w-4 mr-2" />,
      active: location.pathname === '/admin/remarketing',
      section: 'Remarketing',
    },
    // Analytics
    {
      to: '/admin/analytics',
      label: 'Analytics',
      icon: <BarChart3 className="h-4 w-4 mr-2" />,
      active:
        location.pathname.startsWith('/admin/analytics') ||
        location.pathname.startsWith('/admin/analytics'),
      section: 'Analytics',
    },
    // Admin
    {
      to: '/admin/settings/team',
      label: 'Settings',
      icon: <Settings className="h-4 w-4 mr-2" />,
      active: location.pathname.startsWith('/admin/settings'),
      section: 'Admin',
    },
    // View Marketplace
    {
      to: '/',
      label: 'View Marketplace',
      icon: <ShoppingBag className="h-4 w-4 mr-2" />,
      active: false,
    },
  ];

  return (
    <div
      className={cn(
        'flex items-center justify-between p-3 sm:p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="mr-3 sm:mr-4 h-10 w-10">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[85%] sm:w-[300px] p-0">
            <SheetHeader className="p-4 pb-2 border-b">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-lg font-semibold">SourceCo</SheetTitle>
                <SheetClose className="rounded-full hover:bg-muted p-2 touch-manipulation">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </SheetClose>
              </div>
              <p className="text-sm text-muted-foreground text-left mt-1">
                {user?.first_name || 'Admin'}
              </p>
            </SheetHeader>
            <nav className="flex flex-col gap-0.5 p-4">
              {navItems.map((item) => (
                <div key={item.to}>
                  {item.section && (
                    <div className="px-4 pt-4 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                        {item.section}
                      </span>
                    </div>
                  )}
                  <SheetClose asChild>
                    <Link
                      to={item.to}
                      className={cn(
                        'flex items-center px-4 py-2.5 text-sm rounded-lg transition-colors touch-manipulation min-h-[44px]',
                        item.active
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/80',
                      )}
                    >
                      {item.icon}
                      <span className="font-medium flex-1">{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <Badge className="h-5 min-w-[20px] px-2 flex items-center justify-center text-[10px] font-bold tracking-wide ml-auto bg-notification text-notification-foreground border-notification shadow-sm">
                          {item.badge > 9 ? '9+' : item.badge}
                        </Badge>
                      )}
                    </Link>
                  </SheetClose>
                </div>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
        <h1 className="text-base sm:text-lg font-semibold truncate">
          SourceCo Admin
          {/* M-20 FIX: Show environment indicator so admins know if they're on staging */}
          {import.meta.env.MODE !== 'production' && (
            <Badge
              variant="outline"
              className="ml-2 text-[10px] py-0 px-1.5 border-orange-400 text-orange-600 align-middle"
            >
              {import.meta.env.MODE || 'dev'}
            </Badge>
          )}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onSearchClick}>
          <Search className="h-5 w-5" />
          <span className="sr-only">Search</span>
        </Button>
        <AdminNotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">
                  {`${user?.first_name?.charAt(0) || ''}${user?.last_name?.charAt(0) || ''}`.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/profile')}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await logout();
                } catch {
                  window.location.href = '/login';
                }
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
