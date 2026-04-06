import { Link } from "react-router-dom";
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
  profileComplete?: boolean;
  profileCompletionPct?: number;
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
  profileComplete = true,
  profileCompletionPct = 0,
}: BlurredFinancialTeaserProps) => {
  // Don't show if already connected or admin
  if ((hasConnection && connectionStatus === "approved") || isAdmin) {
    return null;
  }

  const showProfileBlock = !profileComplete;

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

            {showProfileBlock ? (
              <>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  Complete your profile to request deal access.
                </p>
                {profileCompletionPct > 0 && (
                  <div className="max-w-[200px] mx-auto mb-4">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[11px] text-muted-foreground">Profile</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{profileCompletionPct}%</span>
                    </div>
                    <div className="h-1 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#0E101A] rounded-full transition-all duration-300"
                        style={{ width: `${profileCompletionPct}%` }}
                      />
                    </div>
                  </div>
                )}
                <Link
                  to="/profile?tab=profile&complete=1"
                  className="inline-block text-xs font-medium py-2.5 px-6 rounded-md bg-[#0E101A] text-white hover:bg-[#0E101A]/90 transition-colors"
                >
                  Complete Profile
                </Link>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlurredFinancialTeaser;
