import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { toast } from "sonner";
import { GENERIC_EMAIL_DOMAINS } from "@/lib/generic-email-domains";
import { v4 as uuidv4 } from "uuid";
import type { DealTranscript, SingleDealEnrichmentResult } from "./types";
import { processFileText, yieldToUI, mergeArrays, stateNameToCode } from "./helpers";

/** Shape of a Fireflies search result */
interface FirefliesSearchResult {
  id: string;
  title?: string;
  date?: string;
  meeting_url?: string;
  participants?: (string | { email: string; name?: string })[];
  external_participants?: { name: string; email: string }[];
  duration_minutes?: number;
  has_content?: boolean;
  match_type?: string;
}

/** Shape of the extract-deal-transcript edge function response */
interface ExtractTranscriptResponse {
  fieldsExtracted?: number;
  dealUpdated?: boolean;
  fieldsUpdated?: string[];
}

/** Shape of the add mutation success result */
interface AddMutationResult {
  count: number;
  failed?: number;
  skipped?: number;
}

interface UseTranscriptActionsProps {
  dealId: string;
  transcripts: DealTranscript[];
  dealInfo?: {
    company_name?: string;
    industry?: string;
    location?: string;
    revenue?: number;
    ebitda?: number;
    main_contact_email?: string;
  };
}

