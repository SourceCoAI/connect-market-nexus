import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Phone, Mail, Video, StickyNote, Activity, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface DealSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  listingId?: string;
}

interface SearchResult {
  source: string;
  title: string;
  snippet: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

const SOURCE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  transcript: {
    label: 'Transcript',
    icon: <Video className="h-3.5 w-3.5" />,
    color: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  email: {
    label: 'Email',
    icon: <Mail className="h-3.5 w-3.5" />,
    color: 'bg-green-50 text-green-700 border-green-200',
  },
  call: {
    label: 'Call',
    icon: <Phone className="h-3.5 w-3.5" />,
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  activity: {
    label: 'Activity',
    icon: <Activity className="h-3.5 w-3.5" />,
    color: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  note: {
    label: 'Note',
    icon: <StickyNote className="h-3.5 w-3.5" />,
    color: 'bg-gray-50 text-gray-700 border-gray-200',
  },
  phoneburner_transcript: {
    label: 'PhoneBurner',
    icon: <Phone className="h-3.5 w-3.5" />,
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
};

const DEFAULT_SOURCE_CONFIG = {
  label: 'Other',
  icon: <Activity className="h-3.5 w-3.5" />,
  color: 'bg-muted text-muted-foreground border-border',
};

/**
 * Highlight matching portions of snippet text.
 */
function HighlightedSnippet({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <span>{text}</span>;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

export function DealSearchDialog({ open, onOpenChange, dealId, listingId }: DealSearchDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (searchQuery.trim().length < 2) {
        setResults([]);
        setTotal(0);
        setHasSearched(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke('search-deal-history', {
          body: {
            query: searchQuery.trim(),
            listing_id: listingId || dealId,
            limit: 20,
          },
        });

        if (fnError) throw fnError;
        setResults(data?.results || []);
        setTotal(data?.total || 0);
        setHasSearched(true);
      } catch (err) {
        console.error('Deal search error:', err);
        setError('Search failed. Please try again.');
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [dealId, listingId],
  );

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        performSearch(value);
      }, 300);
    },
    [performSearch],
  );

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setTotal(0);
      setError(null);
      setHasSearched(false);
    }
  }, [open]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Group results by source
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    const key = r.source;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Deal History
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search transcripts, emails, calls, notes..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="pl-10"
            autoFocus
          />
        </div>

        <ScrollArea className="flex-1 min-h-0 max-h-[60vh]">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
            </div>
          )}

          {error && <div className="text-center py-8 text-sm text-destructive">{error}</div>}

          {!loading && !error && hasSearched && results.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No results found for "{query}"
            </div>
          )}

          {!loading && !error && !hasSearched && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Type at least 2 characters to search across all deal activity
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-4 pr-4">
              {total > results.length && (
                <p className="text-xs text-muted-foreground">
                  Showing {results.length} of {total} results
                </p>
              )}

              {Object.entries(grouped).map(([source, items]) => {
                const config = SOURCE_CONFIG[source] || DEFAULT_SOURCE_CONFIG;
                return (
                  <div key={source} className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {config.icon}
                      {config.label} ({items.length})
                    </div>
                    {items.map((result, idx) => (
                      <div
                        key={`${source}-${idx}`}
                        className="rounded-lg border p-3 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge
                              variant="outline"
                              className={`shrink-0 text-[10px] ${config.color}`}
                            >
                              {config.icon}
                              <span className="ml-1">{config.label}</span>
                            </Badge>
                            <span className="text-sm font-medium truncate">{result.title}</span>
                          </div>
                          {result.timestamp && (
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {format(new Date(result.timestamp), 'MMM d, yyyy h:mm a')}
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed line-clamp-3">
                          <HighlightedSnippet text={result.snippet} query={query} />
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
