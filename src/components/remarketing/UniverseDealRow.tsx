import { useNavigate, useLocation } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Building2,
  MapPin,
  Sparkles,
  Target,
  MoreHorizontal,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { type UniverseDeal, type DealEngagement } from './useUniverseDealsFilters';
import { getDisplayLocation } from '@/lib/location-display';

export const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '\u2014';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

export const getScoreBg = (score: number) => {
  if (score >= 80)
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400';
  if (score >= 60) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400';
  if (score >= 40) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400';
  return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400';
};

interface UniverseDealRowProps {
  deal: UniverseDeal;
  engagement: DealEngagement;
  isSelected: boolean;
  onToggleSelect: (dealId: string) => void;
  onRemoveDeal?: (dealId: string, listingId: string) => void;
  onScoreDeal?: (listingId: string) => void;
  onEnrichDeal?: (listingId: string) => void;
  universeId?: string;
  w: (col: string) => number;
}

export const UniverseDealRow = ({
  deal,
  engagement,
  isSelected,
  onToggleSelect,
  onRemoveDeal,
  onScoreDeal,
  onEnrichDeal,
  universeId,
  w,
}: UniverseDealRowProps) => {
  const navigate = useNavigate();
  const routerLocation = useLocation();

  return (
    <TableRow
      key={deal.id}
      className={`cursor-pointer hover:bg-muted/50 ${isSelected ? 'bg-primary/5' : ''}`}
      onClick={() =>
        navigate(
          `/admin/deals/${deal.listing.id}`,
          { state: { from: universeId ? `/admin/buyers/universes/${universeId}` : routerLocation.pathname } },
        )
      }
    >
      <TableCell style={{ width: w('checkbox') }}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(deal.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${deal.listing.internal_company_name || deal.listing.title}`}
        />
      </TableCell>

      <TableCell style={{ width: w('name') }}>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-secondary/50 flex items-center justify-center flex-shrink-0">
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground truncate">
                {deal.listing.internal_company_name || deal.listing.title || 'Untitled Deal'}
              </span>
              {deal.listing.enriched_at && (
                <Badge variant="secondary" className="text-xs px-1.5 shrink-0">
                  <Sparkles className="h-3 w-3" />
                </Badge>
              )}
            </div>
            {(() => {
              const loc = getDisplayLocation(deal.listing);
              return (
                loc && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">{loc}</span>
                  </div>
                )
              );
            })()}
          </div>
        </div>
      </TableCell>

      <TableCell style={{ width: w('description') }}>
        {deal.listing.description || deal.listing.executive_summary ? (
          <p className="text-sm text-muted-foreground line-clamp-2 overflow-hidden">
            {deal.listing.description || deal.listing.executive_summary}
          </p>
        ) : (
          <span className="text-sm text-muted-foreground">&mdash;</span>
        )}
      </TableCell>

      <TableCell style={{ width: w('serviceArea') }}>
        <div className="flex flex-wrap gap-1">
          {deal.listing.geographic_states?.slice(0, 3).map((state) => (
            <Badge key={state} variant="outline" className="text-xs">
              {state}
            </Badge>
          ))}
          {(deal.listing.geographic_states?.length || 0) > 3 && (
            <Badge variant="outline" className="text-xs">
              +{(deal.listing.geographic_states?.length || 0) - 3}
            </Badge>
          )}
          {!deal.listing.geographic_states?.length && (
            <span className="text-xs text-muted-foreground">&mdash;</span>
          )}
        </div>
      </TableCell>

      <TableCell style={{ width: w('approved') }} className="text-center">
        {engagement.approved > 0 ? (
          <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20">
            {engagement.approved}
          </Badge>
        ) : (
          <span className="text-muted-foreground">&mdash;</span>
        )}
      </TableCell>

      <TableCell style={{ width: w('interested') }} className="text-center">
        {engagement.interested > 0 ? (
          <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20">
            {engagement.interested}
          </Badge>
        ) : (
          <span className="text-muted-foreground">&mdash;</span>
        )}
      </TableCell>

      <TableCell style={{ width: w('passed') }} className="text-center">
        {engagement.passed > 0 ? (
          <span className="text-sm text-muted-foreground">{engagement.passed}</span>
        ) : (
          <span className="text-muted-foreground">&mdash;</span>
        )}
      </TableCell>

      <TableCell style={{ width: w('added') }}>
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(deal.added_at), { addSuffix: true })}
        </span>
      </TableCell>

      <TableCell style={{ width: w('liCount') }} className="text-right">
        {deal.listing.linkedin_employee_count != null ? (
          <span className="text-sm tabular-nums">
            {deal.listing.linkedin_employee_count.toLocaleString()}
          </span>
        ) : (
          <span className="text-muted-foreground">&mdash;</span>
        )}
      </TableCell>

      <TableCell style={{ width: w('liRange') }} className="text-right">
        {deal.listing.linkedin_employee_range ? (
          <span className="text-sm">{deal.listing.linkedin_employee_range}</span>
        ) : (
          <span className="text-muted-foreground">&mdash;</span>
        )}
      </TableCell>

      <TableCell style={{ width: w('googleReviews') }} className="text-right">
        {deal.listing.google_review_count != null ? (
          <span className="text-sm tabular-nums">
            {deal.listing.google_review_count.toLocaleString()}
          </span>
        ) : (
          <span className="text-muted-foreground">&mdash;</span>
        )}
      </TableCell>

      <TableCell style={{ width: w('googleRating') }} className="text-right">
        {deal.listing.google_rating != null ? (
          <span className="text-sm tabular-nums">
            {'\u2B50'} {deal.listing.google_rating}
          </span>
        ) : (
          <span className="text-muted-foreground">&mdash;</span>
        )}
      </TableCell>

      <TableCell style={{ width: w('revenue') }} className="text-right">
        <span className="text-sm font-medium">{formatCurrency(deal.listing.revenue)}</span>
      </TableCell>

      <TableCell style={{ width: w('ebitda') }} className="text-right">
        <span className="text-sm">{formatCurrency(deal.listing.ebitda)}</span>
      </TableCell>

      <TableCell style={{ width: w('quality') }} className="text-center">
        {deal.listing.deal_total_score != null ? (
          <span
            className={`text-sm font-medium px-2 py-0.5 rounded ${getScoreBg(deal.listing.deal_total_score)}`}
          >
            {Math.round(deal.listing.deal_total_score)}
          </span>
        ) : (
          <span className="text-muted-foreground">&mdash;</span>
        )}
      </TableCell>

      <TableCell style={{ width: w('sellerInterest') }} className="text-center">
        {deal.listing.seller_interest_score != null ? (
          <span
            className={`text-sm font-medium px-2 py-0.5 rounded ${getScoreBg(deal.listing.seller_interest_score)}`}
          >
            {Math.round(deal.listing.seller_interest_score)}
          </span>
        ) : (
          <span className="text-muted-foreground">&mdash;</span>
        )}
      </TableCell>

      <TableCell style={{ width: w('score') }} className="text-center">
        {engagement.avgScore > 0 ? (
          <span
            className={`text-sm font-medium px-2 py-0.5 rounded ${getScoreBg(engagement.avgScore)}`}
          >
            {Math.round(engagement.avgScore)}
          </span>
        ) : (
          <span className="text-muted-foreground">&mdash;</span>
        )}
      </TableCell>

      <TableCell style={{ width: w('actions') }}>
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
                navigate(
                  `/admin/deals/${deal.listing.id}`,
                  universeId
                    ? { state: { from: `/admin/buyers/universes/${universeId}` } }
                    : undefined,
                );
              }}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Deal
            </DropdownMenuItem>
            {onScoreDeal && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onScoreDeal(deal.listing.id);
                }}
              >
                <Target className="h-4 w-4 mr-2" />
                Score Deal
              </DropdownMenuItem>
            )}
            {onEnrichDeal && !deal.listing.enriched_at && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEnrichDeal(deal.listing.id);
                }}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Enrich Deal
              </DropdownMenuItem>
            )}
            {onRemoveDeal && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveDeal(deal.id, deal.listing.id);
                }}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove from Universe
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};

export default UniverseDealRow;
