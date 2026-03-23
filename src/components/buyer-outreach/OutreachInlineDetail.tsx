import { useMutation, useQueryClient } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './StatusBadge';
import { Mail, Linkedin, Phone, ThumbsUp, ThumbsDown } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import type { BuyerOutreachSummary } from './useBuyerOutreachStatus';

interface OutreachInlineDetailProps {
  dealId: string;
  buyerId: string;
  summary: BuyerOutreachSummary;
}

export function OutreachInlineDetail({ dealId, buyerId, summary }: OutreachInlineDetailProps) {
  const queryClient = useQueryClient();

  const markMutation = useMutation({
    mutationFn: async (eventType: 'interested' | 'not_a_fit') => {
      const channel = summary.lastEventChannel || 'email';
      const tool =
        channel === 'email' ? 'smartlead' : channel === 'linkedin' ? 'heyreach' : 'phoneburner';

      const { error } = await untypedFrom('buyer_outreach_events').insert({
        deal_id: dealId,
        buyer_id: buyerId,
        channel,
        tool,
        event_type: eventType,
        event_timestamp: new Date().toISOString(),
        notes: `Manually marked as ${eventType.replace('_', ' ')}`,
      });

      if (error) throw error;
    },
    onSuccess: (_, eventType) => {
      queryClient.invalidateQueries({ queryKey: ['buyer-outreach-events'] });
      toast({
        title: `Buyer marked as ${eventType.replace('_', ' ')}`,
      });
    },
  });

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="px-6 py-3 bg-muted/30 border-t space-y-3">
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Email:</span>
          {summary.emailStatus ? (
            <span>
              <StatusBadge
                status={summary.emailStatus.eventType}
                className="text-[10px] px-1.5 py-0"
              />
              <span className="text-xs text-muted-foreground ml-1">
                {formatDate(summary.emailStatus.date)}
              </span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Not sent</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Linkedin className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">LinkedIn:</span>
          {summary.linkedinStatus ? (
            <span>
              <StatusBadge
                status={summary.linkedinStatus.eventType}
                className="text-[10px] px-1.5 py-0"
              />
              <span className="text-xs text-muted-foreground ml-1">
                {formatDate(summary.linkedinStatus.date)}
              </span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Not sent</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Phone:</span>
          {summary.phoneStatus ? (
            <span>
              <StatusBadge
                status={summary.phoneStatus.eventType}
                className="text-[10px] px-1.5 py-0"
              />
              <span className="text-xs text-muted-foreground ml-1">
                {formatDate(summary.phoneStatus.date)}
              </span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Not called</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          onClick={() => markMutation.mutate('interested')}
          disabled={markMutation.isPending || summary.status === 'interested'}
        >
          <ThumbsUp className="h-3 w-3" />
          Mark as Interested
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 border-red-300 text-red-700 hover:bg-red-50"
          onClick={() => markMutation.mutate('not_a_fit')}
          disabled={markMutation.isPending || summary.status === 'not_a_fit'}
        >
          <ThumbsDown className="h-3 w-3" />
          Mark as Not a Fit
        </Button>
      </div>
    </div>
  );
}
