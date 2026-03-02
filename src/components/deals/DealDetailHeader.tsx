/**
 * DealDetailHeader — Navy-themed header for the deal detail panel.
 *
 * Displays at the top of the right-hand detail panel when a deal card is
 * selected.  It combines three information layers:
 *
 *  1. **Company identity**  — category icon, title, tags (category, location,
 *     acquisition type), and the EBITDA figure displayed prominently in gold.
 *
 *  2. **Pipeline progress**  — a horizontal 6-stage checklist
 *     (Interested → Sign Docs → Under Review → IOI → LOI → Closed) that
 *     gives buyers an at-a-glance view of where this deal sits in the
 *     full deal lifecycle.  Completed stages show a check mark; the
 *     current stage is highlighted in gold; future stages are dimmed.
 *
 *  3. **Status awareness** — rejected deals are rendered with muted
 *     styling so the buyer immediately understands the deal is inactive.
 *
 * The stage is derived from the combination of request status, NDA signing
 * state, and deal memo availability, matching the same logic used by the
 * sidebar DealPipelineCard so the two always stay in sync.
 *
 * Props are intentionally flat (no nested objects) to keep the component
 * easy to test and free of coupling to specific query shapes.
 */

import { cn } from '@/lib/utils';
import { formatCompactCurrency } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  TechnologyIcon,
  HealthcareIcon,
  ManufacturingIcon,
  FinanceIcon,
  RetailIcon,
  RealEstateIcon,
  FoodBeverageIcon,
  ProfessionalServicesIcon,
  ConstructionIcon,
  TransportationIcon,
  EducationIcon,
  HospitalityIcon,
  EnergyIcon,
  MediaIcon,
  AutomotiveIcon,
  AgricultureIcon,
  TelecommunicationsIcon,
  ConsumerGoodsIcon,
  BusinessServicesIcon,
  DefaultCategoryIcon,
} from '@/components/icons/CategoryIcons';

/* ─── Pipeline stage definitions ───────────────────────────────────────── */

const PIPELINE_STAGES = [
  { id: 'interested', label: 'Interested', description: 'You expressed interest in this deal' },
  {
    id: 'sign_docs',
    label: 'Sign Docs',
    description: 'Sign NDA and Fee Agreement to unlock deal materials',
  },
  {
    id: 'under_review',
    label: 'Under Review',
    description: 'Deal owner is reviewing your profile and interest',
  },
  {
    id: 'ioi',
    label: 'IOI',
    description: 'Submit your Indication of Interest',
  },
  { id: 'loi', label: 'LOI', description: 'Letter of Intent stage' },
  { id: 'closed', label: 'Closed', description: 'Deal has been closed' },
] as const;

type PipelineStageId = (typeof PIPELINE_STAGES)[number]['id'];

/* ─── Props ────────────────────────────────────────────────────────────── */

