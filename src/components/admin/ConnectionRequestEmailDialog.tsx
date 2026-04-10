import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle, XCircle, Mail, AlertTriangle, Pencil, RotateCcw } from 'lucide-react';
import { AdminConnectionRequest } from '@/types/admin';
import { DEAL_OWNER_SENDERS } from '@/lib/admin-profiles';
import { useAuth } from '@/contexts/AuthContext';

const LOGO_URL = 'https://cdn.prod.website-files.com/66851dae8a2c8c3f8cd9c703/66af956d372d85d43f02f481_Group%202%20(4)%20(1).png';

interface ConnectionRequestEmailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (comment: string, senderEmail: string, customBody?: string) => Promise<void>;
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
  const { user: authUser } = useAuth();
  const [adminComment, setAdminComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedBody, setEditedBody] = useState('');

  const defaultSender = useMemo(() => {
    if (authUser?.email) {
      const match = DEAL_OWNER_SENDERS.find(s => s.email === authUser.email);
      if (match) return match.email;
    }
    return DEAL_OWNER_SENDERS[0].email;
  }, [authUser?.email]);

  const [senderEmail, setSenderEmail] = useState(defaultSender);

  useEffect(() => {
    if (isOpen) {
      setSenderEmail(defaultSender);
      setIsEditing(false);
      setEditedBody('');
    }
  }, [isOpen, defaultSender]);

  const userName = selectedRequest
    ? (selectedRequest.user
      ? `${selectedRequest.user.first_name || ''} ${selectedRequest.user.last_name || ''}`.trim()
      : selectedRequest.lead_name || 'Unknown')
    : '';

  const userEmail = selectedRequest?.user?.email || selectedRequest?.lead_email || '';
  const userCompany = selectedRequest?.user?.company || selectedRequest?.lead_company || '';
  const listingTitle = selectedRequest?.listing?.title || 'Untitled Listing';

  const isApproval = actionType === 'approve';
  const selectedSender = DEAL_OWNER_SENDERS.find(s => s.email === senderEmail) || DEAL_OWNER_SENDERS[0];
  const isNamedSender = senderEmail !== 'support@sourcecodeals.com';

  const defaultBody = useMemo(() => {
    if (!selectedRequest) return '';
    if (isApproval) {
      const touchLine = isNamedSender
        ? 'I will be in touch shortly with next steps.'
        : `${selectedSender.name} will be in touch shortly with next steps.`;
      const reachOutLine = isNamedSender
        ? 'I will reach out to coordinate next steps'
        : `${selectedSender.name} from our team will reach out to coordinate next steps`;
      return `Your request for ${listingTitle} has been approved.\n\nYou now have access to additional deal materials, detailed company information, including the real company name, and supporting documents. ${touchLine}\n\nWhat to expect:\n- Access to the full deal profile, data room, and supporting materials\n- ${reachOutLine}\n- Message us directly on the platform or reply to this email\n\nThis is an exclusive opportunity. We work with a small number of buyers per deal. Move at your own pace, but do not sit on it.`;
    }
    return `Thank you for your interest in ${listingTitle}.\n\nAfter reviewing your profile against this specific opportunity, we have decided not to move forward at this time. We limit introductions to a small number of buyers per deal to ensure strong alignment on both sides.\n\nYour interest has been noted. If the situation changes, we will reach out directly.\n\nIn the meantime, continue browsing the pipeline. New deals are added regularly and your next match may already be live.`;
  }, [selectedRequest, isApproval, listingTitle, selectedSender.name, isNamedSender]);

  const handleClose = () => {
    setAdminComment('');
    setError(null);
    setIsEditing(false);
    setEditedBody('');
    onClose();
  };

  const handleConfirm = async () => {
    try {
      setError(null);
      const customBody = isEditing && editedBody.trim() !== defaultBody.trim() ? editedBody.trim() : undefined;
      await onConfirm(adminComment, senderEmail, customBody);
      setAdminComment('');
      setIsEditing(false);
      setEditedBody('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleStartEditing = () => {
    setEditedBody(defaultBody);
    setIsEditing(true);
  };

  const handleResetBody = () => {
    setEditedBody(defaultBody);
  };

  if (!selectedRequest) return null;

  const subject = isApproval
    ? `Request approved: ${listingTitle}`
    : `Regarding your interest in ${listingTitle}`;

  // First-person copy for named senders
  const touchLine = isNamedSender
    ? 'I will be in touch shortly with next steps.'
    : `${selectedSender.name} will be in touch shortly with next steps.`;
  const reachOutLine = isNamedSender
    ? 'I will reach out to coordinate next steps'
    : `${selectedSender.name} from our team will reach out to coordinate next steps`;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto p-0 rounded-xl border-[#E5E5E5]">
        {/* Header */}
        <div className="px-8 pt-8 pb-0">
          <div className="flex items-center gap-3 mb-1.5">
            {isApproval ? (
              <div className="flex items-center justify-center h-8 w-8 rounded-full" style={{ backgroundColor: '#ECFDF5' }}>
                <CheckCircle className="h-4 w-4" style={{ color: '#10B981' }} />
              </div>
            ) : (
              <div className="flex items-center justify-center h-8 w-8 rounded-full" style={{ backgroundColor: '#FEF2F2' }}>
                <XCircle className="h-4 w-4" style={{ color: '#EF4444' }} />
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {isApproval ? 'Approve Request' : 'Decline Request'}
              </h2>
              <p className="text-[13px]" style={{ color: '#6B6B6B' }}>
                {isApproval
                  ? 'Review the email below, then approve and send.'
                  : 'Review the rejection email below, then confirm.'}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-8 flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="px-8 space-y-5">
          {/* Recipient + Deal - two column */}
          <div className="grid grid-cols-2 gap-6 py-4 border-y" style={{ borderColor: '#F0F0F0' }}>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: '#9A9A9A' }}>Recipient</p>
              <p className="text-sm font-medium text-foreground truncate">{userName}</p>
              <p className="text-[12px] mt-0.5 truncate" style={{ color: '#9A9A9A' }}>{userEmail}</p>
              {userCompany && (
                <p className="text-[12px] mt-0.5 truncate" style={{ color: '#9A9A9A' }}>{userCompany}</p>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: '#9A9A9A' }}>Deal</p>
              <p className="text-sm font-medium text-foreground truncate">{listingTitle}</p>
            </div>
          </div>

          {/* Sender selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: '#9A9A9A' }}>Send from</label>
            <Select value={senderEmail} onValueChange={setSenderEmail}>
              <SelectTrigger className="text-sm h-11 bg-white border-[#E5E5E5] hover:border-[#D0D0D0] transition-colors">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEAL_OWNER_SENDERS.map((sender) => (
                  <SelectItem key={sender.email} value={sender.email}>
                    <span className="font-medium">{sender.name}</span>
                    <span className="ml-1.5" style={{ color: '#9A9A9A' }}>({sender.email})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Email preview - full wrapper simulation */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: '#9A9A9A' }}>Email preview</p>
              {!isEditing ? (
                <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground px-2" onClick={handleStartEditing}>
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
              ) : (
                <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground px-2" onClick={handleResetBody}>
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
              )}
            </div>

            {/* Outer wrapper simulating wrapEmailHtml */}
            <div className="rounded-lg overflow-hidden" style={{ backgroundColor: '#FAFAF8', padding: '28px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.03)' }}>
              {/* SourceCo logo */}
              <div className="text-center mb-5">
                <img src={LOGO_URL} alt="SourceCo" style={{ height: '28px', width: 'auto', display: 'inline-block' }} />
              </div>

              {/* White card */}
              <div className="bg-white rounded-md overflow-hidden" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.04)' }}>
                {/* Email header */}
                <div className="px-6 py-4 space-y-2 border-b" style={{ borderColor: '#F0F0F0' }}>
                  <div className="flex items-baseline gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest w-[52px] shrink-0 text-right" style={{ color: '#B0B0B0' }}>From</span>
                    <span className="text-[13px] text-foreground">{selectedSender.name} &lt;{selectedSender.email}&gt;</span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest w-[52px] shrink-0 text-right" style={{ color: '#B0B0B0' }}>To</span>
                    <span className="text-[13px] text-foreground">{userName} &lt;{userEmail}&gt;</span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest w-[52px] shrink-0 text-right" style={{ color: '#B0B0B0' }}>Subject</span>
                    <span className="text-[13px] text-foreground font-medium">{subject}</span>
                  </div>
                </div>

                {/* Email body */}
                <div className="px-8 py-7">
                  {isEditing ? (
                    <Textarea
                      value={editedBody}
                      onChange={(e) => setEditedBody(e.target.value)}
                      className="min-h-[280px] text-[14px] leading-[1.7] font-normal resize-y border-[#E5E5E5] bg-white focus:border-foreground focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  ) : isApproval ? (
                    <div className="space-y-4 text-[14px] text-foreground" style={{ lineHeight: '1.7' }}>
                      <p>Your request for <strong>{listingTitle}</strong> has been approved.</p>
                      <p style={{ color: '#4A4A4A' }}>
                        You now have access to additional deal materials, detailed company information, including the real company name, and supporting documents. {touchLine}
                      </p>
                      <div className="pt-1">
                        <p className="font-semibold text-foreground mb-2.5">What to expect</p>
                        <ul className="space-y-2 pl-5" style={{ color: '#4A4A4A' }}>
                          <li className="list-disc">Access to the full deal profile, data room, and supporting materials</li>
                          <li className="list-disc">{reachOutLine}</li>
                          <li className="list-disc">Message us directly on the platform or reply to this email</li>
                        </ul>
                      </div>
                      <div className="pt-2 mt-2 border-t" style={{ borderColor: '#F0F0F0' }}>
                        <p className="text-[13px]" style={{ color: '#6B6B6B' }}>
                          This is an exclusive opportunity. We work with a small number of buyers per deal. Move at your own pace, but do not sit on it.
                        </p>
                      </div>
                      <div className="pt-1 text-center">
                        <span
                          className="inline-block text-[13px] font-semibold px-7 py-3 rounded-md cursor-default"
                          style={{ backgroundColor: '#0E101A', color: '#ffffff' }}
                        >
                          View Deal
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 text-[14px] text-foreground" style={{ lineHeight: '1.7' }}>
                      <p>Thank you for your interest in <strong>{listingTitle}</strong>.</p>
                      <p style={{ color: '#4A4A4A' }}>
                        After reviewing your profile against this specific opportunity, we have decided not to move forward at this time. We limit introductions to a small number of buyers per deal to ensure strong alignment on both sides.
                      </p>
                      <p style={{ color: '#4A4A4A' }}>
                        Your interest has been noted. If the situation changes, we will reach out directly.
                      </p>
                      <p style={{ color: '#4A4A4A' }}>
                        In the meantime, continue browsing the pipeline. New deals are added regularly and your next match may already be live.
                      </p>
                      <p className="pt-2" style={{ color: '#9A9A9A' }}>The SourceCo Team</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer simulating wrapEmailHtml footer */}
              <div className="text-center mt-5">
                <p className="text-[11px]" style={{ color: '#9B9B9B' }}>&copy; {new Date().getFullYear()} SourceCo</p>
              </div>
            </div>
          </div>

          {/* Admin note */}
          <div className="space-y-1.5">
            <label htmlFor="admin-comment" className="text-[11px] font-medium uppercase tracking-wider" style={{ color: '#9A9A9A' }}>
              {isApproval ? 'Internal note (optional)' : 'Rejection reason (optional)'}
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
              className="min-h-[80px] text-sm resize-none bg-white border-[#E5E5E5] focus:border-foreground focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-8 pb-8 pt-3">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
            className="w-full sm:w-auto h-11 border-[#E5E5E5] hover:bg-muted/50 rounded-lg"
            style={{ color: '#6B6B6B' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className="w-full sm:w-auto h-11 font-medium rounded-lg"
            style={
              isApproval
                ? { backgroundColor: '#0E101A', color: '#ffffff' }
                : { backgroundColor: '#DC2626', color: '#ffffff' }
            }
          >
            {isLoading ? (
              <>
                <Mail className="h-4 w-4 mr-2 animate-spin" />
                {isApproval ? 'Approving...' : 'Declining...'}
              </>
            ) : (
              <>
                {isApproval ? (
                  <CheckCircle className="h-4 w-4 mr-2" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                {isApproval ? 'Approve & Send Email' : 'Decline & Send Email'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}