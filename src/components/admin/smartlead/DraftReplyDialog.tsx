import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Copy, RefreshCw, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useDraftReply } from '@/hooks/smartlead/use-draft-reply';

interface DraftReplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inboxItemId: string;
  leadName?: string;
  category?: string;
}

export function DraftReplyDialog({
  open,
  onOpenChange,
  inboxItemId,
  leadName,
  category,
}: DraftReplyDialogProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState(false);

  const draftReply = useDraftReply();

  const generate = () => {
    draftReply.mutate(inboxItemId, {
      onSuccess: (data) => {
        setSubject(data.email.subject);
        setBody(data.email.body);
      },
      onError: (err) => {
        toast.error('Failed to generate draft', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      },
    });
  };

  useEffect(() => {
    if (open && inboxItemId) {
      setSubject('');
      setBody('');
      setCopied(false);
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inboxItemId]);

  const handleCopy = async () => {
    const text = `Subject: ${subject}\n\n${body}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Draft copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyBodyOnly = async () => {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    toast.success('Body copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Draft Reply
            {category && (
              <Badge variant="outline" className="text-xs font-normal">
                {category.replace('_', ' ')}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            AI-generated reply draft for {leadName || 'this lead'}. Edit as needed, then copy to
            send via Smartlead.
          </DialogDescription>
        </DialogHeader>

        {draftReply.isPending ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Generating draft reply...</p>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="draft-subject">Subject</Label>
              <Input
                id="draft-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Re: ..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="draft-body">Email Body</Label>
              <Textarea
                id="draft-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Draft will appear here..."
                className="min-h-[250px] font-sans text-sm"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={generate}
                disabled={draftReply.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Regenerate
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyBodyOnly} disabled={!body}>
                  {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  Copy Body
                </Button>
                <Button size="sm" onClick={handleCopy} disabled={!body}>
                  {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  Copy All
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
