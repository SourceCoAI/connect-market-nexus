import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, X, User, Mail, Send, Loader2 } from 'lucide-react';
import { User as UserType, Listing } from '@/types';
import { useUserFirm } from '@/hooks/admin/use-firm-agreement-actions';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { EditableSignature } from '@/components/admin/EditableSignature';
// Hook removed - edge function handles both email sending and database logging

/** Small helper that resolves firm-level Fee Agreement status badges */
function FirmFeeStatusBadges({ userId }: { userId: string }) {
  const { data: firm } = useUserFirm(userId);
  const f = firm as { fee_agreement_signed?: boolean; fee_agreement_email_sent?: boolean } | null | undefined;
  return (
    <div className="flex gap-2">
      <Badge variant={f?.fee_agreement_signed ? 'default' : 'secondary'}>
        {f?.fee_agreement_signed ? 'Signed' : 'Pending'}
      </Badge>
      <Badge variant={f?.fee_agreement_email_sent ? 'default' : 'outline'}>
        {f?.fee_agreement_email_sent ? 'Email Sent' : 'Not Sent'}
      </Badge>
    </div>
  );
}

interface SimpleFeeAgreementDialogProps {
  user: UserType | null;
  listing?: Listing;
  isOpen: boolean;
  onClose: () => void;
  onSendEmail: (
    user: UserType,
    options?: {
      subject?: string;
      content?: string;
      attachments?: Array<{ name: string; content: string }>;
      customSignatureText?: string;
    },
  ) => Promise<void>;
}

const QUICK_TEMPLATE = {
  name: 'Quick',
  subject: 'Fee Agreement',
  content: `{{userName}},

When you get a chance, please review and sign the attached fee agreement.

Thanks!

Best regards,
{{adminName}}`,
};

export function SimpleFeeAgreementDialog({
  user,
  isOpen,
  onClose,
  onSendEmail,
}: SimpleFeeAgreementDialogProps) {
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [customSignatureText, setCustomSignatureText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const { user: adminUser } = useAuth();

  useEffect(() => {
    if (user && isOpen) {
      const name =
        user.first_name && user.last_name
          ? `${user.first_name} ${user.last_name}`
          : user.email?.split('@')[0] || '';

      const admin = adminUser?.first_name || 'SourceCo Team';

      const filledSubject = QUICK_TEMPLATE.subject
        .replace('{{userName}}', name)
        .replace('{{adminName}}', admin);
      const filledContent = QUICK_TEMPLATE.content
        .replace(/{{userName}}/g, name)
        .replace(/{{adminName}}/g, admin);
      setSubject(filledSubject);
      setContent(filledContent);
      setAttachments([]);
    }
  }, [user, isOpen, adminUser]);

  const userName =
    user?.first_name && user?.last_name
      ? `${user.first_name} ${user.last_name}`
      : user?.email?.split('@')[0] || '';

  const adminName = adminUser?.first_name || 'SourceCo Team';

  const loadTemplate = () => {
    const filledSubject = QUICK_TEMPLATE.subject
      .replace('{{userName}}', userName)
      .replace('{{adminName}}', adminName);
    const filledContent = QUICK_TEMPLATE.content
      .replace(/{{userName}}/g, userName)
      .replace(/{{adminName}}/g, adminName);

    setSubject(filledSubject);
    setContent(filledContent);
    toast.success(`${QUICK_TEMPLATE.name} template loaded`);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const pdfFiles = files.filter((file) => file.type === 'application/pdf');

    if (pdfFiles.length !== files.length) {
      toast.error('Only PDF files are allowed');
      return;
    }

    if (pdfFiles.length + attachments.length > 3) {
      toast.error('Maximum 3 attachments allowed');
      return;
    }

    setAttachments((prev) => [...prev, ...pdfFiles]);
    toast.success(`Added ${pdfFiles.length} file(s)`);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const convertFilesToBase64 = async (
    files: File[],
  ): Promise<Array<{ name: string; content: string }>> => {
    const convertedAttachments = [];

    for (const file of files) {
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const base64Content = base64.split(',')[1];
        convertedAttachments.push({
          name: file.name,
          content: base64Content,
        });
      } catch (error) {
        toast.error(`Failed to process ${file.name}`);
      }
    }

    return convertedAttachments;
  };

  const handleSend = async () => {
    if (!user) return;

    if (!subject.trim()) {
      toast.error('Subject is required');
      return;
    }

    if (!content.trim()) {
      toast.error('Email content is required');
      return;
    }

    setIsSending(true);
    try {
      // Convert attachments to base64
      const convertedAttachments = await convertFilesToBase64(attachments);

      // Use the onSendEmail prop which calls the hook
      await onSendEmail(user, {
        subject: subject,
        content: content,
        attachments: convertedAttachments,
        customSignatureText: customSignatureText,
      });

      toast.success('Fee agreement email sent!');
      handleClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setSubject('');
    setContent('');
    setAttachments([]);
    setCustomSignatureText('');
    onClose();
  };

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <FileText className="h-5 w-5" />
            Send Fee Agreement
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 min-h-0">
          {/* User Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4" />
                Recipient
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <span className="text-sm">{user.email}</span>
                  <span className="text-sm text-muted-foreground">({userName})</span>
                </div>
                <FirmFeeStatusBadges userId={user.id} />
              </div>
            </CardContent>
          </Card>

          {/* Template Button */}
          <div className="space-y-2">
            <Label>Load Template (one-click)</Label>
            <Button variant="outline" size="sm" onClick={loadTemplate}>
              Load {QUICK_TEMPLATE.name} Template
            </Button>
          </div>

          {/* Email Fields */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter email subject..."
              />
            </div>

            <div>
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter email content..."
                className="min-h-[300px]"
              />
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <Label>PDF Attachments</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".pdf"
                    multiple
                    onChange={handleFileUpload}
                    className="flex-1"
                  />
                  <Badge variant="outline">{attachments.length}/3</Badge>
                </div>

                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((file, index) => (
                      <div
                        key={file.name}
                        className="flex items-center justify-between p-2 bg-muted rounded"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm">{file.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </Badge>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => removeAttachment(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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

        {/* Actions */}
        <div className="flex-shrink-0 p-6 pt-0">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={!subject.trim() || !content.trim() || isSending}>
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
