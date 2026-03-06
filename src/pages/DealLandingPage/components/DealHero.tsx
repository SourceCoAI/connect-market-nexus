import { useMemo } from 'react';
import type { LandingPageDeal } from '@/hooks/useDealLandingPage';
import { stripIdentifyingInfo, type DealData } from '@/lib/deal-to-listing-anonymizer';

interface DealHeroProps {
  deal: LandingPageDeal;
}

function buildDealDataForAnonymization(deal: LandingPageDeal): DealData {
  return {
    id: deal.id,
    title: deal.title,
    internal_company_name: deal.internal_company_name ?? null,
    executive_summary: null,
    description: null,
    revenue: deal.revenue,
    ebitda: deal.ebitda,
    location: deal.location,
    address_state: null,
    address_city: null,
    category: deal.category ?? deal.categories?.[0] ?? null,
    industry: null,
    service_mix: null,
    website: deal.website ?? null,
    full_time_employees: deal.full_time_employees,
    linkedin_employee_count: null,
    main_contact_name: null,
    main_contact_email: null,
    main_contact_phone: null,
    main_contact_title: null,
    geographic_states: null,
    internal_deal_memo_link: null,
  };
}

export default function DealHero({ deal }: DealHeroProps) {
  const dealData = useMemo(() => buildDealDataForAnonymization(deal), [deal]);

  const anon = (text: string | null | undefined): string => {
    if (!text) return '';
    return stripIdentifyingInfo(text, dealData);
  };

  const industry = deal.category || deal.categories?.[0] || null;

  return (
    <section
      style={{ padding: '48px 0 32px', fontFamily: "'DM Sans', sans-serif" }}
      className="animate-[fadeUp_0.5s_ease_both]"
    >
      {/* Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        {deal.deal_identifier && (
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '4px 10px',
              borderRadius: 4,
              background: '#EDE9E2',
              color: '#6B6560',
            }}
          >
            {deal.deal_identifier}
          </span>
        )}
        <span
          style={{
            fontSize: '10.5px',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '4px 10px',
            borderRadius: 4,
            background: '#F5EDD5',
            color: '#B8933A',
            border: '1px solid rgba(184,147,58,0.25)',
          }}
        >
          Confidential
        </span>
        {industry && (
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '4px 10px',
              borderRadius: 4,
              background: '#1A1714',
              color: '#fff',
            }}
          >
            {industry}
          </span>
        )}
      </div>

      {/* Title */}
      <h1
        style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 'clamp(30px, 4vw, 44px)',
          lineHeight: 1.15,
          color: '#1A1714',
          letterSpacing: '-0.025em',
          marginBottom: 14,
          maxWidth: 760,
        }}
      >
        {anon(deal.title)}
      </h1>

      {/* Meta row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        {deal.location && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '13.5px',
              color: '#6B6560',
            }}
          >
            <svg
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              width={14}
              height={14}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <circle cx="12" cy="11" r="3" />
            </svg>
            {deal.location}
          </div>
        )}
        {deal.number_of_locations && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '13.5px',
              color: '#6B6560',
            }}
          >
            <svg
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              width={14}
              height={14}
            >
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
            </svg>
            {deal.number_of_locations} Location{deal.number_of_locations > 1 ? 's' : ''}
          </div>
        )}
        {deal.acquisition_type && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '13.5px',
              color: '#6B6560',
            }}
          >
            <svg
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              width={14}
              height={14}
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            {deal.acquisition_type === 'platform' ? 'Platform Acquisition' : 'Add-on Acquisition'}
          </div>
        )}
      </div>

      {/* Hero description */}
      {deal.hero_description && (
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.65,
            color: '#3D3830',
            maxWidth: 680,
            marginBottom: 22,
            fontWeight: 300,
          }}
        >
          {anon(deal.hero_description)}
        </p>
      )}

      {/* Featured Image */}
      {deal.image_url && (
        <div
          style={{
            marginBottom: 22,
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid #DDD8D0',
            maxHeight: 360,
          }}
        >
          <img
            src={deal.image_url}
            alt={anon(deal.title)}
            style={{
              width: '100%',
              height: '100%',
              maxHeight: 360,
              objectFit: 'cover',
              display: 'block',
            }}
          />
        </div>
      )}

      {/* Confidential identity banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          background: '#FDFCFA',
          border: '1px solid #DDD8D0',
          borderRadius: 8,
          padding: '12px 16px',
          maxWidth: 580,
        }}
      >
        <svg
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          width={15}
          height={15}
          style={{ color: '#6B6560', marginTop: 2, flexShrink: 0 }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        <p style={{ fontSize: '12.5px', color: '#6B6560', lineHeight: 1.5 }}>
          Business identity is confidential. Submit a request below to receive full deal materials
          including the company name, financials, and CIM.
        </p>
      </div>

      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </section>
  );
}
