import { useMyAgreementStatus } from '@/hooks/use-agreement-status';
import { Shield, CheckCircle2, Clock, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgreementStatusBannerProps {
  /** Which agreement to show status for. Defaults to both. */
  show?: 'nda' | 'fee' | 'both';
  className?: string;
}

/**
 * Buyer-facing banner showing their firm's agreement coverage status.
 *
 * Shows at the top of deal pages to indicate:
 * - Covered: "An NDA has already been signed by someone at your firm."
 * - Covered via parent: "Covered under Alpine Investors' NDA."
 * - Pending: "Your firm's agreement is currently under review."
 * - Needs signing: "An NDA is required to view this deal."
 */
export function AgreementStatusBanner({ show = 'both', className }: AgreementStatusBannerProps) {
  const { data: coverage, isLoading } = useMyAgreementStatus();

  if (isLoading || !coverage) return null;

  const banners: Array<{ key: string; variant: 'success' | 'info' | 'warning' | 'locked'; icon: typeof Shield; message: string }> = [];

  // NDA banner
  if (show === 'nda' || show === 'both') {
    if (coverage.nda_covered) {
      if (coverage.nda_coverage_source === 'pe_parent' && coverage.nda_parent_firm_name) {
        banners.push({
          key: 'nda',
          variant: 'success',
          icon: CheckCircle2,
          message: `Covered under ${coverage.nda_parent_firm_name}'s NDA. You have full access.`,
        });
      } else {
        banners.push({
          key: 'nda',
          variant: 'success',
          icon: CheckCircle2,
          message: 'An NDA has already been signed by someone at your firm. You have full access.',
        });
      }
    } else if (['redlined', 'under_review'].includes(coverage.nda_status)) {
      banners.push({
        key: 'nda',
        variant: 'warning',
        icon: Clock,
        message: "Your firm's NDA is currently under review. You'll receive access once it's finalized.",
      });
    } else if (coverage.nda_status === 'sent') {
      banners.push({
        key: 'nda',
        variant: 'info',
        icon: Clock,
        message: 'Your NDA is waiting to be signed. Check your email or sign it from the pending approval page.',
      });
    } else if (!coverage.fee_covered) {
      banners.push({
        key: 'nda',
        variant: 'locked',
        icon: Lock,
        message: 'A signed Fee Agreement is required to request deal access and unlock the data room.',
      });
    }
  }

  // Fee agreement banner
  if (show === 'fee' || show === 'both') {
    if (coverage.fee_covered) {
      if (coverage.fee_coverage_source === 'pe_parent' && coverage.fee_parent_firm_name) {
        banners.push({
          key: 'fee',
          variant: 'success',
          icon: CheckCircle2,
          message: `Covered under ${coverage.fee_parent_firm_name}'s fee agreement. Full data room access granted.`,
        });
      } else {
        banners.push({
          key: 'fee',
          variant: 'success',
          icon: CheckCircle2,
          message: 'A fee agreement has been signed by your firm. Full data room access granted.',
        });
      }
    } else if (['redlined', 'under_review'].includes(coverage.fee_status)) {
      banners.push({
        key: 'fee',
        variant: 'warning',
        icon: Clock,
        message: "Your firm's fee agreement is currently under review. Data room access will be granted once finalized.",
      });
    } else if (coverage.fee_status === 'sent') {
      banners.push({
        key: 'fee',
        variant: 'info',
        icon: Clock,
        message: 'A fee agreement has been sent to your firm. Please check your email to sign.',
      });
    }
    // If NDA is covered, fee is optional — show nothing about fee requirement
  }

  if (banners.length === 0) return null;

  const variantStyles = {
    success: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300',
    info: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300',
    warning: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300',
    locked: 'bg-slate-50 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300',
  };

  return (
    <div className={cn('space-y-2', className)}>
      {banners.map((banner) => {
        const Icon = banner.icon;
        return (
          <div
            key={banner.key}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg border text-sm',
              variantStyles[banner.variant],
            )}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span>{banner.message}</span>
          </div>
        );
      })}
    </div>
  );
}
