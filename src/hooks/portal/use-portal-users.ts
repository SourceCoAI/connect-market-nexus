import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, untypedFrom } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { PortalUser } from '@/types/portal';

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

export interface InvitePortalUserViaEdgeInput {
  portal_org_id: string;
  portal_slug: string;
  first_name: string;
  last_name?: string;
  email: string;
  role: string;
  buyer_id?: string;
  contact_id?: string;
}

export function useInvitePortalUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: InvitePortalUserViaEdgeInput) => {
      const { data, error } = await supabase.functions.invoke('invite-portal-user', {
        body: input,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data as {
        portal_user_id: string;
        profile_id: string;
        contact_id: string | null;
        email: string;
        is_new_user: boolean;
      };
    },
    onSuccess: (data, input) => {
      queryClient.invalidateQueries({ queryKey: ['portal-users', input.portal_org_id] });
      const msg = data.is_new_user
        ? `Invitation sent to ${data.email}. They will receive a login link.`
        : `${data.email} has been added to the portal.`;
      toast({ title: 'User invited', description: msg });
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

export type PortalUserWithOrg = PortalUser & {
  portal_org: { id: string; name: string; portal_slug: string; welcome_message: string | null };
};

/** For the client portal: get the current user's portal membership for a specific portal slug.
 *  Admins who are not portal members get a synthetic admin context so they can preview the portal. */
export function useMyPortalUser(slug: string | undefined) {
  return useQuery({
    queryKey: ['my-portal-user', slug],
    queryFn: async (): Promise<PortalUserWithOrg | null> => {
      if (!slug) return null;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Resolve the org by slug — RLS only allows admins and portal members
      const { data: org } = await untypedFrom('portal_organizations')
        .select('id, name, portal_slug, welcome_message')
        .eq('portal_slug', slug)
        .is('deleted_at', null)
        .maybeSingle();

      if (!org) return null;

      // Check if user is an actual portal member
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
      if (data) return data as PortalUserWithOrg;

      // If the org query succeeded but we're not a portal member, we must be
      // an admin (RLS only allows admins and portal members to read the org).
      // Synthesize an admin portal user so they can preview the portal.
      return {
        id: `admin-preview-${user.id}`,
        portal_org_id: org.id,
        profile_id: user.id,
        contact_id: null,
        role: 'admin',
        email: user.email || '',
        name: 'Admin Preview',
        is_active: true,
        last_login_at: null,
        invite_sent_at: null,
        invite_accepted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        portal_org: {
          id: org.id,
          name: org.name,
          portal_slug: org.portal_slug,
          welcome_message: org.welcome_message,
        },
      } as PortalUserWithOrg;
    },
    enabled: !!slug,
  });
}
