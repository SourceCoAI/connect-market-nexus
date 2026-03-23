import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CheckCircle2,
  MoreHorizontal,
  ExternalLink,
  Zap,
  Star,
  Archive,
  Trash2,
  Users,
  Phone,
  ThumbsDown,
  Undo2,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface CapTargetDeal {
  id: string;
  title: string | null;
  internal_company_name: string | null;
  captarget_client_name: string | null;
  captarget_contact_date: string | null;
  captarget_outreach_channel: string | null;
  captarget_interest_type: string | null;
  main_contact_name: string | null;
  main_contact_email: string | null;
  main_contact_title: string | null;
  main_contact_phone: string | null;
  captarget_sheet_tab: string | null;
  website: string | null;
  description: string | null;
  owner_response: string | null;
  pushed_to_all_deals: boolean | null;
  pushed_to_all_deals_at: string | null;
  deal_source: string | null;
  status: string | null;
  created_at: string;
  enriched_at: string | null;
  deal_total_score: number | null;
  linkedin_employee_count: number | null;
  linkedin_employee_range: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  captarget_status: string | null;
  is_priority_target: boolean | null;
  needs_buyer_search: boolean | null;
  needs_owner_contact: boolean | null;
  category: string | null;
  executive_summary: string | null;
  industry: string | null;
  remarketing_status: string | null;
}

const interestTypeLabel = (type: string | null) => {
  switch (type) {
    case 'interest':
      return 'Interest';
    case 'no_interest':
      return 'No Interest';
    case 'keep_in_mind':
      return 'Keep in Mind';
    default:
      return 'Unknown';
  }
};

const interestTypeBadgeClass = (type: string | null) => {
  switch (type) {
    case 'interest':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'no_interest':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'keep_in_mind':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    default:
      return 'bg-gray-50 text-gray-600 border-gray-200';
  }
};

interface CapTargetTableRowProps {
  deal: CapTargetDeal;
  index: number;
  pageOffset: number;
  isSelected: boolean;
  onToggleSelect: (
    id: string,
    checked: boolean,
    event?: React.MouseEvent | React.KeyboardEvent,
  ) => void;
  onPushToAllDeals: (dealIds: string[]) => void;
  onEnrichSelected: (dealIds: string[], mode: 'all' | 'unenriched') => void;
  onDeleteDeal: (id: string) => void;
  onArchiveDeal: (id: string) => void;
  onRefetch: () => void;
}

