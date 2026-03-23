import { Link, useLocation } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  MapPin,
  FileCheck,
  ChevronRight,
  ExternalLink,
  Globe,
  Loader2,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BuyerIntroduction } from '@/types/buyer-introductions';
import type { BuyerDisplayData } from './buyer-row-utils';
import type { UniverseAssignmentData } from './buyer-introduction-constants';

// ─── Buyer Name + Firm Display ───
export function BuyerNameDisplay({
  buyer,
  displayData,
}: {
  buyer: BuyerIntroduction;
  displayData: BuyerDisplayData;
}) {
  const routerLocation = useLocation();
  const { displayName, firmName, firmId, isPubliclyTraded } = displayData;

  return (
    <div className="flex items-center gap-1.5">
      {buyer.remarketing_buyer_id || buyer.contact_id ? (
        <Link
          to={`/admin/buyers/${buyer.remarketing_buyer_id || buyer.contact_id}`}
          state={{ from: routerLocation.pathname }}
        >
          <span className="font-semibold text-[15px] hover:underline truncate">{displayName}</span>
        </Link>
      ) : (
        <span className="font-semibold text-[15px] truncate">{displayName}</span>
      )}
      {isPubliclyTraded && (
        <Badge
          variant="outline"
          className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200 gap-0.5"
        >
          <TrendingUp className="h-2.5 w-2.5" />
          Public
        </Badge>
      )}
      {firmName &&
        (() => {
          return (
            <>
              <span className="text-muted-foreground text-[13px]">/</span>
              {firmId ? (
                <Link
                  to={`/admin/buyers/pe-firms/${firmId}`}
                  state={{ from: routerLocation.pathname }}
                >
                  <span className="text-[13px] text-muted-foreground hover:underline hover:text-foreground truncate">
                    {firmName}
                  </span>
                </Link>
              ) : (
                <span className="text-[13px] text-muted-foreground truncate">{firmName}</span>
              )}
            </>
          );
        })()}
    </div>
  );
}

// ─── Location + Fee + Website meta line ───
export function BuyerMetaLine({
  displayData,
  children,
  extraContent,
}: {
  displayData: BuyerDisplayData;
  /** Override the default location display (rendered before fee/website). */
  children?: React.ReactNode;
  /** Extra content rendered after fee/website (e.g. "Xd in pipeline"). */
  extraContent?: React.ReactNode;
}) {
  const { location, hasFeeAgreement, companyWebsite } = displayData;

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
      {children}
      {!children && location && (
        <>
          <MapPin className="h-3 w-3" />
          {location}
        </>
      )}
      {hasFeeAgreement && (
        <span className="flex items-center gap-0.5 text-green-600 ml-1">
          <FileCheck className="h-3 w-3" />
          Fee
        </span>
      )}
      {companyWebsite && (
        <a
          href={companyWebsite.startsWith('http') ? companyWebsite : `https://${companyWebsite}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-0.5 text-blue-600 hover:text-blue-800 ml-1"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" />
          Website
        </a>
      )}
      {extraContent}
    </div>
  );
}

// ─── Fit Signal Tags ───
export function FitSignalTags({
  fitSignals,
  children,
}: {
  fitSignals: string[];
  children?: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-wrap gap-1 min-w-0">
      {fitSignals.slice(0, 3).map((signal, i) => (
        <span
          key={i}
          className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium whitespace-nowrap"
        >
          {signal}
        </span>
      ))}
      {children}
    </div>
  );
}

// ─── Score / Tier / Source / Status badges + Update + Push buttons ───
export function BuyerRowActions({
  buyer,
  displayData,
  universeAssignment,
  onSelect,
  onSendToUniverse,
  isSendingToUniverse,
}: {
  buyer: BuyerIntroduction;
  displayData: BuyerDisplayData;
  universeAssignment?: UniverseAssignmentData | null;
  onSelect: (b: BuyerIntroduction) => void;
  onSendToUniverse: (args: { buyer: BuyerIntroduction; universeId: string }) => void;
  isSendingToUniverse: boolean;
}) {
  const { sourceBadge, tier, compositeScore, statusConfig } = displayData;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="flex items-center gap-2 shrink-0">
      {sourceBadge && (
        <Badge variant="outline" className={cn('text-[11px]', sourceBadge.color)}>
          {sourceBadge.label}
        </Badge>
      )}

      {tier && (
        <Badge variant="outline" className={cn('text-xs gap-0.5', tier.color)}>
          <tier.icon className="h-3 w-3" />
          {tier.label}
        </Badge>
      )}

      {compositeScore != null && (
        <span
          className={cn(
            'text-base font-bold min-w-[26px] text-right tabular-nums',
            compositeScore >= 70
              ? 'text-emerald-600'
              : compositeScore >= 55
                ? 'text-amber-600'
                : 'text-muted-foreground',
          )}
        >
          {compositeScore}
        </span>
      )}

      <Badge variant="outline" className={cn('text-xs gap-0.5', statusConfig.color)}>
        <StatusIcon className="h-3 w-3" />
        {statusConfig.label}
      </Badge>

      <div className="w-px h-5 bg-border mx-0.5" />

      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2.5 text-xs gap-1 hover:bg-blue-50 hover:border-blue-500 hover:text-blue-700"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(buyer);
        }}
      >
        <ChevronRight className="h-3.5 w-3.5" />
        Update
      </Button>

      <PushToUniverseButton
        buyer={buyer}
        universeAssignment={universeAssignment}
        onSendToUniverse={onSendToUniverse}
        isSendingToUniverse={isSendingToUniverse}
      />
    </div>
  );
}

// ─── Push to Universe Button (with tooltip) ───
function PushToUniverseButton({
  buyer,
  universeAssignment,
  onSendToUniverse,
  isSendingToUniverse,
}: {
  buyer: BuyerIntroduction;
  universeAssignment?: UniverseAssignmentData | null;
  onSendToUniverse: (args: { buyer: BuyerIntroduction; universeId: string }) => void;
  isSendingToUniverse: boolean;
}) {
  if (universeAssignment) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs gap-1 hover:bg-purple-50 hover:border-purple-500 hover:text-purple-700"
              disabled={isSendingToUniverse}
              onClick={(e) => {
                e.stopPropagation();
                onSendToUniverse({ buyer, universeId: universeAssignment.universe_id });
              }}
            >
              {isSendingToUniverse ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Globe className="h-3.5 w-3.5" />
              )}
              Push to Buyer Universe
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Push to {universeAssignment.buyer_universes.name}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs gap-1 text-muted-foreground"
            disabled
          >
            <Globe className="h-3.5 w-3.5" />
            Push to Buyer Universe
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Assign a buyer universe to this deal first</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Row Selection Checkbox ───
export function BuyerRowCheckbox({
  id,
  selected,
  onToggleSelect,
}: {
  id: string;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  return (
    <Checkbox
      checked={selected}
      onCheckedChange={() => onToggleSelect(id)}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 shrink-0"
    />
  );
}
