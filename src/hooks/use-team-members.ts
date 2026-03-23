import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function useTeamMembers() {
  return useQuery<TeamMember[]>({
    queryKey: ['internal-team-members'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_internal_team_members');
      if (error) throw error;
      return ((data as Record<string, string>[]) || []).map((r) => ({
        id: r.user_id,
        name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email,
        email: r.email,
        role: r.role,
      }));
    },
    staleTime: 60_000,
  });
}
