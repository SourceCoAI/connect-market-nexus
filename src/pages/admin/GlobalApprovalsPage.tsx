/**
 * GlobalApprovalsPage: Cross-deal approval queue dashboard.
 *
 * Route: /admin/approvals
 * Shows all pending marketplace approval requests across all deals,
 * sorted newest-first, with approve/decline actions.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ShieldCheck,
  ShieldX,
  Clock,
  Building2,
  Mail,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';

interface ApprovalEntry {
  id: string;
  connection_request_id: string;
  deal_id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_firm: string | null;
  buyer_role: string | null;
  buyer_message: string | null;
  matched_buyer_id: string | null;
  match_confidence: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  decline_reason: string | null;
  decline_category: string | null;
  created_at: string;
  // Joined from listings
  deal_title?: string;
  project_name?: string;
}

export default function GlobalApprovalsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'pending' | 'approved' | 'declined' | 'all'>('pending');

  // Register AI Command Center context
  const { setPageContext } = useAICommandCenterContext();
  useEffect(() => {
    setPageContext({ page: 'approvals', entity_type: 'approvals' });
  }, [setPageContext]);
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ApprovalEntry | null>(null);
  const [declineCategory, setDeclineCategory] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [sendDeclineEmail, setSendDeclineEmail] = useState(true);

  // Fetch all approval queue entries across deals
  const { data: entries, isLoading } = useQuery({
    queryKey: ['global-approval-queue', filter],
    queryFn: async () => {
      let query = supabase
        .from('marketplace_approval_queue')
        .select(`
          *,
          listings:deal_id (
            title,
            internal_company_name,
            project_name
          )
        `)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;
      if (error) throw error;

      type QueueEntryWithListing = (typeof data)[number];
      return (data || []).map((entry: QueueEntryWithListing) => ({
        ...entry,
        deal_title: entry.listings?.internal_company_name || entry.listings?.title || 'Unknown Deal',
        project_name: entry.listings?.project_name,
      })) as ApprovalEntry[];
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const { data, error } = await supabase.functions.invoke('approve-marketplace-buyer', {
        body: { approval_queue_id: entryId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-approval-queue'] });
      toast.success('Buyer approved — teaser link generated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Decline mutation
  const declineMutation = useMutation({
    mutationFn: async (params: {
      entryId: string;
      category: string;
      reason: string;
      sendEmail: boolean;
    }) => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const { error } = await supabase
        .from('marketplace_approval_queue')
        .update({
          status: 'declined',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          decline_category: params.category || null,
          decline_reason: params.reason || null,
          decline_email_sent: params.sendEmail,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.entryId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-approval-queue'] });
      toast.success('Buyer declined');
      setDeclineDialogOpen(false);
      setSelectedEntry(null);
      setDeclineCategory('');
      setDeclineReason('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pendingCount = entries?.filter(e => e.status === 'pending').length || 0;

  const getMatchBadge = (confidence: string | null) => {
    if (confidence === 'email_exact') {
      return <Badge className="bg-green-100 text-green-700 border-green-200">Email Match</Badge>;
    }
    if (confidence === 'firm_name') {
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Firm Match</Badge>;
    }
    return <Badge variant="outline" className="text-gray-500">No Match</Badge>;
  };

  const getStatusBadge = (status: string) => {
    if (status === 'approved') {
      return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
    }
    if (status === 'declined') {
      return <Badge className="bg-red-100 text-red-700 border-red-200"><XCircle className="h-3 w-3 mr-1" />Declined</Badge>;
    }
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Marketplace Approvals</h1>
          <p className="text-muted-foreground text-sm">
            Review inbound buyer requests across all deals before releasing documents.
          </p>
        </div>
        {pendingCount > 0 && (
          <Badge variant="destructive" className="text-sm px-3 py-1">
            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
            {pendingCount} Pending
          </Badge>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['pending', 'approved', 'declined', 'all'] as const).map(f => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : !entries || entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldCheck className="h-12 w-12 mx-auto mb-4 text-green-400" />
            <h3 className="font-semibold text-lg">
              {filter === 'pending' ? 'No pending approvals' : 'No entries found'}
            </h3>
            <p className="text-muted-foreground text-sm">
              {filter === 'pending'
                ? 'All marketplace buyer requests have been reviewed.'
                : 'No approval entries match the current filter.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {entries.map(entry => (
            <Card key={entry.id} className={entry.status === 'pending' ? 'border-amber-200' : ''}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{entry.buyer_name}</span>
                      {entry.buyer_firm && (
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> {entry.buyer_firm}
                        </span>
                      )}
                      {getMatchBadge(entry.match_confidence)}
                      {getStatusBadge(entry.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {entry.buyer_email}
                      </span>
                      {entry.buyer_role && <span>{entry.buyer_role}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Deal:</span>
                      <Link
                        to={`/admin/deals/${entry.deal_id}`}
                        state={{ from: '/admin/approvals' }}
                        className="text-primary hover:underline font-medium"
                      >
                        {entry.deal_title}
                      </Link>
                      {entry.project_name && (
                        <Badge variant="outline" className="text-xs">
                          Project {entry.project_name}
                        </Badge>
                      )}
                    </div>
                    {entry.buyer_message && (
                      <p className="text-sm bg-muted/50 p-2 rounded text-muted-foreground italic">
                        "{entry.buyer_message}"
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Submitted {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
                      {entry.reviewed_at && (
                        <> — Reviewed {format(new Date(entry.reviewed_at), 'MMM d, yyyy h:mm a')}</>
                      )}
                    </p>
                    {entry.decline_reason && (
                      <p className="text-xs text-red-500">
                        Decline reason: {entry.decline_reason}
                      </p>
                    )}
                  </div>

                  {entry.status === 'pending' && (
                    <div className="flex gap-2 flex-shrink-0 ml-4">
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate(entry.id)}
                        disabled={approveMutation.isPending}
                      >
                        {approveMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => {
                          setSelectedEntry(entry);
                          setDeclineDialogOpen(true);
                        }}
                      >
                        <ShieldX className="h-3.5 w-3.5 mr-1" />
                        Decline
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Decline Dialog */}
      <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Buyer Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedEntry && (
              <p className="text-sm text-muted-foreground">
                Declining <strong>{selectedEntry.buyer_name}</strong>
                {selectedEntry.buyer_firm && ` from ${selectedEntry.buyer_firm}`} for deal{' '}
                <strong>{selectedEntry.deal_title}</strong>.
              </p>
            )}
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select value={declineCategory} onValueChange={setDeclineCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_qualified">Not Qualified</SelectItem>
                  <SelectItem value="wrong_size">Wrong Size/Fit</SelectItem>
                  <SelectItem value="competitor">Competitor</SelectItem>
                  <SelectItem value="duplicate">Duplicate Request</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Reason (optional)</label>
              <Textarea
                value={declineReason}
                onChange={e => setDeclineReason(e.target.value)}
                placeholder="Internal note about why this buyer was declined..."
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="sendDeclineEmail"
                checked={sendDeclineEmail}
                onCheckedChange={(checked) => setSendDeclineEmail(checked === true)}
              />
              <label htmlFor="sendDeclineEmail" className="text-sm">
                Send decline notification email to buyer
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedEntry) {
                  declineMutation.mutate({
                    entryId: selectedEntry.id,
                    category: declineCategory,
                    reason: declineReason,
                    sendEmail: sendDeclineEmail,
                  });
                }
              }}
              disabled={declineMutation.isPending}
            >
              {declineMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <ShieldX className="h-3.5 w-3.5 mr-1" />
              )}
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
