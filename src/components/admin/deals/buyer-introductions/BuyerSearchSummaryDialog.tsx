import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle, Sparkles, Plus, RefreshCw, Clock, WifiOff, AlertTriangle, ServerCrash } from "lucide-react";
import type { SeedBuyerResult } from "@/hooks/admin/use-seed-buyers";

/** Map error keywords to user-friendly display */
function categorizeError(msg: string): { title: string; icon: typeof Clock; suggestion: string } {
  const lower = msg.toLowerCase();
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return {
      title: 'Search Timed Out',
      icon: Clock,
      suggestion: 'The AI search took too long. This can happen with complex deals. Try again — it often succeeds on the second attempt.',
    };
  }
  if (lower.includes('rate-limited') || lower.includes('rate limit') || lower.includes('429')) {
    return {
      title: 'AI Service Busy',
      icon: Clock,
      suggestion: 'The AI service is handling too many requests. Please wait about a minute and try again.',
    };
  }
  if (lower.includes('not configured') || lower.includes('api key') || lower.includes('config')) {
    return {
      title: 'Configuration Error',
      icon: AlertTriangle,
      suggestion: 'The AI service is not properly configured. Please contact your administrator.',
    };
  }
  if (lower.includes('unavailable') || lower.includes('bad gateway') || lower.includes('502') || lower.includes('503')) {
    return {
      title: 'AI Service Unavailable',
      icon: ServerCrash,
      suggestion: 'The AI service is temporarily down. Please try again in a few minutes.',
    };
  }
  if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('econnrefused')) {
    return {
      title: 'Network Error',
      icon: WifiOff,
      suggestion: 'Could not reach the AI service. Please check your internet connection and try again.',
    };
  }
  if (lower.includes('missing') && lower.includes('field')) {
    return {
      title: 'Opportunity Data Incomplete',
      icon: AlertTriangle,
      suggestion: msg,
    };
  }
  if (lower.includes('unexpected response') || lower.includes('parse')) {
    return {
      title: 'Unexpected AI Response',
      icon: AlertTriangle,
      suggestion: 'The AI returned an unreadable response. Please try again.',
    };
  }
  return {
    title: 'Search Failed',
    icon: XCircle,
    suggestion: msg || 'An unexpected error occurred. Please try again or contact support.',
  };
}

interface BuyerSearchSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: SeedBuyerResult[] | null;
  cached?: boolean;
  error?: string | null;
}

export function BuyerSearchSummaryDialog({
  open,
  onOpenChange,
  results,
  cached,
  error,
}: BuyerSearchSummaryDialogProps) {
  const inserted = results?.filter(r => r.action === 'inserted').length ?? 0;
  const enriched = results?.filter(r => r.action === 'enriched_existing').length ?? 0;
  const dupes = results?.filter(r => r.action === 'probable_duplicate').length ?? 0;
  const total = results?.length ?? 0;

  const errorInfo = error ? categorizeError(error) : null;
  const ErrorIcon = errorInfo?.icon ?? XCircle;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {error ? (
              <ErrorIcon className="h-5 w-5 text-destructive" />
            ) : (
              <Sparkles className="h-5 w-5 text-primary" />
            )}
            {errorInfo ? errorInfo.title : 'AI Buyer Search Complete'}
          </DialogTitle>
          {cached && (
            <DialogDescription>Results from cache</DialogDescription>
          )}
        </DialogHeader>

        {error ? (
          <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
            {errorInfo?.suggestion ?? error}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted">
                <div className="text-2xl font-bold text-foreground">{total}</div>
                <div className="text-xs text-muted-foreground">Total Found</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                <div className="text-2xl font-bold text-emerald-600 flex items-center justify-center gap-1">
                  <Plus className="h-4 w-4" />
                  {inserted}
                </div>
                <div className="text-xs text-muted-foreground">New</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                <div className="text-2xl font-bold text-blue-600 flex items-center justify-center gap-1">
                  <RefreshCw className="h-4 w-4" />
                  {enriched}
                </div>
                <div className="text-xs text-muted-foreground">Updated</div>
              </div>
            </div>

            {dupes > 0 && (
              <div className="flex items-center justify-between p-2.5 rounded-lg border">
                <span className="text-sm text-muted-foreground">Probable duplicates skipped</span>
                <Badge variant="secondary">{dupes}</Badge>
              </div>
            )}

            {/* Buyer list */}
            {results && results.length > 0 && (
              <ScrollArea className="h-[220px] rounded-lg border p-3">
                <div className="space-y-2">
                  {results.map((r, i) => (
                    <div
                      key={`${r.buyer_id}-${i}`}
                      className="flex items-start justify-between gap-2 text-sm p-2 rounded bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-foreground truncate">{r.company_name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {r.why_relevant}
                        </div>
                      </div>
                      <Badge
                        variant={r.action === 'inserted' ? 'success' : 'secondary'}
                        className="shrink-0 text-[10px]"
                      >
                        {r.action === 'inserted' ? 'New' : r.action === 'enriched_existing' ? 'Updated' : 'Dupe'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {total > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="text-sm">
                  Buyers are now scoring for the External tab.
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
