import ConnectionButton from "@/components/listing-detail/ConnectionButton";
import { LockIcon } from "@/components/icons/MetricIcons";

interface BlurredFinancialTeaserProps {
  onRequestConnection: (message?: string) => void;
  isRequesting: boolean;
  hasConnection: boolean;
  connectionStatus: string;
  listingTitle?: string;
  listingId: string;
  listingStatusValue?: string;
  isAdmin: boolean;
}

const BlurredFinancialTeaser = ({ 
  onRequestConnection, 
  isRequesting, 
  hasConnection, 
  connectionStatus,
  listingTitle,
  listingId,
  listingStatusValue,
  isAdmin,
}: BlurredFinancialTeaserProps) => {
  // Don't show if already connected or admin
  if ((hasConnection && connectionStatus === "approved") || isAdmin) {
    return null;
  }

  return (
    <div className="relative bg-white border border-border overflow-hidden rounded-lg">
      <div className="relative p-6">
        {/* Minimal blurred preview */}
        <div className="mb-6 space-y-3 blur-[2px] select-none pointer-events-none opacity-20">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <div className="h-2 bg-slate-300 rounded w-14"></div>
              <div className="h-3 bg-slate-300 rounded w-18"></div>
            </div>
            <div className="space-y-1">
              <div className="h-2 bg-slate-300 rounded w-14"></div>
              <div className="h-3 bg-slate-300 rounded w-18"></div>
            </div>
            <div className="space-y-1">
              <div className="h-2 bg-slate-300 rounded w-14"></div>
              <div className="h-3 bg-slate-300 rounded w-18"></div>
            </div>
          </div>
        </div>

        {/* Clean CTA overlay */}
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="text-center w-full max-w-sm mx-auto">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-secondary mb-4">
              <LockIcon className="w-5 h-5 text-muted-foreground" />
            </div>
            
            <h3 className="text-base font-semibold text-foreground mb-2">
              Unlock the Data Room
            </h3>
            <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
              Request access to view the CIM, real company name, and full financials.
            </p>
            
            <div className="max-w-xs mx-auto">
              <ConnectionButton
                connectionExists={hasConnection}
                connectionStatus={connectionStatus}
                isRequesting={isRequesting}
                isAdmin={isAdmin}
                handleRequestConnection={onRequestConnection}
                listingTitle={listingTitle}
                listingId={listingId}
                listingStatus={listingStatusValue}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlurredFinancialTeaser;
