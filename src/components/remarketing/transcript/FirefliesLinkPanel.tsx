import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  Link as LinkIcon,
  Upload,
  RefreshCw,
  Search,
  ExternalLink,
  Clock,
  Link2,
  AlertCircle,
  AlertTriangle,
  Users,
  CheckCircle2,
  FileText,
  Info,
} from 'lucide-react';

interface FirefliesSearchResultItem {
  id: string;
  title?: string;
  date?: string;
  meeting_url?: string;
  duration_minutes?: number;
  has_content?: boolean;
  match_type?: string;
  summary?: string | { short_summary?: string };
  external_participants?: { name: string; email?: string }[];
  participants?: unknown[];
}

interface FirefliesLinkPanelProps {
  contactEmail?: string | null;
  contactEmails?: string[];
  contactName?: string | null;
  lastSynced: Date | null;
  syncLoading: boolean;
  onSync: () => void;
  // Paste link
  firefliesUrl: string;
  onFirefliesUrlChange: (val: string) => void;
  linkingUrl: boolean;
  onLinkByUrl: () => void;
  // Upload
  ffFileInputRef: React.RefObject<HTMLInputElement>;
  ffUploading: boolean;
  onFfFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  // Search
  ffQuery: string;
  onFfQueryChange: (val: string) => void;
  ffSearchLoading: boolean;
  onFfQuickSearch: () => void;
  ffResults: unknown[];
  ffHasSearched: boolean;
  ffLinking: string | null;
  onLinkSearchResult: (transcript: {
    id: string;
    title?: string;
    date?: string;
    meeting_url?: string;
    duration_minutes?: number;
    has_content?: boolean;
    match_type?: string;
    summary?: string | { short_summary?: string };
    external_participants?: { name: string; email?: string }[];
    participants?: unknown[];
  }) => void;
  onClearResults: () => void;
}

export function FirefliesLinkPanel({
  contactEmail,
  contactEmails,
  contactName,
  lastSynced,
  syncLoading,
  onSync,
  firefliesUrl,
  onFirefliesUrlChange,
  linkingUrl,
  onLinkByUrl,
  ffFileInputRef,
  ffUploading,
  onFfFileUpload,
  ffQuery,
  onFfQueryChange,
  ffSearchLoading,
  onFfQuickSearch,
  ffResults,
  ffHasSearched,
  ffLinking,
  onLinkSearchResult,
  onClearResults,
}: FirefliesLinkPanelProps) {
  const hasEmails = (contactEmails && contactEmails.length > 0) || !!contactEmail;
  const emailCount = contactEmails?.length || (contactEmail ? 1 : 0);
  const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);

  // Wrap upload to track file names
  const handleUploadWithPreview = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) {
      setUploadedFileNames(Array.from(files).map((f) => f.name));
    }
    onFfFileUpload(e);
  };

  // Check if URL looks like a valid Fireflies link
  const isValidFirefliesUrl =
    firefliesUrl.trim() && /fireflies\.ai\/view\/[^/?#]+/.test(firefliesUrl.trim());
  const hasUrlInput = firefliesUrl.trim().length > 0;
  const showUrlWarning = hasUrlInput && !isValidFirefliesUrl && firefliesUrl.trim().length > 10;

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
      {/* Auto-sync row */}
      {hasEmails ? (
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground space-y-0.5">
            {contactName && <p>Contact: {contactName}</p>}
            {emailCount === 1 && <p>{contactEmails?.[0] || contactEmail}</p>}
            {emailCount > 1 && <p>{emailCount} contact emails linked</p>}
            {lastSynced && (
              <p className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                Last synced: {lastSynced.toLocaleTimeString()}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onSync}
            disabled={syncLoading}
            className="shrink-0"
          >
            {syncLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            {syncLoading
              ? 'Searching Fireflies...'
              : `Auto-Sync${emailCount > 1 ? ` (${emailCount})` : ''}`}
          </Button>
        </div>
      ) : (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 rounded-md p-2.5">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Add a contact email to this deal to enable auto-sync from Fireflies
          </p>
        </div>
      )}

      {/* Manual link tabs */}
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

        {/* SEARCH TAB — Now the default / primary tab */}
        <TabsContent value="search" className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search by company name, person, or keywords..."
              value={ffQuery}
              onChange={(e) => onFfQueryChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !ffSearchLoading && onFfQuickSearch()}
              className="flex-1 h-8 text-sm"
            />
            <Button
              onClick={onFfQuickSearch}
              disabled={ffSearchLoading || !ffQuery.trim()}
              size="sm"
              className="h-8"
            >
              {ffSearchLoading ? (
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
          {ffResults.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  {ffResults.length} result{ffResults.length !== 1 ? 's' : ''} found
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-muted-foreground hover:text-foreground"
                  onClick={onClearResults}
                >
                  Clear results
                </Button>
              </div>
              <div className="space-y-2 max-h-72 overflow-auto">
                {(ffResults as FirefliesSearchResultItem[]).map((r) => (
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
                        onClick={() => onLinkSearchResult(r)}
                        disabled={ffLinking === r.id}
                      >
                        {ffLinking === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <LinkIcon className="h-3.5 w-3.5 mr-1" />
                            Link to Deal
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Metadata row */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(r.date!).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      {r.duration_minutes && <span>{r.duration_minutes} min</span>}
                      {r.external_participants && r.external_participants.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          With: {r.external_participants.map((p) => p.name).join(', ')}
                        </span>
                      )}
                    </div>

                    {/* Summary preview */}
                    {r.summary && (
                      <p className="text-xs text-muted-foreground line-clamp-2 italic">
                        {typeof r.summary === 'string' ? r.summary : r.summary?.short_summary}
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
          {!ffSearchLoading && ffResults.length === 0 && ffHasSearched && ffQuery.trim() && (
            <div className="text-center py-3 px-4 bg-muted/30 rounded-lg">
              <Search className="h-5 w-5 mx-auto text-muted-foreground mb-1.5" />
              <p className="text-xs text-muted-foreground">
                No calls found for &ldquo;{ffQuery.trim()}&rdquo;
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Try a different search term or use Paste Link to add a transcript directly
              </p>
            </div>
          )}

          {/* Empty state — no search has been performed yet */}
          {!ffSearchLoading && ffResults.length === 0 && !ffHasSearched && !ffQuery.trim() && (
            <div className="text-center py-3 px-4 bg-muted/30 rounded-lg">
              <Search className="h-5 w-5 mx-auto text-muted-foreground mb-1.5" />
              <p className="text-xs text-muted-foreground">
                Search Fireflies to find call recordings and link them to this deal
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
              onChange={(e) => onFirefliesUrlChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !linkingUrl && onLinkByUrl()}
              className={`flex-1 h-8 text-sm ${showUrlWarning ? 'border-amber-400 focus-visible:ring-amber-400' : ''}`}
            />
            <Button
              onClick={onLinkByUrl}
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
            ref={ffFileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.vtt,.srt,.md"
            multiple
            onChange={handleUploadWithPreview}
            className="hidden"
          />
          <Button
            variant="outline"
            className="w-full h-16 border-dashed"
            onClick={() => ffFileInputRef.current?.click()}
            disabled={ffUploading}
          >
            {ffUploading ? (
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
            Text will be extracted from uploaded files. AI can then extract deal intelligence.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
