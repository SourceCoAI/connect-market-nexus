import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Send, Monitor, Mail, Link2, Copy, Check } from 'lucide-react';
import { useCreatePandaDocDocument } from '@/hooks/admin/use-pandadoc';
import { useToast } from '@/hooks/use-toast';

interface SendAgreementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  firmId: string;
  documentType: 'nda' | 'fee_agreement';
  buyerEmail: string;
  buyerName: string;
  firmName?: string;
}

/**
 * Dialog for sending NDA or Fee Agreement via PandaDoc.
 * Admin can choose between embedded (in-app), email, or generate a copyable link.
 */
export function SendAgreementDialog({
  open,
  onOpenChange,
  firmId,
  documentType,
  buyerEmail,
  buyerName,
  firmName,
}: SendAgreementDialogProps) {
  const [email, setEmail] = useState(buyerEmail);
  const [flow, setFlow] = useState<'embedded' | 'email' | 'link'>('email');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const createDocument = useCreatePandaDocDocument();
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setEmail(buyerEmail);
      setFlow('email');
      setGeneratedLink(null);
      setCopied(false);
    }
  }, [open, buyerEmail]);

  const docLabel = documentType === 'nda' ? 'NDA' : 'Fee Agreement';
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSend = async () => {
    if (!isValidEmail) return;
    try {
      const result = await createDocument.mutateAsync({
        firmId,
        documentType,
        buyerEmail: email,
        buyerName,
        sendEmail: flow === 'email',
      });

      // If "link" flow, show the signing URL instead of closing
      if (flow === 'link' && result?.embedUrl) {
        setGeneratedLink(result.embedUrl);
      } else {
        onOpenChange(false);
      }
    } catch {
      // Error toast shown by mutation's onError handler; dialog stays open for retry
    }
  };

  const handleCopy = async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      toast({ title: 'Link copied!', description: 'Paste it into your email or message.' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send {docLabel}</DialogTitle>
          <DialogDescription>
            Send {docLabel} signing request to {firmName || buyerName}
          </DialogDescription>
        </DialogHeader>

        {generatedLink ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Signing Link</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={generatedLink}
                  className="text-xs font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this link with the buyer. You'll be notified when they view or sign it.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              <Button onClick={handleCopy}>
                {copied ? <><Check className="h-4 w-4 mr-2" /> Copied!</> : <><Copy className="h-4 w-4 mr-2" /> Copy Link</>}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="buyer-email">Buyer Email</Label>
                <Input
                  id="buyer-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Signing Method</Label>
                <RadioGroup
                  value={flow}
                  onValueChange={(v) => setFlow(v as 'embedded' | 'email' | 'link')}
                  className="space-y-2"
                >
                  <div className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                    <RadioGroupItem value="email" id="flow-email" className="mt-0.5" />
                    <label htmlFor="flow-email" className="cursor-pointer flex-1">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Email Link</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Buyer receives email with signing link from PandaDoc.
                      </p>
                    </label>
                  </div>
                  <div className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                    <RadioGroupItem value="link" id="flow-link" className="mt-0.5" />
                    <label htmlFor="flow-link" className="cursor-pointer flex-1">
                      <div className="flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Generate Link</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Get a shareable signing URL to paste into your own email or message.
                      </p>
                    </label>
                  </div>
                  <div className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                    <RadioGroupItem value="embedded" id="flow-embedded" className="mt-0.5" />
                    <label htmlFor="flow-embedded" className="cursor-pointer flex-1">
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">In-App Signing</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Buyer signs next time they visit the platform.
                      </p>
                    </label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={!isValidEmail || createDocument.isPending}
              >
                {createDocument.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {flow === 'link' ? 'Generating...' : 'Sending...'}
                  </>
                ) : flow === 'link' ? (
                  <>
                    <Link2 className="h-4 w-4 mr-2" />
                    Generate Link
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send {docLabel}
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
