import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Plus,
  Upload,
  Sparkles,
  Loader2,
  X,
  AlertCircle,
  Target,
  RotateCcw,
  Clock,
  Unlink,
  Phone,
  Mail,
} from 'lucide-react';

interface EnrichmentProgress {
  current: number;
  total: number;
  startedAt?: number;
  successful?: number;
  failed?: number;
  creditsDepleted?: boolean;
  rateLimited?: boolean;
  resetTime?: string;
}

interface AlignmentProgress {
  current: number;
  total: number;
  successful?: number;
  failed?: number;
  creditsDepleted?: boolean;
  startTime?: number;
}

interface BuyerTableToolbarProps {
  buyerCount: number;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onAddBuyer?: () => void;
  onImportCSV?: () => void;
  onEnrichAll?: () => void;
  onCancelEnrichment?: () => void;
  onResetQueue?: () => void;
  onScoreAlignment?: () => void;
  onCancelAlignment?: () => void;
  isEnriching?: boolean;
  isScoringAlignment?: boolean;
  selectedCount?: number;
  onRemoveSelected?: () => void;
  isRemovingSelected?: boolean;
  onPushToDialer?: () => void;
  onPushToSmartlead?: () => void;
  enrichmentProgress?: EnrichmentProgress;
  alignmentProgress?: AlignmentProgress;
  hideSearch?: boolean;
  className?: string;
}

