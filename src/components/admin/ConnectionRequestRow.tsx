/**
 * ConnectionRequestRow.tsx
 *
 * Individual row card for a connection request, plus helper sub-components
 * (CleanTierDisplay, StatusBadge, RequestDetails, FlagForReviewButton, etc.).
 */
import React, { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle,
  XCircle,
  User,
  Building2,
  Mail,
  Phone,
  AlertTriangle,
  MessageSquare,
  Shield,
  ExternalLink,
  Flag,
} from "lucide-react";
import { AdminConnectionRequest } from "@/types/admin";
import type { User as UserType } from "@/types";
import { User as AdminUsersUser } from "@/types/admin-users";
import { ConnectionRequestActions } from "./ConnectionRequestActions";
import { LeadRequestActions } from "./LeadRequestActions";
import { SourceBadge } from "./SourceBadge";
import { SourceLeadContext } from "./SourceLeadContext";
import { BuyerProfileHoverCard } from "./BuyerProfileHoverCard";
import { ExpandableBusinessProfile } from "./ExpandableBusinessProfile";
import { EnhancedBuyerProfile } from "./EnhancedBuyerProfile";
import { AssociatedContactsDisplay } from "./AssociatedContactsDisplay";
import { getBuyerTier } from "@/lib/buyer-metrics";
import { extractDomainFromEmail, mapRoleToBuyerType, getLeadTierInfo } from "@/lib/url-utils";
import { DuplicateChannelWarning } from "./DuplicateChannelWarning";
import { MessageConflictDisplay } from "./MessageConflictDisplay";
import { ConnectionRequestFirmBadge } from "./ConnectionRequestFirmBadge";
import { BuyerTierBadge, BuyerScoreBadge } from "./BuyerQualityBadges";
import { useFlagConnectionRequest } from "@/hooks/admin/use-flag-connection-request";
import { useAdminProfiles } from "@/hooks/admin/use-admin-profiles";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ---------- Helper utilities ----------

/** Enhanced company name formatting with real company in bold and clickable listing */
export const formatEnhancedCompanyName = (
  title: string,
  companyName?: string | null,
  listingId?: string,
) => {
  const content =
    companyName && companyName.trim() ? (
      <span>
        {title.split("/")[0]}/
        <span className="font-semibold">{companyName.trim()}</span>
      </span>
    ) : (
      <span>{title}</span>
    );

  if (listingId) {
    return (
      <button
        onClick={() => window.open(`/listing/${listingId}`, "_blank")}
        className="text-left hover:text-primary transition-colors group"
      >
        {content}
        <ExternalLink className="h-3 w-3 ml-1 inline opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    );
  }

  return content;
};

/** Buyer type abbreviations - comprehensive mapping */
export const getBuyerTypeAbbreviation = (buyerType: string): string => {
  if (!buyerType) return "Buyer";
  const normalized = buyerType.toLowerCase().replace(/[^a-z]/g, "");
  switch (normalized) {
    case "privateequity":
      return "PE";
    case "familyoffice":
      return "FO";
    case "searchfund":
      return "SF";
    case "corporate":
      return "Corp";
    case "individual":
      return "Individual";
    case "independentsponsor":
      return "IS";
    default:
      return "Buyer";
  }
};

// ---------- CleanTierDisplay ----------

export const CleanTierDisplay = ({
  user,
  leadRole,
}: {
  user: UserType | null | undefined;
  leadRole?: string;
}) => {
  const tierInfo = user ? getBuyerTier(user) : getLeadTierInfo(leadRole);
  const buyerTypeAbbrev = user
    ? getBuyerTypeAbbreviation(user?.buyer_type || "")
    : mapRoleToBuyerType(leadRole);

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`text-xs font-medium ${tierInfo.color} px-1.5 py-0.5 rounded-sm bg-background border border-current/20`}
      >
        {tierInfo.badge}
      </span>
      <span className="text-xs font-medium text-muted-foreground">{buyerTypeAbbrev}</span>
    </div>
  );
};

// ---------- StatusBadge ----------

export const StatusBadge = ({ status }: { status: string }) => {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case "approved":
        return {
          variant: "default" as const,
          className: "bg-success/10 text-success border-success/20",
          icon: <CheckCircle className="h-3 w-3 mr-1" />,
        };
      case "rejected":
        return {
          variant: "destructive" as const,
          className: "bg-destructive/10 text-destructive border-destructive/20",
          icon: <XCircle className="h-3 w-3 mr-1" />,
        };
      case "on_hold":
        return {
          variant: "secondary" as const,
          className: "bg-warning/10 text-warning border-warning/20",
          icon: <AlertTriangle className="h-3 w-3 mr-1" />,
        };
      default:
        return {
          variant: "secondary" as const,
          className: "bg-muted/50 text-muted-foreground border-border",
          icon: <Clock className="h-3 w-3 mr-1" />,
        };
    }
  };

  const config = getStatusConfig(status);
  const displayText =
    status === "on_hold" ? "On Hold" : status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <Badge variant={config.variant} className={`text-xs ${config.className}`}>
      {config.icon}
      {displayText}
    </Badge>
  );
};

