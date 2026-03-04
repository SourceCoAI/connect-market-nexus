/**
 * DealStatusSection — Clean 4-stage progress indicator with stage explanation + timeline.
 */

import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface DealStatusSectionProps {
  requestStatus: 'pending' | 'approved' | 'rejected';
  ndaSigned: boolean;
  feeCovered: boolean;
  feeStatus?: string;
  requestCreatedAt?: string;
}

const STAGES = [
  { id: 'interested', label: 'Interested' },
  { id: 'documents', label: 'Documents' },
  { id: 'review', label: 'Review' },
  { id: 'connected', label: 'Connected' },
] as const;

function getCurrentStageIndex(
  status: string,
  ndaSigned: boolean,
  feeCovered: boolean,
  feeStatus?: string,
): number {
  if (status === 'rejected') return 0;
  if (status === 'approved') return 3;
  const needsFee = feeStatus === 'sent' && !feeCovered;
  if (!ndaSigned || needsFee) return 1;
  return 2;
}

function getStageExplanation(
  index: number,
  isRejected: boolean,
  ndaSigned: boolean,
  feeCovered: boolean,
  feeStatus?: string,
): string {
  if (isRejected) return 'The owner selected another buyer for this opportunity.';
  if (index === 3)
    return 'Great news — the owner selected your firm. Expect an email from our team shortly.';
  if (index === 1) {
    if (!ndaSigned)
      return 'Sign your NDA to proceed. Your interest cannot be presented until documents are complete.';
    if (feeStatus === 'sent' && !feeCovered)
      return 'Your Fee Agreement is ready for signature. Complete this to finalize your documentation.';
    return 'Complete your required documents to move forward.';
  }
  return 'Your interest is being presented to the owner alongside other qualified buyers. Decisions typically take 3–7 business days.';
}

export function DealStatusSection({
  requestStatus,
  ndaSigned,
  feeCovered,
  feeStatus,
  requestCreatedAt,
}: DealStatusSectionProps) {
  const currentIndex = getCurrentStageIndex(requestStatus, ndaSigned, feeCovered, feeStatus);
  const isRejected = requestStatus === 'rejected';
  const explanation = getStageExplanation(
    currentIndex,
    isRejected,
    ndaSigned,
    feeCovered,
    feeStatus,
  );

  return (
    <div className="rounded-lg border border-[#F0EDE6] bg-white p-5">
      <h3 className="text-[10px] font-semibold text-[#0E101A]/30 uppercase tracking-[0.12em] mb-4">
        Deal Progress
      </h3>

      {/* Progress bar */}
      <div className="flex items-center gap-1">
        {STAGES.map((stage, i) => {
          const isComplete = i <= currentIndex;
          const isCurrent = i === currentIndex;

          return (
            <div key={stage.id} className="flex-1">
              <div
                className={cn(
                  'h-1 rounded-full transition-all duration-300',
                  isRejected
                    ? 'bg-[#E5DDD0]'
                    : isComplete && isCurrent
                      ? 'bg-[#DEC76B]'
                      : isComplete
                        ? 'bg-[#0E101A]'
                        : 'bg-[#F0EDE6]',
                )}
              />
              <p
                className={cn(
                  'text-[10px] mt-1.5 text-center font-medium',
                  isRejected
                    ? 'text-[#0E101A]/20'
                    : isCurrent
                      ? 'text-[#0E101A]'
                      : isComplete
                        ? 'text-[#0E101A]/50'
                        : 'text-[#0E101A]/20',
                )}
              >
                {stage.label}
              </p>
            </div>
          );
        })}
      </div>

      {/* Stage explanation */}
      <p className="text-[12px] text-[#0E101A]/50 leading-relaxed mt-4">{explanation}</p>

      {/* Timeline estimate for review stage */}
      {currentIndex === 2 && requestCreatedAt && (
        <p className="text-[11px] text-[#0E101A]/30 mt-1.5">
          In review for {formatDistanceToNow(new Date(requestCreatedAt))}
        </p>
      )}
    </div>
  );
}
