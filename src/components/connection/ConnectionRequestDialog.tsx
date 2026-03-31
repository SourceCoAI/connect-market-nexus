import { useState } from 'react';
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
        className="sm:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto z-[100]"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Request Access to This Deal</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {listingTitle && (
              <>
                Tell us why you're the right buyer for <strong>{listingTitle}</strong>. We review
                every request and introduce 1–3 buyers. Your message is your pitch.
              </>
            )}
            {!listingTitle &&
              "Tell us why you're the right buyer for this business. We review every request and introduce 1–3 buyers. Your message is your pitch."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
              className="w-full resize-none"
              required
              minLength={20}
            />
            <div className="flex justify-between items-center mt-1">
              <p className="text-xs text-muted-foreground">
                Providing context helps business owners understand your interest and relevance.
              </p>
              <p className="text-xs text-muted-foreground">
                {message.length}/500 characters (min 20)
              </p>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
            <p className="text-sm font-medium text-blue-900">How to get selected:</p>
            <p className="text-sm text-blue-800">
              We typically receive 40–50 requests per deal and introduce 1–3 buyers. Strong requests
              explain your specific fit — your relevant experience, existing platforms, why this
              business makes sense for you strategically, and your ability to close. Generic
              messages rarely get selected. Specific ones do.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !message.trim() || message.length < 20}
            className="w-full sm:w-auto bg-sourceco hover:bg-sourceco/90 text-sourceco-foreground border-0 hover:shadow-lg font-semibold"
          >
            {isSubmitting ? 'Sending...' : 'Send Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConnectionRequestDialog;
