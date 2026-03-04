import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Search as SearchIcon,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  GripVertical,
  XCircle,
  Loader2,
  Unlink,
  Check,
} from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BuyerTableRow } from './BuyerTableRow';

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

type SortKey = 'company_name' | 'pe_firm_name' | 'alignment_score';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

interface ColumnWidths {
  platform: number;
  industryFit: number;
  peFirm: number;
  description: number;
  intel: number;
}

const DEFAULT_WIDTHS: ColumnWidths = {
  platform: 280,
  industryFit: 120,
  peFirm: 160,
  description: 400,
  intel: 120,
};

const MIN_WIDTH = 80;

interface BuyerTableEnhancedProps {
  buyers: BuyerRow[];
  onEnrich?: (buyerId: string) => void;
  onDelete?: (buyerId: string) => void;
  isEnriching?: string | null;
  showPEColumn?: boolean;
  scoringBuyerIds?: string[];
  /** Set of buyer IDs that have transcripts - needed to determine "Strong" vs "Some Intel" */
  buyerIdsWithTranscripts?: Set<string>;
  /** Enable multi-select mode with checkboxes */
  selectable?: boolean;
  /** Called when selection changes */
  onSelectionChange?: (selectedIds: string[]) => void;
  /** Called when user clicks "Remove from Universe" on selected items */
  onRemoveFromUniverse?: (buyerIds: string[]) => Promise<void>;
  /** Called when user clicks "Approve" on a single buyer row */
  onApprove?: (buyerId: string, buyerName: string) => void;
  /** Called when user clicks "Approve" on the bulk action bar */
  onBulkApprove?: (buyerIds: string[]) => void;
  /** When provided, back navigation from buyer detail returns to this universe */
  universeId?: string;
  /** Called when user toggles fee agreement on a buyer */
  onToggleFeeAgreement?: (buyerId: string, currentStatus: boolean) => void;
}

