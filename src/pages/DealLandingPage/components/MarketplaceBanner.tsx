import { useState, useEffect } from 'react';

export default function MarketplaceBanner() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('sc_banner_dismissed')) {
        setDismissed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('sc_banner_dismissed', '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      style={{
        background: '#1A1714',
        color: '#fff',
        textAlign: 'center',
        padding: '10px 16px',
        fontSize: '13px',
        fontWeight: 400,
        letterSpacing: '0.01em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        position: 'relative',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#D4AD5A',
          display: 'inline-block',
          animation: 'pulse-dot 2s infinite',
          flexShrink: 0,
        }}
      />
      <span>
        <strong style={{ fontWeight: 600, color: '#D4AD5A' }}>Just Launched:</strong> The SourceCo
        Marketplace &nbsp;&middot;&nbsp; Access vetted off-market deals before anyone else.
      </span>
      <a
        href="/signup?utm_source=landing_page&utm_medium=top_banner"
        style={{
          color: '#fff',
          textDecoration: 'none',
          borderBottom: '1px solid rgba(255,255,255,0.4)',
          paddingBottom: '1px',
          fontWeight: 500,
          transition: 'border-color 0.2s',
        }}
      >
        Get Access &rarr;
      </a>
      <button
        onClick={handleDismiss}
        style={{
          position: 'absolute',
          right: 16,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.5)',
          cursor: 'pointer',
          fontSize: '18px',
          lineHeight: 1,
        }}
        aria-label="Dismiss banner"
      >
        &times;
      </button>
      <style>{`@keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
