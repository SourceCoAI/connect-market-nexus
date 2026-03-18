import { useNavigate } from 'react-router-dom';
import { formatCompactCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
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
import {
  Building2,
  ArrowUpDown,
  CheckCircle2,
  Plus,
  FileSpreadsheet,
  MoreHorizontal,
  ExternalLink,
  Zap,
  Archive,
  Star,
  Users,
  Phone,
  ThumbsDown,
  Undo2,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast as sonnerToast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { SourceCoDeal, SortColumn } from './types';

interface SourceCoTableProps {
  paginatedDeals: SourceCoDeal[];
  safePage: number;
  PAGE_SIZE: number;
  sortColumn: SortColumn;
  allSelected: boolean;
  toggleSelectAll: () => void;
  selectedIds: Set<string>;
  toggleSelect: (id: string, checked: boolean, event?: React.MouseEvent) => void;
  handleSort: (col: SortColumn) => void;
  handlePushToAllDeals: (dealIds: string[]) => Promise<void>;
  handleEnrichSelected: (dealIds: string[]) => Promise<void>;
  handleAssignOwner: (dealId: string, ownerId: string | null) => Promise<void>;
  adminProfiles: Record<string, unknown> | undefined;
  setAddDealOpen: (open: boolean) => void;
  setCsvUploadOpen: (open: boolean) => void;
  onMarkNotFit?: (dealId: string) => void;
}

export function SourceCoTable({
  paginatedDeals,
  safePage,
  PAGE_SIZE,
  sortColumn,
  allSelected,
  toggleSelectAll,
  selectedIds,
  toggleSelect,
  handleSort,
  handlePushToAllDeals,
  handleEnrichSelected,
  handleAssignOwner,
  adminProfiles,
  setAddDealOpen,
  setCsvUploadOpen,
  onMarkNotFit,
}: SourceCoTableProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                </TableHead>
                <TableHead className="w-[50px] text-center">#</TableHead>
                <TableHead>
                  <SortHeader column="company_name">Company</SortHeader>
                </TableHead>
                <TableHead className="max-w-[200px]">Description</TableHead>
                <TableHead>
                  <SortHeader column="industry">Industry</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader column="owner">Deal Owner</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader column="revenue">Revenue</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader column="ebitda">EBITDA</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader column="linkedin_employee_count">LI Count</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader column="linkedin_employee_range">LI Range</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader column="google_review_count">Reviews</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader column="google_rating">Rating</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader column="score">Quality</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader column="created_at">Added</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader column="pushed">Status</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader column="priority">Priority</SortHeader>
                </TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedDeals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={17} className="text-center py-12 text-muted-foreground">
                    <Building2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="font-medium">No SourceCo deals yet</p>
                    <p className="text-sm mt-1">Add deals manually or import a CSV spreadsheet.</p>
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <Button size="sm" variant="outline" onClick={() => setAddDealOpen(true)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add Deal
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setCsvUploadOpen(true)}>
                        <FileSpreadsheet className="h-4 w-4 mr-1" />
                        Import Spreadsheet
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedDeals.map((deal, index) => (
                  <TableRow
                    key={deal.id}
                    className={cn(
                      'cursor-pointer hover:bg-muted/50 transition-colors',
                      deal.remarketing_status === 'not_a_fit' &&
                        'opacity-60 bg-orange-50/50 hover:bg-orange-100/50 dark:bg-orange-950/20 dark:hover:bg-orange-950/30',
                      deal.remarketing_status !== 'not_a_fit' &&
                        deal.is_priority_target &&
                        'bg-amber-50 hover:bg-amber-100/80 dark:bg-amber-950/30 dark:hover:bg-amber-950/50',
                      deal.remarketing_status !== 'not_a_fit' &&
                        !deal.is_priority_target &&
                        deal.pushed_to_all_deals &&
                        'bg-green-50/60 hover:bg-green-50',
                    )}
                    onClick={() =>
                      navigate(`/admin/remarketing/leads/sourceco/${deal.id}`, {
                        state: { from: '/admin/remarketing/leads/sourceco' },
                      })
                    }
                  >
                    <TableCell onClick={(e) => e.stopPropagation()} className="w-[40px]">
                      <Checkbox
                        checked={selectedIds.has(deal.id)}
                        onCheckedChange={() => {
                          /* handled by onClick */
                        }}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          toggleSelect(deal.id, !selectedIds.has(deal.id), e);
                        }}
                      />
                    </TableCell>
                    <TableCell className="w-[50px] text-center text-xs text-muted-foreground tabular-nums">
                      {(safePage - 1) * PAGE_SIZE + index + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground truncate max-w-[220px]">
                          {deal.internal_company_name || deal.title || '\u2014'}
                        </span>
                        {deal.website && (
                          <span className="text-xs text-muted-foreground truncate max-w-[220px]">
                            {deal.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <span className="text-xs text-muted-foreground line-clamp-3">
                        {deal.description || deal.executive_summary || '\u2014'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground truncate max-w-[160px] block">
                        {deal.industry || deal.category || '\u2014'}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={deal.deal_owner_id || '__none'}
                        onValueChange={(val) =>
                          handleAssignOwner(deal.id, val === '__none' ? null : val)
                        }
                      >
                        <SelectTrigger className="h-7 text-xs border-dashed w-[120px]">
                          <SelectValue placeholder="Assign...">
                            {deal.deal_owner?.first_name ? (
                              `${deal.deal_owner.first_name} ${deal.deal_owner.last_name || ''}`.trim()
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
                            Object.values(adminProfiles).map((admin) => {
                              const a = admin as { id: string; displayName: string };
                              return (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.displayName}
                                </SelectItem>
                              );
                            })}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {deal.revenue != null && deal.revenue !== 0 ? (
                        <span className="text-sm tabular-nums">
                          {formatCompactCurrency(deal.revenue)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {deal.ebitda != null && deal.ebitda !== 0 ? (
                        <span className="text-sm tabular-nums">
                          {formatCompactCurrency(deal.ebitda)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {deal.linkedin_employee_count != null ? (
                        <span className="text-sm tabular-nums">
                          {deal.linkedin_employee_count.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {deal.linkedin_employee_range ? (
                        <span className="text-sm">{deal.linkedin_employee_range}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {deal.google_review_count != null ? (
                        <span className="text-sm tabular-nums">
                          {deal.google_review_count.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {deal.google_rating != null ? (
                        <span className="text-sm tabular-nums">
                          {'\u2B50'} {deal.google_rating}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {deal.deal_total_score != null ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <span
                            className={cn(
                              'text-sm font-medium px-2 py-0.5 rounded tabular-nums',
                              deal.deal_total_score >= 80
                                ? 'bg-green-100 text-green-700'
                                : deal.deal_total_score >= 60
                                  ? 'bg-blue-100 text-blue-700'
                                  : deal.deal_total_score >= 40
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-red-100 text-red-700',
                            )}
                          >
                            {Math.round(deal.deal_total_score)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(deal.created_at), 'MMM d, yyyy')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {deal.pushed_to_all_deals ? (
                          <Badge
                            variant="outline"
                            className="bg-green-50 text-green-700 border-green-200 gap-1"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Pushed
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">{'\u2014'}</span>
                        )}
                        {deal.enriched_at && (
                          <Badge
                            variant="outline"
                            className="bg-blue-50 text-blue-700 border-blue-200 text-xs"
                          >
                            Enriched
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {deal.is_priority_target ? (
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400 mx-auto" />
                      ) : (
                        <span className="text-xs text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DealRowActions
                        deal={deal}
                        navigate={navigate}
                        handleEnrichSelected={handleEnrichSelected}
                        handlePushToAllDeals={handlePushToAllDeals}
                        queryClient={queryClient}
                        toast={toast}
                        onMarkNotFit={onMarkNotFit}
                      />
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

function DealRowActions({
  deal,
  navigate,
  handleEnrichSelected,
  handlePushToAllDeals,
  queryClient,
  toast,
  onMarkNotFit,
}: {
  deal: SourceCoDeal;
  navigate: (path: string, opts?: { state?: Record<string, unknown> }) => void;
  handleEnrichSelected: (dealIds: string[]) => Promise<void>;
  handlePushToAllDeals: (dealIds: string[]) => Promise<void>;
  queryClient: ReturnType<typeof useQueryClient>;
  toast: ReturnType<typeof useToast>['toast'];
  onMarkNotFit?: (dealId: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() =>
            navigate(`/admin/remarketing/leads/sourceco/${deal.id}`, {
              state: { from: '/admin/remarketing/leads/sourceco' },
            })
          }
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          View Deal
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleEnrichSelected([deal.id])}>
          <Zap className="h-4 w-4 mr-2" />
          Enrich Deal
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            const newValue = !deal.is_priority_target;
            const { error } = await supabase
              .from('listings')
              .update({ is_priority_target: newValue } as never)
              .eq('id', deal.id);
            if (error) {
              sonnerToast.error('Failed to update priority');
            } else {
              sonnerToast.success(newValue ? 'Marked as priority' : 'Priority removed');
              queryClient.invalidateQueries({ queryKey: ['remarketing', 'sourceco-deals'] });
            }
          }}
          className={deal.is_priority_target ? 'text-amber-600' : ''}
        >
          <Star className={cn('h-4 w-4 mr-2', deal.is_priority_target && 'fill-amber-500')} />
          {deal.is_priority_target ? 'Remove Priority' : 'Mark as Priority'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            const newVal = !deal.needs_owner_contact;
            const newLabel = newVal ? 'Flagged: Needs Buyer Universe' : 'Flag removed';
            const { error } = await supabase
              .from('listings')
              .update({ needs_buyer_search: newVal } as never)
              .eq('id', deal.id);
            if (!error) {
              sonnerToast.success(newLabel);
              queryClient.invalidateQueries({ queryKey: ['remarketing', 'sourceco-deals'] });
            }
          }}
        >
          <Users className="h-4 w-4 mr-2" />
          Flag: Needs Buyer Universe
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            const newVal = !deal.needs_owner_contact;
            const { error } = await supabase
              .from('listings')
              .update({ needs_owner_contact: newVal } as never)
              .eq('id', deal.id);
            if (!error) {
              sonnerToast.success(newVal ? 'Flagged: Need to Contact Owner' : 'Flag removed');
              queryClient.invalidateQueries({ queryKey: ['remarketing', 'sourceco-deals'] });
            }
          }}
          className={deal.needs_owner_contact ? 'text-orange-600' : ''}
        >
          <Phone className={cn('h-4 w-4 mr-2', deal.needs_owner_contact && 'text-orange-600')} />
          {deal.needs_owner_contact
            ? '\u2713 Need to Contact Owner'
            : 'Flag: Need to Contact Owner'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handlePushToAllDeals([deal.id])}
          disabled={!!deal.pushed_to_all_deals}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Approve to Active Deals
        </DropdownMenuItem>
        {deal.remarketing_status === 'not_a_fit' ? (
          <DropdownMenuItem
            className="text-green-600 focus:text-green-600"
            onClick={async () => {
              const { error } = await supabase
                .from('listings')
                .update({ remarketing_status: null } as never)
                .eq('id', deal.id);
              if (error) {
                toast({ title: 'Error', description: error.message, variant: 'destructive' });
              } else {
                toast({ title: 'Removed Not a Fit status' });
                queryClient.invalidateQueries({ queryKey: ['remarketing', 'sourceco-deals'] });
              }
            }}
          >
            <Undo2 className="h-4 w-4 mr-2" />
            Remove Not a Fit
          </DropdownMenuItem>
        ) : onMarkNotFit ? (
          <DropdownMenuItem
            className="text-orange-600 focus:text-orange-600"
            onClick={() => onMarkNotFit(deal.id)}
          >
            <ThumbsDown className="h-4 w-4 mr-2" />
            Mark as Not a Fit
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-amber-600 focus:text-amber-600"
          onClick={async () => {
            const { error } = await supabase
              .from('listings')
              .update({ remarketing_status: 'archived' } as never)
              .eq('id', deal.id);
            if (error) {
              toast({ title: 'Error', description: error.message, variant: 'destructive' });
            } else {
              toast({
                title: 'Deal archived (remarketing)',
                description: 'Deal has been archived in remarketing. Marketplace status unchanged.',
              });
              queryClient.invalidateQueries({ queryKey: ['remarketing', 'sourceco-deals'] });
            }
          }}
        >
          <Archive className="h-4 w-4 mr-2" />
          Archive Deal
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
