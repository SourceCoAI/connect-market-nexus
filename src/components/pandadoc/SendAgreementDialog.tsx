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
import { Loader2, Send, Mail } from 'lucide-react';
import { sendAgreementEmail, docTypeLabel } from '@/lib/agreement-email';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

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
 * Admin dialog for sending NDA or Fee Agreement via email.
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
  const [sending, setSending] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setEmail(buyerEmail);
    }
  }, [open, buyerEmail]);

  const docLabel = documentType === 'nda' ? 'NDA' : 'Fee Agreement';
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSend = async () => {
    if (!isValidEmail) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('request-agreement-email', {
        body: { documentType, recipientEmail: email, recipientName: buyerName, firmId },
      });

      if (error) throw error;

      toast({
        title: `${docLabel} Sent`,
        description: `Document email sent to ${email}`,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-document-tracking'] });
      queryClient.invalidateQueries({ queryKey: ['admin-pending-doc-requests'] });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Failed to send',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send {docLabel}</DialogTitle>
          <DialogDescription>
            Send {docLabel} to {firmName || buyerName} via email
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="buyer-email">Recipient Email</Label>
            <Input
              id="buyer-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="bg-muted/50 border border-border rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>Document will be sent from <strong>support@sourcecodeals.com</strong></span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              The recipient will receive the {docLabel.toLowerCase()} to review and sign. They should return the signed copy via email.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!isValidEmail || sending}>
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send {docLabel}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
