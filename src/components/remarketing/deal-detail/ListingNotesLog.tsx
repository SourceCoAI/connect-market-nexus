import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MentionNotesInput } from './MentionNotesInput';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ClipboardList,
  Send,
  Loader2,
  Clock,
  ChevronDown,
  ChevronUp,
  Trash2,
  Mic,
  ExternalLink,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ListingNote {
  id: string;
  listing_id: string;
  admin_id?: string;
  note: string;
  created_at: string;
  admin?: {
    email: string;
    first_name: string;
    last_name: string;
  };
}

interface CallTranscript {
  id: string;
  title: string | null;
  source: string | null;
  call_date: string | null;
  duration_minutes: number | null;
  transcript_url: string | null;
  recording_url: string | null;
  has_content: boolean | null;
  extracted_data: {
    fireflies_summary?: string;
    [key: string]: unknown;
  } | null;
  created_at: string;
}

type TimelineItem =
  | { type: 'note'; id: string; date: string; data: ListingNote }
  | { type: 'meeting'; id: string; date: string; data: CallTranscript };

/** Truncate a summary to at most 2 sentences. */
function twoSentenceSummary(summary: string): string {
  const sentences = summary.match(/[^.!?]*[.!?]+/g);
  if (!sentences || sentences.length <= 2) return summary.trim();
  return sentences.slice(0, 2).join('').trim();
}

interface ListingNotesLogProps {
  listingId: string;
  maxHeight?: number;
}

