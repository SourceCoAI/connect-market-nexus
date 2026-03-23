import { useState, useCallback, useMemo } from 'react';
import { formatCompactCurrency } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useShiftSelect } from '@/hooks/useShiftSelect';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast as sonnerToast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpDown,
  CheckCircle2,
  MoreHorizontal,
  ExternalLink,
  Star,
  Sparkles,
  Phone,
  Network,
  Archive,
  Calculator,
  ThumbsDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { ValuationLead, SortColumn } from './types';
import { extractBusinessName, inferWebsite } from './helpers';
import { scorePillClass, exitTimingBadge, qualityBadge, calculatorBadge } from './BadgeComponents';

const DEFAULT_COL_WIDTHS: Record<string, number> = {
  company: 160,
  description: 200,
  calculator: 110,
  industry: 130,
  location: 110,
  owner: 130,
  revenue: 90,
  ebitda: 90,
  valuation: 100,
  exit: 80,
  intros: 70,
  quality: 80,
  score: 65,
  added: 90,
  status: 90,
};

interface ValuationLeadsTableProps {
  paginatedLeads: ValuationLead[];
  activeTab: string;
  sortColumn: SortColumn;
  sortDirection: string;
  handleSort: (col: SortColumn) => void;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  allSelected: boolean;
  toggleSelectAll: () => void;
  toggleSelect: (id: string, e?: React.MouseEvent) => void;
  handleRowClick: (lead: ValuationLead) => void;
  handleOpenDeal: (lead: ValuationLead) => void;
  handlePushToAllDeals: (leadIds: string[]) => void;
  handleReEnrich: (leadIds: string[]) => void;
  handlePushAndEnrich: (leadIds: string[]) => void;
  handleMarkNotFit: (leadIds: string[]) => void;
  handleAssignOwner: (lead: ValuationLead, ownerId: string | null) => void;
  adminProfiles: Record<string, { id: string; displayName: string }> | undefined;
  safePage: number;
  PAGE_SIZE: number;
  refetch: () => void;
}

