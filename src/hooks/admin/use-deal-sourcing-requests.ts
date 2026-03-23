import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTabAwareQuery } from '@/hooks/use-tab-aware-query';
import { toast } from '@/hooks/use-toast';

export interface DealSourcingRequest {
  id: string;
  user_id: string;
  buyer_type: string | null;
  business_categories: string[] | null;
  target_locations: string[] | null;
  revenue_min: string | null;
  revenue_max: string | null;
  investment_thesis: string | null;
  custom_message: string | null;
  additional_notes: string | null;
  status: string;
  assigned_to: string | null;
  followed_up_at: string | null;
  admin_notes: string | null;
  converted_to_deal_id: string | null;
  created_at: string;
  updated_at: string;
  user_email?: string;
  user_name?: string;
  user_company?: string;
  assigned_admin_name?: string;
}

export interface DealSourcingFilters {
  status?: string;
  buyerType?: string;
  assignedTo?: string;
  hasCustomMessage?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export const useDealSourcingRequests = (filters?: DealSourcingFilters) => {
  const { user: _user, authChecked, isAdmin } = useAuth();

  // Get cached auth state for more stable query enabling
  const cachedAuthState = (() => {
    try {
      const cached = localStorage.getItem('auth-state');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  })();

  const isAdminUser = isAdmin || cachedAuthState?.is_admin === true;
  const shouldEnable = (authChecked || cachedAuthState) && isAdminUser;

  return useTabAwareQuery(
    ['deal-sourcing-requests', filters],
    async () => {
      if (!isAdminUser) {
        toast({
          title: 'Access Denied',
          description: 'Admin authentication required to view deal sourcing requests.',
          variant: 'destructive',
        });
        throw new Error('Admin authentication required');
      }

      let query = supabase
        .from('deal_sourcing_requests')
        .select(
          `
          *,
          profiles:user_id (
            email,
            first_name,
            last_name,
            company_name
          ),
          assigned_admin:assigned_to (
            email,
            first_name,
            last_name
          )
        `,
        )
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.buyerType) {
        query = query.eq('buyer_type', filters.buyerType);
      }

      if (filters?.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo);
      }

      if (filters?.hasCustomMessage) {
        query = query.not('custom_message', 'is', null);
      }

      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }

      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }

      const { data, error } = await query;

      if (error) {
        toast({
          title: 'Error Loading Requests',
          description: error.message || 'Failed to load deal sourcing requests. Please try again.',
          variant: 'destructive',
        });
        throw error;
      }

      // Transform data to include user info
      return (
        (data || []) as Array<{
          profiles?: {
            email?: string;
            first_name?: string;
            last_name?: string;
            company_name?: string;
          } | null;
          assigned_admin?: { email?: string; first_name?: string; last_name?: string } | null;
          [key: string]: unknown;
        }>
      ).map((request) => ({
        ...request,
        user_email: request.profiles?.email,
        user_name:
          request.profiles?.first_name && request.profiles?.last_name
            ? `${request.profiles.first_name} ${request.profiles.last_name}`
            : request.profiles?.email,
        user_company: request.profiles?.company_name,
        assigned_admin_name:
          request.assigned_admin?.first_name && request.assigned_admin?.last_name
            ? `${request.assigned_admin.first_name} ${request.assigned_admin.last_name}`
            : request.assigned_admin?.email,
      })) as DealSourcingRequest[];
    },
    {
      enabled: shouldEnable,
      staleTime: 30 * 1000, // 30 seconds
      retry: 2,
      refetchOnMount: true,
    },
  );
};

export const useUpdateDealSourcingRequest = () => {
  return async (id: string, updates: Partial<DealSourcingRequest>) => {
    const { error } = await supabase.from('deal_sourcing_requests').update(updates).eq('id', id);

    if (error) throw error;
  };
};
