import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContactCallStats {
  totalCalls: number;
  connectedCalls: number;
  connectionRate: number;
  totalTalkTimeSeconds: number;
  lastCallDate: string | null;
  lastDisposition: string | null;
  dispositionBreakdown: Record<string, number>;
  upcomingCallbacks: number;
  callsByRep: Record<string, number>;
}

/**
 * Fetches aggregated call stats for a buyer's contacts.
 */
export function useContactCallStats(buyerId: string | null) {
  return useQuery<ContactCallStats>({
    queryKey: ['contact-call-stats', buyerId],
    queryFn: async () => {
      if (!buyerId) return emptyStats();

      // Get contacts for this buyer from unified contacts table
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id')
        .eq('remarketing_buyer_id', buyerId)
        .eq('archived', false);

      const contactIds = (contacts || []).map((c: { id: string }) => c.id);
      if (contactIds.length === 0) return emptyStats();

      const { data: activities } = await supabase
        .from('contact_activities')
        .select(
          'activity_type, call_outcome, call_connected, call_duration_seconds, talk_time_seconds, call_started_at, disposition_label, disposition_code, user_name, callback_scheduled_date, phoneburner_status',
        )
        .in('contact_id', contactIds)
        .eq('source_system', 'phoneburner')
        .order('call_started_at', { ascending: false });

      if (!activities?.length) return emptyStats();

      let totalCalls = 0;
      let connectedCalls = 0;
      let totalTalkTime = 0;
      let lastCallDate: string | null = null;
      let lastDisposition: string | null = null;
      const dispositionBreakdown: Record<string, number> = {};
      const callsByRep: Record<string, number> = {};
      let upcomingCallbacks = 0;
      const now = new Date();

      for (const a of activities) {
        if (a.activity_type === 'call_attempt' || a.activity_type === 'call_completed') {
          totalCalls++;
          if (a.call_connected || a.call_outcome === 'dispositioned') connectedCalls++;
          if (a.talk_time_seconds) totalTalkTime += a.talk_time_seconds;
          else if (a.call_duration_seconds) totalTalkTime += a.call_duration_seconds;

          if (!lastCallDate && a.call_started_at) lastCallDate = a.call_started_at;
          if (!lastDisposition && (a.disposition_label || a.phoneburner_status)) {
            lastDisposition = a.disposition_label || a.phoneburner_status;
          }

          const dispo = a.disposition_label || a.phoneburner_status || 'Unknown';
          if (a.activity_type === 'call_completed') {
            dispositionBreakdown[dispo] = (dispositionBreakdown[dispo] || 0) + 1;
          }

          if (a.user_name) {
            callsByRep[a.user_name] = (callsByRep[a.user_name] || 0) + 1;
          }
        }

        if (a.activity_type === 'callback_scheduled' && a.callback_scheduled_date) {
          if (new Date(a.callback_scheduled_date) > now) upcomingCallbacks++;
        }
      }

      return {
        totalCalls,
        connectedCalls,
        connectionRate: totalCalls > 0 ? Math.round((connectedCalls / totalCalls) * 100) : 0,
        totalTalkTimeSeconds: totalTalkTime,
        lastCallDate,
        lastDisposition,
        dispositionBreakdown,
        upcomingCallbacks,
        callsByRep,
      };
    },
    enabled: !!buyerId,
    staleTime: 60_000,
  });
}

/**
 * Fetches call stats for a set of contact IDs directly.
 */
export function useContactCallStatsByIds(contactIds: string[]) {
  return useQuery<ContactCallStats>({
    queryKey: ['contact-call-stats-ids', contactIds],
    queryFn: async () => {
      if (!contactIds.length) return emptyStats();

      const { data: activities } = await supabase
        .from('contact_activities')
        .select(
          'activity_type, call_outcome, call_connected, call_duration_seconds, talk_time_seconds, call_started_at, disposition_label, phoneburner_status, user_name, callback_scheduled_date',
        )
        .in('contact_id', contactIds)
        .eq('source_system', 'phoneburner')
        .order('call_started_at', { ascending: false });

      if (!activities?.length) return emptyStats();

      let totalCalls = 0;
      let connectedCalls = 0;
      let totalTalkTime = 0;
      let lastCallDate: string | null = null;
      let lastDisposition: string | null = null;
      const dispositionBreakdown: Record<string, number> = {};
      const callsByRep: Record<string, number> = {};
      let upcomingCallbacks = 0;
      const now = new Date();

      for (const a of activities) {
        if (a.activity_type === 'call_attempt' || a.activity_type === 'call_completed') {
          totalCalls++;
          if (a.call_connected || a.call_outcome === 'dispositioned') connectedCalls++;
          if (a.talk_time_seconds) totalTalkTime += a.talk_time_seconds;
          if (!lastCallDate && a.call_started_at) lastCallDate = a.call_started_at;
          if (!lastDisposition && (a.disposition_label || a.phoneburner_status)) {
            lastDisposition = a.disposition_label || a.phoneburner_status;
          }
          const dispo = a.disposition_label || a.phoneburner_status || 'Unknown';
          if (a.activity_type === 'call_completed') {
            dispositionBreakdown[dispo] = (dispositionBreakdown[dispo] || 0) + 1;
          }
          if (a.user_name) callsByRep[a.user_name] = (callsByRep[a.user_name] || 0) + 1;
        }
        if (a.activity_type === 'callback_scheduled' && a.callback_scheduled_date) {
          if (new Date(a.callback_scheduled_date) > now) upcomingCallbacks++;
        }
      }

      return {
        totalCalls,
        connectedCalls,
        connectionRate: totalCalls > 0 ? Math.round((connectedCalls / totalCalls) * 100) : 0,
        totalTalkTimeSeconds: totalTalkTime,
        lastCallDate,
        lastDisposition,
        dispositionBreakdown,
        upcomingCallbacks,
        callsByRep,
      };
    },
    enabled: contactIds.length > 0,
    staleTime: 60_000,
  });
}

function emptyStats(): ContactCallStats {
  return {
    totalCalls: 0,
    connectedCalls: 0,
    connectionRate: 0,
    totalTalkTimeSeconds: 0,
    lastCallDate: null,
    lastDisposition: null,
    dispositionBreakdown: {},
    upcomingCallbacks: 0,
    callsByRep: {},
  };
}
