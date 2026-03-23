import { ExternalLink, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Default presenter info used as fallback */
const DEFAULT_PRESENTER = {
  name: 'Tomos Mughan',
  title: 'CEO, SourceCo',
  phone: '+1 (614) 316-2342',
  email: 'tomos.mughan@sourcecodeals.com',
  avatarUrl: '/lovable-uploads/b879fa06-6a99-4263-b973-b9ced4404acb.png',
  calendarUrl: 'https://tidycal.com/tomosmughan/30-minute-meeting',
};

interface DealSidebarProps {
  listingId?: string;
  presentedByAdminId?: string | null;
}

// C-3 FIX: Removed executiveSummaryUrl prop — executive summary should not be
// publicly downloadable without NDA/authentication.
export default function DealSidebar({ listingId, presentedByAdminId }: DealSidebarProps) {
  // GAP 10: Fetch presenter dynamically from database
  const { data: presenter } = useQuery({
    queryKey: ['deal-presenter', presentedByAdminId],
    enabled: !!presentedByAdminId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, email, phone_number, company')
        .eq('id', presentedByAdminId!)
        .single();
      if (!data) return null;
      const profileData = data as unknown as {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        phone_number: string | null;
        company: string | null;
        title?: string | null;
      };
      return {
        name:
          `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() ||
          DEFAULT_PRESENTER.name,
        title: profileData.title
          ? `${profileData.title}, ${profileData.company || 'SourceCo'}`
          : DEFAULT_PRESENTER.title,
        phone: profileData.phone_number || DEFAULT_PRESENTER.phone,
        email: profileData.email || DEFAULT_PRESENTER.email,
        avatarUrl: DEFAULT_PRESENTER.avatarUrl,
        calendarUrl: DEFAULT_PRESENTER.calendarUrl,
      };
    },
  });

  const p = presenter || DEFAULT_PRESENTER;

  const scrollToForm = () => {
    const el = document.getElementById('request');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  // GAP L fix: Use relative signup URLs to keep users on the same domain
  const signupParams = new URLSearchParams({
    utm_source: 'landing_page',
    utm_medium: 'sidebar',
    utm_content: 'browse_marketplace',
    ...(listingId ? { from_deal: listingId } : {}),
  });
  const signupUrl = `/signup?${signupParams.toString()}`;

  return (
    <aside className="space-y-6">
      {/* Interested Panel */}
      <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-6">
        <h3 className="text-[16px] font-bold text-[#1A1A1A] mb-1 font-['Inter',system-ui,sans-serif]">
          Interested in This Deal?
        </h3>
        <p className="text-[14px] text-[#6B7280] mb-4 font-['Inter',system-ui,sans-serif]">
          Get full access to detailed financials and business metrics
        </p>

        <div className="space-y-2">
          <button
            onClick={scrollToForm}
            className="w-full bg-[#C9A84C] text-[#1A1A1A] font-semibold text-[15px] py-3 rounded-md hover:bg-[#b8963e] transition-colors font-['Inter',system-ui,sans-serif]"
          >
            Request Full Deal Details
          </button>

          <a
            href={p.calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-white border border-[#1A1A1A] text-[#1A1A1A] font-semibold text-[15px] py-3 rounded-md hover:bg-gray-50 transition-colors font-['Inter',system-ui,sans-serif]"
          >
            <ExternalLink className="w-4 h-4" />
            Schedule Buyer Call
          </a>

          {/* C-3 FIX: Executive summary download removed from public landing page.
              Available only after NDA signing via authenticated listing detail page. */}
        </div>
      </div>

      {/* Exclusive Deal Flow Panel */}
      <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-6">
        <h3 className="text-[15px] font-bold text-[#1A1A1A] mb-2 font-['Inter',system-ui,sans-serif]">
          Exclusive Deal Flow
        </h3>
        <p className="text-[13px] text-[#6B7280] leading-[1.6] mb-4 font-['Inter',system-ui,sans-serif]">
          Access 50+ vetted founder-led businesses with $2M-50M revenue. Off-market opportunities
          from our proprietary network.
        </p>
        <a
          href={signupUrl}
          className="flex items-center justify-center gap-2 w-full bg-white border border-[#1A1A1A] text-[#1A1A1A] font-semibold text-[14px] py-2.5 rounded-md hover:bg-gray-50 transition-colors font-['Inter',system-ui,sans-serif]"
        >
          <ExternalLink className="w-4 h-4" />
          Browse Marketplace
        </a>
      </div>

      {/* Deal Presented By — GAP 10+13: Dynamic from database */}
      <div className="pt-4 border-t border-[#E5E7EB]">
        <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-[0.08em] mb-4 font-['Inter',system-ui,sans-serif]">
          Deal Presented By
        </p>
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-full bg-[#E5E7EB] flex items-center justify-center flex-shrink-0 overflow-hidden">
            {p.avatarUrl ? (
              <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
            ) : (
              <User className="w-6 h-6 text-[#9CA3AF]" />
            )}
          </div>
          <div>
            <p className="text-[15px] font-bold text-[#1A1A1A] font-['Inter',system-ui,sans-serif]">
              {p.name}
            </p>
            <p className="text-[13px] text-[#6B7280] font-['Inter',system-ui,sans-serif]">
              {p.title}
            </p>
            <a
              href={`tel:${p.phone.replace(/[\s()-]/g, '')}`}
              className="block text-[13px] text-[#6B7280] hover:text-[#1A1A1A] transition-colors mt-1 font-['Inter',system-ui,sans-serif]"
            >
              {p.phone}
            </a>
            <a
              href={`mailto:${p.email}`}
              className="block text-[13px] text-[#6B7280] hover:text-[#1A1A1A] transition-colors font-['Inter',system-ui,sans-serif]"
            >
              {p.email}
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
}
