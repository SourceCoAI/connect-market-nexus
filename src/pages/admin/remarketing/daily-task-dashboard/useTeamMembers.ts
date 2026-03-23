import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TeamMember } from './types';

export function useTeamMembers(): TeamMember[] {
  const { data: teamMembersRaw } = useQuery({
    queryKey: ['team-members-for-tasks'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('user_roles')
        .select('user_id, profiles!inner(id, first_name, last_name)')
        .in('role', ['owner', 'admin', 'moderator']);
      return (data || []).map(
        (r: any) => ({
          id: r.user_id,
          name: `${r.profiles?.first_name || ''} ${r.profiles?.last_name || ''}`.trim() || r.user_id,
        }),
      );
    },
    staleTime: 300_000,
  });
  return teamMembersRaw || [];
}
