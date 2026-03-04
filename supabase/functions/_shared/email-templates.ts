/**
 * Email Template Registry
 *
 * Centralized template definitions for the send-transactional-email function.
 * Part of Data Architecture Audit Phase 3: Email Function Consolidation.
 *
 * MIGRATION PLAN:
 * Currently 32 separate edge functions send email. This registry defines
 * templates so that all 32 can be replaced by a single `send-transactional-email`
 * function that looks up the template, substitutes variables, and sends via Brevo.
 *
 * To migrate an existing email function:
 * 1. Add its template to this registry
 * 2. Update the caller to invoke `send-transactional-email` with the template name
 * 3. Keep the old function as a thin wrapper during transition
 * 4. Remove the old function after verification
 */

// ---------------------------------------------------------------------------
// Template Types
// ---------------------------------------------------------------------------

export type EmailTemplate =
  // Approval & Onboarding
  | 'approval'
  | 'templated_approval'
  | 'marketplace_invitation'
  | 'verification'
  | 'verification_success'
  // Agreements
  | 'nda_request'
  | 'nda_reminder'
  | 'fee_agreement'
  | 'fee_agreement_reminder'
  // Deal Flow
  | 'deal_alert'
  | 'deal_referral'
  | 'connection_notification'
  | 'contact_response'
  | 'memo'
  | 'owner_intro'
  | 'owner_inquiry'
  // Admin & System
  | 'task_notification'
  | 'feedback'
  | 'feedback_notification'
  | 'password_reset'
  | 'data_recovery'
  | 'user_notification';

export interface TemplateDefinition {
  /** Subject line template. Use {{variable}} for substitution. */
  subject: string;
  /** Default sender name override (optional). */
  senderName?: string;
  /** Default reply-to email override (optional). */
  replyTo?: string;
  /** Required variables that must be provided. */
  requiredVars: string[];
  /** Builds the HTML content from variables. */
  buildHtml: (vars: Record<string, string>) => string;
}

// ---------------------------------------------------------------------------
// Shared HTML helpers
// ---------------------------------------------------------------------------

/** Escape HTML special characters to prevent XSS in email templates. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Sanitize a URL to only allow http/https schemes. */
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return url;
    }
    return '#';
  } catch {
    return '#';
  }
}

