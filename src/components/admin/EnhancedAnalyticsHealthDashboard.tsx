import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAnalytics } from '@/context/AnalyticsContext';
import {
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  TestTube2,
  Zap,
} from 'lucide-react';

interface HealthStatus {
  table: string;
  status: 'healthy' | 'warning' | 'error';
  lastInsert?: string;
  recordCount: number;
  errorMessage?: string;
}

interface LiveStats {
  pageViews: number;
  listingAnalytics: number;
  userEvents: number;
  searchAnalytics: number;
  userSessions: number;
}

export function EnhancedAnalyticsHealthDashboard() {
  const [healthStatus, setHealthStatus] = useState<HealthStatus[]>([]);
  const [liveStats, setLiveStats] = useState<LiveStats>({
    pageViews: 0,
    listingAnalytics: 0,
    userEvents: 0,
    searchAnalytics: 0,
    userSessions: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isTestingRunning, setIsTestingRunning] = useState(false);
  const [testResults, setTestResults] = useState<
    Array<{ test: string; success: boolean; details?: any }>
  >([]);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const analytics = useAnalytics();

  const checkAnalyticsHealth = async () => {
    setIsLoading(true);
    try {
      const tables = [
        'user_sessions',
        'page_views',
        'listing_analytics',
        'user_events',
        'search_analytics',
      ];
      const statusPromises = tables.map(async (table) => {
        try {
          const { count, error: countError } = await supabase
            .from(table as never)
            .select('*', { count: 'exact', head: true });

          if (countError) throw countError;

          const { data: latest, error: latestError } = await supabase
            .from(table as never)
            .select('created_at')
            .order('created_at', { ascending: false })
            .limit(1);

          if (latestError) throw latestError;

          const recordCount = count || 0;
          const lastInsert = (latest as { created_at?: string }[] | null)?.[0]?.created_at;

          let status: 'healthy' | 'warning' | 'error' = 'healthy';

          if (recordCount === 0) {
            status = 'error';
          } else if (
            !lastInsert ||
            new Date().getTime() - new Date(lastInsert).getTime() > 300000
          ) {
            // 5 minutes
            status = 'warning';
          }

          return {
            table,
            status,
            recordCount,
            lastInsert,
          };
        } catch (error: unknown) {
          return {
            table,
            status: 'error' as const,
            recordCount: 0,
            errorMessage: error instanceof Error ? error.message : String(error),
          };
        }
      });

      const statuses = await Promise.all(statusPromises);
      setHealthStatus(statuses);

      // Update live stats
      const stats = statuses.reduce(
        (acc, status) => {
          switch (status.table) {
            case 'page_views':
              acc.pageViews = status.recordCount;
              break;
            case 'listing_analytics':
              acc.listingAnalytics = status.recordCount;
              break;
            case 'user_events':
              acc.userEvents = status.recordCount;
              break;
            case 'search_analytics':
              acc.searchAnalytics = status.recordCount;
              break;
            case 'user_sessions':
              acc.userSessions = status.recordCount;
              break;
          }
          return acc;
        },
        { pageViews: 0, listingAnalytics: 0, userEvents: 0, searchAnalytics: 0, userSessions: 0 },
      );

      setLiveStats(stats);
    } catch (error: unknown) {
      toast({
        title: 'Health Check Failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const runComprehensiveTest = async () => {
    setIsTestingRunning(true);
    setTestResults([]);

    const logTestResult = (testName: string, success: boolean, details?: any) => {
      setTestResults((prev) => [...prev, { test: testName, success, details }]);
    };

    try {
      // Test 1: Analytics Health
      const healthData = await analytics.getAnalyticsHealth();
      logTestResult('Analytics Health Check', healthData.isHealthy, healthData);

      // Test 2: Page View Tracking
      const pageViewSuccess = await analytics.trackPageView('/test-page');
      logTestResult('Page View Tracking', pageViewSuccess);

      // Test 3: Event Tracking
      const eventSuccess = await analytics.trackEvent('test_event', { test: true });
      logTestResult('Event Tracking', eventSuccess);

      // Test 4: Listing View Tracking
      const listingViewSuccess = await analytics.trackListingView('test-listing-id');
      logTestResult('Listing View Tracking', listingViewSuccess);

      // Test 5: Search Tracking
      const searchSuccess = await analytics.trackSearch('test query', { category: 'test' }, 5);
      logTestResult('Search Tracking', searchSuccess);

      // Test 6: Verify data was inserted (wait for writes to propagate)
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const { count: pageViewCount } = await supabase
          .from('page_views')
          .select('*', { count: 'exact', head: true });
        const { count: eventCount } = await supabase
          .from('user_events')
          .select('*', { count: 'exact', head: true });
        const { count: listingCount } = await supabase
          .from('listing_analytics')
          .select('*', { count: 'exact', head: true });
        const { count: searchCount } = await supabase
          .from('search_analytics')
          .select('*', { count: 'exact', head: true });

        logTestResult(
          'Data Verification',
          (pageViewCount || 0) > 0 &&
            (eventCount || 0) > 0 &&
            (listingCount || 0) > 0 &&
            (searchCount || 0) > 0,
          { pageViewCount, eventCount, listingCount, searchCount },
        );
      } catch (error) {
        logTestResult('Data Verification', false, error);
      }

      toast({
        title: 'Comprehensive Test Completed',
        description: 'Check results below',
      });
    } catch (error: unknown) {
      logTestResult(
        'Test Suite Execution',
        false,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsTestingRunning(false);
    }
  };

  const clearAnalyticsData = async () => {
    if (
      !confirm(
        '⚠️ Are you sure? This will delete ALL analytics data. This action cannot be undone.',
      )
    ) {
      return;
    }

    try {
      setIsLoading(true);
      const tables = ['page_views', 'listing_analytics', 'user_events', 'search_analytics'];

      for (const table of tables) {
        const { error } = await supabase
          .from(table as never)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
      }

      toast({
        title: 'Analytics Data Cleared',
        description: 'All analytics data has been deleted',
      });

      checkAnalyticsHealth();
    } catch (error: unknown) {
      toast({
        title: 'Clear Failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAnalyticsHealth();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(checkAnalyticsHealth, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getStatusIcon = (status: HealthStatus['status']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: HealthStatus['status']) => {
    switch (status) {
      case 'healthy':
        return (
          <Badge variant="secondary" className="text-green-700 bg-green-100">
            Healthy
          </Badge>
        );
      case 'warning':
        return (
          <Badge variant="secondary" className="text-yellow-700 bg-yellow-100">
            Warning
          </Badge>
        );
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">Analytics Health Dashboard</h2>
          <p className="text-sm md:text-base text-muted-foreground">
            Real-time monitoring and testing of the analytics system
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
          >
            <Zap className="h-4 w-4 mr-2" />
            {autoRefresh ? 'Live' : 'Static'}
          </Button>
          <Button onClick={checkAnalyticsHealth} disabled={isLoading} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="health" className="space-y-4">
        <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 h-auto">
          <TabsTrigger value="health" className="text-xs md:text-sm py-2">
            Health Status
          </TabsTrigger>
          <TabsTrigger value="testing" className="text-xs md:text-sm py-2">
            Live Testing
          </TabsTrigger>
          <TabsTrigger value="actions" className="text-xs md:text-sm py-2">
            Actions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="space-y-4">
          {/* Live Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-4">
            <Card className="p-2 md:p-4">
              <CardHeader className="pb-2 p-2 md:p-3">
                <CardTitle className="text-xs md:text-sm">Page Views</CardTitle>
              </CardHeader>
              <CardContent className="p-2 md:p-3">
                <div className="text-lg md:text-2xl font-bold">{liveStats.pageViews}</div>
              </CardContent>
            </Card>
            <Card className="p-2 md:p-4">
              <CardHeader className="pb-2 p-2 md:p-3">
                <CardTitle className="text-xs md:text-sm">Listing Analytics</CardTitle>
              </CardHeader>
              <CardContent className="p-2 md:p-3">
                <div className="text-lg md:text-2xl font-bold">{liveStats.listingAnalytics}</div>
              </CardContent>
            </Card>
            <Card className="p-2 md:p-4">
              <CardHeader className="pb-2 p-2 md:p-3">
                <CardTitle className="text-xs md:text-sm">User Events</CardTitle>
              </CardHeader>
              <CardContent className="p-2 md:p-3">
                <div className="text-lg md:text-2xl font-bold">{liveStats.userEvents}</div>
              </CardContent>
            </Card>
            <Card className="p-2 md:p-4">
              <CardHeader className="pb-2 p-2 md:p-3">
                <CardTitle className="text-xs md:text-sm">Search Analytics</CardTitle>
              </CardHeader>
              <CardContent className="p-2 md:p-3">
                <div className="text-lg md:text-2xl font-bold">{liveStats.searchAnalytics}</div>
              </CardContent>
            </Card>
            <Card className="p-2 md:p-4 col-span-2 md:col-span-1">
              <CardHeader className="pb-2 p-2 md:p-3">
                <CardTitle className="text-xs md:text-sm">User Sessions</CardTitle>
              </CardHeader>
              <CardContent className="p-2 md:p-3">
                <div className="text-lg md:text-2xl font-bold">{liveStats.userSessions}</div>
              </CardContent>
            </Card>
          </div>

          {/* Health Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {healthStatus.map((status) => (
              <Card key={status.table}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm capitalize">
                      {status.table.replace('_', ' ')}
                    </CardTitle>
                    {getStatusIcon(status.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Status</span>
                    {getStatusBadge(status.status)}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Records</span>
                    <span className="font-medium">{status.recordCount}</span>
                  </div>
                  {status.lastInsert && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Last Insert</span>
                      <span className="text-xs">
                        {new Date(status.lastInsert).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                  {status.errorMessage && (
                    <div className="text-xs text-red-500 mt-2">{status.errorMessage}</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="testing" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Comprehensive Analytics Test Suite</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Test all analytics tracking functions and verify data insertion
                  </p>
                </div>
                <Button onClick={runComprehensiveTest} disabled={isTestingRunning}>
                  {isTestingRunning ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <TestTube2 className="h-4 w-4 mr-2" />
                  )}
                  Run Full Test Suite
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {testResults.map((result) => (
                  <div
                    key={result.test}
                    className="flex items-center justify-between p-2 border rounded"
                  >
                    <span className="text-sm">{result.test}</span>
                    <div className="flex items-center gap-2">
                      {result.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      {result.details && (
                        <span className="text-xs text-muted-foreground">
                          {typeof result.details === 'object'
                            ? JSON.stringify(result.details).slice(0, 50) + '...'
                            : result.details}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Actions</CardTitle>
              <p className="text-sm text-muted-foreground">
                Dangerous operations that affect the entire analytics system
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={clearAnalyticsData} variant="destructive" disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Clear All Analytics Data
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
