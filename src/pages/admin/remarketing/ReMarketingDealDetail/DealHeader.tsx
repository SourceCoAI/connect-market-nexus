import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Check, MapPin, Pencil, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';
import { ScoreBadge } from '@/components/shared/ScoreBadge';
import { DealSourceBadge } from '@/components/remarketing';
import { getDisplayLocation } from '@/lib/location-display';
import type { ScoreTier } from '@/types/remarketing';

interface DealHeaderDeal {
  category?: string | null;
  status?: string;
  deal_source?: string | null;
  seller_interest_score?: number | null;
  address_city?: string | null;
  address_state?: string | null;
  location?: string | null;
}

interface DealHeaderProps {
  deal: DealHeaderDeal;
  backTo: string;
  displayName: string;
  listedName: string | null;
  dataCompleteness: number;
  tier: string | null;
  isEditingName: boolean;
  setIsEditingName: (v: boolean) => void;
  editedName: string;
  setEditedName: (v: string) => void;
  handleSaveName: () => void;
  handleCancelEdit: () => void;
  updateNameMutation: { isPending: boolean };
}

export function DealHeader({
  deal,
  backTo,
  displayName,
  listedName,
  dataCompleteness,
  tier,
  isEditingName,
  setIsEditingName,
  editedName,
  setEditedName,
  handleSaveName,
  handleCancelEdit,
  updateNameMutation,
}: DealHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to={backTo}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <input
                className="text-2xl font-bold text-foreground bg-transparent border-b-2 border-primary outline-none px-0 py-0.5 min-w-[200px]"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') handleCancelEdit();
                }}
                autoFocus
                disabled={updateNameMutation.isPending}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleSaveName}
                disabled={updateNameMutation.isPending}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleCancelEdit}
                disabled={updateNameMutation.isPending}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group">
              <h1 className="text-2xl font-bold text-foreground">{displayName}</h1>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => {
                  setEditedName(displayName);
                  setIsEditingName(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          {deal.category && <Badge variant="secondary">{deal.category}</Badge>}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant={dataCompleteness >= 80 ? 'default' : 'outline'}>
                  {dataCompleteness}% Data
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium">Deal Data Quality: {dataCompleteness}%</p>
                <p className="text-xs text-muted-foreground">
                  {Math.round((dataCompleteness / 100) * 10)} of 10 fields filled
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {deal.seller_interest_score !== null && deal.seller_interest_score !== undefined && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={
                      deal.seller_interest_score >= 70
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : deal.seller_interest_score >= 40
                          ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                          : 'bg-gray-50 text-gray-600 border-gray-200'
                    }
                  >
                    {deal.seller_interest_score} Seller Interest
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-medium">
                    Seller Interest Score: {deal.seller_interest_score}/100
                  </p>
                  <p className="text-xs text-muted-foreground">
                    AI-analyzed from call transcripts and notes to indicate seller motivation level.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Badge
            variant={deal.status === 'active' ? 'default' : 'secondary'}
            className="capitalize"
          >
            {deal.status}
          </Badge>
          <DealSourceBadge source={deal.deal_source} />
        </div>
        {listedName && (
          <p className="text-sm text-muted-foreground mt-0.5">Listed as: {listedName}</p>
        )}
        {(() => {
          const loc = getDisplayLocation(deal);
          return (
            loc && (
              <p className="text-muted-foreground flex items-center gap-1 mt-1">
                <MapPin className="h-4 w-4" />
                {loc}
              </p>
            )
          );
        })()}
      </div>
      <div className="flex items-center gap-2">
        {tier && <ScoreBadge variant="tier" tier={tier as ScoreTier} size="lg" />}
      </div>
    </div>
  );
}
