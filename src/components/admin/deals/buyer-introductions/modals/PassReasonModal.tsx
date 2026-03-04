import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ThumbsDown } from 'lucide-react';

const PASS_REASONS = [
  'No Response',
  'Not a Fit — Size',
  'Not a Fit — Geography',
  'Not a Fit — Industry',
  'Timing Not Right',
  'Already in Another Deal',
  'Other',
] as const;

interface PassReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyerName: string;
  onConfirm: (reason: string, notes: string) => void;
}

export function PassReasonModal({ open, onOpenChange, buyerName, onConfirm }: PassReasonModalProps) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setReason('');
      setNotes('');
    }
  }, [open]);

  const handleConfirm = () => {
    if (!reason) return;
    const trimmedNotes = notes.trim();
    const finalReason = reason === 'Other' && trimmedNotes ? `Other: ${trimmedNotes}` : reason;
    // For "Other", notes are already captured in the reason string — don't duplicate
    onConfirm(finalReason, reason === 'Other' ? '' : trimmedNotes);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ThumbsDown className="h-4 w-4" />
            Mark {buyerName} as Passed
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>
              Pass Reason <span className="text-destructive">*</span>
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {PASS_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{reason === 'Other' ? 'Details (required)' : 'Notes (optional)'}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                reason === 'Other'
                  ? 'Please describe the reason...'
                  : 'Any additional notes...'
              }
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!reason || (reason === 'Other' && !notes.trim())}
            variant="destructive"
          >
            <ThumbsDown className="h-3.5 w-3.5 mr-1.5" />
            Mark as Passed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
