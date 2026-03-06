import type { RelatedDeal } from '@/hooks/useDealLandingPage';

function formatCurrency(value: number | null | undefined): string {
  if (!value) return '—';
  if (value >= 1_000_000_000) return `~$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `~$${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1_000) return `~$${Math.round(value / 1_000).toLocaleString()}K`;
  return `~$${value.toLocaleString()}`;
}

interface RelatedDealsProps {
  deals: RelatedDeal[];
}

export default function RelatedDeals({ deals }: RelatedDealsProps) {
  if (deals.length === 0) return null;

  return (
    <section
      style={{ padding: '48px 0', fontFamily: "'DM Sans', sans-serif" }}
      className="animate-[fadeUp_0.5s_0.3s_ease_both]"
    >
      <div
        style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 28,
          color: '#1A1714',
          marginBottom: 8,
          letterSpacing: '-0.02em',
        }}
      >
        Access more off-market deals like this one
      </div>
      <div
        style={{
          fontSize: 14,
          color: '#6B6560',
          maxWidth: 520,
          lineHeight: 1.6,
          fontWeight: 300,
          marginBottom: 28,
        }}
      >
        Browse pre-vetted, founder-led deals that fit your unique criteria. See deals in auto,
        industrials, SaaS, healthcare and more on the SourceCo Marketplace.
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}
        className="!grid-cols-1 md:!grid-cols-3"
      >
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>

      {/* Marketplace CTA Block */}
      <div
        style={{
          marginTop: 36,
          background: '#1A1714',
          borderRadius: 14,
          padding: '40px 48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 32,
          position: 'relative',
          overflow: 'hidden',
        }}
        className="!flex-col lg:!flex-row !p-7 lg:!p-[40px_48px]"
      >
        <div
          style={{
            position: 'absolute',
            top: -60,
            right: -60,
            width: 220,
            height: 220,
            borderRadius: '50%',
            background: 'rgba(184,147,58,0.1)',
          }}
        />
        <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#B8933A',
              marginBottom: 6,
            }}
          >
            Just Launched
          </div>
          <div
            style={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: 24,
              color: '#fff',
              marginBottom: 10,
              lineHeight: 1.25,
            }}
          >
            The SourceCo Marketplace
          </div>
          <div
            style={{
              fontSize: '13.5px',
              color: 'rgba(255,255,255,0.6)',
              lineHeight: 1.5,
              fontWeight: 300,
            }}
          >
            Access vetted, off-market founder-led deals before anyone else. New deals added weekly
            from our proprietary network.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 40,
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 26,
                color: '#D4AD5A',
              }}
            >
              50+
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Active Deals</div>
          </div>
          <div>
            <div
              style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 26,
                color: '#D4AD5A',
              }}
            >
              $8.2M
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Avg Deal Size</div>
          </div>
          <div>
            <div
              style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 26,
                color: '#D4AD5A',
              }}
            >
              $4.9M
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Median Revenue</div>
          </div>
        </div>

        <div style={{ flexShrink: 0, position: 'relative', zIndex: 1 }}>
          <a
            href="/signup?utm_source=landing_page&utm_medium=bottom_cta"
            style={{
              background: '#fff',
              color: '#1A1714',
              border: 'none',
              borderRadius: 8,
              padding: '14px 28px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              transition: 'all 0.15s',
            }}
            className="hover:!bg-[#F5EDD5]"
          >
            Browse Marketplace
            <svg
              width={14}
              height={14}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}

function DealCard({ deal }: { deal: RelatedDeal }) {
  const marginStr = deal.ebitda_margin
    ? `${deal.ebitda_margin % 1 === 0 ? Math.round(deal.ebitda_margin) : deal.ebitda_margin.toFixed(1)}% EBITDA Margin`
    : null;
  const industry = deal.categories?.[0] || null;
  const description = deal.hero_description || deal.description || '';
  const shortDesc = description.length > 180 ? description.slice(0, 180) + '...' : description;

  return (
    <div
      style={{
        background: '#FDFCFA',
        border: '1px solid #DDD8D0',
        borderRadius: 10,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.15s, box-shadow 0.15s',
        cursor: 'pointer',
      }}
      className="hover:-translate-y-[3px] hover:shadow-[0_8px_24px_rgba(0,0,0,0.07)]"
    >
      {/* Badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {marginStr && (
          <span
            style={{
              background: '#F5EDD5',
              color: '#B8933A',
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 9px',
              borderRadius: 4,
            }}
          >
            {marginStr}
          </span>
        )}
        {industry && (
          <span
            style={{
              background: '#EDE9E2',
              color: '#3D3830',
              fontSize: 11,
              padding: '3px 9px',
              borderRadius: 4,
            }}
          >
            {industry}
          </span>
        )}
      </div>

      {/* Location */}
      {deal.location && (
        <div
          style={{
            fontSize: '11.5px',
            color: '#6B6560',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 8,
          }}
        >
          <svg
            width={12}
            height={12}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <circle cx="12" cy="11" r="3" />
          </svg>
          {deal.location}
        </div>
      )}

      {/* Title */}
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: '#1A1714',
          marginBottom: 8,
          lineHeight: 1.35,
        }}
      >
        {deal.title}
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: '12.5px',
          color: '#6B6560',
          lineHeight: 1.55,
          flexGrow: 1,
          marginBottom: 14,
          fontWeight: 300,
        }}
      >
        {shortDesc}
      </div>

      {/* Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginBottom: 14,
          borderTop: '1px solid #DDD8D0',
          paddingTop: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#6B6560',
              marginBottom: 3,
            }}
          >
            Annual Revenue
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1714' }}>
            {formatCurrency(deal.revenue)}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#6B6560',
              marginBottom: 3,
            }}
          >
            EBITDA
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1714' }}>
            {formatCurrency(deal.ebitda)}
          </div>
        </div>
      </div>

      {/* CTA Button */}
      <a
        href={`/signup?utm_source=landing_page&utm_medium=related_deals&utm_content=${deal.id}`}
        style={{
          background: '#1A1714',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '9px 14px',
          fontSize: '12.5px',
          fontWeight: 600,
          cursor: 'pointer',
          width: '100%',
          fontFamily: "'DM Sans', sans-serif",
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          transition: 'background 0.15s',
          textDecoration: 'none',
        }}
        className="hover:!bg-[#333]"
      >
        View on Marketplace
      </a>
    </div>
  );
}
