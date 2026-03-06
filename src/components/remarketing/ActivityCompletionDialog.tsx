import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useGlobalActivityQueue } from "@/hooks/remarketing/useGlobalActivityQueue";
import { OPERATION_TYPE_LABELS } from "@/types/remarketing";
import type {
  GlobalActivityQueueItem,
  GlobalActivityErrorEntry,
} from "@/types/remarketing";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export function ActivityCompletionDialog() {
  const { allItems } = useGlobalActivityQueue();
  const [completedItem, setCompletedItem] = useState<GlobalActivityQueueItem | null>(null);
  const [open, setOpen] = useState(false);
  const [errorsExpanded, setErrorsExpanded] = useState(false);

  // Track which operations we've already shown a summary for
  const shownIdsRef = useRef<Set<string>>(new Set());
  // Track the IDs that were running/paused on the previous render
  const prevActiveIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentActiveIds = new Set<string>();
    const terminalItemIds: string[] = [];

    for (const item of allItems) {
      if (item.status === "running" || item.status === "paused") {
        currentActiveIds.add(item.id);
      }
      if (
        (item.status === "completed" || item.status === "failed" || item.status === "cancelled") &&
        prevActiveIdsRef.current.has(item.id) &&
        !shownIdsRef.current.has(item.id)
      ) {
        terminalItemIds.push(item.id);
      }
    }

    prevActiveIdsRef.current = currentActiveIds;

    // Re-fetch the latest row directly to avoid stale cache from realtime race conditions
    if (terminalItemIds.length > 0) {
      const latestId = terminalItemIds[0];
      shownIdsRef.current.add(latestId);

      // Longer delay to let final DB writes + queue counter increments settle
      const timer = setTimeout(async () => {
        try {
          const { data, error } = await supabase
            .from("global_activity_queue")
            .select("*")
            .eq("id", latestId)
            .maybeSingle();
          if (error) throw error;
          if (data) {
            const item = data as unknown as GlobalActivityQueueItem;
            const processed = (item.completed_items || 0) + (item.failed_items || 0);
            const total = item.total_items || 0;

            // Guard: if counters haven't caught up (< 50% of total processed),
            // wait another 3s and re-fetch before showing the dialog.
            if (total > 0 && processed < total * 0.5 && processed < total - 1) {
              await new Promise(r => setTimeout(r, 3000));
              const { data: refreshed } = await supabase
                .from("global_activity_queue")
                .select("*")
                .eq("id", latestId)
                .maybeSingle();
              if (refreshed) {
                setCompletedItem(refreshed as unknown as GlobalActivityQueueItem);
              } else {
                setCompletedItem(item);
              }
            } else {
              setCompletedItem(item);
            }
          } else {
            const cached = allItems.find(i => i.id === latestId);
            if (cached) setCompletedItem(cached);
          }
        } catch {
          const cached = allItems.find(i => i.id === latestId);
          if (cached) setCompletedItem(cached);
        }
        setOpen(true);
        setErrorsExpanded(false);
      }, 2500); // 2.5s delay to let final DB writes complete

      return () => clearTimeout(timer);
    }
  }, [allItems]);

  if (!completedItem) return null;

  const label =
    completedItem.description ||
    OPERATION_TYPE_LABELS[completedItem.operation_type] ||
    completedItem.operation_type;
  const succeeded = completedItem.completed_items;
  const failed = completedItem.failed_items;
  // Use actual succeeded+failed as the authoritative total when it's larger,
  // since total_items may reflect the initial queued count before deduplication
  const rawTotal = completedItem.total_items;
  const total = Math.max(rawTotal, succeeded + failed);
  const errors: GlobalActivityErrorEntry[] = Array.isArray(completedItem.error_log)
    ? completedItem.error_log
    : [];
  const duration = formatDuration(completedItem.started_at, completedItem.completed_at);
  const status = completedItem.status;

  const StatusIcon =
    status === "completed"
      ? CheckCircle2
      : status === "failed"
        ? AlertCircle
        : XCircle;
  const statusColor =
    status === "completed"
      ? "text-emerald-500"
      : status === "failed"
        ? "text-red-500"
        : "text-muted-foreground";
  const statusLabel =
    status === "completed"
      ? "Completed"
      : status === "failed"
        ? "Failed"
        : "Cancelled";

  // Deduplicate errors by itemId to keep the list concise
  const uniqueErrors = errors.reduce<GlobalActivityErrorEntry[]>((acc, e) => {
    if (!acc.find((x) => x.itemId === e.itemId)) acc.push(e);
    return acc;
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StatusIcon className={`h-5 w-5 ${statusColor}`} />
            Operation {statusLabel}
          </DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold text-emerald-600">{succeeded}</div>
              <div className="text-xs text-muted-foreground">Successful</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold text-red-500">{failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold">{total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
          </div>

          {/* Duration */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Duration: {duration}
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-2">
            <Badge
              variant={
                status === "completed"
                  ? "default"
                  : status === "failed"
                    ? "destructive"
                    : "secondary"
              }
            >
              {statusLabel}
            </Badge>
            {succeeded > 0 && failed === 0 && succeeded >= total && (
              <span className="text-sm text-emerald-600 font-medium">All items processed successfully!</span>
            )}
            {succeeded > 0 && failed === 0 && succeeded < total && (
              <span className="text-sm text-amber-600 font-medium">
                {succeeded} of {total} processed ({total - succeeded} remaining)
              </span>
            )}
            {failed > 0 && succeeded > 0 && (
              <span className="text-sm text-muted-foreground">
                {succeeded} of {total} processed successfully
              </span>
            )}
          </div>

          {/* Error details */}
          {uniqueErrors.length > 0 && (
            <Collapsible open={errorsExpanded} onOpenChange={setErrorsExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 w-full justify-between text-destructive">
                  <span>{uniqueErrors.length} error{uniqueErrors.length > 1 ? "s" : ""}</span>
                  {errorsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ScrollArea className="max-h-40 mt-2">
                  <div className="space-y-1.5">
                    {uniqueErrors.slice(0, 20).map((e) => (
                      <div
                        key={e.itemId}
                        className="text-xs bg-destructive/5 text-destructive rounded px-2 py-1.5 font-mono break-all"
                      >
                        {e.error}
                      </div>
                    ))}
                    {uniqueErrors.length > 20 && (
                      <div className="text-xs text-muted-foreground px-2">
                        ...and {uniqueErrors.length - 20} more
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
