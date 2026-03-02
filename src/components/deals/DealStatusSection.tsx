/**
 * DealStatusSection — Clean 4-stage progress indicator with current stage explanation.
 *
 * Replaces both DealNextSteps (horizontal icons) and DealProcessSteps (vertical timeline)
 * with a single, unified status display.
 */

import { cn } from '@/lib/utils';

interface DealStatusSectionProps {
  requestStatus: 'pending' | 'approved' | 'rejected';
  ndaSigned: boolean;
  feeCovered: boolean;
  feeStatus?: string;
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
  
  return 2; // Under review
}

export function DealStatusSection({
  requestStatus,
  ndaSigned,
  feeCovered,
  feeStatus,
}: DealStatusSectionProps) {
  const currentIndex = getCurrentStageIndex(requestStatus, ndaSigned, feeCovered, feeStatus);
  const isRejected = requestStatus === 'rejected';

  return (
    <div>
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
              {/* Bar segment */}
              <div
                className={cn(
                  'h-1 rounded-full transition-all duration-300',
                  isRejected ? 'bg-[#E5DDD0]' :
                  isComplete && isCurrent ? 'bg-[#DEC76B]' :
                  isComplete ? 'bg-[#0E101A]' :
                  'bg-[#F0EDE6]',
                )}
              />
              {/* Label */}
              <p className={cn(
                'text-[10px] mt-1.5 text-center font-medium',
                isRejected ? 'text-[#0E101A]/20' :
                isCurrent ? 'text-[#0E101A]' :
                isComplete ? 'text-[#0E101A]/50' :
                'text-[#0E101A]/20',
              )}>
                {stage.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
