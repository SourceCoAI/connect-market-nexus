/**
 * BuyerMatchCard.tsx
 *
 * Displays a single buyer match result for a deal, showing composite and sub-scores
 * (geography, size, service, owner goals), fit reasoning, outreach status, and
 * action buttons for approving, passing, or moving a buyer into the pipeline.
 *
 * Data sources:
 *   Props received from parent (score data from remarketing_scores table);
 *   OutreachStatusDialog for outreach tracking
 *
 * Used on:
 *   ReMarketing deal matching page (/admin/remarketing/deals/:id/matching)
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Check,
  X,
  ExternalLink,
  Eye,
  MapPin,
  ChevronDown,
  FileText,
  Users,
  Globe,
  Building2,
  Landmark,
  AlertTriangle,
  DollarSign,
  Target,
  Mail,
  Calendar,
  ArrowRightCircle,
} from 'lucide-react';
import { IntelligenceBadge } from './IntelligenceBadge';
import { OutreachStatusDialog, type OutreachStatus } from './OutreachStatusDialog';
import { FlagForBuyerButton } from '@/components/daily-tasks/FlagForBuyerButton';
import { BuyerMatchDetails } from './BuyerMatchDetails';
import {
  isDisqualified,
  getMissingDataFields,
  getBuyerLocationDisplay,
  getScoreDescription,
  formatCurrency,
  getReasoningBackground,
  getScoreRingColor,
  getTierLabel,
  ScoreBreakdownPanel,
} from './BuyerMatchScoreSection';
import type { ScoreTier, ReMarketingBuyer } from '@/types/remarketing';

interface OutreachData {
  status: OutreachStatus;
  contacted_at?: string;
  notes?: string;
}

interface BuyerMatchCardProps {
  score: {
    id: string;
    composite_score: number;
    geography_score: number;
    size_score: number;
    service_score: number;
    owner_goals_score: number;
    size_multiplier?: number | null;
    service_multiplier?: number | null;
    thesis_alignment_bonus?: number | null;
    is_disqualified?: boolean | null;
    disqualification_reason?: string | null;
    needs_review?: boolean | null;
    tier: ScoreTier | null;
    fit_reasoning: string | null;
    status: string;
    pass_reason?: string | null;
    pass_category?: string | null;
    last_viewed_at?: string | null;
    buyer?: ReMarketingBuyer;
    universe?: { id: string; name: string } | null;
  };
  dealLocation?: string;
  isSelected?: boolean;
  isHighlighted?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  onApprove: (scoreId: string, scoreData: any) => void;
  onPass: (scoreId: string, buyerName: string, scoreData: any) => void;
  onToggleInterested?: (scoreId: string, interested: boolean, scoreData: any) => void;
  onMarkInterested?: (scoreId: string, buyerId: string, listingId: string) => Promise<void>;
  onOutreachUpdate?: (scoreId: string, status: OutreachStatus, notes: string) => Promise<void>;
  onViewed?: (scoreId: string) => void;
  onMoveToPipeline?: (scoreId: string, buyerId: string, listingId: string) => Promise<void>;
  onApproveMultiDeal?: (buyerId: string, buyerName: string, currentListingId: string) => void;
  outreach?: OutreachData | null;
  isPending?: boolean;
  universeName?: string; // Show universe badge when viewing "All Universes"
  firmFeeAgreement?: { signed: boolean; signedAt: string | null };
  pipelineDealId?: string | null; // If set, buyer already has a deal in the pipeline
  listingId?: string; // The listing this score is for
}

// Outreach status colors and labels
const getOutreachBadge = (status: OutreachStatus) => {
  const config: Record<
    OutreachStatus,
    { label: string; className: string; icon: React.ElementType }
  > = {
    pending: { label: 'Pending', className: 'bg-slate-100 text-slate-700', icon: Mail },
    contacted: { label: 'Contacted', className: 'bg-blue-100 text-blue-700', icon: Mail },
    responded: { label: 'Responded', className: 'bg-cyan-100 text-cyan-700', icon: Mail },
    meeting_scheduled: {
      label: 'Meeting',
      className: 'bg-purple-100 text-purple-700',
      icon: Calendar,
    },
    loi_sent: { label: 'LOI Sent', className: 'bg-indigo-100 text-indigo-700', icon: FileText },
    closed_won: { label: 'Won', className: 'bg-emerald-100 text-emerald-700', icon: Check },
    closed_lost: { label: 'Lost', className: 'bg-red-100 text-red-700', icon: X },
  };
  return config[status] || config.pending;
};

export const BuyerMatchCard = ({
  score,
  dealLocation,
  isSelected = false,
  isHighlighted = false,
  onSelect,
  onApprove,
  onPass,
  onToggleInterested: _onToggleInterested,
  onMarkInterested,
  onOutreachUpdate,
  onViewed,
  onMoveToPipeline: _onMoveToPipeline,
  onApproveMultiDeal,
  outreach,
  isPending = false,
  universeName,
  firmFeeAgreement,
  pipelineDealId,
  listingId,
}: BuyerMatchCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [outreachDialogOpen, setOutreachDialogOpen] = useState(false);

  // Track when card is expanded for the first time
  const handleExpand = (expanded: boolean) => {
    if (expanded && !isExpanded && onViewed) {
      onViewed(score.id);
    }
    setIsExpanded(expanded);
  };

  const buyer = score.buyer;
  const disqualified = isDisqualified(score);
  const missingData = getMissingDataFields(buyer);

  // Format financial range
  const financialRange =
    buyer?.target_revenue_min || buyer?.target_revenue_max
      ? `${formatCurrency(buyer?.target_revenue_min) || '?'}-${formatCurrency(buyer?.target_revenue_max) || '?'}`
      : null;

  // Buyer footprint summary
  const buyerFootprint = buyer?.geographic_footprint?.slice(0, 3).join(', ') || 'Unknown';

  // Handle outreach save
  const handleOutreachSave = async (status: OutreachStatus, notes: string) => {
    if (onOutreachUpdate) {
      await onOutreachUpdate(score.id, status, notes);
    }
  };

  // Get outreach badge info
  const outreachBadge = outreach ? getOutreachBadge(outreach.status) : null;

  return (
    <div
      id={`buyer-card-${score.buyer?.id}`}
      className={cn(
        'border rounded-lg transition-all bg-background',
        score.status === 'passed' && 'opacity-60',
        isHighlighted && 'ring-2 ring-primary border-primary shadow-lg shadow-primary/10',
      )}
    >
      {/* Main Header Row - White background */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-4">
          {/* Checkbox */}
          {onSelect && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelect(score.id, checked as boolean)}
              className="mt-5"
            />
          )}

          {/* Large Score Circle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'flex-shrink-0 w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center cursor-help',
                    getScoreRingColor(score.composite_score, disqualified),
                  )}
                >
                  <span className="text-xl font-bold leading-none">
                    {disqualified ? '—' : Math.round(score.composite_score)}
                  </span>
                  <span className="text-[10px] font-semibold leading-none mt-0.5 opacity-70">
                    {getTierLabel(score.composite_score, disqualified)}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="font-medium">
                  {getScoreDescription(score.composite_score, disqualified)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Score: {score.composite_score}/100
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Buyer Info */}
          <div className="flex-1 min-w-0">
            {/* Row 1: Name + Links + Status Badges */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Link
                to={`/admin/buyers/${buyer?.id}`}
                className="font-semibold text-lg hover:underline leading-tight"
              >
                {buyer?.company_name || 'Unknown Buyer'}
              </Link>

              {/* Eye icon for preview */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to={`/admin/buyers/${buyer?.id}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>View buyer profile</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {buyer?.company_website && (
                <a
                  href={
                    buyer.company_website.startsWith('http')
                      ? buyer.company_website
                      : `https://${buyer.company_website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}

              {/* Disqualified Badge - inline with name */}
              {disqualified && (
                <Badge
                  variant="outline"
                  className="bg-orange-100 text-orange-700 border-orange-300 text-xs"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Disqualified
                </Badge>
              )}

              {/* Universe Badge - when viewing all universes */}
              {(universeName || score.universe?.name) && (
                <Badge
                  variant="outline"
                  className="bg-blue-50 text-blue-700 border-blue-200 text-xs"
                >
                  <Target className="h-3 w-3 mr-1" />
                  {universeName || score.universe?.name}
                </Badge>
              )}

              {/* Fee Status Badge - cross-referenced with marketplace firm_agreements */}
              {firmFeeAgreement?.signed || buyer?.has_fee_agreement ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="bg-emerald-50 text-emerald-700 border-emerald-300 text-xs"
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        Fee Signed
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      {firmFeeAgreement?.signedAt
                        ? `Fee agreement signed ${new Date(firmFeeAgreement.signedAt).toLocaleDateString()}`
                        : 'Fee agreement on file'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-xs">
                  <FileText className="h-3 w-3 mr-1" />
                  No Fee
                </Badge>
              )}
            </div>

            {/* Row 2: Location + Website + PE Firm (compact single row) */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap mb-1">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {getBuyerLocationDisplay(buyer)}
              </span>

              {buyer?.company_website &&
                (() => {
                  const siteUrl = buyer.company_website;
                  return (
                    <a
                      href={siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      <span className="truncate max-w-[180px]">
                        {siteUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                      </span>
                    </a>
                  );
                })()}

              {buyer?.pe_firm_website && (
                <a
                  href={
                    buyer.pe_firm_website.startsWith('http')
                      ? buyer.pe_firm_website
                      : `https://${buyer.pe_firm_website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:underline"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span className="truncate max-w-[180px]">
                    {buyer.pe_firm_website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                  </span>
                </a>
              )}

              {buyer?.pe_firm_name && (
                <span className="flex items-center gap-1">
                  <Landmark className="h-3.5 w-3.5" />
                  {buyer.pe_firm_name}
                </span>
              )}
            </div>

            {/* Row 5: Thesis Summary (truncated) */}
            {buyer?.thesis_summary && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                {buyer.thesis_summary}
              </p>
            )}

            {/* Row 6: Financial Range + Contacts */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {financialRange && (
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  {financialRange}
                </span>
              )}
              {buyer?.contacts && buyer.contacts.length > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {buyer.contacts.length} contacts
                </span>
              )}
            </div>
          </div>

          {/* Right Side: Intel + Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Intelligence Badge with missing fields */}
            <IntelligenceBadge
              hasTranscript={!!buyer?.extraction_sources?.some((s: any) => s.type === 'transcript')}
              missingFields={missingData}
              size="sm"
            />

            {/* Expand Chevron - Circular Button Style */}
            <Collapsible open={isExpanded} onOpenChange={handleExpand}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                  <ChevronDown
                    className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')}
                  />
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between mt-2">
          {/* Left: Status */}
          <div className="flex items-center gap-3">
            {score.status === 'passed' && (
              <Badge variant="outline" className="text-muted-foreground">
                <X className="h-3 w-3 mr-1" />
                Passed
                {score.pass_reason && ` - ${score.pass_category}`}
              </Badge>
            )}
          </div>

          {/* Right: Status badges + actions */}
          <div className="flex items-center gap-2">
            {/* Approve / Pass buttons for pending buyers */}
            {score.status !== 'approved' && score.status !== 'passed' && score.status !== 'interested' && (
              <>
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => onApprove(score.id, score)}
                  disabled={isPending}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Approve
                </Button>
                {onApproveMultiDeal && listingId && buyer?.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => onApproveMultiDeal(buyer!.id, buyer!.company_name || 'Unknown', listingId)}
                    disabled={isPending}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Approve for Multiple Deals
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => onPass(score.id, buyer?.company_name || 'Unknown', score)}
                  disabled={isPending}
                >
                  <X className="h-3 w-3 mr-1" />
                  Pass
                </Button>
              </>
            )}

            {score.status === 'approved' && (
              <>
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  <Check className="h-3 w-3 mr-1" />
                  Approved
                </Badge>
                {/* Outreach Status Badge */}
                {outreachBadge && outreach?.status !== 'pending' && (
                  <Badge className={cn('border', outreachBadge.className)}>
                    <outreachBadge.icon className="h-3 w-3 mr-1" />
                    {outreachBadge.label}
                  </Badge>
                )}
                {/* Track Outreach Button */}
                {onOutreachUpdate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setOutreachDialogOpen(true)}
                  >
                    <Mail className="h-3 w-3 mr-1" />
                    {outreach ? 'Update' : 'Track'}
                  </Button>
                )}
                {/* Mark Interested Button - triggers pipeline conversion */}
                {onMarkInterested && listingId && score.buyer?.id && !pipelineDealId && (
                  <Button
                    size="sm"
                    className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => onMarkInterested(score.id, score.buyer!.id, listingId)}
                    disabled={isPending}
                  >
                    <ArrowRightCircle className="h-3 w-3 mr-1" />
                    Mark Interested
                  </Button>
                )}
                {/* Already in Pipeline */}
                {pipelineDealId && (
                  <Link to={`/admin/deals/pipeline?deal=${pipelineDealId}`}>
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200 cursor-pointer hover:bg-blue-200">
                      <ArrowRightCircle className="h-3 w-3 mr-1" />
                      In Pipeline
                    </Badge>
                  </Link>
                )}
              </>
            )}

            {score.status === 'interested' && (
              <>
                <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                  <Check className="h-3 w-3 mr-1" />
                  Interested
                </Badge>
                {pipelineDealId ? (
                  <Link to={`/admin/deals/pipeline?deal=${pipelineDealId}`}>
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200 cursor-pointer hover:bg-blue-200">
                      <ArrowRightCircle className="h-3 w-3 mr-1" />
                      View in Pipeline
                    </Badge>
                  </Link>
                ) : null}
              </>
            )}

            {/* Flag for Follow-up */}
            {buyer?.id && (
              <FlagForBuyerButton
                buyerId={buyer.id}
                buyerName={buyer.company_name || 'Unknown'}
                dealId={pipelineDealId || undefined}
                listingId={listingId}
                listingName={undefined}
              />
            )}
          </div>
        </div>
      </div>

      {/* Outreach Status Dialog */}
      <OutreachStatusDialog
        open={outreachDialogOpen}
        onOpenChange={setOutreachDialogOpen}
        buyerName={buyer?.company_name || 'Unknown Buyer'}
        currentStatus={outreach?.status}
        onSave={handleOutreachSave}
      />

      {/* Score Breakdown Panel - Colored background based on tier */}
      <div className={cn('border-t p-4', getReasoningBackground(score.composite_score, disqualified))}>
        <ScoreBreakdownPanel
          score={score}
          disqualified={disqualified}
          buyerFootprint={buyerFootprint}
          dealLocation={dealLocation}
        />

        {/* Expandable Thesis */}
        <Collapsible open={isExpanded} onOpenChange={handleExpand}>
          <CollapsibleContent className="pt-4">
            <BuyerMatchDetails buyer={buyer} />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
};

export default BuyerMatchCard;
