import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { DealTranscript } from './types';

interface FirefliesSearchResult {
  id: string;
  title: string;
  date: string;
  meeting_url: string;
  participants: unknown[];
  duration_minutes: number | null;
  summary: string;
  has_content?: boolean;
  match_type?: string;
  external_participants?: unknown[];
}

interface UseFirefliesSyncProps {
  dealId: string;
  contactEmail?: string | null;
  contactEmails?: string[];
  companyName?: string;
  transcripts: DealTranscript[];
  onSyncComplete?: () => void;
  onTranscriptLinked?: () => void;
}

export function useFirefliesSync({
  dealId,
  contactEmail,
  contactEmails,
  companyName,
  transcripts,
  onSyncComplete,
  onTranscriptLinked,
}: UseFirefliesSyncProps) {
  const [syncLoading, setSyncLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [, setLinkedCount] = useState(
    transcripts?.filter((t) => t.source === 'fireflies').length || 0,
  );

  // Manual link state
  const [ffQuery, setFfQuery] = useState(companyName || '');
  const [ffSearchLoading, setFfSearchLoading] = useState(false);
  const [ffResults, setFfResults] = useState<FirefliesSearchResult[]>([]);
  const [ffHasSearched, setFfHasSearched] = useState(false);
  const [ffLinking, setFfLinking] = useState<string | null>(null);
  const [firefliesUrl, setFirefliesUrl] = useState('');
  const [linkingUrl, setLinkingUrl] = useState(false);
  const [ffUploading, setFfUploading] = useState(false);
  const ffFileInputRef = useRef<HTMLInputElement>(null);

  // Clear results when query is emptied
  const handleFfQueryChange = useCallback((val: string) => {
    setFfQuery(val);
    if (!val.trim()) {
      setFfResults([]);
      setFfHasSearched(false);
    }
  }, []);

  // Clear search results and reset state
  const clearFfResults = useCallback(() => {
    setFfResults([]);
    setFfHasSearched(false);
    setFfQuery('');
  }, []);

  // Build the full list of emails to search (deduped)
  const allContactEmails = Array.from(
    new Set(
      [...(contactEmails || []), ...(contactEmail ? [contactEmail] : [])]
        .filter(Boolean)
        .map((e) => e.toLowerCase()),
    ),
  );

  // Fireflies sync handler — sends all contact emails
  const handleFirefliesSync = async () => {
    if (allContactEmails.length === 0) return;
    setSyncLoading(true);
    const emailDisplay =
      allContactEmails.length === 1 ? allContactEmails[0] : `${allContactEmails.length} contacts`;
    const toastId = toast.loading(`Searching Fireflies for ${emailDisplay}...`);
    try {
      const { data, error } = await supabase.functions.invoke('sync-fireflies-transcripts', {
        body: { listingId: dealId, contactEmails: allContactEmails, companyName, limit: 50 },
      });
      if (error) throw error;
      if (data.linked > 0) {
        toast.success(`Linked ${data.linked} new transcript${data.linked !== 1 ? 's' : ''}`, {
          id: toastId,
        });
        setLinkedCount((prev) => prev + data.linked);
        onSyncComplete?.();
      } else if (data.skipped > 0) {
        toast.info(
          `All ${data.skipped} transcript${data.skipped !== 1 ? 's' : ''} already linked`,
          { id: toastId },
        );
      } else {
        toast.info(`No Fireflies calls found for ${contactEmail}`, { id: toastId });
      }
      setLastSynced(new Date());
      if (data.errors?.length > 0) {
        toast.warning(
          `${data.errors.length} transcript${data.errors.length !== 1 ? 's' : ''} failed to link`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? `Failed: ${error.message}` : 'Failed to sync', {
        id: toastId,
      });
    } finally {
      setSyncLoading(false);
    }
  };

  // Quick search handler — includes contact emails for better results
  const handleFfQuickSearch = async () => {
    const trimmed = ffQuery.trim();
    if (!trimmed) return;
    setFfSearchLoading(true);
    setFfHasSearched(true);
    const toastId = toast.loading(`Searching Fireflies for "${trimmed}"...`);
    try {
      const { data, error } = await supabase.functions.invoke('search-fireflies-for-buyer', {
        body: { query: trimmed, emails: allContactEmails, companyName, limit: 30 },
      });
      if (error) throw error;
      setFfResults(data.results || []);
      toast[data.results?.length ? 'success' : 'info'](
        data.results?.length
          ? `Found ${data.results.length} call${data.results.length !== 1 ? 's' : ''}`
          : `No calls found`,
        { id: toastId },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Search failed', { id: toastId });
    } finally {
      setFfSearchLoading(false);
    }
  };

  // Link a search result — includes has_content, match_type, external_participants
  const handleLinkSearchResult = async (transcript: FirefliesSearchResult) => {
    setFfLinking(transcript.id);
    try {
      // Store summary in extracted_data (like auto-sync does) instead of transcript_text.
      // Empty transcript_text ensures fetch-fireflies-content fetches the FULL transcript
      // before AI extraction runs, rather than extracting from just a brief summary.
      const extractedData: Record<string, unknown> = {};
      if (transcript.summary) {
        extractedData.fireflies_summary = transcript.summary;
      }
      const { error } = await supabase.from('deal_transcripts').insert({
        listing_id: dealId,
        fireflies_transcript_id: transcript.id,
        fireflies_meeting_id: transcript.id,
        transcript_url: transcript.meeting_url,
        title: transcript.title,
        call_date: transcript.date,
        participants: transcript.participants as Record<string, unknown>[],
        duration_minutes: transcript.duration_minutes,
        transcript_text: '', // Empty — full content will be fetched from Fireflies API
        source: 'fireflies',
        auto_linked: false,
        has_content: transcript.has_content !== false,
        match_type: transcript.match_type || 'email',
        external_participants: (transcript.external_participants || []) as Record<
          string,
          unknown
        >[],
        extracted_data: extractedData,
      } as never);
      if (error) {
        if (error.code === '23505') toast.info('Already linked');
        else throw error;
      } else {
        toast.success('Transcript linked');
        setFfResults((prev) => prev.filter((r) => r.id !== transcript.id));
        onTranscriptLinked?.();
      }
    } catch (error) {
      toast.error('Failed to link transcript');
    } finally {
      setFfLinking(null);
    }
  };

  // Validate Fireflies URL
  const validateFirefliesUrl = (url: string): { valid: boolean; error?: string } => {
    if (!url.trim()) return { valid: false, error: 'Please enter a URL' };
    try {
      const parsed = new URL(url.trim());
      if (!parsed.hostname.includes('fireflies.ai')) {
        return {
          valid: false,
          error: 'Please enter a valid Fireflies URL (app.fireflies.ai/view/...)',
        };
      }
      const match = url.match(/fireflies\.ai\/view\/([^/?#]+)/);
      if (!match || !match[1]) {
        return {
          valid: false,
          error: 'URL should contain a transcript ID (app.fireflies.ai/view/your-transcript-id)',
        };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Please enter a valid URL' };
    }
  };

  // Link by URL
  const handleLinkByUrl = async () => {
    const url = firefliesUrl.trim();
    if (!url) return;

    const validation = validateFirefliesUrl(url);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setLinkingUrl(true);
    try {
      const match = url.match(/fireflies\.ai\/view\/([^/?#]+)/);
      const slug = match![1];
      // Fireflies URL slugs look like "Meeting-Title::ActualApiId"
      // Extract the actual API ID from after "::" so fetch-fireflies-content can use it directly.
      // If slug doesn't contain "::", store null and let the backend resolve via URL search.
      const idMatch = slug.match(/::([a-zA-Z0-9]+)$/);
      const firefliesApiId = idMatch ? idMatch[1] : null;
      const displayTitle = slug.split('::')[0]?.replace(/-/g, ' ') || slug;
      const { error } = await supabase.from('deal_transcripts').insert({
        listing_id: dealId,
        fireflies_transcript_id: firefliesApiId,
        transcript_url: url,
        title: displayTitle,
        transcript_text: '', // Empty — content will be fetched from Fireflies API
        source: 'fireflies',
        auto_linked: false,
      } as never);
      if (error) {
        if (error.code === '23505') toast.info('This transcript is already linked to this deal');
        else throw error;
      } else {
        toast.success('Transcript linked — content will be fetched when you open it');
        setFirefliesUrl('');
        onTranscriptLinked?.();
      }
    } catch (error) {
      toast.error('Failed to link transcript');
    } finally {
      setLinkingUrl(false);
    }
  };

  // File upload handler
  const handleFfFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setFfUploading(true);
    let successCount = 0;
    for (const file of Array.from(files)) {
      const toastId = toast.loading(`Uploading ${file.name}...`);
      try {
        const textTypes = ['.txt', '.vtt', '.srt', '.md'];
        const isTextFile = textTypes.some((ext) => file.name.toLowerCase().endsWith(ext));
        let transcriptText = '';
        if (isTextFile) {
          transcriptText = await file.text();
        } else {
          transcriptText = `Uploaded file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        }
        const docTypes = ['.pdf', '.doc', '.docx'];
        if (docTypes.some((ext) => file.name.toLowerCase().endsWith(ext))) {
          try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('listingId', dealId);
            const { data, error } = await supabase.functions.invoke('parse-transcript-file', {
              body: formData,
            });
            if (!error && data?.text) transcriptText = data.text;
          } catch {
            /* file parse failed, use fallback text */
          }
        }
        const { error } = await supabase.from('deal_transcripts').insert({
          listing_id: dealId,
          fireflies_transcript_id: `upload-${Date.now()}-${file.name}`,
          title: file.name.replace(/\.[^/.]+$/, ''),
          transcript_text: transcriptText || `Uploaded: ${file.name}`,
          source: 'upload',
          auto_linked: false,
        } as never);
        if (error) {
          if (error.code === '23505') toast.info(`${file.name} already linked`, { id: toastId });
          else throw error;
        } else {
          toast.success(`${file.name} uploaded`, { id: toastId });
          successCount++;
        }
      } catch {
        toast.error(`Failed to upload ${file.name}`, { id: toastId });
      }
    }
    if (successCount > 0) onTranscriptLinked?.();
    setFfUploading(false);
    if (ffFileInputRef.current) ffFileInputRef.current.value = '';
  };

  return {
    allContactEmails,
    syncLoading,
    lastSynced,
    ffQuery,
    setFfQuery: handleFfQueryChange,
    ffSearchLoading,
    ffResults,
    ffHasSearched,
    ffLinking,
    firefliesUrl,
    setFirefliesUrl,
    linkingUrl,
    ffUploading,
    ffFileInputRef,
    validateFirefliesUrl,
    handleFirefliesSync,
    handleFfQuickSearch,
    handleLinkSearchResult,
    handleLinkByUrl,
    handleFfFileUpload,
    clearFfResults,
  };
}
