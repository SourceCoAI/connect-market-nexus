import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { markAdminViewAsViewed } from '@/lib/data-access';

export function useMarkConnectionRequestsViewed() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');

      const result = await markAdminViewAsViewed(user.id, 'connection_requests');
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      // Invalidate the unviewed count query
      queryClient.invalidateQueries({ queryKey: ['unviewed-connection-requests-count'] });
    },
  });

  return {
    markAsViewed: mutation.mutate,
    isLoading: mutation.isPending,
  };
}
