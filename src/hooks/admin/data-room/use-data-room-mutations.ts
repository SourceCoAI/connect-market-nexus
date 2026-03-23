/**
 * Data Room mutation hooks — all useMutation hooks for data room operations
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

function getFunctionsBaseUrl(): string {
  const resolvedUrl = import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL;

  if (!resolvedUrl) {
    throw new Error('Supabase URL is not configured. Set VITE_SUPABASE_URL in your .env file.');
  }

  return `${resolvedUrl}/functions/v1`;
}

// ─── Upload Document ───

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      dealId,
      folderName,
      documentCategory,
      allowDownload = true,
    }: {
      file: File;
      dealId: string;
      folderName: string;
      documentCategory: 'anonymous_teaser' | 'full_memo' | 'data_room';
      allowDownload?: boolean;
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('deal_id', dealId);
      formData.append('folder_name', folderName);
      formData.append('document_category', documentCategory);
      formData.append('allow_download', String(allowDownload));

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${getFunctionsBaseUrl()}/data-room-upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = 'Upload failed';
        try {
          const err = await response.json();
          errorMessage = err.error || errorMessage;
        } catch {
          // Response wasn't JSON (e.g. HTML error page)
          errorMessage = `Upload failed (HTTP ${response.status}). The data-room-upload function may not be deployed.`;
        }
        throw new Error(errorMessage);
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['data-room-documents', variables.dealId] });
      toast({
        title: 'Document uploaded',
        description: `${variables.file.name} uploaded successfully`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Delete Document ───

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId, dealId }: { documentId: string; dealId: string }) => {
      // Delete from storage first
      const { data: doc, error: docError } = await supabase
        .from('data_room_documents')
        .select('storage_path')
        .eq('id', documentId)
        .single();
      if (docError) throw docError;

      if (doc?.storage_path) {
        await supabase.storage.from('deal-data-rooms').remove([doc.storage_path]);
      }

      // Delete record
      const { error } = await supabase.from('data_room_documents').delete().eq('id', documentId);

      if (error) throw error;
      return { dealId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['data-room-documents', result.dealId] });
      toast({ title: 'Document deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Update Access ───

export function useUpdateAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      deal_id: string;
      remarketing_buyer_id?: string;
      marketplace_user_id?: string;
      can_view_teaser: boolean;
      can_view_full_memo: boolean;
      can_view_data_room: boolean;
      fee_agreement_override_reason?: string;
      expires_at?: string;
    }) => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('data-room-access', {
        body: params,
      });

      if (response.error) throw new Error(response.error.message);

      // Check for fee agreement warning
      const data = response.data as Record<string, unknown> | null;
      if (data?.error === 'fee_agreement_required') {
        throw new Error('FEE_AGREEMENT_REQUIRED');
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['data-room-access', variables.deal_id] });
      toast({ title: 'Access updated' });
    },
    onError: (error: Error) => {
      if (error.message !== 'FEE_AGREEMENT_REQUIRED') {
        toast({
          title: 'Access update failed',
          description: error.message,
          variant: 'destructive',
        });
      }
    },
  });
}

// ─── Revoke Access ───

export function useRevokeAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ accessId, dealId }: { accessId: string; dealId: string }) => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('data-room-access', {
        method: 'DELETE',
        body: { access_id: accessId, deal_id: dealId },
      });

      if (response.error) throw new Error(response.error.message);
      return { dealId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['data-room-access', result.dealId] });
      toast({ title: 'Access revoked' });
    },
    onError: (error: Error) => {
      toast({ title: 'Revoke failed', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Bulk Update Access ───

export function useBulkUpdateAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      deal_id: string;
      buyer_ids: Array<{ remarketing_buyer_id?: string; marketplace_user_id?: string }>;
      can_view_teaser: boolean;
      can_view_full_memo: boolean;
      can_view_data_room: boolean;
    }) => {
      const response = await supabase.functions.invoke('data-room-access', {
        body: { ...params, bulk: true },
      });

      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['data-room-access', variables.deal_id] });
      toast({
        title: 'Bulk access updated',
        description: `Updated ${variables.buyer_ids.length} buyers`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Bulk update failed', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Document URL (signed URLs) ───

export function useDocumentUrl() {
  return useMutation({
    mutationFn: async ({
      documentId,
      action = 'view',
    }: {
      documentId: string;
      action?: 'view' | 'download';
    }) => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) throw new Error('Not authenticated');

      const url = `${getFunctionsBaseUrl()}/data-room-download?document_id=${documentId}&action=${action}`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!resp.ok) {
        let errorMessage = 'Failed to get document URL';
        try {
          const err = await resp.json();
          errorMessage = err.error || errorMessage;
        } catch {
          errorMessage = `Failed to get document URL (HTTP ${resp.status})`;
        }
        throw new Error(errorMessage);
      }

      return resp.json();
    },
  });
}

// ─── Generate Memo ───

export function useGenerateMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      deal_id: string;
      memo_type: 'anonymous_teaser' | 'full_memo' | 'both';
      branding?: string;
      project_name?: string;
    }) => {
      const response = await supabase.functions.invoke('generate-lead-memo', {
        body: params,
      });

      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-memos', variables.deal_id] });
      toast({ title: 'Memo generated', description: 'AI draft is ready for review' });
    },
    onError: (error: Error) => {
      toast({ title: 'Generation failed', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Generate Teaser (separate edge function — reads completed lead memo only) ───

export function useGenerateTeaser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { deal_id: string; project_name?: string }) => {
      const response = await supabase.functions.invoke('generate-teaser', {
        body: params,
      });

      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-memos', variables.deal_id] });
      const validation = data?.validation;
      if (validation && !validation.pass) {
        toast({
          title: 'Teaser generated with validation errors',
          description: validation.errors?.join('; ') || 'Anonymity checks failed',
          variant: 'destructive',
        });
      } else if (validation?.warnings?.length > 0) {
        toast({
          title: 'Teaser generated with warnings',
          description: validation.warnings.join('; '),
        });
      } else {
        toast({ title: 'Teaser generated', description: 'Anonymous teaser is ready for review' });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Teaser generation failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ─── Update Memo ───

export function useUpdateMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      memoId,
      content,
      htmlContent,
      dealId,
    }: {
      memoId: string;
      content: Record<string, unknown>;
      htmlContent: string;
      dealId: string;
    }) => {
      // Save current version
      const { data: currentMemo, error: currentMemoError } = await supabase
        .from('lead_memos')
        .select('version, content, html_content')
        .eq('id', memoId)
        .single();
      if (currentMemoError) throw currentMemoError;

      if (currentMemo) {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) throw authError;
        await supabase.from('lead_memo_versions').insert({
          memo_id: memoId,
          version: currentMemo.version ?? 1,
          content: (currentMemo.content ?? {}) as Json,
          html_content: currentMemo.html_content ?? '',
          edited_by: user?.id,
        });
      }

      // Update memo
      const { error } = await supabase
        .from('lead_memos')
        .update({
          content: content as Json,
          html_content: htmlContent,
          version: (currentMemo?.version || 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', memoId);

      if (error) throw error;
      return { dealId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['lead-memos', result.dealId] });
      toast({ title: 'Memo saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Publish Memo ───

export function usePublishMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memoId, dealId }: { memoId: string; dealId: string }) => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;

      const { error } = await supabase
        .from('lead_memos')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          published_by: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', memoId);

      if (error) throw error;
      return { dealId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['lead-memos', result.dealId] });
      toast({
        title: 'Memo published',
        description: 'Memo is now available to buyers with access',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Publish failed', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Log Manual Send ───

export function useLogManualSend() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      deal_id: string;
      memo_id?: string;
      remarketing_buyer_id: string;
      memo_type: 'anonymous_teaser' | 'full_memo';
      notes?: string;
    }) => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;

      const { error } = await supabase.from('memo_distribution_log').insert({
        deal_id: params.deal_id,
        memo_id: params.memo_id,
        remarketing_buyer_id: params.remarketing_buyer_id,
        memo_type: params.memo_type,
        channel: 'manual_log',
        sent_by: user?.id,
        notes: params.notes,
      });

      if (error) throw error;
      return { dealId: params.deal_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['distribution-log', result.dealId] });
      toast({ title: 'Send logged' });
    },
    onError: (error: Error) => {
      toast({ title: 'Log failed', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Draft Outreach Email ───

export function useDraftOutreachEmail() {
  return useMutation({
    mutationFn: async (params: { deal_id: string; buyer_id: string; memo_id?: string }) => {
      const response = await supabase.functions.invoke('draft-outreach-email', {
        body: params,
      });

      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onError: (error: Error) => {
      toast({ title: 'Draft email failed', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Send Memo Email ───

export function useSendMemoEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      memo_id: string;
      buyer_id: string;
      email_address: string;
      email_subject: string;
      email_body: string;
      deal_id: string;
    }) => {
      const response = await supabase.functions.invoke('send-memo-email', {
        body: params,
      });

      if (response.error) throw new Error(response.error.message);
      return { ...response.data, dealId: params.deal_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['distribution-log', result.dealId] });
      toast({ title: 'Email sent', description: 'Memo sent and distribution logged' });
    },
    onError: (error: Error) => {
      toast({ title: 'Send failed', description: error.message, variant: 'destructive' });
    },
  });
}
