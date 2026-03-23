import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { markAdminViewAsViewed } from '@/lib/data-access';

export function useMarkUsersViewed() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');

      const result = await markAdminViewAsViewed(user.id, 'users');
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      // Invalidate the unviewed count query
      queryClient.invalidateQueries({ queryKey: ['unviewed-users-count'] });
    },
  });

  return {
    markAsViewed: mutation.mutate,
    isLoading: mutation.isPending,
  };
}
