import { AlertCircle } from 'lucide-react';

interface DataQualityWarningProps {
  listing: {
    revenue?: number | null;
    ebitda?: number | null;
    location?: string | null;
    services?: string[] | null;
    categories?: string[] | null;
    category?: string | null;
    hero_description?: string | null;
    description?: string | null;
    executive_summary?: string | null;
  };
}

export function DataQualityWarning({ listing }: DataQualityWarningProps) {
  const missingFields: string[] = [];
  if (!listing.revenue) missingFields.push('Revenue');
  if (!listing.ebitda) missingFields.push('EBITDA');
  if (!listing.location?.trim()) missingFields.push('Location');
  if (
    !(
      (listing.services?.length ?? 0) > 0 ||
      (listing.categories?.length ?? 0) > 0 ||
      listing.category?.trim()
    )
  )
    missingFields.push('Services/Category');
  if (
    !(
      listing.hero_description?.trim() ||
      listing.executive_summary?.trim()
    )
  )
    missingFields.push('Description');

  if (missingFields.length === 0) return null;

  return (
    <div
      className={`rounded-lg border p-4 ${missingFields.length >= 3 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          className={`h-5 w-5 mt-0.5 flex-shrink-0 ${missingFields.length >= 3 ? 'text-red-600' : 'text-amber-600'}`}
        />
        <div className="flex-1">
          <p
            className={`font-medium text-sm ${missingFields.length >= 3 ? 'text-red-800' : 'text-amber-800'}`}
          >
            {missingFields.length >= 3 ? 'Low Data Quality' : 'Missing Scoring Data'} —{' '}
            {missingFields.length} field{missingFields.length > 1 ? 's' : ''} missing
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Missing: <strong>{missingFields.join(', ')}</strong>. Scores will use weight
            redistribution for missing dimensions — consider enriching the deal first for more
            accurate matching.
          </p>
        </div>
      </div>
    </div>
  );
}
