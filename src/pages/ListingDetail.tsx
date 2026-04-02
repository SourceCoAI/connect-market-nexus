import { useEffect, useState, useRef } from 'react';

import { Link, useParams } from 'react-router-dom';
import { useMarketplace } from '@/hooks/use-marketplace';
import { useAuth } from '@/contexts/AuthContext';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { useClickTracking } from '@/hooks/use-click-tracking';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useSessionContext } from '@/contexts/SessionContext';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ExternalLink, Shield } from 'lucide-react';
import { formatCurrency } from '@/lib/currency-utils';
import ConnectionButton from '@/components/listing-detail/ConnectionButton';
import BlurredFinancialTeaser from '@/components/listing-detail/BlurredFinancialTeaser';
import { CustomSection } from '@/components/listing-detail/CustomSection';
import { ExecutiveSummaryGenerator } from '@/components/listing-detail/ExecutiveSummaryGenerator';
import { ListingHeader } from '@/components/listing-detail/ListingHeader';
import { EnhancedFinancialGrid } from '@/components/listing-detail/EnhancedFinancialGrid';
import { BusinessDetailsGrid } from '@/components/listing-detail/BusinessDetailsGrid';
import { DealAdvisorCard } from '@/components/listing-detail/DealAdvisorCard';
import { DealSourcingCriteriaDialog } from '@/components/listing-detail/DealSourcingCriteriaDialog';

import { EditableDescription } from '@/components/listing-detail/EditableDescription';
import { SimilarListingsCarousel } from '@/components/listing-detail/SimilarListingsCarousel';
import { EnhancedSaveButton } from '@/components/listing-detail/EnhancedSaveButton';

import { InternalCompanyInfoDisplay } from '@/components/admin/InternalCompanyInfoDisplay';
import { BuyerDataRoom } from '@/components/marketplace/BuyerDataRoom';
import { MFAGate } from '@/components/auth/MFAGate';

import { useMyAgreementStatus } from '@/hooks/use-agreement-status';
import { AgreementStatusBanner } from '@/components/marketplace/AgreementStatusBanner';
import { useAgreementStatusSync } from '@/hooks/use-agreement-status-sync';

const ListingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [showDealSourcingDialog, setShowDealSourcingDialog] = useState(false);

  // Click tracking for engagement analytics
  const { getClickData, resetTracking } = useClickTracking(true);
  const { sessionId } = useSessionContext();
  
  const hasFlushOnUnmountRef = useRef(false);

  const { useListing, useRequestConnection, useConnectionStatus } = useMarketplace();

  const { data: listing, isLoading, error } = useListing(id);
  const { mutate: requestConnection, isPending: isRequesting } = useRequestConnection();
  const { data: connectionStatus } = useConnectionStatus(id);
  const { trackListingView, trackListingSave, trackConnectionRequest } = useAnalytics();

  const isAdmin = user?.is_admin === true;

  // NDA gate: check if buyer has signed NDA (skip for admins and unauthenticated)
  const { data: agreementStatus } = useMyAgreementStatus(!isAdmin && !!user);
  useAgreementStatusSync();

  useEffect(() => {
    document.title = listing ? `${listing.title} | Marketplace` : 'Listing Detail | Marketplace';
  }, [listing]);

  // Track listing view when page loads
  useEffect(() => {
    if (id && listing) {
      trackListingView(id);
      resetTracking(); // Reset click tracking for this listing
    }
  }, [id, listing, trackListingView, resetTracking]);

  // Flush click data when leaving the page
  useEffect(() => {
    const flushClickData = async () => {
      if (!id || hasFlushOnUnmountRef.current) return;

      const clickData = getClickData();
      if (!clickData || clickData.total_clicks === 0) return;

      hasFlushOnUnmountRef.current = true;

      try {
        await supabase.from('listing_analytics').insert([
          {
            listing_id: id,
            user_id: user?.id || null,
            session_id: sessionId,
            action_type: 'view',
            clicked_elements: clickData as unknown as Json,
          },
        ]);
      } catch (error) {
        // silently fail - non-critical analytics
      }
    };

    // Cleanup function runs when component unmounts (user leaves page)
    return () => {
      flushClickData();
    };
  }, [id, user?.id, sessionId, getClickData]);

  const handleRequestConnection = (message?: string) => {
    if (id) {
      trackConnectionRequest(id);
      requestConnection({ listingId: id, message });
    }
  };

  // Extract connection status safely with fallbacks
  const connectionExists = connectionStatus?.exists || false;
  const connectionStatusValue = connectionStatus?.status || '';

  if (isLoading) {
    return (
      <div className="container mx-auto pt-6">
        <div className="animate-pulse">
          <div className="mb-4">
            <div className="h-8 bg-muted rounded-md w-64 mb-2"></div>
            <div className="h-12 bg-muted rounded-md w-full mb-3"></div>
            <div className="h-8 bg-muted rounded-md w-48"></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-muted rounded-md h-64"></div>
              <div className="bg-muted rounded-md h-48"></div>
            </div>

            <div className="space-y-4">
              <div className="bg-muted rounded-md h-48"></div>
              <div className="bg-muted rounded-md h-32"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="container mx-auto pt-6">
        <div className="text-center py-8">
          <h2 className="text-2xl font-bold text-gray-900">Listing not found</h2>
          <p className="mt-2 text-gray-600">
            The listing you're looking for doesn't exist or has been removed.
          </p>
          <Button className="mt-4" asChild>
            <Link to="/marketplace">Back to Marketplace</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Extract isInactive safely with fallback to false if status is undefined
  const isInactive = listing?.status === 'inactive';

  // NDA gate modal removed — buyers can always view listings.
  // Connection requests are blocked by ConnectionButton when unsigned.

  return (
    <div className="document-content min-h-screen bg-background">
      {/* Navigation */}
      <div className="max-w-7xl mx-auto px-8 py-3">
        <Link
          to="/marketplace"
          className="inline-flex items-center text-xs text-slate-600 hover:text-slate-900 transition-colors font-medium"
        >
          <ChevronLeft className="mr-1 h-3 w-3" />
          Back to Marketplace
        </Link>
      </div>

      {/* Agreement Status Banners (buyer-facing) */}
      {!isAdmin && user && (
        <div className="max-w-7xl mx-auto px-8 mb-4">
          <AgreementStatusBanner />
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-10">
          {/* Main Content - 70% */}
          <div className="lg:col-span-7 space-y-8">
            {/* Horizontal Header */}
            <ListingHeader
              listing={listing}
              isAdmin={isAdmin}
              editModeEnabled={false}
              userViewEnabled={false}
              isInactive={isInactive}
            />

            {/* Confidential Identity Banner - shown to non-admin users who aren't approved */}
            {!isAdmin && !(connectionExists && connectionStatusValue === 'approved') && (
              <div className="flex items-start gap-3 bg-slate-50 border border-slate-200/60 rounded-lg px-4 py-3">
                <Shield className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-600 leading-relaxed">
                  Business identity is confidential. Request access to receive full deal materials
                  including the company name.
                </p>
              </div>
            )}

            {/* Enhanced Financial Grid — only visible to approved connections and admins */}
            {(isAdmin || (connectionExists && connectionStatusValue === 'approved')) && <div className="mt-6">
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
                  // Metric 3: Employees or Custom
                  listing.metric_3_type === 'custom' && listing.metric_3_custom_label
                    ? {
                        label: listing.metric_3_custom_label,
                        value: listing.metric_3_custom_value || '',
                        subtitle: listing.metric_3_custom_subtitle ?? undefined,
                      }
                    : {
                        label: 'Team Size',
                        value: `${(listing.full_time_employees || 0) + (listing.part_time_employees || 0)}`,
                        subtitle: `${listing.full_time_employees || 0} FT, ${listing.part_time_employees || 0} PT`,
                      },
                  // Metric 4: EBITDA Margin (default) or Custom
                  listing.metric_4_type === 'custom' && listing.metric_4_custom_label
                    ? {
                        label: listing.metric_4_custom_label,
                        value: listing.metric_4_custom_value || '',
                        subtitle: listing.metric_4_custom_subtitle ?? undefined,
                      }
                    : {
                        label: 'EBITDA Margin',
                        value:
                          listing.revenue > 0
                            ? `${((listing.ebitda / listing.revenue) * 100).toFixed(1)}%`
                            : '0%',
                        subtitle: listing.metric_4_custom_subtitle || 'Profitability metric',
                      },
                ]}
              />
            </div>}

            {/* Structured Business Details */}
            <BusinessDetailsGrid geographic_states={listing.geographic_states} />

            {/* Internal Company Information - Admin Only */}
            {isAdmin && listing && (
              <InternalCompanyInfoDisplay
                listing={listing as unknown as import('@/types/admin').AdminListing}
              />
            )}

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

            {/* Content Sections (from lead memo) */}
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

            {/* Similar Listings Carousel */}
            {listing && <SimilarListingsCarousel currentListing={listing} />}

            {/* Financial Teaser */}
            <div className="py-8 border-t border-slate-100">
              <BlurredFinancialTeaser
                onRequestConnection={handleRequestConnection}
                isRequesting={isRequesting}
                hasConnection={connectionExists}
                connectionStatus={connectionStatusValue}
                listingTitle={listing.title}
                listingId={id!}
                listingStatusValue={listing.status}
                isAdmin={isAdmin}
              />
            </div>

            {/* Buyer Data Room - shows memos and documents if buyer has access */}
            {/* MFA verification required when user has MFA enrolled */}
            {!isAdmin && user && (
              <MFAGate loadingText="Verifying identity for data room access...">
                <BuyerDataRoom dealId={id!} />
              </MFAGate>
            )}

            {isAdmin && listing.owner_notes && (
              <div className="document-section py-8 border-t border-slate-100">
                <div className="space-y-4">
                  <span className="document-label">Admin Notes</span>
                  <p className="document-subtitle leading-relaxed">{listing.owner_notes}</p>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - 30% */}
          <div className="lg:col-span-3">
            <div className="sticky top-32 space-y-8">
              {/* Interested in This Deal? - Premium CTA */}
              <div className="bg-white/50 border border-slate-200/60 rounded-lg p-6 shadow-sm">
                <div className="text-center mb-6">
                  <h3 className="text-base font-medium text-foreground mb-2">
                    Request an Introduction
                  </h3>
                  <p className="text-xs text-foreground/70 leading-relaxed">
                    Our team will make a direct introduction to the business owner.
                  </p>
                </div>

                <div className="space-y-3">
                  <ConnectionButton
                    connectionExists={connectionExists}
                    connectionStatus={connectionStatusValue}
                    isRequesting={isRequesting}
                    isAdmin={isAdmin}
                    handleRequestConnection={handleRequestConnection}
                    listingTitle={listing.title}
                    listingId={id!}
                    listingStatus={listing.status}
                  />

                  {/* Link to My Deals when request is pending */}
                  {connectionExists &&
                    connectionStatusValue === 'pending' &&
                    connectionStatus?.id && (
                      <Link
                        to={`/my-requests?deal=${connectionStatus.id}`}
                        className="block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2 px-3 rounded-md hover:bg-slate-50 border border-transparent hover:border-slate-200"
                      >
                        View request status in My Deals →
                      </Link>
                    )}

              {/* Document Status — show when agreement sent but not signed */}
                  {!isAdmin && user && agreementStatus && !agreementStatus.nda_covered && !agreementStatus.fee_covered && (agreementStatus.nda_status === 'sent' || agreementStatus.fee_status === 'sent') && (
                    <div className="flex items-start gap-3 px-4 py-3 rounded-lg border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 text-sm">
                      <Shield className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p>
                          Your {agreementStatus.nda_status === 'sent' ? 'NDA' : 'Fee Agreement'} has been sent to <strong>{user.email}</strong>. Review, sign, and reply to <strong>support@sourcecodeals.com</strong>.
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">Once processed, you'll be able to request introductions.</p>
                      </div>
                    </div>
                  )}

                  {/* Enhanced Save and Share */}
                  <EnhancedSaveButton
                    listingId={id!}
                    listingTitle={listing.title}
                    location={listing.location}
                    onSave={() => trackListingSave(id!)}
                  />
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
                        matching your exact investment thesis. We source deals like this one that
                        are vetted, exclusive, and aligned with your revenue range, industry focus,
                        and geography before they hit the market.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full text-xs h-8 border-sourceco/30 text-sourceco hover:bg-sourceco/10 hover:border-sourceco/50"
                      onClick={() => setShowDealSourcingDialog(true)}
                    >
                      <ExternalLink size={12} className="mr-2" />
                      Get My Custom Deal Flow
                    </Button>
                  </div>
                </div>
              </div>

              {/* Deal Advisor Card */}
              <DealAdvisorCard presentedByAdminId={listing.presented_by_admin_id} listingId={id!} />

              {/* Download Executive Summary */}
              <div className="bg-white/40 border border-slate-200/60 rounded-lg p-6 shadow-sm">
                <h4 className="text-xs font-medium text-foreground mb-4 uppercase tracking-wider">
                  Executive Summary
                </h4>
                <ExecutiveSummaryGenerator listing={listing} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <DealSourcingCriteriaDialog
        open={showDealSourcingDialog}
        onOpenChange={setShowDealSourcingDialog}
        user={user}
      />
    </div>
  );
};

export default ListingDetail;
