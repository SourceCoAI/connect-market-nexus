import { useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  Phone,
  FileText,
  FileCheck,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { ScoreBadge } from '@/components/shared/ScoreBadge';
import { OutreachTimeline } from '@/components/remarketing';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { ScoreTier } from '@/types/remarketing';
import { format } from 'date-fns';

const outcomeConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  in_progress: { label: 'In Progress', color: 'text-blue-600 bg-blue-50', icon: Clock },
  won: { label: 'Won', color: 'text-emerald-600 bg-emerald-50', icon: CheckCircle2 },
  lost: { label: 'Lost', color: 'text-red-600 bg-red-50', icon: XCircle },
  withdrawn: { label: 'Withdrawn', color: 'text-amber-600 bg-amber-50', icon: XCircle },
  no_response: { label: 'No Response', color: 'text-muted-foreground bg-muted', icon: Clock },
};

const ReMarketingIntroductions = () => {
  const { listingId } = useParams<{ listingId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // URL-persisted filter state (survives browser Back navigation)
  const [searchParams, setSearchParams] = useSearchParams();
  const filterOutcome = searchParams.get('outcome') ?? 'all';
  const setFilterOutcome = useCallback(
    (v: string) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'all') n.set('outcome', v);
          else n.delete('outcome');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Fetch listing
  const { data: listing, isLoading: listingLoading } = useQuery({
    queryKey: ['listing', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('id', listingId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!listingId,
  });

  // Fetch approved scores with outreach records
  const { data: introductions, isLoading } = useQuery({
    queryKey: ['remarketing', 'introductions', listingId],
    queryFn: async () => {
      // First get approved scores
      const { data: scores, error: scoresError } = await supabase
        .from('remarketing_scores')
        .select(
          `
          *,
          buyer:buyers(*)
        `,
        )
        .eq('listing_id', listingId!)
        .eq('status', 'approved')
        .order('composite_score', { ascending: false });

      if (scoresError) throw scoresError;

      // Then get outreach records
      const { data: outreachRecords, error: outreachError } = await supabase
        .from('outreach_records')
        .select('*')
        .eq('listing_id', listingId!);

      if (outreachError) throw outreachError;

      // Merge the data
      return (
        scores?.map((score) => ({
          ...score,
          outreach: outreachRecords?.find((o) => o.buyer_id === score.buyer_id) || null,
        })) || []
      );
    },
    enabled: !!listingId,
  });

  // Create or update outreach record
  const upsertOutreachMutation = useMutation({
    mutationFn: async ({
      buyerId,
      field,
      value,
    }: {
      buyerId: string;
      field: string;
      value: string | null;
    }) => {
      // Check if record exists
      const { data: existing, error: existingError } = await supabase
        .from('outreach_records')
        .select('id')
        .eq('listing_id', listingId!)
        .eq('buyer_id', buyerId)
        .single();
      if (existingError) throw existingError;

      const updates: Record<string, unknown> = {
        [field]: value,
        updated_at: new Date().toISOString(),
      };

      // Add user reference for certain fields
      if (field === 'contacted_at' && value) {
        updates.contacted_by = user?.id;
      } else if (field === 'nda_sent_at' && value) {
        updates.nda_sent_by = user?.id;
      } else if (field === 'cim_sent_at' && value) {
        updates.cim_sent_by = user?.id;
      }

      if (existing) {
        const { error } = await supabase
          .from('outreach_records')
          .update(updates)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('outreach_records').insert({
          listing_id: listingId!,
          buyer_id: buyerId,
          created_by: user?.id,
          ...updates,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'introductions', listingId] });
      toast.success('Status updated');
    },
    onError: () => {
      toast.error('Failed to update status');
    },
  });

  const handleCheckboxChange = (buyerId: string, field: string, checked: boolean) => {
    upsertOutreachMutation.mutate({
      buyerId,
      field,
      value: checked ? new Date().toISOString() : null,
    });
  };

  const handleOutcomeChange = (buyerId: string, outcome: string) => {
    upsertOutreachMutation.mutate({
      buyerId,
      field: 'outcome',
      value: outcome === 'none' ? null : outcome,
    });
  };

  // Filter introductions
  const filteredIntroductions = introductions?.filter((intro) => {
    if (filterOutcome === 'all') return true;
    if (filterOutcome === 'none') return !intro.outreach?.outcome;
    return intro.outreach?.outcome === filterOutcome;
  });

  // Stats
  const stats = {
    total: introductions?.length || 0,
    contacted: introductions?.filter((i) => i.outreach?.contacted_at).length || 0,
    ndaSigned: introductions?.filter((i) => i.outreach?.nda_signed_at).length || 0,
    meetings: introductions?.filter((i) => i.outreach?.meeting_scheduled_at).length || 0,
    won: introductions?.filter((i) => i.outreach?.outcome === 'won').length || 0,
  };

  if (listingLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/admin/remarketing/matching/${listingId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Introduction Tracker</h1>
          <p className="text-muted-foreground">
            Track outreach status for {listing?.title || 'this listing'}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-sm text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">{stats.contacted}</div>
            <p className="text-sm text-muted-foreground">Contacted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-purple-600">{stats.ndaSigned}</div>
            <p className="text-sm text-muted-foreground">NDA Signed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-600">{stats.meetings}</div>
            <p className="text-sm text-muted-foreground">Meetings</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-emerald-600">{stats.won}</div>
            <p className="text-sm text-muted-foreground">Won</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterOutcome} onValueChange={setFilterOutcome}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="none">No Outcome Yet</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
                <SelectItem value="withdrawn">Withdrawn</SelectItem>
                <SelectItem value="no_response">No Response</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {filteredIntroductions?.length || 0} buyers shown
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Introduction Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : filteredIntroductions?.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-muted-foreground">No approved buyers to track</p>
              <Button variant="link" asChild>
                <Link to={`/admin/remarketing/matching/${listingId}`}>Go to Deal Matching</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Buyer</TableHead>
                  <TableHead className="text-center w-[80px]">Score</TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      <span>Contacted</span>
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      <span>NDA Sent</span>
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <FileCheck className="h-3.5 w-3.5" />
                      <span>NDA Signed</span>
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      <span>Memo Sent</span>
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Meeting</span>
                    </div>
                  </TableHead>
                  <TableHead className="w-[150px]">Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIntroductions?.map((intro) => {
                  const tier = (intro.tier || 'D') as ScoreTier;
                  const outreach = intro.outreach;
                  void (outreach?.outcome ? outcomeConfig[outreach.outcome]?.icon : null); // OutcomeIcon reserved

                  return (
                    <TableRow key={intro.id}>
                      <TableCell>
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 p-1 -m-1 rounded">
                              <div>
                                <Link
                                  to={`/admin/buyers/${intro.buyer?.id}`}
                                  className="font-medium hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {intro.buyer?.company_name}
                                </Link>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <ScoreBadge
                                    variant="tier"
                                    tier={tier}
                                    size="sm"
                                    showLabel={false}
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    {intro.buyer?.buyer_type?.replace('_', ' ')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pt-2">
                            <OutreachTimeline
                              outreach={
                                (outreach ?? null) as React.ComponentProps<
                                  typeof OutreachTimeline
                                >['outreach']
                              }
                              className="pl-1"
                            />
                          </CollapsibleContent>
                        </Collapsible>
                      </TableCell>
                      <TableCell className="text-center">
                        <ScoreBadge
                          variant="numeric"
                          score={intro.composite_score || 0}
                          size="sm"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Checkbox
                            checked={!!outreach?.contacted_at}
                            onCheckedChange={(checked) =>
                              handleCheckboxChange(intro.buyer_id, 'contacted_at', !!checked)
                            }
                          />
                          {outreach?.contacted_at && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(outreach.contacted_at), 'MMM d')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Checkbox
                            checked={!!outreach?.nda_sent_at}
                            onCheckedChange={(checked) =>
                              handleCheckboxChange(intro.buyer_id, 'nda_sent_at', !!checked)
                            }
                          />
                          {outreach?.nda_sent_at && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(outreach.nda_sent_at), 'MMM d')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Checkbox
                            checked={!!outreach?.nda_signed_at}
                            onCheckedChange={(checked) =>
                              handleCheckboxChange(intro.buyer_id, 'nda_signed_at', !!checked)
                            }
                          />
                          {outreach?.nda_signed_at && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(outreach.nda_signed_at), 'MMM d')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Checkbox
                            checked={!!outreach?.cim_sent_at}
                            onCheckedChange={(checked) =>
                              handleCheckboxChange(intro.buyer_id, 'cim_sent_at', !!checked)
                            }
                          />
                          {outreach?.cim_sent_at && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(outreach.cim_sent_at), 'MMM d')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Checkbox
                            checked={!!outreach?.meeting_scheduled_at}
                            onCheckedChange={(checked) =>
                              handleCheckboxChange(
                                intro.buyer_id,
                                'meeting_scheduled_at',
                                !!checked,
                              )
                            }
                          />
                          {outreach?.meeting_scheduled_at && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(outreach.meeting_scheduled_at), 'MMM d')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={outreach?.outcome || 'none'}
                          onValueChange={(value) => handleOutcomeChange(intro.buyer_id, value)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Set outcome" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No outcome</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="won">Won</SelectItem>
                            <SelectItem value="lost">Lost</SelectItem>
                            <SelectItem value="withdrawn">Withdrawn</SelectItem>
                            <SelectItem value="no_response">No Response</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReMarketingIntroductions;
