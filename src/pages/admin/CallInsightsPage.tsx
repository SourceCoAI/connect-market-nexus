import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart3,
  Phone,
  TrendingUp,
  MessageSquare,
  Target,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

// ─── Types ──────────────────────────────────────────────────────────────────
interface CallScore {
  id: string;
  contact_activity_id: string | null;
  rep_name: string | null;
  call_classification: string | null;
  overall_quality: number | null;
  opener_quality_rating: number | null;
  discovery_quality_rating: number | null;
  interest_level_rating: number | null;
  objection_handling_rating: number | null;
  talk_listen_ratio_rating: number | null;
  closing_rating: number | null;
  decision_maker_rating: number | null;
  script_adherence_rating: number | null;
  value_proposition_rating: number | null;
  rapport_rating: number | null;
  estimated_rep_talk_pct: number | null;
  objection_resolution_rate: number | null;
  call_summary: string | null;
  top_coaching_point: string | null;
  objection_log: string | null;
  interest_type: string | null;
  next_step_agreed: string | null;
  scoring_error: string | null;
  scored_at: string;
  call_duration_seconds: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function ratingColor(val: number | null): string {
  if (val === null) return 'text-muted-foreground';
  if (val >= 8) return 'text-green-600';
  if (val >= 5) return 'text-yellow-600';
  return 'text-red-600';
}

function RatingBadge({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  const bg =
    value >= 8 ? 'bg-green-100 text-green-800' : value >= 5 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${ratingColor(value)}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function CallInsightsPage() {
  const [repFilter, setRepFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch all scores
  const {
    data: scores,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['call-quality-scores', repFilter],
    queryFn: async () => {
      let query = (supabase as any)
        .from('call_quality_scores')
        .select('*')
        .order('scored_at', { ascending: false })
        .limit(200);

      if (repFilter && repFilter !== 'all') {
        query = query.eq('rep_name', repFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CallScore[];
    },
  });

  // Unique rep names for filter
  const repNames = Array.from(new Set((scores || []).map((s) => s.rep_name).filter(Boolean))) as string[];

  // Aggregate stats (connections only)
  const connections = (scores || []).filter((s) => s.call_classification === 'Connection');
  const avgOverall =
    connections.length > 0
      ? (connections.reduce((sum, s) => sum + (s.overall_quality || 0), 0) / connections.length).toFixed(1)
      : '—';

  const totalScored = (scores || []).length;
  const voicemails = (scores || []).filter((s) => s.call_classification === 'Voicemail drop').length;
  const gatekeepers = (scores || []).filter((s) => s.call_classification === 'Gatekeeper').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Call Quality Insights
          </h1>
          <p className="text-sm text-muted-foreground">
            AI-scored call quality across 16 M&A cold call categories
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={repFilter} onValueChange={setRepFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Reps" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reps</SelectItem>
              {repNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard icon={Phone} label="Total Scored" value={totalScored} />
        <StatCard icon={Target} label="Connections" value={connections.length} />
        <StatCard icon={TrendingUp} label="Avg Quality" value={avgOverall} subtitle="Connections only" />
        <StatCard icon={MessageSquare} label="Voicemails" value={voicemails} />
        <StatCard icon={Phone} label="Gatekeepers" value={gatekeepers} />
      </div>

      {/* Rep Leaderboard (if multiple reps) */}
      {repFilter === 'all' && repNames.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Rep Leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {repNames
                .map((name) => {
                  const repConnections = connections.filter((s) => s.rep_name === name);
                  const avg =
                    repConnections.length > 0
                      ? (
                          repConnections.reduce((sum, s) => sum + (s.overall_quality || 0), 0) /
                          repConnections.length
                        ).toFixed(1)
                      : '—';
                  return { name, count: repConnections.length, avg };
                })
                .sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg))
                .map((rep) => (
                  <div
                    key={rep.name}
                    className="p-3 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => setRepFilter(rep.name)}
                  >
                    <div className="font-medium text-sm">{rep.name}</div>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-xl font-bold ${ratingColor(parseFloat(rep.avg))}`}>
                        {rep.avg}
                      </span>
                      <span className="text-xs text-muted-foreground">{rep.count} calls</span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scores Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading scores...</div>
          ) : !scores?.length ? (
            <div className="p-8 text-center text-muted-foreground">
              No scored calls yet. Scores appear automatically after PhoneBurner calls with transcripts.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Rep</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Overall</TableHead>
                  <TableHead className="text-center">Opener</TableHead>
                  <TableHead className="text-center">Discovery</TableHead>
                  <TableHead className="text-center">Interest</TableHead>
                  <TableHead className="text-center">Objections</TableHead>
                  <TableHead className="text-center">Closing</TableHead>
                  <TableHead className="text-center">Rapport</TableHead>
                  <TableHead>Coaching</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scores.map((score) => {
                  const isExpanded = expandedId === score.id;
                  return (
                    <>
                      <TableRow
                        key={score.id}
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => setExpandedId(isExpanded ? null : score.id)}
                      >
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(score.scored_at), 'MMM d, h:mm a')}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {score.rep_name || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              score.call_classification === 'Connection'
                                ? 'default'
                                : 'secondary'
                            }
                            className="text-xs"
                          >
                            {score.call_classification || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {score.overall_quality !== null ? (
                            <span className={`font-bold ${ratingColor(score.overall_quality)}`}>
                              {score.overall_quality}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className={`text-center ${ratingColor(score.opener_quality_rating)}`}>
                          {score.opener_quality_rating ?? '—'}
                        </TableCell>
                        <TableCell className={`text-center ${ratingColor(score.discovery_quality_rating)}`}>
                          {score.discovery_quality_rating ?? '—'}
                        </TableCell>
                        <TableCell className={`text-center ${ratingColor(score.interest_level_rating)}`}>
                          {score.interest_level_rating ?? '—'}
                        </TableCell>
                        <TableCell className={`text-center ${ratingColor(score.objection_handling_rating)}`}>
                          {score.objection_handling_rating ?? '—'}
                        </TableCell>
                        <TableCell className={`text-center ${ratingColor(score.closing_rating)}`}>
                          {score.closing_rating ?? '—'}
                        </TableCell>
                        <TableCell className={`text-center ${ratingColor(score.rapport_rating)}`}>
                          {score.rapport_rating ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">
                          {score.top_coaching_point || score.scoring_error || '—'}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${score.id}-detail`}>
                          <TableCell colSpan={11} className="bg-muted/30 p-4">
                            <div className="space-y-4">
                              {/* Rating grid */}
                              <div className="grid grid-cols-5 md:grid-cols-10 gap-4">
                                <RatingBadge value={score.opener_quality_rating} label="Opener" />
                                <RatingBadge value={score.discovery_quality_rating} label="Discovery" />
                                <RatingBadge value={score.interest_level_rating} label="Interest" />
                                <RatingBadge value={score.objection_handling_rating} label="Objections" />
                                <RatingBadge value={score.talk_listen_ratio_rating} label="Talk/Listen" />
                                <RatingBadge value={score.closing_rating} label="Closing" />
                                <RatingBadge value={score.decision_maker_rating} label="DM Check" />
                                <RatingBadge value={score.script_adherence_rating} label="Script" />
                                <RatingBadge value={score.value_proposition_rating} label="Value Prop" />
                                <RatingBadge value={score.rapport_rating} label="Rapport" />
                              </div>

                              {/* Details */}
                              <div className="grid md:grid-cols-2 gap-4 text-sm">
                                {score.call_summary && (
                                  <div>
                                    <div className="font-medium mb-1">Call Summary</div>
                                    <div className="text-muted-foreground">{score.call_summary}</div>
                                  </div>
                                )}
                                {score.top_coaching_point && (
                                  <div>
                                    <div className="font-medium mb-1">Top Coaching Point</div>
                                    <div className="text-muted-foreground">{score.top_coaching_point}</div>
                                  </div>
                                )}
                                {score.objection_log && score.objection_log !== 'None raised' && (
                                  <div>
                                    <div className="font-medium mb-1">
                                      Objections (Resolution: {score.objection_resolution_rate ?? '—'}%)
                                    </div>
                                    <div className="text-muted-foreground">{score.objection_log}</div>
                                  </div>
                                )}
                                {score.next_step_agreed && (
                                  <div>
                                    <div className="font-medium mb-1">Next Step Agreed</div>
                                    <div className="text-muted-foreground">{score.next_step_agreed}</div>
                                  </div>
                                )}
                                {score.estimated_rep_talk_pct !== null && (
                                  <div>
                                    <div className="font-medium mb-1">Rep Talk %</div>
                                    <div className="text-muted-foreground">
                                      {score.estimated_rep_talk_pct}% (ideal: 30-40%)
                                    </div>
                                  </div>
                                )}
                                {score.interest_type && (
                                  <div>
                                    <div className="font-medium mb-1">Interest Type</div>
                                    <Badge variant="outline">{score.interest_type}</Badge>
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
