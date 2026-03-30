/**
 * ApprovalSection.tsx
 *
 * Decision banner (pending), status banners (approved / rejected / on_hold),
 * and the reject confirmation dialog.
 */
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Shield,
  CheckCircle,
  XCircle,
  Undo2,
  Scale,
  Clock,
} from 'lucide-react';
import type { ConnectionRequestActionsProps } from './types';

interface ApprovalSectionProps {
  requestId?: string;
  requestStatus: NonNullable<ConnectionRequestActionsProps['requestStatus']>;
  buyerName: string;
  firmName: string;
  listingTitle?: string;
  // Handlers
  handleAccept: () => void;
  handleReject: () => void;
  handleResetToPending: () => void;
  handleOnHold?: () => void;
  // Mutation states
  isStatusPending: boolean;
  isRejecting: boolean;
  // Reject dialog
  showRejectDialog: boolean;
  setShowRejectDialog: (open: boolean) => void;
  rejectNote: string;
  setRejectNote: (note: string) => void;
  // Flag button rendered inline in the pending banner — passed as a render prop
  flagButton?: React.ReactNode;
}

export function ApprovalSection({
  requestId,
  requestStatus,
  buyerName,
  firmName,
  listingTitle,
  handleAccept,
  handleReject,
  handleResetToPending,
  handleOnHold,
  isStatusPending,
  isRejecting,
  showRejectDialog,
  setShowRejectDialog,
  rejectNote,
  setRejectNote,
  flagButton,
}: ApprovalSectionProps) {
  if (!requestId) return null;

  return (
    <>
      {/* ── DECISION BANNER ── */}
      {requestStatus === 'pending' && (
        <div className="bg-sourceco-muted rounded-xl overflow-hidden shadow-md border border-sourceco/30">
          <div className="px-6 py-5 flex items-center justify-between gap-6">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-sourceco/20 flex items-center justify-center shrink-0">
                <Scale className="h-6 w-6 text-sourceco" />
              </div>
              <div>
                <p className="text-lg font-extrabold text-foreground tracking-tight">
                  Decision Required
                </p>
                <p className="text-sm text-muted-foreground">
                  Review this connection request — only approved requests advance to the active
                  pipeline
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Button
                onClick={handleAccept}
                disabled={isStatusPending}
                className="bg-sourceco text-foreground font-bold shadow-sm hover:bg-sourceco/90 h-10 px-5 text-sm"
              >
                <CheckCircle className="h-4 w-4 mr-1.5" />
                Accept Request
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRejectDialog(true)}
                disabled={isStatusPending}
                className="border-foreground/20 text-foreground bg-transparent hover:bg-foreground/5 h-10 px-5 text-sm"
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                Decline
              </Button>
              {handleOnHold && (
                <Button
                  variant="outline"
                  onClick={handleOnHold}
                  disabled={isStatusPending}
                  className="border-amber-300 text-amber-700 bg-transparent hover:bg-amber-50 h-10 px-5 text-sm"
                >
                  <Clock className="h-4 w-4 mr-1.5" />
                  On Hold
                </Button>
              )}
              {flagButton}
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-foreground/5 rounded-full px-4 py-1.5">
                Awaiting Action
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Status banner — approved */}
      {requestStatus === 'approved' && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-800">Request Approved</p>
              <p className="text-xs text-emerald-700">This buyer has been moved to the pipeline.</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetToPending}
            disabled={isStatusPending}
            className="text-xs h-7 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-200/50"
          >
            <Undo2 className="h-3 w-3 mr-1" /> Undo
          </Button>
        </div>
      )}

      {/* Status banner — rejected */}
      {requestStatus === 'rejected' && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center">
              <XCircle className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-800">Request Declined</p>
              <p className="text-xs text-red-700">This buyer has been notified.</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetToPending}
            disabled={isStatusPending}
            className="text-xs h-7 text-red-700 hover:text-red-800 hover:bg-red-200/50"
          >
            <Undo2 className="h-3 w-3 mr-1" /> Undo
          </Button>
        </div>
      )}

      {/* Status banner — on hold (Phase 95 + 97: add Accept/Decline alongside Undo) */}
      {requestStatus === 'on_hold' && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-amber-600 flex items-center justify-center">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-800">On Hold</p>
              <p className="text-xs text-amber-700">This request is paused for review.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleAccept}
              disabled={isStatusPending}
              className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs h-7 px-3"
            >
              <CheckCircle className="h-3 w-3 mr-1" /> Accept
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRejectDialog(true)}
              disabled={isStatusPending}
              className="text-xs h-7 px-3 border-red-200 text-red-700 hover:bg-red-50"
            >
              <XCircle className="h-3 w-3 mr-1" /> Decline
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetToPending}
              disabled={isStatusPending}
              className="text-xs h-7 text-amber-700 hover:text-amber-800 hover:bg-amber-200/50"
            >
              <Undo2 className="h-3 w-3 mr-1" /> Undo
            </Button>
          </div>
        </div>
      )}

      {/* ── REJECT CONFIRMATION DIALOG ── */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Reject this request?</DialogTitle>
            <DialogDescription className="text-sm">
              <span className="font-medium text-foreground">{buyerName}</span> from{' '}
              <span className="font-medium text-foreground">{firmName || 'Unknown Firm'}</span> will
              be notified that their connection request
              {listingTitle ? ` for "${listingTitle}"` : ''} was not approved. This action can be
              undone.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Add a reason for rejecting (optional)..."
            className="min-h-[80px] resize-none text-sm"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setRejectNote('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isStatusPending || isRejecting}
              className="bg-red-600 hover:bg-red-700"
            >
              <XCircle className="h-4 w-4 mr-2" /> {isRejecting ? 'Rejecting...' : 'Reject Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
