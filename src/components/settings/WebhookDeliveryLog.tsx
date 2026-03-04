import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import type { WebhookDelivery } from '@/types/transcript';

interface WebhookDeliveryLogProps {
  webhookConfigId: string;
}

export function WebhookDeliveryLog({ webhookConfigId }: WebhookDeliveryLogProps) {
  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ['webhook-deliveries', webhookConfigId],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('webhook_deliveries' as any) as any)
        .select('*')
        .eq('webhook_config_id', webhookConfigId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as unknown as WebhookDelivery[];
    },
  });

  const getStatusVariant = (
    status: string,
  ): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'delivered':
        return 'default';
      case 'failed':
        return 'destructive';
      case 'retrying':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading delivery log...</div>;
  }

  if (deliveries.length === 0) {
    return <div className="text-sm text-muted-foreground py-4 text-center">No deliveries yet</div>;
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Delivery Log</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Event</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Attempt</TableHead>
            <TableHead>HTTP Status</TableHead>
            <TableHead>Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deliveries.map((delivery) => (
            <TableRow key={delivery.id}>
              <TableCell className="font-mono text-xs">{delivery.event_type}</TableCell>
              <TableCell>
                <Badge variant={getStatusVariant(delivery.status)}>{delivery.status}</Badge>
              </TableCell>
              <TableCell>{delivery.attempt_number}</TableCell>
              <TableCell>{delivery.http_status_code || '-'}</TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {formatDistanceToNow(new Date(delivery.created_at), { addSuffix: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
