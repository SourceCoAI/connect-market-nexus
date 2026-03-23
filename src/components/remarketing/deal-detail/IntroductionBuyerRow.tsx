import { MapPin } from 'lucide-react';
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

interface IntroductionBuyerRowProps {
  buyer: BuyerIntroduction;
  score?: BuyerScore;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onSelect: (b: BuyerIntroduction) => void;
  universeAssignment?: UniverseAssignmentData | null;
  onSendToUniverse: (args: { buyer: BuyerIntroduction; universeId: string }) => void;
  isSendingToUniverse: boolean;
}

export function IntroductionBuyerRow({
  buyer,
  score,
  selected,
  onToggleSelect,
  onSelect,
  universeAssignment,
  onSendToUniverse,
  isSendingToUniverse,
}: IntroductionBuyerRowProps) {
  const displayData = resolveBuyerDisplayData(buyer, score);

  // For "not introduced" rows, fall back to internal_champion for location
  const locationWithFallback = displayData.location || buyer.internal_champion || '';

  return (
    <div
      className={cn(
        'border rounded-lg px-3.5 py-3 hover:shadow-md transition-shadow shadow-sm',
        selected && 'ring-2 ring-blue-400 bg-blue-50/30',
      )}
    >
      {/* Top row — matches BuyerCard layout */}
      <div className="flex items-center gap-3">
        <BuyerRowCheckbox id={buyer.id} selected={selected} onToggleSelect={onToggleSelect} />

        {/* Name + firm */}
        <div className="shrink-0 min-w-[180px]">
          <BuyerNameDisplay buyer={buyer} displayData={displayData} />
          <BuyerMetaLine displayData={displayData}>
            {locationWithFallback && (
              <>
                <MapPin className="h-3 w-3" />
                {locationWithFallback}
              </>
            )}
          </BuyerMetaLine>
        </div>

        <FitSignalTags fitSignals={displayData.fitSignals} />

        <BuyerRowActions
          buyer={buyer}
          displayData={displayData}
          universeAssignment={universeAssignment}
          onSelect={onSelect}
          onSendToUniverse={onSendToUniverse}
          isSendingToUniverse={isSendingToUniverse}
        />
      </div>

      {/* Fit reason line */}
      {displayData.fitReason && (
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mt-2.5 pt-2.5 border-t ml-7">
          {displayData.fitReason}
        </p>
      )}
    </div>
  );
}
