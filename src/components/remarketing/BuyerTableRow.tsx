import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import {
  MoreHorizontal,
  Sparkles,
  Trash2,
  MapPin,
  Building,
  ExternalLink,
  DollarSign,
  FileCheck,
  Check,
} from 'lucide-react';
import { IntelligenceBadge } from './IntelligenceBadge';
import { AlignmentScoreBadge } from './AlignmentScoreBadge';
interface BuyerRow {
  id: string;
  company_name: string;
  company_website?: string | null;
  buyer_type?: string | null;
  pe_firm_name?: string | null;
  pe_firm_website?: string | null;
  hq_city?: string | null;
  hq_state?: string | null;
  thesis_summary?: string | null;
  business_summary?: string | null;
  target_geographies?: string[];
  geographic_footprint?: string[];
  has_fee_agreement?: boolean | null;
  fee_agreement_source?: string | null;
  alignment_score?: number | null;
  alignment_reasoning?: string | null;
  alignment_checked_at?: string | null;
}

interface BuyerTableRowProps {
  buyer: BuyerRow;
  isEnriching: string | null;
  isCurrentlyScoring: boolean;
  showPEColumn: boolean;
  selectable: boolean;
  isSelected: boolean;
  onToggleSelect: (buyerId: string, checked: boolean, event?: React.MouseEvent) => void;
  onEnrich?: (buyerId: string) => void;
  onDelete?: (buyerId: string) => void;
  onToggleFeeAgreement?: (buyerId: string, currentStatus: boolean) => void;
  onApprove?: (buyerId: string, buyerName: string) => void;
  universeId?: string;
  hasTranscript: boolean;
}

function getLocation(buyer: BuyerRow) {
  const parts = [];
  if (buyer.hq_city) parts.push(buyer.hq_city);
  if (buyer.hq_state) parts.push(buyer.hq_state);
  return parts.length > 0 ? parts.join(', ') : null;
}

function getFootprintSummary(buyer: BuyerRow) {
  const fp = buyer.geographic_footprint;
  if (!fp || fp.length === 0) return null;
  if (fp.length <= 4) return fp.join(', ');
  return `${fp.slice(0, 3).join(', ')} +${fp.length - 3} more`;
}

export const BuyerTableRow = memo(function BuyerTableRow({
  buyer,
  isEnriching,
  isCurrentlyScoring,
  showPEColumn,
  selectable,
  isSelected,
  onToggleSelect,
  onEnrich,
  onDelete,
  onToggleFeeAgreement,
  onApprove,
  universeId,
  hasTranscript,
}: BuyerTableRowProps) {
  const navigate = useNavigate();
  const location = getLocation(buyer);
  const isCurrentlyEnriching = isEnriching === buyer.id;

  return (
    <TableRow
      key={buyer.id}
      className={`cursor-pointer hover:bg-muted/50 group ${isSelected ? 'bg-muted/30' : ''}`}
      onClick={() =>
        navigate(
          `/admin/buyers/${buyer.id}`,
          universeId ? { state: { from: `/admin/buyers/universes/${universeId}` } } : undefined,
        )
      }
    >
      {selectable && (
        <TableCell
          className="select-none"
          onMouseDown={(e) => {
            if (e.shiftKey) e.preventDefault();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(buyer.id, !isSelected, e);
          }}
        >
          <Checkbox
            checked={isSelected}
            aria-label={`Select ${buyer.company_name}`}
            tabIndex={-1}
          />
        </TableCell>
      )}
      {/* Platform / Buyer Column */}
      <TableCell>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-foreground truncate">{buyer.company_name}</span>
              {buyer.has_fee_agreement && (
                <Badge
                  variant="default"
                  className={`text-xs px-1.5 py-0 flex items-center gap-1 ${
                    buyer.fee_agreement_source === 'pe_firm_inherited'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : buyer.fee_agreement_source === 'manual_override'
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  <DollarSign className="h-3 w-3" />
                  {buyer.fee_agreement_source === 'pe_firm_inherited'
                    ? `via ${buyer.pe_firm_name || 'PE Firm'}`
                    : buyer.fee_agreement_source === 'manual_override'
                      ? 'Manual'
                      : 'Fee Agreed'}
                </Badge>
              )}
            </div>
            {(location || getFootprintSummary(buyer)) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                <span>
                  {location || ''}
                  {location && getFootprintSummary(buyer) ? ' · ' : ''}
                  {getFootprintSummary(buyer) && (
                    <span className="text-muted-foreground/70">{getFootprintSummary(buyer)}</span>
                  )}
                </span>
              </div>
            )}
            {buyer.company_website && (
              <a
                href={buyer.company_website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                {buyer.company_website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </TableCell>

      {/* Acquisition Fit Column */}
      <TableCell>
        <AlignmentScoreBadge
          score={buyer.alignment_score ?? null}
          reasoning={buyer.alignment_reasoning}
          isScoring={isCurrentlyScoring}
        />
      </TableCell>

      {/* PE Firm Column */}
      {showPEColumn && (
        <TableCell>
          {buyer.pe_firm_name ? (
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-muted flex items-center justify-center">
                <Building className="h-3 w-3 text-muted-foreground" />
              </div>
              {buyer.pe_firm_website ? (
                <a
                  href={buyer.pe_firm_website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {buyer.pe_firm_name}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-sm">{buyer.pe_firm_name}</span>
              )}
            </div>
          ) : buyer.buyer_type === 'private_equity' ? (
            <Badge variant="outline" className="text-xs">
              PE Firm
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </TableCell>
      )}

      {/* Description Column — prefer alignment_reasoning when available */}
      <TableCell>
        {buyer.alignment_reasoning || buyer.business_summary || buyer.thesis_summary ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-sm text-muted-foreground line-clamp-2 cursor-help">
                  {buyer.alignment_reasoning || buyer.business_summary || buyer.thesis_summary}
                </p>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-md whitespace-normal text-sm p-3">
                {buyer.alignment_reasoning || buyer.business_summary || buyer.thesis_summary}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Intel Column */}
      <TableCell>
        <IntelligenceBadge hasTranscript={hasTranscript} size="sm" />
      </TableCell>

      {/* Actions Column */}
      <TableCell>
        <div className="flex items-center gap-1">
          {onApprove && (
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
              onClick={(e) => {
                e.stopPropagation();
                onApprove(buyer.id, buyer.company_name);
              }}
            >
              <Check className="h-3 w-3 mr-1" />
              Approve
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEnrich && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onEnrich(buyer.id);
                  }}
                  disabled={isCurrentlyEnriching}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {isCurrentlyEnriching ? 'Enriching...' : 'Enrich Data'}
                </DropdownMenuItem>
              )}
              {onToggleFeeAgreement && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFeeAgreement(buyer.id, buyer.has_fee_agreement || false);
                  }}
                  className={buyer.has_fee_agreement ? 'text-green-600' : ''}
                >
                  <FileCheck
                    className={`mr-2 h-4 w-4 ${buyer.has_fee_agreement ? 'text-green-600' : ''}`}
                  />
                  {buyer.has_fee_agreement ? 'Remove Fee Agreement' : 'Mark Fee Agreement'}
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(buyer.id);
                  }}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
});
