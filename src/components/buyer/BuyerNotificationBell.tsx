import {
  Bell,
  Clock,
  MessageSquare,
  FileText,
  CheckCircle,
  FolderOpen,
  FileSignature,
} from 'lucide-react';
import {
  useUserNotifications,
  useMarkNotificationAsRead,
  UserNotification,
} from '@/hooks/use-user-notifications';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { AgreementAlertModal } from './AgreementAlertModal';
import { useMyAgreementStatus } from '@/hooks/use-agreement-status';

const DISMISSED_KEY = 'agreement_popup_dismissed';

function getDismissedSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function addDismissed(id: string) {
  const set = getDismissedSet();
  set.add(id);
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore storage errors */
  }
}

export function BuyerNotificationBell() {
  const { notifications, unreadCount, isLoading } = useUserNotifications();
  const markAsRead = useMarkNotificationAsRead();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [alertDocType, setAlertDocType] = useState<'nda' | 'fee_agreement'>('nda');
  const [currentAlertNotificationId, setCurrentAlertNotificationId] = useState<string | null>(null);

  // Check if NDA/Fee are already signed — don't show popup if so
  const { data: agreementStatus } = useMyAgreementStatus();

  // Track which notification IDs we've already shown the modal for
  const shownAlertIdsRef = useRef<Set<string>>(new Set());

  // Show big modal popup when new agreement_pending notifications arrive
  useEffect(() => {
    // Don't re-trigger while modal is already open
    if (alertModalOpen) return;

    const dismissed = getDismissedSet();
    const agreementNotifications = notifications.filter(
      (n) =>
        n.notification_type === 'agreement_pending' &&
        !n.is_read &&
        !dismissed.has(n.id) &&
        !shownAlertIdsRef.current.has(n.id),
    );

    for (const n of agreementNotifications) {
      const docType = n.metadata?.document_type as string;
      const isNda = docType !== 'fee_agreement';

      // Skip if already signed
      if (isNda && agreementStatus?.nda_covered) {
        markAsRead.mutate(n.id);
        continue;
      }
      if (!isNda && agreementStatus?.fee_covered) {
        markAsRead.mutate(n.id);
        continue;
      }

      shownAlertIdsRef.current.add(n.id);
      setAlertDocType(isNda ? 'nda' : 'fee_agreement');
      setCurrentAlertNotificationId(n.id);
      setAlertModalOpen(true);
      break; // Show one at a time
    }
  }, [notifications, agreementStatus, alertModalOpen]);

  const handleDismissAlert = useCallback(() => {
    if (currentAlertNotificationId) {
      addDismissed(currentAlertNotificationId);
      markAsRead.mutate(currentAlertNotificationId);
    }
    setAlertModalOpen(false);
    setCurrentAlertNotificationId(null);
  }, [currentAlertNotificationId, markAsRead]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'memo_shared':
        return <FileText className="w-4 h-4 text-blue-600" />;
      case 'document_uploaded':
        return <FolderOpen className="w-4 h-4 text-amber-600" />;
      case 'status_changed':
      case 'request_approved':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'new_message':
        return <MessageSquare className="w-4 h-4 text-primary" />;
      case 'agreement_pending':
        return <FileSignature className="w-4 h-4 text-amber-600" />;
      case 'request_created':
        return <Bell className="w-4 h-4 text-blue-500" />;
      default:
        return <Bell className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const handleClick = (n: UserNotification) => {
    if (!n.is_read) {
      markAsRead.mutate(n.id);
    }

    if (n.notification_type === 'memo_shared') {
      if (n.connection_request_id) {
        navigate(`/deals/${n.connection_request_id}`);
      } else if (n.metadata?.deal_slug) {
        navigate(`/marketplace/${n.metadata.deal_slug}`);
      }
    } else if (n.notification_type === 'document_uploaded') {
      if (n.metadata?.deal_id) {
        navigate(`/my-requests?deal=${n.metadata.deal_id}&tab=documents`);
      }
    } else if (n.notification_type === 'new_message' && n.connection_request_id) {
      navigate(`/messages?deal=${n.connection_request_id}`);
    } else if (n.notification_type === 'agreement_pending') {
      navigate('/profile?tab=documents');
    } else if (n.notification_type === 'request_approved' && n.connection_request_id) {
      navigate(`/deals/${n.connection_request_id}`);
    } else if (n.connection_request_id) {
      navigate(`/deals/${n.connection_request_id}`);
    }

    setOpen(false);
  };

  const handleMarkAllRead = () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length > 0) {
      markAsRead.mutate(unreadIds);
    }
  };

  const hasUnread = unreadCount > 0;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={`Notifications ${hasUnread ? `(${unreadCount} unread)` : ''}`}
          >
            <Bell className="h-5 w-5" />
            {hasUnread && (
              <span className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 sm:w-96 p-0" align="end">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {hasUnread && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                Mark all as read
              </Button>
            )}
          </div>

          <ScrollArea className="max-h-[400px]">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.slice(0, 20).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      'w-full px-4 py-3 text-left transition-colors hover:bg-muted/50',
                      !n.is_read && 'bg-primary/5',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0">{getIcon(n.notification_type)}</div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-snug">{n.title}</p>
                          {!n.is_read && (
                            <span className="flex-shrink-0 h-2 w-2 rounded-full bg-primary mt-1" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
                          <Clock className="w-3 h-3" />
                          <span>
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {notifications.length > 0 && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                className="w-full justify-center text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  navigate('/messages');
                  setOpen(false);
                }}
              >
                View all messages →
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <AgreementAlertModal
        open={alertModalOpen}
        documentType={alertDocType}
        onDismiss={handleDismissAlert}
      />
    </>
  );
}
