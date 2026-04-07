import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the count of pending (non-signed) document requests for the admin sidebar badge.
 */
export function usePendingDocumentRequests() {
  return useQuery<number>({
    queryKey: ['admin-pending-doc-requests'],
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('document_requests')
        .select('id', { count: 'exact', head: true })
        .in('status', ['requested', 'email_sent']);

      if (error) throw error;
      return count ?? 0;
    },
  });
}
