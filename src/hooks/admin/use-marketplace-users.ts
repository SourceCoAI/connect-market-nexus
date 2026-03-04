import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

export interface MarketplaceUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  buyer_type: string | null;
}

// TODO: Phase 6 — migrate to data access layer once a getApprovedProfiles() or
// get_buyer_profile RPC is added to '@/lib/data-access'. This query reads profiles
// for buyer_type and company which maps to the buyers domain, but the current
// getActiveBuyers() reads from remarketing_buyers, not profiles.
// A new data access function (e.g. getMarketplaceProfiles()) that reads from
// the profiles table with buyer_type/company fields would enable full migration.
export function useMarketplaceUsers() {
  const { user, isAdmin } = useAuth();

  return useQuery({
    queryKey: ['marketplace-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, company, buyer_type')
        .eq('approval_status', 'approved')
        .is('deleted_at', null)
        .order('email');

      if (error) throw error;
      return (data || []) as MarketplaceUser[];
    },
    enabled: !!user && isAdmin,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
