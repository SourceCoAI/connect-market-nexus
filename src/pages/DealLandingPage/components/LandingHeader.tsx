export default function LandingHeader() {
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
          className="hover:!border-[#3D3830] hover:!text-[#1A1714]"
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
          className="hover:!bg-[#333]"
        >
          Get Marketplace Access
        </a>
      </div>
    </header>
  );
}
