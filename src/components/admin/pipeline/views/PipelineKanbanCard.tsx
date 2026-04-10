import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarCheck, ListChecks, FileSignature } from 'lucide-react';
import { Deal } from '@/hooks/admin/use-deals';
import { cn } from '@/lib/utils';
import { useAdminProfile } from '@/hooks/admin/use-admin-profiles';
import { DealSourceBadge } from '@/components/remarketing/DealSourceBadge';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useUnreadMessageCounts } from '@/hooks/use-connection-messages';
import { BUYER_TYPE_SHORT_LABELS } from '@/constants';

interface PipelineKanbanCardProps {
  deal: Deal;
  onDealClick: (deal: Deal) => void;
  isDragging?: boolean;
}

const TIER_CONFIG: Record<number, { label: string; style: React.CSSProperties }> = {
  1: { label: 'T1', style: { backgroundColor: '#DEC76B', color: '#0E101A' } },
  2: {
    label: 'T2',
    style: { backgroundColor: '#F7F4DD', color: '#0E101A', border: '1px solid #DEC76B' },
  },
  3: { label: 'T3', style: { backgroundColor: '#F0EDE4', color: '#5A5A5A' } },
  4: { label: 'T4', style: { backgroundColor: '#E8E8E8', color: '#7A7A7A' } },
};

