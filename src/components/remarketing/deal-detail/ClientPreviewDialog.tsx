import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageIcon, MapPin, Shield } from 'lucide-react';
import { formatCurrency } from '@/lib/currency-utils';
import { stateToRegion } from '@/lib/deal-to-listing-anonymizer';
import { getListingImage } from '@/lib/listing-image-utils';
import { CategoryLocationBadges } from '@/components/shared/CategoryLocationBadges';
import ListingStatusTag from '@/components/listing/ListingStatusTag';

interface ClientPreviewDialogProps {
  listingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Full-screen dialog that renders the buyer-facing view of a listing
 * so admins can preview exactly what clients see on the marketplace.
 */
export function ClientPreviewDialog({ listingId, open, onOpenChange }: ClientPreviewDialogProps) {
  // Fetch using the same safe columns the marketplace uses (via listings table)
  const { data: listing, isLoading } = useQuery({
    queryKey: ['client-preview', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(
          [
            'id',
            'title',
            'description',
            'description_html',
            'hero_description',
            'category',
            'categories',
            'location',
            'geographic_states',
            'revenue',
            'ebitda',
            'image_url',
            'status',
            'status_tag',
            'tags',
            'created_at',
            'acquisition_type',
            'full_time_employees',
            'part_time_employees',
            'revenue_metric_subtitle',
            'ebitda_metric_subtitle',
            'metric_3_type',
            'metric_3_custom_label',
            'metric_3_custom_value',
            'metric_3_custom_subtitle',
            'metric_4_type',
            'metric_4_custom_label',
            'metric_4_custom_value',
            'metric_4_custom_subtitle',
          ].join(', '),
        )
        .eq('id', listingId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!listingId,
    staleTime: 30_000,
  });

  const imageData = listing ? getListingImage(listing.image_url ?? null, listing.category) : null;

  const formatListedDate = () => {
    if (!listing) return '';
    const listedDate = new Date(listing.created_at);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - listedDate.getTime()) / (1000 * 3600 * 24));
    if (daysDiff === 0) return 'Listed today';
    if (daysDiff === 1) return 'Listed yesterday';
    if (daysDiff < 7) return `Listed ${daysDiff}d ago`;
    if (daysDiff < 14) return `Listed ${Math.floor(daysDiff / 7)}w ago`;
    return 'Listed 14+ days ago';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Preview Mode Banner */}
        <div className="sticky top-0 z-10 bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-sm font-medium text-amber-800">
            Preview — This is how buyers see this listing
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 space-y-6">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !listing ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>Listing not found or not yet created.</p>
          </div>
        ) : (
          <div className="p-6 sm:p-8 space-y-8">
            {/* Status & Acquisition Type Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {listing.status_tag && (
                <ListingStatusTag status={listing.status_tag} variant="inline" />
              )}
              {listing.acquisition_type && (
                <CategoryLocationBadges
                  acquisitionType={listing.acquisition_type}
                  variant="default"
                />
              )}
            </div>

            {/* Hero Image */}
            {imageData && (
              <div className="w-full h-40 sm:h-56 border border-slate-200/40 bg-slate-50 rounded-lg overflow-hidden shadow-sm">
                {imageData.type === 'image' ? (
                  <img
                    src={imageData.value}
                    alt={listing.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ background: imageData.value }}
                  >
                    <ImageIcon className="h-24 w-24 text-white opacity-40" />
                  </div>
                )}
              </div>
            )}

            {/* Title Section */}
            <div>
              <h1 className="text-[22px] sm:text-[30px] leading-[28px] sm:leading-[38px] font-light tracking-tight text-foreground mb-3">
                {listing.title}
              </h1>

              <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-foreground/80 mb-4">
                <div className="flex items-center">
                  <MapPin size={12} className="mr-1" />
                  <span className="text-xs font-semibold tracking-wide uppercase">
                    {listing.location ? stateToRegion(listing.location) : listing.location}
                    {listing.location &&
                      listing.geographic_states?.length === 1 &&
                      ` | ${listing.geographic_states[0]}`}
                  </span>
                </div>
                <CategoryLocationBadges
                  categories={listing.categories}
                  category={listing.category}
                  variant="default"
                />
                <div className="text-xs text-muted-foreground">{formatListedDate()}</div>
              </div>

