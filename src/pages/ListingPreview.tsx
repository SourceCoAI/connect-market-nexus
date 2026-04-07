import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMarketplace } from '@/hooks/use-marketplace';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Shield, Eye } from 'lucide-react';
import { formatCurrency } from '@/lib/currency-utils';
import { ListingHeader } from '@/components/listing-detail/ListingHeader';
import { EnhancedFinancialGrid } from '@/components/listing-detail/EnhancedFinancialGrid';
import { BusinessDetailsGrid } from '@/components/listing-detail/BusinessDetailsGrid';
import { EditableDescription } from '@/components/listing-detail/EditableDescription';
import { CustomSection } from '@/components/listing-detail/CustomSection';
import { SimilarListingsCarousel } from '@/components/listing-detail/SimilarListingsCarousel';
import BlurredFinancialTeaser from '@/components/listing-detail/BlurredFinancialTeaser';

const ListingPreview = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { useListing } = useMarketplace();
  const { data: listing, isLoading, error } = useListing(id);

  const isAdmin = user?.is_admin === true;

  useEffect(() => {
    document.title = listing
      ? `Preview: ${listing.title} | Marketplace`
      : 'Listing Preview | Marketplace';
  }, [listing]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
          <p className="text-muted-foreground mt-2">
            Listing preview is only available to administrators.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-8 py-3">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded-md w-64 mb-2"></div>
            <div className="h-12 bg-muted rounded-md w-full mb-3"></div>
            <div className="h-8 bg-muted rounded-md w-48"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Listing not found</h2>
          <p className="mt-2 text-gray-600">
            The listing you're looking for doesn't exist or has been removed.
          </p>
          <Button className="mt-4" asChild>
            <Link to="/admin/marketplace/listings">Back to Listings</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="document-content min-h-screen bg-background">
      {/* Preview Banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-8 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-800">
            <Eye className="h-4 w-4" />
            <span className="text-xs font-medium">
              Preview Mode — This is how buyers see this listing
            </span>
          </div>
          <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
            <Link to="/admin/marketplace/listings">
              <ChevronLeft className="mr-1 h-3 w-3" />
              Back to Admin
            </Link>
          </Button>
        </div>
      </div>

      {/* Navigation (mirrors buyer view) */}
      <div className="max-w-7xl mx-auto px-8 py-3">
        <span className="inline-flex items-center text-xs text-slate-600 font-medium">
          <ChevronLeft className="mr-1 h-3 w-3" />
          Back to Marketplace
        </span>
      </div>

      {/* Main Content (mirrors ListingDetail layout) */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-[42px]">
          {/* Main Content - 70% */}
          <div className="lg:col-span-7 space-y-8">
            <ListingHeader
              listing={listing}
              isAdmin={false}
              editModeEnabled={false}
              userViewEnabled={false}
              isInactive={listing.status === 'inactive'}
            />

            {/* Confidential Identity Banner */}
            <div className="flex items-start gap-3 bg-slate-50 border border-slate-200/60 rounded-lg px-4 py-3">
              <Shield className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-600 leading-relaxed">
                Business identity is confidential. Request access to receive full deal materials
                including the company name.
              </p>
            </div>

            {/* Enhanced Financial Grid */}
            <div className="mt-6">
              <EnhancedFinancialGrid
                metrics={[
                  {
                    label: `${new Date().getFullYear() - 1} Revenue`,
                    value: formatCurrency(listing.revenue),
                    subtitle: listing.revenue_metric_subtitle || listing.category,
                    tooltip:
                      'Financials range from owner estimates to verified documentation. Verification level varies by owner readiness and will be confirmed in your intro call and due diligence process.',
                  },
                  {
                    label: 'EBITDA',
                    value: formatCurrency(listing.ebitda),
                    subtitle:
                      listing.ebitda_metric_subtitle ||
                      `~${listing.revenue > 0 ? ((listing.ebitda / listing.revenue) * 100).toFixed(1) : '0'}% margin profile`,
                    tooltip:
                      'Financials range from owner estimates to verified documentation. Verification level varies by owner readiness and will be confirmed in your intro call and due diligence process.',
                  },
                  ...(listing.metric_3_type === 'custom' && listing.metric_3_custom_label
                    ? [{
                        label: listing.metric_3_custom_label,
                        value: listing.metric_3_custom_value || '',
                        subtitle: listing.metric_3_custom_subtitle ?? undefined,
                      }]
                    : ((listing.full_time_employees || 0) + (listing.part_time_employees || 0)) > 0
                      ? [{
                          label: 'Team Size',
                          value: `${(listing.full_time_employees || 0) + (listing.part_time_employees || 0)}`,
                          subtitle: `${listing.full_time_employees || 0} FT, ${listing.part_time_employees || 0} PT`,
                        }]
                      : []),
                  ...(listing.metric_4_type === 'custom' && listing.metric_4_custom_label
                    ? [{
                        label: listing.metric_4_custom_label,
                        value: listing.metric_4_custom_value || '',
                        subtitle: listing.metric_4_custom_subtitle ?? undefined,
                      }]
                    : [{
                        label: 'EBITDA Margin',
                        value:
                          listing.revenue > 0
                            ? `${((listing.ebitda / listing.revenue) * 100).toFixed(1)}%`
                            : '—',
                        subtitle: listing.metric_4_custom_subtitle || listing.category || undefined,
                      }]),
                ]}
              />
            </div>

            {/* Structured Business Details */}
            <BusinessDetailsGrid geographic_states={listing.geographic_states} />

            {/* Business Overview */}
            <div className="py-8 border-t border-slate-100">
              <div className="space-y-4">
                <h2 className="text-sm font-medium leading-5">Business Overview</h2>
                <div className="prose max-w-none">
                  <EditableDescription
                    listingId={listing.id}
                    initialHtml={listing.description_html}
                    initialPlain={listing.description}
                    isEditing={false}
                  />
                </div>
              </div>
            </div>

            {/* Content Sections */}
            {listing.custom_sections &&
              Array.isArray(listing.custom_sections) &&
              listing.custom_sections.length > 0 && (
                <div className="document-section py-8 border-t border-slate-100">
                  <div className="space-y-6">
                    {listing.custom_sections.map(
                      (section: { title: string; description: string }) => (
                        <CustomSection key={section.title} section={section} />
                      ),
                    )}
                  </div>
                </div>
              )}

            {/* Similar Listings */}
            <SimilarListingsCarousel currentListing={listing} />

            {/* Financial Teaser */}
            <div className="py-8 border-t border-slate-100">
              <BlurredFinancialTeaser
                onRequestConnection={() => {}}
                isRequesting={false}
                hasConnection={false}
                connectionStatus=""
                listingTitle={listing.title}
                listingId={listing.id}
                isAdmin={false}
              />
            </div>
          </div>

          {/* Sidebar - 30% */}
          <div className="lg:col-span-3">
            <div className="space-y-8">
              {/* Interested in This Deal? - Premium CTA */}
              <div className="bg-white/50 border border-slate-200/60 rounded-lg p-6 shadow-sm">
                <div className="text-center mb-6">
                  <h3 className="text-base font-medium text-foreground mb-2">
                    Interested in This Deal?
                  </h3>
                  <p className="text-xs text-foreground/70 leading-relaxed">
                    Get full access to detailed financials and business metrics
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="bg-primary text-primary-foreground rounded-md py-2.5 text-center text-sm font-medium">
                    Request Connection
                  </div>
                </div>
              </div>

              {/* Exclusive Deal Flow */}
              <div className="bg-white/50 border border-slate-200/60 rounded-lg p-6 shadow-sm">
                <div className="mt-6 pt-4 border-t border-slate-200/50">
                  <div className="text-center space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-foreground">
                        Want More Deals Like This One?
                      </p>
                      <p className="text-xs text-foreground/70 leading-relaxed">
                        Get 4-10 pre-qualified owner meetings monthly with off-market opportunities
                        matching your exact investment thesis.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full text-xs h-8 border-sourceco/30 text-sourceco hover:bg-sourceco/10 hover:border-sourceco/50"
                      disabled
                    >
                      Get My Custom Deal Flow
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListingPreview;
