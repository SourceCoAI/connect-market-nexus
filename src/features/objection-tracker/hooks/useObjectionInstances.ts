import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/client';
import type { ObjectionInstance } from '../types';

export function useObjectionInstances(
  categoryId: string | null,
  filter: 'all' | 'overcame' | 'not_overcame' = 'all',
  page = 0,
  pageSize = 10,
) {
  return useQuery({
    queryKey: ['objection-instances', categoryId, filter, page],
    queryFn: async (): Promise<{ instances: ObjectionInstance[]; hasMore: boolean }> => {
      if (!categoryId) return { instances: [], hasMore: false };

      let query = untypedFrom('objection_instances')
        .select('*, profiles:caller_id(first_name, last_name, email)')
        .eq('category_id', categoryId)
        .eq('status', 'auto_accepted');

      if (filter === 'overcame') query = query.eq('overcame', true);
      if (filter === 'not_overcame') query = query.eq('overcame', false);

      query = query
        .order('handling_score', { ascending: false, nullsFirst: false })
        .range(page * pageSize, (page + 1) * pageSize);

      const { data, error } = await query;
      if (error) throw error;

      const instances = (data || []).map((inst: any) => ({
        ...inst,
        caller_name: inst.profiles
          ? `${inst.profiles.first_name || ''} ${inst.profiles.last_name || ''}`.trim()
          : 'Unknown',
        caller_email: inst.profiles?.email,
        profiles: undefined,
      }));

      return {
        instances,
        hasMore: (data || []).length > pageSize,
      };
    },
    enabled: !!categoryId,
    staleTime: 60_000,
  });
}

export function usePendingInstances() {
  return useQuery({
    queryKey: ['objection-instances-pending'],
    queryFn: async () => {
      const { data, error } = await untypedFrom('objection_instances')
        .select('*, profiles:caller_id(first_name, last_name), objection_categories:category_id(name)')
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((inst: any) => ({
        ...inst,
        caller_name: inst.profiles
          ? `${inst.profiles.first_name || ''} ${inst.profiles.last_name || ''}`.trim()
          : 'Unknown',
        category_name: inst.objection_categories?.name || 'Unknown',
        profiles: undefined,
        objection_categories: undefined,
      }));
    },
    staleTime: 30_000,
  });
}
