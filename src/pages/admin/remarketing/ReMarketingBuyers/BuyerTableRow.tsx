import { useNavigate, Link } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import {
  MoreHorizontal,
  Users,
  Building,
  Pencil,
  Trash2,
  ExternalLink,
  Sparkles,
  ListChecks,
} from 'lucide-react';
import { IntelligenceBadge } from '@/components/remarketing';
import { FlagForBuyerButton } from '@/components/daily-tasks/FlagForBuyerButton';
import { isSponsorType, findPeFirmByName, getBuyerTypeLabel } from './constants';
import type { BuyerTab } from './constants';

interface BuyerRecord {
  id: string;
  company_name: string;
  company_website?: string | null;
  buyer_type?: string | null;
  pe_firm_name?: string | null;
  hq_city?: string | null;
  hq_state?: string | null;
  business_summary?: string | null;
  thesis_summary?: string | null;
  alignment_score?: number | null;
  has_fee_agreement?: boolean | null;
  marketplace_firm_id?: string | null;
  firm_agreement?: { nda_signed?: boolean } | null;
  universe?: { name: string } | null;
}

interface BuyerTableRowProps {
  buyer: BuyerRecord;
  globalIdx: number;
  activeTab: BuyerTab;
  selectedIds: Set<string>;
  buyers: unknown[] | undefined;
  platformCountsByFirm: Map<string, number>;
  buyerIdsWithTranscripts: Set<string> | undefined;
  pendingTaskCount?: number;
  toggleSelect: (
    id: string,
    checked: boolean,
    event?: React.MouseEvent | React.KeyboardEvent,
  ) => void;
  handleEnrichBuyer: (e: React.MouseEvent, buyerId: string) => void;
  deleteMutation: { mutate: (id: string) => void };
}

