import { useState } from 'react';
import { Button } from '@/components/ui/button';
import ConnectionRequestDialog from '@/components/connection/ConnectionRequestDialog';
import { useMyAgreementStatus } from '@/hooks/use-agreement-status';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/components/realtime/RealtimeProvider';
import { useAgreementStatusSync } from '@/hooks/use-agreement-status-sync';
import { AgreementSigningModal } from '@/components/pandadoc/AgreementSigningModal';
import { XCircle, AlertCircle, Check, RotateCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isProfileComplete, getProfileCompletionPercentage, getMissingFieldLabels } from '@/lib/profile-completeness';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { sendAgreementEmail, docTypeLabel } from '@/lib/agreement-email';

interface ConnectionButtonProps {
  connectionExists: boolean;
  connectionStatus: string;
  isRequesting: boolean;
  isAdmin: boolean;
  handleRequestConnection: (message?: string) => void;
  listingTitle?: string;
  listingId: string;
  listingStatus?: string;
}

const ConnectionButton = ({
  connectionExists,
  connectionStatus,
  isRequesting,
  isAdmin,
  handleRequestConnection,
  listingTitle,
  listingId: _listingId,
  listingStatus,
}: ConnectionButtonProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [resendingType, setResendingType] = useState<string | null>(null);
  const queryClient = useQueryClient();
  useRealtime();
  useAgreementStatusSync();
  const { user } = useAuth();
  const { data: coverage } = useMyAgreementStatus(!isAdmin && !!user);

  const handleDialogSubmit = (message: string) => {
    handleRequestConnection(message);
    setIsDialogOpen(false);
  };

  const handleButtonClick = () => {
    if (!connectionExists || connectionStatus === 'rejected') {
      // Gate: listing must be active
      if (listingStatus === 'inactive' || listingStatus === 'sold') return;
      // Gate: profile must be complete
      if (user && !isAdmin && !isProfileComplete(user)) return;
      // Gate: at least ONE agreement must be signed (NDA or Fee Agreement)
      if (!isAdmin && (!coverage || (!coverage.nda_covered && !coverage.fee_covered))) return;
      setIsDialogOpen(true);
    }
  };

  const getButtonContent = () => {
    if (connectionExists) {
      switch (connectionStatus) {
        case 'pending':
          return {
            text: 'Request pending',
            className:
              'bg-slate-100 text-slate-700 border border-slate-200 cursor-default hover:bg-slate-100',
            disabled: true,
          };
        case 'approved':
          return {
            text: 'Connected',
            className:
              'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default hover:bg-emerald-50',
            disabled: true,
          };
        case 'rejected':
          return {
            text: 'Request again',
            className: 'bg-slate-900 hover:bg-slate-800 text-white border-none',
            disabled: false,
          };
        case 'on_hold':
          return {
            text: 'Request under review',
            className:
              'bg-slate-100 text-slate-700 border border-slate-200 cursor-default hover:bg-slate-100',
            disabled: true,
          };
        default:
          return {
            text: 'Request connection',
            className: 'bg-slate-900 hover:bg-slate-800 text-white border-none',
            disabled: false,
          };
      }
    }

    return {
      text: 'Request Full Deal Details',
      className: 'bg-sourceco hover:bg-sourceco/90 text-sourceco-foreground border-none',
      disabled: false,
    };
  };

  const { text: buttonText, className, disabled } = getButtonContent();

  if (isAdmin) {
    return (
      <div className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
        <p className="text-sm font-medium text-blue-900">Admin Access</p>
        <p className="text-xs text-blue-700 mt-0.5">You have full access to this listing</p>
      </div>
    );
  }

  // Block business owners (sellers) from requesting connections
  if (user?.buyer_type === 'businessOwner' || user?.buyer_type === 'business_owner') {
    return (
      <div className="w-full px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
        <p className="text-sm font-medium text-amber-900">Seller Account</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Business owner accounts cannot request deal connections. Visit the Sell page to list your
          business.
        </p>
      </div>
    );
  }

  // Block users with incomplete profiles from requesting connections
  if (user && !isAdmin && !isProfileComplete(user)) {
    const pct = getProfileCompletionPercentage(user);
    return (
      <div className="space-y-3">
        <div className="w-full px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-medium text-amber-900">Complete Your Profile</p>
          </div>
          <p className="text-xs text-amber-700 mt-0.5">
            Complete your buyer profile before requesting deal access.
          </p>
          {(() => {
            const missingLabels = getMissingFieldLabels(user);
            return missingLabels.length > 0 ? (
              <ul className="mt-2 text-xs text-amber-800 list-disc list-inside space-y-0.5 text-left">
                {missingLabels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            ) : null;
          })()}
          {pct > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-amber-600">{pct}% complete</span>
              </div>
              <div className="h-1 bg-amber-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <Link
          to="/profile?tab=profile&complete=1"
          className="block w-full text-center text-xs font-medium py-2.5 px-3 rounded-md bg-sourceco text-sourceco-foreground hover:bg-sourceco/90 transition-colors"
        >
          Complete My Profile
        </Link>
      </div>
    );
  }

  // Block users who haven't signed at least one agreement (NDA or Fee Agreement)
  if (!isAdmin && coverage && !coverage.nda_covered && !coverage.fee_covered) {
    const ndaStatus = coverage.nda_status ?? 'not_started';
    const feeStatus = coverage.fee_status ?? 'not_started';
    const ndaSent = ndaStatus === 'sent';
    const feeSent = feeStatus === 'sent';
    const ndaSigned = coverage.nda_covered;
    const feeSigned = coverage.fee_covered;
    const anyPending = ndaSent || feeSent;
    const bothNotRequested = !ndaSent && !feeSent && !ndaSigned && !feeSigned;

    const handleResend = async (type: 'nda' | 'fee_agreement') => {
      setResendingType(type);
      const result = await sendAgreementEmail({ documentType: type });
      if (result.success) {
        toast.success(`${docTypeLabel(type)} resent to your email`);
        queryClient.invalidateQueries({ queryKey: ['my-agreement-status'] });
      } else {
        toast.error(result.error || 'Failed to resend. Please try again.');
      }
      setResendingType(null);
    };

    const DocumentRow = ({ label, status, type }: { label: string; status: string; type: 'nda' | 'fee_agreement' }) => {
      const isSent = status === 'sent';
      const isSigned = status === 'signed';
      if (!isSent && !isSigned) return null;

      return (
        <div className="w-full border border-slate-200/60 rounded-lg overflow-hidden">
          <div className={`border-l-2 ${isSigned ? 'border-emerald-400' : 'border-blue-400'} px-4 py-3`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{label}</p>
              {isSigned ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <Check className="h-3 w-3" /> Signed
                </span>
              ) : (
                <span className="text-xs text-blue-600">Sent</span>
              )}
            </div>
            {isSent && (
              <>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  Sent to <span className="font-medium text-foreground">{user?.email}</span>. Review, sign, and reply to{' '}
                  <span className="font-medium text-foreground">adam.haile@sourcecodeals.com</span>.
                </p>
                <button
                  onClick={() => handleResend(type)}
                  disabled={resendingType === type}
                  className="mt-2 text-xs text-blue-600 hover:underline disabled:opacity-50 flex items-center gap-1"
                >
                  <RotateCw className={`h-3 w-3 ${resendingType === type ? 'animate-spin' : ''}`} />
                  {resendingType === type ? 'Sending…' : 'Resend'}
                </button>
              </>
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-3">
        {(anyPending || ndaSigned || feeSigned) && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Documents</p>
            <DocumentRow label="NDA" status={ndaSent ? 'sent' : ndaSigned ? 'signed' : ndaStatus} type="nda" />
            <DocumentRow label="Fee Agreement" status={feeSent ? 'sent' : feeSigned ? 'signed' : feeStatus} type="fee_agreement" />
          </div>
        )}

        {anyPending && !ndaSigned && !feeSigned && (
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            Once processed, you'll be able to request introductions.
          </p>
        )}

        {/* Show request button if at least one type hasn't been requested */}
        {(bothNotRequested || (!ndaSent && !ndaSigned) || (!feeSent && !feeSigned)) && (
          <div className={bothNotRequested ? 'w-full border border-slate-200/60 rounded-lg px-4 py-4' : ''}>
            {bothNotRequested && (
              <>
                <p className="text-sm font-medium text-foreground">Sign an Agreement</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  An NDA or Fee Agreement is required to request deal access. This is a one-time process.
                </p>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              className={`${bothNotRequested ? 'mt-3' : ''} w-full text-xs border-slate-200 hover:border-slate-300 text-foreground`}
              onClick={(e) => {
                e.stopPropagation();
                setShowAgreementModal(true);
              }}
            >
              {bothNotRequested ? 'Request Agreement via Email' : 'Request Another Agreement'}
            </Button>
          </div>
        )}

        {showAgreementModal && (
          <AgreementSigningModal
            open={showAgreementModal}
            onOpenChange={setShowAgreementModal}
          />
        )}
      </div>
    );
  }

  // Show closed/sold state for inactive or sold listings
  if (listingStatus === 'inactive' || listingStatus === 'sold') {
    return (
      <div className="space-y-3">
        <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <XCircle className="h-4 w-4 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">This opportunity has been closed</p>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            This deal is no longer accepting new inquiries.
          </p>
        </div>
        <Link
          to="/marketplace"
          className="block w-full text-center text-xs text-sourceco hover:text-sourceco/80 transition-colors py-2 px-3 rounded-md hover:bg-sourceco/5 border border-sourceco/20 hover:border-sourceco/40 font-medium"
        >
          Browse other opportunities
        </Link>
      </div>
    );
  }

  // Special layout for approved connections
  if (connectionExists && connectionStatus === 'approved') {
    return (
      <div className="w-full px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
        <p className="text-sm font-medium text-emerald-900">Connected</p>
        <p className="text-xs text-emerald-700 mt-0.5">Your connection request has been approved</p>
      </div>
    );
  }

  // Special layout for rejected connections
  if (connectionExists && connectionStatus === 'rejected') {
    return (
      <div className="space-y-3">
        <div className="w-full px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-center">
          <p className="text-sm font-semibold text-red-700">Owner selected another buyer</p>
          <p className="text-xs text-red-600 mt-0.5">
            The business owner has moved forward with another buyer on this one. Browse other deals
            — our team sources new opportunities regularly.
          </p>
        </div>
        <Link
          to="/marketplace"
          className="block w-full text-center text-xs font-medium py-2.5 px-3 rounded-md bg-slate-900 text-white hover:bg-slate-800 transition-colors"
        >
          Browse Other Deals
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Main Connection Button */}
      <Button
        onClick={handleButtonClick}
        disabled={disabled || isRequesting}
        className={`w-full bg-sourceco hover:bg-sourceco/90 text-sourceco-foreground font-medium text-xs py-2.5 h-auto rounded-md transition-colors duration-200 ${className}`}
      >
        {isRequesting ? 'Sending request...' : buttonText}
      </Button>

      <ConnectionRequestDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSubmit={handleDialogSubmit}
        isSubmitting={isRequesting}
        listingTitle={listingTitle}
      />

    </div>
  );
};

export default ConnectionButton;
