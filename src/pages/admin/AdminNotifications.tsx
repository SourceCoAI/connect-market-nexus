import { Bell, CheckCheck, Clock, ListTodo, FileSignature, FileCheck, MessageSquare, UserPlus } from 'lucide-react';
import {
  useAdminNotifications,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
} from '@/hooks/admin/use-admin-notifications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export default function AdminNotifications() {
  const { notifications, unreadCount, isLoading } = useAdminNotifications();
  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const navigate = useNavigate();

  const handleNotificationClick = (notification: {
    id: string;
    groupedIds?: string[];
    action_url?: string;
  }) => {
    const idsToMark = notification.groupedIds || [notification.id];
    markAsRead.mutate(idsToMark);

    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'task_assigned':
        return <ListTodo className="w-5 h-5 text-primary" />;
      case 'task_completed':
      case 'task_approved':
        return <CheckCheck className="w-5 h-5 text-green-600" />;
      case 'document_signing_requested':
        return <FileSignature className="w-5 h-5 text-amber-600" />;
      case 'document_completed':
        return <FileCheck className="w-5 h-5 text-emerald-600" />;
      case 'remarketing_a_tier_match':
        return <Bell className="w-5 h-5 text-emerald-600" />;
      case 'deal_assignment':
      case 'deal_reassignment':
        return <UserPlus className="w-5 h-5 text-blue-600" />;
      case 'response_sent':
        return <MessageSquare className="w-5 h-5 text-blue-600" />;
      default:
        return <Bell className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const unreadNotifications = notifications.filter((n) => !n.is_read);
  const readNotifications = notifications.filter((n) => n.is_read);

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground mt-1">
            {unreadCount > 0
              ? `You have ${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
              : "You're all caught up!"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button onClick={() => markAllAsRead.mutate()} variant="outline">
            <CheckCheck className="w-4 h-4 mr-2" />
            Mark all as read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading notifications...</p>
        </div>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="text-lg font-semibold mb-2">No notifications yet</h3>
            <p className="text-muted-foreground">
              You'll receive notifications here when tasks are assigned to you or deals require
              attention.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {unreadNotifications.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                Unread
              </h2>
              <div className="space-y-2">
                {unreadNotifications.map((notification) => (
                  <Card
                    key={notification.id}
                    className={cn(
                      'cursor-pointer transition-all hover:shadow-md border-l-4',
                      notification.notification_type === 'task_assigned' && 'border-l-primary',
                      (notification.notification_type === 'task_completed' || notification.notification_type === 'task_approved') && 'border-l-green-600',
                      notification.notification_type === 'document_signing_requested' && 'border-l-amber-600',
                      notification.notification_type === 'document_completed' && 'border-l-emerald-600',
                      (notification.notification_type === 'deal_assignment' || notification.notification_type === 'deal_reassignment') && 'border-l-blue-600',
                    )}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="mt-1">
                            {getNotificationIcon(notification.notification_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base flex items-center gap-2">
                              {notification.title}
                              {notification.groupedCount && notification.groupedCount > 1 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground">
                                  {notification.groupedCount}
                                </span>
                              )}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {notification.message}
                            </CardDescription>
                            {!!notification.metadata?.deal_title && (
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground/80">
                                  {String(notification.metadata.deal_title)}
                                </span>
                                {!!notification.metadata.priority && (
                                  <span
                                    className={cn(
                                      'px-2 py-0.5 rounded text-xs font-medium uppercase',
                                      notification.metadata.priority === 'high' &&
                                        'bg-red-100 text-red-700',
                                      notification.metadata.priority === 'medium' &&
                                        'bg-yellow-100 text-yellow-700',
                                      notification.metadata.priority === 'low' &&
                                        'bg-blue-100 text-blue-700',
                                    )}
                                  >
                                    {String(notification.metadata.priority)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                          })}
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {readNotifications.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-muted-foreground">Earlier</h2>
              <div className="space-y-2 opacity-70">
                {readNotifications.map((notification) => (
                  <Card
                    key={notification.id}
                    className="cursor-pointer transition-all hover:shadow-md"
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="mt-1">
                            {getNotificationIcon(notification.notification_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base">{notification.title}</CardTitle>
                            <CardDescription className="mt-1 line-clamp-1">
                              {notification.message}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                          })}
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
