import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export type InboxFilter =
  | 'all'
  | 'meeting_request'
  | 'interested'
  | 'positive'
  | 'negative'
  | 'neutral';

export interface SmartleadInboxItem {
  id: string;
  campaign_status: string | null;
  campaign_name: string | null;
  campaign_id: number | null;
  sl_email_lead_id: string | null;
  sl_lead_email: string | null;
  from_email: string | null;
  to_email: string | null;
  to_name: string | null;
  subject: string | null;
  message_id: string | null;
  sent_message_body: string | null;
  sent_message: string | null;
  time_replied: string | null;
  event_timestamp: string | null;
  reply_message: string | null;
  reply_body: string | null;
  preview_text: string | null;
  sequence_number: number | null;
  ui_master_inbox_link: string | null;
  lead_correspondence: unknown;
  event_type: string | null;
  ai_category: string | null;
  ai_sentiment: string | null;
  ai_is_positive: boolean | null;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  categorized_at: string | null;
  manual_category: string | null;
  manual_sentiment: string | null;
  recategorized_by: string | null;
  recategorized_at: string | null;
  status: string | null;
  linked_deal_id: string | null;
  created_at: string;
}

export interface InboxStats {
  total: number;
  meetings: number;
  interested: number;
  positive: number;
  negative: number;
  neutral: number;
  newCount: number;
}

function computeStats(items: SmartleadInboxItem[]): InboxStats {
  return {
    total: items.length,
    meetings: items.filter((i) => (i.manual_category || i.ai_category) === 'meeting_request').length,
    interested: items.filter((i) => (i.manual_category || i.ai_category) === 'interested').length,
    positive: items.filter(
      (i) => (i.manual_sentiment || i.ai_sentiment) === 'positive' || i.ai_is_positive,
    ).length,
    negative: items.filter((i) => (i.manual_sentiment || i.ai_sentiment) === 'negative').length,
    neutral: items.filter(
      (i) =>
        !(i.manual_sentiment || i.ai_sentiment) ||
        (i.manual_sentiment || i.ai_sentiment) === 'neutral',
    ).length,
    newCount: items.filter((i) => i.status === 'new').length,
  };
}

function applyFilter(items: SmartleadInboxItem[], filter: InboxFilter): SmartleadInboxItem[] {
  if (filter === 'all') return items;
  if (filter === 'meeting_request')
    return items.filter((i) => (i.manual_category || i.ai_category) === 'meeting_request');
  if (filter === 'interested')
    return items.filter((i) => (i.manual_category || i.ai_category) === 'interested');
  if (filter === 'positive')
    return items.filter(
      (i) => (i.manual_sentiment || i.ai_sentiment) === 'positive' || i.ai_is_positive,
    );
  if (filter === 'negative')
    return items.filter((i) => (i.manual_sentiment || i.ai_sentiment) === 'negative');
  if (filter === 'neutral')
    return items.filter(
      (i) =>
        !(i.manual_sentiment || i.ai_sentiment) ||
        (i.manual_sentiment || i.ai_sentiment) === 'neutral',
    );
  return items;
}

function applySearch(items: SmartleadInboxItem[], search: string): SmartleadInboxItem[] {
  if (!search.trim()) return items;
  const q = search.toLowerCase();
  return items.filter(
    (i) =>
      (i.to_name || '').toLowerCase().includes(q) ||
      (i.to_email || '').toLowerCase().includes(q) ||
      (i.from_email || '').toLowerCase().includes(q) ||
      (i.sl_lead_email || '').toLowerCase().includes(q) ||
      (i.campaign_name || '').toLowerCase().includes(q) ||
      (i.subject || '').toLowerCase().includes(q) ||
      (i.preview_text || '').toLowerCase().includes(q),
  );
}

export function useSmartleadInbox(filter: InboxFilter = 'all', search: string = '') {
  const query = useQuery({
    queryKey: ['smartlead-inbox'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('smartlead_reply_inbox') as any)
        .select('*')
        .order('time_replied', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as SmartleadInboxItem[];
    },
  });

  const allItems = query.data || [];
  const stats = computeStats(allItems);
  const filtered = applySearch(applyFilter(allItems, filter), search);

  return { ...query, items: filtered, stats, allItems };
}

export function useSmartleadInboxItem(id: string | undefined) {
  return useQuery({
    queryKey: ['smartlead-inbox', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('smartlead_reply_inbox')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as SmartleadInboxItem;
    },
    enabled: !!id,
  });
}

export function useUpdateInboxStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const { error } = await supabase
        .from('smartlead_reply_inbox')
        .update({ status })
        .in('id', ids);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smartlead-inbox'] });
    },
  });
}

export function useRecategorizeInbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      category,
      sentiment,
    }: {
      id: string;
      category?: string;
      sentiment?: string;
    }) => {
      const updates: Record<string, unknown> = {
        recategorized_at: new Date().toISOString(),
      };
      if (category !== undefined) updates.manual_category = category;
      if (sentiment !== undefined) updates.manual_sentiment = sentiment;

      const { error } = await supabase
        .from('smartlead_reply_inbox')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smartlead-inbox'] });
    },
  });
}

export function useLinkInboxToDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dealId }: { id: string; dealId: string | null }) => {
      const { error } = await supabase
        .from('smartlead_reply_inbox')
        .update({ linked_deal_id: dealId })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smartlead-inbox'] });
    },
  });
}

/** Subscribe to realtime inserts on smartlead_reply_inbox */
export function useSmartleadInboxRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('smartlead-inbox-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'smartlead_reply_inbox' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['smartlead-inbox'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
