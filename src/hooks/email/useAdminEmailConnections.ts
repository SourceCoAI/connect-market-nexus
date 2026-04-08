/**
 * Hook for admin dashboard — view all team member email connections.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EmailConnection } from '@/types/email';

interface EmailConnectionWithProfile extends EmailConnection {
  profile?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export function useAdminEmailConnections() {
  return useQuery({
    queryKey: ['email', 'admin', 'connections'],
    queryFn: async (): Promise<EmailConnectionWithProfile[]> => {
      // Fetch all connections (admin RLS allows this)
      const { data: connections, error } = await (supabase as any)
        .from('email_connections')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!connections || connections.length === 0) return [];

      // Fetch profiles for each connection
      const userIds = connections.map((c: EmailConnection) => c.sourceco_user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', userIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.id, p]),
      );

      return connections.map((conn: EmailConnection) => ({
        ...conn,
        profile: profileMap.get(conn.sourceco_user_id) || undefined,
      }));
    },
    staleTime: 30_000,
  });
}
