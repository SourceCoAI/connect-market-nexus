
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUserNotifications } from "@/hooks/use-user-notifications";
import { useUnreadBuyerMessageCounts } from "@/hooks/use-connection-messages";
import { MarketplaceIcon, SavedIcon, DealsIcon, MessagesIcon, ProfileIcon, AdminIcon } from "@/components/icons/NavIcons";

interface DesktopNavItemsProps {
  isAdmin: boolean;
  isApproved: boolean;
  onNavigateToAdmin: () => void;
}

const DesktopNavItems = ({ isAdmin, isApproved, onNavigateToAdmin }: DesktopNavItemsProps) => {
  const location = useLocation();
  const { unreadCount } = useUserNotifications();
  const { data: unreadMessages } = useUnreadBuyerMessageCounts();
  const totalDealsUnread = unreadCount + (unreadMessages?.dealTotal || 0);

  if (!isApproved) {
    return null;
  }

  const navItems = [
    {
      to: "/",
      label: "Marketplace",
      icon: MarketplaceIcon,
      isActive: location.pathname === "/",
    },
    {
      to: "/saved-listings",
      label: "Saved",
      icon: SavedIcon,
      isActive: location.pathname === "/saved-listings",
    },
    {
      to: "/my-deals",
      label: "My Deals",
      icon: DealsIcon,
      isActive: location.pathname === "/my-deals" || location.pathname === "/my-requests",
      ...(totalDealsUnread > 0 && { badge: totalDealsUnread }),
    },
    {
      to: "/messages",
      label: "Messages",
      icon: MessagesIcon,
      isActive: location.pathname === "/messages",
      ...((unreadMessages?.total || 0) > 0 && { badge: unreadMessages?.total }),
      highlight: true,
    },
    {
      to: "/profile",
      label: "Profile",
      icon: ProfileIcon,
      isActive: location.pathname === "/profile",
    },
  ];

  return (
    <nav className="flex items-center gap-1.5">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "relative inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-200",
              item.isActive
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-700 hover:text-slate-900 hover:bg-slate-100",
              'highlight' in item && item.highlight && !item.isActive && "ring-1 ring-slate-300 bg-slate-50"
            )}
          >
            <Icon className="w-[15px] h-[15px]" />
            <span>{item.label}</span>
            {'badge' in item && (
              <span className="ml-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
                {(item.badge ?? 0) > 99 ? '99+' : item.badge}
              </span>
            )}
          </Link>
        );
      })}

      {isAdmin && (
        <Button
          variant="outline"
          size="sm"
          onClick={onNavigateToAdmin}
          className="ml-2 h-9 gap-2 rounded-lg border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300 transition-all duration-200"
        >
          <AdminIcon className="w-[15px] h-[15px]" />
          Admin
        </Button>
      )}
    </nav>
  );
};

export default DesktopNavItems;