export function CapTargetTableRow({
  deal,
  index,
  pageOffset,
  isSelected,
  onToggleSelect,
  onPushToAllDeals,
  onEnrichSelected,
  onDeleteDeal,
  onArchiveDeal,
  onRefetch,
}: CapTargetTableRowProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  return (
    <TableRow
      className={cn(
        'cursor-pointer hover:bg-muted/50 transition-colors',
        deal.remarketing_status === 'not_a_fit' &&
          'opacity-60 bg-orange-50/50 hover:bg-orange-100/50',
        deal.remarketing_status !== 'not_a_fit' &&
          deal.is_priority_target &&
          'bg-amber-50 hover:bg-amber-100/80 dark:bg-amber-950/30 dark:hover:bg-amber-950/50',
        deal.remarketing_status !== 'not_a_fit' &&
          !deal.is_priority_target &&
          deal.pushed_to_all_deals &&
          'bg-green-50/60 hover:bg-green-50',
      )}
      onClick={() =>
        navigate(`/admin/remarketing/leads/captarget/${deal.id}`, {
          state: { from: '/admin/remarketing/leads/captarget' },
        })
      }
    >
      <TableCell
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(deal.id, !isSelected, e);
        }}
        className="w-[40px] cursor-pointer select-none"
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => {
            /* handled by TableCell onClick for shift support */
          }}
        />
      </TableCell>
      <TableCell className="w-[50px] text-center text-xs text-muted-foreground tabular-nums">
        {pageOffset + index + 1}
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium text-foreground truncate max-w-[220px]">
            {deal.internal_company_name || deal.title || '—'}
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
          {deal.description || deal.executive_summary || '—'}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground truncate max-w-[160px] block">
          {deal.industry || deal.category || '—'}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-sm">{deal.main_contact_name || '—'}</span>
          {deal.main_contact_title && (
            <span className="text-xs text-muted-foreground">{deal.main_contact_title}</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={interestTypeBadgeClass(deal.captarget_interest_type)}>
          {interestTypeLabel(deal.captarget_interest_type)}
        </Badge>
      </TableCell>
      <TableCell>
        <span className="text-sm">{deal.captarget_outreach_channel || '—'}</span>
      </TableCell>
      <TableCell>
        {deal.linkedin_employee_count != null ? (
          <span className="text-sm tabular-nums">
            {deal.linkedin_employee_count.toLocaleString()}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {deal.linkedin_employee_range ? (
          <span className="text-sm">{deal.linkedin_employee_range}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {deal.google_review_count != null ? (
          <span className="text-sm tabular-nums">{deal.google_review_count.toLocaleString()}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {deal.google_rating != null ? (
          <span className="text-sm tabular-nums">⭐ {deal.google_rating}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {deal.captarget_sheet_tab ? (
          <span className="text-sm">{deal.captarget_sheet_tab}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-center">
        {(() => {
          const score = deal.deal_total_score;
          return score != null ? (
            <div className="flex items-center justify-center gap-1.5">
              <span
                className={cn(
                  'text-sm font-medium px-2 py-0.5 rounded tabular-nums',
                  score >= 80
                    ? 'bg-green-100 text-green-700'
                    : score >= 60
                      ? 'bg-blue-100 text-blue-700'
                      : score >= 40
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700',
                )}
              >
                {Math.round(score)}
              </span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          );
        })()}
      </TableCell>
      <TableCell>
        {deal.captarget_status ? (
          <Badge
            variant="outline"
            className={cn(
              'text-xs capitalize',
              deal.captarget_status === 'active'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-slate-50 text-slate-600 border-slate-200',
            )}
          >
            {deal.captarget_status}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">
          {deal.captarget_contact_date
            ? format(new Date(deal.captarget_contact_date), 'MMM d, yyyy')
            : '—'}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          {deal.pushed_to_all_deals ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Pushed
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {deal.enriched_at && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
              Enriched
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-center">
        {deal.is_priority_target ? (
          <Star className="h-4 w-4 fill-amber-400 text-amber-400 mx-auto" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
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
              onClick={() =>
                navigate(`/admin/remarketing/leads/captarget/${deal.id}`, {
                  state: { from: '/admin/remarketing/leads/captarget' },
                })
              }
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Deal
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEnrichSelected([deal.id], 'all')}>
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
                  toast({ title: 'Error', description: 'Failed to update priority' });
                } else {
                  toast({ title: newValue ? 'Priority Set' : 'Priority Removed' });
                  onRefetch();
                }
              }}
              className={deal.is_priority_target ? 'text-amber-600' : ''}
            >
              <Star className={cn('h-4 w-4 mr-2', deal.is_priority_target && 'fill-amber-500')} />
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
                  toast({ title: newVal ? 'Flagged: Find Buyer' : 'Flag removed' });
                  onRefetch();
                }
              }}
              className={deal.needs_buyer_search ? 'text-blue-600' : ''}
            >
              <Users className={cn('h-4 w-4 mr-2', deal.needs_buyer_search && 'text-blue-600')} />
              {deal.needs_buyer_search ? '✓ Find Buyer' : 'Flag: Find Buyer'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                const newVal = !deal.needs_owner_contact;
                const { error } = await supabase
                  .from('listings')
                  .update({ needs_owner_contact: newVal } as never)
                  .eq('id', deal.id);
                if (!error) {
                  toast({ title: newVal ? 'Flagged: Need to Contact Owner' : 'Flag removed' });
                  onRefetch();
                }
              }}
              className={deal.needs_owner_contact ? 'text-orange-600' : ''}
            >
              <Phone
                className={cn('h-4 w-4 mr-2', deal.needs_owner_contact && 'text-orange-600')}
              />
              {deal.needs_owner_contact ? '✓ Need to Contact Owner' : 'Flag: Need to Contact Owner'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onPushToAllDeals([deal.id])}
              disabled={!!deal.pushed_to_all_deals}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Approve to Active Deals
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={deal.remarketing_status === 'not_a_fit' ? 'text-green-600 focus:text-green-600' : 'text-orange-600 focus:text-orange-600'}
              onClick={async () => {
                const isAlreadyNotFit = deal.remarketing_status === 'not_a_fit';
                const { error } = await supabase
                  .from('listings')
                  .update({ remarketing_status: isAlreadyNotFit ? null : 'not_a_fit' } as never)
                  .eq('id', deal.id);
                if (error) {
                  toast({ title: 'Error', description: isAlreadyNotFit ? 'Failed to remove status' : 'Failed to mark as not a fit' });
                } else {
                  toast({ title: isAlreadyNotFit ? 'Removed Not a Fit status' : 'Marked as Not a Fit' });
                  onRefetch();
                }
              }}
            >
              {deal.remarketing_status === 'not_a_fit' ? (
                <><Undo2 className="h-4 w-4 mr-2" />Remove Not a Fit</>
              ) : (
                <><ThumbsDown className="h-4 w-4 mr-2" />Mark as Not a Fit</>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-amber-600 focus:text-amber-600"
              onClick={() => onArchiveDeal(deal.id)}
            >
              <Archive className="h-4 w-4 mr-2" />
              Archive Deal
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => onDeleteDeal(deal.id)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Deal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
