import { ErrorBoundary } from '@/components/ErrorBoundary';
import { adminErrorHandler } from '@/lib/error-handler';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  Settings,
  Users,
  Database,
  Bell,
  HelpCircle,
  Loader2,
  Store,
  Target,
  ListChecks,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAdmin } from '@/hooks/use-admin';
import { lazy, Suspense, useEffect, useState } from 'react';
import { usePermissions } from '@/hooks/permissions/usePermissions';
import { PermissionsModal } from '@/components/admin/permissions/PermissionsModal';
import { useSearchParams } from 'react-router-dom';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';

// Lazy-load marketplace tab content
const StripeOverviewTab = lazy(() =>
  import('@/components/admin/StripeOverviewTab').then((m) => ({ default: m.StripeOverviewTab })),
);
const AnalyticsTabContainer = lazy(() =>
  import('@/components/admin/analytics/AnalyticsTabContainer').then((m) => ({
    default: m.AnalyticsTabContainer,
  })),
);
const StreamlinedManagementTab = lazy(() =>
  import('@/components/admin/StreamlinedManagementTab').then((m) => ({
    default: m.StreamlinedManagementTab,
  })),
);
const RecentActivityTab = lazy(() =>
  import('@/components/admin/RecentActivityTab').then((m) => ({ default: m.RecentActivityTab })),
);
const ListingIntelligenceTab = lazy(() =>
  import('@/components/admin/ListingIntelligenceTab').then((m) => ({
    default: m.ListingIntelligenceTab,
  })),
);
const DataRecoveryTab = lazy(() =>
  import('@/components/admin/data-recovery/DataRecoveryTab').then((m) => ({
    default: m.DataRecoveryTab,
  })),
);
const FormMonitoringTab = lazy(() =>
  import('@/components/admin/form-monitoring/FormMonitoringTab').then((m) => ({
    default: m.FormMonitoringTab,
  })),
);
const MyDealsTab = lazy(() =>
  import('@/components/admin/dashboard/MyDealsTab').then((m) => ({ default: m.MyDealsTab })),
);

// Lazy-load remarketing dashboard content
const ReMarketingDashboardContent = lazy(
  () => import('@/pages/admin/remarketing/ReMarketingDashboard'),
);

// Lazy-load daily tasks dashboard content
const DailyTaskDashboardContent = lazy(
  () => import('@/pages/admin/remarketing/DailyTaskDashboard'),
);

