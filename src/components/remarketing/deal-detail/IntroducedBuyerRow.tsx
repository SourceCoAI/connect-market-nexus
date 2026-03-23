import { MapPin, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { BuyerScore } from '@/hooks/admin/use-new-recommended-buyers';
import type { BuyerIntroduction } from '@/types/buyer-introductions';
import type { UniverseAssignmentData } from './buyer-introduction-constants';
import { resolveBuyerDisplayData } from './buyer-row-utils';
import {
  BuyerNameDisplay,
  BuyerMetaLine,
  FitSignalTags,
  BuyerRowActions,
  BuyerRowCheckbox,
} from './BuyerRowShared';

interface IntroducedBuyerRowProps {
  buyer: BuyerIntroduction;
  score?: BuyerScore;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onSelect: (b: BuyerIntroduction) => void;
  universeAssignment?: UniverseAssignmentData | null;
  onSendToUniverse: (args: { buyer: BuyerIntroduction; universeId: string }) => void;
  isSendingToUniverse: boolean;
}

export function IntroducedBuyerRow({
  buyer,
  score,
  selected,
  onToggleSelect,
  onSelect,
  universeAssignment,
  onSendToUniverse,
  isSendingToUniverse,
}: IntroducedBuyerRowProps) {
  const displayData = resolveBuyerDisplayData(buyer, score);

  const daysSinceIntroduction = buyer.introduction_date
    ? Math.floor((Date.now() - new Date(buyer.introduction_date).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div
      className={cn(
        'border rounded-lg px-3.5 py-3 hover:shadow-md transition-shadow shadow-sm',
        selected && 'ring-2 ring-blue-400 bg-blue-50/30',
      )}
    >
      {/* Top row */}
      <div className="flex items-center gap-3">
        <BuyerRowCheckbox id={buyer.id} selected={selected} onToggleSelect={onToggleSelect} />

        {/* Name + firm */}
        <div className="shrink-0 min-w-[180px]">
          <BuyerNameDisplay buyer={buyer} displayData={displayData} />
          <BuyerMetaLine
            displayData={displayData}
            extraContent={
              daysSinceIntroduction !== null ? (
                <span className="ml-1">{daysSinceIntroduction}d in pipeline</span>
              ) : undefined
            }
          >
            {displayData.location ? (
              <>
                <MapPin className="h-3 w-3" />
                {displayData.location}
              </>
            ) : buyer.introduced_by ? (
              <>
                <MapPin className="h-3 w-3" />
                Intro by {buyer.introduced_by}
              </>
            ) : null}
          </BuyerMetaLine>
        </div>

        {/* Fit signal tags + next step tags */}
        <FitSignalTags fitSignals={displayData.fitSignals}>
          {buyer.next_step && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium whitespace-nowrap truncate max-w-[200px]">
              Next: {buyer.next_step}
            </span>
          )}
          {buyer.expected_next_step_date && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium whitespace-nowrap">
              <Calendar className="h-3 w-3 inline mr-0.5" />
              {format(new Date(buyer.expected_next_step_date), 'MMM d')}
            </span>
          )}
        </FitSignalTags>

        <BuyerRowActions
          buyer={buyer}
          displayData={displayData}
          universeAssignment={universeAssignment}
          onSelect={onSelect}
          onSendToUniverse={onSendToUniverse}
          isSendingToUniverse={isSendingToUniverse}
        />
      </div>

      {/* Fit reason or feedback line */}
      {(displayData.fitReason || buyer.buyer_feedback) && (
        <div className="mt-2.5 pt-2.5 border-t space-y-1.5 ml-7">
          {displayData.fitReason && (
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {displayData.fitReason}
            </p>
          )}
          {buyer.buyer_feedback && (
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed italic">
              &ldquo;{buyer.buyer_feedback}&rdquo;
            </p>
          )}
        </div>
      )}
    </div>
  );
}
