import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  Link as LinkIcon,
  Upload,
  Search,
  ExternalLink,
  Clock,
  Link2,
  AlertTriangle,
  Users,
  FileText,
  Info,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BuyerTranscriptLinkPanelProps {
  buyerId: string;
  companyName?: string;
  onTranscriptLinked?: () => void;
  onAddTranscript: (
    text: string,
    source: string,
    fileName?: string,
    fileUrl?: string,
    triggerExtract?: boolean,
  ) => Promise<unknown> | void;
}

interface SearchResult {
  id: string;
  title: string;
  date: string;
  duration_minutes: number | null;
  participants: unknown[];
  summary: string;
  meeting_url: string;
  keywords: string[];
  external_participants?: unknown[];
  has_content?: boolean;
  match_type?: string;
}

export function BuyerTranscriptLinkPanel({
  buyerId,
  companyName,
  onTranscriptLinked,
  onAddTranscript,
}: BuyerTranscriptLinkPanelProps) {
  // Paste link state
  const [firefliesUrl, setFirefliesUrl] = useState('');
  const [linkingUrl, setLinkingUrl] = useState(false);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);

  // Search state
  const [query, setQuery] = useState(companyName || '');
  const [searchLoading, setSearchLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (!val.trim()) {
      setResults([]);
      setHasSearched(false);
    }
  };

  const clearResults = () => {
    setResults([]);
    setHasSearched(false);
    setQuery('');
  };

  // URL validation
  const isValidFirefliesUrl =
    firefliesUrl.trim() && /fireflies\.ai\/view\/[^/?#]+/.test(firefliesUrl.trim());
  const hasUrlInput = firefliesUrl.trim().length > 0;
  const showUrlWarning = hasUrlInput && !isValidFirefliesUrl && firefliesUrl.trim().length > 10;

  const handleLinkByUrl = async () => {
    const url = firefliesUrl.trim();
    if (!url) return;

    // Validate URL
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes('fireflies.ai')) {
        toast.error('Please enter a valid Fireflies URL (app.fireflies.ai/view/...)');
        return;
      }
    } catch {
      toast.error('Please enter a valid URL');
      return;
    }

    const match = url.match(/fireflies\.ai\/view\/([^/?#]+)/);
    if (!match || !match[1]) {
      toast.error('URL should contain a transcript ID (app.fireflies.ai/view/your-transcript-id)');
      return;
    }

    setLinkingUrl(true);
    try {
      const transcriptId = match[1];

      const { error } = await supabase.from('buyer_transcripts').insert({
        buyer_id: buyerId,
        fireflies_transcript_id: transcriptId,
        transcript_url: url,
        title: `Fireflies: ${transcriptId}`,
        transcript_text: 'Linked via URL - content will be fetched automatically',
        source: 'fireflies',
      } as never);

      if (error) {
        if (error.code === '23505') toast.info('This transcript is already linked');
        else throw error;
      } else {
        toast.success('Transcript linked — content will be fetched when you open it');
        setFirefliesUrl('');
        onTranscriptLinked?.();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to link');
    } finally {
      setLinkingUrl(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadedFileNames(Array.from(files).map((f) => f.name));
    let successCount = 0;

    for (const file of Array.from(files)) {
      try {
        const textTypes = ['.txt', '.vtt', '.srt', '.md'];
        const isTextFile = textTypes.some((ext) => file.name.toLowerCase().endsWith(ext));
        const docTypes = ['.pdf', '.doc', '.docx'];
        const isDocFile = docTypes.some((ext) => file.name.toLowerCase().endsWith(ext));

        let transcriptText = '';
        let fileUrl: string | undefined;

        // Upload to storage
        const timestamp = Date.now();
        const filename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const path = `${buyerId}/${timestamp}_${filename}`;
        const { error: uploadError } = await supabase.storage
          .from('buyer-transcripts')
          .upload(path, file);
        if (!uploadError) {
          const {
            data: { publicUrl },
          } = supabase.storage.from('buyer-transcripts').getPublicUrl(path);
          fileUrl = publicUrl;
        }

        if (isTextFile) {
          transcriptText = await file.text();
        } else if (isDocFile) {
          try {
            const formData = new FormData();
            formData.append('file', file);
            const { data, error } = await supabase.functions.invoke('parse-transcript-file', {
              body: formData,
            });
            if (!error && data?.text) transcriptText = data.text;
          } catch {
            /* fallback */
          }
        }

        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        await onAddTranscript(
          transcriptText || `Uploaded: ${file.name}`,
          'call',
          nameWithoutExt,
          fileUrl,
          false,
        );
        successCount++;

        if (successCount > 0 && Array.from(files).indexOf(file) < files.length - 1) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (error) {
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} transcript${successCount > 1 ? 's' : ''} uploaded`);
      onTranscriptLinked?.();
    }
    setUploading(false);
    setUploadedFileNames([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSearch = async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    setSearchLoading(true);
    setHasSearched(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-fireflies-for-buyer', {
        body: { query: trimmedQuery, limit: 30 },
      });
      if (error) throw error;
      setResults(data.results || []);
      if (data.results.length === 0) toast.info(`No calls found for "${trimmedQuery}"`);
    } catch (error) {
      toast.error('Failed to search Fireflies');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleLinkResult = async (transcript: SearchResult) => {
    setLinking(transcript.id);
    try {
      const { error } = await supabase.from('buyer_transcripts').insert({
        buyer_id: buyerId,
        fireflies_transcript_id: transcript.id,
        transcript_url: transcript.meeting_url,
        title: transcript.title,
        call_date: transcript.date,
        participants: transcript.participants as Record<string, unknown>[],
        duration_minutes: transcript.duration_minutes,
        transcript_text: transcript.summary || 'Fireflies transcript',
        source: 'fireflies',
      } as never);

      if (error) {
        if (error.code === '23505') toast.info('Already linked');
        else throw error;
      } else {
        toast.success('Transcript linked');
        setResults(results.filter((r) => r.id !== transcript.id));
        onTranscriptLinked?.();
      }
    } catch (error) {
      toast.error('Failed to link transcript');
    } finally {
      setLinking(null);
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
      <Tabs defaultValue="search" className="space-y-3">
        <TabsList className="grid w-full grid-cols-3 h-8">
          <TabsTrigger value="search" className="text-xs">
            <Search className="h-3.5 w-3.5 mr-1" />
            Search Fireflies
          </TabsTrigger>
          <TabsTrigger value="link" className="text-xs">
            <Link2 className="h-3.5 w-3.5 mr-1" />
            Paste Link
          </TabsTrigger>
          <TabsTrigger value="upload" className="text-xs">
            <Upload className="h-3.5 w-3.5 mr-1" />
            Upload
          </TabsTrigger>
        </TabsList>

        {/* SEARCH TAB — Default */}
        <TabsContent value="search" className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search by company name, person, or keywords..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !searchLoading && handleSearch()}
              className="flex-1 h-8 text-sm"
            />
            <Button
              onClick={handleSearch}
              disabled={searchLoading || !query.trim()}
              size="sm"
              className="h-8"
            >
              {searchLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Search className="h-4 w-4 mr-1" />
                  Search
                </>
              )}
            </Button>
          </div>

          {/* Search results */}
          {results.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  {results.length} result{results.length !== 1 ? 's' : ''} found
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-muted-foreground hover:text-foreground"
                  onClick={clearResults}
                >
                  Clear results
                </Button>
              </div>
              <div className="space-y-2 max-h-72 overflow-auto">
                {results.map((r) => (
                  <div
                    key={r.id}
                    className={`border rounded-lg p-3 space-y-2 transition-colors ${r.has_content === false ? 'opacity-60 bg-muted/30' : 'hover:bg-muted/30'}`}
                  >
                    {/* Title row — clickable link to Fireflies */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {r.meeting_url ? (
                          <a
                            href={r.meeting_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-primary hover:underline flex items-center gap-1.5 truncate"
                          >
                            {r.title}
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        ) : (
                          <p className="text-sm font-medium truncate">{r.title}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="h-7 shrink-0"
                        onClick={() => handleLinkResult(r)}
                        disabled={linking === r.id}
                      >
                        {linking === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <LinkIcon className="h-3.5 w-3.5 mr-1" />
                            Link
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Metadata row */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(r.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      {r.duration_minutes && <span>{r.duration_minutes} min</span>}
                      {r.external_participants && r.external_participants.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          With:{' '}
                          {r.external_participants
                            .map((p: unknown) => (p as { name: string }).name)
                            .join(', ')}
                        </span>
                      )}
                    </div>

                    {/* Summary preview */}
                    {r.summary && (
                      <p className="text-xs text-muted-foreground line-clamp-2 italic">
                        {typeof r.summary === 'string'
                          ? r.summary
                          : (r.summary as unknown as { short_summary?: string })?.short_summary}
                      </p>
                    )}

                    {/* Status badges */}
                    <div className="flex items-center gap-1.5">
                      {r.has_content === false && (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 text-amber-600 border-amber-300 gap-0.5"
                        >
                          <AlertTriangle className="h-2.5 w-2.5" />
                          No transcript captured
                        </Badge>
                      )}
                      {r.match_type === 'keyword' && (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 text-blue-600 border-blue-300"
                        >
                          Matched by name
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No results found — after a search returned 0 results */}
          {!searchLoading && results.length === 0 && hasSearched && query.trim() && (
            <div className="text-center py-3 px-4 bg-muted/30 rounded-lg">
              <Search className="h-5 w-5 mx-auto text-muted-foreground mb-1.5" />
              <p className="text-xs text-muted-foreground">
                No calls found for &ldquo;{query.trim()}&rdquo;
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Try a different search term or use Paste Link to add a transcript directly
              </p>
            </div>
          )}

          {/* Empty state — no search has been performed yet */}
          {!searchLoading && results.length === 0 && !hasSearched && !query.trim() && (
            <div className="text-center py-3 px-4 bg-muted/30 rounded-lg">
              <Search className="h-5 w-5 mx-auto text-muted-foreground mb-1.5" />
              <p className="text-xs text-muted-foreground">
                Search Fireflies to find call recordings and link them to this buyer
              </p>
            </div>
          )}
        </TabsContent>

        {/* PASTE LINK TAB */}
        <TabsContent value="link" className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="https://app.fireflies.ai/view/your-transcript"
              value={firefliesUrl}
              onChange={(e) => setFirefliesUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !linkingUrl && handleLinkByUrl()}
              className={`flex-1 h-8 text-sm ${showUrlWarning ? 'border-amber-400 focus-visible:ring-amber-400' : ''}`}
            />
            <Button
              onClick={handleLinkByUrl}
              disabled={linkingUrl || !isValidFirefliesUrl}
              size="sm"
              className="h-8"
            >
              {linkingUrl ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <LinkIcon className="h-4 w-4 mr-1" />
                  Link
                </>
              )}
            </Button>
          </div>
          {showUrlWarning ? (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              URL should be from app.fireflies.ai/view/...
            </p>
          ) : (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              Paste a Fireflies transcript URL — the transcript content will be fetched
              automatically when you open it
            </p>
          )}
        </TabsContent>

        {/* UPLOAD TAB */}
        <TabsContent value="upload" className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.vtt,.srt,.md"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            className="w-full h-16 border-dashed"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <div className="text-left">
                  <span className="text-sm">Uploading...</span>
                  {uploadedFileNames.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {uploadedFileNames[0]}
                      {uploadedFileNames.length > 1 ? ` +${uploadedFileNames.length - 1} more` : ''}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs font-medium">Click to upload transcript files</span>
                <span className="text-xs text-muted-foreground">PDF, DOC, TXT, VTT, SRT</span>
              </div>
            )}
          </Button>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <FileText className="h-3 w-3" />
            Text will be extracted from uploaded files. AI can then extract buyer intelligence.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
