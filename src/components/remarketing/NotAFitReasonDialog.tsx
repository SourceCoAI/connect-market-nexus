import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Ban } from 'lucide-react';

interface NotAFitReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealName: string;
  onConfirm: (reason: string) => void;
  isLoading?: boolean;
}

const PRESET_REASONS = [
  { value: 'no_call_no_show', label: 'No-call no-show' },
  { value: 'below_size', label: 'Below size threshold' },
  { value: 'owner_not_motivated', label: 'Owner not motivated' },
  { value: 'wrong_industry', label: 'Wrong industry' },
  { value: 'other', label: 'Other' },
] as const;

export const NotAFitReasonDialog = ({
  open,
  onOpenChange,
  dealName,
  onConfirm,
  isLoading = false,
}: NotAFitReasonDialogProps) => {
  const [selectedReason, setSelectedReason] = useState<string>('no_call_no_show');
  const [customReason, setCustomReason] = useState('');

  const handleConfirm = () => {
    const preset = PRESET_REASONS.find((r) => r.value === selectedReason);
    const reason =
      selectedReason === 'other' ? customReason.trim() || 'Other' : (preset?.label ?? 'Other');
    onConfirm(reason);
    setSelectedReason('no_call_no_show');
    setCustomReason('');
  };

  const handleClose = () => {
    setSelectedReason('no_call_no_show');
    setCustomReason('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-orange-500" />
            Mark as Not a Fit
          </DialogTitle>
          <DialogDescription>
            Mark <span className="font-medium">{dealName}</span> as not a fit. The deal will be
            hidden from default views but can always be retrieved.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <RadioGroup value={selectedReason} onValueChange={setSelectedReason}>
            {PRESET_REASONS.map((reason) => (
              <div
                key={reason.value}
                className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                onClick={() => setSelectedReason(reason.value)}
              >
                <RadioGroupItem value={reason.value} id={`naf-${reason.value}`} />
                <Label htmlFor={`naf-${reason.value}`} className="cursor-pointer flex-1">
                  {reason.label}
                </Label>
              </div>
            ))}
          </RadioGroup>

          {selectedReason === 'other' && (
            <div>
              <Label htmlFor="custom-reason" className="text-sm font-medium">
                Reason (optional)
              </Label>
              <Textarea
                id="custom-reason"
                placeholder="Enter reason..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="mt-1.5"
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isLoading ? 'Saving...' : 'Mark Not a Fit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
