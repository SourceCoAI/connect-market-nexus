/**
 * Shared HTML email layout wrapper for consistent branding.
 * All edge functions should use wrapEmailHtml() to wrap their content.
 *
 * Design: Ultra-minimal, zero-border, Apple/Stripe-level sophistication.
 * Logo: SourceCo wordmark from CDN.
 * No emojis, no colored accents, no em dashes, no borders.
 */

const LOGO_URL = 'https://cdn.prod.website-files.com/66851dae8a2c8c3f8cd9c703/66af956d372d85d43f02f481_Group%202%20(4)%20(1).png';
const FONT_FAMILY = "'Montserrat', 'Helvetica Neue', Arial, sans-serif";
const BG_COLOR = '#FAFAF8';
const CARD_BG = '#FFFFFF';
const TEXT_PRIMARY = '#1A1A1A';
const TEXT_MUTED = '#9B9B9B';

export interface EmailWrapperOptions {
  /** Main body content HTML */
  bodyHtml: string;
  /** Optional preheader text (shows in inbox preview) */
  preheader?: string;
  /** Show SourceCo logo header (default: true) */
  showHeader?: boolean;
  /** Show footer with unsubscribe link (default: true) */
  showFooter?: boolean;
  /** Recipient email for unsubscribe link */
  recipientEmail?: string;
}

export function wrapEmailHtml(options: EmailWrapperOptions): string {
  const { bodyHtml, preheader, showHeader = true, showFooter = true, recipientEmail } = options;

  const preheaderHtml = preheader
    ? `<div style="display:none;font-size:1px;color:${BG_COLOR};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>`
    : '';

  const headerHtml = showHeader
    ? `<tr><td style="padding:40px 40px 32px;text-align:center;">
        <img src="${LOGO_URL}" alt="SourceCo" height="36" style="height:36px;width:auto;display:inline-block;" />
      </td></tr>`
    : '';

  const unsubUrl = recipientEmail
    ? `https://marketplace.sourcecodeals.com/unsubscribe?email=${encodeURIComponent(recipientEmail)}`
    : '';

  const footerHtml = showFooter
    ? `<tr><td style="padding:32px 40px;text-align:center;">
        <p style="margin:0;font-family:${FONT_FAMILY};font-size:11px;color:${TEXT_MUTED};">
          &copy; ${new Date().getFullYear()} SourceCo
        </p>
        ${unsubUrl ? `<p style="margin:6px 0 0;font-family:${FONT_FAMILY};font-size:11px;"><a href="${unsubUrl}" style="color:${TEXT_MUTED};text-decoration:underline;">Unsubscribe</a></p>` : ''}
      </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${BG_COLOR};font-family:${FONT_FAMILY};">
${preheaderHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG_COLOR};">
<tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:${CARD_BG};">
    ${headerHtml}
    <tr><td style="padding:0 40px 40px;font-family:${FONT_FAMILY};font-size:15px;line-height:1.7;color:${TEXT_PRIMARY};">
      ${bodyHtml}
    </td></tr>
    ${footerHtml}
  </table>
</td></tr>
</table>
</body>
</html>`;
}
