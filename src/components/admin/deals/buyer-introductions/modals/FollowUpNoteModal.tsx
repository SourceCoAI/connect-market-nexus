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
import { MessageSquare } from 'lucide-react';

interface FollowUpNoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyerName: string;
  onConfirm: (notes: string) => void;
}

export function FollowUpNoteModal({
  open,
  onOpenChange,
  buyerName,
  onConfirm,
}: FollowUpNoteModalProps) {
  const [notes, setNotes] = useState('');

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setNotes('');
    }
  }, [open]);

  const handleConfirm = () => {
    const trimmed = notes.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Log Follow-up — {buyerName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label>
            Follow-up Notes <span className="text-destructive">*</span>
          </Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Left voicemail, will follow up next week..."
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!notes.trim()}>
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            Log Follow-up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
