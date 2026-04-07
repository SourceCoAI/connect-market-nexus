import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConnectionRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (message: string) => void;
  isSubmitting: boolean;
  listingTitle?: string;
}

const ConnectionRequestDialog = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  listingTitle,
}: ConnectionRequestDialogProps) => {
  const [message, setMessage] = useState('');

  const handleSubmit = () => {
    if (message.trim()) {
      onSubmit(message);
      setMessage('');
    }
  };

  const handleClose = () => {
    setMessage('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto z-[100] p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-lg font-medium tracking-tight">
            Request Access to This Deal
          </DialogTitle>
          <p className="text-sm" style={{ color: '#6B6B6B' }}>
            {listingTitle ? (
              <>
                Tell us why you're the right buyer for <span className="font-medium text-foreground">{listingTitle}</span>. We review
                every request and introduce 1–3 buyers. Your message is your pitch.
              </>
            ) : (
              "Tell us why you're the right buyer for this business. We review every request and introduce 1–3 buyers. Your message is your pitch."
            )}
          </p>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          <div>
            <label htmlFor="message" className="block text-sm font-medium mb-2">
              Why you're a strong fit *
            </label>
            <Textarea
              id="message"
              placeholder="e.g., We operate 3 HVAC businesses in the Southeast and are actively expanding. This business fits our existing infrastructure — we could integrate their ops within 90 days. Our last acquisition closed in Q3 at a similar size and we have capital ready to deploy."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="w-full resize-none rounded-lg bg-white text-sm border-[hsl(var(--border))] focus:border-foreground focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              required
              minLength={20}
              maxLength={500}
            />
            <div className="flex justify-between items-center mt-1.5">
              <p className="text-xs" style={{ color: '#9A9A9A' }}>
                Providing context helps business owners understand your interest and relevance.
              </p>
              <p className="text-xs" style={{ color: '#9A9A9A' }}>
                {message.length}/500 characters (min 20)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: '#6B6B6B' }}>
              How to get selected
            </p>
            <p className="text-sm" style={{ color: '#6B6B6B' }}>
              We typically receive 40–50 requests per deal and introduce 1–3 buyers. Strong requests
              explain your specific fit — your relevant experience, existing platforms, why this
              business makes sense for you strategically, and your ability to close. Generic
              messages rarely get selected. Specific ones do.
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto border-[hsl(var(--border))] hover:bg-muted"
            style={{ color: '#6B6B6B' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !message.trim() || message.length < 20 || message.length > 500}
            className="w-full sm:w-auto font-medium"
            style={{ backgroundColor: '#0E101A', color: '#ffffff' }}
          >
            {isSubmitting ? 'Sending...' : 'Send Request'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConnectionRequestDialog;
