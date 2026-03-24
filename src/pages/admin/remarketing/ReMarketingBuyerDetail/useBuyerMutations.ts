import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithTimeout } from '@/lib/invoke-with-timeout';
import { toast } from 'sonner';
import { BuyerData, Transcript, EditDialogType } from './types';

export function useBuyerMutations(
  id: string | undefined,
  buyer: BuyerData | null | undefined,
  transcripts: Transcript[],
  setActiveEditDialog: (dialog: EditDialogType) => void,
) {
  const queryClient = useQueryClient();

  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    linkedin_url: '',
    is_primary: false,
  });

  const enrichMutation = useMutation({
    mutationFn: async () => {
      const { queueBuyerEnrichment } = await import('@/lib/remarketing/queueEnrichment');
      await queueBuyerEnrichment([id!]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyer', id] });
      toast.success('Buyer enriched successfully');
    },
    onError: (error: Error) => {
      toast.error(`Enrichment failed: ${error.message}`);
    },
  });

  const updateBuyerMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { error } = await supabase.from('buyers').update(data).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyer', id] });
      toast.success('Buyer updated');
      setActiveEditDialog(null);
    },
    onError: () => {
      toast.error('Failed to update buyer');
    },
  });

  const updateFeeAgreementMutation = useMutation({
    mutationFn: async (hasFeeAgreement: boolean) => {
      if (!buyer) throw new Error('No buyer data');

      if (hasFeeAgreement) {
        let firmId = buyer.marketplace_firm_id;

        if (!firmId) {
          const firmName = buyer.pe_firm_name || buyer.company_name;
          const firmWebsite = buyer.pe_firm_website || buyer.company_website;

          if (firmName) {
            const { data: createdFirmId, error: createdFirmIdError } = await supabase.rpc(
              'get_or_create_firm',
              {
                p_company_name: firmName,
                p_website: firmWebsite ?? undefined,
                p_email: undefined,
              },
            );
            if (createdFirmIdError) throw createdFirmIdError;

            if (createdFirmId) {
              firmId = createdFirmId;
              await supabase.from('buyers').update({ marketplace_firm_id: firmId }).eq('id', id!);
            }
          }
        }

        if (firmId) {
          await supabase.rpc('update_fee_agreement_firm_status', {
            p_firm_id: firmId,
            p_is_signed: true,
            p_signed_by_user_id: undefined,
            p_signed_at: new Date().toISOString(),
          });
        }

        const { error } = await supabase
          .from('buyers')
          .update({
            has_fee_agreement: true,
            fee_agreement_source: firmId ? 'marketplace_synced' : 'manual_override',
          })
          .eq('id', id!);
        if (error) throw error;
      } else {
        if (
          buyer.fee_agreement_source === 'marketplace_synced' ||
          buyer.fee_agreement_source === 'pe_firm_inherited'
        ) {
          throw new Error(
            'This fee agreement comes from the marketplace. Remove it from Firm Agreements instead.',
          );
        }

        const { error } = await supabase
          .from('buyers')
          .update({
            has_fee_agreement: false,
            fee_agreement_source: null,
          })
          .eq('id', id!);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyer', id] });
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
      toast.success('Fee agreement updated — synced to marketplace');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update fee agreement');
    },
  });

  const findContactsMutation = useMutation({
    mutationFn: async () => {
      const { findIntroductionContacts } =
        await import('@/lib/remarketing/findIntroductionContacts');
      const result = await findIntroductionContacts(id!, 'manual');
      if (!result) throw new Error('Contact discovery failed');

      // Enrich existing contacts that are missing email or phone (what Prospeo can fill)
      const { data: contactsToEnrich } = await supabase
        .from('contacts')
        .select('id')
        .eq('remarketing_buyer_id', id!)
        .eq('contact_type', 'buyer')
        .eq('archived', false)
        .or('email.is.null,phone.is.null');

      let enrichedCount = 0;
      if (contactsToEnrich && contactsToEnrich.length > 0) {
        // enrich-list-contacts enforces a max of 50 contacts per request
        const contactIds = contactsToEnrich.slice(0, 50).map((c: { id: string }) => c.id);
        const { data: enrichData, error: enrichError } = await invokeWithTimeout<{
          results: Array<{ source: string | null; email: string | null; phone: string | null }>;
        }>('enrich-list-contacts', {
          body: { contact_ids: contactIds },
          timeoutMs: 120_000,
        });
        if (enrichError) {
          console.error('[findContactsMutation] Enrichment failed:', enrichError.message);
        } else if (enrichData?.results) {
          enrichedCount = enrichData.results.filter(
            (r) => r.source && r.source !== 'existing' && (r.email || r.phone),
          ).length;
        }
      }

      return { ...result, enrichedCount };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'contacts', id] });
      if (result.total_saved > 0 && result.enrichedCount > 0) {
        toast.success(
          `Found ${result.total_saved} new contact${result.total_saved === 1 ? '' : 's'} and enriched ${result.enrichedCount} existing contact${result.enrichedCount === 1 ? '' : 's'} at ${result.firmName}`,
        );
      } else if (result.total_saved > 0) {
        toast.success(
          `Found ${result.total_saved} contact${result.total_saved === 1 ? '' : 's'} at ${result.firmName}`,
        );
      } else if (result.enrichedCount > 0) {
        toast.success(
          `Enriched ${result.enrichedCount} contact${result.enrichedCount === 1 ? '' : 's'} at ${result.firmName}`,
        );
      } else {
        toast.info('No new contacts found');
      }
    },
    onError: (error: Error) => {
      toast.error(`Contact discovery failed: ${error.message}`);
    },
  });

  const addContactMutation = useMutation({
    mutationFn: async () => {
      const nameParts = newContact.name.trim().split(/\s+/);
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.slice(1).join(' ') || '';

      const { error } = await (supabase.rpc as any)('upsert_buyer_contact', {
        p_first_name: firstName,
        p_last_name: lastName,
        p_email: newContact.email || null,
        p_phone: newContact.phone || null,
        p_title: newContact.role || null,
        p_linkedin_url: newContact.linkedin_url || null,
        p_is_primary_at_firm: newContact.is_primary,
        p_remarketing_buyer_id: id!,
        p_firm_id: buyer?.marketplace_firm_id ?? null,
        p_source: 'remarketing_manual',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'contacts', id] });
      toast.success('Contact added');
      setIsContactDialogOpen(false);
      setNewContact({
        name: '',
        email: '',
        phone: '',
        role: '',
        linkedin_url: '',
        is_primary: false,
      });
    },
    onError: () => {
      toast.error('Failed to add contact');
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async (contact: {
      id: string;
      name: string;
      email: string;
      phone: string;
      role: string;
      linkedin_url: string;
    }) => {
      const nameParts = contact.name.trim().split(/\s+/);
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.slice(1).join(' ') || '';

      const { error } = await (supabase.rpc as any)('update_buyer_contact', {
        p_contact_id: contact.id,
        p_first_name: firstName,
        p_last_name: lastName,
        p_email: contact.email || null,
        p_phone: contact.phone || null,
        p_title: contact.role || null,
        p_linkedin_url: contact.linkedin_url || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'contacts', id] });
      toast.success('Contact updated');
    },
    onError: () => {
      toast.error('Failed to update contact');
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      // Soft-delete by archiving instead of hard delete
      const { error } = await supabase
        .from('contacts')
        .update({ archived: true, updated_at: new Date().toISOString() })
        .eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'contacts', id] });
      toast.success('Contact deleted');
    },
    onError: () => {
      toast.error('Failed to delete contact');
    },
  });

  const addTranscriptMutation = useMutation({
    mutationFn: async ({
      text,
      source,
      fileName,
      fileUrl,
      triggerExtract,
    }: {
      text: string;
      source: string;
      fileName?: string;
      fileUrl?: string;
      triggerExtract?: boolean;
    }) => {
      const { data, error } = await supabase
        .from('buyer_transcripts')
        .insert([
          {
            buyer_id: id!,
            title: fileName || 'Manual Transcript',
            transcript_text: text || null,
            source: source || 'manual',
            file_url: fileUrl || null,
            extraction_status: 'pending',
          },
        ])
        .select('id')
        .single();
      if (error) throw error;
      const result = data as unknown as { id: string };
      return {
        transcriptId: result.id,
        transcriptText: text,
        source,
        triggerExtract: !!triggerExtract,
      };
    },
    onSuccess: ({ transcriptId, transcriptText, source, triggerExtract }) => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'transcripts', id] });
      toast.success('Transcript added');
      if (triggerExtract && transcriptText?.trim()) {
        extractTranscriptMutation.mutate({ transcriptId, transcriptText, source });
      }
    },
    onError: () => {
      toast.error('Failed to add transcript');
    },
  });

  const extractTranscriptMutation = useMutation({
    mutationFn: async (params: {
      transcriptId: string;
      transcriptText?: string;
      source?: string;
    }) => {
      let textToExtract = params.transcriptText;
      let sourceToUse = params.source || 'call';

      if (!textToExtract) {
        const transcript = transcripts.find((t) => t.id === params.transcriptId);
        if (transcript) {
          textToExtract = transcript.transcript_text;
          sourceToUse = transcript.source || 'call';
        } else {
          const { data, error: transcriptError } = await supabase
            .from('buyer_transcripts')
            .select('transcript_text, source')
            .eq('id', params.transcriptId)
            .single();
          if (transcriptError) throw transcriptError;
          const result = data as unknown as { transcript_text?: string; source?: string } | null;
          textToExtract = result?.transcript_text || '';
          sourceToUse = result?.source || 'call';
        }
      }

      if (!textToExtract?.trim()) {
        throw new Error(
          'No transcript text available to extract from. Please add transcript content first.',
        );
      }

      const { data, error } = await invokeWithTimeout<any>('extract-transcript', {
        body: {
          buyerId: id,
          transcriptText: textToExtract,
          source: sourceToUse,
          transcriptId: params.transcriptId,
        },
        timeoutMs: 120_000,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'transcripts', id] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyer', id] });
    },
    onError: (error: Error) => {
      toast.error(`Extraction failed: ${error.message}`);
    },
  });

  const analyzeNotesMutation = useMutation({
    mutationFn: async (notesText: string) => {
      const { data, error } = await invokeWithTimeout<any>('analyze-buyer-notes', {
        body: { buyerId: id, notesText },
        timeoutMs: 120_000,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyer', id] });
      const count = data?.fieldsUpdated?.length || 0;
      const blocked = data?.blockedFields?.length || 0;
      let msg = `Analyzed notes — ${count} fields updated`;
      if (blocked > 0) {
        msg += `, ${blocked} blocked by higher-priority sources`;
      }
      toast.success(msg);
    },
    onError: (error: Error) => {
      toast.error(`Notes analysis failed: ${error.message}`);
    },
  });

  const deleteTranscriptMutation = useMutation({
    mutationFn: async (transcriptId: string) => {
      const { error } = await supabase.from('buyer_transcripts').delete().eq('id', transcriptId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'transcripts', id] });
      toast.success('Transcript deleted');
    },
    onError: () => {
      toast.error('Failed to delete transcript');
    },
  });

  return {
    enrichMutation,
    findContactsMutation,
    updateBuyerMutation,
    updateFeeAgreementMutation,
    analyzeNotesMutation,
    addContactMutation,
    updateContactMutation,
    deleteContactMutation,
    addTranscriptMutation,
    extractTranscriptMutation,
    deleteTranscriptMutation,
    isContactDialogOpen,
    setIsContactDialogOpen,
    newContact,
    setNewContact,
  };
}
