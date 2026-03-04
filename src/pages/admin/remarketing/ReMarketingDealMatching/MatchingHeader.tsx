import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Building2, MapPin, DollarSign, Sparkles, Loader2 } from 'lucide-react';

interface MatchingHeaderProps {
  listing: {
    title?: string | null;
    internal_company_name?: string | null;
    category?: string | null;
    location?: string | null;
    revenue?: number | null;
    ebitda?: number | null;
  } | null;
  listingLoading: boolean;
  listingId: string;
  totalScores: number;
  isScoring: boolean;
  onScore: () => void;
}

export function MatchingHeader({
  listing,
  listingLoading,
  listingId,
  totalScores,
  isScoring,
  onScore,
}: MatchingHeaderProps) {
  const location = useLocation();

  if (listingLoading || !listing) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
    );
  }

  const revenueStr = listing.revenue
    ? `$${(listing.revenue >= 100000 ? listing.revenue / 1_000_000 : listing.revenue).toFixed(1)}M`
    : null;
  const ebitdaStr = listing.ebitda
    ? `$${(listing.ebitda >= 100000 ? listing.ebitda / 1_000_000 : listing.ebitda).toFixed(1)}M`
    : null;

  return (
    <div className="flex items-start justify-between">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link to={`/admin/deals/${listingId}`} state={{ from: location.pathname }}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-xl font-bold tracking-tight">
            {listing.title || listing.internal_company_name || 'Untitled Deal'}
          </h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground ml-10">
          {listing.category && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              {listing.category}
            </span>
          )}
          {listing.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {listing.location}
            </span>
          )}
          {(revenueStr || ebitdaStr) && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" />
              {[revenueStr && `Rev: ${revenueStr}`, ebitdaStr && `EBITDA: ${ebitdaStr}`]
                .filter(Boolean)
                .join(' | ')}
            </span>
          )}
          {totalScores > 0 && <Badge variant="secondary">{totalScores} buyers scored</Badge>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={onScore} disabled={isScoring} size="sm">
          {isScoring ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Scoring...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Score Buyers
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