              {listing.hero_description && (
                <p className="text-foreground/80 text-sm font-normal leading-relaxed max-w-2xl">
                  {listing.hero_description}
                </p>
              )}
            </div>

            {/* Confidential Identity Banner (always show in preview since buyers see it) */}
            <div className="flex items-start gap-3 bg-slate-50 border border-slate-200/60 rounded-lg px-4 py-3">
              <Shield className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-600 leading-relaxed">
                Business identity is confidential. Request access to receive full deal materials
                including the company name.
              </p>
            </div>

            {/* Financial Grid (buyer view: shown only to approved connections, so we show it with a note) */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">
                Financials (visible after connection approved)
              </p>
              <Card className="border-dashed">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8">
                    <FinancialMetric
                      label={`${new Date().getFullYear() - 1} Revenue`}
                      value={formatCurrency(listing.revenue)}
                      subtitle={listing.revenue_metric_subtitle || listing.category}
                    />
                    <FinancialMetric
                      label="EBITDA"
                      value={formatCurrency(listing.ebitda)}
                      subtitle={
                        listing.ebitda_metric_subtitle ||
                        (listing.revenue > 0
                          ? `~${((listing.ebitda / listing.revenue) * 100).toFixed(1)}% margin profile`
                          : undefined)
                      }
                    />
                    {/* Metric 3 */}
                    {listing.metric_3_type === 'custom' && listing.metric_3_custom_label ? (
                      <FinancialMetric
                        label={listing.metric_3_custom_label}
                        value={listing.metric_3_custom_value || ''}
                        subtitle={listing.metric_3_custom_subtitle ?? undefined}
                      />
                    ) : (listing.full_time_employees || 0) + (listing.part_time_employees || 0) >
                      0 ? (
                      <FinancialMetric
                        label="Team Size"
                        value={`${(listing.full_time_employees || 0) + (listing.part_time_employees || 0)}`}
                        subtitle={`${listing.full_time_employees || 0} FT, ${listing.part_time_employees || 0} PT`}
                      />
                    ) : null}
                    {/* Metric 4 */}
                    {listing.metric_4_type === 'custom' && listing.metric_4_custom_label ? (
                      <FinancialMetric
                        label={listing.metric_4_custom_label}
                        value={listing.metric_4_custom_value || ''}
                        subtitle={listing.metric_4_custom_subtitle ?? undefined}
                      />
                    ) : (
                      <FinancialMetric
                        label="EBITDA Margin"
                        value={
                          listing.revenue > 0
                            ? `${((listing.ebitda / listing.revenue) * 100).toFixed(1)}%`
                            : '—'
                        }
                        subtitle={listing.metric_4_custom_subtitle || listing.category || undefined}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Business Overview */}
            <div className="py-6 border-t border-slate-100">
              <h2 className="text-sm font-medium leading-5 mb-4">Business Overview</h2>
              <div className="prose max-w-none text-sm">
                {listing.description_html ? (
                  <div dangerouslySetInnerHTML={{ __html: listing.description_html }} />
                ) : (
                  <p className="text-foreground/80 leading-relaxed whitespace-pre-wrap">
                    {listing.description}
                  </p>
                )}
              </div>
            </div>

            {/* Tags */}
            {listing.tags && listing.tags.length > 0 && (
              <div className="py-4 border-t border-slate-100">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {listing.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Sidebar Preview: Request Access CTA */}
            <div className="py-6 border-t border-slate-100">
              <Card>
                <CardContent className="pt-6 text-center space-y-3">
                  <h3 className="text-base font-medium text-foreground">
                    Request Access to This Deal
                  </h3>
                  <p className="text-xs text-foreground/70 leading-relaxed">
                    Request a connection to receive deal materials from the advisor.
                  </p>
                  <div className="bg-muted rounded-md py-3 px-4 text-xs text-muted-foreground">
                    [Request Connection button appears here for buyers]
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Small financial metric display matching the buyer-facing grid. */
function FinancialMetric({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
