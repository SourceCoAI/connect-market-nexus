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
import { Mail, Phone, Linkedin, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

const CHANNELS = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'phone', label: 'Phone', icon: Phone },
  { value: 'linkedin', label: 'LinkedIn', icon: Linkedin },
] as const;

interface IntroduceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyerName: string;
  onConfirm: (channel: string, notes: string) => void;
}

export function IntroduceModal({ open, onOpenChange, buyerName, onConfirm }: IntroduceModalProps) {
  const [channel, setChannel] = useState('email');
  const [notes, setNotes] = useState('');

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setChannel('email');
      setNotes('');
    }
  }, [open]);

  const handleConfirm = () => {
    onConfirm(channel, notes.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Introduce {buyerName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Introduction Channel</Label>
            <div className="flex gap-2">
              {CHANNELS.map((ch) => {
                const Icon = ch.icon;
                return (
                  <Button
                    key={ch.value}
                    variant={channel === ch.value ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                      'flex-1 gap-1.5',
                      channel === ch.value && 'bg-blue-600 hover:bg-blue-700',
                    )}
                    onClick={() => setChannel(ch.value)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {ch.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Sent teaser via email..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} className="bg-blue-600 hover:bg-blue-700">
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Mark as Introduced
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
