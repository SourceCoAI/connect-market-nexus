/**
 * DealNextSteps — Per-deal action checklist shown in the Overview tab.
 *
 * Unlike the global ActionHub (which aggregates actions across ALL deals),
 * this component shows a linear checklist scoped to a single deal.  It
 * answers the buyer's question: "What do I need to do right now to move
 * this deal forward?"
 *
 * The checklist always contains these items in order:
 *
 *  1. **Expressed Interest** — always completed (the buyer submitted a
 *     connection request to reach this page).
 *
 *  2. **Sign NDA** — checks `ndaSigned`.  If false, shows a "Sign Now"
 *     CTA that opens the AgreementSigningModal.  The description explains
 *     that signing is one-time and unlocks details across all deals.
 *
 *  3. **Sign Fee Agreement** — checks `feeCovered`.  If false and the fee
 *     has been sent, shows a "Sign Now" CTA.  The description reassures
 *     buyers that the fee is success-based only (no upfront cost).
 *
 *  4. **Review Deal Memo** — locked until the NDA is signed.  Once
 *     available, clicking navigates the buyer to the Documents tab.
 *
 * Each item renders with a colored left accent:
 *   - green for completed items
 *   - amber/gold for items requiring action
 *   - gray for locked/future items
 *
 * The component owns its own AgreementSigningModal instance so it can
 * trigger NDA/Fee signing directly without routing through ActionHub.
 */

import { useState } from 'react';
import { Check, Lock, FileText, Shield, FileSignature, ArrowRight } from 'lucide-react';
import { AgreementSigningModal } from '@/components/docuseal/AgreementSigningModal';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

/* ─── Props ────────────────────────────────────────────────────────────── */

interface DealNextStepsProps {
  /** When the connection request was submitted — shown as "Completed X ago" */
  requestCreatedAt: string;
  /** Whether the buyer's firm has signed the platform NDA */
  ndaSigned: boolean;
  /**
   * Whether the buyer's firm has fee agreement coverage.
   * True = signed or covered via parent/domain match.
   */
  feeCovered: boolean;
  /**
   * The fee agreement's sending status.  Only show the "Sign Fee" step
   * when the agreement has actually been sent to the buyer (status === 'sent').
   */
  feeStatus?: string;
  /** Whether the deal has been approved (unlocks deal memo) */
  requestStatus: 'pending' | 'approved' | 'rejected';
  /** Callback to switch the detail panel to the Documents tab */
  onNavigateToDocuments?: () => void;
}

/* ─── Step type ────────────────────────────────────────────────────────── */

interface StepItem {
  id: string;
  icon: typeof Check;
  title: string;
  description: string;
  state: 'done' | 'pending' | 'locked';
  /** Optional CTA button label */
  cta?: string;
  /** Optional action when CTA is clicked */
  onAction?: () => void;
}

/* ─── Component ────────────────────────────────────────────────────────── */