function wrapInLayout(bodyHtml: string, preheader?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SourceCo</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  ${preheader ? `<span style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</span>` : ''}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;background-color:#1a1a2e;">
              <span style="font-size:20px;font-weight:600;color:#ffffff;">SourceCo</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                &copy; ${new Date().getFullYear()} SourceCo. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function heading(text: string): string {
  return `<h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#1a1a2e;">${escapeHtml(text)}</h2>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(text)}</p>`;
}

/** Paragraph with raw HTML content (for template-controlled markup with escaped variables). */
function rawParagraph(html: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">${html}</p>`;
}

/** Bold text helper - escapes the value. */
function bold(text: string): string {
  return `<strong>${escapeHtml(text)}</strong>`;
}

function button(text: string, url: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
    <tr>
      <td style="border-radius:6px;background-color:#2563eb;">
        <a href="${sanitizeUrl(url)}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
          ${escapeHtml(text)}
        </a>
      </td>
    </tr>
  </table>`;
}

// ---------------------------------------------------------------------------
// Template Registry
// ---------------------------------------------------------------------------

export const TEMPLATES: Record<EmailTemplate, TemplateDefinition> = {
  // ---- Approval & Onboarding ----

  approval: {
    subject: 'Your SourceCo account has been approved',
    requiredVars: ['firstName', 'loginUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('Welcome to SourceCo!') +
      paragraph(`Hi ${v.firstName},`) +
      paragraph('Your account has been reviewed and approved. You now have full access to the SourceCo marketplace.') +
      button('Log In to SourceCo', v.loginUrl),
      'Your account has been approved'
    ),
  },

  templated_approval: {
    subject: '{{subject}}',
    requiredVars: ['firstName', 'subject', 'body', 'ctaText', 'ctaUrl'],
    buildHtml: (v) => wrapInLayout(
      heading(v.subject) +
      paragraph(`Hi ${v.firstName},`) +
      paragraph(v.body) +
      button(v.ctaText, v.ctaUrl),
    ),
  },

  marketplace_invitation: {
    subject: "You've been invited to SourceCo",
    requiredVars: ['inviteeName', 'inviterName', 'inviteUrl'],
    buildHtml: (v) => wrapInLayout(
      heading("You've Been Invited") +
      paragraph(`Hi ${v.inviteeName},`) +
      paragraph(`${v.inviterName} has invited you to join SourceCo, the M&A deal marketplace.`) +
      button('Accept Invitation', v.inviteUrl),
      `${v.inviterName} invited you to SourceCo`
    ),
  },

  verification: {
    subject: 'Verify your email address',
    requiredVars: ['firstName', 'verificationUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('Verify Your Email') +
      paragraph(`Hi ${v.firstName},`) +
      paragraph('Please verify your email address to complete your registration.') +
      button('Verify Email', v.verificationUrl) +
      paragraph('If you did not create an account, you can safely ignore this email.'),
      'Please verify your email'
    ),
  },

  verification_success: {
    subject: 'Email verified successfully',
    requiredVars: ['firstName', 'loginUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('Email Verified!') +
      paragraph(`Hi ${v.firstName},`) +
      paragraph('Your email has been verified successfully. Your account is now pending admin review.') +
      button('Go to SourceCo', v.loginUrl),
    ),
  },

  // ---- Agreements ----

  nda_request: {
    subject: 'NDA signature required — {{dealTitle}}',
    requiredVars: ['firstName', 'dealTitle', 'signUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('NDA Signature Required') +
      paragraph(`Hi ${v.firstName},`) +
      rawParagraph(`To access confidential details for ${bold(v.dealTitle)}, please sign the Non-Disclosure Agreement.`) +
      button('Sign NDA', v.signUrl),
      `NDA required for ${v.dealTitle}`
    ),
  },

  nda_reminder: {
    subject: 'Reminder: NDA pending for {{dealTitle}}',
    requiredVars: ['firstName', 'dealTitle', 'signUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('NDA Reminder') +
      paragraph(`Hi ${v.firstName},`) +
      rawParagraph(`This is a reminder that your NDA for ${bold(v.dealTitle)} is still pending. Please sign at your earliest convenience.`) +
      button('Sign NDA Now', v.signUrl),
    ),
  },

  fee_agreement: {
    subject: 'Fee agreement required — {{dealTitle}}',
    requiredVars: ['firstName', 'dealTitle', 'signUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('Fee Agreement Required') +
      paragraph(`Hi ${v.firstName},`) +
      rawParagraph(`To proceed with ${bold(v.dealTitle)}, please review and sign the fee agreement.`) +
      button('Review & Sign', v.signUrl),
    ),
  },

  fee_agreement_reminder: {
    subject: 'Reminder: Fee agreement pending for {{dealTitle}}',
    requiredVars: ['firstName', 'dealTitle', 'signUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('Fee Agreement Reminder') +
      paragraph(`Hi ${v.firstName},`) +
      rawParagraph(`Your fee agreement for ${bold(v.dealTitle)} is still pending.`) +
      button('Sign Agreement', v.signUrl),
    ),
  },

  // ---- Deal Flow ----

  deal_alert: {
    subject: 'New deal match: {{dealTitle}}',
    requiredVars: ['firstName', 'dealTitle', 'dealSummary', 'dealUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('New Deal Match') +
      paragraph(`Hi ${v.firstName},`) +
      rawParagraph(`We found a new deal that matches your criteria: ${bold(v.dealTitle)}.`) +
      paragraph(v.dealSummary) +
      button('View Deal', v.dealUrl),
      `New match: ${v.dealTitle}`
    ),
  },

  deal_referral: {
    subject: '{{referrerName}} shared a deal with you',
    requiredVars: ['firstName', 'referrerName', 'dealTitle', 'dealUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('Deal Referral') +
      paragraph(`Hi ${v.firstName},`) +
      rawParagraph(`${escapeHtml(v.referrerName)} thinks you might be interested in ${bold(v.dealTitle)}.`) +
      button('View Deal', v.dealUrl),
    ),
  },

  connection_notification: {
    subject: 'New connection request on {{dealTitle}}',
    requiredVars: ['firstName', 'buyerName', 'dealTitle', 'dashboardUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('New Connection Request') +
      paragraph(`Hi ${v.firstName},`) +
      rawParagraph(`${escapeHtml(v.buyerName)} has submitted a connection request for ${bold(v.dealTitle)}.`) +
      button('View in Dashboard', v.dashboardUrl),
    ),
  },

  contact_response: {
    subject: 'Response received for {{dealTitle}}',
    requiredVars: ['firstName', 'dealTitle', 'responseUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('Response Received') +
      paragraph(`Hi ${v.firstName},`) +
      rawParagraph(`You&#39;ve received a response regarding ${bold(v.dealTitle)}.`) +
      button('View Response', v.responseUrl),
    ),
  },

  memo: {
    subject: '{{memoTitle}}',
    requiredVars: ['firstName', 'memoTitle', 'memoUrl'],
    buildHtml: (v) => wrapInLayout(
      heading(v.memoTitle) +
      paragraph(`Hi ${v.firstName},`) +
      paragraph('A new confidential information memorandum is available for your review.') +
      button('View Memo', v.memoUrl),
    ),
  },

  owner_intro: {
    subject: 'New buyer introduction for {{dealTitle}}',
    requiredVars: ['ownerName', 'buyerName', 'dealTitle', 'dashboardUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('Buyer Introduction') +
      paragraph(`Hi ${v.ownerName},`) +
      rawParagraph(`We&#39;d like to introduce you to ${escapeHtml(v.buyerName)} regarding ${bold(v.dealTitle)}.`) +
      button('View Details', v.dashboardUrl),
    ),
  },

  owner_inquiry: {
    subject: 'New inquiry about {{dealTitle}}',
    requiredVars: ['ownerName', 'inquirerName', 'dealTitle', 'message', 'dashboardUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('New Inquiry') +
      paragraph(`Hi ${v.ownerName},`) +
      rawParagraph(`${escapeHtml(v.inquirerName)} has a question about ${bold(v.dealTitle)}:`) +
      `<blockquote style="margin:16px 0;padding:12px 16px;border-left:4px solid #2563eb;background:#f0f4ff;border-radius:0 4px 4px 0;">${paragraph(v.message)}</blockquote>` +
      button('Respond', v.dashboardUrl),
    ),
  },

  // ---- Admin & System ----

  task_notification: {
    subject: 'Task assigned: {{taskTitle}}',
    requiredVars: ['firstName', 'taskTitle', 'taskUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('New Task Assigned') +
      paragraph(`Hi ${v.firstName},`) +
      rawParagraph(`A new task has been assigned to you: ${bold(v.taskTitle)}.`) +
      button('View Task', v.taskUrl),
    ),
  },

  feedback: {
    subject: 'Feedback received: {{feedbackSubject}}',
    requiredVars: ['feedbackSubject', 'feedbackBody', 'submitterName', 'dashboardUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('New Feedback') +
      rawParagraph(`${escapeHtml(v.submitterName)} submitted feedback:`) +
      rawParagraph(bold(v.feedbackSubject)) +
      paragraph(v.feedbackBody) +
      button('View in Dashboard', v.dashboardUrl),
    ),
  },

  feedback_notification: {
    subject: 'Your feedback has been received',
    requiredVars: ['firstName'],
    buildHtml: (v) => wrapInLayout(
      heading('Feedback Received') +
      paragraph(`Hi ${v.firstName},`) +
      paragraph('Thank you for your feedback. Our team has been notified and will follow up if needed.'),
    ),
  },

  password_reset: {
    subject: 'Reset your password',
    requiredVars: ['firstName', 'resetUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('Password Reset') +
      paragraph(`Hi ${v.firstName},`) +
      paragraph('A password reset was requested for your account. Click the button below to set a new password.') +
      button('Reset Password', v.resetUrl) +
      paragraph('If you did not request this, you can safely ignore this email. The link expires in 1 hour.'),
      'Reset your password'
    ),
  },

  data_recovery: {
    subject: 'Data recovery information',
    requiredVars: ['firstName', 'recoveryUrl'],
    buildHtml: (v) => wrapInLayout(
      heading('Data Recovery') +
      paragraph(`Hi ${v.firstName},`) +
      paragraph('Your data recovery request has been processed. Use the link below to access your data.') +
      button('Access Recovery', v.recoveryUrl),
    ),
  },

  user_notification: {
    subject: '{{subject}}',
    requiredVars: ['firstName', 'subject', 'body'],
    buildHtml: (v) => wrapInLayout(
      heading(v.subject) +
      paragraph(`Hi ${v.firstName},`) +
      paragraph(v.body),
    ),
  },
};

