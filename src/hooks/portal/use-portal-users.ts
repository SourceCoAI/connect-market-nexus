import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, untypedFrom } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { PortalUser, InvitePortalUserInput } from '@/types/portal';

export function usePortalUsers(portalOrgId: string | undefined) {
  return useQuery({
    queryKey: ['portal-users', portalOrgId],
    queryFn: async (): Promise<PortalUser[]> => {
      if (!portalOrgId) return [];
      const { data, error } = await untypedFrom('portal_users')
        .select('*')
        .eq('portal_org_id', portalOrgId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!portalOrgId,
  });
}

export function useInvitePortalUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: InvitePortalUserInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await untypedFrom('portal_users')
        .insert({
          portal_org_id: input.portal_org_id,
          contact_id: input.contact_id || null,
          profile_id: input.profile_id || null,
          role: input.role,
          email: input.email,
          name: input.name,
          invite_sent_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await untypedFrom('portal_activity_log').insert({
        portal_org_id: input.portal_org_id,
        actor_id: user.id,
        actor_type: 'admin',
        action: 'user_invited',
        metadata: { user_name: input.name, user_email: input.email, role: input.role },
      });

      return data;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ['portal-users', input.portal_org_id] });
      toast({ title: 'User invited', description: `Invitation recorded for ${input.name}.` });
    },
    onError: (err: Error) => {
      toast({ title: 'Error inviting user', description: err.message, variant: 'destructive' });
    },
  });
}

export function useDeactivatePortalUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ userId, portalOrgId }: { userId: string; portalOrgId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await untypedFrom('portal_users')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;

      await untypedFrom('portal_activity_log').insert({
        portal_org_id: portalOrgId,
        actor_id: user.id,
        actor_type: 'admin',
        action: 'user_deactivated',
        metadata: { deactivated_user_id: userId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-users'] });
      toast({ title: 'User deactivated' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}

/** For the client portal: get the current user's portal membership for a specific portal slug */
export function useMyPortalUser(slug: string | undefined) {
  return useQuery({
    queryKey: ['my-portal-user', slug],
    queryFn: async (): Promise<(PortalUser & { portal_org: { id: string; name: string; portal_slug: string; welcome_message: string | null } }) | null> => {
      if (!slug) return null;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // First resolve the org by slug
      const { data: org } = await untypedFrom('portal_organizations')
        .select('id')
        .eq('portal_slug', slug)
        .is('deleted_at', null)
        .maybeSingle();

      if (!org) return null;

      const { data, error } = await untypedFrom('portal_users')
        .select(`
          *,
          portal_org:portal_organizations!portal_users_portal_org_id_fkey(
            id, name, portal_slug, welcome_message
          )
        `)
        .eq('profile_id', user.id)
        .eq('portal_org_id', org.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      return data as (PortalUser & { portal_org: { id: string; name: string; portal_slug: string; welcome_message: string | null } }) | null;
    },
    enabled: !!slug,
  });
}