// ---------- FlagForReviewButton ----------

export const FlagForReviewButton = ({ request }: { request: AdminConnectionRequest }) => {
  const [open, setOpen] = useState(false);
  const flagMutation = useFlagConnectionRequest();
  const { data: adminProfiles } = useAdminProfiles();
  const isFlagged = !!request.flagged_for_review;

  const adminList = adminProfiles
    ? Object.values(adminProfiles).sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      )
    : [];

  const handleFlag = (assignedToId: string) => {
    flagMutation.mutate({
      requestId: request.id,
      flagged: true,
      assignedTo: assignedToId,
    });
    setOpen(false);
  };

  const handleUnflag = (e: React.MouseEvent) => {
    e.stopPropagation();
    flagMutation.mutate({ requestId: request.id, flagged: false });
  };

  if (isFlagged) {
    const assignedName = request.flaggedAssignedToAdmin
      ? `${request.flaggedAssignedToAdmin.first_name || ""} ${request.flaggedAssignedToAdmin.last_name || ""}`.trim()
      : null;
    const flaggedByName = request.flaggedByAdmin
      ? `${request.flaggedByAdmin.first_name || ""} ${request.flaggedByAdmin.last_name || ""}`.trim()
      : null;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleUnflag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 hover:bg-orange-200 transition-colors"
            >
              <Flag className="h-8 w-8 fill-orange-500 text-orange-500" />
              {assignedName ? `For ${assignedName}` : "Flagged"}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            <p>{flaggedByName ? `Flagged by ${flaggedByName}` : "Flagged for review"}</p>
            {assignedName && <p>Assigned to {assignedName}</p>}
            <p className="text-muted-foreground mt-0.5">Click to remove flag</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium text-muted-foreground hover:text-orange-600 hover:bg-orange-50 border border-transparent hover:border-orange-200 transition-colors"
        >
          <Flag className="h-8 w-8" />
          Flag
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-2"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
          Flag for team member
        </p>
        <div className="max-h-48 overflow-y-auto">
          {adminList.map((admin) => (
            <button
              key={admin.id}
              onClick={() => handleFlag(admin.id)}
              className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
            >
              {admin.displayName}
            </button>
          ))}
          {adminList.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1.5">No team members found</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

// ---------- RequestDetails ----------

export const RequestDetails = ({ request }: { request: AdminConnectionRequest }) => {
  const handleListingClick = () => {
    if (request.listing?.id) {
      window.open(`/listing/${request.listing.id}`, "_blank");
    }
  };

  return (
    <div className="space-y-4">
      {/* Buyer & Listing Information - Clean inline layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Enhanced Buyer Information - handle lead-only requests */}
        <div className="space-y-3">
          {request.user ? (
            <EnhancedBuyerProfile user={request.user} />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border/40">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-card-foreground">
                  Lead Information
                </span>
                <Badge variant="outline" className="text-xs">
                  Lead-Only Request
                </Badge>
              </div>
              <div className="space-y-2 pl-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Name</span>
                  <span className="text-xs font-medium text-foreground">
                    {request.lead_name || "Unknown"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Email</span>
                  <span className="text-xs font-medium text-foreground">
                    {request.lead_email}
                  </span>
                </div>
                {request.lead_company && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Company</span>
                    <a
                      href={extractDomainFromEmail(request.lead_email)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-primary hover:text-primary/80 cursor-pointer transition-colors flex items-center gap-1 group"
                    >
                      {request.lead_company}
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  </div>
                )}
                {request.lead_role && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Role</span>
                    <span className="text-xs font-medium text-foreground">
                      {request.lead_role}
                    </span>
                  </div>
                )}
                {request.lead_phone && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      Phone
                    </span>
                    <a
                      href={`tel:${request.lead_phone}`}
                      className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      {(() => {
                        const phone = request.lead_phone.toString();
                        if (phone.length === 11 && phone.startsWith("1")) {
                          return phone.replace(/^1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");
                        }
                        if (phone.length === 10) {
                          return phone.replace(/^(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");
                        }
                        return phone;
                      })()}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Listing Information */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-border/40">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-card-foreground">
              Listing Information
            </span>
          </div>
          <div className="space-y-2 pl-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Title</span>
              <button
                onClick={handleListingClick}
                className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 group transition-all"
              >
                {request.listing?.title}
                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Category</span>
              <span className="text-xs font-medium text-foreground">
                {request.listing?.category}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Location</span>
              <span className="text-xs font-medium text-foreground">
                {request.listing?.location}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Business Profile - full width below grid */}
      {request.user && (
        <ExpandableBusinessProfile user={request.user as unknown as AdminUsersUser} />
      )}

      {/* Message Conflict Display */}
      <MessageConflictDisplay
        sourceMetadata={request.source_metadata}
        currentMessage={request.user_message}
        className="mb-4"
      />

      {/* Buyer Message - Only show if no conflicts detected */}
      {request.user_message &&
        !request.source_metadata?.has_duplicate_submission &&
        !request.source_metadata?.is_channel_duplicate && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border/40">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-card-foreground">Buyer Message</span>
            </div>
            <div className="border border-border/40 rounded-md p-3 bg-background/50">
              <p className="text-xs text-foreground leading-relaxed">{request.user_message}</p>
            </div>
          </div>
        )}

      {request.admin_comment && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Admin Response
          </h4>
          <div className="bg-success/10 border border-success/20 rounded-lg p-3">
            <p className="text-sm">{request.admin_comment}</p>
          </div>
        </div>
      )}

      {/* Source Lead Context and Duplicate Channel Warning */}
      <div className="space-y-3">
        <SourceLeadContext request={request} className="mt-4" />
        <DuplicateChannelWarning sourceMetadata={request.source_metadata} />
      </div>

      {/* Associated Contacts Display */}
      <AssociatedContactsDisplay connectionRequest={request} className="mt-4" />
    </div>
  );
};

// ---------- ReactiveRequestCard (main row component) ----------

export function ConnectionRequestRow({
  request,
  isExpanded,
  onToggleExpanded,
  unreadCount = 0,
  isSelected = false,
  onSelectionChange,
}: {
  request: AdminConnectionRequest;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  unreadCount?: number;
  isSelected?: boolean;
  onSelectionChange?: (checked: boolean) => void;
}) {
  return (
    <Card
      className={`border ${isSelected ? "border-primary/40 bg-primary/[0.02]" : "border-border/50 hover:border-border"} transition-colors`}
      data-request-id={request.id}
    >
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {/* Checkbox */}
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => onSelectionChange?.(!!checked)}
                className="mt-1 shrink-0"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  {request.user ? (
                    <BuyerProfileHoverCard
                      user={request.user as unknown as AdminUsersUser}
                    >
                      <h3 className="font-semibold text-base cursor-pointer hover:text-primary transition-colors">
                        {request.user?.first_name} {request.user?.last_name}
                      </h3>
                    </BuyerProfileHoverCard>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">
                        {request.lead_name ||
                          (
                            request.source_metadata as
                              | Record<string, string>
                              | undefined
                          )?.lead_name ||
                          "Lead Contact"}
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        Lead-Only
                      </Badge>
                    </div>
                  )}
                  <CleanTierDisplay user={request.user} leadRole={request.lead_role} />
                  <StatusBadge status={request.status} />
                  <SourceBadge source={request.source || "marketplace"} />
                  <ConnectionRequestFirmBadge requestId={request.id} compact={true} />
                  <FlagForReviewButton request={request} />
                  {request.user && (
                    <BuyerTierBadge tier={request.user?.buyer_tier ?? null} />
                  )}
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5" />
                    <div className="flex items-center gap-2">
                      <a
                        href={`mailto:${request.user?.email || request.lead_email}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary transition-colors flex items-center gap-1 group"
                      >
                        {request.user?.email || request.lead_email}
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                      {!request.user?.website && request.lead_company && (
                        <>
                          <span className="text-muted-foreground/60">&bull;</span>
                          <span className="text-sm">{request.lead_company}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5" />
                    {formatEnhancedCompanyName(
                      request.listing?.title || "",
                      request.listing?.internal_company_name,
                      request.listing?.id,
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {request.user && (
                <BuyerScoreBadge
                  score={request.user?.buyer_quality_score ?? null}
                  size="lg"
                  showLabel
                />
              )}
              <div className="text-right">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/70 font-semibold block leading-none mb-0.5">
                  Submitted
                </span>
                <span className="text-sm text-muted-foreground">
                  {format(new Date(request.created_at), "MMM d, yyyy")}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleExpanded}
                className="h-8 w-8 p-0"
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Unread message indicator */}
          {unreadCount > 0 && (
            <div className="flex items-center gap-1.5 px-1">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-medium text-primary">
                {unreadCount} unread message{unreadCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Expanded Content */}
          {isExpanded && (
            <div
              className="space-y-6 pt-4 border-t border-border/50"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Connection Request Actions */}
              {request.user ? (
                <ConnectionRequestActions
                  user={request.user}
                  listing={request.listing ?? undefined}
                  requestId={request.id}
                  requestStatus={request.status === 'converted' ? 'approved' : request.status === 'notified' || request.status === 'reviewed' ? 'pending' : request.status}
                  userMessage={request.user_message}
                  createdAt={request.created_at}
                  flaggedForReview={request.flagged_for_review}
                  flaggedByAdmin={request.flaggedByAdmin}
                  flaggedAssignedToAdmin={request.flaggedAssignedToAdmin}
                />
              ) : (
                <LeadRequestActions request={request} />
              )}

              {/* Mobile fallback for lead-only requests */}
              {!request.user && (
                <div className="block md:hidden">
                  <RequestDetails request={request} />
                </div>
              )}

              {/* Business Profile - full width below (for registered users only) */}
              {request.user && (
                <ExpandableBusinessProfile
                  user={request.user as unknown as AdminUsersUser}
                />
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ConnectionRequestRow;