interface DealDetailHeaderProps {
  /** Listing UUID — used for the "View listing" link */
  listingId: string;
  title: string;
  category?: string;
  location?: string;
  acquisitionType?: string | null;
  ebitda?: number;
  revenue?: number;
  /** Connection request status from the backend */
  requestStatus: 'pending' | 'approved' | 'rejected';
  /** Whether the buyer's firm has signed the platform NDA */
  ndaSigned?: boolean;
  /** Whether the deal is under review by the owner */
  hasCim?: boolean;
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

/**
 * Map a category string to the matching SVG icon component.
 * Falls back to DefaultCategoryIcon for unknown categories.
 */
function getCategoryIcon(category?: string) {
  if (!category) return DefaultCategoryIcon;
  const cat = category.toLowerCase();
  if (cat.includes('technology') || cat.includes('software')) return TechnologyIcon;
  if (cat.includes('healthcare') || cat.includes('medical')) return HealthcareIcon;
  if (cat.includes('manufacturing')) return ManufacturingIcon;
  if (cat.includes('finance') || cat.includes('insurance')) return FinanceIcon;
  if (cat.includes('retail') || cat.includes('e-commerce')) return RetailIcon;
  if (cat.includes('real estate')) return RealEstateIcon;
  if (cat.includes('food') || cat.includes('beverage')) return FoodBeverageIcon;
  if (cat.includes('professional services')) return ProfessionalServicesIcon;
  if (cat.includes('construction')) return ConstructionIcon;
  if (cat.includes('transportation') || cat.includes('logistics')) return TransportationIcon;
  if (cat.includes('education')) return EducationIcon;
  if (cat.includes('hospitality') || cat.includes('tourism')) return HospitalityIcon;
  if (cat.includes('energy') || cat.includes('utilities')) return EnergyIcon;
  if (cat.includes('media') || cat.includes('entertainment')) return MediaIcon;
  if (cat.includes('automotive')) return AutomotiveIcon;
  if (cat.includes('agriculture')) return AgricultureIcon;
  if (cat.includes('telecommunications')) return TelecommunicationsIcon;
  if (cat.includes('consumer goods')) return ConsumerGoodsIcon;
  if (cat.includes('business services')) return BusinessServicesIcon;
  return DefaultCategoryIcon;
}

/**
 * Determine the current pipeline stage from the deal's state.
 *
 * The logic mirrors DealPipelineCard.getCurrentStage() but maps to the
 * redesigned 6-stage model (which collapses NDA + Fee into "Sign Docs").
 */
function getCurrentStage(status: string, ndaSigned?: boolean, hasCim?: boolean): PipelineStageId {
  if (status === 'rejected') return 'interested';
  if (hasCim) return 'under_review';
  if (ndaSigned) return 'sign_docs'; // docs done, waiting for review
  return 'interested';
}

function getStageIndex(stageId: PipelineStageId): number {
  return PIPELINE_STAGES.findIndex((s) => s.id === stageId);
}

/* ─── Component ────────────────────────────────────────────────────────── */

export function DealDetailHeader({
  listingId,
  title,
  category,
  location,
  acquisitionType,
  ebitda,
  revenue,
  requestStatus,
  ndaSigned,
  hasCim,
}: DealDetailHeaderProps) {
  const CategoryIcon = getCategoryIcon(category);
  const currentStage = getCurrentStage(requestStatus, ndaSigned, hasCim);
  const currentIndex = getStageIndex(currentStage);
  const isRejected = requestStatus === 'rejected';

  // Compute EBITDA margin when both figures are available
  const ebitdaMargin =
    ebitda && revenue && revenue > 0 ? ((ebitda / revenue) * 100).toFixed(1) : null;

  return (
    <TooltipProvider>
    <div className={cn('bg-[#0E101A] rounded-t-xl', isRejected && 'opacity-80')}>
        {/* ── Company identity row ── */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            {/* Left: icon + title + tags */}
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] border border-[rgba(222,199,107,0.35)]">
                <CategoryIcon className="h-5 w-5 text-[#DEC76B]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-semibold text-white truncate">{title}</h2>
                  <Link
                    to={`/listing/${listingId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white/80 transition-colors shrink-0"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {category && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/10 text-[11px] text-white/70">
                      {category}
                    </span>
                  )}
                  {location && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/10 text-[11px] text-white/70">
                      {location}
                    </span>
                  )}
                  {acquisitionType && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/10 text-[11px] text-white/70 capitalize">
                      {acquisitionType.replace('_', ' ')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: EBITDA callout */}
            {ebitda && (
              <div className="text-right shrink-0">
                <div className="text-xl font-semibold text-[#DEC76B] tabular-nums">
                  {formatCompactCurrency(ebitda)}
                </div>
                <div className="text-[11px] text-white/45">
                  EBITDA{ebitdaMargin ? ` · ${ebitdaMargin}% margin` : ''}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Pipeline progress checklist ──
             Each stage is a numbered circle. Completed stages show ✓,
             the current stage is gold-highlighted, future stages are dimmed. */}
        <div className="flex px-4 pb-0">
          {PIPELINE_STAGES.map((stage, i) => {
            // The first stage (Interested) is always complete unless rejected
            const isComplete = !isRejected && i < currentIndex;
            // Current stage is the one at currentIndex (but only if equal,
            // not past — past stages are "complete")
            const isCurrent = !isRejected && i === currentIndex;

            return (
              <Tooltip key={stage.id} delayDuration={150}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'flex-1 text-center py-3 relative cursor-default',
                      // Bottom highlight bar for completed / current
                      'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px]',
                      isComplete && 'after:bg-[rgba(222,199,107,0.4)]',
                      isCurrent && 'after:bg-[#DEC76B]',
                      !isComplete && !isCurrent && 'after:bg-transparent',
                    )}
                  >
                    {/* Stage number / check */}
                    <div
                      className={cn(
                        'mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold border',
                        isComplete &&
                          'bg-[rgba(222,199,107,0.2)] text-[#DEC76B] border-[rgba(222,199,107,0.4)]',
                        isCurrent &&
                          'bg-[rgba(222,199,107,0.2)] text-[#DEC76B] border-[rgba(222,199,107,0.5)]',
                        !isComplete && !isCurrent && 'border-white/15 text-white/30 bg-transparent',
                      )}
                    >
                      {isComplete ? '✓' : i + 1}
                    </div>
                    {/* Stage label */}
                    <div
                      className={cn(
                        'text-[10px] font-medium',
                        isComplete && 'text-[#DEC76B]/80',
                        isCurrent && 'text-[#DEC76B]',
                        !isComplete && !isCurrent && 'text-white/40',
                      )}
                    >
                      {stage.label}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="bg-[#0E101A] text-white border-white/10 text-xs max-w-[200px]"
                >
                  <p className="font-medium">{stage.label}</p>
                  <p className="text-white/70 mt-0.5">{stage.description}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
