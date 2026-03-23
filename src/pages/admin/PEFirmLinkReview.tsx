import { useState } from 'react';
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
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowRight,
  Building2,
  Check,
  Link2,
  Plus,
  RefreshCw,
  SkipForward,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

interface ReviewQueueItem {
  id: string;
  platform_buyer_id: string;
  platform_name: string;
  pe_firm_name_raw: string;
  pe_firm_name_cleaned: string;
  candidate_matches: Array<{
    id: string;
    company_name: string;
    confidence_score: number;
  }> | null;
  ai_reasoning: string | null;
  confidence_score: number | null;
  status: string;
  created_at: string;
}

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color =
    score >= 70
      ? 'bg-green-100 text-green-700 border-green-200'
      : score >= 55
        ? 'bg-amber-100 text-amber-700 border-amber-200'
        : 'bg-red-100 text-red-700 border-red-200';

  return (
    <Badge variant="outline" className={`text-[10px] ${color}`}>
      {score}% confidence
    </Badge>
  );
}

export default function PEFirmLinkReview() {
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<ReviewQueueItem | null>(null);
  const [newFirmName, setNewFirmName] = useState('');

  // Fetch pending review queue
  const { data: queueItems = [], isLoading } = useQuery({
    queryKey: ['pe-link-review-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pe_backfill_review_queue')
        .select('*')
        .eq('status', 'pending')
        .order('confidence_score', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as ReviewQueueItem[];
    },
  });

  // Stats
  const { data: stats } = useQuery({
    queryKey: ['pe-link-review-stats'],
    queryFn: async () => {
      const [{ count: pending }, { count: approved }, { count: skipped }] = await Promise.all([
        supabase
          .from('pe_backfill_review_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('pe_backfill_review_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'approved'),
        supabase
          .from('pe_backfill_review_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'skipped'),
      ]);
      return { pending: pending || 0, approved: approved || 0, skipped: skipped || 0 };
    },
  });

  // Select candidate mutation
  const selectMutation = useMutation({
    mutationFn: async ({
      queueId,
      platformBuyerId,
      peFirmId,
    }: {
      queueId: string;
      platformBuyerId: string;
      peFirmId: string;
    }) => {
      // Set parent_pe_firm_id on the platform company
      const { error: linkError } = await supabase
        .from('remarketing_buyers')
        .update({
          parent_pe_firm_id: peFirmId,
          is_pe_backed: true,
          backfill_status: 'done',
        })
        .eq('id', platformBuyerId);

      if (linkError) throw linkError;

      // Update review queue
      const { error: queueError } = await supabase
        .from('pe_backfill_review_queue')
        .update({
          status: 'approved',
          chosen_pe_firm_id: peFirmId,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', queueId);

      if (queueError) throw queueError;
    },
    onSuccess: () => {
      toast.success('PE firm linked successfully');
      queryClient.invalidateQueries({ queryKey: ['pe-link-review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['pe-link-review-stats'] });
    },
    onError: (err) => {
      toast.error('Failed to link: ' + (err instanceof Error ? err.message : 'Unknown error'));
    },
  });

  // Skip mutation
  const skipMutation = useMutation({
    mutationFn: async ({
      queueId,
      platformBuyerId,
    }: {
      queueId: string;
      platformBuyerId: string;
    }) => {
      await supabase
        .from('pe_backfill_review_queue')
        .update({ status: 'skipped', resolved_at: new Date().toISOString() })
        .eq('id', queueId);

      await supabase
        .from('remarketing_buyers')
        .update({ backfill_status: 'unresolvable' } as never)
        .eq('id', platformBuyerId);
    },
    onSuccess: () => {
      toast.success('Item skipped');
      queryClient.invalidateQueries({ queryKey: ['pe-link-review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['pe-link-review-stats'] });
    },
  });

  // Create new PE firm + link mutation
  const createAndLinkMutation = useMutation({
    mutationFn: async ({
      queueId,
      platformBuyerId,
      firmName,
    }: {
      queueId: string;
      platformBuyerId: string;
      firmName: string;
    }) => {
      // Create new PE firm record
      const { data: newFirm, error: createError } = await supabase
        .from('remarketing_buyers')
        .insert({
          company_name: firmName,
          buyer_type: 'private_equity',
          buyer_type_source: 'import',
          archived: false,
        })
        .select('id')
        .single();

      if (createError || !newFirm) throw createError || new Error('Failed to create PE firm');

      // Link platform company to new PE firm
      const { error: linkError } = await supabase
        .from('remarketing_buyers')
        .update({
          parent_pe_firm_id: newFirm.id,
          is_pe_backed: true,
          backfill_status: 'done',
        })
        .eq('id', platformBuyerId);

      if (linkError) throw linkError;

      // Update review queue
      await supabase
        .from('pe_backfill_review_queue')
        .update({
          status: 'approved',
          chosen_pe_firm_id: newFirm.id,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', queueId);

      return newFirm.id;
    },
    onSuccess: () => {
      toast.success('PE firm created and linked');
      queryClient.invalidateQueries({ queryKey: ['pe-link-review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['pe-link-review-stats'] });
      setCreateModalOpen(false);
      setActiveItem(null);
      setNewFirmName('');
    },
    onError: (err) => {
      toast.error('Failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    },
  });

  // Run backfill
  const runBackfill = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('backfill-pe-platform-links', {
        body: { batch_size: 50 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `Backfill complete: ${data?.stats?.auto_linked || 0} linked, ${data?.stats?.flagged_for_review || 0} flagged`,
      );
      queryClient.invalidateQueries({ queryKey: ['pe-link-review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['pe-link-review-stats'] });
    },
    onError: (err) => {
      toast.error('Backfill failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    },
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Link2 className="h-6 w-6" />
            PE Firm Link Review
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and confirm PE firm → platform company relationships
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => runBackfill.mutate()}
          disabled={runBackfill.isPending}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${runBackfill.isPending ? 'animate-spin' : ''}`} />
          {runBackfill.isPending ? 'Running...' : 'Run Backfill'}
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Target className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.pending ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Pending Review</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Check className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.approved ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <SkipForward className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.skipped ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Skipped</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Queue Items */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : queueItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Check className="h-10 w-10 text-green-500" />
            <p className="text-lg font-medium">All caught up!</p>
            <p className="text-sm text-muted-foreground">No pending PE firm links to review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {queueItems.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Platform info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        to={`/admin/buyers/${item.platform_buyer_id}`}
                        className="font-semibold text-sm hover:underline"
                      >
                        {item.platform_name}
                      </Link>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        PE firm: <strong>{item.pe_firm_name_cleaned}</strong>
                      </span>
                      <ConfidenceBadge score={item.confidence_score} />
                    </div>
                    {item.pe_firm_name_raw !== item.pe_firm_name_cleaned && (
                      <p className="text-xs text-muted-foreground">
                        Raw: "{item.pe_firm_name_raw}"
                      </p>
                    )}
                    {item.ai_reasoning && (
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        {item.ai_reasoning}
                      </p>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        setActiveItem(item);
                        setNewFirmName(item.pe_firm_name_cleaned);
                        setCreateModalOpen(true);
                      }}
                    >
                      <Plus className="h-3 w-3" />
                      Create New
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() =>
                        skipMutation.mutate({
                          queueId: item.id,
                          platformBuyerId: item.platform_buyer_id,
                        })
                      }
                      disabled={skipMutation.isPending}
                    >
                      <SkipForward className="h-3 w-3 mr-1" />
                      Skip
                    </Button>
                  </div>
                </div>

                {/* Candidate matches */}
                {item.candidate_matches && item.candidate_matches.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.candidate_matches.map((candidate) => (
                      <button
                        key={candidate.id}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md border hover:bg-muted transition-colors"
                        onClick={() =>
                          selectMutation.mutate({
                            queueId: item.id,
                            platformBuyerId: item.platform_buyer_id,
                            peFirmId: candidate.id,
                          })
                        }
                        disabled={selectMutation.isPending}
                      >
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{candidate.company_name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {candidate.confidence_score}%
                        </Badge>
                        <Check className="h-3 w-3 text-green-600" />
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create New PE Firm Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New PE Firm</DialogTitle>
            <DialogDescription>
              Create a new PE firm record and link it to {activeItem?.platform_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="firmName">PE Firm Name</Label>
              <Input
                id="firmName"
                value={newFirmName}
                onChange={(e) => setNewFirmName(e.target.value)}
                placeholder="PE firm name"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => {
                if (!activeItem || !newFirmName.trim()) return;
                createAndLinkMutation.mutate({
                  queueId: activeItem.id,
                  platformBuyerId: activeItem.platform_buyer_id,
                  firmName: newFirmName.trim(),
                });
              }}
              disabled={createAndLinkMutation.isPending || !newFirmName.trim()}
            >
              {createAndLinkMutation.isPending ? 'Creating...' : 'Create & Link'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
