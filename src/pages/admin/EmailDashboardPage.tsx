import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, CheckCircle, XCircle, AlertTriangle, Eye, Search, BookOpen } from 'lucide-react';
import { format } from 'date-fns';
import { EmailCatalog } from '@/components/admin/emails/EmailCatalog';

type TimeRange = '24h' | '7d' | '30d' | 'all';

const STATUS_BADGES: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  queued: { variant: 'outline', label: 'Queued' },
  accepted: { variant: 'secondary', label: 'Accepted' },
  delivered: { variant: 'default', label: 'Delivered' },
  opened: { variant: 'default', label: 'Opened' },
  clicked: { variant: 'default', label: 'Clicked' },
  bounced: { variant: 'destructive', label: 'Bounced' },
  failed: { variant: 'destructive', label: 'Failed' },
  blocked: { variant: 'destructive', label: 'Blocked' },
  spam: { variant: 'destructive', label: 'Spam' },
};

function getTimeRangeDate(range: TimeRange): string | null {
  if (range === 'all') return null;
  const now = new Date();
  if (range === '24h') now.setHours(now.getHours() - 24);
  else if (range === '7d') now.setDate(now.getDate() - 7);
  else if (range === '30d') now.setDate(now.getDate() - 30);
  return now.toISOString();
}

export default function EmailDashboardPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ['admin-emails', timeRange],
    queryFn: async () => {
      let query = supabase
        .from('outbound_emails')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      const since = getTimeRangeDate(timeRange);
      if (since) query = query.gte('created_at', since);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: suppressedCount = 0 } = useQuery({
    queryKey: ['suppressed-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('suppressed_emails')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  const templates = useMemo(() => {
    const set = new Set(emails.map((e: any) => e.template_name).filter(Boolean));
    return Array.from(set).sort();
  }, [emails]);

  const filtered = useMemo(() => {
    return emails.filter((e: any) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (templateFilter !== 'all' && e.template_name !== templateFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          e.recipient_email?.toLowerCase().includes(q) ||
          e.subject?.toLowerCase().includes(q) ||
          e.template_name?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [emails, statusFilter, templateFilter, searchQuery]);

  const stats = useMemo(() => {
    const s = { total: filtered.length, delivered: 0, failed: 0, opened: 0, accepted: 0 };
    for (const e of filtered) {
      if (e.status === 'delivered') s.delivered++;
      else if (e.status === 'opened' || e.status === 'clicked') { s.opened++; s.delivered++; }
      else if (['failed', 'bounced', 'blocked', 'spam'].includes(e.status)) s.failed++;
      else if (e.status === 'accepted') s.accepted++;
    }
    return s;
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Email Dashboard</h1>
        <p className="text-muted-foreground">Monitor all platform email delivery across every function</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Delivered</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.delivered}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Opened</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.opened}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-muted-foreground">Failed</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.failed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span className="text-sm text-muted-foreground">Suppressed</span>
            </div>
            <p className="text-2xl font-bold mt-1">{suppressedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex gap-1">
          {(['24h', '7d', '30d', 'all'] as TimeRange[]).map(r => (
            <Button key={r} size="sm" variant={timeRange === r ? 'default' : 'outline'} onClick={() => setTimeRange(r)}>
              {r === '24h' ? '24h' : r === '7d' ? '7 days' : r === '30d' ? '30 days' : 'All'}
            </Button>
          ))}
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="opened">Opened</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="bounced">Bounced</SelectItem>
          </SelectContent>
        </Select>
        <Select value={templateFilter} onValueChange={setTemplateFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Template" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All templates</SelectItem>
            {templates.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search recipient or subject..." className="pl-8" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No emails found</TableCell></TableRow>
              ) : (
                filtered.slice(0, 100).map((email: any) => {
                  const badge = STATUS_BADGES[email.status] || { variant: 'outline' as const, label: email.status };
                  return (
                    <TableRow key={email.id}>
                      <TableCell className="font-mono text-xs">{email.template_name}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{email.recipient_email}</TableCell>
                      <TableCell className="max-w-[250px] truncate">{email.subject}</TableCell>
                      <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {email.created_at ? format(new Date(email.created_at), 'MMM d, HH:mm') : '-'}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-destructive">{email.last_error || '-'}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
