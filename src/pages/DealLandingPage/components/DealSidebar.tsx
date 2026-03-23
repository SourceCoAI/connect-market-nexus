import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_PRESENTER = {
  name: 'Tomos Mughan',
  title: 'CEO, SourceCo',
  phone: '+1 (614) 316-2342',
  email: 'tomos.mughan@sourcecodeals.com',
  calendarUrl: 'https://tidycal.com/tomosmughan/30-minute-meeting',
};

interface DealSidebarProps {
  listingId?: string;
  presentedByAdminId?: string | null;
}

// C-3 FIX: Removed executiveSummaryUrl prop — executive summary should not be
// publicly downloadable without NDA/authentication.
export default function DealSidebar({ listingId, presentedByAdminId }: DealSidebarProps) {
  const { data: presenter } = useQuery({
    queryKey: ['deal-presenter', presentedByAdminId],
    enabled: !!presentedByAdminId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, email, phone_number, company, title, calendar_url')
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
        calendar_url?: string | null;
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
        calendarUrl: profileData.calendar_url || DEFAULT_PRESENTER.calendarUrl,
      };
    },
  });

  const p = presenter || DEFAULT_PRESENTER;
  const initials = p.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);

  const scrollToForm = () => {
    const el = document.getElementById('request-form');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const signupUrl = `/signup?utm_source=landing_page&utm_medium=sidebar${listingId ? `&utm_content=${listingId}` : ''}`;

  return (
    <aside style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div
        style={{
          background: '#FDFCFA',
          border: '1px solid #DDD8D0',
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 14,
        }}
      >
        {/* Actions Section */}
        <div style={{ padding: '20px 22px 0' }}>
          <div
            style={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: 18,
              color: '#1A1714',
              marginBottom: 6,
            }}
          >
            Interested in This Deal?
          </div>
          <div
            style={{
              fontSize: '12.5px',
              color: '#6B6560',
              lineHeight: 1.5,
              marginBottom: 18,
              fontWeight: 300,
            }}
          >
            Get full access to detailed financials and business metrics.
          </div>
        </div>
        <div style={{ padding: '0 22px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={scrollToForm}
            style={{
              background: '#1A1714',
              color: '#fff',
              border: 'none',
              borderRadius: 7,
              padding: '12px 16px',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              transition: 'background 0.15s',
              width: '100%',
            }}
            className="hover:!bg-[#333]"
          >
            Request Full Deal Details
          </button>
          <a
            href={p.calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'none',
              color: '#1A1714',
              border: '1px solid #DDD8D0',
              borderRadius: 7,
              padding: '11px 16px',
              fontSize: '13.5px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              transition: 'all 0.15s',
              textDecoration: 'none',
            }}
            className="hover:!border-[#3D3830]"
          >
            Schedule Buyer Call
          </a>

          {/* C-3 FIX: Executive summary download removed from public landing page.
              Available only after NDA signing via authenticated listing detail page. */}
        </div>

        {/* Divider */}
        <hr style={{ border: 'none', borderTop: '1px solid #DDD8D0', margin: 0 }} />

        {/* Marketplace CTA Section */}
        <div style={{ padding: '18px 22px', background: '#F5EDD5' }}>
          <div
            style={{
              fontSize: '11.5px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#B8933A',
              marginBottom: 6,
            }}
          >
            Exclusive Deal Flow
          </div>
          <div
            style={{
              fontSize: '12.5px',
              color: '#3D3830',
              lineHeight: 1.5,
              marginBottom: 14,
              fontWeight: 300,
            }}
          >
            Access 50+ vetted founder-led businesses with $2M-$50M revenue. Off-market opportunities
            from our proprietary network.
          </div>
          <a
            href={signupUrl}
            style={{
              background: '#B8933A',
              color: '#fff',
              border: 'none',
              borderRadius: 7,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              width: '100%',
              textAlign: 'center',
              display: 'block',
              textDecoration: 'none',
              transition: 'background 0.15s',
            }}
            className="hover:!bg-[#9e7d2e]"
          >
            Browse Marketplace &rarr;
          </a>
        </div>

        {/* Divider */}
        <hr style={{ border: 'none', borderTop: '1px solid #DDD8D0', margin: 0 }} />

        {/* Deal Presented By */}
        <div style={{ padding: '18px 22px' }}>
          <div
            style={{
              fontSize: '10.5px',
              fontWeight: 700,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: '#6B6560',
              marginBottom: 12,
            }}
          >
            Deal Presented By
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: '#1A1714',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'DM Serif Display', serif",
                fontSize: 17,
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1714', marginBottom: 2 }}>
                {p.name}
              </div>
              <div style={{ fontSize: 12, color: '#6B6560', marginBottom: 6 }}>{p.title}</div>
              <div>
                <a
                  href={`tel:${p.phone.replace(/[\s()-]/g, '')}`}
                  style={{
                    fontSize: 12,
                    color: '#6B6560',
                    textDecoration: 'none',
                    display: 'block',
                    lineHeight: 1.6,
                    transition: 'color 0.15s',
                  }}
                  className="hover:!text-[#B8933A]"
                >
                  {p.phone}
                </a>
                <a
                  href={`mailto:${p.email}`}
                  style={{
                    fontSize: 12,
                    color: '#6B6560',
                    textDecoration: 'none',
                    display: 'block',
                    lineHeight: 1.6,
                    transition: 'color 0.15s',
                  }}
                  className="hover:!text-[#B8933A]"
                >
                  {p.email}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
