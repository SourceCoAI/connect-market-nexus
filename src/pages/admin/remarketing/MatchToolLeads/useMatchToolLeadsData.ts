import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MatchToolLead } from './types';

export const PAGE_SIZE = 50;

type FilterTab = 'all' | 'has_contact' | 'has_financials' | 'website_only' | 'pushed' | 'archived';

export function useMatchToolLeadsData() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['match-tool-leads', activeTab, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('match_tool_leads' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      // Tab filters
      switch (activeTab) {
        case 'has_contact':
          query = query.not('email', 'is', null);
          break;
        case 'has_financials':
          query = query.eq('submission_stage', 'financials');
          break;
        case 'website_only':
          query = query.is('email', null).eq('submission_stage', 'browse');
          break;
        case 'pushed':
          query = query.eq('pushed_to_all_deals', true);
          break;
        case 'archived':
          query = query.or('excluded.eq.true,not_a_fit.eq.true');
          break;
        default:
          query = query.or('excluded.is.null,excluded.eq.false')
            .or('not_a_fit.is.null,not_a_fit.eq.false');
          break;
      }

      if (searchQuery) {
        query = query.or(
          `website.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,business_name.ilike.%${searchQuery}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as MatchToolLead[];
    },
  });

  const markNotAFit = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('match_tool_leads' as any)
        .update({ not_a_fit: true } as any)
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match-tool-leads'] });
      setSelectedIds(new Set());
      toast.success('Marked as not a fit');
    },
  });

  const deleteLeads = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('match_tool_leads' as any)
        .delete()
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match-tool-leads'] });
      setSelectedIds(new Set());
      toast.success('Leads deleted');
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('match_tool_leads' as any)
        .update({ status } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match-tool-leads'] });
      toast.success('Status updated');
    },
  });

  const enrichLead = useMutation({
    mutationFn: async ({ lead_id, website }: { lead_id: string; website: string }) => {
      const { data, error } = await supabase.functions.invoke('enrich-match-tool-lead', {
        body: { lead_id, website },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match-tool-leads'] });
    },
    onError: (error: Error) => {
      toast.error(`Enrichment failed: ${error.message}`);
    },
  });

  return {
    leads,
    isLoading,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    selectedIds,
    setSelectedIds,
    markNotAFit,
    deleteLeads,
    updateStatus,
    enrichLead,
  };
}
