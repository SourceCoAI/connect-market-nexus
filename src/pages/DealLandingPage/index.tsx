import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDealLandingPage, useRelatedDeals } from '@/hooks/useDealLandingPage';
import { supabase } from '@/integrations/supabase/client';
import MarketplaceBanner from './components/MarketplaceBanner';
import LandingHeader from './components/LandingHeader';
import DealHero from './components/DealHero';
import MetricsStrip from './components/MetricsStrip';
import ContentSections from './components/ContentSections';
import DealRequestForm from './components/DealRequestForm';
import DealSidebar from './components/DealSidebar';
import RelatedDeals from './components/RelatedDeals';
import EmailCapture from './components/EmailCapture';

function MobileStickyBar({ dealId }: { dealId: string }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const formEl = document.getElementById('request-form');
    if (!formEl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Hide once the form is in or past view
        setHidden(entry.isIntersecting);
      },
      { threshold: 0.1 },
    );
    observer.observe(formEl);
    return () => observer.disconnect();
  }, []);

  if (hidden) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#FDFCFA',
        borderTop: '1px solid #DDD8D0',
        padding: '12px 16px',
        display: 'flex',
        gap: 10,
        zIndex: 200,
        fontFamily: "'DM Sans', sans-serif",
      }}
      className="lg:!hidden"
    >
      <a
        href="#request-form"
        style={{
          flex: 1,
          background: '#1A1714',
          color: '#fff',
          border: 'none',
          borderRadius: 7,
          padding: 12,
          fontSize: '13.5px',
          fontWeight: 600,
          textAlign: 'center',
          textDecoration: 'none',
        }}
      >
        Request Details
      </a>
      <a
        href={`/signup?utm_source=landing_page&utm_medium=mobile_bar&utm_content=${dealId}`}
        style={{
          flex: 1,
          background: 'none',
          color: '#1A1714',
          border: '1px solid #DDD8D0',
          borderRadius: 7,
          padding: 12,
          fontSize: '13.5px',
          fontWeight: 500,
          textAlign: 'center',
          textDecoration: 'none',
        }}
      >
        Browse Marketplace
      </a>
    </div>
  );
}

function Footer() {
  return (
    <footer
      style={{
        borderTop: '1px solid #DDD8D0',
        background: '#FDFCFA',
        padding: '40px 32px',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <a
          href="/"
          style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 18,
            color: '#1A1714',
            textDecoration: 'none',
          }}
        >
          Source<span style={{ color: '#B8933A' }}>Co</span>
        </a>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Marketplace', href: '/marketplace' },
            { label: 'For Buyers', href: '/investors' },
            { label: 'For Sellers', href: '/owners' },
            { label: 'Blog', href: '/blog' },
            { label: 'Contact', href: '/contact' },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              style={{
                fontSize: 13,
                color: '#6B6560',
                textDecoration: 'none',
                transition: 'color 0.15s',
              }}
              className="hover:!text-[#1A1714]"
            >
              {link.label}
            </a>
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#6B6560' }}>
          &copy; SourceCo {new Date().getFullYear()}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export default function DealLandingPage() {
  const { id } = useParams<{ id: string }>();
  const { data: deal, isLoading, error } = useDealLandingPage(id);
  const { data: relatedDeals } = useRelatedDeals(id, deal?.featured_deal_ids);
  const hasTrackedView = useRef(false);

  // Phase 101: Dynamic SEO meta tags for social sharing
  useEffect(() => {
    if (!deal) return;
    const originalTitle = document.title;
    document.title = `${deal.title} — SourceCo`;

    const setMeta = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    const description = deal.description
      ? (deal.description as string).slice(0, 155) + '…'
      : `Explore this vetted acquisition opportunity on SourceCo.`;
    setMeta('og:title', `${deal.title} — SourceCo`);
    setMeta('og:description', description);
    setMeta('og:type', 'website');
    setMeta('og:url', window.location.href);

    // Also set standard description meta
    let descEl = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!descEl) {
      descEl = document.createElement('meta');
      descEl.setAttribute('name', 'description');
      document.head.appendChild(descEl);
    }
    descEl.setAttribute('content', description);

    return () => {
      document.title = originalTitle;
    };
  }, [deal]);

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
      if (sessionStorage.getItem(viewKey)) return;
      sessionStorage.setItem(viewKey, '1');
    } catch {
      /* ignore */
    }

    // GAP B fix: only insert columns that exist on page_views table
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
      <div className="min-h-screen" style={{ background: '#F5F2ED' }}>
        <MarketplaceBanner />
        <LandingHeader />
        <div className="flex items-center justify-center py-32">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2"
            style={{ borderColor: '#B8933A' }}
          />
        </div>
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="min-h-screen" style={{ background: '#F5F2ED' }}>
        <MarketplaceBanner />
        <LandingHeader />
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: '128px 32px',
            textAlign: 'center',
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <h1
            style={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: 28,
              color: '#1A1714',
              marginBottom: 8,
            }}
          >
            Deal Not Found
          </h1>
          <p style={{ color: '#6B6560', fontSize: 14 }}>
            The deal you are looking for does not exist or is no longer available.
          </p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#F5F2ED' }}>
      <MarketplaceBanner />
      <LandingHeader />

      <main style={{ maxWidth: 1180, margin: '0 auto' }} className="px-4 sm:px-8">
        <DealHero deal={deal} />
        <MetricsStrip deal={deal} />

        <div
          style={{
            display: 'grid',
            gap: 32,
            marginBottom: 64,
          }}
          className="grid-cols-1 lg:grid-cols-[1fr_340px] animate-[fadeUp_0.5s_0.2s_ease_both]"
        >
          {/* Mobile sidebar (above content on mobile) */}
          <div className="lg:hidden">
            <DealSidebar listingId={deal.id} presentedByAdminId={deal.presented_by_admin_id} />
          </div>

          {/* Left column — content + form */}
          <div>
            <ContentSections deal={deal} />
            <DealRequestForm listingId={deal.id} dealTitle={deal.title} />
          </div>

          {/* Right column — sticky sidebar (desktop) */}
          <div className="hidden lg:block">
            <div style={{ position: 'sticky', top: 80 }}>
              <DealSidebar listingId={deal.id} presentedByAdminId={deal.presented_by_admin_id} />
            </div>
          </div>
        </div>

        <RelatedDeals deals={relatedDeals ?? []} />
      </main>

      <MobileStickyBar dealId={deal.id} />
      <EmailCapture listingId={deal.id} />
      <Footer />
    </div>
  );
}
