/**
 * DealActionCard — Single-purpose next-action callout for the buyer.
 *
 * Shows the ONE most important thing the buyer needs to do or know
 * about this deal right now. Uses "either doc" rule.
 */

import { useState } from 'react';
import { ArrowRight, Clock, Shield, FileSignature, CheckCircle2, XCircle } from 'lucide-react';
import { AgreementSigningModal } from '@/components/pandadoc/AgreementSigningModal';
import { cn } from '@/lib/utils';

interface DealActionCardProps {
  requestStatus: 'pending' | 'approved' | 'rejected' | 'on_hold';
  ndaSigned: boolean;
  feeCovered: boolean;
  feeStatus?: string;
  requestCreatedAt: string;
}

export function DealActionCard({
  requestStatus,
  ndaSigned,
  feeCovered,
  feeStatus,
  requestCreatedAt,
}: DealActionCardProps) {
  const [signingOpen, setSigningOpen] = useState(false);

  // Either doc unlocks access
  const hasAnyAgreement = ndaSigned || feeCovered;

  const getAction = () => {
    if (requestStatus === 'rejected') {
      return {
        icon: XCircle,
        title: 'Not Selected',
        description:
          'This opportunity is no longer available at this time. This reflects deal-specific fit, not your qualifications.',
        variant: 'muted' as const,
        unlock: null,
        cta: null,
      };
    }

    if (requestStatus === 'on_hold') {
      return {
        icon: Clock,
        title: 'Request On Hold',
        description:
          'The owner is still evaluating interested buyers. Your request remains active — we\'ll notify you as soon as there\'s an update.',
        unlock: null,
        variant: 'waiting' as const,
        cta: null,
      };
    }

    if (requestStatus === 'approved') {
      return {
        icon: CheckCircle2,
        title: "You're Connected",
        description:
          'Great news — the owner selected your firm. Expect an email from our team shortly with next steps and detailed opportunity materials.',
        variant: 'success' as const,
        unlock: null,
        cta: null,
      };
    }

    // Pending status — check what's needed (either doc)
    if (!hasAnyAgreement) {
      return {
        icon: Shield,
        title: 'Sign an agreement to proceed',
        description:
          'An NDA or Fee Agreement needs to be signed before your interest can be presented to the owner.',
        unlock:
          "Once signed, you'll receive access to the company name, confidential deal memo, and detailed financials.",
        variant: 'action' as const,
        cta: { label: 'Request Agreement', onClick: () => setSigningOpen(true) },
      };
    }

    if (!feeCovered && feeStatus === 'sent') {
      return {
        icon: FileSignature,
        title: 'Sign your Fee Agreement',
        description:
          'Your Fee Agreement is ready for signature. Complete this to finalize your documentation.',
        unlock:
          'Signing completes your documentation, allowing our team to present your interest to the owner.',
        variant: 'action' as const,
        cta: { label: 'Sign Agreement Now', onClick: () => openSigning('fee_agreement') },
      };
    }

    // All docs signed, pending review
    const daysPending = Math.floor(
      (Date.now() - new Date(requestCreatedAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    const isExtended = daysPending > 7;

    return {
      icon: Clock,
      title: 'Under Review',
      description: isExtended
        ? "This is taking a bit longer than usual. The owner is carefully evaluating all interested buyers. We'll notify you as soon as a decision is made."
        : 'Your interest is being presented to the owner alongside other qualified buyers. Decisions typically take 3–7 business days.',
      unlock: null,
      variant: 'waiting' as const,
      cta: null,
    };
  };

  const action = getAction();
  const Icon = action.icon;

  const variantStyles = {
    action: 'bg-[#FBF7EC] border-[#DEC76B]',
    waiting: 'bg-[#F8F6F1] border-[#E5DDD0]',
    success: 'bg-[#F0FAF0] border-[#C8E6C9]',
    muted: 'bg-[#F5F3EE] border-[#E5DDD0]',
  };

  const iconStyles = {
    action: 'text-[#8B6F47]',
    waiting: 'text-[#0E101A]/40',
    success: 'text-emerald-600',
    muted: 'text-[#0E101A]/30',
  };

  return (
    <>
      <div className={cn('rounded-lg border p-5', variantStyles[action.variant])}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 flex-1 min-w-0">
            <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', iconStyles[action.variant])} />
            <div className="flex-1 min-w-0">
              <h3 className="text-[15px] font-semibold text-[#0E101A] leading-tight">
                {action.title}
              </h3>
              <p className="text-[13px] text-[#0E101A]/55 leading-relaxed mt-1">
                {action.description}
              </p>
              {action.unlock && (
                <p className="text-[12px] text-[#8B6F47] leading-relaxed mt-2 font-medium">
                  {action.unlock}
                </p>
              )}
            </div>
          </div>
          {action.cta && (
            <button
              onClick={action.cta.onClick}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md text-[13px] font-semibold bg-[#0E101A] text-white hover:bg-[#0E101A]/85 transition-colors shrink-0 mt-0.5"
            >
              {action.cta.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <AgreementSigningModal
        open={signingOpen}
        onOpenChange={setSigningOpen}
      />
    </>
  );
}
