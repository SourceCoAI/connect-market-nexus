import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { ClickToDialPhone } from '@/components/shared/ClickToDialPhone';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Send,
  ThumbsUp,
  ThumbsDown,
  MoreHorizontal,
  ExternalLink,
  Trash2,
  RotateCcw,
  ArrowRight,
  CheckCircle,
  Mail,
  Phone,
  Linkedin,
  MessageSquare,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import type { BuyerIntroduction, ScoreSnapshot } from '@/types/buyer-introductions';
import { BuyerTypeBadge } from '../shared/BuyerTypeBadge';
import { ScoreBadge } from '../shared/ScoreBadge';
import { SourceBadge } from '../shared/SourceBadge';
import type { KanbanColumn } from '../hooks/use-introduction-pipeline';

const CHANNEL_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  phone: Phone,
  linkedin: Linkedin,
};

interface BuyerKanbanCardProps {
  buyer: BuyerIntroduction;
  column: KanbanColumn;
  onIntroduce?: (buyer: BuyerIntroduction) => void;
  onMarkInterested?: (buyer: BuyerIntroduction) => void;
  onMarkPassed?: (buyer: BuyerIntroduction) => void;
  onApproveForPipeline?: (buyer: BuyerIntroduction) => void;
  onReactivate?: (buyer: BuyerIntroduction) => void;
  onRemove?: (buyer: BuyerIntroduction) => void;
  onLogFollowUp?: (buyer: BuyerIntroduction) => void;
}

