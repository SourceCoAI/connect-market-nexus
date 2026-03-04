import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { markAdminViewAsViewed } from '@/lib/data-access';

export function useMarkDealSourcingAsViewed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Not authenticated');

      const result = await markAdminViewAsViewed(user.id, 'deal_sourcing');
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unviewed-deal-sourcing-count'] });
    },
  });
}
