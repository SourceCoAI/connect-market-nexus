import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/client';
import type { ObjectionCategory, PlaybookSortOption } from '../types';

interface CategoryWithStats extends ObjectionCategory {
  instance_count: number;
  overcome_count: number;
  overcome_rate: number;
  last_updated: string | null;
}

export function useObjectionCategories(sort: PlaybookSortOption = 'most_encountered') {
  return useQuery({
    queryKey: ['objection-categories', sort],
    queryFn: async (): Promise<CategoryWithStats[]> => {
      // Fetch categories
      const { data: categories, error: catErr } = await untypedFrom('objection_categories')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (catErr) throw catErr;

      // Fetch instance counts and overcome rates per category
      const { data: instances, error: instErr } = await untypedFrom('objection_instances')
        .select('category_id, overcame, created_at')
        .in('status', ['auto_accepted']);

      if (instErr) throw instErr;

      // Aggregate stats
      const statsMap = new Map<string, { total: number; overcame: number; lastUpdated: string | null }>();
      for (const inst of instances || []) {
        const existing = statsMap.get(inst.category_id) || { total: 0, overcame: 0, lastUpdated: null };
        existing.total++;
        if (inst.overcame) existing.overcame++;
        if (!existing.lastUpdated || inst.created_at > existing.lastUpdated) {
          existing.lastUpdated = inst.created_at;
        }
        statsMap.set(inst.category_id, existing);
      }

      const enriched: CategoryWithStats[] = (categories || []).map((cat: ObjectionCategory) => {
        const stats = statsMap.get(cat.id) || { total: 0, overcame: 0, lastUpdated: null };
        return {
          ...cat,
          instance_count: stats.total,
          overcome_count: stats.overcame,
          overcome_rate: stats.total > 0 ? Math.round((stats.overcame / stats.total) * 100) : 0,
          last_updated: stats.lastUpdated,
        };
      });

      // Sort
      switch (sort) {
        case 'most_encountered':
          enriched.sort((a, b) => b.instance_count - a.instance_count);
          break;
        case 'lowest_overcome':
          enriched.sort((a, b) => a.overcome_rate - b.overcome_rate);
          break;
        case 'recently_updated':
          enriched.sort((a, b) => {
            if (!a.last_updated) return 1;
            if (!b.last_updated) return -1;
            return b.last_updated.localeCompare(a.last_updated);
          });
          break;
      }

      return enriched;
    },
    staleTime: 60_000,
  });
}

export function useAllCategories() {
  return useQuery({
    queryKey: ['objection-categories-all'],
    queryFn: async () => {
      const { data: categories, error: catErr } = await untypedFrom('objection_categories')
        .select('*')
        .order('name');

      if (catErr) throw catErr;

      // Fetch stats
      const { data: instances } = await untypedFrom('objection_instances')
        .select('category_id, overcame')
        .eq('status', 'auto_accepted');

      const statsMap = new Map<string, { total: number; overcame: number }>();
      for (const inst of instances || []) {
        const existing = statsMap.get(inst.category_id) || { total: 0, overcame: 0 };
        existing.total++;
        if (inst.overcame) existing.overcame++;
        statsMap.set(inst.category_id, existing);
      }

      // Get playbook status per category
      const { data: playbooks } = await untypedFrom('objection_playbook')
        .select('category_id, status')
        .in('status', ['published', 'pending_review']);

      const playbookStatusMap = new Map<string, string>();
      for (const pb of playbooks || []) {
        // Published takes priority
        if (!playbookStatusMap.has(pb.category_id) || pb.status === 'published') {
          playbookStatusMap.set(pb.category_id, pb.status);
        }
      }

      return (categories || []).map((cat: ObjectionCategory) => {
        const stats = statsMap.get(cat.id) || { total: 0, overcame: 0 };
        return {
          ...cat,
          instance_count: stats.total,
          overcome_rate: stats.total > 0 ? Math.round((stats.overcame / stats.total) * 100) : 0,
          playbook_status: playbookStatusMap.get(cat.id) || 'none',
        };
      });
    },
    staleTime: 60_000,
  });
}
