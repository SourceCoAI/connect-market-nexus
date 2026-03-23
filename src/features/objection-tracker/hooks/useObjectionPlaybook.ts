import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/client';
import type { ObjectionPlaybook } from '../types';

export function usePublishedPlaybook(categoryId: string | null) {
  return useQuery({
    queryKey: ['objection-playbook-published', categoryId],
    queryFn: async (): Promise<ObjectionPlaybook | null> => {
      if (!categoryId) return null;

      const { data, error } = await untypedFrom('objection_playbook')
        .select('*')
        .eq('category_id', categoryId)
        .eq('status', 'published')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!categoryId,
    staleTime: 60_000,
  });
}

export function usePendingPlaybooks() {
  return useQuery({
    queryKey: ['objection-playbooks-pending'],
    queryFn: async (): Promise<ObjectionPlaybook[]> => {
      const { data, error } = await untypedFrom('objection_playbook')
        .select('*, objection_categories:category_id(name, icon)')
        .eq('status', 'pending_review')
        .order('generated_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((pb: any) => ({
        ...pb,
        category_name: pb.objection_categories?.name || 'Unknown',
        category_icon: pb.objection_categories?.icon,
        objection_categories: undefined,
      }));
    },
    staleTime: 30_000,
  });
}

export function usePendingReviewCount() {
  return useQuery({
    queryKey: ['objection-pending-review-count'],
    queryFn: async (): Promise<number> => {
      const { count: playbookCount } = await untypedFrom('objection_playbook')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_review');

      const { count: instanceCount } = await untypedFrom('objection_instances')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_review');

      return (playbookCount || 0) + (instanceCount || 0);
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
