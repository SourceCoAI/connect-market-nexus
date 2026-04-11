/**
 * security-headers.ts — Security headers configuration
 *
 * Generates Content Security Policy and other security header values.
 * For a Vite/React SPA, CSP is typically applied via <meta> tags in index.html
 * or through the hosting platform's response headers.
 */

import { SUPABASE_URL } from '@/integrations/supabase/client';

// ---------------------------------------------------------------------------
// CSP Configuration
// ---------------------------------------------------------------------------

/**
 * Content Security Policy directives for the application.
 * Tailored for a React + Vite + Supabase app with Mapbox and analytics.
 */
export const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    // Vite dev server uses inline scripts (dev only, not needed in prod)
    // "'unsafe-inline'" — intentionally omitted for security
    "'unsafe-eval'", // Required by some dependencies in dev; consider removing in prod
    'https://api.mapbox.com',
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
  ],
  'style-src': [
    "'self'",
    "'unsafe-inline'", // Required for CSS-in-JS / Radix UI / TipTap styles
    'https://api.mapbox.com',
    'https://fonts.googleapis.com',
  ],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https:',
    `${SUPABASE_URL}`,
  ],
  'font-src': [
    "'self'",
    'https://fonts.gstatic.com',
  ],
  'connect-src': [
    "'self'",
    `${SUPABASE_URL}`,
    // Supabase realtime WebSocket
    `${SUPABASE_URL.replace('https://', 'wss://')}`,
    'https://api.mapbox.com',
    'https://events.mapbox.com',
    'https://www.google-analytics.com',
    'https://www.googletagmanager.com',
  ],
  'frame-src': [
    "'self'",
  ],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': [] as string[],
} as const;

/**
 * Build the CSP string from the directives object.
 */
export function buildCspString(
  directives: Record<string, readonly string[]> = CSP_DIRECTIVES
): string {
  return Object.entries(directives)
    .map(([key, values]) => {
      if (values.length === 0) return key;
      return `${key} ${values.join(' ')}`;
    })
    .join('; ');
}

/**
 * Generate a CSP <meta> tag string for injection into index.html.
 *
 * Usage in index.html or via Vite's transformIndexHtml plugin:
 *   <meta http-equiv="Content-Security-Policy" content="..." />
 */
export function generateCspMetaTag(): string {
  const csp = buildCspString();
  return `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;
}

// ---------------------------------------------------------------------------
// Recommended Security Headers
// ---------------------------------------------------------------------------

/**
 * Full set of recommended security headers for the hosting platform
 * (Vercel, Netlify, Cloudflare, etc.).
 *
 * Apply these in vercel.json, _headers, or your server config.
 */
export const RECOMMENDED_SECURITY_HEADERS: Record<string, string> = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Clickjacking protection — redundant with CSP frame-ancestors but good defense-in-depth
  'X-Frame-Options': 'DENY',

  // XSS filter (legacy, but still useful for older browsers)
  'X-XSS-Protection': '1; mode=block',

  // Referrer policy — send origin only to same-origin; no referrer to cross-origin
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // HSTS — enforce HTTPS for 1 year, including subdomains
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

  // Permissions policy — disable sensitive browser features not needed by this app
  'Permissions-Policy': [
    'camera=()',
    'microphone=()',
    'geolocation=(self)',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
  ].join(', '),

  // Cross-Origin policies
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',

  // CSP
  'Content-Security-Policy': buildCspString(),
};

/**
 * Generate a _headers file content for Netlify or similar platforms.
 */
export function generateHeadersFile(): string {
  const lines = ['/*'];
  for (const [header, value] of Object.entries(RECOMMENDED_SECURITY_HEADERS)) {
    lines.push(`  ${header}: ${value}`);
  }
  return lines.join('\n');
}

/**
 * Generate headers configuration for Vercel (vercel.json format).
 */
export function generateVercelHeaders(): Array<{
  source: string;
  headers: Array<{ key: string; value: string }>;
}> {
  return [
    {
      source: '/(.*)',
      headers: Object.entries(RECOMMENDED_SECURITY_HEADERS).map(([key, value]) => ({
        key,
        value,
      })),
    },
  ];
}
