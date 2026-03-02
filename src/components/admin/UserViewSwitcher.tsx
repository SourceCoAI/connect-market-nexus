import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface UserViewSwitcherProps {
  primaryView: 'buyers' | 'owners';
  secondaryView: 'marketplace' | 'non-marketplace';
  onPrimaryViewChange: (view: 'buyers' | 'owners') => void;
  onSecondaryViewChange: (view: 'marketplace' | 'non-marketplace') => void;
  marketplaceCount: number;
  nonMarketplaceCount: number;
  ownerLeadsCount: number;
}

export function UserViewSwitcher({ 
  primaryView,
  secondaryView,
  onPrimaryViewChange,
  onSecondaryViewChange,
  marketplaceCount, 
  nonMarketplaceCount,
  ownerLeadsCount
}: UserViewSwitcherProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Primary Level: Buyers / Owners — underline tabs */}
      <div className="flex items-center gap-0 border-b border-border">
        <button
          onClick={() => onPrimaryViewChange('buyers')}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px",
            primaryView === 'buyers'
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
          )}
        >
          Buyers
          <Badge variant="secondary" className="h-5 min-w-[28px] justify-center px-1.5 text-xs font-medium">
            {marketplaceCount + nonMarketplaceCount}
          </Badge>
        </button>
        <button
          onClick={() => onPrimaryViewChange('owners')}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px",
            primaryView === 'owners'
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
          )}
        >
          Owners
          <Badge variant="secondary" className="h-5 min-w-[28px] justify-center px-1.5 text-xs font-medium">
            {ownerLeadsCount}
          </Badge>
        </button>
      </div>

      {/* Secondary Level: Marketplace / Non-Marketplace (only for Buyers) */}
      {primaryView === 'buyers' && (
        <div className="inline-flex items-center rounded-lg bg-muted/50 p-1 self-start">
          <button
            onClick={() => onSecondaryViewChange('marketplace')}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              secondaryView === 'marketplace'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Marketplace
            <Badge variant="secondary" className={cn(
              "h-5 min-w-[28px] justify-center px-1.5 text-xs font-medium",
              secondaryView === 'marketplace' ? 'bg-muted' : 'bg-transparent'
            )}>
              {marketplaceCount}
            </Badge>
          </button>
          <button
            onClick={() => onSecondaryViewChange('non-marketplace')}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              secondaryView === 'non-marketplace'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Non-Marketplace
            <Badge variant="secondary" className={cn(
              "h-5 min-w-[28px] justify-center px-1.5 text-xs font-medium",
              secondaryView === 'non-marketplace' ? 'bg-muted' : 'bg-transparent'
            )}>
              {nonMarketplaceCount}
            </Badge>
          </button>
        </div>
      )}
    </div>
  );
}
