import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useDealLandingPage, useRelatedDeals } from '@/hooks/useDealLandingPage';
import { supabase } from '@/integrations/supabase/client';
import LandingHeader from './components/LandingHeader';
import DealHero from './components/DealHero';
import MetricsStrip from './components/MetricsStrip';
import ContentSections from './components/ContentSections';
import DealRequestForm from './components/DealRequestForm';
import DealSidebar from './components/DealSidebar';
import RelatedDeals from './components/RelatedDeals';
import EmailCapture from './components/EmailCapture';

export default function DealLandingPage() {
  const { id } = useParams<{ id: string }>();
  const { data: deal, isLoading, error } = useDealLandingPage(id);
  const { data: relatedDeals } = useRelatedDeals(id);
  const hasTrackedView = useRef(false);

  // GAP 9: Track anonymous landing page views per listing
  // M-8 FIX: Skip tracking for admin users to prevent inflating view counts
  useEffect(() => {
    if (!id || !deal || hasTrackedView.current) return;

    // M-8 FIX: Skip tracking for admin users (set via localStorage on admin login)
    try {
      if (localStorage.getItem('sourceco_is_admin') === 'true') return;
    } catch {
      /* ignore */
    }

    hasTrackedView.current = true;

    // GAP 16+18: Store deal context for signup attribution
    try {
      if (!localStorage.getItem('sourceco_first_deal_viewed')) {
        localStorage.setItem('sourceco_first_deal_viewed', id);
      }
      localStorage.setItem('sourceco_last_deal_viewed', id);
      localStorage.setItem('sourceco_last_deal_title', deal.title);
    } catch {
      /* localStorage unavailable */
    }

    // Record anonymous page view for this specific listing
    const sessionId = sessionStorage.getItem('sourceco_session_id') || crypto.randomUUID();
    try {
      sessionStorage.setItem('sourceco_session_id', sessionId);
    } catch {
      /* ignore */
    }

    // GAP J fix: Deduplicate views per session+page
    const viewKey = `sourceco_viewed_${id}`;
    try {
      if (sessionStorage.getItem(viewKey)) return; // Already tracked this page in this session
      sessionStorage.setItem(viewKey, '1');
    } catch {
      /* ignore */
    }

    // GAP B fix: only insert columns that exist on page_views table
    // Use utm_source/utm_content to store listing context since event_type/event_data don't exist
    supabase
      .from('page_views')
      .insert({
        session_id: sessionId,
        page_path: `/deals/${id}`,
        page_title: deal.title,
        referrer: document.referrer || null,
        utm_source: 'deal_landing_page',
        utm_content: id,
      })
      .then(
        () => {},
        () => {},
      );
  }, [id, deal]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F7F5F0]">
        <LandingHeader />
        <div className="flex items-center justify-center py-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C9A84C]" />
        </div>
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="min-h-screen bg-[#F7F5F0]">
        <LandingHeader />
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-32 text-center">
          <h1 className="text-2xl font-bold text-[#1A1A1A] mb-2 font-['Inter',system-ui,sans-serif]">
            Deal Not Found
          </h1>
          <p className="text-[#6B7280] font-['Inter',system-ui,sans-serif]">
            The deal you are looking for does not exist or is no longer available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0]">
      <LandingHeader />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6">
        {/* Hero */}
        <DealHero deal={deal} />

        {/* Metrics */}
        <MetricsStrip deal={deal} />

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
          {/* Mobile sidebar (above content on mobile) */}
          <div className="lg:hidden">
            <DealSidebar listingId={deal.id} presentedByAdminId={deal.presented_by_admin_id} />
          </div>

          {/* Left column — content + form */}
          <div className="w-full lg:w-[65%]">
            <ContentSections deal={deal} />
            <div className="mt-8 mb-8">
              <DealRequestForm listingId={deal.id} dealTitle={deal.title} />
            </div>
          </div>

          {/* Right column — sticky sidebar (desktop) */}
          <div className="hidden lg:block lg:w-[32%]">
            <div className="sticky top-20">
              <DealSidebar listingId={deal.id} presentedByAdminId={deal.presented_by_admin_id} />
            </div>
          </div>
        </div>

        {/* Related Deals */}
        {relatedDeals && relatedDeals.length > 0 && <RelatedDeals deals={relatedDeals} />}
      </main>

      {/* GAP 12: Email capture for non-submitters */}
      <EmailCapture listingId={deal.id} />
    </div>
  );
}
