
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserNotifications } from "@/hooks/use-user-notifications";
import { useUnreadBuyerMessageCounts } from "@/hooks/use-connection-messages";
import { MarketplaceIcon, SavedIcon, DealsIcon, MessagesIcon } from "@/components/icons/NavIcons";

interface MobileNavItemsProps {
  isAdmin: boolean;
  isApproved: boolean;
  onNavigateToAdmin: () => void;
}

const MobileNavItems = ({ isAdmin, isApproved, onNavigateToAdmin }: MobileNavItemsProps) => {
  const { unreadCount } = useUserNotifications();
  const { data: unreadMessages } = useUnreadBuyerMessageCounts();
  const totalDealsUnread = unreadCount + (unreadMessages?.dealTotal || 0);

  if (!isApproved) {
    return null;
  }

  return (
    <div className="flex flex-col space-y-2 p-4">
      <Link
        to="/"
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        <MarketplaceIcon className="h-4 w-4" />
        Marketplace
      </Link>

      <Link
        to="/saved-listings"
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        <SavedIcon className="h-4 w-4" />
        Saved Listings
      </Link>

      <Link
        to="/my-deals"
        className="relative flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        <DealsIcon className="h-4 w-4" />
        My Deals
        {totalDealsUnread > 0 && (
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-600 ring-1 ring-white shadow-sm"></span>
        )}
      </Link>

      <Link
        to="/messages"
        className="relative flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        <MessagesIcon className="h-4 w-4" />
        Messages
        {(unreadMessages?.messagesTotal || 0) > 0 && (
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-600 ring-1 ring-white shadow-sm"></span>
        )}
      </Link>

      {isAdmin && (
        <Button
          variant="outline"
          size="sm"
          onClick={onNavigateToAdmin}
          className="flex items-center gap-2 justify-start"
        >
          <Shield className="h-4 w-4" />
          Admin Dashboard
        </Button>
      )}
    </div>
  );
};

export default MobileNavItems;
