import { useState, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EnrichmentButtonProps {
  buyerId: string;
  buyerName: string;
  hasWebsite: boolean;
  lastEnriched?: string | null;
  size?: "sm" | "default";
  className?: string;
  onSuccess?: () => void;
}

type EnrichmentState = 'idle' | 'queued' | 'processing' | 'success' | 'error';

export const EnrichmentButton = ({
  buyerId,
  buyerName,
  hasWebsite,
  lastEnriched,
  size = "default",
  className,
  onSuccess,
}: EnrichmentButtonProps) => {
  const queryClient = useQueryClient();
  const [enrichmentState, setEnrichmentState] = useState<EnrichmentState>('idle');
  const [pollingActive, setPollingActive] = useState(false);

  // Poll the buyer_enrichment_queue for actual completion status
  const pollQueueStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("buyer_enrichment_queue")
        .select("status")
        .eq("buyer_id", buyerId)
        .order("queued_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn("Queue status poll failed:", error.message);
        return;
      }

      if (!data) {
        // Queue item gone — enrichment completed and was cleaned up
        setEnrichmentState('success');
        setPollingActive(false);
        void queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyer', buyerId], refetchType: 'active' });
        void queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyers'], refetchType: 'active' });
        onSuccess?.();
        setTimeout(() => setEnrichmentState('idle'), 5000);
        return;
      }

      switch (data.status) {
        case 'completed':
          setEnrichmentState('success');
          setPollingActive(false);
          toast.success(`${buyerName} enriched successfully`);
          void queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyer', buyerId], refetchType: 'active' });
          void queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyers'], refetchType: 'active' });
          onSuccess?.();
          setTimeout(() => setEnrichmentState('idle'), 5000);
          break;
        case 'failed':
        case 'rate_limited':
          setEnrichmentState('error');
          setPollingActive(false);
          toast.error(`Enrichment failed for ${buyerName}`);
          setTimeout(() => setEnrichmentState('idle'), 5000);
          break;
        case 'processing':
          setEnrichmentState('processing');
          break;
        case 'pending':
          // Still waiting — keep polling
          break;
      }
    } catch (err) {
      console.warn("Queue poll error:", err);
    }
  }, [buyerId, buyerName, queryClient, onSuccess]);

  // Polling interval
  useEffect(() => {
    if (!pollingActive) return;

    const interval = setInterval(pollQueueStatus, 3000);
    // Also run immediately on start
    void pollQueueStatus();

    // Stop polling after 3 minutes (safety net)
    const timeout = setTimeout(() => {
      setPollingActive(false);
      if (enrichmentState === 'queued' || enrichmentState === 'processing') {
        setEnrichmentState('idle');
      }
    }, 180000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [pollingActive, pollQueueStatus, enrichmentState]);

  const enrichMutation = useMutation({
    mutationFn: async () => {
      const { queueBuyerEnrichment } = await import("@/lib/remarketing/queueEnrichment");
      await queueBuyerEnrichment([buyerId]);
    },
    onSuccess: () => {
      setEnrichmentState('queued');
      setPollingActive(true);
    },
    onError: (error: Error) => {
      setEnrichmentState('error');
      const anyErr = error as Error & { context?: { status?: number; json?: { error?: string; resetTime?: string } } };
      const status = anyErr?.context?.status;
      const json = anyErr?.context?.json;
      const msg = json?.error || error.message;
      const reset = json?.resetTime ? ` (reset: ${new Date(json.resetTime).toLocaleTimeString()})` : '';
      toast.error('Enrichment failed', {
        description: status === 429 ? `${msg}${reset}` : msg,
      });

      setTimeout(() => setEnrichmentState('idle'), 3000);
    }
  });

  const handleEnrich = () => {
    if (!hasWebsite) {
      toast.error('No website URL', {
        description: 'Add a website URL to this buyer before enriching'
      });
      return;
    }
    enrichMutation.mutate();
  };

  const isWorking = enrichMutation.isPending || enrichmentState === 'queued' || enrichmentState === 'processing';

  const buttonContent = () => {
    if (enrichMutation.isPending) {
      return (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {size === 'default' && <span>Queueing...</span>}
        </>
      );
    }
    if (enrichmentState === 'queued') {
      return (
        <>
          <Clock className="h-4 w-4 text-amber-600 animate-pulse" />
          {size === 'default' && <span>Queued</span>}
        </>
      );
    }
    if (enrichmentState === 'processing') {
      return (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          {size === 'default' && <span>Enriching...</span>}
        </>
      );
    }
    if (enrichmentState === 'success') {
      return (
        <>
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {size === 'default' && <span>Enriched</span>}
        </>
      );
    }
    if (enrichmentState === 'error') {
      return (
        <>
          <AlertCircle className="h-4 w-4 text-red-600" />
          {size === 'default' && <span>Failed</span>}
        </>
      );
    }
    return (
      <>
        <Sparkles className="h-4 w-4" />
        {size === 'default' && <span>Enrich with AI</span>}
      </>
    );
  };

  const button = (
    <Button
      variant="outline"
      size={size}
      onClick={handleEnrich}
      disabled={isWorking || !hasWebsite}
      className={cn(
        "gap-2",
        enrichmentState === 'queued' && "border-amber-200 bg-amber-50",
        enrichmentState === 'processing' && "border-blue-200 bg-blue-50",
        enrichmentState === 'success' && "border-emerald-200 bg-emerald-50",
        enrichmentState === 'error' && "border-red-200 bg-red-50",
        className
      )}
    >
      {buttonContent()}
    </Button>
  );

  if (!hasWebsite) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {button}
          </TooltipTrigger>
          <TooltipContent>
            <p>Add a website URL to enable enrichment</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (lastEnriched && enrichmentState === 'idle') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {button}
          </TooltipTrigger>
          <TooltipContent>
            <p>Last enriched: {new Date(lastEnriched).toLocaleDateString()}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

export default EnrichmentButton;
