import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Star, TrendingUp, Clock, User, Calendar, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import type { CallScore } from '@/hooks/useCallHighlights';

interface CallScoreCardProps {
  listingId: string;
}

const SCORE_DIMENSIONS = [
  { key: 'opener_tone', label: 'Opener & Tone' },
  { key: 'call_structure', label: 'Call Structure' },
  { key: 'discovery_quality', label: 'Discovery Quality' },
  { key: 'objection_handling', label: 'Objection Handling' },
  { key: 'closing_next_step', label: 'Closing / Next Step' },
  { key: 'value_proposition', label: 'Value Proposition' },
] as const;

function scoreColor(score: number | null): string {
  if (score == null) return 'text-muted-foreground';
  if (score > 70) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

// @ts-ignore - kept for future use
function _scoreBg(score: number | null): string {
  if (score == null) return 'bg-muted';
  if (score > 70) return 'bg-emerald-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function scoreBarClass(score: number | null): string {
  if (score == null) return '[&>div]:bg-muted-foreground/30';
  if (score > 70) return '[&>div]:bg-emerald-500';
  if (score >= 50) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-red-500';
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function useCallScoresForListing(listingId: string) {
  return useQuery<CallScore[]>({
    queryKey: ['call-scores-listing', listingId],
    queryFn: async () => {
      // Step 1: Get contact_activity IDs for this listing
      const { data: activities, error: actErr } = await supabase
        .from('contact_activities')
        .select('id')
        .eq('listing_id', listingId)
        .eq('source_system', 'phoneburner');

      if (actErr) throw actErr;
      if (!activities || activities.length === 0) return [];

      const activityIds = activities.map((a: { id: string }) => a.id);

      // Step 2: Query call_scores matching those activity IDs
      const { data: scores, error: scErr } = await untypedFrom('call_scores')
        .select('*')
        .in('contact_activity_id', activityIds)
        .not('composite_score', 'is', null)
        .order('call_date', { ascending: false });

      if (scErr) throw scErr;
      return (scores || []) as CallScore[];
    },
    enabled: !!listingId,
    staleTime: 60_000,
  });
}

function ScoreDimensionBar({ label, score }: { label: string; score: number | null }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-32 shrink-0 text-right">{label}</span>
      <Progress value={score ?? 0} className={`h-2 flex-1 ${scoreBarClass(score)}`} />
      <span className={`text-xs font-medium w-8 text-right ${scoreColor(score)}`}>
        {score ?? '--'}
      </span>
    </div>
  );
}

function SingleScoreDisplay({ score }: { score: CallScore }) {
  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        {score.rep_name && (
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {score.rep_name}
          </span>
        )}
        {score.call_date && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {format(new Date(score.call_date), 'MMM d, yyyy h:mm a')}
          </span>
        )}
        {score.call_duration_seconds && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(score.call_duration_seconds)}
          </span>
        )}
        {score.disposition && (
          <Badge variant="secondary" className="text-[10px]">
            {score.disposition}
          </Badge>
        )}
      </div>

      {/* Dimension bars */}
      <div className="space-y-2">
        {SCORE_DIMENSIONS.map((dim) => (
          <ScoreDimensionBar
            key={dim.key}
            label={dim.label}
            score={score[dim.key] as number | null}
          />
        ))}
      </div>

      {/* AI Summary */}
      {score.ai_summary && (
        <div className="rounded-md bg-muted/50 p-3 text-xs text-foreground">
          <p className="font-medium text-muted-foreground mb-1 flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            AI Summary
          </p>
          {score.ai_summary}
        </div>
      )}
    </div>
  );
}

export function CallScoreCard({ listingId }: CallScoreCardProps) {
  const { data: scores = [], isLoading } = useCallScoresForListing(listingId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4" />
            Call Quality Scores
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (scores.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4" />
            Call Quality Scores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No scored calls for this deal</p>
            <p className="text-xs mt-1">Call scores appear after AI analysis of completed calls</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate averages
  const avg = (key: keyof CallScore) => {
    const vals = scores.map((s) => s[key] as number | null).filter((v): v is number => v != null);
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };

  const avgComposite = avg('composite_score');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4" />
            Call Quality Scores
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {scores.length} scored call{scores.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Average composite score */}
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className={`text-3xl font-bold ${scoreColor(avgComposite)}`}>
              {avgComposite ?? '--'}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Avg Score
            </div>
          </div>

          {/* Average dimension bars */}
          <div className="flex-1 space-y-1.5">
            {SCORE_DIMENSIONS.map((dim) => (
              <ScoreDimensionBar
                key={dim.key}
                label={dim.label}
                score={avg(dim.key as keyof CallScore)}
              />
            ))}
          </div>
        </div>

        {/* Individual calls */}
        {scores.length === 1 ? (
          <div className="border-t pt-4">
            <SingleScoreDisplay score={scores[0]} />
          </div>
        ) : (
          <Accordion type="single" collapsible className="border-t pt-2">
            {scores.map((score) => (
              <AccordionItem key={score.id} value={score.id}>
                <AccordionTrigger className="py-2 text-sm hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <span className={`font-bold ${scoreColor(score.composite_score)}`}>
                      {score.composite_score ?? '--'}
                    </span>
                    <span className="text-muted-foreground">
                      {score.rep_name}
                      {score.call_date && ` - ${format(new Date(score.call_date), 'MMM d, yyyy')}`}
                    </span>
                    {score.disposition && (
                      <Badge variant="secondary" className="text-[10px]">
                        {score.disposition}
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <SingleScoreDisplay score={score} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
