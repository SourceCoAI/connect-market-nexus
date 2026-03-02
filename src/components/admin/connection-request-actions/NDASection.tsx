/**
 * NDASection.tsx
 *
 * Agreements sidebar card showing NDA and Fee Agreement statuses
 * with inline AgreementStatusDropdown toggles for admin control.
 */
import { SidebarCard } from './SidebarCard';
import { AgreementStatusDropdown } from '@/components/admin/firm-agreements/AgreementStatusDropdown';
import type { FirmAgreement, FirmMember } from '@/hooks/admin/use-firm-agreements';

interface NDASectionProps {
  hasNDA: boolean;
  hasFeeAgreement: boolean;
  ndaStatus: string;
  feeStatus: string;
  firmId?: string;
  firmAgreement?: FirmAgreement | null;
  firmMembers?: FirmMember[];
  onSendAgreement: (type: 'nda' | 'fee_agreement') => void;
}

export function NDASection({
  hasNDA,
  hasFeeAgreement,
  ndaStatus,
  feeStatus,
  firmId,
  firmAgreement,
  firmMembers = [],
  onSendAgreement,
}: NDASectionProps) {
  // If we have a firmAgreement, use the dropdown for full toggle control
  const canUseDropdown = !!firmAgreement;

  return (
    <SidebarCard title="Agreements">
      <div className="space-y-0">
        {/* NDA Row */}
        <div className="flex items-center justify-between py-3 border-b border-border/30 last:border-b-0">
          <span className="text-base text-muted-foreground font-medium">NDA</span>
          <div className="flex items-center gap-2.5">
            {canUseDropdown ? (
              <AgreementStatusDropdown
                firm={firmAgreement}
                members={firmMembers}
                agreementType="nda"
              />
            ) : (
              <>
                <div className={`w-2.5 h-2.5 rounded-full ${hasNDA ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="text-base font-semibold text-foreground">
                  {hasNDA ? 'Signed' : ndaStatus === 'sent' ? 'Sent' : 'Not Sent'}
                </span>
                {!hasNDA && firmId && (
                  <button
                    onClick={() => onSendAgreement('nda')}
                    className="text-sm font-bold text-sourceco-foreground bg-sourceco border border-sourceco rounded-md px-3 py-1 hover:bg-sourceco/90 transition-colors shadow-sm"
                  >
                    ↗ Send
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Fee Agreement Row */}
        <div className="flex items-center justify-between py-3">
          <span className="text-base text-muted-foreground font-medium">Fee Agreement</span>
          <div className="flex items-center gap-2.5">
            {canUseDropdown ? (
              <AgreementStatusDropdown
                firm={firmAgreement}
                members={firmMembers}
                agreementType="fee_agreement"
              />
            ) : (
              <>
                <div className={`w-2.5 h-2.5 rounded-full ${hasFeeAgreement ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="text-base font-semibold text-foreground">
                  {hasFeeAgreement ? 'Signed' : feeStatus === 'sent' ? 'Sent' : 'Not Sent'}
                </span>
                {!hasFeeAgreement && firmId && (
                  <button
                    onClick={() => onSendAgreement('fee_agreement')}
                    className="text-sm font-bold text-sourceco-foreground bg-sourceco border border-sourceco rounded-md px-3 py-1 hover:bg-sourceco/90 transition-colors shadow-sm"
                  >
                    ↗ Send
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </SidebarCard>
  );
}
