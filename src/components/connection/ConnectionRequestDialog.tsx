import { useState, useCallback } from 'react';
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
import { useAuth } from '@/contexts/AuthContext';
import { getProfileCompletionDetails } from '@/lib/buyer-metrics';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ConnectionRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (message: string) => void;
  isSubmitting: boolean;
  listingTitle?: string;
  listingId?: string;
}

const ConnectionRequestDialog = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  listingTitle,
  listingId,
}: ConnectionRequestDialogProps) => {
  const [message, setMessage] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [hasUsedAI, setHasUsedAI] = useState(false);
  const { user } = useAuth();

  const profileDetails = user ? getProfileCompletionDetails(user) : null;
  const isProfileLow = profileDetails ? profileDetails.percentage < 60 : false;

  const handleSubmit = () => {
    if (message.trim()) {
      onSubmit(message);
      setMessage('');
      setHasUsedAI(false);
      setDraftError(null);
    }
  };

  const handleClose = () => {
    setMessage('');
    setHasUsedAI(false);
    setDraftError(null);
    onClose();
  };

  const handleAIDraft = useCallback(async () => {
    if (!listingId) return;
    setIsDrafting(true);
    setDraftError(null);

    try {
      const { data, error } = await supabase.functions.invoke('draft-connection-message', {
        body: { listingId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setMessage(data.message || '');
      setHasUsedAI(true);
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : 'Failed to generate draft. Please try writing manually.';
      setDraftError(errMsg);
    } finally {
      setIsDrafting(false);
    }
  }, [listingId]);

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
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="message" className="block text-sm font-medium">
                Why you're a strong fit *
              </label>
              {listingId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAIDraft}
                  disabled={isDrafting || isSubmitting}
                  className="text-xs gap-1.5 h-7 px-2.5 border-purple-200 text-purple-700 hover:bg-purple-50 hover:text-purple-800"
                >
                  {isDrafting ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Drafting...
                    </>
                  ) : hasUsedAI ? (
                    <>
                      <RefreshCw className="h-3 w-3" />
                      Regenerate
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" />
                      Draft with AI
                    </>
                  )}
                </Button>
              )}
            </div>
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
                {hasUsedAI
                  ? 'AI-generated draft — edit it to add your voice before sending.'
                  : 'Providing context helps business owners understand your interest and relevance.'}
              </p>
              <p className="text-xs text-muted-foreground">
                {message.length}/500 characters (min 20)
              </p>
            </div>
          </div>

          {draftError && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">{draftError}</p>
            </div>
          )}

          {isProfileLow && hasUsedAI && profileDetails && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1.5">
              <p className="text-sm font-medium text-amber-900">
                Your draft would be stronger with more profile data
              </p>
              <p className="text-xs text-amber-800">
                {profileDetails.missingFieldLabels.length > 0
                  ? `Adding ${profileDetails.missingFieldLabels.slice(0, 3).join(', ')} would help the AI write a more compelling, specific message.`
                  : 'Completing your profile helps generate more specific, compelling messages.'}
              </p>
              <Link
                to="/welcome"
                target="_blank"
                className="inline-flex items-center text-xs font-medium text-amber-700 hover:text-amber-900 underline"
              >
                Update your profile →
              </Link>
            </div>
          )}

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
