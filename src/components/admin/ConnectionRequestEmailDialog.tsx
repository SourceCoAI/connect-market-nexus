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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle, XCircle, User, Mail, AlertTriangle, Building2 } from 'lucide-react';
import { AdminConnectionRequest } from '@/types/admin';
import { DEAL_OWNER_SENDERS } from '@/lib/admin-profiles';

interface ConnectionRequestEmailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (comment: string, senderEmail: string) => Promise<void>;
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
  const [senderEmail, setSenderEmail] = useState(DEAL_OWNER_SENDERS[0].email);

  const handleClose = () => {
    setAdminComment('');
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    try {
      setError(null);
      await onConfirm(adminComment, senderEmail);
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
  const subject = isApproval
    ? `Introduction approved: ${listingTitle}`
    : `Regarding Your Interest in ${listingTitle}`;

  const selectedSender = DEAL_OWNER_SENDERS.find(s => s.email === senderEmail) || DEAL_OWNER_SENDERS[0];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg p-6 max-h-[90vh] overflow-y-auto">
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

          {/* Sender selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Send from</label>
            <Select value={senderEmail} onValueChange={setSenderEmail}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEAL_OWNER_SENDERS.map((sender) => (
                  <SelectItem key={sender.email} value={sender.email}>
                    <span className="font-medium">{sender.name}</span>
                    <span className="text-muted-foreground ml-1.5">({sender.email})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Email preview */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email preview</p>
            <div className="rounded-lg border border-border p-4 space-y-3 text-sm bg-background">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  <span className="text-xs">From:</span>
                  <span className="text-foreground text-xs font-medium">
                    {selectedSender.name} &lt;{selectedSender.email}&gt;
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 opacity-0" />
                  <span className="text-xs">To:</span>
                  <span className="text-foreground text-xs font-medium">{userEmail}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 opacity-0" />
                  <span className="text-xs">Subject:</span>
                  <span className="text-foreground text-xs font-medium">{subject}</span>
                </div>
              </div>
              <hr className="border-border" />

              {isApproval ? (
                <div className="space-y-3 text-xs text-foreground leading-relaxed">
                  <p>Your introduction to <strong>{listingTitle}</strong> has been approved.</p>
                  <p>We are making a direct introduction to the business owner. You will receive a message from our team with next steps, typically within one business day.</p>
                  <p className="font-medium">What to expect</p>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li>Our team facilitates the initial introduction</li>
                    <li>You receive access to deal details and supporting materials</li>
                    <li>Message us directly on the platform for support. All conversations are tracked there for your records</li>
                  </ul>
                  <p className="text-muted-foreground">This is an exclusive introduction. We work with a small number of buyers per deal. Move at your own pace, but do not sit on it. Please do not reply to this email.</p>
                  <div className="pt-2">
                    <span className="inline-block bg-foreground text-background px-4 py-2 rounded-md text-xs font-semibold">
                      View Messages
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-xs text-foreground leading-relaxed">
                  <p>Thank you for your interest in <strong>{listingTitle}</strong>.</p>
                  <p className="text-muted-foreground">After reviewing your profile against this specific opportunity, we have decided not to move forward with an introduction at this time. We limit introductions to a small number of buyers per deal to ensure strong alignment on both sides.</p>
                  <p className="text-muted-foreground">Your interest has been noted. If the situation changes, we will reach out directly.</p>
                  <p className="text-muted-foreground">In the meantime, continue browsing the pipeline. New deals are added regularly and your next match may already be live.</p>
                  <p className="text-muted-foreground/70 pt-2">The SourceCo Team</p>
                </div>
              )}
            </div>
          </div>

          {/* Admin comment */}
          <div className="space-y-1.5">
            <label htmlFor="admin-comment" className="text-xs font-medium text-muted-foreground">
              {isApproval ? 'Admin note (optional)' : 'Rejection reason (optional)'}
            </label>
            <Textarea
              id="admin-comment"
              value={adminComment}
              onChange={(e) => setAdminComment(e.target.value)}
              placeholder={
                isApproval
                  ? 'Add any internal notes about this approval...'
                  : 'Provide a reason for rejection...'
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
