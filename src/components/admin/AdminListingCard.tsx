import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Eye, EyeOff, Edit, Trash2, MoreHorizontal, Calendar, 
  MapPin, Building2, ExternalLink, Globe, ShieldCheck, Sparkles,
  UploadCloud, CloudOff
} from "lucide-react";
import { usePublishListing } from "@/hooks/admin/listings/use-publish-listing";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdminListing } from "@/types/admin";
import ListingStatusTag from "@/components/listing/ListingStatusTag";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency-utils";
import { CategoryLocationBadges } from "@/components/shared/CategoryLocationBadges";
import { StatusTagSwitcher } from "./StatusTagSwitcher";
import { BUYER_TYPE_OPTIONS } from "@/lib/signup-field-options";
import { LandingPageAnalytics } from "./LandingPageAnalytics";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AdminListingCardProps {
  listing: AdminListing;
  viewMode: 'grid' | 'table';
  listingType?: 'marketplace' | 'research' | 'all';
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onStatusTagChange?: (listingId: string, statusTag: string | null) => void;
}

export function AdminListingCard({
  listing,
  viewMode,
  isSelected,
  onSelect,
  onEdit,
  onToggleStatus,
  onDelete,
  onStatusTagChange,
}: AdminListingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();
  const { publishListing, unpublishListing, isPublishing } = usePublishListing();

  // Determine if listing is published (visible on marketplace)
  const isPublished = listing.is_internal_deal === false && listing.published_at;
  // Previously published but now unpublished (internal with audit trail)
  const wasPreviouslyPublished = listing.is_internal_deal !== false && !!listing.published_at;

  const displayCategories = listing.categories || (listing.category ? [listing.category] : []);
  const revenue = Number(listing.revenue) || 0;
  const ebitda = Number(listing.ebitda) || 0;

  // Buyer visibility helpers
  const isVisibleToAll = !listing.visible_to_buyer_types || listing.visible_to_buyer_types.length === 0;
  const visibleBuyerTypesCount = listing.visible_to_buyer_types?.length || 0;
  const visibleBuyerTypeLabels = listing.visible_to_buyer_types?.map(type => 
    BUYER_TYPE_OPTIONS.find(opt => opt.value === type)?.label || type
  ) || [];

  // Format date nicely
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (viewMode === 'table') {
    return (
      <Card className="hover:shadow-sm transition-all duration-200 border border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Checkbox
              checked={isSelected}
              onCheckedChange={onSelect}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
            
            <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
              {/* Title & Company */}
              <div className="md:col-span-2">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-foreground truncate">{listing.title}</h3>
                  {listing.status_tag && (
                    <ListingStatusTag status={listing.status_tag} className="scale-75" />
                  )}
                </div>
                {listing.internal_company_name && (
                  <p className="text-sm text-muted-foreground font-medium">
                    {listing.internal_company_name}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge 
                    variant="outline"
                    className={cn(
                      "text-[11px] font-medium",
                      listing.status === "active" 
                        ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" 
                        : "bg-muted text-muted-foreground border-border"
                    )}
                  >
                    {listing.status}
                  </Badge>
                  <Badge variant="outline" className="text-[11px] font-medium bg-background">
                    <MapPin className="h-3 w-3 mr-1" />
                    {listing.location}
                  </Badge>
                </div>
              </div>

              {/* Revenue */}
              <div className="text-center">
                <div className="text-sm font-medium text-foreground">{formatCurrency(revenue)}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Revenue</div>
              </div>

              {/* EBITDA */}
              <div className="text-center">
                <div className="text-sm font-medium text-foreground">{formatCurrency(ebitda)}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">EBITDA</div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onEdit} className="h-8 w-8 p-0">
                  <Edit className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onEdit}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate(`/admin/remarketing/matching/${listing.id}`)}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Match Buyers
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => isPublished ? unpublishListing(listing.id) : publishListing(listing.id)}
                      disabled={isPublishing}
                    >
                      {isPublished ? (
                        <>
                          <CloudOff className="h-4 w-4 mr-2" />
                          Remove from Marketplace
                        </>
                      ) : (
                        <>
                          <UploadCloud className="h-4 w-4 mr-2" />
                          Publish to Marketplace
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onToggleStatus}>
                      {listing.status === "active" ? (
                        <>
                          <EyeOff className="h-4 w-4 mr-2" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4 mr-2" />
                          Activate
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onDelete} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group hover:shadow-md transition-all duration-200 border border-border/50 bg-card overflow-hidden">
      {/* Image Container */}
      <div className="relative aspect-video">
        <div className="absolute inset-0 bg-gradient-to-br from-muted/50 to-muted flex items-center justify-center overflow-hidden">
          {listing.image_url ? (
            <img 
              src={listing.image_url} 
              alt={listing.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <Building2 className="h-12 w-12 text-muted-foreground/40" />
          )}
        </div>
        
        {/* Status Tag Overlay */}
        {listing.status_tag && (
          <div className="absolute top-3 left-3">
            <ListingStatusTag status={listing.status_tag} />
          </div>
        )}

        {/* Selection Checkbox */}
        <div className="absolute top-3 right-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            className="bg-background/90 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary shadow-sm"
          />
        </div>

        {/* Status Badges - Bottom */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {/* Active/Inactive dot indicator */}
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium backdrop-blur-sm",
              listing.status === "active" 
                ? "bg-emerald-500/90 text-white" 
                : "bg-muted/90 text-muted-foreground"
            )}>
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                listing.status === "active" ? "bg-white" : "bg-muted-foreground"
              )} />
              {listing.status === "active" ? "Active" : "Inactive"}
            </div>
          </div>
          
          <Badge 
            variant="outline"
            className={cn(
              "backdrop-blur-sm border-0 text-[11px] font-medium",
              isPublished 
                ? "bg-primary/90 text-primary-foreground" 
                : wasPreviouslyPublished
                  ? "bg-orange-500/90 text-white"
                  : "bg-amber-500/90 text-white"
            )}
          >
            {isPublished ? 'Published' : wasPreviouslyPublished ? 'Unpublished' : 'Draft'}
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-4">
        {/* Title and Company */}
        <div className="space-y-1">
          <h3 className="text-[15px] font-semibold leading-tight text-foreground line-clamp-2">
            {listing.title}
          </h3>
          {listing.internal_company_name && (
            <p className="text-xs font-medium text-muted-foreground">
              {listing.internal_company_name}
            </p>
          )}
        </div>

        {/* Tags - max 3 visible */}
        <div className="flex flex-wrap gap-1.5">
          <CategoryLocationBadges 
            acquisitionType={listing.acquisition_type}
            category={displayCategories[0]}
            location={listing.location}
          />
          {displayCategories.length > 1 && (
            <Badge variant="outline" className="text-[11px] font-medium bg-background border-border/60">
              +{displayCategories.length - 1}
            </Badge>
          )}
          {/* Visibility Badge */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[11px] font-medium",
                    isVisibleToAll 
                      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" 
                      : "bg-blue-500/10 text-blue-700 border-blue-500/20"
                  )}
                >
                  {isVisibleToAll ? (
                    <>
                      <Globe className="h-3 w-3 mr-1" />
                      All
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      {visibleBuyerTypesCount}
                    </>
                  )}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  {isVisibleToAll ? (
                    <p>Visible to all buyer types</p>
                  ) : (
                    <>
                      <p className="font-semibold mb-1">Visible only to:</p>
                      <ul className="list-disc list-inside">
                        {visibleBuyerTypeLabels.map((label) => (
                          <li key={label}>{label}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Divider */}
        <div className="border-t border-border/30" />

        {/* Financial Metrics - Inline */}
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground">{formatCurrency(revenue)}</span>
          <span className="text-muted-foreground/50">Revenue</span>
          <span className="text-muted-foreground/50 mx-1">·</span>
          <span className="font-medium text-foreground">{formatCurrency(ebitda)}</span>
          <span className="text-muted-foreground/50">EBITDA</span>
        </div>

        {/* Divider */}
        <div className="border-t border-border/30" />

        {/* Timestamps */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>{formatDate(listing.created_at)}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>Updated {formatDate(listing.updated_at)}</span>
        </div>

        {/* Status Tag Switcher (if callback provided) */}
        {onStatusTagChange && (
          <>
            <div className="border-t border-border/30" />
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 mb-2">Status Tag</div>
              <StatusTagSwitcher
                currentValue={listing.status_tag ?? null}
                onChange={(value) => onStatusTagChange(listing.id, value)}
              />
            </div>
          </>
        )}

        {/* Divider before actions */}
        <div className="border-t border-border/30" />

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={onEdit}
            className="flex-1 h-9 text-[13px] font-medium"
          >
            <Edit className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
          {isPublished ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => unpublishListing(listing.id)}
              disabled={isPublishing}
              className="h-9 px-3 text-[13px] font-medium text-emerald-700 border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10"
            >
              <Globe className="h-3.5 w-3.5 mr-1.5" />
              Live
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => publishListing(listing.id)}
              disabled={isPublishing}
              className="h-9 px-3 text-[13px] font-medium text-primary border-primary/30 bg-primary/5 hover:bg-primary/10"
            >
              <UploadCloud className="h-3.5 w-3.5 mr-1.5" />
              Publish
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleStatus}
            className="h-9 w-9 p-0"
          >
            {listing.status === "active" ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-9 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/admin/remarketing/matching/${listing.id}`)}>
                <Sparkles className="h-4 w-4 mr-2" />
                Match Buyers
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(`/listing/${listing.id}`, '_blank')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View Public Page
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => isPublished ? unpublishListing(listing.id) : publishListing(listing.id)}
                disabled={isPublishing}
              >
                {isPublished ? (
                  <>
                    <CloudOff className="h-4 w-4 mr-2" />
                    Remove from Marketplace
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4 mr-2" />
                    Publish to Marketplace
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsExpanded(!isExpanded)}>
                {isExpanded ? 'Hide Details' : 'Show Details'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="border-t border-border/30 pt-4 space-y-3 animate-in slide-in-from-top-5 duration-200">
            {listing.owner_notes && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 mb-1">Owner Notes</div>
                <p className="text-sm text-muted-foreground p-2 bg-muted/50 rounded">{listing.owner_notes}</p>
              </div>
            )}
            
            {listing.tags && listing.tags.length > 0 && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 mb-2">Tags</div>
                <div className="flex flex-wrap gap-1">
                  {listing.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* GAP D: Landing page analytics */}
            <LandingPageAnalytics listingId={listing.id} />
          </div>
        )}
      </div>
    </Card>
  );
}