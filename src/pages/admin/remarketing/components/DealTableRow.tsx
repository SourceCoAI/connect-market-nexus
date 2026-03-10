import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TableCell, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Building2,
  ThumbsUp,
  ThumbsDown,
  Users,
  ExternalLink,
  Target,
  Globe,
  Sparkles,
  MoreHorizontal,
  Archive,
  Star,
  Trash2,
  PhoneCall,
  Search,
  Network,
  GitBranch,
  GripVertical,
  Ban,
  Undo2,
} from 'lucide-react';
import { format } from 'date-fns';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { getDisplayLocation } from '@/lib/location-display';
import type { DealListing, ColumnWidths } from '../types';
import { EditableRankCell } from './EditableRankCell';

export const DealTableRow = ({
  listing,
  index,
  stats,
  navigate,
  formatCurrency,
  formatWebsiteDomain,
  getEffectiveWebsite,
  columnWidths,
  isSelected,
  onToggleSelect,
  onArchive,
  onDelete,
  onTogglePriority,
  onToggleUniverseBuild,
  onToggleBuyerSearch,
  onUpdateRank,
  onMarkNotAFit,
  adminProfiles,
  onAssignOwner,
  universesByListing,
  pipelineCount,
}: {
  listing: DealListing;
  index: number;
  stats: { totalMatches?: number; approved?: number; passed?: number } | null;
  navigate: (path: string, options?: { state?: Record<string, unknown> }) => void;
  formatCurrency: (value: number | null) => string;
  formatWebsiteDomain: (url: string | null) => string | null;
  getEffectiveWebsite: (listing: DealListing) => string | null;
  formatGeographyBadges: (states: string[] | null) => string | null;
  getScoreTrendIcon: (score: number) => JSX.Element;
  columnWidths: ColumnWidths;
  isSelected: boolean;
  onToggleSelect: (
    dealId: string,
    checked: boolean,
    event?: React.MouseEvent | React.KeyboardEvent,
  ) => void;
  onArchive: (dealId: string, dealName: string) => void;
  onDelete: (dealId: string, dealName: string) => void;
  onTogglePriority: (dealId: string, currentStatus: boolean) => void;
  onToggleUniverseBuild: (dealId: string, currentStatus: boolean) => void;
  onToggleBuyerSearch: (dealId: string, currentStatus: boolean) => void;
  onUpdateRank: (dealId: string, newRank: number) => Promise<void> | void;
  onMarkNotAFit?: (dealId: string, dealName: string) => void;
  onRemoveNotAFit?: (dealId: string) => void;
  adminProfiles?: Record<
    string,
    { id: string; email: string; first_name: string; last_name: string; displayName: string }
  >;
  onAssignOwner: (dealId: string, ownerId: string | null) => void;
  universesByListing?: Record<string, { id: string; name: string }[]>;
  pipelineCount?: number;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: listing.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const effectiveWebsite = getEffectiveWebsite(listing);
  const domain = formatWebsiteDomain(effectiveWebsite);
  const isEnriched = !!listing.enriched_at;
  const displayName = listing.internal_company_name || listing.title;
  const needsOwnerContact = !!listing.needs_owner_contact;
  const needsBuyerSearch = !!listing.needs_buyer_search;
  const needsUniverseBuild = !!listing.universe_build_flagged;

  // Buyer universe membership for this listing
  const listingUniverses = universesByListing?.[listing.id] || [];
  const hasUniverses = listingUniverses.length > 0;

  const geographyDisplay = getDisplayLocation(listing);
  const qualityScore = listing.deal_total_score ?? null;

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        'cursor-pointer hover:bg-muted/50',
        isDragging && 'bg-muted/80 opacity-80 shadow-lg z-50',
        listing.not_a_fit && 'opacity-50 bg-muted/30',
        !listing.not_a_fit &&
          listing.is_priority_target &&
          'bg-amber-50 hover:bg-amber-100/80 dark:bg-amber-950/30 dark:hover:bg-amber-950/50',
      )}
      onClick={() => navigate(`/admin/deals/${listing.id}`, { state: { from: '/admin/deals' } })}
    >
      {/* Checkbox */}
      <TableCell
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(listing.id, !isSelected, e);
        }}
        style={{ width: columnWidths.select, minWidth: 40 }}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => {
            /* handled by TableCell onClick for shift support */
          }}
        />
      </TableCell>

      {/* Rank (draggable) */}
      <TableCell
        style={{ width: columnWidths.rank, minWidth: 50 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none p-0.5 rounded hover:bg-muted transition-colors"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <EditableRankCell
            value={index + 1}
            onSave={(newRank) => onUpdateRank(listing.id, newRank)}
          />
        </div>
      </TableCell>

      {/* Deal Name — red cell if needs owner contact, blue if needs buyer search */}
      <TableCell
        style={{ width: columnWidths.dealName, minWidth: 100 }}
        className={cn(
          needsOwnerContact && 'bg-red-100 border-l-2 border-red-500 dark:bg-red-950/40',
          !needsOwnerContact &&
            needsBuyerSearch &&
            'bg-blue-100 border-l-2 border-blue-500 dark:bg-blue-950/40',
        )}
      >
        <div>
          {/* Name + inline status icons */}
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-foreground leading-tight">{displayName}</p>
            {listing.not_a_fit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700 border border-orange-200 shrink-0">
                    <Ban className="h-2.5 w-2.5" />
                    Not a Fit
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{listing.not_a_fit_reason || 'No reason provided'}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {isEnriched && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center">
                    <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Enriched on {format(new Date(listing.enriched_at!), 'MMM d, yyyy')}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {needsOwnerContact && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center">
                    <PhoneCall className="h-3.5 w-3.5 text-red-500 animate-pulse shrink-0" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-semibold">Owner needs to be contacted — buyer is ready!</p>
                </TooltipContent>
              </Tooltip>
            )}
            {needsBuyerSearch && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center">
                    <Search className="h-3.5 w-3.5 text-blue-500 animate-pulse shrink-0" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-semibold">Need to find a buyer for this deal</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {/* Website under name */}
          {effectiveWebsite && domain && (
            <a
              href={
                effectiveWebsite.startsWith('http')
                  ? effectiveWebsite
                  : `https://${effectiveWebsite}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <Globe className="h-3 w-3 shrink-0" />
              <span className="truncate">{domain}</span>
            </a>
          )}
        </div>
      </TableCell>

      {/* Marketplace */}
      <TableCell style={{ width: columnWidths.referralSource, minWidth: 60 }}>
        {listing.is_internal_deal === false ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            Yes
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No</span>
        )}
      </TableCell>

      {/* Industry */}
      <TableCell style={{ width: columnWidths.industry, minWidth: 60 }}>
        {(() => {
          const industryVal = listing.industry || listing.category;
          return industryVal ? (
            <span className="text-sm text-muted-foreground truncate max-w-[120px] block">
              {industryVal.length > 18 ? industryVal.substring(0, 18) + '...' : industryVal}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        })()}
      </TableCell>

      {/* Buyer Universe (new column) */}
      <TableCell
        style={{ width: columnWidths.buyerUniverse, minWidth: 100 }}
        onClick={(e) => e.stopPropagation()}
        className={cn(!hasUniverses && needsUniverseBuild && 'bg-green-50 dark:bg-green-950/30')}
      >
        {hasUniverses ? (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-green-50 text-green-700 border-green-200 truncate max-w-[110px]">
              {listingUniverses[0].name}
            </span>
            {listingUniverses.length > 1 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium border bg-green-50 text-green-700 border-green-200 cursor-default">
                    +{listingUniverses.length - 1}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-0.5">
                    {listingUniverses.slice(1).map((u) => (
                      <p key={u.id} className="text-xs">
                        {u.name}
                      </p>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        ) : needsUniverseBuild ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">
            <Network className="h-3 w-3 shrink-0" />
            Needs Creation
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Description */}
      <TableCell style={{ width: columnWidths.description, minWidth: 120 }}>
        {(() => {
          const descText = listing.executive_summary || listing.description;
          return descText ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="text-sm text-muted-foreground leading-tight line-clamp-3 cursor-default"
                  style={{ maxWidth: columnWidths.description - 16 }}
                >
                  {descText}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">{descText}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        })()}
      </TableCell>

      {/* Location */}
      <TableCell style={{ width: columnWidths.location, minWidth: 60 }}>
        {geographyDisplay ? (
          <span className="text-sm">{geographyDisplay}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Revenue */}
      <TableCell
        className="text-right font-medium"
        style={{ width: columnWidths.revenue, minWidth: 60 }}
      >
        {formatCurrency(listing.revenue)}
      </TableCell>

      {/* EBITDA */}
      <TableCell
        className="text-right font-medium"
        style={{ width: columnWidths.ebitda, minWidth: 60 }}
      >
        {formatCurrency(listing.ebitda)}
      </TableCell>

      {/* LinkedIn Employee Count */}
      <TableCell className="text-right" style={{ width: columnWidths.linkedinCount, minWidth: 50 }}>
        {listing.linkedin_employee_count ? (
          <div className="text-sm flex items-center justify-end gap-1">
            <span>{listing.linkedin_employee_count.toLocaleString()}</span>
            <span className="text-xs text-blue-500 font-medium">LI</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* LinkedIn Employee Range */}
      <TableCell className="text-right" style={{ width: columnWidths.linkedinRange, minWidth: 50 }}>
        {listing.linkedin_employee_range ? (
          <span className="text-sm text-muted-foreground">{listing.linkedin_employee_range}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Google Reviews */}
      <TableCell className="text-right" style={{ width: columnWidths.googleReviews, minWidth: 50 }}>
        {listing.google_review_count != null ? (
          <span className="text-sm tabular-nums">
            {listing.google_review_count.toLocaleString()}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Google Rating */}
      <TableCell className="text-right" style={{ width: columnWidths.googleRating, minWidth: 50 }}>
        {listing.google_rating != null ? (
          <span className="text-sm tabular-nums">⭐ {listing.google_rating}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Deal Quality Score */}
      <TableCell className="text-center" style={{ width: columnWidths.quality, minWidth: 50 }}>
        {qualityScore !== null ? (
          <div className="flex items-center justify-center gap-1.5">
            <span
              className={cn(
                'text-sm font-medium px-2 py-0.5 rounded',
                qualityScore >= 80
                  ? 'bg-green-100 text-green-700'
                  : qualityScore >= 60
                    ? 'bg-blue-100 text-blue-700'
                    : qualityScore >= 40
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700',
              )}
            >
              {Math.round(qualityScore)}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>

      {/* Engagement */}
      <TableCell style={{ width: columnWidths.engagement, minWidth: 80 }}>
        <div className="flex items-center justify-center gap-3 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>{stats?.totalMatches || 0}</span>
          </div>
          <div className="flex items-center gap-1 text-green-600">
            <ThumbsUp className="h-3.5 w-3.5" />
            <span>{stats?.approved || 0}</span>
          </div>
          <div className="flex items-center gap-1 text-red-500">
            <ThumbsDown className="h-3.5 w-3.5" />
            <span>{stats?.passed || 0}</span>
          </div>
        </div>
      </TableCell>

      {/* Pipeline */}
      <TableCell className="text-center" style={{ width: columnWidths.pipeline, minWidth: 70 }}>
        {pipelineCount && pipelineCount > 0 ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
            <GitBranch className="h-3 w-3" />
            {pipelineCount} {pipelineCount === 1 ? 'buyer' : 'buyers'}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Deal Owner */}
      <TableCell
        style={{ width: columnWidths.dealOwner, minWidth: 80 }}
        onClick={(e) => e.stopPropagation()}
      >
        <Select
          value={listing.deal_owner_id || '__none'}
          onValueChange={(val) => onAssignOwner(listing.id, val === '__none' ? null : val)}
        >
          <SelectTrigger className="h-7 text-xs border-dashed w-full">
            <SelectValue placeholder="Assign...">
              {listing.deal_owner?.first_name ? (
                `${listing.deal_owner.first_name} ${listing.deal_owner.last_name || ''}`.trim()
              ) : listing.deal_owner_id && adminProfiles?.[listing.deal_owner_id] ? (
                adminProfiles[listing.deal_owner_id].displayName
              ) : (
                <span className="text-muted-foreground">Assign...</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">
              <span className="text-muted-foreground">Unassigned</span>
            </SelectItem>
            {adminProfiles &&
              Object.values(adminProfiles).map((admin) => (
                <SelectItem key={admin.id} value={admin.id}>
                  {admin.displayName}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </TableCell>

      {/* Added date */}
      <TableCell
        className="text-muted-foreground text-sm"
        style={{ width: columnWidths.added, minWidth: 60 }}
      >
        {format(new Date(listing.created_at), 'MM/dd/yyyy')}
      </TableCell>

      {/* Priority */}
      <TableCell className="text-center" style={{ width: columnWidths.priority, minWidth: 50 }}>
        {listing.is_priority_target ? (
          <Star className="h-4 w-4 fill-amber-400 text-amber-400 mx-auto" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Actions */}
      <TableCell style={{ width: columnWidths.actions, minWidth: 40 }}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/admin/deals/${listing.id}`, { state: { from: '/admin/deals' } });
              }}
            >
              <Building2 className="h-4 w-4 mr-2" />
              View Deal
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/admin/remarketing/matching/${listing.id}`);
              }}
            >
              <Target className="h-4 w-4 mr-2" />
              Match Buyers
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/listing/${listing.id}`);
              }}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Listing
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onTogglePriority(listing.id, listing.is_priority_target || false);
              }}
              className={listing.is_priority_target ? 'text-amber-600' : ''}
            >
              <Star
                className={cn('h-4 w-4 mr-2', listing.is_priority_target && 'fill-amber-500')}
              />
              {listing.is_priority_target ? 'Remove Priority' : 'Mark as Priority'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onToggleUniverseBuild(listing.id, listing.universe_build_flagged || false);
              }}
              className={listing.universe_build_flagged ? 'text-blue-600' : ''}
            >
              <Network
                className={cn('h-4 w-4 mr-2', listing.universe_build_flagged && 'text-blue-600')}
              />
              {listing.universe_build_flagged
                ? 'Remove Universe Build Flag'
                : 'Flag: Build Buyer Universe'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onToggleBuyerSearch(listing.id, listing.needs_buyer_search || false);
              }}
              className={listing.needs_buyer_search ? 'text-blue-600' : ''}
            >
              <Search
                className={cn('h-4 w-4 mr-2', listing.needs_buyer_search && 'text-blue-600')}
              />
              {listing.needs_buyer_search ? 'Remove Find Buyer Flag' : 'Flag: Find Buyer'}
            </DropdownMenuItem>
            {listing.not_a_fit ? (
              <DropdownMenuItem
                onClick={async (e) => {
                  e.stopPropagation();
                  const { error } = await supabase
                    .from('listings')
                    .update({ not_a_fit: false, not_a_fit_reason: null } as never)
                    .eq('id', listing.id);
                  if (!error) {
                    toast.success('Removed Not a Fit status');
                    queryClient.invalidateQueries({ queryKey: ['remarketing'] });
                  }
                }}
                className="text-green-600"
              >
                <Undo2 className="h-4 w-4 mr-2" />
                Remove Not a Fit
              </DropdownMenuItem>
            ) : onMarkNotAFit ? (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkNotAFit(listing.id, displayName || 'Unknown Deal');
                }}
              >
                <Ban className="h-4 w-4 mr-2" />
                Mark as Not a Fit
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onArchive(listing.id, displayName || 'Unknown Deal');
              }}
              className="text-amber-600 focus:text-amber-600"
            >
              <Archive className="h-4 w-4 mr-2" />
              Archive Deal
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete(listing.id, displayName || 'Unknown Deal');
              }}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Deal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
