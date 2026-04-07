/**
 * Firm Agreements mutation hooks — all useMutation hooks
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { FirmAgreement, UpdateAgreementStatusParams } from './use-firm-agreements';

// ─── Update Fee Agreement (legacy) ───

export function useUpdateFirmFeeAgreement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      firmId,
      isSigned,
      signedByUserId,
      signedByName: _signedByName,
    }: {
      firmId: string;
      isSigned: boolean;
      signedByUserId?: string | null;
      signedByName?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('update_fee_agreement_firm_status', {
        p_firm_id: firmId,
        p_is_signed: isSigned,
        p_signed_by_user_id: signedByUserId ?? undefined,
        p_signed_at: (isSigned ? new Date().toISOString() : null) ?? undefined,
      });

      if (error) throw error;
      return data;
    },
    onMutate: async ({ firmId, isSigned }) => {
      await queryClient.cancelQueries({ queryKey: ['firm-agreements'] });

      const previousData = queryClient.getQueryData(['firm-agreements']);

      queryClient.setQueryData<FirmAgreement[] | undefined>(['firm-agreements'], (old) => {
        if (!old) return old;
        return old.map((firm) =>
          firm.id === firmId
            ? {
                ...firm,
                fee_agreement_signed: isSigned,
                fee_agreement_signed_at: isSigned ? new Date().toISOString() : null,
              }
            : firm,
        );
      });

      return { previousData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['firm-members'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['admin-users'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['admin-document-tracking'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-firm-agreement-status'] });
      queryClient.invalidateQueries({ queryKey: ['my-agreement-status'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-nda-status'] });
      queryClient.invalidateQueries({ queryKey: ['user-firm'] });

      toast({
        title: 'Success',
        description: 'Fee agreement status updated for firm',
      });
    },
    onError: (
      error: Error,
      _variables: unknown,
      context: { previousData?: unknown } | undefined,
    ) => {
      if (context?.previousData) {
        queryClient.setQueryData(['firm-agreements'], context.previousData);
      }
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ─── Update NDA (legacy) ───

export function useUpdateFirmNDA() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      firmId,
      isSigned,
      signedByUserId,
      signedByName: _signedByName,
    }: {
      firmId: string;
      isSigned: boolean;
      signedByUserId?: string | null;
      signedByName?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('update_nda_firm_status', {
        p_firm_id: firmId,
        p_is_signed: isSigned,
        p_signed_by_user_id: signedByUserId ?? undefined,
        p_signed_at: (isSigned ? new Date().toISOString() : null) ?? undefined,
      });

      if (error) throw error;
      return data;
    },
    onMutate: async ({ firmId, isSigned }) => {
      await queryClient.cancelQueries({ queryKey: ['firm-agreements'] });

      const previousData = queryClient.getQueryData(['firm-agreements']);

      queryClient.setQueryData<FirmAgreement[] | undefined>(['firm-agreements'], (old) => {
        if (!old) return old;
        return old.map((firm) =>
          firm.id === firmId
            ? {
                ...firm,
                nda_signed: isSigned,
                nda_signed_at: isSigned ? new Date().toISOString() : null,
              }
            : firm,
        );
      });

      return { previousData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['firm-members'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['admin-users'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['admin-document-tracking'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-firm-agreement-status'] });
      queryClient.invalidateQueries({ queryKey: ['my-agreement-status'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-nda-status'] });
      queryClient.invalidateQueries({ queryKey: ['user-firm'] });

      toast({
        title: 'Success',
        description: 'NDA status updated for firm',
      });
    },
    onError: (
      error: Error,
      _variables: unknown,
      context: { previousData?: unknown } | undefined,
    ) => {
      if (context?.previousData) {
        queryClient.setQueryData(['firm-agreements'], context.previousData);
      }
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ─── Update Agreement Status (expanded) ───

export function useUpdateAgreementStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: UpdateAgreementStatusParams) => {
      const { data, error } = await supabase.rpc('update_firm_agreement_status', {
        p_firm_id: params.firmId,
        p_agreement_type: params.agreementType,
        p_new_status: params.newStatus,
        p_signed_by_name: params.signedByName ?? undefined,
        p_signed_by_user_id: params.signedByUserId ?? undefined,
        p_document_url: params.documentUrl ?? undefined,
        p_redline_notes: params.redlineNotes ?? undefined,
        p_redline_document_url: params.redlineDocumentUrl ?? undefined,
        p_custom_terms: params.customTerms ?? undefined,
        p_expires_at: params.expiresAt ?? undefined,
        p_source: params.source ?? 'platform',
        p_scope: params.scope ?? 'blanket',
        p_deal_id: params.dealId ?? undefined,
        p_notes: params.notes ?? undefined,
      });

      if (error) throw error;
      return data;
    },
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: ['firm-agreements'] });
      const previousData = queryClient.getQueryData(['firm-agreements']);

      queryClient.setQueryData<FirmAgreement[] | undefined>(['firm-agreements'], (old) => {
        if (!old) return old;
        return old.map((firm) => {
          if (firm.id !== params.firmId) return firm;
          if (params.agreementType === 'nda') {
            return {
              ...firm,
              nda_status: params.newStatus,
              nda_signed: params.newStatus === 'signed',
              nda_signed_at:
                params.newStatus === 'signed' ? (firm.nda_signed_at || new Date().toISOString()) : null,
              nda_signed_by_name:
                params.newStatus === 'signed' ? (firm.nda_signed_by_name || params.signedByName || null) : null,
            };
          }
          return {
            ...firm,
            fee_agreement_status: params.newStatus,
            fee_agreement_signed: params.newStatus === 'signed',
            fee_agreement_signed_at:
              params.newStatus === 'signed'
                ? (firm.fee_agreement_signed_at || new Date().toISOString())
                : null,
            fee_agreement_signed_by_name:
              params.newStatus === 'signed' ? (firm.fee_agreement_signed_by_name || params.signedByName || null) : null,
          };
        });
      });

      return { previousData };
    },
    onSuccess: async (_data, params) => {
      // If status is being set to 'signed', update any pending document_requests and notify firm members
      if (params.newStatus === 'signed') {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const adminName = user.user_metadata?.first_name
              ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
              : user.email || 'Admin';
            
            // Update pending document_requests for this firm + agreement type
            await supabase
              .from('document_requests')
              .update({
                status: 'signed',
                signed_at: new Date().toISOString(),
                signed_toggled_by: user.id,
                signed_toggled_by_name: adminName,
              })
              .eq('firm_id', params.firmId)
              .eq('agreement_type', params.agreementType)
              .neq('status', 'signed');
          }
        } catch (err) {
          console.warn('Failed to update document_requests on sign toggle:', err);
        }

        // Send confirmation email to firm members
        try {
          await supabase.functions.invoke('notify-agreement-confirmed', {
            body: {
              firmId: params.firmId,
              agreementType: params.agreementType,
            },
          });
        } catch (err) {
          console.warn('Failed to send agreement confirmation email:', err);
        }
      }

      // Admin-side queries
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['firm-members'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['admin-users'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['agreement-audit-log'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['admin-document-tracking'] });
      queryClient.invalidateQueries({ queryKey: ['admin-pending-doc-requests'] });
      // Buyer-side queries
      queryClient.invalidateQueries({ queryKey: ['buyer-firm-agreement-status'] });
      queryClient.invalidateQueries({ queryKey: ['my-agreement-status'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-nda-status'] });
      queryClient.invalidateQueries({ queryKey: ['thread-buyer-firm'] });
      queryClient.invalidateQueries({ queryKey: ['user-firm'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-signed-documents'] });

      const typeLabel = params.agreementType === 'nda' ? 'NDA' : 'Fee Agreement';
      toast({
        title: `${typeLabel} Updated`,
        description: `Status changed to ${params.newStatus.replace(/_/g, ' ')}`,
      });
    },
    onError: (
      error: Error,
      _variables: unknown,
      context: { previousData?: unknown } | undefined,
    ) => {
      if (context?.previousData) {
        queryClient.setQueryData(['firm-agreements'], context.previousData);
      }
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ─── Add Domain Alias ───

export function useAddDomainAlias() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ firmId, domain }: { firmId: string; domain: string }) => {
      const { error } = await supabase
        .from('firm_domain_aliases')
        .insert({ firm_id: firmId, domain: domain.toLowerCase().trim() });

      if (error) throw error;
    },
    onSuccess: (_data, { firmId }) => {
      queryClient.invalidateQueries({ queryKey: ['firm-domain-aliases', firmId] });
      toast({ title: 'Domain alias added' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Remove Domain Alias ───

export function useRemoveDomainAlias() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ aliasId, firmId }: { aliasId: string; firmId: string }) => {
      const { error } = await supabase.from('firm_domain_aliases').delete().eq('id', aliasId);

      if (error) throw error;
      return firmId;
    },
    onSuccess: (_data, { firmId }) => {
      queryClient.invalidateQueries({ queryKey: ['firm-domain-aliases', firmId] });
      toast({ title: 'Domain alias removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Reassign Member to Different Firm ───

export function useReassignFirmMember() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      memberId,
      oldFirmId,
      newFirmId,
      userId,
    }: {
      memberId: string;
      oldFirmId: string;
      newFirmId: string;
      userId: string | null;
    }) => {
      // Delete old membership
      const { error: delError } = await supabase
        .from('firm_members' as never)
        .delete()
        .eq('id', memberId);
      if (delError) throw delError;

      // Insert new membership
      if (userId) {
        const { error: insError } = await supabase
          .from('firm_members' as never)
          .upsert(
            { firm_id: newFirmId, user_id: userId, member_type: 'marketplace_user', added_at: new Date().toISOString() } as never,
            { onConflict: 'firm_id,user_id' },
          );
        if (insError) throw insError;
      }

      // Update connection_requests
      if (userId) {
        await supabase
          .from('connection_requests' as never)
          .update({ firm_id: newFirmId } as never)
          .eq('user_id', userId)
          .eq('firm_id', oldFirmId);
      }

      // Update member counts
      for (const fId of [oldFirmId, newFirmId]) {
        const { count } = await supabase
          .from('firm_members' as never)
          .select('id', { count: 'exact', head: true })
          .eq('firm_id', fId);
        await supabase
          .from('firm_agreements')
          .update({ member_count: count ?? 0, updated_at: new Date().toISOString() })
          .eq('id', fId);
      }

      return { oldFirmId, newFirmId };
    },
    onSuccess: (_data, { oldFirmId, newFirmId }) => {
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
      queryClient.invalidateQueries({ queryKey: ['firm-members', oldFirmId] });
      queryClient.invalidateQueries({ queryKey: ['firm-members', newFirmId] });
      queryClient.invalidateQueries({ queryKey: ['admin-document-tracking'] });
      queryClient.invalidateQueries({ queryKey: ['user-firm'] });
      queryClient.invalidateQueries({ queryKey: ['connection-request-firm'] });
      toast({ title: 'Member reassigned to correct firm' });
    },
    onError: (error: Error) => {
      toast({ title: 'Reassignment failed', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Remove Member from Firm ───

export function useRemoveFirmMember() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ memberId, firmId }: { memberId: string; firmId: string }) => {
      const { error } = await supabase
        .from('firm_members' as never)
        .delete()
        .eq('id', memberId);
      if (error) throw error;

      // Update member count
      const { count } = await supabase
        .from('firm_members' as never)
        .select('id', { count: 'exact', head: true })
        .eq('firm_id', firmId);
      await supabase
        .from('firm_agreements')
        .update({ member_count: count ?? 0, updated_at: new Date().toISOString() })
        .eq('id', firmId);

      return firmId;
    },
    onSuccess: (_data, { firmId }) => {
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
      queryClient.invalidateQueries({ queryKey: ['firm-members', firmId] });
      queryClient.invalidateQueries({ queryKey: ['admin-document-tracking'] });
      toast({ title: 'Member removed from firm' });
    },
    onError: (error: Error) => {
      toast({ title: 'Removal failed', description: error.message, variant: 'destructive' });
    },
  });
}
