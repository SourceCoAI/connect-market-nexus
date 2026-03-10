import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
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
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  ExternalLink,
  MoreHorizontal,
  Sparkles,
  Zap,
  Trash2,
  Archive,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Users,
  Star,
  Phone,
  ThumbsDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { getDisplayLocation } from '@/lib/location-display';
import { toast } from 'sonner';
import { DealSourceBadge } from '@/components/remarketing/DealSourceBadge';
import { useShiftSelect } from '@/hooks/useShiftSelect';
import type { SortField } from './types';
import { formatCurrency, normalizeCompanyName, getDomain } from './helpers';

interface Deal {
  id: string;
  title: string | null;
  website: string | null;
  enriched_at: string | null;
  internal_company_name: string | null;
  remarketing_status: string | null;
  status: string | null;
  is_priority_target: boolean | null;
  deal_total_score: number | null;
  main_contact_name: string | null;
  main_contact_title: string | null;
  main_contact_email: string | null;
  linkedin_employee_count: number | null;
  linkedin_employee_range: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  created_at: string;
  needs_buyer_search: boolean | null;
  needs_owner_contact: boolean | null;
  category: string | null;
  address_city: string | null;
  address_state: string | null;
  location: string | null;
  revenue: number | null;
  ebitda: number | null;
  deal_source: string | null;
}

interface DealsTableProps {
  deals: Deal[];
  sortField: SortField;
  sortDir: 'asc' | 'desc';
  toggleSort: (field: SortField) => void;
  selectedDealIds: Set<string>;
  setSelectedDealIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  allSelected: boolean;
  toggleSelectAll: () => void;
  toggleSelect: (id: string) => void;
  onEnrichDeal: (id: string) => void;
  onConfirmAction: (action: { type: 'archive' | 'delete'; ids: string[] }) => void;
  partnerId: string;
}

