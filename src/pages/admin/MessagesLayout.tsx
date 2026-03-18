import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useSmartleadInbox } from '@/hooks/smartlead/use-smartlead-inbox';

export default function MessagesLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { stats } = useSmartleadInbox();

  const isSmartlead = location.pathname.includes('/smartlead');
  const activeTab = isSmartlead ? 'smartlead' : 'conversations';

  return (
    <div className="space-y-4">
      <Tabs
        value={activeTab}
        onValueChange={(val) => {
          if (val === 'conversations') navigate('/admin/marketplace/messages');
          else navigate('/admin/marketplace/messages/smartlead');
        }}
      >
        <TabsList>
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
          <TabsTrigger value="smartlead" className="gap-2">
            Smartlead Responses
            {stats.newCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-xs">
                {stats.newCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Outlet />
    </div>
  );
}