export const BuyerTableToolbar = ({
  buyerCount,
  searchValue,
  onSearchChange,
  onAddBuyer,
  onImportCSV,
  onEnrichAll,
  onCancelEnrichment,
  onResetQueue,
  onScoreAlignment,
  onCancelAlignment,
  isEnriching = false,
  isScoringAlignment = false,
  selectedCount = 0,
  onRemoveSelected,
  isRemovingSelected = false,
  onPushToDialer,
  onPushToSmartlead,
  enrichmentProgress,
  alignmentProgress,
  hideSearch = false,
  className = '',
}: BuyerTableToolbarProps) => {
  const showEnrichProgress = isEnriching && enrichmentProgress && enrichmentProgress.total > 0;
  const enrichProgressPercent = showEnrichProgress
    ? (enrichmentProgress.current / enrichmentProgress.total) * 100
    : 0;

  const showAlignmentProgress =
    isScoringAlignment && alignmentProgress && alignmentProgress.total > 0;
  const alignmentProgressPercent = showAlignmentProgress
    ? (alignmentProgress.current / alignmentProgress.total) * 100
    : 0;

  // ETA calculation for enrichment
  const [enrichElapsed, setEnrichElapsed] = useState(0);
  const enrichStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (isEnriching && enrichmentProgress && enrichmentProgress.current > 0) {
      if (!enrichStartRef.current) {
        enrichStartRef.current = enrichmentProgress.startedAt || Date.now();
      }
      const interval = setInterval(() => {
        if (enrichStartRef.current) {
          setEnrichElapsed(Math.floor((Date.now() - enrichStartRef.current) / 1000));
        }
      }, 1000);
      return () => clearInterval(interval);
    } else if (!isEnriching) {
      enrichStartRef.current = null;
      setEnrichElapsed(0);
    }
  }, [isEnriching, enrichmentProgress]);

  const getEnrichETA = () => {
    if (!enrichmentProgress || enrichmentProgress.current === 0 || enrichElapsed === 0) return null;
    const avgPerItem = enrichElapsed / enrichmentProgress.current;
    const remaining = enrichmentProgress.total - enrichmentProgress.current;
    const etaSec = Math.ceil(avgPerItem * remaining);
    if (etaSec < 60) return `~${etaSec}s left`;
    if (etaSec < 3600) return `~${Math.ceil(etaSec / 60)}m left`;
    const h = Math.floor(etaSec / 3600);
    const m = Math.ceil((etaSec % 3600) / 60);
    return `~${h}h ${m}m left`;
  };

  // Time estimation for alignment scoring
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const alignmentStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isScoringAlignment && alignmentProgress && alignmentProgress.current > 0) {
      // Set start time on first progress update
      if (!alignmentStartTimeRef.current) {
        alignmentStartTimeRef.current = alignmentProgress.startTime || Date.now();
      }

      const interval = setInterval(() => {
        if (alignmentStartTimeRef.current) {
          setElapsedSeconds(Math.floor((Date.now() - alignmentStartTimeRef.current) / 1000));
        }
      }, 1000);

      return () => clearInterval(interval);
    } else if (!isScoringAlignment) {
      // Reset when not scoring
      alignmentStartTimeRef.current = null;
      setElapsedSeconds(0);
    }
  }, [isScoringAlignment, alignmentProgress]);

  // Calculate ETA
  const getTimeEstimate = () => {
    if (!alignmentProgress || alignmentProgress.current === 0 || elapsedSeconds === 0) {
      return null;
    }

    const avgSecondsPerItem = elapsedSeconds / alignmentProgress.current;
    const remaining = alignmentProgress.total - alignmentProgress.current;
    const etaSeconds = Math.ceil(avgSecondsPerItem * remaining);

    if (etaSeconds < 60) {
      return `~${etaSeconds}s remaining`;
    } else if (etaSeconds < 3600) {
      const mins = Math.ceil(etaSeconds / 60);
      return `~${mins}m remaining`;
    } else {
      const hours = Math.floor(etaSeconds / 3600);
      const mins = Math.ceil((etaSeconds % 3600) / 60);
      return `~${hours}h ${mins}m remaining`;
    }
  };

  const formatElapsed = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {!hideSearch && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search buyers..."
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
          )}
          <span className="text-sm text-muted-foreground">
            {buyerCount} buyer{buyerCount !== 1 ? 's' : ''}
            {selectedCount > 0 && (
              <span className="ml-1 text-primary font-medium">· {selectedCount} selected</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onRemoveSelected && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRemoveSelected}
              disabled={selectedCount === 0 || isRemovingSelected}
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              {isRemovingSelected ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Unlink className="h-4 w-4 mr-1" />
              )}
              Remove Selected{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </Button>
          )}
          {onPushToDialer && (
            <Button
              variant="outline"
              size="sm"
              onClick={onPushToDialer}
              disabled={selectedCount === 0}
            >
              <Phone className="h-4 w-4 mr-1" />
              Push to Dialer{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </Button>
          )}
          {onPushToSmartlead && (
            <Button
              variant="outline"
              size="sm"
              onClick={onPushToSmartlead}
              disabled={selectedCount === 0}
            >
              <Mail className="h-4 w-4 mr-1" />
              Push to Smartlead{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </Button>
          )}
          {onAddBuyer && (
            <Button onClick={onAddBuyer} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Buyer
            </Button>
          )}
          {onImportCSV && (
            <Button variant="outline" size="sm" onClick={onImportCSV}>
              <Upload className="h-4 w-4 mr-1" />
              Import Spreadsheet
            </Button>
          )}
          {onEnrichAll && (
            <Button
              variant="outline"
              size="sm"
              onClick={onEnrichAll}
              disabled={isEnriching || isScoringAlignment}
            >
              {isEnriching ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1" />
              )}
              Enrich All
            </Button>
          )}
          {isEnriching && onCancelEnrichment && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancelEnrichment}
              className="text-destructive"
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          )}
          {isEnriching && onResetQueue && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onResetQueue}
              className="text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset Queue
            </Button>
          )}
          {onScoreAlignment && (
            <Button
              variant="outline"
              size="sm"
              onClick={onScoreAlignment}
              disabled={isScoringAlignment || isEnriching}
            >
              {isScoringAlignment ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Target className="h-4 w-4 mr-1" />
              )}
              {isScoringAlignment && alignmentProgress
                ? `Scoring... ${alignmentProgress.current}/${alignmentProgress.total}`
                : 'Score Alignment'}
            </Button>
          )}
          {isScoringAlignment && onCancelAlignment && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancelAlignment}
              className="text-destructive"
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Enrichment Progress Bar */}
      {showEnrichProgress && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span>
                Enriching buyers... {enrichmentProgress.current} of {enrichmentProgress.total}
              </span>
              <div className="flex items-center gap-3 text-muted-foreground">
                {enrichElapsed > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatElapsed(enrichElapsed)}
                  </span>
                )}
                {getEnrichETA() && (
                  <span className="text-xs font-medium text-primary">{getEnrichETA()}</span>
                )}
                {enrichmentProgress.successful !== undefined && (
                  <span>
                    {enrichmentProgress.successful} successful
                    {enrichmentProgress.failed ? `, ${enrichmentProgress.failed} failed` : ''}
                  </span>
                )}
              </div>
            </div>
            <Progress value={enrichProgressPercent} className="h-2" />
          </div>
          {enrichmentProgress.creditsDepleted && (
            <Badge variant="destructive" className="gap-1 shrink-0">
              <AlertCircle className="h-3 w-3" />
              Credits Depleted
            </Badge>
          )}
          {enrichmentProgress.rateLimited && (
            <Badge
              variant="outline"
              className="gap-1 shrink-0 border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30"
            >
              <AlertCircle className="h-3 w-3" />
              Rate Limited
              {enrichmentProgress.resetTime && (
                <span className="text-xs">
                  (reset: {new Date(enrichmentProgress.resetTime).toLocaleTimeString()})
                </span>
              )}
            </Badge>
          )}
        </div>
      )}

      {/* Alignment Scoring Progress Bar */}
      {showAlignmentProgress && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
          <Target className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span>
                Scoring industry alignment... {alignmentProgress.current} of{' '}
                {alignmentProgress.total}
              </span>
              <div className="flex items-center gap-3 text-muted-foreground">
                {elapsedSeconds > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatElapsed(elapsedSeconds)}
                  </span>
                )}
                {getTimeEstimate() && (
                  <span className="text-blue-600 dark:text-blue-400 font-medium">
                    {getTimeEstimate()}
                  </span>
                )}
              </div>
            </div>
            <Progress value={alignmentProgressPercent} className="h-2" />
            {alignmentProgress.successful !== undefined && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {alignmentProgress.successful} scored
                  {alignmentProgress.failed ? `, ${alignmentProgress.failed} failed` : ''}
                </span>
                {alignmentProgress.current > 0 && elapsedSeconds > 0 && (
                  <span>~{(elapsedSeconds / alignmentProgress.current).toFixed(1)}s per buyer</span>
                )}
              </div>
            )}
          </div>
          {alignmentProgress.creditsDepleted && (
            <Badge variant="destructive" className="gap-1 shrink-0">
              <AlertCircle className="h-3 w-3" />
              Credits Depleted
            </Badge>
          )}
        </div>
      )}
    </div>
  );
};

export default BuyerTableToolbar;
