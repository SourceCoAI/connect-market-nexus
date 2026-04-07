import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, untypedFrom } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  PortalOrganization,
  PortalOrganizationWithDetails,
  CreatePortalOrgInput,
} from '@/types/portal';

const PORTAL_ORGS_KEY = ['portal-organizations'];

export function usePortalOrganizations() {
  return useQuery({
    queryKey: PORTAL_ORGS_KEY,
    queryFn: async (): Promise<PortalOrganizationWithDetails[]> => {
      const { data, error } = await untypedFrom('portal_organizations')
        .select(`
          *,
          relationship_owner:profiles!portal_organizations_relationship_owner_id_fkey(
            id, first_name, last_name, email
          ),
          buyer:buyers!portal_organizations_buyer_id_fkey(
            id, company_name, company_website, buyer_type
          )
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch counts per org
      const orgIds = (data || []).map((o: PortalOrganization) => o.id);
      if (orgIds.length === 0) return [];

      const [usersRes, pushesRes] = await Promise.all([
        untypedFrom('portal_users')
          .select('portal_org_id')
          .in('portal_org_id', orgIds)
          .eq('is_active', true),
        untypedFrom('portal_deal_pushes')
          .select('portal_org_id')
          .in('portal_org_id', orgIds)
          .neq('status', 'archived'),
      ]);

      const userCounts: Record<string, number> = {};
      const pushCounts: Record<string, number> = {};
      (usersRes.data || []).forEach((u: { portal_org_id: string }) => {
        userCounts[u.portal_org_id] = (userCounts[u.portal_org_id] || 0) + 1;
      });
      (pushesRes.data || []).forEach((p: { portal_org_id: string }) => {
        pushCounts[p.portal_org_id] = (pushCounts[p.portal_org_id] || 0) + 1;
      });

      return (data || []).map((org: PortalOrganization & { relationship_owner: PortalOrganizationWithDetails['relationship_owner']; buyer: PortalOrganizationWithDetails['buyer'] }) => ({
        ...org,
        user_count: userCounts[org.id] || 0,
        active_push_count: pushCounts[org.id] || 0,
      }));
    },
  });
}

export function usePortalOrganization(slug: string | undefined) {
  return useQuery({
    queryKey: ['portal-organization', slug],
    queryFn: async (): Promise<PortalOrganizationWithDetails | null> => {
      if (!slug) return null;
      const { data, error } = await untypedFrom('portal_organizations')
        .select(`
          *,
          relationship_owner:profiles!portal_organizations_relationship_owner_id_fkey(
            id, first_name, last_name, email
          ),
          buyer:buyers!portal_organizations_buyer_id_fkey(
            id, company_name, company_website, buyer_type
          )
        `)
        .eq('portal_slug', slug)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw error;
      return data as PortalOrganizationWithDetails | null;
    },
    enabled: !!slug,
  });
}

export function useCreatePortalOrg() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreatePortalOrgInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await untypedFrom('portal_organizations')
        .insert({
          name: input.name,
          buyer_id: input.buyer_id || null,
          profile_id: input.profile_id || null,
          relationship_owner_id: input.relationship_owner_id || null,
          portal_slug: input.portal_slug,
          welcome_message: input.welcome_message || null,
          logo_url: input.logo_url || null,
          preferred_industries: input.preferred_industries || [],
          preferred_deal_size_min: input.preferred_deal_size_min ?? null,
          preferred_deal_size_max: input.preferred_deal_size_max ?? null,
          preferred_geographies: input.preferred_geographies || [],
          notification_frequency: input.notification_frequency || 'instant',
          notes: input.notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await untypedFrom('portal_activity_log').insert({
        portal_org_id: data.id,
        actor_id: user.id,
        actor_type: 'admin',
        action: 'portal_created',
        metadata: { name: input.name },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PORTAL_ORGS_KEY });
      toast({ title: 'Portal created', description: 'Client portal has been set up successfully.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error creating portal', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUpdatePortalOrg() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PortalOrganization> & { id: string }) => {
      const { data, error } = await untypedFrom('portal_organizations')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: PORTAL_ORGS_KEY });
      queryClient.invalidateQueries({ queryKey: ['portal-organization', data.portal_slug] });
      toast({ title: 'Portal updated' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error updating portal', description: err.message, variant: 'destructive' });
    },
  });
}
