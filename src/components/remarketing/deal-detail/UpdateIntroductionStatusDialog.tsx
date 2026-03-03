import { useState } from 'react';
import { useBuyerIntroductions } from '@/hooks/use-buyer-introductions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  User,
  Mail,
  Phone,
  Linkedin,
  Building2,
  Target,
  Calendar,
  CheckCircle,
  ThumbsDown,
  Send,
} from 'lucide-react';
import type {
  BuyerIntroduction,
  IntroductionStatus,
  UpdateBuyerIntroductionInput,
} from '@/types/buyer-introductions';

interface UpdateIntroductionStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyer: BuyerIntroduction;
  listingId: string;
}

export function UpdateIntroductionStatusDialog({
  open,
  onOpenChange,
  buyer,
  listingId,
}: UpdateIntroductionStatusDialogProps) {
  const { updateStatus, isUpdating } = useBuyerIntroductions(listingId);

  const [newStatus, setNewStatus] = useState<IntroductionStatus>(buyer.introduction_status);
  const [scheduledDate, setScheduledDate] = useState(buyer.introduction_scheduled_date || '');
  const [introductionNotes, setIntroductionNotes] = useState(buyer.introduction_notes || '');
  const [passedReason, setPassedReason] = useState(buyer.passed_reason || '');
  const [buyerFeedback, setBuyerFeedback] = useState(buyer.buyer_feedback || '');
  const [nextStep, setNextStep] = useState(buyer.next_step || '');
  const [expectedNextStepDate, setExpectedNextStepDate] = useState(
    buyer.expected_next_step_date || '',
  );

  const handleSubmit = () => {
    const updates: UpdateBuyerIntroductionInput = {
      introduction_status: newStatus,
    };

    if (newStatus === 'meeting_scheduled') {
      updates.introduction_scheduled_date = scheduledDate || undefined;
    }

    if (newStatus === 'not_a_fit') {
      updates.passed_date = new Date().toISOString().split('T')[0];
      updates.passed_reason = passedReason || undefined;
      updates.buyer_feedback = buyerFeedback || undefined;
    }

    if (newStatus === 'fit_and_interested') {
      updates.buyer_feedback = buyerFeedback || undefined;
      updates.next_step = nextStep || undefined;
      updates.expected_next_step_date = expectedNextStepDate || undefined;
      updates.introduction_notes = introductionNotes || undefined;
    }

    if (newStatus === 'outreach_initiated') {
      updates.introduction_notes = introductionNotes || undefined;
    }

    updateStatus(
      { id: buyer.id, updates },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  };

  const statusChanged = newStatus !== buyer.introduction_status;

  return (
    <Dialog open={open} onOpenChange={(v) => !isUpdating && onOpenChange(v)}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {buyer.buyer_name}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{buyer.buyer_firm_name}</p>
        </DialogHeader>

        {/* Buyer Info Summary */}
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            {buyer.buyer_email && (
              <a
                href={`mailto:${buyer.buyer_email}`}
                className="flex items-center gap-1 hover:text-foreground"
              >
                <Mail className="h-3 w-3" />
                {buyer.buyer_email}
              </a>
            )}
            {buyer.buyer_phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {buyer.buyer_phone}
              </span>
            )}
            {buyer.buyer_linkedin_url && (
              <a
                href={
                  buyer.buyer_linkedin_url.startsWith('http')
                    ? buyer.buyer_linkedin_url
                    : `https://${buyer.buyer_linkedin_url}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-foreground"
              >
                <Linkedin className="h-3 w-3" />
                LinkedIn
              </a>
            )}
          </div>
          {buyer.targeting_reason && (
            <p className="text-xs text-muted-foreground">
              <Target className="h-3 w-3 inline mr-1" />
              {buyer.targeting_reason}
            </p>
          )}
          {buyer.internal_champion && (
            <p className="text-xs text-muted-foreground">
              <User className="h-3 w-3 inline mr-1" />
              Champion: {buyer.internal_champion}
            </p>
          )}
        </div>

        {/* Status Update */}
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Update Status</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as IntroductionStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="outreach_initiated">
                  <span className="flex items-center gap-2">
                    <Send className="h-3.5 w-3.5 text-amber-600" />
                    Outreach Initiated
                  </span>
                </SelectItem>
                <SelectItem value="meeting_scheduled">
                  <span className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-blue-600" />
                    Meeting Scheduled
                  </span>
                </SelectItem>
                <SelectItem value="not_a_fit">
                  <span className="flex items-center gap-2">
                    <ThumbsDown className="h-3.5 w-3.5 text-slate-500" />
                    Not a Fit
                  </span>
                </SelectItem>
                <SelectItem value="fit_and_interested">
                  <span className="flex items-center gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                    Fit & Interested
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes (for outreach_initiated) */}
          {newStatus === 'outreach_initiated' && (
            <div className="space-y-2">
              <Label>Outreach Notes</Label>
              <Textarea
                value={introductionNotes}
                onChange={(e) => setIntroductionNotes(e.target.value)}
                placeholder="Details about the outreach..."
                rows={2}
              />
            </div>
          )}

          {/* Scheduled Date (for meeting_scheduled) */}
          {newStatus === 'meeting_scheduled' && (
            <div className="space-y-2">
              <Label>Meeting Date</Label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
          )}

          {/* Not a Fit Details */}
          {newStatus === 'not_a_fit' && (
            <div className="border-t pt-4 space-y-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Not a Fit Details
              </p>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  value={passedReason}
                  onChange={(e) => setPassedReason(e.target.value)}
                  placeholder="e.g. Not aligned on valuation, wrong geography..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Buyer Feedback</Label>
                <Textarea
                  value={buyerFeedback}
                  onChange={(e) => setBuyerFeedback(e.target.value)}
                  placeholder="What did the buyer say?"
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* Fit & Interested Details */}
          {newStatus === 'fit_and_interested' && (
            <div className="border-t pt-4 space-y-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Fit & Interested Details
              </p>
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                <p className="text-xs text-emerald-700">
                  This buyer will be moved to <strong>Buyers Introduced</strong> and a new{' '}
                  <strong>opportunity</strong> will be created in the deal pipeline.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Buyer Feedback</Label>
                <Textarea
                  value={buyerFeedback}
                  onChange={(e) => setBuyerFeedback(e.target.value)}
                  placeholder="What did the buyer say?"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Next Step</Label>
                <Input
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                  placeholder="e.g. Management presentation, LOI discussion"
                />
              </div>
              <div className="space-y-2">
                <Label>Expected Next Step Date</Label>
                <Input
                  type="date"
                  value={expectedNextStepDate}
                  onChange={(e) => setExpectedNextStepDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={introductionNotes}
                  onChange={(e) => setIntroductionNotes(e.target.value)}
                  placeholder="Additional context about the buyer's interest..."
                  rows={2}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdating}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isUpdating}>
            {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {statusChanged ? 'Update Status' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
