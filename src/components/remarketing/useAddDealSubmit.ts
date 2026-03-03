/**
 * useAddDealSubmit.ts
 *
 * Custom hook encapsulating the deal creation mutation, duplicate detection,
 * marketplace-to-remarketing promotion, and background transcript upload logic.
 *
 * Extracted from AddDealDialog.tsx for maintainability.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { normalizeDomain } from '@/lib/remarketing/normalizeDomain';

const TEXT_EXTENSIONS = ['txt', 'vtt', 'srt'];
const DOC_EXTENSIONS = ['pdf', 'doc', 'docx'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface AddDealFormData {
  title: string;
  website: string;
  location: string;
  revenue: string;
  ebitda: string;
  description: string;
  transcriptLink: string;
  mainContactName: string;
  mainContactEmail: string;
  mainContactPhone: string;
  mainContactTitle: string;
}

export const INITIAL_FORM_DATA: AddDealFormData = {
  title: '',
  website: '',
  location: '',
  revenue: '',
  ebitda: '',
  description: '',
  transcriptLink: '',
  mainContactName: '',
  mainContactEmail: '',
  mainContactPhone: '',
  mainContactTitle: '',
};

interface UseAddDealSubmitOptions {
  referralPartnerId?: string;
  onDealCreated?: () => void;
  onOpenChange: (open: boolean) => void;
  formDataRef: React.MutableRefObject<AddDealFormData>;
  transcriptFilesRef: React.MutableRefObject<File[]>;
  resetForm: () => void;
}

export function useAddDealSubmit({
  referralPartnerId,
  onDealCreated,
  onOpenChange,
  formDataRef,
  transcriptFilesRef,
  resetForm,
}: UseAddDealSubmitOptions) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  /** Background transcript upload (non-blocking) */
  const uploadTranscriptsInBackground = async (
    listingId: string,
    userId: string,
    files: File[],
    transcriptLink: string,
  ) => {
    if (transcriptLink) {
      try {
        await supabase.from('deal_transcripts').insert({
          listing_id: listingId,
          transcript_url: transcriptLink,
          transcript_text: 'Pending text extraction from link',
          title: 'Linked Transcript',
          created_by: userId,
          source: 'link',
        } as never);
      } catch (err) {
        // Transcript link error -- non-blocking
      }
    }

    if (files.length === 0) return;

    const toastId = `transcripts-${listingId}`;
    toast.info(`Uploading 0/${files.length} transcripts...`, { id: toastId, duration: Infinity });
    let uploaded = 0;

    for (const file of files) {
      try {
        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'txt';
        const filePath = `${listingId}/${Date.now()}-${file.name}`;

        const { error: uploadError } = await supabase.storage
          .from('deal-transcripts')
          .upload(filePath, file);

        if (uploadError) continue;

        const {
          data: { publicUrl },
        } = supabase.storage.from('deal-transcripts').getPublicUrl(filePath);

        let transcriptText = '';
        if (TEXT_EXTENSIONS.includes(fileExt)) {
          transcriptText = await file.text();
        } else if (DOC_EXTENSIONS.includes(fileExt)) {
          try {
            const parseFormData = new FormData();
            parseFormData.append('file', file);
            const { data: parseResult, error: parseError } = await supabase.functions.invoke(
              'parse-transcript-file',
              { body: parseFormData },
            );
            if (parseError) {
              transcriptText = 'Pending text extraction';
            } else {
              transcriptText = parseResult?.text || 'Pending text extraction';
            }
          } catch (parseErr) {
            transcriptText = 'Pending text extraction';
          }
        }

        await supabase.from('deal_transcripts').insert({
          listing_id: listingId,
          transcript_url: publicUrl,
          transcript_text: transcriptText || 'Pending text extraction',
          title: file.name,
          created_by: userId,
          source: 'file_upload',
        } as never);

        uploaded++;
        toast.info(`Uploading ${uploaded}/${files.length} transcripts...`, {
          id: toastId,
          duration: Infinity,
        });

        if (uploaded < files.length) {
          await sleep(2000);
        }
      } catch (err) {
        // Transcript handling error -- non-blocking for this file
      }
    }

    toast.success(`${uploaded} transcript${uploaded > 1 ? 's' : ''} uploaded`, { id: toastId });
    queryClient.invalidateQueries({ queryKey: ['listings'] });
    queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
  };

  const createDealMutation = useMutation({
    mutationFn: async () => {
      const formData = formDataRef.current;
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;

      // Check for duplicate deal by website domain
      const websiteUrl = formData.website?.trim();
      if (websiteUrl) {
        const normalizedInput = normalizeDomain(websiteUrl);
        if (normalizedInput) {
          const { data: existingListings, error: existingListingsError } = await supabase
            .from('listings')
            .select('id, title, internal_company_name, website')
            .not('website', 'is', null);
          if (existingListingsError) throw existingListingsError;

          const duplicate = existingListings?.find(
            (l) => l.website && normalizeDomain(l.website) === normalizedInput,
          );

          if (duplicate) {
            const dupName = duplicate.internal_company_name || duplicate.title || 'Unknown';
            throw new Error(
              `A deal with this website already exists: "${dupName}". Use "From Marketplace" tab to add it instead.`,
            );
          }
        }
      }

      const insertData: Record<string, unknown> = {
        title: formData.title,
        website: formData.website || null,
        location: formData.location || null,
        revenue: formData.revenue ? parseFloat(formData.revenue.replace(/[^0-9.]/g, '')) : null,
        ebitda: formData.ebitda ? parseFloat(formData.ebitda.replace(/[^0-9.]/g, '')) : null,
        description: formData.description || null,
        category: 'Other',
        status: referralPartnerId ? 'pending_referral_review' : 'active',
        is_internal_deal: true,
        main_contact_name: formData.mainContactName || null,
        main_contact_email: formData.mainContactEmail || null,
        main_contact_phone: formData.mainContactPhone || null,
        main_contact_title: formData.mainContactTitle || null,
      };

      if (referralPartnerId) {
        insertData.referral_partner_id = referralPartnerId;
      }

      const { data: listing, error } = await supabase
        .from('listings')
        .insert(insertData as never)
        .select()
        .single();

      if (error) {
        if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
          throw new Error('A deal with this website already exists.');
        }
        throw error;
      }
      return { listing, userId: user?.id };
    },
    onSuccess: ({ listing, userId }) => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
      toast.success(`Created "${listing.title}" successfully`);

      const filesToUpload = [...transcriptFilesRef.current];
      const linkToSave = formDataRef.current.transcriptLink;

      resetForm();
      onDealCreated?.();
      onOpenChange(false);
      navigate(`/admin/deals/${listing.id}`, { state: { from: '/admin/deals' } });

      if (userId && (filesToUpload.length > 0 || linkToSave)) {
        uploadTranscriptsInBackground(listing.id, userId, filesToUpload, linkToSave);
      }
    },
    onError: (error) => {
      toast.error(`Failed to create deal: ${error.message}`);
    },
  });

  /** Add a marketplace listing to remarketing */
  const handleAddFromMarketplace = async (
    listing: { id: string; title?: string; internal_company_name?: string },
    setAddingId: (id: string | null) => void,
    addToSet: (id: string) => void,
  ) => {
    setAddingId(listing.id);
    try {
      const updateData: Record<string, unknown> = { is_internal_deal: true };
      if (referralPartnerId) {
        updateData.referral_partner_id = referralPartnerId;
        updateData.status = 'pending_referral_review';
      }
      const { error } = await supabase
        .from('listings')
        .update(updateData as never)
        .eq('id', listing.id);

      if (error) throw error;

      addToSet(listing.id);
      toast.success(`"${listing.title || listing.internal_company_name}" added to remarketing`);
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['existing-remarketing-deal-ids'] });
    } catch (err: unknown) {
      toast.error(`Failed to add: ${(err as Error).message}`);
    } finally {
      setAddingId(null);
    }
  };

  return {
    createDealMutation,
    handleAddFromMarketplace,
  };
}