const BuyerTableRow = ({
  buyer,
  globalIdx,
  activeTab,
  selectedIds,
  buyers,
  platformCountsByFirm,
  buyerIdsWithTranscripts,
  pendingTaskCount = 0,
  toggleSelect,
  handleEnrichBuyer,
  deleteMutation,
}: BuyerTableRowProps) => {
  const navigate = useNavigate();
  const isSponsor = isSponsorType(buyer.buyer_type);
  const detailPath = isSponsor ? `/admin/buyers/pe-firms/${buyer.id}` : `/admin/buyers/${buyer.id}`;

  return (
    <TableRow
      key={buyer.id}
      className="cursor-pointer hover:bg-muted/50 group"
      onClick={() => navigate(detailPath, { state: { from: '/admin/buyers' } })}
    >
      {/* Checkbox */}
      <TableCell
        onClick={(e) => {
          e.stopPropagation();
          toggleSelect(buyer.id, !selectedIds.has(buyer.id), e);
        }}
      >
        <Checkbox
          checked={selectedIds.has(buyer.id)}
          onCheckedChange={() => {
            /* handled by TableCell onClick for shift support */
          }}
        />
      </TableCell>

      {/* Row Number */}
      <TableCell className="text-xs text-muted-foreground tabular-nums">{globalIdx}</TableCell>

      {/* Name Column */}
      <TableCell>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            {isSponsor ? (
              <Building className="h-5 w-5 text-primary" />
            ) : (
              <Users className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground truncate">{buyer.company_name}</span>
              {pendingTaskCount > 0 && (
                <span
                  className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: '#FFF0F0', color: '#8B0000' }}
                  title={`${pendingTaskCount} open task${pendingTaskCount !== 1 ? 's' : ''}`}
                >
                  <ListChecks className="h-3 w-3" />
                  {pendingTaskCount}
                </span>
              )}
            </div>
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

      {activeTab === 'pe_firm' ? (
        <>
          {/* Type Column (PE Firms tab) */}
          <TableCell>
            <Badge variant="outline" className="text-xs">
              {getBuyerTypeLabel(buyer.buyer_type ?? null)}
            </Badge>
          </TableCell>

          {/* Platform Count Column */}
          <TableCell className="text-center">
            <span className="text-sm font-medium">
              {platformCountsByFirm.get(buyer.company_name) || 0}
            </span>
          </TableCell>

          {/* Fee Agreement Column */}
          <TableCell className="text-center">
            {buyer.has_fee_agreement ? (
              <span className="text-xs font-medium text-green-600">Yes</span>
            ) : (
              <span className="text-xs text-muted-foreground">No</span>
            )}
          </TableCell>

          {/* NDA Column */}
          <TableCell className="text-center">
            {buyer.firm_agreement?.nda_signed ? (
              <span className="text-xs font-medium text-green-600">Yes</span>
            ) : (
              <span className="text-xs text-muted-foreground">No</span>
            )}
          </TableCell>

          {/* Marketplace Column */}
          <TableCell className="text-center">
            {buyer.marketplace_firm_id ? (
              <span className="text-xs font-medium text-green-600">Yes</span>
            ) : (
              <span className="text-xs text-muted-foreground">No</span>
            )}
          </TableCell>

          {/* Intel Column */}
          <TableCell>
            <IntelligenceBadge
              hasTranscript={buyerIdsWithTranscripts?.has(buyer.id) || false}
              size="sm"
            />
          </TableCell>
        </>
      ) : (
        <>
          {/* PE Firm Column (All/Platform/other tabs) */}
          <TableCell onClick={(e) => e.stopPropagation()}>
            {buyer.pe_firm_name ? (
              (() => {
                const peFirm = findPeFirmByName(buyers || [], buyer.pe_firm_name!) as {
                  id: string;
                } | null;
                return peFirm ? (
                  <Link
                    to={`/admin/buyers/pe-firms/${peFirm.id}`}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    <div className="h-6 w-6 rounded bg-muted flex items-center justify-center">
                      <Building className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <span className="text-sm hover:underline">{buyer.pe_firm_name}</span>
                  </Link>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-muted flex items-center justify-center">
                      <Building className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <span className="text-sm text-muted-foreground">{buyer.pe_firm_name}</span>
                  </div>
                );
              })()
            ) : isSponsor ? (
              <Badge variant="outline" className="text-xs">
                {getBuyerTypeLabel(buyer.buyer_type ?? null)}
              </Badge>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </TableCell>

          {/* Universe Column */}
          <TableCell>
            {buyer.universe?.name ? (
              <Badge variant="secondary" className="text-xs">
                {buyer.universe.name}
              </Badge>
            ) : (
              <span className="text-muted-foreground text-sm">—</span>
            )}
          </TableCell>

          {/* Description Column */}
          <TableCell>
            {buyer.business_summary || buyer.thesis_summary ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-sm text-muted-foreground line-clamp-2 cursor-help">
                      {buyer.business_summary || buyer.thesis_summary}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-md whitespace-normal text-sm p-3">
                    {buyer.business_summary || buyer.thesis_summary}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </TableCell>

          {/* Marketplace Column */}
          <TableCell className="text-center">
            {buyer.marketplace_firm_id ? (
              <span className="text-xs font-medium text-green-600">Yes</span>
            ) : (
              <span className="text-xs text-muted-foreground">No</span>
            )}
          </TableCell>

          {/* Fee Agreement Column */}
          <TableCell className="text-center">
            {buyer.has_fee_agreement ? (
              <span className="text-xs font-medium text-green-600">Yes</span>
            ) : (
              <span className="text-xs text-muted-foreground">No</span>
            )}
          </TableCell>

          {/* NDA Column */}
          <TableCell className="text-center">
            {buyer.firm_agreement?.nda_signed ? (
              <span className="text-xs font-medium text-green-600">Yes</span>
            ) : (
              <span className="text-xs text-muted-foreground">No</span>
            )}
          </TableCell>

          {/* Intel Column */}
          <TableCell>
            <IntelligenceBadge
              hasTranscript={buyerIdsWithTranscripts?.has(buyer.id) || false}
              size="sm"
            />
          </TableCell>
        </>
      )}

      {/* Actions Column */}
      <TableCell>
        <div className="flex items-center gap-1">
          <FlagForBuyerButton buyerId={buyer.id} buyerName={buyer.company_name || 'Unknown'} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(detailPath, { state: { from: '/admin/buyers' } });
                }}
              >
                <Pencil className="h-4 w-4 mr-2" />
                {isSponsor ? 'View Firm' : 'Edit'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleEnrichBuyer(e, buyer.id);
                }}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Enrich
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Are you sure you want to delete this buyer?')) {
                    deleteMutation.mutate(buyer.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
};

export default BuyerTableRow;
