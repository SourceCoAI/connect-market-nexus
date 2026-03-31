import { useState, memo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bookmark, CheckCircle2, Clock, XCircle, Send, Eye, AlertCircle, ShieldX } from "lucide-react";
import ConnectionRequestDialog from "@/components/connection/ConnectionRequestDialog";

interface ListingCardActionsProps {
  viewType: "grid" | "list";
  connectionExists: boolean;
  connectionStatus: string;
  isRequesting: boolean;
  isSaved: boolean | undefined;
  isSaving: boolean;
  handleRequestConnection: (message: string) => void;
  handleToggleSave: (e: React.MouseEvent) => void;
  listingTitle?: string;
  listingId?: string;
  // Gating props
  isProfileComplete?: boolean;
  profileCompletePct?: number;
  isBuyerBlocked?: boolean;
  isFeeCovered?: boolean;
  onFeeGateOpen?: () => void;
}

const ListingCardActions = memo(function ListingCardActions({
  viewType,
  connectionExists,
  connectionStatus,
  isRequesting,
  isSaved,
  isSaving,
  handleRequestConnection,
  handleToggleSave,
  listingTitle,
  listingId,
  isProfileComplete = true,
  profileCompletePct = 100,
  isBuyerBlocked = false,
  isFeeCovered = true,
  onFeeGateOpen,
}: ListingCardActionsProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const getConnectionButtonContent = () => {
    if (connectionExists) {
      switch (connectionStatus) {
        case "pending":
          return { 
            icon: Clock, 
            text: "Request Sent", 
            variant: "pending" as const, 
            disabled: true,
            className: "bg-sourceco-muted text-sourceco-accent border border-sourceco-form hover:bg-sourceco-muted"
          };
        case "approved":
          return { 
            icon: CheckCircle2, 
            text: "Access Granted", 
            variant: "connected" as const, 
            disabled: true,
            className: "bg-emerald-50/40 text-emerald-700 border border-emerald-200/40"
          };
        case "rejected":
          return { 
            icon: XCircle, 
            text: "Not Selected", 
            variant: "rejected" as const, 
            disabled: false,
            className: "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
          };
        case "on_hold":
          return { 
            icon: Clock, 
            text: "Under Review", 
            variant: "pending" as const, 
            disabled: true,
            className: "bg-sourceco-muted text-sourceco-accent border border-sourceco-form hover:bg-sourceco-muted"
          };
        default:
          return { 
            icon: Send, 
            text: "Request Access", 
            variant: "default" as const, 
            disabled: false,
            className: ""
          };
      }
    }
    return { 
      icon: Send, 
      text: "Request Access", 
      variant: "default" as const, 
      disabled: false,
      className: ""
    };
  };

  const { icon: ConnectionIcon, text: connectionText, disabled: connectionDisabled, className: connectionClassName } = getConnectionButtonContent();

  const handleConnectionClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Gate: buyer type blocked
    if (isBuyerBlocked) return;

    // Gate: profile incomplete
    if (!isProfileComplete) return;

    // Gate: fee agreement not covered
    if (!isFeeCovered) {
      onFeeGateOpen?.();
      return;
    }

    if (!connectionDisabled || connectionStatus === "rejected") {
      setIsDialogOpen(true);
    }
  };

  const handleDialogSubmit = (message: string) => {
    handleRequestConnection(message);
    setIsDialogOpen(false);
  };

  // Buyer type blocked — show seller account message
  if (isBuyerBlocked) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/50 border border-border">
          <ShieldX className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-[12px] text-muted-foreground">Seller accounts cannot request access</span>
        </div>
      </div>
    );
  }

  // Profile incomplete — show completion prompt
  if (!isProfileComplete) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
          <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[12px] text-muted-foreground">
              Complete your profile to request access
            </span>
            <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-foreground/70 transition-all duration-300"
                style={{ width: `${profileCompletePct}%` }}
              />
            </div>
          </div>
        </div>
        <Link to="/profile?tab=profile&complete=1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            className={`w-full ${viewType === 'list' ? 'h-8' : 'h-9'} text-[12px] font-medium`}
          >
            Complete Profile ({profileCompletePct}%)
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Action Buttons */}
      <div className="space-y-1.5">
        {/* Approved State - Dark "View Deal Details" primary */}
        {connectionExists && connectionStatus === "approved" ? (
          <>
            <Link to={listingId ? `/listing/${listingId}` : '#'} onClick={(e) => e.stopPropagation()}>
              <Button
                className={`w-full ${viewType === 'list' ? 'h-8' : 'h-10'} px-4 text-[13px] font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-sm hover:shadow transition-all duration-200`}
              >
                <Eye className="h-3.5 w-3.5 mr-2" />
                <span>View Deal Details</span>
              </Button>
            </Link>
            
            <Button
              variant="ghost"
              size="sm"
              className={`w-full ${viewType === 'list' ? 'h-8' : 'h-9'} px-3 text-[12px] font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors`}
              onClick={handleToggleSave}
              disabled={isSaving}
            >
              <Bookmark className={`h-3 w-3 mr-2 ${isSaved ? "fill-current text-sourceco-accent" : "text-slate-400"}`} />
              <span>{isSaved ? "Saved" : "Save Deal"}</span>
            </Button>
          </>
        ) : (
          <>
            {/* Primary CTA - Dark Slate instead of Gold */}
            <Button
              className={`w-full ${viewType === 'list' ? 'h-8' : 'h-11'} px-4 text-[13px] font-semibold rounded-lg transition-all duration-200 
                ${connectionDisabled && connectionStatus !== "rejected"
                  ? connectionClassName + " shadow-none"
                  : "bg-slate-900 hover:bg-slate-800 text-white shadow-sm hover:shadow-md active:shadow-sm"
                }`}
              onClick={handleConnectionClick}
              disabled={isRequesting || (connectionDisabled && connectionStatus !== "rejected")}
            >
              <div className="flex items-center justify-center gap-2">
                <ConnectionIcon className="h-4 w-4" />
                <span>{isRequesting ? "Sending..." : connectionText}</span>
              </div>
            </Button>

            {/* Secondary Actions */}
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <Link to={listingId ? `/listing/${listingId}` : '#'} onClick={(e) => e.stopPropagation()} className="w-full">
                <Button
                  variant="ghost"
                  className={`w-full ${viewType === 'list' ? 'h-8' : 'h-9'} px-3 text-[12px] font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors`}
                  size="sm"
                >
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                  <span>Details</span>
                </Button>
              </Link>

              <Button
                variant="ghost"
                size="sm"
                className={`${viewType === 'list' ? 'h-8' : 'h-9'} px-3 text-[12px] font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors`}
                onClick={handleToggleSave}
                disabled={isSaving}
              >
                <Bookmark
                  className={`h-3.5 w-3.5 mr-1.5 transition-colors ${
                    isSaved ? "fill-current text-sourceco-accent" : "text-slate-500"
                  }`}
                />
                <span>{isSaved ? "Saved" : "Save"}</span>
              </Button>
            </div>
          </>
        )}
      </div>

      <ConnectionRequestDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSubmit={handleDialogSubmit}
        isSubmitting={isRequesting}
        listingTitle={listingTitle}
      />
    </>
  );
});

export default ListingCardActions;