export const BuyerTableEnhanced = ({
  buyers,
  onEnrich,
  onDelete,
  isEnriching,
  showPEColumn = true,
  scoringBuyerIds = [],
  buyerIdsWithTranscripts = new Set(),
  selectable = false,
  onSelectionChange,
  onRemoveFromUniverse,
  onApprove,
  onBulkApprove,
  universeId,
  onToggleFeeAgreement,
}: BuyerTableEnhancedProps) => {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'company_name',
    direction: 'asc',
  });
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(DEFAULT_WIDTHS);
  const resizingRef = useRef<{
    column: keyof ColumnWidths;
    startX: number;
    startWidth: number;
  } | null>(null);

  const sortedBuyers = useMemo(() => {
    return [...buyers].sort((a, b) => {
      const { key, direction } = sortConfig;
      const multiplier = direction === 'asc' ? 1 : -1;

      switch (key) {
        case 'company_name':
          return multiplier * (a.company_name || '').localeCompare(b.company_name || '');

        case 'pe_firm_name': {
          const peA = a.pe_firm_name || '';
          const peB = b.pe_firm_name || '';
          if (!peA && !peB) return 0;
          if (!peA) return 1;
          if (!peB) return -1;
          return multiplier * peA.localeCompare(peB);
        }

        case 'alignment_score':
          // Null scores go to the end
          if (a.alignment_score == null && b.alignment_score == null) return 0;
          if (a.alignment_score == null) return 1;
          if (b.alignment_score == null) return -1;
          return multiplier * (a.alignment_score - b.alignment_score);

        default:
          return 0;
      }
    });
  }, [buyers, sortConfig]);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isRemoving, setIsRemoving] = useState(false);
  const lastClickedIndexRef = useRef<number | null>(null);

  const handleToggleSelect = useCallback(
    (buyerId: string, checked: boolean, event?: React.MouseEvent) => {
      // IMPORTANT: range selection must use the *visible row order* (sortedBuyers)
      // otherwise Shift+click appears to “skip” rows when the table is sorted.
      const currentIndex = sortedBuyers.findIndex((b) => b.id === buyerId);

      // Shift+click: select range from last clicked to current
      if (event?.shiftKey && lastClickedIndexRef.current !== null && currentIndex !== -1) {
        const start = Math.min(lastClickedIndexRef.current, currentIndex);
        const end = Math.max(lastClickedIndexRef.current, currentIndex);
        const rangeIds = sortedBuyers.slice(start, end + 1).map((b) => b.id);

        setSelectedIds((prev) => {
          const newSet = new Set(prev);
          rangeIds.forEach((id) => {
            if (checked) {
              newSet.add(id);
            } else {
              newSet.delete(id);
            }
          });
          onSelectionChange?.(Array.from(newSet));
          return newSet;
        });
        lastClickedIndexRef.current = currentIndex;
        return;
      }

      // Normal click: toggle single item
      lastClickedIndexRef.current = currentIndex;
      setSelectedIds((prev) => {
        const newSet = new Set(prev);
        if (checked) {
          newSet.add(buyerId);
        } else {
          newSet.delete(buyerId);
        }
        onSelectionChange?.(Array.from(newSet));
        return newSet;
      });
    },
    [sortedBuyers, onSelectionChange],
  );

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        const allIds = new Set(buyers.map((b) => b.id));
        setSelectedIds(allIds);
        onSelectionChange?.(Array.from(allIds));
      } else {
        setSelectedIds(new Set());
        onSelectionChange?.([]);
      }
      lastClickedIndexRef.current = null;
    },
    [buyers, onSelectionChange],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
    onSelectionChange?.([]);
    lastClickedIndexRef.current = null;
  }, [onSelectionChange]);

  const handleRemoveFromUniverse = useCallback(async () => {
    if (!onRemoveFromUniverse || selectedIds.size === 0) return;
    setIsRemoving(true);
    try {
      await onRemoveFromUniverse(Array.from(selectedIds));
      setSelectedIds(new Set());
      onSelectionChange?.([]);
    } finally {
      setIsRemoving(false);
    }
  }, [onRemoveFromUniverse, selectedIds, onSelectionChange]);

  const isAllSelected = buyers.length > 0 && selectedIds.size === buyers.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < buyers.length;

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleMouseDown = useCallback(
    (column: keyof ColumnWidths, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizingRef.current = {
        column,
        startX: e.clientX,
        startWidth: columnWidths[column],
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!resizingRef.current) return;
        const delta = moveEvent.clientX - resizingRef.current.startX;
        const newWidth = Math.max(MIN_WIDTH, resizingRef.current.startWidth + delta);
        setColumnWidths((prev) => ({
          ...prev,
          [resizingRef.current!.column]: newWidth,
        }));
      };

      const handleMouseUp = () => {
        resizingRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [columnWidths],
  );

  const SortButton = ({ label, sortKey }: { label: string; sortKey: SortKey }) => {
    const isActive = sortConfig.key === sortKey;
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-medium"
        onClick={() => handleSort(sortKey)}
      >
        {label}
        {isActive ? (
          sortConfig.direction === 'asc' ? (
            <ArrowUp className="ml-1 h-3 w-3" />
          ) : (
            <ArrowDown className="ml-1 h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
        )}
      </Button>
    );
  };

  const ResizeHandle = ({ column }: { column: keyof ColumnWidths }) => (
    <div
      className="absolute right-0 top-0 h-full w-1 cursor-col-resize group/resize hover:bg-primary/50 z-10"
      onMouseDown={(e) => handleMouseDown(column, e)}
    >
      <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/resize:opacity-100 transition-opacity">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );

  // Calculate colSpan for empty state
  const colSpan = (selectable ? 1 : 0) + 1 + 1 + (showPEColumn ? 1 : 0) + 1 + 1 + 1; // checkbox + platform + industryFit + peFirm? + description + intel + actions

  // Virtualization: only render visible rows + overscan buffer
  const ROW_HEIGHT = 56;
  const VIRTUALIZE_THRESHOLD = 50;
  const shouldVirtualize = sortedBuyers.length > VIRTUALIZE_THRESHOLD;
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: sortedBuyers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    enabled: shouldVirtualize,
  });

  // Reset virtualizer scroll when sort changes
  useEffect(() => {
    if (shouldVirtualize) {
      virtualizer.scrollToIndex(0);
    }
  }, [sortConfig, shouldVirtualize]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TooltipProvider>
      {/* Bulk Action Bar */}
      {selectable && selectedIds.size > 0 && (onRemoveFromUniverse || onBulkApprove) && (
        <div className="sticky top-0 z-20 bg-background border rounded-lg p-3 shadow-sm mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-sm font-medium">
              {selectedIds.size} selected
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              className="text-muted-foreground"
            >
              <XCircle className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {onBulkApprove && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => onBulkApprove(Array.from(selectedIds))}
              >
                <Check className="h-4 w-4 mr-1" />
                Approve {selectedIds.size}
              </Button>
            )}
            {onRemoveFromUniverse && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={handleRemoveFromUniverse}
                disabled={isRemoving}
              >
                {isRemoving ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Unlink className="h-4 w-4 mr-1" />
                )}
                Remove {selectedIds.size} from Universe
              </Button>
            )}
          </div>
        </div>
      )}

      <div ref={parentRef} className={shouldVirtualize ? 'max-h-[70vh] overflow-auto' : undefined}>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={isAllSelected}
                    ref={(ref) => {
                      if (ref) {
                        (ref as unknown as HTMLInputElement).indeterminate = isSomeSelected;
                      }
                    }}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              <TableHead className="relative" style={{ width: columnWidths.platform }}>
                <SortButton label="Platform / Buyer" sortKey="company_name" />
                <ResizeHandle column="platform" />
              </TableHead>
              <TableHead className="relative" style={{ width: columnWidths.industryFit }}>
                <SortButton label="Acquisition Fit" sortKey="alignment_score" />
                <ResizeHandle column="industryFit" />
              </TableHead>
              {showPEColumn && (
                <TableHead className="relative" style={{ width: columnWidths.peFirm }}>
                  <SortButton label="PE Firm" sortKey="pe_firm_name" />
                  <ResizeHandle column="peFirm" />
                </TableHead>
              )}
              <TableHead className="relative" style={{ width: columnWidths.description }}>
                Description
                <ResizeHandle column="description" />
              </TableHead>
              <TableHead className="relative" style={{ width: columnWidths.intel }}>
                Intel
                <ResizeHandle column="intel" />
              </TableHead>
              <TableHead className="w-[120px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedBuyers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-12 text-muted-foreground">
                  <SearchIcon className="h-8 w-8 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No buyers found</p>
                  <p className="text-sm">Add buyers manually or import from CSV</p>
                </TableCell>
              </TableRow>
            ) : shouldVirtualize ? (
              <>
                {/* Spacer for rows above viewport */}
                {virtualizer.getVirtualItems().length > 0 && (
                  <tr style={{ height: virtualizer.getVirtualItems()[0].start }} />
                )}
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const buyer = sortedBuyers[virtualRow.index];
                  return (
                    <BuyerTableRow
                      key={buyer.id}
                      buyer={buyer}
                      isEnriching={isEnriching ?? null}
                      isCurrentlyScoring={scoringBuyerIds.includes(buyer.id)}
                      showPEColumn={showPEColumn}
                      selectable={selectable}
                      isSelected={selectedIds.has(buyer.id)}
                      onToggleSelect={handleToggleSelect}
                      onEnrich={onEnrich}
                      onDelete={onDelete}
                      onToggleFeeAgreement={onToggleFeeAgreement}
                      onApprove={onApprove}
                      universeId={universeId}
                      hasTranscript={buyerIdsWithTranscripts.has(buyer.id)}
                    />
                  );
                })}
                {/* Spacer for rows below viewport */}
                {virtualizer.getVirtualItems().length > 0 && (
                  <tr
                    style={{
                      height:
                        virtualizer.getTotalSize() -
                        virtualizer.getVirtualItems()[virtualizer.getVirtualItems().length - 1].end,
                    }}
                  />
                )}
              </>
            ) : (
              sortedBuyers.map((buyer) => (
                <BuyerTableRow
                  key={buyer.id}
                  buyer={buyer}
                  isEnriching={isEnriching ?? null}
                  isCurrentlyScoring={scoringBuyerIds.includes(buyer.id)}
                  showPEColumn={showPEColumn}
                  selectable={selectable}
                  isSelected={selectedIds.has(buyer.id)}
                  onToggleSelect={handleToggleSelect}
                  onEnrich={onEnrich}
                  onDelete={onDelete}
                  onToggleFeeAgreement={onToggleFeeAgreement}
                  onApprove={onApprove}
                  universeId={universeId}
                  hasTranscript={buyerIdsWithTranscripts.has(buyer.id)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
};

export default BuyerTableEnhanced;