const TabFallback = () => (
  <div className="flex items-center justify-center py-16">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const AdminDashboard = () => {
  const { users } = useAdmin();
  const { data: usersData = [] } = users;
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const { canManagePermissions } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();

  // Register AI Command Center context
  const { setPageContext } = useAICommandCenterContext();
  useEffect(() => {
    setPageContext({ page: 'admin_dashboard', entity_type: 'dashboard' });
  }, [setPageContext]);

  const viewParam = searchParams.get('view');
  const activeDashboard =
    viewParam === 'remarketing'
      ? 'remarketing'
      : viewParam === 'marketplace'
        ? 'marketplace'
        : 'daily-tasks';

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleManagePermissions = () => {
    setIsPermissionsModalOpen(true);
  };

  const setView = (view: string) => {
    if (view === 'daily-tasks') {
      searchParams.delete('view');
    } else {
      searchParams.set('view', view);
    }
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <ErrorBoundary
      onError={(error, _errorInfo) => {
        adminErrorHandler(error, 'dashboard loading');
      }}
    >
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-border/50 bg-background sticky top-0 z-10">
          <div className="px-4 md:px-8 py-5">
            <div className="flex flex-col gap-5">
              {/* Title Row */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
                  <p className="text-sm text-muted-foreground/70 mt-0.5">
                    {activeDashboard === 'daily-tasks'
                      ? 'Tasks from daily standup meetings'
                      : activeDashboard === 'remarketing'
                        ? 'Deal pipeline overview'
                        : 'Manage and monitor your marketplace'}
                  </p>
                </div>

                {/* Quick Actions */}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRefresh}
                    className="h-8 w-8 hover:bg-muted/50"
                    title="Refresh"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted/50">
                        <Bell className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                      <div className="flex items-center justify-between px-4 py-2">
                        <h4 className="font-medium text-sm">Notifications</h4>
                        <Button variant="ghost" size="sm" className="h-auto p-0 text-xs">
                          Mark all read
                        </Button>
                      </div>
                      <DropdownMenuSeparator />
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No new notifications
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted/50">
                        <Settings className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {canManagePermissions && (
                        <>
                          <DropdownMenuItem onClick={handleManagePermissions}>
                            <Users className="mr-2 h-4 w-4" />
                            Manage Permissions
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem disabled>
                        <Database className="mr-2 h-4 w-4" />
                        Export Data
                        <span className="ml-auto text-xs text-muted-foreground">Soon</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled>
                        <HelpCircle className="mr-2 h-4 w-4" />
                        Help & Support
                        <span className="ml-auto text-xs text-muted-foreground">Soon</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Top-level dashboard switcher */}
              <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
                <button
                  onClick={() => setView('daily-tasks')}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeDashboard === 'daily-tasks'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  Daily Tasks
                </button>
                <button
                  onClick={() => setView('remarketing')}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeDashboard === 'remarketing'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Target className="h-3.5 w-3.5" />
                  Remarketing
                </button>
                <button
                  onClick={() => setView('marketplace')}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeDashboard === 'marketplace'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Store className="h-3.5 w-3.5" />
                  Marketplace
                </button>
              </div>
            </div>
          </div>

          {/* Marketplace sub-tabs (only when marketplace is active) */}
          {activeDashboard === 'marketplace' && (
            <Tabs defaultValue="analytics" className="w-full">
              <div className="px-8">
                <TabsList className="inline-flex h-11 items-center justify-start rounded-none border-b-0 bg-transparent p-0 gap-6">
                  {[
                    { value: 'analytics', label: 'Analytics' },
                    { value: 'overview', label: 'Overview' },
                    { value: 'my-deals', label: 'My Deals' },
                    { value: 'listings', label: 'Listings' },
                    { value: 'management', label: 'Users' },
                    { value: 'activity', label: 'Activity' },
                    { value: 'data-recovery', label: 'Data' },
                    { value: 'form-monitoring', label: 'Forms' },
                  ].map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="relative rounded-none border-b-2 border-b-transparent bg-transparent px-0 pb-3 pt-0 text-[13px] font-medium text-muted-foreground/70 shadow-none transition-all hover:text-foreground data-[state=active]:border-b-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none"
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="px-8 py-8">
                <TabsContent value="overview" className="mt-0 space-y-6">
                  <Suspense fallback={<TabFallback />}>
                    <StripeOverviewTab />
                  </Suspense>
                </TabsContent>
                <TabsContent value="my-deals" className="mt-0">
                  <Suspense fallback={<TabFallback />}>
                    <MyDealsTab />
                  </Suspense>
                </TabsContent>
                <TabsContent value="analytics" className="mt-0">
                  <Suspense fallback={<TabFallback />}>
                    <AnalyticsTabContainer />
                  </Suspense>
                </TabsContent>
                <TabsContent value="activity" className="mt-0">
                  <Suspense fallback={<TabFallback />}>
                    <RecentActivityTab />
                  </Suspense>
                </TabsContent>
                <TabsContent value="listings" className="mt-0">
                  <Suspense fallback={<TabFallback />}>
                    <ListingIntelligenceTab />
                  </Suspense>
                </TabsContent>
                <TabsContent value="management" className="mt-0">
                  <Suspense fallback={<TabFallback />}>
                    <StreamlinedManagementTab />
                  </Suspense>
                </TabsContent>
                <TabsContent value="data-recovery" className="mt-0">
                  <Suspense fallback={<TabFallback />}>
                    <DataRecoveryTab users={usersData} />
                  </Suspense>
                </TabsContent>
                <TabsContent value="form-monitoring" className="mt-0">
                  <Suspense fallback={<TabFallback />}>
                    <FormMonitoringTab />
                  </Suspense>
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>

        {/* Daily Tasks dashboard content (when daily-tasks is active) */}
        {activeDashboard === 'daily-tasks' && (
          <Suspense fallback={<TabFallback />}>
            <DailyTaskDashboardContent />
          </Suspense>
        )}

        {/* Remarketing dashboard content (when remarketing is active) */}
        {activeDashboard === 'remarketing' && (
          <Suspense fallback={<TabFallback />}>
            <ReMarketingDashboardContent />
          </Suspense>
        )}
      </div>

      <PermissionsModal open={isPermissionsModalOpen} onOpenChange={setIsPermissionsModalOpen} />
    </ErrorBoundary>
  );
};

export default AdminDashboard;
