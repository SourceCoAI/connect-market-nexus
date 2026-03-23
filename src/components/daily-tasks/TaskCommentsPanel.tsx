/**
 * TaskCommentsPanel — Threaded comment list with add form.
 */

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Send, Loader2, Trash2 } from 'lucide-react';
import { useTaskComments, useAddTaskComment, useDeleteTaskComment } from '@/hooks/useTaskComments';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface TaskCommentsPanelProps {
  taskId: string;
}

export function TaskCommentsPanel({ taskId }: TaskCommentsPanelProps) {
  const { data: comments, isLoading } = useTaskComments(taskId);
  const addComment = useAddTaskComment();
  const deleteComment = useDeleteTaskComment();
  const { user } = useAuth();
  const { toast } = useToast();
  const [body, setBody] = useState('');

  const handleSubmit = async () => {
    if (!body.trim()) return;
    try {
      await addComment.mutateAsync({ taskId, body: body.trim() });
      setBody('');
    } catch (err) {
      toast({
        title: 'Failed to add comment',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Comments
        </h4>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : comments && comments.length > 0 ? (
        <div className="space-y-2">
          {comments.map((c) => {
            const name = c.user
              ? `${c.user.first_name || ''} ${c.user.last_name || ''}`.trim() || c.user.email
              : 'Unknown';
            return (
              <div key={c.id} className="group rounded-md border px-3 py-2 bg-muted/30 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-xs">{name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                  {c.user?.id === user?.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        deleteComment.mutate(
                          { commentId: c.id, taskId },
                          {
                            onError: (err) =>
                              toast({
                                title: 'Failed to delete comment',
                                description: err instanceof Error ? err.message : 'Unknown error',
                                variant: 'destructive',
                              }),
                          },
                        );
                      }}
                      disabled={deleteComment.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{c.body}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      )}

      {/* Add comment */}
      <div className="flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment..."
          rows={1}
          className="min-h-[36px] text-sm resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Button
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={handleSubmit}
          disabled={!body.trim() || addComment.isPending}
        >
          {addComment.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
