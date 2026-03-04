import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { markAdminViewAsViewed } from '@/lib/data-access';

export function useMarkOwnerLeadsViewed() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const markAsViewed = async () => {
    if (!user?.id) return;

    try {
      const result = await markAdminViewAsViewed(user.id, 'owner_leads');

      if (result.error) {
        console.error('Error marking owner leads as viewed:', result.error);
        return;
      }

      // Invalidate the unviewed count query to reset the badge
      queryClient.invalidateQueries({ queryKey: ['unviewed-owner-leads-count'] });
    } catch (error) {
      console.error('Error marking owner leads as viewed:', error);
    }
  };

  return { markAsViewed };
}
