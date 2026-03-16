import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, Mail, User } from 'lucide-react';
import { User as UserType, Listing } from '@/types';
import { useUserFirm } from '@/hooks/admin/use-firm-agreement-actions';
import { EditableSignature } from '@/components/admin/EditableSignature';
// Hook removed - edge function handles both email sending and database logging
import { useAuth } from '@/contexts/AuthContext';

interface SimpleNDADialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserType | null;
  listing?: Listing;
  onSendEmail: (
    user: UserType,
    options?: {
      subject?: string;
      message?: string;
      customSignatureHtml?: string;
      customSignatureText?: string;
    },
  ) => Promise<void>;
}

export const SimpleNDADialog = ({
  open,
  onOpenChange,
  user,
  onSendEmail,
}: SimpleNDADialogProps) => {
  const [customSubject, setCustomSubject] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [customSignatureText, setCustomSignatureText] = useState('');
  const [_selectedTemplate, _setSelectedTemplate] = useState<'quick' | 'standard' | 'executive'>(
    'standard',
  );
  const [isSending, setIsSending] = useState(false);

  const { user: currentUser } = useAuth();

  // Reset and preload concise template on open
  useEffect(() => {
    if (open && user) {
      const adminName = currentUser?.first_name || 'SourceCo Team';
      setCustomSubject('NDA Required');
      setCustomMessage(`${user.first_name || user.email},

When you get a chance, please review and sign the attached NDA.

Thanks!

Best regards,
${adminName}`);
      setCustomSignatureText('');
    }
  }, [open, user, currentUser]);

  const handleSend = async () => {
    if (!user) return;

    setIsSending(true);
    try {
      // Use the onSendEmail prop which calls the edge function directly
      await onSendEmail(user, {
        subject: customSubject || undefined,
        message: customMessage || undefined,
        customSignatureText: customSignatureText || undefined,
      });

      // Close dialog and reset form
      onOpenChange(false);
      setCustomSubject('');
      setCustomMessage('');
      setCustomSignatureText('');
    } catch (error) {
      console.error('Error sending NDA email:', error);
    } finally {
      setIsSending(false);
    }
  };

  // Early return AFTER all hooks are declared
  if (!user) return null;

  const adminName = currentUser?.first_name || 'SourceCo Team';

  const quickTemplate = {
    subject: 'NDA Required',
    message: `${user.first_name || user.email},

When you get a chance, please review and sign the attached NDA.

Thanks!

Best regards,
${adminName}`,
  };

  const defaultSubject = quickTemplate.subject;
  const defaultMessage = quickTemplate.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-hidden">
        <div className="overflow-y-auto max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Send NDA Email
            </DialogTitle>
            <DialogDescription>
              Send a Non-Disclosure Agreement to the selected user
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* User Information */}
            <div className="bg-muted/50 p-4 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {user.first_name} {user.last_name}
                </span>
                <Badge variant="outline">{user.email}</Badge>
              </div>

              <FirmNDAStatusBadges userId={user.id} />
            </div>

            {/* Template Selection */}
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>Email Template</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCustomSubject(quickTemplate.subject);
                    setCustomMessage(quickTemplate.message);
                  }}
                  className="text-xs"
                >
                  Load Quick Template
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Email Subject (optional)</Label>
                <Input
                  id="subject"
                  placeholder={defaultSubject}
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Custom Message (optional)</Label>
                <Textarea
                  id="message"
                  placeholder={defaultMessage}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use the selected template
                </p>
              </div>

              {/* Email Signature */}
              <EditableSignature
                showInline
                onSignatureChange={(_html, text) => {
                  setCustomSignatureText(text);
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 p-6 pt-0">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={isSending}>
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send NDA Email
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
