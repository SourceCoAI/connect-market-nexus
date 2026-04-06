import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, User, Mail, AlertTriangle } from 'lucide-react';
import { User as UserType } from '@/types';

interface ApprovalEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserType | null;
  onSendApprovalEmail: (
    user: UserType,
    options: {
      subject: string;
      message: string;
      customSignatureHtml?: string;
      customSignatureText?: string;
    },
  ) => Promise<void>;
}

export function ApprovalEmailDialog({
  open,
  onOpenChange,
  user,
  onSendApprovalEmail,
}: ApprovalEmailDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const userName =
    user?.first_name && user?.last_name
      ? `${user.first_name} ${user.last_name}`
      : user?.first_name || user?.email?.split('@')[0] || '';

  const handleSend = async () => {
    if (!user) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await onSendApprovalEmail(user, {
        subject: '',
        message: '',
      });
      setErrorMessage(null);
    } catch (error) {
      console.error('[ApprovalDialog] Error in approval flow:', error);
      const msg = error instanceof Error ? error.message : 'An unexpected error occurred during approval.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-semibold">
            Approve User
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            This will approve their account and send a welcome email.
          </p>
        </DialogHeader>

        {errorMessage && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* User info */}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
            <Badge variant="outline" className="text-xs capitalize shrink-0">
              {user.approval_status}
            </Badge>
          </div>

          {/* Email preview */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email preview</p>
            <div className="rounded-lg border border-border p-4 space-y-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span className="text-xs">Subject:</span>
                <span className="text-foreground text-xs font-medium">Welcome to SourceCo — Your account is approved</span>
              </div>
              <hr className="border-border" />
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-muted-foreground/60 mt-0.5">•</span>
                  <span>Account approved, access to off-market deal pipeline</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted-foreground/60 mt-0.5">•</span>
                  <span>CTA: Browse the Marketplace</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted-foreground/60 mt-0.5">•</span>
                  <span>Secondary: Instructions to sign NDA + Fee Agreement for full access</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="border-[#E5E5E5] text-muted-foreground hover:bg-muted/50"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isLoading}
            className="bg-[#0E101A] text-white hover:bg-[#1a1d2e]"
          >
            {isLoading ? (
              <>
                <Mail className="h-4 w-4 mr-2 animate-spin" />
                Approving...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve & Send Email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