export function DealNextSteps({
  requestCreatedAt,
  ndaSigned,
  feeCovered,
  feeStatus,
  requestStatus,
  onNavigateToDocuments,
}: DealNextStepsProps) {
  const [signingOpen, setSigningOpen] = useState(false);
  const [signingType, setSigningType] = useState<'nda' | 'fee_agreement'>('nda');

  /**
   * Open the embedded DocuSeal signing modal for NDA or Fee Agreement.
   * The modal handles the full signing flow including confirmation.
   */
  const openSigning = (type: 'nda' | 'fee_agreement') => {
    setSigningType(type);
    setSigningOpen(true);
  };

  // Determine fee step visibility:
  // Only show fee step if the agreement has been sent to the buyer.
  // If fee is already covered (signed), still show it as completed.
  const showFeeStep = feeCovered || feeStatus === 'sent';

  // Build the step list.
  // Each step is evaluated independently so the checklist always renders
  // in the correct state even if the user refreshes mid-flow.
  const steps: StepItem[] = [
    {
      id: 'interest',
      icon: Check,
      title: 'Expressed Interest',
      description: `Completed ${formatDistanceToNow(new Date(requestCreatedAt), { addSuffix: false })} ago`,
      state: 'done',
    },
    {
      id: 'nda',
      icon: Shield,
      title: 'Sign NDA',
      description: ndaSigned
        ? 'Non-Disclosure Agreement signed'
        : 'One-time signing — unlocks full details on all deals',
      state: ndaSigned ? 'done' : 'pending',
      cta: ndaSigned ? undefined : 'Sign Now',
      onAction: ndaSigned ? undefined : () => openSigning('nda'),
    },
  ];

  // Conditionally add fee agreement step
  if (showFeeStep) {
    steps.push({
      id: 'fee',
      icon: FileSignature,
      title: 'Sign Fee Agreement',
      description: feeCovered
        ? 'Fee Agreement signed'
        : 'No upfront cost — only owed upon successful close',
      state: feeCovered ? 'done' : 'pending',
      cta: feeCovered ? undefined : 'Sign Now',
      onAction: feeCovered ? undefined : () => openSigning('fee_agreement'),
    });
  }

  // Deal memo access step — locked until NDA signed AND request approved
  const memoUnlocked = ndaSigned && requestStatus === 'approved';
  steps.push({
    id: 'deal_memo',
    icon: FileText,
    title: 'Review Deal Memo',
    description: memoUnlocked
      ? 'Deal memo and materials are available for review'
      : 'Available after NDA is signed and request is approved',
    state: memoUnlocked ? 'done' : 'locked',
    cta: memoUnlocked ? 'View Documents' : undefined,
    onAction: memoUnlocked ? onNavigateToDocuments : undefined,
  });

  /* ── State-dependent styling maps ── */

  const stateStyles = {
    done: {
      bg: 'bg-[#FCF9F0]',
      border: 'border-[#E5DDD0]',
      iconBg: 'bg-[#0E101A] text-[#DEC76B]',
    },
    pending: {
      bg: 'bg-[#FBF7EC]',
      border: 'border-[#DEC76B]',
      iconBg: 'bg-[#DEC76B]/20 text-[#0E101A]',
    },
    locked: {
      bg: 'bg-[#FCF9F0]',
      border: 'border-[#E5DDD0]',
      iconBg: 'bg-[#E5DDD0] text-[#0E101A]/40',
    },
  } as const;

  return (
    <>
      <div>
        <h3 className="text-xs font-semibold text-[#0E101A]/40 uppercase tracking-[0.08em] mb-3">
          Your Next Steps
        </h3>
        <div className="space-y-2.5">
          {steps.map((step) => {
            const style = stateStyles[step.state];
            const Icon = step.icon;

            return (
              <div
                key={step.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors',
                  style.bg,
                  style.border,
                  step.state === 'locked' && 'opacity-60',
                )}
              >
                {/* Icon */}
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    style.iconBg,
                  )}
                >
                  {step.state === 'done' ? (
                    <Check className="h-4 w-4" />
                  ) : step.state === 'locked' ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#0E101A]">{step.title}</p>
                  <p className="text-[11px] text-[#0E101A]/50 mt-0.5">{step.description}</p>
                </div>

                {/* CTA button */}
                {step.cta && step.onAction && (
                  <button
                    onClick={step.onAction}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors shrink-0',
                      step.state === 'pending' && 'bg-[#0E101A] text-white hover:bg-[#0E101A]/80',
                      step.state === 'done' &&
                        'bg-[#0E101A]/10 text-[#0E101A] hover:bg-[#0E101A]/20',
                    )}
                  >
                    {step.cta}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}

                {/* Completed check for done items without CTA */}
                {step.state === 'done' && !step.cta && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0E101A] text-[#DEC76B] shrink-0">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                )}

                {/* Lock icon for locked items */}
                {step.state === 'locked' && !step.cta && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E5DDD0] text-[#0E101A]/40 shrink-0">
                    <Lock className="h-3 w-3" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Signing modal — shared between NDA and Fee Agreement buttons */}
      <AgreementSigningModal
        open={signingOpen}
        onOpenChange={setSigningOpen}
        documentType={signingType}
      />
    </>
  );
}
