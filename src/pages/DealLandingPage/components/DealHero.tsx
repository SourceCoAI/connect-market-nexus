import { useMemo } from 'react';
import { MapPin, Shield } from 'lucide-react';
import type { LandingPageDeal } from '@/hooks/useDealLandingPage';
import { stripIdentifyingInfo, type DealData } from '@/lib/deal-to-listing-anonymizer';

interface DealHeroProps {
  deal: LandingPageDeal;
}

// C-1 FIX: internal_company_name and website are no longer fetched from the server
// for the public landing page. Anonymization still runs but without those fields,
// so any accidental inclusion of PII in text content is still caught by pattern matching.
function buildDealDataForAnonymization(deal: LandingPageDeal): DealData {
  return {
    id: deal.id,
    title: deal.title,
    internal_company_name: null,
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
    website: null,
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

  return (
    <section className="pt-10 pb-6">
      <div className="flex items-center gap-4 mb-4">
        {deal.deal_identifier && (
          <span className="text-[11px] font-medium text-[#6B7280] uppercase tracking-[0.08em] font-['Inter',system-ui,sans-serif]">
            {deal.deal_identifier}
          </span>
        )}
        <span className="text-[11px] font-medium text-[#6B7280] uppercase tracking-[0.08em] font-['Inter',system-ui,sans-serif]">
          CONFIDENTIAL
        </span>
      </div>

      <h1 className="text-[32px] sm:text-[36px] font-bold text-[#1A1A1A] leading-tight mb-4 font-['Inter',system-ui,sans-serif]">
        {anon(deal.title)}
      </h1>

      {deal.location && (
        <div className="flex items-center gap-1.5 text-[#6B7280] mb-4">
          <MapPin className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm font-['Inter',system-ui,sans-serif]">{deal.location}</span>
        </div>
      )}

      {deal.hero_description && (
        <p className="text-[15px] leading-[1.6] text-[#374151] max-w-2xl font-['Inter',system-ui,sans-serif]">
          {anon(deal.hero_description)}
        </p>
      )}

      {/* Confidential Identity Banner — matches listing page */}
      <div className="flex items-start gap-3 bg-[#F8F9FA] border border-[#E5E7EB] rounded-lg px-4 py-3 mt-5">
        <Shield className="h-4 w-4 text-[#9CA3AF] mt-0.5 flex-shrink-0" />
        <p className="text-xs text-[#6B7280] leading-relaxed font-['Inter',system-ui,sans-serif]">
          Business identity is confidential. Request access to receive full deal materials including
          the company name.
        </p>
      </div>
    </section>
  );
}
