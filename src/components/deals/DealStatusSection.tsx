/**
 * DealStatusSection — Clean 4-stage progress indicator with stage explanation + timeline.
 */

import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface DealStatusSectionProps {
  requestStatus: 'pending' | 'approved' | 'rejected' | 'on_hold';
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
): number {
  if (status === 'rejected') return 0;
  if (status === 'approved') return 3;
  if (status === 'on_hold') return 2;
  const hasAnyAgreement = ndaSigned || feeCovered;
  if (!hasAnyAgreement) return 1;
  return 2;
}

function getStageExplanation(
  index: number,
  status: string,
): string {
  if (status === 'rejected') return 'This opportunity is no longer available at this time.';
  if (status === 'on_hold')
    return 'Your request is being evaluated. We\'ll notify you as soon as there\'s an update.';
  if (index === 3)
    return 'Great news - the owner selected your firm. Expect an email from our team shortly.';
  if (index === 1) {
    return 'Sign an agreement (NDA or Fee Agreement) to proceed. Your interest cannot be presented until at least one document is complete.';
  }
  return 'Your interest is being reviewed by our team. Once approved, you will receive access to deal materials and the data room. Expect to hear from us within 1-2 business days.';
}

export function DealStatusSection({
  requestStatus,
  ndaSigned,
  feeCovered,
  requestCreatedAt,
}: Omit<DealStatusSectionProps, 'feeStatus'>) {
  const currentIndex = getCurrentStageIndex(requestStatus, ndaSigned, feeCovered);
  const explanation = getStageExplanation(
    currentIndex,
    requestStatus,
  );
  const isRejected = requestStatus === 'rejected';

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
