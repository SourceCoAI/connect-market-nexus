import { useState } from 'react';
import { Button } from '@/components/ui/button';
import ConnectionRequestDialog from '@/components/connection/ConnectionRequestDialog';
import { FeeAgreementGate } from '@/components/pandadoc/FeeAgreementGate';
import { useMyAgreementStatus } from '@/hooks/use-agreement-status';
import { useAuth } from '@/contexts/AuthContext';
import { useBuyerNdaStatus } from '@/hooks/admin/use-pandadoc';
import { useRealtime } from '@/components/realtime/RealtimeProvider';
import { useAgreementStatusSync } from '@/hooks/use-agreement-status-sync';
import { Send, XCircle, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isProfileComplete, getProfileCompletionPercentage } from '@/lib/profile-completeness';

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
  listingId,
  listingStatus,
}: ConnectionButtonProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showFeeGate, setShowFeeGate] = useState(false);
  useRealtime();
  useAgreementStatusSync();
  const { user } = useAuth();
  const { data: coverage } = useMyAgreementStatus(!isAdmin && !!user);
  const { data: ndaStatus } = useBuyerNdaStatus(!isAdmin ? user?.id : undefined);

  const handleDialogSubmit = (message: string) => {
    handleRequestConnection(message);
    setIsDialogOpen(false);
  };

  const handleButtonClick = () => {
    if (!connectionExists || connectionStatus === 'rejected') {
      // Check fee agreement coverage before opening dialog
      if (!isAdmin && coverage && !coverage.fee_covered) {
        setShowFeeGate(true);
      } else {
        setIsDialogOpen(true);
      }
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
            You need to complete your buyer profile before requesting deal access.
          </p>
          {pct > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-amber-600">Profile completeness</span>
                <span className="font-mono text-xs text-amber-900">{pct}%</span>
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
          to="/profile"
          className="block w-full text-center text-xs font-medium py-2.5 px-3 rounded-md bg-sourceco text-sourceco-foreground hover:bg-sourceco/90 transition-colors"
        >
          Complete My Profile
        </Link>
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
          <p className="text-sm font-semibold text-red-700">This opportunity is no longer available</p>
          <p className="text-xs text-red-600 mt-0.5">
            This listing is no longer available for introduction requests. Browse other deals
            — our team sources new opportunities regularly.
          </p>
        </div>
        <Button
          onClick={handleButtonClick}
          disabled={isRequesting}
          className="w-full h-10 bg-slate-900 hover:bg-slate-800 text-white font-medium text-[13px] tracking-[0.002em] shadow-sm hover:shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sourceco-accent/30 focus:ring-offset-2"
        >
          <Send className="h-3.5 w-3.5" />
          {isRequesting ? 'Sending request...' : 'Request Again'}
        </Button>

        {showFeeGate && user && ndaStatus?.firmId && (
          <FeeAgreementGate
            userId={user.id}
            firmId={ndaStatus.firmId}
            listingTitle={listingTitle}
            onSigned={() => {
              setShowFeeGate(false);
              setIsDialogOpen(true);
            }}
            onDismiss={() => setShowFeeGate(false)}
          />
        )}
        {showFeeGate && user && !ndaStatus?.firmId && (
          <div className="w-full px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
            <p className="text-sm font-medium text-amber-900">Fee Agreement Required</p>
            <p className="text-xs text-amber-700 mt-0.5">
              We couldn't resolve your firm. Please contact support to set up your fee agreement.
            </p>
          </div>
        )}

        <ConnectionRequestDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onSubmit={handleDialogSubmit}
          isSubmitting={isRequesting}
          listingTitle={listingTitle}
          listingId={listingId}
        />
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
        listingId={listingId}
      />

      {showFeeGate && user && ndaStatus?.firmId && (
        <FeeAgreementGate
          userId={user.id}
          firmId={ndaStatus.firmId}
          listingTitle={listingTitle}
          onSigned={() => {
            setShowFeeGate(false);
            setIsDialogOpen(true);
          }}
          onDismiss={() => setShowFeeGate(false)}
        />
      )}
      {showFeeGate && user && !ndaStatus?.firmId && (
        <div className="w-full px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
          <p className="text-sm font-medium text-amber-900">Fee Agreement Required</p>
          <p className="text-xs text-amber-700 mt-0.5">
            We couldn't resolve your firm. Please contact support to set up your fee agreement.
          </p>
        </div>
      )}
    </div>
  );
};

export default ConnectionButton;
