import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getHighestPriorityStatus, type OutreachStatusType } from './StatusBadge';

interface OutreachEvent {
  id: string;
  deal_id: string;
  buyer_id: string;
  channel: 'email' | 'linkedin' | 'phone';
  tool: 'smartlead' | 'heyreach' | 'phoneburner';
  event_type: string;
  event_timestamp: string;
  external_id: string | null;
  notes: string | null;
}

export interface BuyerOutreachSummary {
  status: OutreachStatusType;
  lastEventDate: string | null;
  lastEventChannel: string | null;
  events: OutreachEvent[];
  emailStatus: { eventType: string; date: string } | null;
  linkedinStatus: { eventType: string; date: string } | null;
  phoneStatus: { eventType: string; date: string } | null;
}

export function useBuyerOutreachStatus(dealId: string, buyerIds: string[]) {
  return useQuery({
    queryKey: ['buyer-outreach-events', dealId, buyerIds.sort().join(',')],
    queryFn: async () => {
      if (!buyerIds.length) return new Map<string, BuyerOutreachSummary>();

      const { data, error } = await supabase
        .from('buyer_outreach_events' as any)
        .select('*')
        .eq('deal_id', dealId)
        .in('buyer_id', buyerIds)
        .order('event_timestamp', { ascending: false });

      if (error) throw error;

      const events = (data || []) as OutreachEvent[];
      const map = new Map<string, BuyerOutreachSummary>();

      // Group events by buyer_id
      for (const buyerId of buyerIds) {
        const buyerEvents = events.filter(e => e.buyer_id === buyerId);
        const eventTypes = buyerEvents.map(e => e.event_type);
        const status = getHighestPriorityStatus(eventTypes);
        const lastEvent = buyerEvents[0] || null;

        const emailEvents = buyerEvents.filter(e => e.channel === 'email');
        const linkedinEvents = buyerEvents.filter(e => e.channel === 'linkedin');
        const phoneEvents = buyerEvents.filter(e => e.channel === 'phone');

        map.set(buyerId, {
          status,
          lastEventDate: lastEvent?.event_timestamp || null,
          lastEventChannel: lastEvent?.channel || null,
          events: buyerEvents,
          emailStatus: emailEvents[0]
            ? { eventType: emailEvents[0].event_type, date: emailEvents[0].event_timestamp }
            : null,
          linkedinStatus: linkedinEvents[0]
            ? { eventType: linkedinEvents[0].event_type, date: linkedinEvents[0].event_timestamp }
            : null,
          phoneStatus: phoneEvents[0]
            ? { eventType: phoneEvents[0].event_type, date: phoneEvents[0].event_timestamp }
            : null,
        });
      }

      return map;
    },
    enabled: !!dealId && buyerIds.length > 0,
  });
}
