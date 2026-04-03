/**
 * Shared HTML email layout wrapper for consistent branding.
 * All edge functions should use wrapEmailHtml() to wrap their content.
 */

const BRAND_COLOR = '#1a1a2e';
const ACCENT_COLOR = '#e94560';
const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export interface EmailWrapperOptions {
  /** Main body content HTML */
  bodyHtml: string;
  /** Optional preheader text (shows in inbox preview) */
  preheader?: string;
  /** Show SourceCo logo/header (default: true) */
  showHeader?: boolean;
  /** Show footer with unsubscribe link (default: true) */
  showFooter?: boolean;
  /** Recipient email for unsubscribe link */
  recipientEmail?: string;
}

export function wrapEmailHtml(options: EmailWrapperOptions): string {
  const { bodyHtml, preheader, showHeader = true, showFooter = true, recipientEmail } = options;

  const preheaderHtml = preheader
    ? `<div style="display:none;font-size:1px;color:#fff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>`
    : '';

  const headerHtml = showHeader
    ? `<tr><td style="background:${BRAND_COLOR};padding:24px 30px;text-align:center;">
        <h1 style="margin:0;font-family:${FONT_FAMILY};font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">SourceCo</h1>
      </td></tr>`
    : '';

  const unsubUrl = recipientEmail
    ? `https://app.sourcecodeals.com/unsubscribe?email=${encodeURIComponent(recipientEmail)}`
    : '';

  const footerHtml = showFooter
    ? `<tr><td style="padding:20px 30px;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;font-family:${FONT_FAMILY};font-size:12px;color:#64748b;">
          © ${new Date().getFullYear()} SourceCo Marketplace. All rights reserved.
        </p>
        ${unsubUrl ? `<p style="margin:8px 0 0;font-family:${FONT_FAMILY};font-size:11px;"><a href="${unsubUrl}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a></p>` : ''}
      </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:${FONT_FAMILY};">
${preheaderHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;">
<tr><td align="center" style="padding:20px 0;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    ${headerHtml}
    <tr><td style="padding:30px;font-family:${FONT_FAMILY};font-size:15px;line-height:1.6;color:#334155;">
      ${bodyHtml}
    </td></tr>
    ${footerHtml}
  </table>
</td></tr>
</table>
</body>
</html>`;
}