export function BuyerKanbanCard({
  buyer,
  column,
  onIntroduce,
  onMarkInterested,
  onMarkPassed,
  onApproveForPipeline,
  onReactivate,
  onRemove,
  onLogFollowUp,
}: BuyerKanbanCardProps) {
  const isInPipeline = buyer.introduction_status === 'fit_and_interested';
  const snap = buyer.score_snapshot as ScoreSnapshot | null;
  const compositeScore = snap?.composite_score ?? null;
  const buyerType = snap?.buyer_type ?? null;
  const isPeBacked = snap?.is_pe_backed ?? false;
  const source = snap?.source ?? null;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: buyer.id,
    disabled: isInPipeline,
    data: { buyer, column },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const daysSinceIntroduction = buyer.introduction_date
    ? Math.floor(
        (Date.now() - new Date(buyer.introduction_date).getTime()) / (1000 * 60 * 60 * 24),
      )
    : null;

  const isStale = column === 'introduced' && daysSinceIntroduction != null && daysSinceIntroduction >= 7;

  const buyerLink = buyer.remarketing_buyer_id
    ? `/admin/buyers/${buyer.remarketing_buyer_id}`
    : buyer.contact_id
      ? `/admin/buyers/${buyer.contact_id}`
      : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'bg-white rounded-lg border p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-blue-300',
        isStale && 'border-l-4 border-l-amber-400',
        isInPipeline && 'cursor-default opacity-90',
      )}
    >
      {/* Header: Name + Type */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          {buyerLink ? (
            <Link
              to={buyerLink}
              className="font-semibold text-sm hover:underline truncate block"
              onClick={(e) => e.stopPropagation()}
            >
              {buyer.buyer_name}
            </Link>
          ) : (
            <span className="font-semibold text-sm truncate block">
              {buyer.buyer_name}
            </span>
          )}
          {buyer.buyer_firm_name && buyer.buyer_firm_name !== buyer.buyer_name && (
            <p className="text-xs text-muted-foreground truncate">{buyer.buyer_firm_name}</p>
          )}
        </div>

        {/* Overflow menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {buyerLink && (
              <DropdownMenuItem asChild>
                <Link to={buyerLink}>
                  <ExternalLink className="h-3.5 w-3.5 mr-2" />
                  View Profile
                </Link>
              </DropdownMenuItem>
            )}
            {column === 'passed' && onReactivate && (
              <DropdownMenuItem onClick={() => onReactivate(buyer)}>
                <RotateCcw className="h-3.5 w-3.5 mr-2" />
                Reactivate
              </DropdownMenuItem>
            )}
            {column === 'to_introduce' && onRemove && (
              <DropdownMenuItem onClick={() => onRemove(buyer)} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Remove from Pipeline
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-1 mb-2">
        <BuyerTypeBadge buyerType={buyerType} isPeBacked={isPeBacked} />
        <ScoreBadge score={compositeScore} />
        <SourceBadge source={source} />
      </div>

      {/* Contact quick-actions: email, phone, linkedin */}
      {(buyer.buyer_email || buyer.buyer_phone || buyer.buyer_linkedin_url) && (
        <div className="flex items-center gap-1 mb-2">
          {buyer.buyer_email && (
            <a
              href={`mailto:${buyer.buyer_email}`}
              onClick={(e) => e.stopPropagation()}
              title={buyer.buyer_email}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <Mail className="h-2.5 w-2.5" />
              Email
            </a>
          )}
          {buyer.buyer_phone && (
            <ClickToDialPhone
              phone={buyer.buyer_phone}
              name={buyer.buyer_name}
              email={buyer.buyer_email || undefined}
              company={buyer.buyer_firm_name}
              entityType={buyer.remarketing_buyer_id ? 'buyers' : undefined}
              entityId={buyer.remarketing_buyer_id || undefined}
              label="Call"
              size="xs"
              className="px-1.5 py-0.5 rounded bg-green-50 hover:bg-green-100"
            />
          )}
          {buyer.buyer_linkedin_url && (
            <a
              href={buyer.buyer_linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="LinkedIn Profile"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors"
            >
              <Linkedin className="h-2.5 w-2.5" />
              LinkedIn
            </a>
          )}
        </div>
      )}

      {/* Column-specific content */}
      {column === 'to_introduce' && (
        <>
          {buyer.created_at && (
            <p className="text-[11px] text-muted-foreground mb-2">
              Added {formatDistanceToNow(new Date(buyer.created_at), { addSuffix: true })}
            </p>
          )}
          {onIntroduce && (
            <Button
              size="sm"
              className="w-full h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={(e) => {
                e.stopPropagation();
                onIntroduce(buyer);
              }}
            >
              <Send className="h-3 w-3" />
              Introduce
            </Button>
          )}
        </>
      )}

      {column === 'introduced' && (
        <>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2">
            {buyer.introduction_method && (
              <Badge variant="outline" className="text-[10px] gap-0.5">
                {(() => {
                  const ChannelIcon = CHANNEL_ICONS[buyer.introduction_method] || Mail;
                  return <ChannelIcon className="h-2.5 w-2.5" />;
                })()}
                {buyer.introduction_method}
              </Badge>
            )}
            {buyer.introduction_date && (
              <span className="flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                Introduced{' '}
                {formatDistanceToNow(new Date(buyer.introduction_date), { addSuffix: true })}
              </span>
            )}
          </div>
          {isStale && (
            <p className="text-[10px] text-amber-600 font-medium mb-2">
              {daysSinceIntroduction}+ days without response
            </p>
          )}
          <div className="flex gap-1.5">
            {onMarkInterested && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-xs gap-1 bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkInterested(buyer);
                }}
              >
                <ThumbsUp className="h-3 w-3" />
                Interested
              </Button>
            )}
            {onMarkPassed && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-xs gap-1 bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkPassed(buyer);
                }}
              >
                <ThumbsDown className="h-3 w-3" />
                Passed
              </Button>
            )}
          </div>
          {onLogFollowUp && (
            <Button
              size="sm"
              variant="ghost"
              className="w-full h-6 text-[11px] gap-1 text-muted-foreground mt-1"
              onClick={(e) => {
                e.stopPropagation();
                onLogFollowUp(buyer);
              }}
            >
              <MessageSquare className="h-2.5 w-2.5" />
              Log Follow-up
            </Button>
          )}
        </>
      )}

      {column === 'interested' && (
        <>
          {buyer.buyer_feedback && (
            <p className="text-xs text-gray-600 italic mb-2 line-clamp-2">
              &ldquo;{buyer.buyer_feedback.slice(0, 80)}
              {buyer.buyer_feedback.length > 80 ? '...' : ''}&rdquo;
            </p>
          )}
          {buyer.next_step && (
            <p className="text-[11px] text-muted-foreground mb-2">
              <span className="font-medium">Next:</span> {buyer.next_step}
            </p>
          )}
          {isInPipeline ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                In Deal Pipeline
              </span>
              <span className="text-[11px] text-emerald-600 flex items-center gap-0.5">
                <ArrowRight className="h-2.5 w-2.5" />
              </span>
            </div>
          ) : (
            onApproveForPipeline && (
              <Button
                size="sm"
                className="w-full h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  onApproveForPipeline(buyer);
                }}
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Approve for Deal Pipeline
              </Button>
            )
          )}
        </>
      )}

      {column === 'passed' && (
        <>
          {buyer.passed_reason && (
            <Badge variant="outline" className="text-[10px] mb-1.5 bg-gray-50">
              {buyer.passed_reason}
            </Badge>
          )}
          {buyer.passed_date && (
            <p className="text-[11px] text-muted-foreground mb-2">
              Passed {format(new Date(buyer.passed_date), 'MMM d, yyyy')}
            </p>
          )}
          {buyer.buyer_feedback && (
            <p className="text-xs text-gray-500 italic line-clamp-2">
              &ldquo;{buyer.buyer_feedback}&rdquo;
            </p>
          )}
        </>
      )}

      {/* View Profile link at bottom */}
      {buyerLink && (
        <Link
          to={buyerLink}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center gap-1 mt-2 pt-2 border-t text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          View Buyer Profile
        </Link>
      )}
    </div>
  );
}