export function ListingNotesLog({ listingId, maxHeight = 480 }: ListingNotesLogProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [note, setNote] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; preview: string } | null>(null);
  const queryClient = useQueryClient();

  // Fetch notes — listing_notes is not in generated types so we use a typed wrapper
  const { data: notes = [], isLoading: notesLoading } = useQuery<ListingNote[]>({
    queryKey: ['listing-notes', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listing_notes')
        .select(`*, admin:admin_id(email, first_name, last_name)`)
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ListingNote[];
    },
    enabled: !!listingId,
    staleTime: 30_000,
  });

  // Fetch call transcripts (Fireflies + PhoneBurner + all sources)
  const { data: transcripts = [], isLoading: transcriptsLoading } = useQuery<CallTranscript[]>({
    queryKey: ['deal-meeting-summaries', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_transcripts')
        .select(
          'id, title, source, call_date, duration_minutes, transcript_url, recording_url, has_content, extracted_data, created_at',
        )
        .eq('listing_id', listingId)
        .in('source', ['fireflies', 'phoneburner'])
        .order('call_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as unknown as CallTranscript[];
    },
    enabled: !!listingId,
    staleTime: 60_000,
  });

  const isLoading = notesLoading || transcriptsLoading;

  // Merge notes and transcripts into a single chronological timeline (newest first)
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    for (const n of notes) {
      items.push({ type: 'note', id: n.id, date: n.created_at, data: n });
    }

    const transcriptsWithContent = transcripts.filter(
      (t) => t.has_content !== false && (t.extracted_data?.fireflies_summary || t.title),
    );

    for (const t of transcriptsWithContent) {
      items.push({
        type: 'meeting',
        id: t.id,
        date: t.call_date || t.created_at,
        data: t,
      });
    }

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [notes, transcripts]);

  const addNoteMutation = useMutation({
    mutationFn: async ({
      noteText,
      mentionedUserIds,
    }: {
      noteText: string;
      mentionedUserIds: string[];
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from('listing_notes').insert({
        listing_id: listingId,
        admin_id: user?.id,
        note: noteText,
      } as never);
      if (error) throw error;

      // Send notifications to mentioned users
      if (mentionedUserIds.length > 0 && user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', user.id)
          .single();

        const currentUserName = profile
          ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
          : 'A team member';

        for (const userId of mentionedUserIds) {
          await supabase.from('user_notifications').insert({
            user_id: userId,
            notification_type: 'mention',
            title: 'You were mentioned in a note',
            message: `${currentUserName} mentioned you in a note: "${noteText.substring(0, 100)}${noteText.length > 100 ? '...' : ''}"`,
            metadata: { listing_id: listingId, note_text: noteText.substring(0, 200) },
          });
        }
      }
    },
    onSuccess: () => {
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['listing-notes', listingId] });
      toast.success('Note added');
    },
    onError: () => {
      toast.error('Failed to add note');
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from('listing_notes').delete().eq('id', noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listing-notes', listingId] });
      toast.success('Note deleted');
      setDeletingId(null);
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error('Failed to delete note');
      setDeletingId(null);
      setDeleteTarget(null);
    },
  });

  const handleSubmit = (text: string, mentionedUserIds: string[]) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addNoteMutation.mutate({ noteText: trimmed, mentionedUserIds });
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      setDeletingId(deleteTarget.id);
      deleteNoteMutation.mutate(deleteTarget.id);
    }
  };

  return (
    <>
      <Card>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CardHeader className="py-3">
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between cursor-pointer">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Notes
                  {timeline.length > 0 && (
                    <Badge variant="secondary" className="text-xs font-normal">
                      {timeline.length}
                    </Badge>
                  )}
                </CardTitle>
                {isOpen ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </CollapsibleTrigger>
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              {/* Note Input with @mention support */}
              <div className="space-y-2">
                <MentionNotesInput
                  value={note}
                  onChange={setNote}
                  onSubmit={handleSubmit}
                  placeholder="Add a note... (use @ to mention)"
                  disabled={addNoteMutation.isPending}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Press Cmd+Enter to submit &middot; Type @ to mention a team member
                  </p>
                  <Button
                    size="sm"
                    onClick={() => handleSubmit(note, [])}
                    disabled={!note.trim() || addNoteMutation.isPending}
                  >
                    {addNoteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Add Note
                  </Button>
                </div>
              </div>

              {/* Timeline Feed */}
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : timeline.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No notes yet</p>
                </div>
              ) : (
                <div
                  className="overflow-y-auto space-y-3 pr-1"
                  style={{ maxHeight: maxHeight - 220 }}
                >
                  {timeline.map((item) =>
                    item.type === 'note' ? (
                      <NoteItem
                        key={`note-${item.id}`}
                        note={item.data}
                        deletingId={deletingId}
                        onDelete={(id, preview) => {
                          setDeleteTarget({ id, preview });
                        }}
                      />
                    ) : (
                      <MeetingItem key={`meeting-${item.id}`} transcript={item.data} />
                    ),
                  )}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this note. This action cannot be undone.
              {deleteTarget?.preview && (
                <span className="block mt-2 text-xs text-muted-foreground italic truncate max-w-full">
                  &ldquo;{deleteTarget.preview}&rdquo;
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function NoteItem({
  note,
  deletingId,
  onDelete,
}: {
  note: ListingNote;
  deletingId: string | null;
  onDelete: (id: string, preview: string) => void;
}) {
  const adminName = note.admin?.first_name
    ? `${note.admin.first_name}${note.admin.last_name ? ` ${note.admin.last_name}` : ''}`
    : (note.admin?.email ?? null);
  const isDeleting = deletingId === note.id;

  return (
    <div className="rounded-lg border p-3 space-y-1.5 group relative bg-background">
      <div className="flex items-center gap-2 flex-wrap">
        {adminName && <span className="text-xs font-medium text-foreground">{adminName}</span>}
        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap flex items-center gap-1.5">
          <span className="font-medium text-foreground/70">
            {format(new Date(note.created_at), 'MMM d, yyyy · h:mm a')}
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span>{formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}</span>
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(note.id, note.note.slice(0, 80))}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      <p className="text-sm whitespace-pre-wrap">{note.note}</p>
    </div>
  );
}

function MeetingItem({ transcript }: { transcript: CallTranscript }) {
  const summary = transcript.extracted_data?.fireflies_summary;
  const displayDate = transcript.call_date || transcript.created_at;
  const isPhoneBurner = transcript.source === 'phoneburner';
  const linkUrl = transcript.transcript_url || transcript.recording_url;

  return (
    <div className="rounded-lg border border-violet-200 dark:border-violet-800 p-3 space-y-1.5 bg-violet-50/50 dark:bg-violet-950/20">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-400">
          <Mic className="h-3.5 w-3.5" />
          Call: {transcript.title || 'Untitled Meeting'}
        </span>
        {isPhoneBurner && (
          <Badge
            variant="outline"
            className="text-[10px] gap-1 shrink-0 border-green-300 text-green-600"
          >
            PB
          </Badge>
        )}
        {transcript.duration_minutes != null && transcript.duration_minutes > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] gap-1 shrink-0 border-violet-200 dark:border-violet-800"
          >
            <Clock className="h-2.5 w-2.5" />
            {transcript.duration_minutes}m
          </Badge>
        )}
        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap flex items-center gap-1.5">
          <span className="font-medium text-foreground/70">
            {format(new Date(displayDate), 'MMM d, yyyy · h:mm a')}
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span>{formatDistanceToNow(new Date(displayDate), { addSuffix: true })}</span>
        </span>
        {linkUrl && (
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-violet-600 transition-colors"
            title={isPhoneBurner ? 'Open recording' : 'Open in Fireflies'}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {summary && <p className="text-sm text-muted-foreground">{twoSentenceSummary(summary)}</p>}
    </div>
  );
}
