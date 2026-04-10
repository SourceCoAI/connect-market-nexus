import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, User, Mail, AlertTriangle, Building2 } from 'lucide-react';
import { AdminConnectionRequest } from '@/types/admin';

interface ConnectionRequestEmailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (comment: string) => Promise<void>;
  selectedRequest: AdminConnectionRequest | null;
  actionType: 'approve' | 'reject' | null;
  isLoading: boolean;
}

export function ConnectionRequestEmailDialog({
  isOpen,
  onClose,
  onConfirm,
  selectedRequest,
  actionType,
  isLoading,
}: ConnectionRequestEmailDialogProps) {
  const [adminComment, setAdminComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setAdminComment('');
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    try {
      setError(null);
      await onConfirm(adminComment);
      setAdminComment('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  if (!selectedRequest) return null;

  const userName = selectedRequest.user
    ? `${selectedRequest.user.first_name || ''} ${selectedRequest.user.last_name || ''}`.trim()
    : selectedRequest.lead_name || 'Unknown';

  const userEmail = selectedRequest.user?.email || selectedRequest.lead_email || '';
  const userCompany = selectedRequest.user?.company || selectedRequest.lead_company || '';
  const listingTitle = selectedRequest.listing?.title || 'Untitled Listing';

  const isApproval = actionType === 'approve';
  const fromEmail = isApproval ? 'noreply@sourcecodeals.com' : 'support@sourcecodeals.com';
  const subject = isApproval
    ? `Introduction approved: ${listingTitle}`
    : `Introduction update: ${listingTitle}`;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-semibold">
            {isApproval ? 'Approve Connection Request' : 'Reject Connection Request'}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {isApproval
              ? 'This will approve the request and send the buyer an introduction email.'
              : 'This will reject the request and notify the buyer.'}
          </p>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Recipient info */}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
              {userCompany && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Building2 className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground truncate">{userCompany}</span>
                </div>
              )}
            </div>
            <Badge variant="outline" className="text-xs shrink-0">
              {listingTitle}
            </Badge>
          </div>

          {/* Email preview */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email preview</p>
            <div className="rounded-lg border border-border p-4 space-y-3 text-sm">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  <span className="text-xs">From:</span>
                  <span className="text-foreground text-xs font-medium">{fromEmail}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 opacity-0" />
                  <span className="text-xs">Subject:</span>
                  <span className="text-foreground text-xs font-medium">{subject}</span>
                </div>
              </div>
              <hr className="border-border" />

              {isApproval ? (
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-muted-foreground/60 mt-0.5">•</span>
                    <span>Introduction approved -- buyer gains access to deal details</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-muted-foreground/60 mt-0.5">•</span>
                    <span>Exclusive intro language (1-3 buyers selected)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-muted-foreground/60 mt-0.5">•</span>
                    <span>Next steps and what to expect</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-muted-foreground/60 mt-0.5">•</span>
                    <span>CTA: View Messages</span>
                  </li>
                </ul>
              ) : (
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-muted-foreground/60 mt-0.5">•</span>
                    <span>Request was not selected for this deal</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-muted-foreground/60 mt-0.5">•</span>
                    <span>Encouragement to keep browsing the marketplace</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-muted-foreground/60 mt-0.5">•</span>
                    <span>CTA: Browse Deals</span>
                  </li>
                  {adminComment && (
                    <li className="flex items-start gap-2">
                      <span className="text-muted-foreground/60 mt-0.5">•</span>
                      <span className="text-foreground">Admin note included in email</span>
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>

          {/* Admin comment */}
          <div className="space-y-1.5">
            <label htmlFor="admin-comment" className="text-xs font-medium text-muted-foreground">
              {isApproval ? 'Admin note (optional)' : 'Rejection reason (optional -- included in email)'}
            </label>
            <Textarea
              id="admin-comment"
              value={adminComment}
              onChange={(e) => setAdminComment(e.target.value)}
              placeholder={
                isApproval
                  ? 'Add any internal notes about this approval...'
                  : 'Provide a reason for rejection (buyer will see this)...'
              }
              className="min-h-[80px] text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-3 pt-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
            className="border-[hsl(var(--border))] text-muted-foreground hover:bg-muted/50"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            variant={isApproval ? 'default' : 'destructive'}
            className={isApproval ? 'bg-[#0E101A] text-white hover:bg-[#1a1d2e]' : ''}
          >
            {isLoading ? (
              <>
                <Mail className="h-4 w-4 mr-2 animate-spin" />
                {isApproval ? 'Approving...' : 'Rejecting...'}
              </>
            ) : (
              <>
                {isApproval ? (
                  <CheckCircle className="h-4 w-4 mr-2" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                {isApproval ? 'Approve & Send Email' : 'Reject & Send Email'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
