import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface OnboardingPopupProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const OnboardingPopup = ({ isOpen, onClose, userId }: OnboardingPopupProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isCompleting, setIsCompleting] = useState(false);

  const handleClose = async () => {
    setIsCompleting(true);

    try {
      // Single UPDATE call — returns empty if user not found or already completed
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', userId)
        .eq('onboarding_completed', false);

      if (updateError) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to save your onboarding status. Please try again.',
        });
        // Fallback: mark in localStorage so popup doesn't loop forever
        localStorage.setItem(`sourceco_onboarding_done_${userId}`, 'true');
        setIsCompleting(false);
        onClose();
        return;
      }
      // Show success message
      toast({
        title: "You're in.",
        description: 'Browse deals, save listings, and request access when you see a fit.',
      });

      // Close popup after successful update
      onClose();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Something went wrong. Please try again or contact support.',
      });
      setIsCompleting(false);
    }
  };

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}} modal={true}>
      <DialogContent className="sm:max-w-[480px] p-0 gap-0 bg-white border-none shadow-[0_20px_40px_-8px_rgba(0,0,0,0.2)] overflow-hidden">
        {/* Header */}
        <div className="relative bg-white border-b border-slate-100">
          <div className="flex justify-between items-center px-6 py-4">
            <div className="flex space-x-1">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={`h-1 w-12 rounded-full transition-all duration-300 ${
                    step <= currentStep ? 'bg-slate-900' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full"
              onClick={handleClose}
              disabled={isCompleting}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white px-6 py-6">
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h1 className="text-xl font-semibold text-slate-900">Two Types of Deals</h1>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Every listing on SourceCo is either For Sale or Off Market. Here's the difference.
                </p>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                    <span className="text-xs font-medium text-green-700 uppercase tracking-wide">
                      FOR SALE
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">
                    Owner is actively looking to exit. Verified financials and a complete data room
                    are ready. Seller has approved the listing for qualified buyer outreach.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                    <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">
                      OFF MARKET
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">
                    Owner isn't publicly advertising but is open to the right conversation. You're
                    getting in before this deal ever reaches a broker or marketplace.
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h1 className="text-xl font-semibold text-slate-900">How We Source Deals</h1>
                <p className="text-sm text-slate-600 leading-relaxed">
                  We go direct to owners — no brokers, no auctions, no stale listings.
                </p>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                <p className="text-sm text-slate-700">
                  Sellers don't pay us to be on the platform. That keeps the deal quality high —
                  owners are here because they trust us, not because they paid for a listing.
                </p>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                <p className="text-sm text-slate-700">
                  We add new deals every week. Set up a deal alert and we'll notify you when
                  something matches your criteria.
                </p>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h1 className="text-xl font-semibold text-slate-900">
                  You Only Pay if a Deal Closes
                </h1>
                <p className="text-sm text-slate-600 leading-relaxed">
                  No retainers, no platform fees, no exclusivity. Our fee is success-only.
                </p>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                <p className="text-sm text-slate-700">
                  Our fee is based on a modified Lehman scale — a percentage of the deal value, paid
                  only at close. You'll be asked to sign a fee agreement before your first
                  connection request. It covers all deals you close through SourceCo, not just one.
                </p>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                <p className="text-sm text-slate-700">
                  You'll sign a brief fee agreement before your first deal introduction — it takes
                  about 60 seconds. No payment is collected upfront; the agreement simply confirms
                  our success-only fee structure.
                </p>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-center">
                  <p className="text-xs font-medium text-slate-700">No Platform Fees</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-center">
                  <p className="text-xs font-medium text-slate-700">No Exclusivity</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-center">
                  <p className="text-xs font-medium text-slate-700">No Retainers</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-center">
                  <p className="text-xs font-medium text-slate-700">Success-Only</p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-5">
              <div className="text-center space-y-2">
                <h1 className="text-xl font-semibold text-slate-900">How to Get Selected</h1>
                <p className="text-sm text-slate-600 leading-relaxed">
                  We get 40–50 requests per deal and introduce 1–3 buyers. Here's what actually
                  works.
                </p>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                <p className="text-sm text-slate-700">
                  <span className="font-medium">Be specific about fit.</span> Which platform
                  companies do you own? Why does this business make sense for you strategically?
                  Generic messages — "this looks interesting" — don't get selected. Specific ones
                  do.
                </p>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                <p className="text-sm text-slate-700">
                  <span className="font-medium">Your NDA</span> — if you signed it during
                  onboarding, you're covered for every deal. If not, you'll be prompted when you
                  first try to view deal details. Takes about 60 seconds.
                </p>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                <p className="text-sm text-slate-700">
                  <span className="font-medium">Your fee agreement</span> — when you submit your
                  first connection request, you'll be asked to sign a fee agreement if your firm
                  hasn't already. It covers our success-only fee — nothing is owed unless a deal
                  closes.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="bg-slate-50 border-t border-slate-100 px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {currentStep > 1 && (
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 h-8 px-3 text-sm"
                  disabled={isCompleting}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </Button>
              )}
            </div>

            <Button
              onClick={handleNext}
              className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors h-8"
              disabled={isCompleting}
            >
              {isCompleting ? 'Completing...' : currentStep === 4 ? 'Start Exploring' : 'Next'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingPopup;