export function useTranscriptActions({ dealId, transcripts, dealInfo }: UseTranscriptActionsProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add dialog state
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newTranscript, setNewTranscript] = useState("");
  const [transcriptTitle, setTranscriptTitle] = useState("");
  const [transcriptUrl, setTranscriptUrl] = useState("");
  const [callDate, setCallDate] = useState("");

  // Transcript list state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [isListExpanded, setIsListExpanded] = useState(false);
  const [selectedTranscriptIds, setSelectedTranscriptIds] = useState<Set<string>>(new Set());

  // Enrichment state
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentResult, setEnrichmentResult] = useState<SingleDealEnrichmentResult | null>(null);
  const [showEnrichmentDialog, setShowEnrichmentDialog] = useState(false);
  const [enrichmentPhase, setEnrichmentPhase] = useState<'transcripts' | 'website' | null>(null);
  const [enrichmentProgress, setEnrichmentProgress] = useState({ current: 0, total: 0 });
  const [enrichmentPollingEnabled, setEnrichmentPollingEnabled] = useState(false);

  // Multi-file upload state
  const [selectedFiles, setSelectedFiles] = useState<{file: File; title: string; status: 'pending' | 'processing' | 'done' | 'error'; text?: string}[]>([]);
  const [isMultiFileMode, setIsMultiFileMode] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });

  // Fireflies search in add dialog
  const [addMode, setAddMode] = useState<'manual' | 'fireflies'>('manual');
  const [firefliesEmail, setFirefliesEmail] = useState(dealInfo?.main_contact_email || '');
  const [firefliesSearching, setFirefliesSearching] = useState(false);
  const [firefliesResults, setFirefliesResults] = useState<FirefliesSearchResult[]>([]);
  const [selectedFirefliesIds, setSelectedFirefliesIds] = useState<Set<string>>(new Set());
  const [firefliesImporting, setFirefliesImporting] = useState(false);
  const [firefliesSearchInfo, setFirefliesSearchInfo] = useState<string>('');

  const resetForm = () => {
    setNewTranscript("");
    setTranscriptTitle("");
    setTranscriptUrl("");
    setCallDate("");
    setSelectedFiles([]);
    setIsMultiFileMode(false);
    setAddMode('manual');
    setFirefliesResults([]);
    setSelectedFirefliesIds(new Set());
    setFirefliesImporting(false);
  };

  const toggleTranscriptSelection = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedTranscriptIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllTranscripts = (transcriptList: DealTranscript[]) => {
    setSelectedTranscriptIds(prev =>
      prev.size === transcriptList.length ? new Set() : new Set(transcriptList.map(t => t.id))
    );
  };

  // Handle file uploads
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const validTypes = ['.pdf', '.txt', '.doc', '.docx', '.vtt', '.srt'];
    const newFiles: typeof selectedFiles = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!validTypes.includes(fileExt)) { toast.error(`${file.name}: unsupported file type`); continue; }
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name}: file too large (max 10MB)`); continue; }
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      newFiles.push({ file, title: nameWithoutExt, status: 'pending' });
    }
    if (newFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...newFiles]);
      setIsMultiFileMode(true);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Add transcript mutation
  const addMutation = useMutation({
    mutationFn: async () => {
      if (isMultiFileMode && selectedFiles.length > 0) {
        let successCount = 0;
        let skippedCount = 0;
        const totalFiles = selectedFiles.length;
        setProcessingProgress({ current: 0, total: totalFiles });
        const { data: existing, error: existingError } = await supabase.from('deal_transcripts').select('title').eq('listing_id', dealId);
        if (existingError) throw existingError;
        const existingTitles = new Set((existing || []).map(t => (t.title || '').replace(/\.(pdf|docx?|txt|vtt|srt)$/i, '').trim().toLowerCase()));

        for (let i = 0; i < selectedFiles.length; i++) {
          const sf = selectedFiles[i];
          const normalizedTitle = sf.title.replace(/\.(pdf|docx?|txt|vtt|srt)$/i, '').trim().toLowerCase();
          if (existingTitles.has(normalizedTitle)) {
            setSelectedFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error' as const } : f));
            skippedCount++;
            toast.info(`Skipped "${sf.title}" — already exists`);
            continue;
          }
          existingTitles.add(normalizedTitle);
          if (i > 0) await new Promise(r => setTimeout(r, 2000));
          await yieldToUI();
          try {
            setSelectedFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'processing' as const } : f));
            setProcessingProgress({ current: i + 1, total: totalFiles });
            let transcriptText = '';
            try { transcriptText = await processFileText(sf.file); } catch (parseErr: unknown) { /* text extraction failed — will use fallback text */ void parseErr; }
            const filePath = `${dealId}/${uuidv4()}-${sf.file.name}`;
            let fileUrl = null;
            const { error: uploadError } = await supabase.storage.from('deal-transcripts').upload(filePath, sf.file);
            if (!uploadError) { const { data: urlData } = supabase.storage.from('deal-transcripts').getPublicUrl(filePath); fileUrl = urlData.publicUrl; }
            const safeTranscriptText = (transcriptText || '').trim().length > 0 ? transcriptText : `[File uploaded: ${sf.file.name} — text extraction pending/failed]`;
            const { error } = await supabase.from('deal_transcripts').insert({
              listing_id: dealId, transcript_text: safeTranscriptText, source: 'file_upload',
              title: sf.title.trim() || sf.file.name, transcript_url: fileUrl,
              call_date: callDate ? new Date(callDate).toISOString() : null,
            });
            if (error) throw error;
            setSelectedFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'done' as const } : f));
            successCount++;
          } catch (err: unknown) {
            // Error processing file — status set to 'error' below
            setSelectedFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error' as const } : f));
          }
          if (i < selectedFiles.length - 1) await new Promise(resolve => setTimeout(resolve, 200));
        }
        setProcessingProgress({ current: 0, total: 0 });
        if (successCount === 0 && skippedCount === 0) throw new Error('No files were uploaded successfully');
        if (successCount === 0 && skippedCount > 0) throw new Error(`All ${skippedCount} file(s) already exist — no new transcripts added`);
        return { count: successCount, failed: totalFiles - successCount - skippedCount, skipped: skippedCount };
      }

      if (!transcriptUrl.trim() && !isMultiFileMode) throw new Error('Please provide a transcript URL or upload a file');
      const safeSingleText = (newTranscript || '').trim().length > 0 ? newTranscript : `[Transcript link: ${transcriptUrl}]`;
      const isFirefliesUrl = transcriptUrl && /app\.fireflies\.ai\/view\//i.test(transcriptUrl);
      const { error } = await supabase.from('deal_transcripts').insert({
        listing_id: dealId, transcript_text: safeSingleText,
        source: isFirefliesUrl ? 'fireflies' : (transcriptUrl || 'manual'),
        title: transcriptTitle || null, transcript_url: transcriptUrl || null,
        call_date: callDate ? new Date(callDate).toISOString() : null,
      });
      if (error) throw error;
      return { count: 1 };
    },
    onSuccess: (data: AddMutationResult) => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal-transcripts', dealId] });
      const parts: string[] = [];
      if (data?.count > 0) parts.push(`${data.count} transcript${data.count > 1 ? 's' : ''} added`);
      if ((data?.skipped ?? 0) > 0) parts.push(`${data.skipped} skipped (duplicates)`);
      if ((data?.failed ?? 0) > 0) parts.push(`${data.failed} failed`);
      toast.success(parts.join(', ') || 'Transcript added');
      resetForm();
      setIsAddDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setProcessingProgress({ current: 0, total: 0 });
    }
  });

  // Delete transcript mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('deal_transcripts').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal-transcripts', dealId] }); toast.success("Transcript deleted"); }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => { const { error } = await supabase.from('deal_transcripts').delete().in('id', ids); if (error) throw error; },
    onSuccess: (_, ids) => {
      setSelectedTranscriptIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal-transcripts', dealId] });
      toast.success(`${ids.length} transcript${ids.length > 1 ? 's' : ''} deleted`);
    }
  });

  // Extract intelligence from transcript
  const handleExtract = async (transcript: DealTranscript) => {
    setProcessingId(transcript.id);
    try {
      const { data, error } = await invokeWithTimeout<ExtractTranscriptResponse>('extract-deal-transcript', {
        body: { transcriptId: transcript.id, transcriptText: transcript.transcript_text, dealInfo, applyToDeal: true },
        timeoutMs: 120_000,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal-transcripts', dealId] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal', dealId] });
      if (data?.dealUpdated && (data?.fieldsUpdated?.length ?? 0) > 0) {
        toast.success(`Extracted ${data?.fieldsExtracted || 0} fields and updated deal with: ${data!.fieldsUpdated!.slice(0, 3).join(', ')}${data!.fieldsUpdated!.length > 3 ? ` +${data!.fieldsUpdated!.length - 3} more` : ''}`);
      } else {
        toast.success(`Extracted ${data?.fieldsExtracted || 0} fields from transcript`);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to extract intelligence");
    } finally {
      setProcessingId(null);
    }
  };

  // Apply extracted data to deal
  const handleApply = async (transcript: DealTranscript) => {
    if (!transcript.extracted_data) { toast.error("No extracted data to apply"); return; }
    setApplyingId(transcript.id);
    try {
      const { data: currentDeal, error: currentDealError } = await supabase.from('listings').select('*').eq('id', dealId).single();
      if (currentDealError) throw currentDealError;
      const currentData = currentDeal as Record<string, unknown> | null;
      const extracted = transcript.extracted_data as Record<string, unknown>;
      const updateData: Record<string, unknown> = {};
      const appliedFields: string[] = [];
      const skippedFields: string[] = [];

      if (extracted.revenue) { updateData.revenue = extracted.revenue; appliedFields.push('Revenue'); }
      if (extracted.ebitda) { updateData.ebitda = extracted.ebitda; appliedFields.push('EBITDA'); }
      if (extracted.location) { updateData.location = extracted.location; appliedFields.push('Location'); }
      if (extracted.industry) { updateData.industry = extracted.industry; appliedFields.push('Industry'); }
      if (extracted.website) { updateData.website = extracted.website; appliedFields.push('Website'); }
      if (extracted.service_mix) { updateData.service_mix = extracted.service_mix; appliedFields.push('Service Mix'); }

      const mergedServices = mergeArrays(currentData?.services as string[] | undefined, extracted.services as string[] | undefined);
      if (mergedServices) { updateData.services = mergedServices; appliedFields.push('Services'); }

      let extractedStates = extracted.geographic_states as string[] | undefined;
      if (extractedStates) {
        extractedStates = extractedStates.map(s => {
          const lower = s.toLowerCase().trim();
          if (stateNameToCode[lower]) return stateNameToCode[lower];
          if (s.length === 2) return s.toUpperCase();
          return s;
        }).filter(s => s.length === 2);
      }
      const mergedStates = mergeArrays(currentData?.geographic_states as string[] | undefined, extractedStates);
      if (mergedStates) { updateData.geographic_states = mergedStates; appliedFields.push('Geographic States'); }
      if (extracted.number_of_locations) { updateData.number_of_locations = extracted.number_of_locations; appliedFields.push('# of Locations'); }
      if (extracted.owner_goals) { updateData.owner_goals = extracted.owner_goals; appliedFields.push('Owner Goals'); }
      if (extracted.customer_types) { updateData.customer_types = extracted.customer_types; appliedFields.push('Customer Types'); }
      if (extracted.executive_summary) { updateData.executive_summary = extracted.executive_summary; appliedFields.push('Executive Summary'); }
      if (extracted.growth_trajectory) { updateData.growth_trajectory = extracted.growth_trajectory; appliedFields.push('Growth Trajectory'); }
      if (extracted.main_contact_name) { updateData.main_contact_name = extracted.main_contact_name; appliedFields.push('Contact Name'); }
      if (extracted.main_contact_email) { updateData.main_contact_email = extracted.main_contact_email; appliedFields.push('Contact Email'); }
      if (extracted.main_contact_phone) { updateData.main_contact_phone = extracted.main_contact_phone; appliedFields.push('Contact Phone'); }

      const safeQuotesForMerge = Array.isArray(extracted.key_quotes) ? extracted.key_quotes : (typeof extracted.key_quotes === 'string' && extracted.key_quotes ? [extracted.key_quotes] : undefined);
      const mergedQuotes = mergeArrays(currentData?.key_quotes as string[] | undefined, safeQuotesForMerge);
      if (mergedQuotes) { updateData.key_quotes = mergedQuotes; appliedFields.push('Key Quotes'); }

      const extraNotes: string[] = [];
      if (extracted.ebitda_margin) { extraNotes.push(`EBITDA Margin: ${((extracted.ebitda_margin as number) * 100).toFixed(1)}%`); skippedFields.push('EBITDA Margin'); }
      if (extracted.asking_price) { extraNotes.push(`Asking Price: $${(extracted.asking_price as number).toLocaleString()}`); skippedFields.push('Asking Price'); }
      if (extracted.transition_preferences) { extraNotes.push(`Transition: ${extracted.transition_preferences}`); skippedFields.push('Transition'); }
      if (extracted.timeline_notes) { extraNotes.push(`Timeline: ${extracted.timeline_notes}`); skippedFields.push('Timeline'); }
      if (extracted.end_market_description) { extraNotes.push(`End Market: ${extracted.end_market_description}`); skippedFields.push('End Market'); }

      if (extraNotes.length > 0) {
        const existingNotes = (currentData?.general_notes as string) || '';
        const newNotesBlock = `\n\n--- Extracted from Transcript (${new Date().toLocaleDateString()}) ---\n${extraNotes.join('\n')}`;
        updateData.general_notes = existingNotes + newNotesBlock;
      }

      if (Object.keys(updateData).length > 0) {
        const { error } = await supabase.from('listings').update(updateData).eq('id', dealId);
        if (error) throw error;
      }

      await supabase.from('deal_transcripts').update({ applied_to_deal: true, applied_at: new Date().toISOString() }).eq('id', transcript.id);
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal-transcripts', dealId] });

      toast.success(
        <div className="space-y-1">
          <p className="font-medium">Applied {appliedFields.length} fields to deal</p>
          <p className="text-xs text-muted-foreground">{appliedFields.slice(0, 4).join(', ')}{appliedFields.length > 4 && ` +${appliedFields.length - 4} more`}</p>
        </div>
      );
      if (skippedFields.length > 0) toast.info(`${skippedFields.length} fields added to notes: ${skippedFields.join(', ')}`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to apply data");
    } finally {
      setApplyingId(null);
    }
  };

  // Enrich deal with AI
  const handleEnrichDeal = async (_forceReExtract = false) => {
    setIsEnriching(true);
    setEnrichmentResult(null);
    try {
      const { queueDealEnrichment } = await import("@/lib/remarketing/queueEnrichment");
      await queueDealEnrichment([dealId]);
      setEnrichmentPollingEnabled(true);
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal-transcripts', dealId] });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isNetworkError = errorMessage.includes('Failed to send') || errorMessage.includes('Failed to fetch') || errorMessage.includes('timeout') || errorMessage.includes('aborted') || errorMessage.includes('network') || errorMessage.includes('FetchError');
      if (isNetworkError) {
        // Queue insert may have succeeded even if the worker trigger failed
        queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal', dealId] });
        queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal-transcripts', dealId] });
        toast.info('Deal queued for enrichment. Processing will start shortly.');
        setEnrichmentPollingEnabled(true);
      } else {
        setEnrichmentResult({ success: false, error: errorMessage || 'Failed to enrich deal. Please try again.' });
        setShowEnrichmentDialog(true);
      }
    } finally {
      setIsEnriching(false);
      setEnrichmentPhase(null);
      setEnrichmentProgress({ current: 0, total: 0 });
    }
  };

  // Fireflies search in add dialog
  const handleFirefliesSearch = async () => {
    if (!firefliesEmail.trim()) return;
    setFirefliesSearching(true);
    setFirefliesResults([]);
    setSelectedFirefliesIds(new Set());
    setFirefliesSearchInfo('');
    try {
      const input = firefliesEmail.trim();
      const domain = input.includes('@') ? input.split('@')[1].toLowerCase() : input.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
      const isCompanyDomain = domain && !GENERIC_EMAIL_DOMAINS.has(domain);
      const allResults: FirefliesSearchResult[] = [];

      if (isCompanyDomain) {
        setFirefliesSearchInfo(`Finding all contacts at @${domain}...`);
        const { data: domainContacts, error: domainContactsError } = await supabase.from('contacts').select('email, first_name, last_name').eq('contact_type', 'buyer').eq('archived', false).ilike('email', `%@${domain}`);
        if (domainContactsError) throw domainContactsError;
        const emailSet = new Set<string>();
        if (input.includes('@')) emailSet.add(input.toLowerCase());
        if (domainContacts) domainContacts.forEach((c) => { if (c.email) emailSet.add(c.email.toLowerCase()); });
        const allEmails = Array.from(emailSet);
        if (allEmails.length > 0) {
          setFirefliesSearchInfo(`Searching Fireflies for ${allEmails.length} contact${allEmails.length !== 1 ? 's' : ''} at @${domain}...`);
          const { data: participantData, error: participantError } = await supabase.functions.invoke('search-fireflies-for-buyer', { body: { query: domain, participantEmails: allEmails, limit: 50 } });
          if (!participantError && participantData?.results) allResults.push(...participantData.results);
        }
        const companyKeyword = domain.replace(/\.com|\.net|\.org|\.io/g, '').replace(/[.-]/g, ' ');
        if (companyKeyword.length >= 3) {
          setFirefliesSearchInfo(prev => prev + ` Also searching for "${companyKeyword}"...`);
          const { data: keywordData, error: keywordError } = await supabase.functions.invoke('search-fireflies-for-buyer', { body: { query: companyKeyword, limit: 20 } });
          if (!keywordError && keywordData?.results) allResults.push(...keywordData.results);
        }
      } else {
        setFirefliesSearchInfo(`Searching for ${input}...`);
        const { data, error } = await supabase.functions.invoke('search-fireflies-for-buyer', { body: { query: input, participantEmails: input.includes('@') ? [input] : undefined, limit: 50 } });
        if (!error && data?.results) allResults.push(...data.results);
      }

      const seen = new Set<string>();
      const uniqueResults = allResults.filter((r) => { if (!r.id || seen.has(r.id)) return false; seen.add(r.id); return true; });
      const existingIds = new Set(transcripts.filter((t): t is DealTranscript & { fireflies_transcript_id: string } => !!(t as unknown as Record<string, unknown>).fireflies_transcript_id).map((t) => (t as unknown as Record<string, unknown>).fireflies_transcript_id as string));
      const newResults = uniqueResults.filter((r) => !existingIds.has(r.id));
      newResults.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      setFirefliesResults(newResults);

      if (newResults.length === 0 && uniqueResults.length > 0) toast.info('All found transcripts are already linked to this deal');
      else if (newResults.length === 0) toast.info(`No Fireflies transcripts found for ${isCompanyDomain ? `@${domain}` : input}`);
      else setFirefliesSearchInfo(`Found ${newResults.length} transcript${newResults.length !== 1 ? 's' : ''}${isCompanyDomain ? ` with @${domain} contacts` : ''}`);
    } catch (err) {
      toast.error('Failed to search Fireflies');
      setFirefliesSearchInfo('');
    } finally {
      setFirefliesSearching(false);
    }
  };

  // Fireflies import
  const handleFirefliesImport = async () => {
    if (selectedFirefliesIds.size === 0) return;
    setFirefliesImporting(true);
    const toastId = toast.loading(`Importing ${selectedFirefliesIds.size} transcripts...`);
    try {
      let imported = 0;
      let failed = 0;
      for (const ffId of selectedFirefliesIds) {
        const result = firefliesResults.find((r) => r.id === ffId);
        if (!result) continue;
        try {
          const { error: insertError } = await supabase.from('deal_transcripts').insert({
            listing_id: dealId, fireflies_transcript_id: result.id, fireflies_meeting_id: result.id,
            transcript_url: result.meeting_url || null, title: result.title || `Call - ${new Date(result.date || Date.now()).toLocaleDateString()}`,
            call_date: result.date || null, participants: result.participants || [],
            meeting_attendees: Array.isArray(result.participants) ? result.participants.map((p) => typeof p === 'string' ? p : p.email).filter(Boolean) : [],
            duration_minutes: result.duration_minutes || null, source: 'fireflies', auto_linked: false, transcript_text: '',
            has_content: result.has_content !== false,
            match_type: result.match_type || 'email',
            external_participants: result.external_participants || [],
          });
          if (insertError) { failed++; } else { imported++; }
        } catch (err) { void err; failed++; }
      }
      if (imported > 0) { toast.success(`Imported ${imported} transcript${imported !== 1 ? 's' : ''}`, { id: toastId }); queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal-transcripts', dealId] }); }
      if (failed > 0) toast.warning(`${failed} transcript${failed !== 1 ? 's' : ''} failed to import`);
      setIsAddDialogOpen(false);
      resetForm();
      setFirefliesResults([]);
      setSelectedFirefliesIds(new Set());
    } catch (err) {
      toast.error('Failed to import transcripts', { id: toastId });
    } finally {
      setFirefliesImporting(false);
    }
  };

  return {
    // Refs
    fileInputRef,
    // Add dialog state
    isAddDialogOpen, setIsAddDialogOpen,
    newTranscript, setNewTranscript,
    transcriptTitle, setTranscriptTitle,
    transcriptUrl, setTranscriptUrl,
    callDate, setCallDate,
    // Transcript list state
    expandedId, setExpandedId,
    processingId, applyingId,
    isListExpanded, setIsListExpanded,
    selectedTranscriptIds,
    // Enrichment state
    isEnriching, enrichmentResult, showEnrichmentDialog, setShowEnrichmentDialog,
    enrichmentPhase, enrichmentProgress, enrichmentPollingEnabled, setEnrichmentPollingEnabled,
    // Multi-file state
    selectedFiles, setSelectedFiles, isMultiFileMode, processingProgress,
    // Fireflies add dialog state
    addMode, setAddMode, firefliesEmail, setFirefliesEmail,
    firefliesSearching, firefliesResults, selectedFirefliesIds, setSelectedFirefliesIds,
    firefliesImporting, firefliesSearchInfo,
    // Actions
    resetForm, toggleTranscriptSelection, toggleAllTranscripts,
    handleFileUpload, handleExtract, handleApply, handleEnrichDeal,
    handleFirefliesSearch, handleFirefliesImport,
    // Mutations
    addMutation, deleteMutation, bulkDeleteMutation,
  };
}