export function DealsTable({
  deals,
  sortField,
  sortDir,
  toggleSort,
  selectedDealIds,
  setSelectedDealIds,
  allSelected,
  toggleSelectAll,
  toggleSelect: _toggleSelect,
  onEnrichDeal,
  onConfirmAction,
  partnerId,
}: DealsTableProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const orderedIds = deals.map((d) => d.id);
  const navToDeal = (dealId: string) =>
    navigate(`/admin/deals/${dealId}`, { state: { from: location.pathname } });
  const { handleToggle } = useShiftSelect(orderedIds, selectedDealIds, setSelectedDealIds);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40px]">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all"
            />
          </TableHead>
          {(
            [
              ['name', 'Deal Name', ''],
              ['website', 'Website', ''],
              ['industry', 'Industry', ''],
              ['location', 'Location', ''],
              ['revenue', 'Revenue', 'text-right'],
              ['ebitda', 'EBITDA', 'text-right'],
              ['status', 'Status', ''],
              ['quality', 'Quality', ''],
              ['contact', 'Contact', ''],
              ['employees', 'Employees', ''],
              ['range', 'Range', ''],
              ['rating', 'Rating', ''],
              ['reviews', 'Reviews', ''],
              ['added', 'Added', ''],
            ] as [SortField | 'contact', string, string][]
          ).map(([field, label, cls]) => (
            <TableHead
              key={field}
              className={`${cls} ${field !== 'contact' ? 'cursor-pointer select-none hover:bg-muted/50' : ''}`}
              onClick={field !== 'contact' ? () => toggleSort(field as SortField) : undefined}
            >
              <div className={`flex items-center gap-1 ${cls}`}>
                {label}
                {field !== 'contact' &&
                  (sortField === field ? (
                    sortDir === 'asc' ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  ))}
              </div>
            </TableHead>
          ))}
          <TableHead className="w-[40px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {deals.map((deal) => {
          const domain = getDomain(deal.website);
          const isEnriched = !!deal.enriched_at;
          return (
            <TableRow
              key={deal.id}
              className={`cursor-pointer hover:bg-muted/50 ${
                deal.remarketing_status === 'not_a_fit'
                  ? 'opacity-50 bg-orange-50/50 hover:bg-orange-100/50 dark:bg-orange-950/10 dark:hover:bg-orange-950/20'
                  : deal.status === 'active'
                    ? 'bg-green-50 hover:bg-green-100/80 dark:bg-green-950/20 dark:hover:bg-green-950/40'
                    : deal.is_priority_target
                      ? 'bg-amber-50 hover:bg-amber-100/80 dark:bg-amber-950/30 dark:hover:bg-amber-950/50'
                      : ''
              }`}
              data-state={selectedDealIds.has(deal.id) ? 'selected' : undefined}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedDealIds.has(deal.id)}
                  onCheckedChange={(checked) => {
                    handleToggle(deal.id, !!checked);
                  }}
                  onClick={(e: React.MouseEvent) => {
                    if (e.shiftKey) {
                      e.preventDefault();
                      handleToggle(deal.id, !selectedDealIds.has(deal.id), e);
                    }
                  }}
                  aria-label={`Select ${deal.title}`}
                />
              </TableCell>
              <TableCell className="font-medium" onClick={() => navToDeal(deal.id)}>
                <div className="flex items-center gap-1.5">
                  {isEnriched && <Sparkles className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                  <span>
                    {normalizeCompanyName(deal.internal_company_name || deal.title || 'Untitled')}
                  </span>
                  <DealSourceBadge source={deal.deal_source} />
                </div>
                {domain && <div className="text-xs text-muted-foreground">{domain}</div>}
              </TableCell>
              <TableCell
                className="text-sm text-muted-foreground"
                onClick={() => navToDeal(deal.id)}
              >
                {deal.website ? (
                  <a
                    href={
                      deal.website.startsWith('http') ? deal.website : `https://${deal.website}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-primary hover:underline text-xs truncate max-w-[140px] block"
                  >
                    {getDomain(deal.website) || deal.website}
                  </a>
                ) : (
                  <span className="text-xs">-</span>
                )}
              </TableCell>
              <TableCell
                className="text-sm text-muted-foreground"
                onClick={() => navToDeal(deal.id)}
              >
                {deal.category || '-'}
              </TableCell>
              <TableCell
                className="text-sm text-muted-foreground"
                onClick={() => navToDeal(deal.id)}
              >
                {getDisplayLocation(deal) || '-'}
              </TableCell>
              <TableCell className="text-right text-sm" onClick={() => navToDeal(deal.id)}>
                {formatCurrency(deal.revenue)}
              </TableCell>
              <TableCell className="text-right text-sm" onClick={() => navToDeal(deal.id)}>
                {formatCurrency(deal.ebitda)}
              </TableCell>
              <TableCell onClick={() => navToDeal(deal.id)}>
                {deal.status === 'active' ? (
                  <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
                ) : deal.status === 'pending_referral_review' ? (
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                    Pending Review
                  </Badge>
                ) : deal.status === 'draft' ? (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200">Draft</Badge>
                ) : deal.status === 'archived' ? (
                  <Badge className="bg-gray-100 text-gray-600 border-gray-200">Archived</Badge>
                ) : (
                  <Badge variant="secondary">{deal.status || 'Draft'}</Badge>
                )}
              </TableCell>
              <TableCell onClick={() => navToDeal(deal.id)}>
                {(() => {
                  const score = deal.deal_total_score;
                  if (score == null)
                    return <span className="text-xs text-muted-foreground">-</span>;
                  const color =
                    score >= 70
                      ? 'text-green-600'
                      : score >= 40
                        ? 'text-amber-600'
                        : 'text-red-500';
                  return <span className={`text-sm font-semibold ${color}`}>{score}</span>;
                })()}
              </TableCell>
              <TableCell onClick={() => navToDeal(deal.id)}>
                {deal.main_contact_name ? (
                  <div className="text-xs space-y-0.5">
                    <div className="font-medium">{deal.main_contact_name}</div>
                    {deal.main_contact_title && (
                      <div className="text-muted-foreground">{deal.main_contact_title}</div>
                    )}
                    {deal.main_contact_email && (
                      <a
                        href={`mailto:${deal.main_contact_email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary hover:underline"
                      >
                        {deal.main_contact_email}
                      </a>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell onClick={() => navToDeal(deal.id)}>
                {deal.linkedin_employee_count ? (
                  <div className="flex items-center gap-1 text-xs">
                    <Users className="h-3 w-3 text-blue-600" />
                    <span className="font-medium">
                      {deal.linkedin_employee_count.toLocaleString()}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell onClick={() => navToDeal(deal.id)}>
                <span className="text-xs text-muted-foreground">
                  {deal.linkedin_employee_range || '-'}
                </span>
              </TableCell>
              <TableCell onClick={() => navToDeal(deal.id)}>
                {deal.google_rating ? (
                  <div className="flex items-center gap-1 text-xs">
                    <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                    <span className="font-medium">{deal.google_rating.toFixed(1)}</span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell onClick={() => navToDeal(deal.id)}>
                {deal.google_review_count ? (
                  <span className="text-xs font-medium">
                    {deal.google_review_count.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell
                className="text-sm text-muted-foreground"
                onClick={() => navToDeal(deal.id)}
              >
                {format(new Date(deal.created_at), 'MMM d, yyyy')}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navToDeal(deal.id)}>
                      <ExternalLink className="h-3 w-3 mr-2" />
                      View Deal
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEnrichDeal(deal.id)}>
                      <Zap className="h-3 w-3 mr-2" />
                      Enrich Deal
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={async () => {
                        const newStatus = !deal.is_priority_target;
                        const { error } = await supabase
                          .from('listings')
                          .update({ is_priority_target: newStatus })
                          .eq('id', deal.id);
                        if (error) toast.error(error.message);
                        else {
                          toast.success(newStatus ? 'Marked as priority' : 'Priority removed');
                          queryClient.invalidateQueries({
                            queryKey: ['referral-partners', partnerId, 'deals'],
                          });
                        }
                      }}
                      className={deal.is_priority_target ? 'text-amber-600' : ''}
                    >
                      <Star
                        className={`h-3 w-3 mr-2 ${deal.is_priority_target ? 'fill-amber-500' : ''}`}
                      />
                      {deal.is_priority_target ? 'Remove Priority' : 'Mark as Priority'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={async () => {
                        const newVal = !deal.needs_buyer_search;
                        const now = new Date().toISOString();
                        const { error } = await supabase
                          .from('listings')
                          .update({
                            needs_buyer_search: newVal,
                            needs_buyer_search_at: newVal ? now : null,
                          } as never)
                          .eq('id', deal.id);
                        if (!error) {
                          toast.success(newVal ? 'Flagged: Find Buyer' : 'Flag removed');
                          queryClient.invalidateQueries({
                            queryKey: ['referral-partners', partnerId, 'deals'],
                          });
                        }
                      }}
                      className={deal.needs_buyer_search ? 'text-blue-600' : ''}
                    >
                      <Users
                        className={cn('h-3 w-3 mr-2', deal.needs_buyer_search && 'text-blue-600')}
                      />
                      {deal.needs_buyer_search ? 'Remove Find Buyer Flag' : 'Flag: Find Buyer'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={async () => {
                        const newVal = !deal.needs_owner_contact;
                        const { error } = await supabase
                          .from('listings')
                          .update({ needs_owner_contact: newVal } as never)
                          .eq('id', deal.id);
                        if (!error) {
                          toast.success(newVal ? 'Flagged: Need to Contact Owner' : 'Flag removed');
                          queryClient.invalidateQueries({
                            queryKey: ['referral-partners', partnerId, 'deals'],
                          });
                        }
                      }}
                      className={deal.needs_owner_contact ? 'text-orange-600' : ''}
                    >
                      <Phone
                        className={cn(
                          'h-3 w-3 mr-2',
                          deal.needs_owner_contact && 'text-orange-600',
                        )}
                      />
                      {deal.needs_owner_contact
                        ? 'Remove Contact Owner Flag'
                        : 'Flag: Need to Contact Owner'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={deal.remarketing_status === 'not_a_fit' ? 'text-green-600 focus:text-green-600' : 'text-orange-600 focus:text-orange-600'}
                      onClick={async () => {
                        const isAlreadyNotFit = deal.remarketing_status === 'not_a_fit';
                        const { error } = await supabase
                          .from('listings')
                          .update({ remarketing_status: isAlreadyNotFit ? null : 'not_a_fit' } as never)
                          .eq('id', deal.id);
                        if (error) toast.error(error.message);
                        else {
                          toast.success(isAlreadyNotFit ? 'Removed Not a Fit status' : 'Marked as not a fit');
                          queryClient.invalidateQueries({
                            queryKey: ['referral-partners', partnerId, 'deals'],
                          });
                        }
                      }}
                    >
                      {deal.remarketing_status === 'not_a_fit' ? (
                        <><Undo2 className="h-3 w-3 mr-2" />Remove Not a Fit</>
                      ) : (
                        <><ThumbsDown className="h-3 w-3 mr-2" />Mark as Not a Fit</>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-amber-600 focus:text-amber-600"
                      onClick={() => onConfirmAction({ type: 'archive', ids: [deal.id] })}
                    >
                      <Archive className="h-3 w-3 mr-2" />
                      Archive Deal
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => onConfirmAction({ type: 'delete', ids: [deal.id] })}
                    >
                      <Trash2 className="h-3 w-3 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
