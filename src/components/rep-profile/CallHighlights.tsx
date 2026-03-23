import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Play, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCallHighlights, generateCallSummary, type CallScore } from '@/hooks/useCallHighlights';

interface CallHighlightsProps {
  repName: string | null;
  dateRange: { from: Date; to: Date } | null;
}

const DIMENSIONS: { key: keyof CallScore; label: string }[] = [
  { key: 'opener_tone', label: 'Opener & Tone' },
  { key: 'call_structure', label: 'Call Structure' },
  { key: 'discovery_quality', label: 'Discovery' },
  { key: 'objection_handling', label: 'Objection' },
  { key: 'closing_next_step', label: 'Closing' },
  { key: 'value_proposition', label: 'Value Prop' },
];

function formatDuration(seconds: number | null): string {
  if (!seconds) return '0m 0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getScoreBadgeColor(score: number | null): string {
  if (score === null) return 'bg-gray-200 text-gray-700';
  if (score >= 7) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (score >= 4) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-red-100 text-red-800 border-red-200';
}

function CallCard({ call, variant }: { call: CallScore; variant: 'top' | 'bottom' }) {
  const [summary, setSummary] = useState<string | null>(call.ai_summary);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    if (!call.ai_summary && call.composite_score !== null && !loadingSummary) {
      setLoadingSummary(true);
      generateCallSummary(call).then((s) => {
        setSummary(s);
        setLoadingSummary(false);
      });
    }
  }, [call.id]);

  const borderColor = variant === 'top' ? 'border-l-emerald-500' : 'border-l-red-500';

  return (
    <Card
      className={cn(
        'border-l-[3px] rounded-l-none overflow-hidden',
        borderColor,
      )}
    >
      <div className="p-4 space-y-3">
        {/* Header: contact name + score badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">
              {call.contact_name || 'Unknown Contact'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {call.company_name || ''}
              {call.company_name && call.call_date ? ' · ' : ''}
              {formatDate(call.call_date)}
              {call.call_duration_seconds ? ` · ${formatDuration(call.call_duration_seconds)}` : ''}
            </p>
          </div>
          <div
            className={cn(
              'flex items-center justify-center h-10 w-10 rounded-lg text-lg font-bold shrink-0 border',
              getScoreBadgeColor(call.composite_score),
            )}
          >
            {call.composite_score?.toFixed(1) ?? '—'}
          </div>
        </div>

        {/* Dimension breakdown: 2-column grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {DIMENSIONS.map(({ key, label }) => {
            const val = call[key] as number | null;
            return (
              <div key={key} className="flex items-center gap-1.5 text-xs">
                <span className="w-16 shrink-0 text-muted-foreground truncate">{label}</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded-full transition-all"
                    style={{ width: `${((val ?? 0) / 10) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right font-medium tabular-nums">
                  {val?.toFixed(1) ?? '—'}
                </span>
              </div>
            );
          })}
        </div>

        {/* AI Summary */}
        {(summary || loadingSummary) && (
          <div className="flex items-start gap-1.5 pt-1">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-semibold">
              <Sparkles className="h-2.5 w-2.5 mr-0.5" />
              AI
            </Badge>
            <p className="text-xs text-muted-foreground italic leading-relaxed">
              {loadingSummary ? 'Generating summary...' : summary}
            </p>
          </div>
        )}

        {/* Play button */}
        <div className="pt-1">
          {call.recording_url ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => window.open(call.recording_url!, '_blank')}
            >
              <Play className="h-3 w-3" />
              Play
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5 opacity-50"
                    disabled
                  >
                    <Play className="h-3 w-3" />
                    Play
                  </Button>
                </TooltipTrigger>
                <TooltipContent>No recording available</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </Card>
  );
}

export function CallHighlights({ repName, dateRange }: CallHighlightsProps) {
  const [activeTab, setActiveTab] = useState<'top' | 'bottom'>('top');
  const { data, isLoading } = useCallHighlights({ repName, dateRange });

  const topCalls = data?.top ?? [];
  const bottomCalls = data?.bottom ?? [];
  const activeCalls = activeTab === 'top' ? topCalls : bottomCalls;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Call highlights</h3>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b">
        <button
          onClick={() => setActiveTab('top')}
          className={cn(
            'flex items-center gap-1.5 pb-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'top'
              ? 'border-emerald-500 text-emerald-700'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Top 3 calls
        </button>
        <button
          onClick={() => setActiveTab('bottom')}
          className={cn(
            'flex items-center gap-1.5 pb-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'bottom'
              ? 'border-red-500 text-red-700'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="h-2 w-2 rounded-full bg-red-500" />
          Bottom 3 calls
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Loading call highlights...
        </div>
      ) : activeCalls.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          No scored calls in this period
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {activeCalls.map((call) => (
              <CallCard key={call.id} call={call} variant={activeTab} />
            ))}
          </div>
          {activeCalls.length < 3 && (
            <p className="text-xs text-muted-foreground">
              Only {activeCalls.length} call{activeCalls.length !== 1 ? 's' : ''} in this period
            </p>
          )}
        </>
      )}
    </div>
  );
}
