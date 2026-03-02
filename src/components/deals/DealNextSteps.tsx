/**
 * DealNextSteps — Read-only progress indicator with clean checkmarks.
 *
 * Shows a linear checklist of deal milestones. Signing actions have been
 * moved to the page-level AccountStatusBar, so this component is purely
 * a status display with green checkmarks for completed items.
 */

import { Check, Lock, FileText, Shield, FileSignature, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface DealNextStepsProps {
  requestCreatedAt: string;
  ndaSigned: boolean;
  feeCovered: boolean;
  feeStatus?: string;
  requestStatus: 'pending' | 'approved' | 'rejected';
}

interface StepItem {
  id: string;
  icon: typeof Check;
  title: string;
  subtitle: string;
  state: 'done' | 'pending' | 'locked';
}

export function DealNextSteps({
  requestCreatedAt,
  ndaSigned,
  feeCovered,
  feeStatus,
  requestStatus,
}: DealNextStepsProps) {
  const showFeeStep = feeCovered || feeStatus === 'sent';

  const steps: StepItem[] = [
    {
      id: 'interest',
      icon: Send,
      title: 'Interest Expressed',
      subtitle: `${formatDistanceToNow(new Date(requestCreatedAt), { addSuffix: true })}`,
      state: 'done',
    },
    {
      id: 'nda',
      icon: Shield,
      title: 'NDA Signed',
      subtitle: ndaSigned ? 'Non-Disclosure Agreement signed' : 'Awaiting signature',
      state: ndaSigned ? 'done' : 'pending',
    },
  ];

  if (showFeeStep) {
    steps.push({
      id: 'fee',
      icon: FileSignature,
      title: 'Fee Agreement',
      subtitle: feeCovered ? 'Fee Agreement signed' : 'Awaiting signature',
      state: feeCovered ? 'done' : 'pending',
    });
  }

  const memoUnlocked = ndaSigned && requestStatus === 'approved';
  steps.push({
    id: 'deal_memo',
    icon: FileText,
    title: 'Deal Memo',
    subtitle: memoUnlocked
      ? 'Available for review'
      : 'Available after NDA + approval',
    state: memoUnlocked ? 'done' : 'locked',
  });

  return (
    <div>
      <h3 className="text-[11px] font-semibold text-[#0E101A]/40 uppercase tracking-[0.1em] mb-4">
        Deal Progress
      </h3>
      <div className="flex items-start gap-0">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          return (
            <div key={step.id} className={cn('flex-1 flex flex-col items-center text-center', !isLast && 'relative')}>
              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    'absolute top-3.5 left-[calc(50%+14px)] right-[calc(-50%+14px)] h-px',
                    step.state === 'done' ? 'bg-emerald-400' : 'bg-[#E5DDD0]',
                  )}
                />
              )}
              {/* Circle */}
              <div
                className={cn(
                  'relative z-10 flex h-7 w-7 items-center justify-center rounded-full transition-colors',
                  step.state === 'done'
                    ? 'bg-emerald-500 text-white'
                    : step.state === 'pending'
                      ? 'bg-[#FBF7EC] border-2 border-[#DEC76B] text-[#8B6F47]'
                      : 'bg-[#F5F3EE] border border-[#E5DDD0] text-[#0E101A]/30',
                )}
              >
                {step.state === 'done' ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                ) : step.state === 'locked' ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  <step.icon className="h-3 w-3" />
                )}
              </div>
              {/* Label */}
              <p
                className={cn(
                  'text-[11px] font-semibold mt-2 leading-tight',
                  step.state === 'done' ? 'text-emerald-700' : step.state === 'pending' ? 'text-[#8B6F47]' : 'text-[#0E101A]/30',
                )}
              >
                {step.title}
              </p>
              <p className="text-[10px] text-[#0E101A]/40 mt-0.5 leading-tight max-w-[100px]">
                {step.subtitle}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
