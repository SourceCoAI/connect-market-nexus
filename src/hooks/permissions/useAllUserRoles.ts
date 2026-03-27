import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { UserRoleEntry } from './useRoleManagement';

export function useAllUserRoles() {
  const { data: allUserRoles, isLoading: isLoadingRoles } = useQuery({
    queryKey: ['all-user-roles'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_user_roles');
      if (error) throw error;
      return data as UserRoleEntry[];
    },
    staleTime: 1000 * 60 * 5,
  });
  return { allUserRoles, isLoadingRoles };
}