export function PipelineKanbanCard({ deal, onDealClick, isDragging }: PipelineKanbanCardProps) {
  const queryClient = useQueryClient();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: `deal:${deal.deal_id}` });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const isBeingDragged = isDragging || isSortableDragging;
  const assignedAdmin = useAdminProfile(deal.assigned_to);
  const { data: unreadCounts } = useUnreadMessageCounts();
  const unreadCount = deal.connection_request_id
    ? unreadCounts?.byRequest[deal.connection_request_id] || 0
    : 0;

  const companyName = deal.listing_real_company_name || deal.listing_title || 'Unnamed Company';
  const contactName = deal.contact_name || deal.buyer_name || 'Unknown';
  const buyerCompany = deal.contact_company || deal.buyer_company;
  const buyerTypeLabel = deal.buyer_type
    ? BUYER_TYPE_SHORT_LABELS[deal.buyer_type] || deal.buyer_type
    : null;

  const fmt = (val: number) => {
    if (!val) return '—';
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val.toLocaleString()}`;
  };

  const daysInStageCount = (() => {
    const entered = deal.deal_stage_entered_at;
    if (!entered) return null;
    return Math.floor((Date.now() - new Date(entered).getTime()) / 86400000);
  })();
  const daysInStage = daysInStageCount == null ? '—' : `${daysInStageCount}d`;

  // Stuck-deal thresholds (overridable per-deal via follow_up_cadence_days in the future)
  const STUCK_WARN_DAYS = 7;
  const STUCK_CRIT_DAYS = 14;
  const isStuckWarn =
    daysInStageCount != null &&
    daysInStageCount >= STUCK_WARN_DAYS &&
    daysInStageCount < STUCK_CRIT_DAYS;
  const isStuckCritical = daysInStageCount != null && daysInStageCount >= STUCK_CRIT_DAYS;

  const daysSinceActivity = (() => {
    const lastAt = deal.last_activity_at;
    if (!lastAt) return null;
    return Math.floor((Date.now() - new Date(lastAt).getTime()) / 86400000);
  })();
  const activityColor = daysSinceActivity === null ? '#9A9A9A'
    : daysSinceActivity <= 7 ? '#16A34A'
    : daysSinceActivity <= 14 ? '#B45309'
    : '#DC2626';

  const ownerDisplayName = (() => {
    const name = assignedAdmin?.displayName;
    if (!name || name === 'Unassigned') return 'Unassigned';
    const parts = name.split(' ');
    if (parts.length >= 2) return `${parts[0]} ${parts[1][0]}.`;
    return parts[0];
  })();

  const handleCardClick = () => {
    if (!isBeingDragged) onDealClick(deal);
  };

  const handleMeetingToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !deal.meeting_scheduled;
    const { error } = await supabase
      .from('deal_pipeline')
      .update({ meeting_scheduled: next })
      .eq('id', deal.deal_id);
    if (error) {
      toast.error('Failed to update');
      return;
    }
    toast.success(next ? 'Meeting scheduled' : 'Meeting unscheduled');
    queryClient.invalidateQueries({ queryKey: ['deals'] });
  };

  const handleLoiToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !deal.under_loi;
    const { error } = await supabase
      .from('deal_pipeline')
      .update({ under_loi: next })
      .eq('id', deal.deal_id);
    if (error) {
      toast.error('Failed to update');
      return;
    }
    toast.success(next ? 'Marked Under LOI' : 'LOI removed');
    queryClient.invalidateQueries({ queryKey: ['deals'] });
  };

  const statusDot = (status: string) => {
    if (status === 'signed') return 'bg-emerald-500';
    if (status === 'sent') return 'bg-amber-500';
    if (status === 'declined') return 'bg-destructive';
    return 'bg-muted-foreground/30';
  };

  // Score badge color - SourceCo brand: gold for high, charcoal for mid, dark for low
  const scoreStyle = (() => {
    const s = deal.deal_score;
    if (s == null) return null;
    if (s >= 70) return { backgroundColor: '#DEC76B', color: '#0E101A' };
    if (s >= 40) return { backgroundColor: '#0E101A', color: '#FFFFFF' };
    return { backgroundColor: '#8B0000', color: '#FFFFFF' };
  })();

  // Tier badge
  const tierConfig = deal.buyer_tier ? TIER_CONFIG[deal.buyer_tier] || TIER_CONFIG[4] : null;

  const borderColor = deal.under_loi
    ? '#9333EA'
    : isStuckCritical
      ? '#DC2626'
      : isStuckWarn
        ? '#F59E0B'
        : '#CBCBCB';

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ ...style, fontFamily: 'Montserrat, Inter, sans-serif', borderColor }}
      className={cn(
        'group relative mb-3 cursor-pointer rounded-[10px] overflow-hidden transition-all duration-200 border-2',
        isBeingDragged && 'shadow-2xl scale-[1.02] z-50 opacity-95',
        !isBeingDragged &&
          !deal.under_loi &&
          !isStuckCritical &&
          !isStuckWarn &&
          'hover:shadow-[0_4px_16px_rgba(222,199,107,0.25)] hover:-translate-y-px',
        !isBeingDragged &&
          deal.under_loi &&
          'hover:shadow-[0_4px_16px_rgba(147,51,234,0.3)] hover:-translate-y-px',
        !isBeingDragged &&
          isStuckWarn &&
          !deal.under_loi &&
          'hover:shadow-[0_4px_16px_rgba(245,158,11,0.35)] hover:-translate-y-px',
        !isBeingDragged &&
          isStuckCritical &&
          !deal.under_loi &&
          'hover:shadow-[0_4px_16px_rgba(220,38,38,0.4)] hover:-translate-y-px',
      )}
      onClick={handleCardClick}
      title={
        isStuckCritical
          ? `Stuck ${daysInStageCount} days in stage`
          : isStuckWarn
            ? `${daysInStageCount} days in stage`
            : undefined
      }
    >
      {/* ── Header: Company + Score ── */}
      <div
        className="px-4 pt-3.5 pb-2.5"
        style={{
          backgroundColor: deal.under_loi
            ? '#F3E8FF'
            : deal.needs_owner_contact
              ? '#FFF0F0'
              : deal.needs_buyer_search
                ? '#EFF6FF'
                : '#FCF9F0',
          borderBottom: deal.under_loi ? '1px solid #C084FC' : '1px solid #E5DDD0',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 style={{ color: '#0E101A' }} className={cn('text-[15px] font-bold leading-snug')}>
            {companyName}
          </h3>
          {deal.deal_score != null && scoreStyle && (
            <span
              className="flex-shrink-0 min-w-[42px] text-center px-2.5 py-1 rounded-md text-sm font-extrabold"
              style={scoreStyle}
            >
              {deal.deal_score}
            </span>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-4 py-3 space-y-3.5" style={{ backgroundColor: '#FFFFFF' }}>
        {/* Buyer Section */}
        <div className="pb-3.5 space-y-1" style={{ borderBottom: '1px solid #E5DDD0' }}>
          <div className="text-sm font-bold truncate" style={{ color: '#0E101A' }}>
            {buyerCompany || contactName}
          </div>
          {buyerCompany && (
            <div className="text-xs truncate" style={{ color: '#5A5A5A' }}>
              {contactName}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            {buyerTypeLabel && (
              <span className="text-[11px] font-semibold" style={{ color: '#5A5A5A' }}>
                {buyerTypeLabel}
              </span>
            )}
            {tierConfig && (
              <span
                className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                style={tierConfig.style}
              >
                {tierConfig.label}
              </span>
            )}
          </div>
        </div>

        {/* Tags Row: Industry + NDA + Fee */}
        <div className="flex flex-wrap gap-1.5">
          {deal.listing_category && (
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded"
              style={{ backgroundColor: '#F7F4DD', color: '#0E101A', border: '1px solid #DEC76B' }}
            >
              {deal.listing_category}
            </span>
          )}
          {deal.nda_status === 'signed' && (
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded"
              style={{ backgroundColor: '#0E101A', color: '#FFFFFF' }}
            >
              NDA
            </span>
          )}
          {deal.fee_agreement_status === 'signed' && (
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded"
              style={{ backgroundColor: '#DEC76B', color: '#0E101A' }}
            >
              Fee
            </span>
          )}
          {deal.under_loi && (
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded"
              style={{ backgroundColor: '#9333EA', color: '#FFFFFF' }}
            >
              Under LOI
            </span>
          )}
        </div>

        {/* Financials */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: '#5A5A5A' }}
            >
              EBITDA
            </span>
            <span className="text-base font-extrabold tabular-nums" style={{ color: '#0E101A' }}>
              {fmt(deal.listing_ebitda)}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: '#9A9A9A' }}
            >
              Revenue
            </span>
            <span className="text-base font-extrabold tabular-nums" style={{ color: '#0E101A' }}>
              {fmt(deal.listing_revenue)}
            </span>
          </div>
        </div>

        {/* Footer: Owner + Source + Days */}
        <div
          className="flex items-center justify-between pt-3"
          style={{ borderTop: '1px solid #E5DDD0' }}
        >
          <span className="text-[13px] font-bold" style={{ color: '#0E101A' }}>
            {ownerDisplayName}
          </span>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <span
                className="flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold"
                style={{ backgroundColor: '#8B0000', color: '#FFFFFF' }}
              >
                {unreadCount}
              </span>
            )}
            <DealSourceBadge source={deal.deal_source} />
            {daysSinceActivity !== null && (
              <span
                className="text-[9px] tabular-nums font-semibold rounded px-1"
                style={{ color: activityColor, backgroundColor: daysSinceActivity > 14 ? '#FEF2F2' : 'transparent' }}
                title={`${daysSinceActivity}d since last activity`}
              >
                {daysSinceActivity}d act
              </span>
            )}
            <span
              className="text-[11px] tabular-nums font-semibold"
              style={{ color: isStuckCritical ? '#DC2626' : isStuckWarn ? '#B45309' : '#9A9A9A' }}
            >
              {daysInStage}
            </span>
          </div>
        </div>
      </div>

      {/* ── Compact status dots row ── */}
      <div
        className="px-4 py-1.5 flex items-center gap-3 text-[10px]"
        style={{ borderTop: '1px solid #E5DDD0', backgroundColor: '#FCF9F0', color: '#5A5A5A' }}
      >
        <span
          className="inline-flex items-center gap-1"
          title={`NDA: ${deal.nda_status || 'none'}`}
        >
          NDA{' '}
          <span
            className={cn('inline-block w-1.5 h-1.5 rounded-full', statusDot(deal.nda_status))}
          />
        </span>
        <span
          className="inline-flex items-center gap-1"
          title={`Fee: ${deal.fee_agreement_status || 'none'}`}
        >
          Fee{' '}
          <span
            className={cn(
              'inline-block w-1.5 h-1.5 rounded-full',
              statusDot(deal.fee_agreement_status),
            )}
          />
        </span>
        <span
          className="inline-flex items-center gap-1"
          title={`Memo: ${deal.memo_sent ? 'Sent' : 'No'}`}
        >
          Memo{' '}
          <span
            className={cn(
              'inline-block w-1.5 h-1.5 rounded-full',
              deal.memo_sent ? 'bg-emerald-500' : 'bg-muted-foreground/30',
            )}
          />
        </span>
        <span
          className="inline-flex items-center gap-1"
          title={`Data Room: ${deal.has_data_room ? 'Yes' : 'No'}`}
        >
          DR{' '}
          <span
            className={cn(
              'inline-block w-1.5 h-1.5 rounded-full',
              deal.has_data_room ? 'bg-emerald-500' : 'bg-muted-foreground/30',
            )}
          />
        </span>
        <button
          type="button"
          onClick={handleMeetingToggle}
          className="inline-flex items-center gap-1 rounded transition-colors hover:bg-accent p-0.5 -ml-0.5"
          title={`Meeting: ${deal.meeting_scheduled ? 'Yes' : 'No'}`}
        >
          Mtg{' '}
          <CalendarCheck
            className={cn(
              'w-3 h-3',
              deal.meeting_scheduled ? 'text-emerald-500' : 'text-muted-foreground/30',
            )}
          />
        </button>
        <button
          type="button"
          onClick={handleLoiToggle}
          className="inline-flex items-center gap-1 rounded transition-colors hover:bg-accent p-0.5"
          title={`Under LOI: ${deal.under_loi ? 'Yes' : 'No'}`}
        >
          LOI{' '}
          <FileSignature
            className={cn(
              'w-3 h-3',
              deal.under_loi ? 'text-purple-600' : 'text-muted-foreground/30',
            )}
          />
        </button>
        {deal.pending_tasks > 0 && (
          <span
            className="inline-flex items-center gap-1 ml-auto font-bold"
            style={{ color: deal.followup_overdue ? '#DC2626' : '#8B0000' }}
            title={
              deal.next_followup_due
                ? `Next follow-up ${new Date(deal.next_followup_due).toLocaleDateString()}${deal.followup_overdue ? ' (overdue)' : ''} · ${deal.pending_tasks} open task${deal.pending_tasks !== 1 ? 's' : ''}`
                : `${deal.pending_tasks} open task${deal.pending_tasks !== 1 ? 's' : ''}`
            }
          >
            <ListChecks className="w-3 h-3" /> {deal.pending_tasks}
            {deal.next_followup_due && (
              <span className="text-[9px] font-semibold opacity-80">
                ·{' '}
                {(() => {
                  const d = new Date(deal.next_followup_due);
                  const today = new Date();
                  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
                  if (diff === 0) return 'today';
                  if (diff === 1) return 'tmr';
                  if (diff > 0) return `${diff}d`;
                  return `${-diff}d late`;
                })()}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
