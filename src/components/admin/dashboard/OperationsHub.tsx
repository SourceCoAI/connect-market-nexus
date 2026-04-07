import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileSignature,
  MessageSquare,
  Link2,
  UserCheck,
  FolderOpen,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

// ─── Helpers ───

function timeAgo(date: string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

function CountBadge({ count }: { count: number }) {
  return (
    <Badge variant={count > 0 ? 'destructive' : 'secondary'} className="ml-auto text-xs">
      {count}
    </Badge>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground/60">
      <CheckCircle2 className="h-4 w-4" />
      All caught up
    </div>
  );
}

function CardLoading() {
  return (
    <div className="flex items-center justify-center py-6">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}

// ─── Document Signing Card ───

function DocumentSigningCard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['ops-hub-doc-requests'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_requests')
        .select('id, firm_id, document_type, status, created_at, firm_agreements!inner(firm_name)')
        .in('status', ['requested', 'email_sent'])
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Document Signing</CardTitle>
          <CountBadge count={data?.length ?? 0} />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <CardLoading />
        ) : !data?.length ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {data.map((req: any) => (
              <div
                key={req.id}
                className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0"
              >
                <div className="min-w-0">
                  <span className="font-medium text-foreground">
                    {req.document_type === 'nda' ? 'NDA' : 'Fee Agreement'}
                  </span>
                  <span className="text-muted-foreground"> — {(req.firm_agreements as any)?.firm_name ?? 'Unknown'}</span>
                </div>
                <span className="text-xs text-muted-foreground/60 shrink-0 ml-2">
                  {timeAgo(req.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => navigate('/admin/documents')}
        >
          View All <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Unread Messages Card ───

function UnreadMessagesCard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['ops-hub-unread-messages'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_message_center_threads' as any);
      if (error) throw error;
      return (data as any[])?.filter((t: any) => t.unread_count > 0).slice(0, 5) ?? [];
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Unread Messages</CardTitle>
          <CountBadge count={data?.length ?? 0} />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <CardLoading />
        ) : !data?.length ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {data.map((t: any) => (
              <div
                key={t.connection_request_id}
                className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0"
              >
                <div className="min-w-0 truncate">
                  <span className="font-medium text-foreground">{t.buyer_name}</span>
                  {t.buyer_company && (
                    <span className="text-muted-foreground"> @ {t.buyer_company}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <Badge variant="destructive" className="text-[10px] h-5">
                    {t.unread_count}
                  </Badge>
                  <span className="text-xs text-muted-foreground/60">
                    {t.last_message_at ? timeAgo(t.last_message_at) : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => navigate('/admin/marketplace/messages')}
        >
          View All <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Connection Requests Card ───

function ConnectionRequestsCard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['ops-hub-pending-connections'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('connection_requests')
        .select('id, user_id, listing_id, created_at, profiles!inner(first_name, last_name), listings!inner(title)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Connection Requests</CardTitle>
          <CountBadge count={data?.length ?? 0} />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <CardLoading />
        ) : !data?.length ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {data.map((r: any) => (
              <div
                key={r.id}
                className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0"
              >
                <div className="min-w-0 truncate">
                  <span className="font-medium text-foreground">
                    {(r.profiles as any)?.first_name} {(r.profiles as any)?.last_name}
                  </span>
                  <span className="text-muted-foreground"> → {(r.listings as any)?.title ?? 'Unknown'}</span>
                </div>
                <span className="text-xs text-muted-foreground/60 shrink-0 ml-2">
                  {timeAgo(r.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => navigate('/admin/marketplace/requests')}
        >
          View All <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── User Approvals Card ───

function UserApprovalsCard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['ops-hub-pending-users'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, created_at')
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">User Approvals</CardTitle>
          <CountBadge count={data?.length ?? 0} />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <CardLoading />
        ) : !data?.length ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {data.map((u: any) => (
              <div
                key={u.id}
                className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0"
              >
                <div className="min-w-0 truncate">
                  <span className="font-medium text-foreground">
                    {u.first_name} {u.last_name}
                  </span>
                  <span className="text-muted-foreground"> — {u.email}</span>
                </div>
                <span className="text-xs text-muted-foreground/60 shrink-0 ml-2">
                  {timeAgo(u.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => navigate('/admin/marketplace/users')}
        >
          View All <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Data Room Access Card ───

function DataRoomAccessCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['ops-hub-data-room-access'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_data_room_access')
        .select('id, deal_id, buyer_name, buyer_company, can_view_teaser, can_view_full_memo, can_view_data_room, granted_at')
        .order('granted_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Recent Access Grants</CardTitle>
          <CountBadge count={data?.length ?? 0} />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <CardLoading />
        ) : !data?.length ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {data.map((a: any) => {
              const level = a.can_view_data_room
                ? 'Data Room'
                : a.can_view_full_memo
                  ? 'Full Memo'
                  : 'Teaser';
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0"
                >
                  <div className="min-w-0 truncate">
                    <span className="font-medium text-foreground">{a.buyer_name}</span>
                    {a.buyer_company && (
                      <span className="text-muted-foreground"> @ {a.buyer_company}</span>
                    )}
                    <Badge variant="secondary" className="ml-2 text-[10px] h-5">
                      {level}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground/60 shrink-0 ml-2">
                    {a.granted_at ? timeAgo(a.granted_at) : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Recent Data Room Activity Card ───

function DataRoomActivityCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['ops-hub-data-room-activity'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_room_audit_log')
        .select('id, action, user_id, document_id, created_at, metadata')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Data Room Activity</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <CardLoading />
        ) : !data?.length ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {data.map((log: any) => (
              <div
                key={log.id}
                className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0"
              >
                <div className="min-w-0 truncate">
                  <Badge variant="outline" className="text-[10px] h-5 mr-2">
                    {log.action}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {log.user_id?.slice(0, 8)}...
                  </span>
                </div>
                <span className="text-xs text-muted-foreground/60 shrink-0 ml-2">
                  {timeAgo(log.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Operations Hub ───

export function OperationsHub() {
  return (
    <div className="px-4 md:px-8 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DocumentSigningCard />
        <UnreadMessagesCard />
        <ConnectionRequestsCard />
        <UserApprovalsCard />
        <DataRoomAccessCard />
        <DataRoomActivityCard />
      </div>
    </div>
  );
}