// ---------------------------------------------------------------------------
// Template Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a template: substitute {{variable}} placeholders in subject,
 * validate required variables, and build the HTML.
 */
export function resolveTemplate(
  templateName: EmailTemplate,
  variables: Record<string, string>,
): { subject: string; htmlContent: string; error?: string } {
  const template = TEMPLATES[templateName];
  if (!template) {
    return { subject: '', htmlContent: '', error: `Unknown template: ${templateName}` };
  }

  // Check required variables
  const missing = template.requiredVars.filter((v) => !variables[v]);
  if (missing.length > 0) {
    return {
      subject: '',
      htmlContent: '',
      error: `Missing required variables for template '${templateName}': ${missing.join(', ')}`,
    };
  }

  // Substitute {{var}} in subject using replaceAll (avoids regex ReDoS)
  let subject = template.subject;
  for (const [key, value] of Object.entries(variables)) {
    subject = subject.replaceAll(`{{${key}}}`, value);
  }

  // Build HTML
  let htmlContent: string;
  try {
    htmlContent = template.buildHtml(variables);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { subject: '', htmlContent: '', error: `Template build error for '${templateName}': ${message}` };
  }

  return { subject, htmlContent };
}

/**
 * List all available template names (for validation/docs).
 */
export function getAvailableTemplates(): EmailTemplate[] {
  return Object.keys(TEMPLATES) as EmailTemplate[];
}
