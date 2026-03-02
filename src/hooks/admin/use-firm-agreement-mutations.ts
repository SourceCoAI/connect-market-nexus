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
    onSuccess: (_data, params) => {
      // Admin-side queries
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['firm-members'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['admin-users'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['agreement-audit-log'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['admin-document-tracking'] });
      // Buyer-side queries — ensure toggle changes propagate immediately
      queryClient.invalidateQueries({ queryKey: ['buyer-firm-agreement-status'] });
      queryClient.invalidateQueries({ queryKey: ['my-agreement-status'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-nda-status'] });
      queryClient.invalidateQueries({ queryKey: ['thread-buyer-firm'] });
      queryClient.invalidateQueries({ queryKey: ['user-firm'] });

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
