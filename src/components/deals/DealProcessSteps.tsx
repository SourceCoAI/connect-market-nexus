import { cn } from '@/lib/utils';
import { Info, Clock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DealReviewPanel } from './DealReviewPanel';
import { WhileYouWaitChecklist } from './WhileYouWaitChecklist';
import { PostRejectionPanel } from './PostRejectionPanel';

interface ProcessStep {
  id: string;
  label: string;
  description: string;
  status: 'completed' | 'active' | 'pending';
}

interface DealProcessStepsProps {
  requestStatus: 'pending' | 'approved' | 'rejected';
  className?: string;
  requestId?: string;
  userMessage?: string | null;
  onMessageUpdate?: (message: string) => Promise<void>;
  isProfileComplete?: boolean;
  profileCompletionPercentage?: number;
  listingCategory?: string;
  listingLocation?: string;
  requestCreatedAt?: string;
}

export function DealProcessSteps({
  requestStatus,
  className,
  requestId,
  userMessage,
  onMessageUpdate,
  isProfileComplete = false,
  profileCompletionPercentage = 0,
  listingCategory,
  listingLocation,
  requestCreatedAt,
}: DealProcessStepsProps) {
  // Normalize various backend statuses into UI buckets
  const normalizeStatus = (status: string | undefined): 'pending' | 'approved' | 'rejected' => {
    if (!status) return 'pending';
    const s = status.toLowerCase();
    if (['approved', 'accepted'].includes(s)) return 'approved';
    if (['rejected', 'declined'].includes(s)) return 'rejected';
    // Treat everything else as pending: 'pending', 'under_review', 'submitted', 'processing', etc.
    return 'pending';
  };
  const normalizedStatus = normalizeStatus(requestStatus);
  const getSteps = (): ProcessStep[] => {
    switch (normalizedStatus) {
      case 'pending':
        return [
          {
            id: 'submitted',
            label: 'Submitted',
            description: 'Request received',
            status: 'completed',
          },
          {
            id: 'review',
            label: 'Under Review',
            description:
              "We're presenting your profile to the business owner alongside other qualified buyers. The owner will review all interested parties and select the buyer that best aligns with their strategic goals and transaction preferences.",
            status: 'active',
          },
          {
            id: 'decision',
            label: 'Selection',
            description:
              "The owner is making their selection from all qualified buyers. You'll be notified once a decision is made.",
            status: 'pending',
          },
        ];
      case 'approved':
        return [
          {
            id: 'submitted',
            label: 'Submitted',
            description: 'Request received',
            status: 'completed',
          },
          {
            id: 'review',
            label: 'Under Review',
            description: 'Your profile was presented alongside other qualified buyers',
            status: 'completed',
          },
          {
            id: 'approved',
            label: 'Connected',
            description:
              'Great news! The owner selected your firm. Expect an email from us in your inbox shortly with next steps and opportunity details.',
            status: 'completed',
          },
        ];
      case 'rejected':
        return [
          {
            id: 'submitted',
            label: 'Submitted',
            description: 'Request received',
            status: 'completed',
          },
          {
            id: 'review',
            label: 'Under Review',
            description: 'Your profile was presented to the owner alongside other qualified buyers',
            status: 'completed',
          },
          {
            id: 'declined',
            label: 'Not Selected',
            description:
              'The owner has decided on the best fit for their specific objectives. We encourage you to explore other opportunities on the marketplace.',
            status: 'completed',
          },
        ];
      default:
        // Fallback for undefined or invalid status
        return [
          {
            id: 'submitted',
            label: 'Submitted',
            description: 'Request received',
            status: 'completed',
          },
          {
            id: 'review',
            label: 'Under Review',
            description: 'Processing your request',
            status: 'active',
          },
        ];
    }
  };

  const steps = getSteps();

  const getStatusMessage = () => {
    switch (normalizedStatus) {
      case 'pending':
        return {
          title: 'Competitive Selection Process',
          message:
            "You're being presented to the owner alongside other qualified buyers. The owner will review all interested parties and select the buyer that best fits their strategic objectives. This is a competitive process—not a qualification review.",
          action: true,
        };
      case 'approved':
        return {
          title: 'Connected',
          message:
            'The owner selected your firm from the pool of qualified buyers. Our team will be in touch with next steps shortly.',
          action: false,
        };
      case 'rejected':
        return {
          title: 'Not Selected',
          message:
            'The owner has made their selection for this opportunity. This is part of our competitive selection process—we encourage you to explore other opportunities that may be an even better strategic fit.',
          action: false,
        };
      default:
        return {
          title: 'Processing',
          message: 'Your request is being processed.',
          action: false,
        };
    }
  };
  void getStatusMessage;

  return (
    <TooltipProvider>
      <div className={cn('space-y-8', className)}>
        {/* Progress Steps - Minimal Design */}
        <div className="space-y-4" role="list" aria-label="Request progress">
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;

            return (
              <div key={step.id} className="relative flex gap-3.5" role="listitem">
                {/* Connector Line */}
                {!isLast && (
                  <div
                    className={cn(
                      'absolute left-[9px] top-6 w-px h-[calc(100%+1rem)]',
                      step.status === 'completed' ? 'bg-gray-900' : 'bg-gray-200',
                    )}
                    aria-hidden="true"
                  />
                )}

                {/* Step Indicator */}
                <div
                  className={cn(
                    'relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all duration-300',
                    step.status === 'completed' && step.id !== 'declined' && 'bg-gray-900',
                    step.status === 'completed' && step.id === 'declined' && 'bg-gray-300',
                    step.status === 'active' && 'bg-white ring-2 ring-gray-900 ring-offset-2',
                    step.status === 'pending' && 'bg-gray-100',
                  )}
                >
                  {step.status === 'completed' && <div className="w-2 h-2 rounded-full bg-white" />}
                  {step.status === 'active' && <div className="w-2 h-2 rounded-full bg-gray-900" />}
                  {step.status === 'pending' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                  )}
                </div>

                {/* Step Content */}
                <div className="flex-1 pb-1 pt-px">
                  <div className="flex items-center gap-2">
                    <h4
                      className={cn(
                        'text-sm font-semibold tracking-tight',
                        step.status === 'completed' && 'text-gray-900',
                        step.status === 'active' && 'text-gray-900',
                        step.status === 'pending' && 'text-gray-400',
                      )}
                    >
                      {step.label}
                    </h4>

                    {/* Tooltip for Under Review */}
                    {step.id === 'review' && (
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <button className="inline-flex items-center justify-center hover:bg-gray-100 rounded-full p-1 transition-colors">
                            <Info
                              className="w-4 h-4 text-gray-500 hover:text-gray-700"
                              strokeWidth={2}
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          className="max-w-sm bg-gray-900 text-white border-gray-800 p-4"
                          sideOffset={8}
                        >
                          <div className="space-y-2.5 text-xs leading-relaxed">
                            <p className="font-semibold text-white">
                              Understanding our selection process
                            </p>
                            <p className="text-gray-200">
                              We present qualified buyers to sellers one at a time or in small
                              groups. The owner evaluates all interested buyers and selects the one
                              that best aligns with their goals.
                            </p>
                            <p className="text-gray-200">
                              This approach protects everyone's time and ensures a collaborative
                              process. Because we can't guarantee a seller will choose any specific
                              buyer, we encourage you to stay active and explore multiple
                              opportunities.
                            </p>
                            <p className="text-gray-200">
                              Your qualification to be on the platform means you're a serious
                              buyer—selection is about strategic fit for this particular deal, not
                              your overall qualifications.
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {/* Tooltip for Not Selected */}
                    {step.id === 'declined' && (
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <button className="inline-flex items-center justify-center hover:bg-gray-100 rounded-full p-1 transition-colors">
                            <Info
                              className="w-4 h-4 text-gray-500 hover:text-gray-700"
                              strokeWidth={2}
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          className="max-w-sm bg-gray-900 text-white border-gray-800 p-4"
                          sideOffset={8}
                        >
                          <div className="space-y-2.5 text-xs leading-relaxed">
                            <p className="font-semibold text-white">Why "Not Selected"?</p>
                            <p className="text-gray-200">
                              The owner reviewed multiple qualified buyers and selected the one that
                              best matched their specific strategic goals, timeline, and transaction
                              structure preferences for this deal.
                            </p>
                            <p className="text-gray-200">
                              This decision reflects deal-specific fit, not your qualifications as a
                              buyer. We encourage you to continue exploring opportunities where your
                              investment approach may be the perfect match.
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>

                  <p
                    className={cn(
                      'text-sm leading-relaxed mt-1',
                      step.status === 'completed' && 'text-gray-600',
                      step.status === 'active' && 'text-gray-600',
                      step.status === 'pending' && 'text-gray-400',
                    )}
                  >
                    {step.description}
                  </p>

                  {/* Inline Review Panel for Active Under Review Step */}
                  {step.id === 'review' &&
                    step.status === 'active' &&
                    normalizedStatus === 'pending' && (
                      <>
                        {/* Timeline Estimate */}
                        <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-[#FCF9F0] border border-[#E5DDD0] rounded-lg">
                          <Clock className="h-3.5 w-3.5 text-[#0E101A] shrink-0" />
                          <p className="text-xs text-[#0E101A]/70">
                            {requestCreatedAt &&
                            Date.now() - new Date(requestCreatedAt).getTime() >
                              7 * 24 * 60 * 60 * 1000
                              ? "This is taking a little longer than usual. We'll notify you as soon as a decision is made."
                              : "Decisions like this typically take 3–7 business days. We'll notify you as soon as the owner makes their selection."}
                          </p>
                        </div>

                        <DealReviewPanel
                          requestId={requestId || ''}
                          userMessage={userMessage ?? null}
                          onMessageUpdate={onMessageUpdate!}
                          isProfileComplete={isProfileComplete}
                          profileCompletionPercentage={profileCompletionPercentage}
                        />

                        {/* While You Wait Checklist */}
                        <WhileYouWaitChecklist
                          listingCategory={listingCategory}
                          listingLocation={listingLocation}
                        />
                      </>
                    )}

                  {/* Post-Rejection Re-Engagement Panel */}
                  {step.id === 'declined' && normalizedStatus === 'rejected' && (
                    <PostRejectionPanel
                      listingCategory={listingCategory}
                      listingLocation={listingLocation}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
