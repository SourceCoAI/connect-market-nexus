import {
  Users,
  Store,
  MessageSquare,
  Activity,
  UserPlus,
  Link as LinkIcon,
  Eye,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { RecentAgreementSignaturesCard } from './dashboard/RecentAgreementSignaturesCard';
import { useAdmin } from '@/hooks/use-admin';
import { useRecentUserActivity } from '@/hooks/use-recent-user-activity';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState, useMemo } from 'react';
import { ActivityDetailsDropdown } from './ActivityDetailsDropdown';
import UserDetailsSidePanel from './UserDetailsSidePanel';

interface GroupedUserActivity {
  user_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  user_name: string;
  activities: Array<{
    activity_type?: string;
    action_type?: string;
    description?: string;
    created_at?: string;
    [key: string]: unknown;
  }>;
  lastActivityTime: string;
  totalActivities: number;
  actionCounts: {
    views: number;
    saves: number;
    connections: number;
    pageViews: number;
  };
  mostRecentSession?: Record<string, unknown> | null;
  dateFirstSeen?: string;
  sessionReferrer?: string;
}

export function StripeOverviewTab() {
  const { useStats } = useAdmin();
  const { data: stats, isLoading: isLoadingStats } = useStats();
  const { data: activities = [], isLoading: isLoadingActivities } = useRecentUserActivity();
  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

  const handleUserClick = (userId: string | null) => {
    if (userId) {
      setSelectedUserId(userId);
      setSidePanelOpen(true);
    }
  };

  const businessMetrics = [
    {
      title: 'Total users',
      value: stats?.totalUsers || 0,
      change: 12,
      isPositive: true,
      icon: Users,
      description: 'Active marketplace users',
    },
    {
      title: 'Active listings',
      value: stats?.totalListings || 0,
      change: 8,
      isPositive: true,
      icon: Store,
      description: 'Live business listings',
    },
    {
      title: 'Connections made',
      value: stats?.approvedConnections || 0,
      change: 15,
      isPositive: true,
      icon: Activity,
      description: 'Successful connections',
    },
    {
      title: 'Pending actions',
      value: (stats?.pendingUsers || 0) + (stats?.pendingConnections || 0),
      change: 5,
      isPositive: false,
      icon: MessageSquare,
      description: 'Requires admin attention',
    },
  ];

  // Helper function to parse referrer into a friendly source name
  const parseReferrerSource = (
    activity: {
      current_utm_source?: string;
      current_utm_medium?: string;
      current_utm_campaign?: string;
      current_referrer?: string;
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
      referrer?: string;
      marketing_channel?: string;
    } | null,
    preferCurrent: boolean = false,
  ): string => {
    // Use current session data if preferCurrent is true and available
    const utmSource =
      preferCurrent && activity?.current_utm_source
        ? activity.current_utm_source
        : activity?.utm_source;
    const utmMedium =
      preferCurrent && activity?.current_utm_medium
        ? activity.current_utm_medium
        : activity?.utm_medium;
    const utmCampaign =
      preferCurrent && activity?.current_utm_campaign
        ? activity.current_utm_campaign
        : activity?.utm_campaign;
    const referrer =
      preferCurrent && activity?.current_referrer ? activity.current_referrer : activity?.referrer;
    const marketingChannel = activity?.marketing_channel;

    if (!referrer && !utmSource && !marketingChannel) return 'Direct';

    // Priority 1: Marketing channel from user_initial_session (only for first seen)
    if (!preferCurrent && marketingChannel && marketingChannel !== 'Direct') {
      return marketingChannel;
    }

    // Priority 2: UTM source with medium context
    if (utmSource) {
      const source = utmSource.toLowerCase();
      const medium = utmMedium?.toLowerCase();
      const campaign = utmCampaign?.toLowerCase();

      if (
        medium === 'email' ||
        source.includes('newsletter') ||
        source.includes('email') ||
        campaign?.includes('newsletter')
      ) {
        return 'Email/Newsletter';
      }
      if (medium === 'social' || ['linkedin', 'twitter', 'facebook'].includes(source)) {
        return source.charAt(0).toUpperCase() + source.slice(1);
      }
      if (source.includes('brevo') || source.includes('sendinblue')) {
        return 'Brevo/Email';
      }
      return source.charAt(0).toUpperCase() + source.slice(1);
    }

    // Priority 3: Parse referrer URL
    if (referrer) {
      try {
        const url = new URL(referrer);
        const hostname = url.hostname.replace('www.', '');

        if (hostname.includes('brevo') || hostname.includes('sendinblue')) return 'Brevo/Email';
        if (hostname.includes('google')) return 'Google';
        if (hostname.includes('facebook')) return 'Facebook';
        if (hostname.includes('linkedin')) return 'LinkedIn';
        if (hostname.includes('t.co') || hostname.includes('twitter')) return 'Twitter/X';

        return hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);
      } catch {
        return 'External Link';
      }
    }

    return 'Direct';
  };

  // Group activities by user with session data
  const groupedByUser = useMemo(() => {
    if (!activities || activities.length === 0) return [];

    const userMap = new Map<
      string,
      GroupedUserActivity & {
        mostRecentSession: Record<string, unknown> | null;
        dateFirstSeen: string;
        sessionReferrer: string;
      }
    >();

    activities.forEach((activity) => {
      const userId = activity.user_id;
      if (!userId) return;

      if (!userMap.has(userId)) {
        userMap.set(userId, {
          user_id: userId,
          email: activity.email,
          first_name: activity.first_name,
          last_name: activity.last_name,
          user_name:
            activity.user_name ||
            `${activity.first_name || ''} ${activity.last_name || ''}`.trim() ||
            activity.email,
          activities: [],
          lastActivityTime: activity.created_at,
          totalActivities: 0,
          actionCounts: {
            views: 0,
            saves: 0,
            connections: 0,
            pageViews: 0,
          },
          mostRecentSession: null,
          dateFirstSeen: activity.created_at,
          sessionReferrer: 'Direct',
        });
      }

      const userGroup = userMap.get(userId)!;
      userGroup.activities.push(activity as unknown as (typeof userGroup.activities)[number]);
      userGroup.totalActivities++;

      // Update last activity time if this is more recent
      if (new Date(activity.created_at) > new Date(userGroup.lastActivityTime)) {
        userGroup.lastActivityTime = activity.created_at;
        userGroup.mostRecentSession = activity as unknown as Record<string, unknown>;
      }

      // Set date first seen to user signup date (profiles.created_at)
      // This is the CORRECT source - when they actually signed up
      if (activity.user_created_at) {
        userGroup.dateFirstSeen = activity.user_created_at;
      }

      // Update session referrer from the most recent activity
      userGroup.sessionReferrer = parseReferrerSource(userGroup.mostRecentSession, true);

      // Count action types
      if (activity.activity_type === 'listing_action') {
        if (activity.action_type === 'view') userGroup.actionCounts.views++;
        else if (activity.action_type === 'save') userGroup.actionCounts.saves++;
        else if (activity.action_type === 'request_connection')
          userGroup.actionCounts.connections++;
      } else if (activity.activity_type === 'page_view') {
        userGroup.actionCounts.pageViews++;
      }
    });

    // Convert to array and sort by last activity time
    return Array.from(userMap.values()).sort(
      (a, b) => new Date(b.lastActivityTime).getTime() - new Date(a.lastActivityTime).getTime(),
    );
  }, [activities]);

  // Filter grouped activities based on selected tab
  const filteredActivities = groupedByUser.filter((userGroup) => {
    if (activityFilter === 'all') return true;
    if (activityFilter === 'users') {
      return userGroup.activities.some(
        (a) =>
          a.activity_type === 'user_event' ||
          (a.description ?? '').toLowerCase().includes('signup'),
      );
    }
    if (activityFilter === 'listings') {
      return userGroup.actionCounts.views > 0 || userGroup.actionCounts.saves > 0;
    }
    if (activityFilter === 'connections') {
      return userGroup.actionCounts.connections > 0;
    }
    if (activityFilter === 'views') {
      return userGroup.actionCounts.pageViews > 0;
    }
    return true;
  });

  if (isLoadingStats) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse border border-border/50 rounded-lg p-6">
              <div className="h-3 bg-muted/50 rounded w-1/2 mb-4"></div>
              <div className="h-10 bg-muted/50 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-muted/50 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Key Metrics - Stripe style */}
      <div className="grid gap-4 md:grid-cols-4">
        {businessMetrics.map((metric) => {
          const Icon = metric.icon;

          return (
            <div key={metric.title} className="group relative">
              <div className="border border-border/50 rounded-lg p-6 bg-card hover:border-border transition-all">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">
                    {metric.title}
                  </span>
                  <Icon className="h-4 w-4 text-muted-foreground/40" />
                </div>

                {/* Value */}
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-4xl font-semibold tracking-tight">
                    {metric.value.toLocaleString()}
                  </span>
                  {metric.change > 0 && (
                    <div className="flex items-center gap-1 text-sm">
                      <span
                        className={
                          metric.isPositive
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : 'text-red-600 dark:text-red-400 font-medium'
                        }
                      >
                        {metric.isPositive ? '+' : '-'}
                        {metric.change}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Description */}
                <p className="text-xs text-muted-foreground/70">{metric.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Activity Feed with Tabs - Unlimited scroll */}
      <div className="border border-border/50 rounded-lg bg-card overflow-hidden">
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Activity feed</h3>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Real-time updates from your marketplace
              </p>
            </div>
          </div>

          {/* Activity Filter Tabs */}
          <Tabs value={activityFilter} onValueChange={setActivityFilter} className="w-full">
            <TabsList className="inline-flex h-9 items-center justify-start rounded-md bg-muted/30 p-1 gap-1">
              <TabsTrigger
                value="all"
                className="rounded-md px-3 py-1.5 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Activity className="h-3 w-3 mr-1.5" />
                All activity
              </TabsTrigger>
              <TabsTrigger
                value="users"
                className="rounded-md px-3 py-1.5 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <UserPlus className="h-3 w-3 mr-1.5" />
                Users
              </TabsTrigger>
              <TabsTrigger
                value="listings"
                className="rounded-md px-3 py-1.5 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Store className="h-3 w-3 mr-1.5" />
                Listings
              </TabsTrigger>
              <TabsTrigger
                value="connections"
                className="rounded-md px-3 py-1.5 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <LinkIcon className="h-3 w-3 mr-1.5" />
                Connections
              </TabsTrigger>
              <TabsTrigger
                value="views"
                className="rounded-md px-3 py-1.5 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Eye className="h-3 w-3 mr-1.5" />
                Page views
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="divide-y divide-border/50">
          {isLoadingActivities ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="h-2 w-2 bg-muted/50 rounded-full"></div>
                  <div className="h-3 bg-muted/50 rounded flex-1"></div>
                  <div className="h-3 bg-muted/50 rounded w-16"></div>
                </div>
              ))}
            </div>
          ) : filteredActivities.length > 0 ? (
            <div className="max-h-[600px] overflow-y-auto">
              {filteredActivities.map((userGroup) => {
                const currentSessionSource = parseReferrerSource(userGroup.mostRecentSession, true);

                return (
                  <div
                    key={userGroup.user_id}
                    className="flex items-start gap-3 px-6 py-4 hover:bg-muted/10 transition-colors border-b border-border/30 last:border-b-0"
                  >
                    <Avatar className="h-8 w-8 border mt-0.5">
                      <AvatarFallback className="text-xs">
                        {userGroup.first_name?.charAt(0) || userGroup.email.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0 flex items-start justify-between gap-6">
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => handleUserClick(userGroup.user_id)}
                          className="text-sm text-foreground font-semibold hover:text-primary transition-colors text-left"
                        >
                          {userGroup.user_name}
                        </button>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {userGroup.totalActivities} event
                          {userGroup.totalActivities !== 1 ? 's' : ''} • {currentSessionSource}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(userGroup.lastActivityTime), {
                              addSuffix: true,
                            })}
                          </p>
                          <ActivityDetailsDropdown
                            session_id={
                              userGroup.mostRecentSession?.session_id as string | undefined
                            }
                            referrer={userGroup.mostRecentSession?.referrer as string | undefined}
                            time_on_page={
                              userGroup.mostRecentSession?.time_on_page as number | undefined
                            }
                            scroll_depth={
                              userGroup.mostRecentSession?.scroll_depth as number | undefined
                            }
                            page_title={
                              userGroup.mostRecentSession?.page_title as string | undefined
                            }
                            event_category={
                              userGroup.mostRecentSession?.event_category as string | undefined
                            }
                            event_label={
                              userGroup.mostRecentSession?.event_label as string | undefined
                            }
                          />
                        </div>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 mt-1 text-xs text-primary hover:text-primary/80"
                          onClick={() => handleUserClick(userGroup.user_id)}
                        >
                          See more about this user →
                        </Button>
                      </div>

                      {/* Right side metadata */}
                      <div className="flex-shrink-0 space-y-2 text-right">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground/70">
                            Date First Seen
                          </div>
                          <div className="text-xs text-foreground mt-0.5">
                            {format(new Date(userGroup.dateFirstSeen), 'MMM d, yyyy')}
                          </div>
                        </div>
                        {!!userGroup.mostRecentSession?.location && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground/70">
                              Initial Location
                            </div>
                            <div className="text-xs text-foreground mt-0.5">
                              {(() => {
                                const loc = userGroup.mostRecentSession.location as
                                  | { city?: string; region?: string; country?: string }
                                  | undefined;
                                return (
                                  [loc?.city, loc?.region, loc?.country]
                                    .filter(Boolean)
                                    .join(', ') || 'Unknown'
                                );
                              })()}
                            </div>
                          </div>
                        )}
                        <div>
                          <div className="text-xs font-medium text-muted-foreground/70">
                            Current Session
                          </div>
                          <div className="text-xs text-foreground mt-0.5">
                            {currentSessionSource}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center">
              <Activity className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/70">
                {activityFilter === 'all' ? 'No recent activity' : `No ${activityFilter} activity`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Agreement Signatures */}
      <RecentAgreementSignaturesCard />

      {/* User Details Side Panel */}
      <UserDetailsSidePanel
        userId={selectedUserId}
        open={sidePanelOpen}
        onOpenChange={setSidePanelOpen}
      />
    </div>
  );
}
