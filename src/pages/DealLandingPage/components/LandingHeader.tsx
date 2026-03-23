import { useState } from 'react';

const NAV_ITEMS = [
  { label: 'Live Deals', href: 'https://www.sourcecodeals.com/off-market-deal-memos' },
  { label: 'Buyers', href: 'https://www.sourcecodeals.com/buyers' },
  { label: 'Owners', href: 'https://www.sourcecodeals.com/owners' },
  { label: 'About', href: 'https://www.sourcecodeals.com/about' },
  { label: 'Resources', href: 'https://www.sourcecodeals.com/resources' },
];

// M-18 FIX: Added mobile hamburger menu so navigation items are accessible on small screens.
export default function LandingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header
      style={{
        background: '#FDFCFA',
        borderBottom: '1px solid #DDD8D0',
        padding: '0 32px',
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        fontFamily: "'DM Sans', sans-serif",
      }}
      className="!px-4 md:!px-8"
    >
      <a
        href="/"
        style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 20,
          color: '#1A1714',
          textDecoration: 'none',
          letterSpacing: '-0.02em',
        }}
      >
        Source<span style={{ color: '#B8933A' }}>Co</span>
      </a>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <a
          href="/auth"
          style={{
            background: 'none',
            border: '1px solid #DDD8D0',
            color: '#6B6560',
            padding: '7px 16px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
            textDecoration: 'none',
            transition: 'all 0.15s',
          }}
          className="hover:!border-[#3D3830] hover:!text-[#1A1714] hidden sm:inline-block"
        >
          Sign In
        </a>
        <a
          href="/signup?utm_source=landing_page&utm_medium=header"
          style={{
            background: '#1A1714',
            color: '#fff',
            padding: '7px 16px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
            textDecoration: 'none',
            transition: 'background 0.15s',
          }}
          className="hover:!bg-[#333] hidden sm:inline-block"
        >
          Get Marketplace Access
        </a>
        {/* M-18 FIX: Mobile hamburger menu */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden inline-flex items-center justify-center p-2 rounded-md"
          style={{ color: '#6B6560' }}
          aria-label="Toggle navigation menu"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileMenuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#E5E7EB] bg-white">
          <div className="px-4 py-3 space-y-2">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="block py-2 text-sm font-medium text-[#374151] hover:text-[#1A1A1A] transition-colors font-['Inter',system-ui,sans-serif]"
              >
                {item.label}
              </a>
            ))}
            <a
              href="/signup?utm_source=landing_page&utm_medium=header&utm_content=join_marketplace"
              className="block py-2 text-sm font-semibold text-[#C9A84C] font-['Inter',system-ui,sans-serif]"
            >
              Join the Marketplace
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