export function ValuationLeadsTable({
  paginatedLeads,
  activeTab,
  sortColumn,
  sortDirection: _sortDirection,
  handleSort,
  selectedIds,
  setSelectedIds,
  allSelected,
  toggleSelectAll,
  toggleSelect: _toggleSelect,
  handleRowClick,
  handleOpenDeal,
  handlePushToAllDeals,
  handleReEnrich,
  handlePushAndEnrich,
  handleMarkNotFit,
  handleAssignOwner,
  adminProfiles,
  safePage,
  PAGE_SIZE,
  refetch,
}: ValuationLeadsTableProps) {
  
  const queryClient = useQueryClient();

  const orderedIds = useMemo(() => paginatedLeads.map((l) => l.id), [paginatedLeads]);
  const { handleToggle: handleShiftToggle } = useShiftSelect(
    orderedIds,
    selectedIds,
    setSelectedIds,
  );

  const [colWidths, setColWidths] = useState<Record<string, number>>(DEFAULT_COL_WIDTHS);

  const startResize = useCallback(
    (col: string, e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = colWidths[col] ?? DEFAULT_COL_WIDTHS[col] ?? 120;
      const onMouseMove = (mv: MouseEvent) => {
        const newW = Math.max(60, startW + mv.clientX - startX);
        setColWidths((prev) => ({ ...prev, [col]: newW }));
      };
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [colWidths],
  );

  const SortHeader = ({ column, children }: { column: SortColumn; children: React.ReactNode }) => (
    <button
      className="flex items-center gap-1 hover:text-foreground transition-colors"
      onClick={() => handleSort(column)}
    >
      {children}
      <ArrowUpDown
        className={cn(
          'h-3 w-3',
          sortColumn === column ? 'text-foreground' : 'text-muted-foreground/50',
        )}
      />
    </button>
  );

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: 40 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: colWidths.company }} />
              <col style={{ width: colWidths.description }} />
              {activeTab === 'all' && <col style={{ width: colWidths.calculator }} />}
              <col style={{ width: colWidths.industry }} />
              <col style={{ width: colWidths.location }} />
              <col style={{ width: colWidths.owner }} />
              <col style={{ width: colWidths.revenue }} />
              <col style={{ width: colWidths.ebitda }} />
              <col style={{ width: colWidths.valuation }} />
              <col style={{ width: colWidths.exit }} />
              <col style={{ width: colWidths.intros }} />
              <col style={{ width: colWidths.quality }} />
              <col style={{ width: colWidths.score }} />
              <col style={{ width: colWidths.added }} />
              <col style={{ width: colWidths.status }} />
              <col style={{ width: 50 }} />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                </TableHead>
                <TableHead className="w-[40px] text-center text-muted-foreground">#</TableHead>
                {(['company', 'description'] as const).map((col) => (
                  <TableHead
                    key={col}
                    className="relative overflow-visible"
                    style={{ width: colWidths[col] }}
                  >
                    {col === 'company' ? (
                      <SortHeader column="display_name">Company</SortHeader>
                    ) : (
                      'Description'
                    )}
                    <div
                      onMouseDown={(e) => startResize(col, e)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 select-none z-10"
                    />
                  </TableHead>
                ))}
                {activeTab === 'all' && (
                  <TableHead
                    className="relative overflow-visible"
                    style={{ width: colWidths.calculator }}
                  >
                    Calculator
                    <div
                      onMouseDown={(e) => startResize('calculator', e)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 select-none z-10"
                    />
                  </TableHead>
                )}
                {(
                  [
                    'industry',
                    'location',
                    'owner',
                    'revenue',
                    'ebitda',
                    'valuation',
                    'exit',
                    'intros',
                    'quality',
                    'score',
                    'added',
                    'status',
                    'priority',
                  ] as const
                ).map((col) => (
                  <TableHead
                    key={col}
                    className="relative overflow-visible"
                    style={{
                      width: colWidths[col],
                      textAlign: ['revenue', 'ebitda', 'valuation'].includes(col)
                        ? 'right'
                        : ['intros', 'priority'].includes(col)
                          ? 'center'
                          : undefined,
                    }}
                  >
                    {col === 'industry' && <SortHeader column="industry">Industry</SortHeader>}
                    {col === 'location' && <SortHeader column="location">Location</SortHeader>}
                    {col === 'owner' && <SortHeader column="owner">Deal Owner</SortHeader>}
                    {col === 'revenue' && <SortHeader column="revenue">Revenue</SortHeader>}
                    {col === 'ebitda' && <SortHeader column="ebitda">EBITDA</SortHeader>}
                    {col === 'valuation' && <SortHeader column="valuation">Valuation</SortHeader>}
                    {col === 'exit' && <SortHeader column="exit_timing">Exit</SortHeader>}
                    {col === 'intros' && <SortHeader column="intros">Intros</SortHeader>}
                    {col === 'quality' && <SortHeader column="quality">Quality</SortHeader>}
                    {col === 'score' && <SortHeader column="score">Score</SortHeader>}
                    {col === 'added' && <SortHeader column="created_at">Added</SortHeader>}
                    {col === 'status' && <SortHeader column="pushed">Status</SortHeader>}
                    {col === 'priority' && <SortHeader column="priority">Priority</SortHeader>}
                    <div
                      onMouseDown={(e) => startResize(col, e)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 select-none z-10"
                    />
                  </TableHead>
                ))}
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLeads.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={activeTab === 'all' ? 17 : 16}
                    className="text-center py-12 text-muted-foreground"
                  >
                    <Calculator className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="font-medium">No valuation calculator leads yet</p>
                    <p className="text-sm mt-1">
                      Leads will appear here when submitted through SourceCo calculators.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLeads.map((lead, idx) => (
                  <TableRow
                    key={lead.id}
                    className={cn(
                      'transition-colors cursor-pointer',
                      lead.not_a_fit &&
                        'opacity-60 bg-orange-50/50 hover:bg-orange-100/50 dark:bg-orange-950/20 dark:hover:bg-orange-950/30',
                      !lead.not_a_fit &&
                        lead.is_priority_target &&
                        'bg-amber-50 hover:bg-amber-100/80 dark:bg-amber-950/30',
                      !lead.not_a_fit &&
                        !lead.is_priority_target &&
                        lead.pushed_to_all_deals &&
                        'bg-green-50/60 hover:bg-green-50',
                      !lead.not_a_fit && !lead.pushed_to_all_deals && 'hover:bg-muted/40',
                    )}
                    onClick={() => handleRowClick(lead)}
                  >
                    <TableCell
                      onClick={(e) => {
                        e.stopPropagation();
                        const isChecked = !selectedIds.has(lead.id);
                        handleShiftToggle(lead.id, isChecked, e);
                      }}
                      className="w-[40px]"
                    >
                      <Checkbox
                        checked={selectedIds.has(lead.id)}
                        onCheckedChange={() => {
                          /* handled by TableCell onClick for shift-key support */
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground tabular-nums">
                      {(safePage - 1) * PAGE_SIZE + idx + 1}
                    </TableCell>
                    <TableCell>
                      <div>
                        <button
                          className="font-medium text-foreground leading-tight hover:text-primary hover:underline text-left"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDeal(lead);
                          }}
                        >
                          {extractBusinessName(lead)}
                        </button>
                        {inferWebsite(lead) && (
                          <a
                            href={`https://${inferWebsite(lead)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-muted-foreground hover:text-primary hover:underline truncate max-w-[180px] block"
                          >
                            {inferWebsite(lead)}
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      {lead.listing_description ? (
                        <span
                          className="text-sm text-muted-foreground line-clamp-3 leading-tight"
                          title={lead.listing_description}
                        >
                          {lead.listing_description}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    {activeTab === 'all' && (
                      <TableCell>{calculatorBadge(lead.calculator_type)}</TableCell>
                    )}
                    <TableCell>
                      <span className="text-sm text-muted-foreground truncate max-w-[140px] block">
                        {lead.industry || '\u2014'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground truncate block">
                        {lead.location || '\u2014'}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {adminProfiles ? (
                        <Select
                          value={lead.deal_owner_id || 'unassigned'}
                          onValueChange={(val) =>
                            handleAssignOwner(lead, val === 'unassigned' ? null : val)
                          }
                        >
                          <SelectTrigger className="h-7 w-[110px] text-xs border-none bg-transparent hover:bg-muted">
                            <SelectValue placeholder="Assign...">
                              {lead.deal_owner_id && adminProfiles[lead.deal_owner_id] ? (
                                adminProfiles[lead.deal_owner_id].displayName.split(' ')[0]
                              ) : (
                                <span className="text-muted-foreground">Assign...</span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {Object.values(adminProfiles).map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.displayName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {lead.revenue != null ? (
                        <span className="text-sm tabular-nums">
                          {formatCompactCurrency(lead.revenue)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {lead.ebitda != null ? (
                        <span className="text-sm tabular-nums">
                          {formatCompactCurrency(lead.ebitda)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {lead.valuation_low != null && lead.valuation_high != null ? (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatCompactCurrency(lead.valuation_low)}
                          {'\u2013'}
                          {formatCompactCurrency(lead.valuation_high)}
                        </span>
                      ) : lead.valuation_mid != null ? (
                        <span className="text-sm tabular-nums">
                          {formatCompactCurrency(lead.valuation_mid)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell>{exitTimingBadge(lead.exit_timing)}</TableCell>
                    <TableCell className="text-center">
                      {lead.open_to_intros === true ? (
                        <span className="text-emerald-600 font-semibold text-sm">Yes</span>
                      ) : lead.open_to_intros === false ? (
                        <span className="text-muted-foreground text-sm">No</span>
                      ) : (
                        <span className="text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell>{qualityBadge(lead.quality_label)}</TableCell>
                    <TableCell className="text-center">
                      {lead.lead_score != null ? (
                        <span
                          className={cn(
                            'text-sm font-medium px-2 py-0.5 rounded tabular-nums',
                            scorePillClass(lead.lead_score),
                          )}
                        >
                          {lead.lead_score}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm tabular-nums text-foreground">
                        {format(new Date(lead.created_at), 'MMM d, yyyy')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {lead.pushed_to_all_deals ? (
                          <Badge
                            variant="outline"
                            className="bg-green-50 text-green-700 border-green-200 gap-1"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Pushed
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-blue-50 text-blue-700 border-blue-200"
                          >
                            New
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {lead.is_priority_target ? (
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400 mx-auto" />
                      ) : (
                        <span className="text-xs text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleOpenDeal(lead)}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open Deal Page
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              if (lead.pushed_to_all_deals && lead.pushed_listing_id)
                                handleReEnrich([lead.id]);
                              else handlePushAndEnrich([lead.id]);
                            }}
                          >
                            <Sparkles className="h-4 w-4 mr-2" />
                            Enrich Deal
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!lead.pushed_listing_id) {
                                sonnerToast.error('Push deal to Active Deals first');
                                return;
                              }
                              const newVal = !lead.needs_buyer_search;
                              const now = new Date().toISOString();
                              await supabase
                                .from('listings')
                                .update({
                                  needs_buyer_search: newVal,
                                  needs_buyer_search_at: newVal ? now : null,
                                })
                                .eq('id', lead.pushed_listing_id);
                              sonnerToast.success(newVal ? 'Flagged: Find Buyer' : 'Flag removed');
                              queryClient.invalidateQueries({
                                queryKey: ['remarketing', 'valuation-leads'],
                              });
                            }}
                          >
                            <Network className="h-4 w-4 mr-2" />
                            Flag: Find Buyer
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!lead.pushed_listing_id) {
                                sonnerToast.error('Push deal to Active Deals first');
                                return;
                              }
                              const newVal = !lead.needs_owner_contact;
                              await supabase
                                .from('listings')
                                .update({ needs_owner_contact: newVal })
                                .eq('id', lead.pushed_listing_id);
                              sonnerToast.success(
                                newVal ? 'Flagged: Need to Contact Owner' : 'Flag removed',
                              );
                              queryClient.invalidateQueries({
                                queryKey: ['remarketing', 'valuation-leads'],
                              });
                            }}
                          >
                            <Phone className="h-4 w-4 mr-2" />
                            Flag: Need to Contact Owner
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async (e) => {
                              e.stopPropagation();
                              const newVal = !lead.is_priority_target;
                              const { error } = await supabase
                                .from('valuation_leads')
                                .update({ is_priority_target: newVal } as never)
                                .eq('id', lead.id);
                              if (error) sonnerToast.error('Failed to update priority');
                              else {
                                queryClient.invalidateQueries({
                                  queryKey: ['remarketing', 'valuation-leads'],
                                });
                                sonnerToast.success(
                                  newVal ? 'Marked as priority' : 'Priority removed',
                                );
                              }
                            }}
                            className={lead.is_priority_target ? 'text-amber-600' : ''}
                          >
                            <Star
                              className={`h-4 w-4 mr-2 ${lead.is_priority_target ? 'fill-amber-500 text-amber-500' : ''}`}
                            />
                            {lead.is_priority_target ? 'Remove Priority' : 'Mark as Priority'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async (e) => {
                              e.stopPropagation();
                              const newVal = !lead.needs_buyer_universe;
                              const { error } = await supabase
                                .from('valuation_leads')
                                .update({ needs_buyer_universe: newVal } as never)
                                .eq('id', lead.id);
                              if (error) sonnerToast.error('Failed to update flag');
                              else {
                                queryClient.invalidateQueries({
                                  queryKey: ['remarketing', 'valuation-leads'],
                                });
                                sonnerToast.success(
                                  newVal ? 'Flagged: Needs Buyer Universe' : 'Flag removed',
                                );
                              }
                            }}
                            className={lead.needs_buyer_universe ? 'text-blue-600' : ''}
                          >
                            <Network
                              className={cn(
                                'h-4 w-4 mr-2',
                                lead.needs_buyer_universe && 'text-blue-600',
                              )}
                            />
                            {lead.needs_buyer_universe
                              ? 'Remove Buyer Universe Flag'
                              : 'Needs Buyer Universe'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async (e) => {
                              e.stopPropagation();
                              const newVal = !lead.need_to_contact_owner;
                              const { error } = await supabase
                                .from('valuation_leads')
                                .update({ need_to_contact_owner: newVal } as never)
                                .eq('id', lead.id);
                              if (error) sonnerToast.error('Failed to update flag');
                              else {
                                queryClient.invalidateQueries({
                                  queryKey: ['remarketing', 'valuation-leads'],
                                });
                                sonnerToast.success(
                                  newVal ? 'Flagged: Need to Contact Owner' : 'Flag removed',
                                );
                              }
                            }}
                            className={lead.need_to_contact_owner ? 'text-orange-600' : ''}
                          >
                            <Phone
                              className={cn(
                                'h-4 w-4 mr-2',
                                lead.need_to_contact_owner && 'text-orange-600',
                              )}
                            />
                            {lead.need_to_contact_owner
                              ? 'Remove Contact Owner Flag'
                              : 'Need to Contact Owner'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handlePushToAllDeals([lead.id])}
                            disabled={!!lead.pushed_to_all_deals}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Approve to Active Deals
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-orange-600 focus:text-orange-600"
                            onClick={() => handleMarkNotFit([lead.id])}
                          >
                            <ThumbsDown className="h-4 w-4 mr-2" />
                            Mark as Not a Fit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={async () => {
                              const { error } = await supabase
                                .from('valuation_leads')
                                .update({ is_archived: true })
                                .eq('id', lead.id);
                              if (error) sonnerToast.error('Failed to archive lead');
                              else {
                                sonnerToast.success('Lead archived');
                                refetch();
                              }
                            }}
                          >
                            <Archive className="h-4 w-4 mr-2" />
                            Archive Deal
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
