/**
 * ComposeEmail: Dialog for composing and sending a new email or reply.
 * Supports rich text formatting and file attachments.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import DOMPurify from 'dompurify';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Send, Paperclip, X, Bold, Italic, Link, List, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSendEmail } from '@/hooks/email';
import type { SendEmailRequest } from '@/types/email';

interface ComposeEmailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  dealId?: string;
  defaultTo?: string[];
  replyToMessageId?: string;
  replySubject?: string;
  replyQuote?: string;
}

interface AttachmentFile {
  name: string;
  contentBytes: string;
  contentType: string;
  size: number;
}

export function ComposeEmail({
  open,
  onOpenChange,
  contactId,
  dealId,
  defaultTo = [],
  replyToMessageId,
  replySubject,
  replyQuote,
}: ComposeEmailProps) {
  const [to, setTo] = useState(defaultTo.join(', '));
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(
    replyToMessageId && replySubject
      ? (replySubject.startsWith('Re: ') ? replySubject : `Re: ${replySubject}`)
      : '',
  );
  const [showCc, setShowCc] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendEmail = useSendEmail();
  const { toast } = useToast();

  // Sync `to` field when defaultTo prop changes (e.g., switching contacts)
  useEffect(() => {
    setTo(defaultTo.join(', '));
  }, [defaultTo.join(',')]);

  // Reset subject when switching between compose/reply modes
  useEffect(() => {
    if (replyToMessageId && replySubject) {
      setSubject(replySubject.startsWith('Re: ') ? replySubject : `Re: ${replySubject}`);
    } else if (!replyToMessageId) {
      setSubject('');
    }
  }, [replyToMessageId, replySubject]);

  const handleFileAttach = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      // 25MB limit per attachment
      if (file.size > 25 * 1024 * 1024) {
        toast({
          title: 'File Too Large',
          description: `"${file.name}" exceeds the 25MB attachment limit.`,
          variant: 'destructive',
        });
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            contentBytes: base64,
            contentType: file.type || 'application/octet-stream',
            size: file.size,
          },
        ]);
      };
      reader.readAsDataURL(file);
    }

    // Reset input
    e.target.value = '';
  }, []);

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  const handleSend = async () => {
    const bodyHtml = editorRef.current?.innerHTML || '';
    const bodyText = editorRef.current?.innerText || '';

    if (!to.trim()) return;
    if (!bodyText.trim()) {
      toast({
        title: 'Empty Message',
        description: 'Please write a message before sending.',
        variant: 'destructive',
      });
      return;
    }

    const toAddresses = to.split(',').map((e) => e.trim()).filter(Boolean);
    const ccAddresses = cc ? cc.split(',').map((e) => e.trim()).filter(Boolean) : [];

    const request: SendEmailRequest = {
      contactId,
      dealId,
      to: toAddresses,
      cc: ccAddresses.length > 0 ? ccAddresses : undefined,
      subject: subject || '(No subject)',
      bodyHtml,
      bodyText,
      replyToMessageId,
      attachments: attachments.map((a) => ({
        name: a.name,
        contentBytes: a.contentBytes,
        contentType: a.contentType,
      })),
    };

    sendEmail.mutate(request, {
      onSuccess: () => {
        onOpenChange(false);
        // Reset form
        setTo(defaultTo.join(', '));
        setCc('');
        setSubject('');
        setAttachments([]);
        if (editorRef.current) editorRef.current.innerHTML = '';
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{replyToMessageId ? 'Reply' : 'New Email'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 flex-1 overflow-y-auto">
          <div className="space-y-1.5">
            <Label htmlFor="to" className="text-xs">
              To
            </Label>
            <div className="flex gap-2">
              <Input
                id="to"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@email.com"
                className="text-sm"
              />
              {!showCc && (
                <Button variant="ghost" size="sm" onClick={() => setShowCc(true)} className="text-xs shrink-0">
                  CC
                </Button>
              )}
            </div>
          </div>

          {showCc && (
            <div className="space-y-1.5">
              <Label htmlFor="cc" className="text-xs">
                CC
              </Label>
              <Input
                id="cc"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="cc@email.com"
                className="text-sm"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="subject" className="text-xs">
              Subject
            </Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              className="text-sm"
              disabled={!!replyToMessageId}
            />
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-0.5 border-b pb-1.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('bold')}>
              <Bold className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('italic')}>
              <Italic className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                const url = prompt('Enter URL:');
                if (url) execCommand('createLink', url);
              }}
            >
              <Link className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('insertUnorderedList')}>
              <List className="h-3.5 w-3.5" />
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="h-3.5 w-3.5" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileAttach}
            />
          </div>

          {/* Rich text editor */}
          <div
            ref={editorRef}
            contentEditable
            role="textbox"
            aria-label="Email message body"
            aria-multiline="true"
            tabIndex={0}
            className="min-h-[200px] max-h-[300px] overflow-y-auto border rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={
              replyQuote
                ? { __html: `<br/><br/><blockquote style="border-left: 2px solid #ccc; padding-left: 8px; color: #666;">${DOMPurify.sanitize(replyQuote)}</blockquote>` }
                : undefined
            }
          />

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((att, i) => (
                <Badge key={i} variant="secondary" className="gap-1 pr-1">
                  <Paperclip className="h-3 w-3" />
                  <span className="text-xs">
                    {att.name} ({(att.size / 1024).toFixed(0)} KB)
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 ml-0.5"
                    onClick={() => removeAttachment(i)}
                  >
                    <X className="h-2.5 w-2.5" />
                  </Button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sendEmail.isPending || !to.trim()}
          >
            {sendEmail.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {sendEmail.isPending ? 'Sending...' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
