import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronDown, ChevronRight, Mail, Eye, Copy, Check } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';

type RecipientType = 'Buyer' | 'Admin' | 'Owner' | 'User' | 'System' | 'Dynamic';
type EmailStatus = 'active' | 'broken' | 'deprecated';

interface CatalogEmail {
  name: string;
  subject: string;
  recipient: RecipientType;
  trigger: string;
  edgeFunction: string;
  variant?: string;
  designNotes: string;
  previewHtml: string;
  status?: EmailStatus;
  statusNote?: string;
}

interface CatalogCategory {
  name: string;
  emails: CatalogEmail[];
}

const RECIPIENT_STYLES: Record<RecipientType, string> = {
  Buyer: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  Admin: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20',
  Owner: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20',
  User: 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/20',
  System: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/20',
  Dynamic: 'bg-pink-500/15 text-pink-700 dark:text-pink-400 border-pink-500/20',
};

// Shared preview building blocks
const wrapperStart = `<div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
  <div style="background: #1a1a2e; padding: 24px 32px; text-align: center;">
    <span style="color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">SourceCo</span>
  </div>
  <div style="padding: 32px;">`;
const wrapperEnd = `</div>
  <div style="background: #f8fafc; padding: 20px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
    <p style="margin: 0; font-size: 12px; color: #94a3b8;">© SourceCo Deals Inc. All rights reserved.</p>
    <p style="margin: 4px 0 0; font-size: 11px; color: #cbd5e1;">You're receiving this because of your SourceCo account.</p>
  </div>
</div>`;
const ctaBtn = (text: string) => `<div style="text-align: center; margin: 28px 0;"><a href="#" style="background: #1a1a2e; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">${text}</a></div>`;
const infoBox = (color: string, border: string, text: string) => `<div style="background: ${color}; border-left: 4px solid ${border}; padding: 16px; border-radius: 4px; margin-bottom: 20px;"><p style="margin: 0; color: #1e293b; font-size: 14px;">${text}</p></div>`;

const EMAIL_CATALOG: CatalogCategory[] = [
  {
    name: 'Onboarding & Auth',
    emails: [
      {
        name: 'Signup Confirmation',
        subject: 'Confirm Your Signup',
        recipient: 'User',
        trigger: 'User creates an account',
        edgeFunction: 'Supabase Auth (built-in)',
        designNotes: 'Supabase default auth email with confirmation link',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Confirm your email</h2><p style="color: #475569; line-height: 1.6;">Click the link below to confirm your email address and activate your account.</p>${ctaBtn('Confirm Email')}${wrapperEnd}`,
      },
      {
        name: 'Email Verification Resolved',
        subject: "Email Verified Successfully — What's Next",
        recipient: 'User',
        trigger: 'Admin resolves stuck email verification',
        edgeFunction: 'send-verification-success-email',
        designNotes: 'Branded wrapper, welcome message, CTA to explore marketplace',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Email Verified Successfully</h2><p style="color: #475569; line-height: 1.6;">Great news! Your email has been verified. You're all set to explore the marketplace.</p>${ctaBtn('Explore Marketplace')}${wrapperEnd}`,
      },
      {
        name: 'Technical Verification Fix',
        subject: 'Email Verification - Technical Issue Resolved',
        recipient: 'User',
        trigger: 'Admin fixes technical verification issue',
        edgeFunction: 'send-simple-verification-email',
        designNotes: 'Branded wrapper, apology for technical issue, CTA to access account',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Technical Issue Resolved</h2><p style="color: #475569; line-height: 1.6;">We resolved a technical issue that was preventing your email verification. Your account is now fully active.</p>${ctaBtn('Access Your Account')}${wrapperEnd}`,
      },
      {
        name: 'Password Reset',
        subject: 'Reset Your Password — SourceCo',
        recipient: 'User',
        trigger: 'User requests password reset',
        edgeFunction: 'password-reset',
        designNotes: 'Branded wrapper, reset instructions, time-limited CTA button',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Reset Your Password</h2><p style="color: #475569; line-height: 1.6;">We received a request to reset your password. Click the button below to choose a new password.</p>${ctaBtn('Reset Password')}<p style="color: #94a3b8; font-size: 12px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>${wrapperEnd}`,
      },
      {
        name: 'Onboarding Day 2',
        subject: "What's in the pipeline right now.",
        recipient: 'User',
        trigger: '2 days after signup, no connection request',
        edgeFunction: 'send-onboarding-day2',
        designNotes: 'Branded wrapper, pipeline highlights, CTA to browse deals',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">What's in the pipeline right now</h2><p style="color: #475569; line-height: 1.6;">Hi there — here's a quick look at active opportunities that match your profile.</p>${infoBox('#f0f9ff', '#3b82f6', '3 new deals added this week matching your criteria')}<p style="color: #475569; line-height: 1.6;">Take a look and let us know if anything catches your eye.</p>${ctaBtn('Browse Deals')}${wrapperEnd}`,
      },
      {
        name: 'Onboarding Day 7',
        subject: "Still looking? Here's what other buyers are pursuing.",
        recipient: 'User',
        trigger: '7 days after signup re-engagement',
        edgeFunction: 'send-onboarding-day7',
        designNotes: 'Branded wrapper, social proof, active deal highlights, CTA',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Still looking?</h2><p style="color: #475569; line-height: 1.6;">Here's what other buyers are pursuing right now on the marketplace.</p>${infoBox('#f0fdf4', '#22c55e', '12 active buyers exploring deals this week')}<p style="color: #475569; line-height: 1.6;">Don't miss out — new deals are added regularly.</p>${ctaBtn('View Active Deals')}${wrapperEnd}`,
      },
    ],
  },
  {
    name: 'Buyer Lifecycle',
    emails: [
      {
        name: 'Marketplace Approval',
        subject: 'Project [Name] — Investment Opportunity',
        recipient: 'Buyer',
        trigger: "Admin approves buyer's marketplace application",
        edgeFunction: 'approve-marketplace-buyer',
        designNotes: 'Branded wrapper, deal details table (company, revenue, EBITDA), CTA to view deal',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Project Acme — Investment Opportunity</h2><p style="color: #475569; line-height: 1.6;">You've been approved to view this investment opportunity.</p><div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;"><table style="width: 100%;"><tr><td style="padding: 6px 0; color: #64748b;">Company:</td><td style="color: #0f172a; font-weight: 600;">Acme Services LLC</td></tr><tr><td style="padding: 6px 0; color: #64748b;">Revenue:</td><td style="color: #0f172a; font-weight: 600;">$5,200,000</td></tr><tr><td style="padding: 6px 0; color: #64748b;">EBITDA:</td><td style="color: #0f172a; font-weight: 600;">$1,100,000</td></tr></table></div>${ctaBtn('View Deal Details')}${wrapperEnd}`,
      },
      {
        name: 'Marketplace Invitation',
        subject: "[Name], you're invited to SourceCo Marketplace",
        recipient: 'Buyer',
        trigger: 'Admin sends marketplace invitation',
        edgeFunction: 'send-marketplace-invitation',
        designNotes: 'Branded wrapper, personalized greeting, marketplace benefits, CTA to join',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">You're Invited</h2><p style="color: #475569; line-height: 1.6;">Hi Jane, you've been invited to join the SourceCo Marketplace — an exclusive platform for vetted buyers.</p>${infoBox('#eff6ff', '#3b82f6', 'Access curated deal flow in your target sectors')}<p style="color: #475569; line-height: 1.6;">Join today to start receiving matched opportunities.</p>${ctaBtn('Accept Invitation')}${wrapperEnd}`,
      },
      {
        name: 'Buyer Rejection',
        subject: 'Regarding Your Interest in [Company]',
        recipient: 'Buyer',
        trigger: 'Admin rejects buyer for a deal',
        edgeFunction: 'notify-buyer-rejection',
        designNotes: 'Branded wrapper, professional decline message, encouragement to explore other deals',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Regarding Your Interest</h2><p style="color: #475569; line-height: 1.6;">Thank you for your interest in Acme Corp. After careful review, we've determined this opportunity may not be the best fit at this time.</p><p style="color: #475569; line-height: 1.6;">We encourage you to continue exploring other opportunities on the marketplace.</p>${ctaBtn('Browse Other Deals')}${wrapperEnd}`,
      },
      {
        name: 'Connection Request Confirmation',
        subject: 'Introduction request received — [Deal]',
        recipient: 'User',
        trigger: 'User submits a connection request',
        edgeFunction: 'send-connection-notification',
        variant: 'type: user_confirmation',
        designNotes: 'Branded wrapper, confirmation of request, next steps info',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Request Received</h2>${infoBox('#f0fdf4', '#22c55e', 'Your introduction request has been received and is being reviewed.')}<p style="color: #475569; line-height: 1.6;">We'll review your request and get back to you shortly. In the meantime, feel free to explore other opportunities.</p>${ctaBtn('View Your Requests')}${wrapperEnd}`,
      },
      {
        name: 'Connection Approval',
        subject: "You're in — introduction to [Deal] approved.",
        recipient: 'Buyer',
        trigger: 'Admin approves connection request',
        edgeFunction: 'send-connection-notification',
        variant: 'type: approval_notification',
        designNotes: 'Branded wrapper, approval banner, deal details, CTA to view deal',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">You're In!</h2>${infoBox('#f0fdf4', '#22c55e', 'Your introduction request has been approved.')}<p style="color: #475569; line-height: 1.6;">You now have access to the full deal details. Review the information and reach out to get started.</p>${ctaBtn('View Deal')}${wrapperEnd}`,
      },
      {
        name: 'Connection Admin Notification',
        subject: 'New Connection Request: [Deal] — [Buyer]',
        recipient: 'Admin',
        trigger: 'Buyer submits a connection request',
        edgeFunction: 'send-connection-notification',
        variant: 'type: admin_notification',
        designNotes: 'Branded wrapper, buyer details, deal details, CTA to review in admin',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">New Connection Request</h2>${infoBox('#eff6ff', '#3b82f6', 'Jane Smith from Apex Capital has requested an introduction.')}<div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;"><p style="margin: 4px 0; font-size: 13px;"><strong>Deal:</strong> Project Acme</p><p style="margin: 4px 0; font-size: 13px;"><strong>Buyer:</strong> Jane Smith</p><p style="margin: 4px 0; font-size: 13px;"><strong>Firm:</strong> Apex Capital</p></div>${ctaBtn('Review Request')}${wrapperEnd}`,
      },
      {
        name: 'Deal Alert',
        subject: 'New deal — matches your mandate.',
        recipient: 'Buyer',
        trigger: "New listing matches buyer's alert criteria",
        edgeFunction: 'send-deal-alert',
        designNotes: 'Branded wrapper, deal summary card, key metrics, CTA to view listing',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">New Deal Match</h2><p style="color: #475569; line-height: 1.6;">A new deal has been added that matches your acquisition criteria.</p><div style="border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0;"><h3 style="margin: 0 0 12px; color: #0f172a;">IT Services Company — Southeast</h3><p style="margin: 4px 0; font-size: 13px; color: #64748b;">Revenue: <strong style="color: #0f172a;">$3.2M</strong></p><p style="margin: 4px 0; font-size: 13px; color: #64748b;">EBITDA: <strong style="color: #0f172a;">$800K</strong></p></div>${ctaBtn('View Deal')}${wrapperEnd}`,
      },
      {
        name: 'Deal Referral',
        subject: '[Referrer] shared a business opportunity with you',
        recipient: 'User',
        trigger: 'User shares a deal via referral',
        edgeFunction: 'send-deal-referral',
        designNotes: 'Branded wrapper, referrer name, optional personal message, deal card with metrics, CTA',
        previewHtml: `${wrapperStart}<h1 style="margin: 0 0 8px; font-size: 22px; color: #0f172a;">John Doe thought you'd be interested</h1><p style="color: #64748b; margin: 0 0 24px;">They shared a business listing with you</p><div style="background: #f8fafc; border-left: 2px solid #cbd5e1; padding: 16px; border-radius: 4px; margin-bottom: 24px;"><p style="margin: 0; font-style: italic; color: #475569;">"Take a look at this — right in your sweet spot."</p></div><div style="border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin-bottom: 24px;"><h3 style="margin: 0 0 12px; color: #0f172a;">Managed IT Services Provider</h3><p style="margin: 4px 0; font-size: 12px; color: #64748b;">Revenue: <strong>$2.1M</strong> · EBITDA: <strong>$450K</strong></p></div>${ctaBtn('View Full Listing')}${wrapperEnd}`,
      },
      {
        name: 'Templated Approval (NDA Signed)',
        subject: "You're in — full access is live.",
        recipient: 'Buyer',
        trigger: 'Buyer approved and has already signed NDA',
        edgeFunction: 'send-templated-approval-email',
        variant: 'NDA already signed',
        designNotes: 'Branded wrapper, full access confirmation, CTA to view deal room',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Full Access Is Live</h2>${infoBox('#f0fdf4', '#22c55e', "You're approved and your NDA is on file. Full access is now available.")}<p style="color: #475569; line-height: 1.6;">You can now access the complete data room, financials, and all deal materials.</p>${ctaBtn('Enter Data Room')}${wrapperEnd}`,
      },
      {
        name: 'Templated Approval (NDA Unsigned)',
        subject: "You're approved — one step to full access.",
        recipient: 'Buyer',
        trigger: 'Buyer approved but NDA not yet signed',
        edgeFunction: 'send-templated-approval-email',
        variant: 'NDA not yet signed',
        designNotes: 'Branded wrapper, approval notice with NDA requirement, CTA to sign NDA',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">You're Approved</h2>${infoBox('#fffbeb', '#f59e0b', "You've been approved! Sign the NDA to unlock full access.")}<p style="color: #475569; line-height: 1.6;">One more step — please review and sign the NDA to access the full data room and financials.</p>${ctaBtn('Sign NDA Now')}${wrapperEnd}`,
      },
    ],
  },
  {
    name: 'Agreements & Documents',
    emails: [
      {
        name: 'NDA Request',
        subject: 'Your NDA from SourceCo',
        recipient: 'Buyer',
        trigger: 'Buyer needs to sign NDA for deal access',
        edgeFunction: 'request-agreement-email',
        variant: 'docLabel = NDA',
        designNotes: 'Branded wrapper, document request details, CTA to review and sign',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Your NDA from SourceCo</h2><p style="color: #475569; line-height: 1.6;">To proceed with this opportunity, please review and sign the Non-Disclosure Agreement.</p><div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;"><p style="margin: 4px 0; font-size: 13px;"><strong>Document:</strong> Non-Disclosure Agreement</p><p style="margin: 4px 0; font-size: 13px;"><strong>Deal:</strong> Project Acme</p></div>${ctaBtn('Review & Sign NDA')}${wrapperEnd}`,
      },
      {
        name: 'Fee Agreement Request',
        subject: 'Your Fee Agreement from SourceCo',
        recipient: 'Buyer',
        trigger: 'Buyer needs to sign fee agreement',
        edgeFunction: 'request-agreement-email',
        variant: 'docLabel = Fee Agreement',
        designNotes: 'Branded wrapper, fee agreement details, CTA to review and sign',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Your Fee Agreement from SourceCo</h2><p style="color: #475569; line-height: 1.6;">To proceed with this opportunity, please review and sign the Fee Agreement.</p><div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;"><p style="margin: 4px 0; font-size: 13px;"><strong>Document:</strong> Fee Agreement</p><p style="margin: 4px 0; font-size: 13px;"><strong>Deal:</strong> Project Acme</p></div>${ctaBtn('Review & Sign Agreement')}${wrapperEnd}`,
      },
      {
        name: 'Data Room Access Granted',
        subject: 'Data room open — Project [Name]',
        recipient: 'Buyer',
        trigger: 'Admin grants data room access',
        edgeFunction: 'grant-data-room-access',
        designNotes: 'Branded wrapper, access confirmation, deal project name, CTA to enter data room',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Data Room Access Granted</h2>${infoBox('#f0fdf4', '#22c55e', 'You now have access to the data room for Project Acme.')}<p style="color: #475569; line-height: 1.6;">The data room contains financial documents, operational data, and other confidential materials for your review.</p>${ctaBtn('Enter Data Room')}${wrapperEnd}`,
      },
    ],
  },
  {
    name: 'Deal & Owner Notifications',
    emails: [
      {
        name: 'New Deal Owner Assigned',
        subject: '✨ New Deal Assigned: [Deal]',
        recipient: 'Admin',
        trigger: 'Admin assigns deal to an owner',
        edgeFunction: 'notify-new-deal-owner',
        designNotes: 'Branded wrapper, blue info banner, deal info card, buyer details, responsibilities list, CTA to view deal',
        previewHtml: `${wrapperStart}${infoBox('#eff6ff', '#3b82f6', "Hi Adam, you've been assigned as the owner of \"Project Acme\" by Sarah.")}<div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 16px 0; border: 1px solid #e2e8f0;"><h3 style="margin: 0 0 12px; font-size: 16px; color: #0f172a;">Deal Information</h3><p style="margin: 4px 0; font-size: 13px;"><span style="color: #64748b;">Company:</span> <strong>Acme Services</strong></p><p style="margin: 4px 0; font-size: 13px;"><span style="color: #64748b;">Buyer:</span> <strong>Jane Smith • jane@apex.com</strong></p></div>${ctaBtn('View Deal Details')}<div style="background: #fffbeb; padding: 16px; border-radius: 8px; border: 1px solid #fde68a;"><h4 style="margin: 0 0 8px; color: #92400e; font-size: 14px;">Your Responsibilities:</h4><ul style="margin: 0; padding-left: 20px; color: #78350f; font-size: 13px;"><li>Review deal details and buyer info</li><li>Follow up with buyer promptly</li><li>Keep deal status updated</li></ul></div>${wrapperEnd}`,
      },
      {
        name: 'Deal Reassignment',
        subject: '🔄 Your deal "[Deal]" has been reassigned / 📌 unassigned',
        recipient: 'Admin',
        trigger: 'Deal is reassigned to a different owner or unassigned',
        edgeFunction: 'notify-deal-reassignment',
        designNotes: 'Branded wrapper, amber warning banner, deal info table with previous/new owner, CTA to pipeline',
        previewHtml: `${wrapperStart}${infoBox('#fef3c7', '#f59e0b', 'Hi Adam, your deal has been reassigned to Sarah Johnson.')}<h3 style="margin: 0 0 12px; font-size: 16px; color: #1e293b;">Deal Information</h3><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #475569;">Deal:</td><td style="color: #1e293b; font-weight: 600;">Project Acme</td></tr><tr><td style="padding: 8px 0; color: #475569;">Previous Owner:</td><td style="color: #1e293b;">Adam Haile</td></tr><tr><td style="padding: 8px 0; color: #475569;">New Owner:</td><td style="color: #1e293b;">Sarah Johnson</td></tr></table>${ctaBtn('Open Deal in Pipeline')}${wrapperEnd}`,
      },
      {
        name: 'Deal Owner Change',
        subject: 'Deal Modified: [Company]',
        recipient: 'Owner',
        trigger: 'Deal details or ownership modified',
        edgeFunction: 'notify-deal-owner-change',
        designNotes: 'Branded wrapper, modification summary, deal details, CTA to view changes',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Deal Modified</h2><p style="color: #475569; line-height: 1.6;">Changes have been made to the deal for Acme Corp.</p><div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;"><p style="margin: 4px 0; font-size: 13px;"><strong>Company:</strong> Acme Corp</p><p style="margin: 4px 0; font-size: 13px;"><strong>Modified by:</strong> Sarah Johnson</p></div>${ctaBtn('View Deal')}${wrapperEnd}`,
      },
      {
        name: 'Owner Inquiry Notification',
        subject: '🏢 New Owner Inquiry: [Company] ([Revenue])',
        recipient: 'Admin',
        trigger: 'Owner inquiry submitted about a deal',
        edgeFunction: 'send-owner-inquiry-notification',
        designNotes: 'Branded wrapper, inquiry details with company and revenue, CTA to review',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">🏢 New Owner Inquiry</h2>${infoBox('#eff6ff', '#3b82f6', 'A new owner inquiry has been submitted.')}<div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;"><p style="margin: 4px 0; font-size: 13px;"><strong>Company:</strong> Acme Services LLC</p><p style="margin: 4px 0; font-size: 13px;"><strong>Revenue:</strong> $2M – $5M</p><p style="margin: 4px 0; font-size: 13px;"><strong>Contact:</strong> John Owner</p></div>${ctaBtn('Review Inquiry')}${wrapperEnd}`,
      },
      {
        name: 'Owner Intro Notification',
        subject: '🤝 Owner Intro Requested: [Buyer] → [Company]',
        recipient: 'Admin',
        trigger: 'Buyer is introduced to deal owner',
        edgeFunction: 'send-owner-intro-notification',
        designNotes: 'Branded wrapper, intro details with buyer → company mapping, CTA to view intro',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">🤝 Owner Intro Requested</h2>${infoBox('#f0fdf4', '#22c55e', 'A buyer introduction has been requested.')}<div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;"><p style="margin: 4px 0; font-size: 13px;"><strong>Buyer:</strong> Jane Smith (Apex Capital)</p><p style="margin: 4px 0; font-size: 13px;"><strong>Company:</strong> Acme Services LLC</p></div>${ctaBtn('View Introduction')}${wrapperEnd}`,
      },
      {
        name: 'Memo Email',
        subject: '(Admin-composed subject)',
        recipient: 'Dynamic',
        trigger: 'Admin sends a memo/CIM to a recipient',
        edgeFunction: 'send-memo-email',
        designNotes: 'Branded wrapper, admin-composed body content, attachment links if applicable',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Confidential Investment Memorandum</h2><p style="color: #475569; line-height: 1.6;">Please find the attached Confidential Information Memorandum for your review.</p><div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #e2e8f0;"><p style="margin: 0; font-size: 13px;">📎 <a href="#" style="color: #3b82f6; text-decoration: underline;">Project_Acme_CIM.pdf</a></p></div><p style="color: #475569; line-height: 1.6;">This document is strictly confidential. Please do not distribute without authorization.</p>${wrapperEnd}`,
      },
    ],
  },
  {
    name: 'Messaging',
    emails: [
      {
        name: 'Buyer New Message',
        subject: 'New message from SourceCo re: [Deal]',
        recipient: 'Buyer',
        trigger: 'Admin replies in message center',
        edgeFunction: 'notify-buyer-new-message',
        designNotes: 'Branded wrapper, message preview, CTA to view full message',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">New Message</h2><p style="color: #475569; line-height: 1.6;">You have a new message regarding Project Acme.</p><div style="background: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px; margin: 20px 0;"><p style="margin: 0; color: #334155; font-size: 14px;">"Hi Jane, thanks for your interest. I'd like to schedule a call to discuss the opportunity further..."</p></div>${ctaBtn('View Full Message')}${wrapperEnd}`,
      },
      {
        name: 'Admin New Message',
        subject: 'New Buyer Message: [Deal] — [Buyer]',
        recipient: 'Admin',
        trigger: 'Buyer sends message via message center',
        edgeFunction: 'notify-admin-new-message',
        designNotes: 'Branded wrapper, buyer info, message preview, CTA to reply in admin',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">New Buyer Message</h2>${infoBox('#eff6ff', '#3b82f6', 'Jane Smith sent a new message about Project Acme.')}<div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 16px 0;"><p style="margin: 0 0 8px; font-size: 12px; color: #64748b;">From: Jane Smith · Apex Capital</p><p style="margin: 0; color: #334155; font-size: 14px;">"I'm very interested in this opportunity. Could we schedule a call this week?"</p></div>${ctaBtn('Reply in Admin')}${wrapperEnd}`,
      },
    ],
  },
  {
    name: 'User Journey Notifications',
    emails: [
      {
        name: 'Journey: User Created',
        subject: 'Your application to SourceCo is in.',
        recipient: 'User',
        trigger: 'User creates an account (journey event)',
        edgeFunction: 'user-journey-notifications',
        variant: 'event_type: user_created',
        designNotes: 'Branded wrapper, application received confirmation, next steps',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Application Received</h2>${infoBox('#f0fdf4', '#22c55e', 'Your application to SourceCo is in.')}<p style="color: #475569; line-height: 1.6;">Thanks for applying! Our team will review your application and get back to you shortly.</p><p style="color: #475569; line-height: 1.6;">In the meantime, make sure your profile is complete to speed up the review process.</p>${ctaBtn('Complete Your Profile')}${wrapperEnd}`,
      },
      {
        name: 'Journey: Email Verified',
        subject: "Email confirmed — you're in the queue.",
        recipient: 'User',
        trigger: 'User verifies their email (journey event)',
        edgeFunction: 'user-journey-notifications',
        variant: 'event_type: email_verified',
        designNotes: 'Branded wrapper, email confirmed notice, queue status',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Email Confirmed</h2>${infoBox('#f0fdf4', '#22c55e', "Your email is confirmed — you're in the review queue.")}<p style="color: #475569; line-height: 1.6;">We're reviewing your application. You'll hear from us once your account has been approved.</p>${wrapperEnd}`,
      },
      {
        name: 'Journey: Profile Approved',
        subject: 'Account Approved — Welcome to SourceCo',
        recipient: 'User',
        trigger: 'Admin approves user profile (journey event)',
        edgeFunction: 'user-journey-notifications',
        variant: 'event_type: profile_approved',
        designNotes: 'Branded wrapper, welcome message, getting started steps, CTA to explore',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Welcome to SourceCo!</h2>${infoBox('#f0fdf4', '#22c55e', 'Your account has been approved. Welcome aboard!')}<p style="color: #475569; line-height: 1.6;">You now have full access to the SourceCo marketplace. Here's how to get started:</p><ul style="color: #475569; line-height: 1.8;"><li>Browse active deals matching your criteria</li><li>Set up deal alerts for new opportunities</li><li>Submit connection requests for deals you're interested in</li></ul>${ctaBtn('Explore Marketplace')}${wrapperEnd}`,
      },
      {
        name: 'Journey: Profile Rejected',
        subject: 'SourceCo Account Update',
        recipient: 'User',
        trigger: 'Admin rejects user profile (journey event)',
        edgeFunction: 'user-journey-notifications',
        variant: 'event_type: profile_rejected',
        designNotes: 'Branded wrapper, professional update message, contact info for questions',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Account Update</h2><p style="color: #475569; line-height: 1.6;">Thank you for your interest in SourceCo. After reviewing your application, we're unable to approve your account at this time.</p><p style="color: #475569; line-height: 1.6;">If you believe this was in error or have additional information to share, please don't hesitate to reach out.</p><p style="color: #475569; line-height: 1.6;">Best regards,<br>The SourceCo Team</p>${wrapperEnd}`,
      },
      {
        name: 'Journey: Admin New User',
        subject: 'New User Registration: [Name] ([Email])',
        recipient: 'Admin',
        trigger: 'New user signs up (admin notification)',
        edgeFunction: 'user-journey-notifications',
        variant: 'admin notification on user_created',
        designNotes: 'Branded wrapper, new user details, buyer type, CTA to review in admin',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">New User Registration</h2>${infoBox('#eff6ff', '#3b82f6', 'A new user has registered on the platform.')}<div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;"><p style="margin: 4px 0; font-size: 13px;"><strong>Name:</strong> Jane Smith</p><p style="margin: 4px 0; font-size: 13px;"><strong>Email:</strong> jane@apexcapital.com</p><p style="margin: 4px 0; font-size: 13px;"><strong>Buyer Type:</strong> Private Equity</p></div>${ctaBtn('Review in Admin')}${wrapperEnd}`,
      },
    ],
  },
  {
    name: 'Admin & System',
    emails: [
      {
        name: 'Enhanced Admin Notification',
        subject: 'New User Registration - Action Required',
        recipient: 'Admin',
        trigger: 'New user signs up (enhanced notification)',
        edgeFunction: 'enhanced-admin-notification',
        designNotes: 'Branded wrapper, detailed user info, action required banner, CTA to admin dashboard',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">New User Registration</h2>${infoBox('#fef3c7', '#f59e0b', 'Action Required — A new user needs review.')}<div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;"><p style="margin: 4px 0; font-size: 13px;"><strong>Name:</strong> Jane Smith</p><p style="margin: 4px 0; font-size: 13px;"><strong>Email:</strong> jane@apex.com</p><p style="margin: 4px 0; font-size: 13px;"><strong>Company:</strong> Apex Capital</p><p style="margin: 4px 0; font-size: 13px;"><strong>Type:</strong> Private Equity</p></div>${ctaBtn('Review User')}${wrapperEnd}`,
      },
      {
        name: 'Feedback Notification',
        subject: '${priorityEmoji} New Feedback: [Category] (URGENT if urgent)',
        recipient: 'Admin',
        trigger: 'User submits feedback',
        edgeFunction: 'send-feedback-notification',
        designNotes: 'Branded wrapper, feedback details (category, priority, message), CTA to admin dashboard',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">New Feedback Received</h2><p style="color: #64748b;">A user has submitted feedback that requires your attention.</p><div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;"><p style="margin: 0 0 12px;"><strong>Category:</strong> <span style="background: #e2e8f0; padding: 4px 8px; border-radius: 4px;">Bug Report</span></p><p style="margin: 0 0 12px;"><strong>Priority:</strong> <span style="background: #fef2f2; padding: 4px 8px; border-radius: 4px;">URGENT</span></p><p style="margin: 0 0 12px;"><strong>From:</strong> Jane Smith</p><div style="background: #ffffff; padding: 15px; border-radius: 6px; border-left: 4px solid #3b82f6; margin-top: 12px;"><p style="margin: 0; color: #334155;">The data room download button isn't working on the Project Acme page.</p></div></div>${ctaBtn('View in Admin Dashboard')}${wrapperEnd}`,
      },
      {
        name: 'Contact Form Response',
        subject: '(Admin-composed subject)',
        recipient: 'User',
        trigger: 'Admin responds to user feedback via email',
        edgeFunction: 'send-contact-response',
        designNotes: 'Branded wrapper, admin-composed reply content',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Response to Your Feedback</h2><p style="color: #475569; line-height: 1.6;">Hi Jane,</p><p style="color: #475569; line-height: 1.6;">Thanks for reaching out. We've looked into the issue you reported and it has been resolved. The data room download should now be working correctly.</p><p style="color: #475569; line-height: 1.6;">Please let us know if you run into any other issues.</p><p style="color: #475569; line-height: 1.6;">Best regards,<br>The SourceCo Team</p>${wrapperEnd}`,
      },
      {
        name: 'Task Notification',
        subject: 'New Task Assigned: [Task Title]',
        recipient: 'Admin',
        trigger: 'Task assigned to admin in deal pipeline',
        edgeFunction: 'send-task-notification-email',
        designNotes: 'Branded wrapper, task details, assignee info, CTA to view task',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">New Task Assigned</h2>${infoBox('#eff6ff', '#3b82f6', 'A new task has been assigned to you.')}<div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;"><p style="margin: 4px 0; font-size: 13px;"><strong>Task:</strong> Follow up with buyer on NDA</p><p style="margin: 4px 0; font-size: 13px;"><strong>Deal:</strong> Project Acme</p><p style="margin: 4px 0; font-size: 13px;"><strong>Due:</strong> April 5, 2026</p></div>${ctaBtn('View Task')}${wrapperEnd}`,
      },
      {
        name: 'Data Recovery Email',
        subject: 'Complete Your Profile - Missing Information',
        recipient: 'User',
        trigger: 'Admin triggers data recovery for incomplete profiles',
        edgeFunction: 'send-data-recovery-email',
        designNotes: 'Branded wrapper, missing info notice, CTA to complete profile',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Complete Your Profile</h2><p style="color: #475569; line-height: 1.6;">Hi there,</p><p style="color: #475569; line-height: 1.6;">We noticed that some important information is missing from your profile. Completing your profile helps us match you with the right opportunities.</p>${ctaBtn('Complete Profile Now')}<p style="color: #94a3b8; font-size: 14px;">Best regards,<br>The SourceCo Team</p>${wrapperEnd}`,
      },
    ],
  },
  {
    name: 'Platform Notifications',
    emails: [
      {
        name: 'User Notification (Generic)',
        subject: '(Dynamic subject)',
        recipient: 'User',
        trigger: 'System sends generic transactional email',
        edgeFunction: 'send-user-notification',
        designNotes: 'Branded wrapper, dynamic type emoji, admin-composed message, optional CTA button',
        previewHtml: `${wrapperStart}<h1 style="font-size: 24px; font-weight: 600; margin: 0 0 10px;">ℹ️ Account Update</h1><p style="color: #475569; line-height: 1.6;">Your account settings have been updated. Please review the changes and contact us if you have any questions.</p>${ctaBtn('View Details')}${wrapperEnd}`,
      },
      {
        name: 'First Request Follow-up',
        subject: 'Quick update on your request.',
        recipient: 'User',
        trigger: 'Follow-up after first connection request',
        edgeFunction: 'send-first-request-followup',
        designNotes: 'Branded wrapper, request status update, CTA to check status',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Quick Update</h2><p style="color: #475569; line-height: 1.6;">Hi there — just a quick update on your connection request. Our team is reviewing it and you'll hear back soon.</p><p style="color: #475569; line-height: 1.6;">In the meantime, feel free to explore more opportunities on the marketplace.</p>${ctaBtn('Browse Marketplace')}${wrapperEnd}`,
      },
      {
        name: 'Feedback Reply Email',
        subject: '(Admin-composed reply)',
        recipient: 'User',
        trigger: 'Admin replies to user feedback via email',
        edgeFunction: 'send-feedback-email',
        designNotes: 'Branded wrapper, admin-composed reply body',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Reply to Your Feedback</h2><p style="color: #475569; line-height: 1.6;">Hi Jane,</p><p style="color: #475569; line-height: 1.6;">Thank you for your feedback. We've reviewed your suggestion and have implemented the changes you recommended.</p><p style="color: #475569; line-height: 1.6;">Best regards,<br>The SourceCo Team</p>${wrapperEnd}`,
      },
      {
        name: 'Transactional Email (Generic)',
        subject: '(Template-defined subject)',
        recipient: 'Dynamic',
        trigger: 'Any registered transactional email template',
        edgeFunction: 'send-transactional-email',
        designNotes: 'React Email template system, supports multiple registered templates with dynamic data',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Transactional Email</h2><p style="color: #475569; line-height: 1.6;">This is the generic transactional email sender that supports any registered React Email template.</p><div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;"><p style="margin: 0; font-size: 13px; color: #64748b;">Templates are registered in the TEMPLATES registry and rendered server-side with dynamic data.</p></div>${wrapperEnd}`,
      },
    ],
  },
  {
    name: 'Broken / Deprecated',
    emails: [
      {
        name: 'Admin Digest',
        subject: '[Type] Admin Digest - SourceCo Marketplace',
        recipient: 'Admin',
        trigger: 'Scheduled digest of admin activity',
        edgeFunction: 'admin-digest',
        status: 'broken',
        statusNote: 'Calls deleted enhanced-email-delivery function — needs migration to sendEmail()',
        designNotes: 'Was: branded wrapper with digest summary table. Currently non-functional.',
        previewHtml: `${wrapperStart}<h2 style="color: #1e293b; margin: 0 0 16px;">Admin Digest</h2><p style="color: #ef4444; font-weight: 600;">⚠️ This email is currently broken.</p><p style="color: #475569; line-height: 1.6;">This function calls the deleted <code>enhanced-email-delivery</code> function and will fail at runtime.</p><div style="background: #fef2f2; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #fecaca;"><p style="margin: 0; font-size: 13px; color: #991b1b;">Needs migration to use sendEmail() from _shared/email-sender.ts</p></div>${wrapperEnd}`,
      },
    ],
  },
];

const SENDER_EMAIL = 'adam.haile@sourcecodeals.com';

function CopyableText({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`${label} copied`);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="inline-flex items-center gap-1 hover:text-foreground transition-colors group" title={`Copy ${label}`}>
      <span>{text}</span>
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />}
    </button>
  );
}

const STATUS_STYLES: Record<EmailStatus, string> = {
  active: '',
  broken: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20',
  deprecated: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20',
};

export function EmailCatalog() {
  const [search, setSearch] = useState('');
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    new Set(EMAIL_CATALOG.map(c => c.name))
  );
  const [previewEmail, setPreviewEmail] = useState<CatalogEmail | null>(null);

  const toggleCategory = (name: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const filteredCatalog = useMemo(() => {
    if (!search.trim()) return EMAIL_CATALOG;
    const q = search.toLowerCase();
    return EMAIL_CATALOG.map(cat => ({
      ...cat,
      emails: cat.emails.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.subject.toLowerCase().includes(q) ||
        e.recipient.toLowerCase().includes(q) ||
        e.trigger.toLowerCase().includes(q) ||
        e.edgeFunction.toLowerCase().includes(q) ||
        (e.variant && e.variant.toLowerCase().includes(q))
      ),
    })).filter(cat => cat.emails.length > 0);
  }, [search]);

  const totalEmails = EMAIL_CATALOG.reduce((sum, c) => sum + c.emails.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{totalEmails} email types across {EMAIL_CATALOG.length} categories</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted rounded-md">
            <span className="text-xs text-muted-foreground">From:</span>
            <CopyableText text={SENDER_EMAIL} label="Sender email" />
          </div>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search emails..."
            className="pl-8 h-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filteredCatalog.map(category => (
        <Collapsible
          key={category.name}
          open={openCategories.has(category.name)}
          onOpenChange={() => toggleCategory(category.name)}
        >
          <Card>
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
                <div className="flex items-center gap-2">
                  {openCategories.has(category.name) ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-semibold text-sm">{category.name}</span>
                  <Badge variant="secondary" className="text-xs">{category.emails.length}</Badge>
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-0 border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Email Name</TableHead>
                      <TableHead className="w-[280px]">Subject Line</TableHead>
                      <TableHead className="w-[90px]">Recipient</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead className="w-[200px]">Edge Function</TableHead>
                      <TableHead className="w-[70px]">Preview</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {category.emails.map(email => (
                      <TableRow key={email.edgeFunction + email.name} className={email.status === 'broken' ? 'bg-red-500/5' : ''}>
                        <TableCell className="font-medium text-sm">
                          <div className="flex items-center gap-1.5">
                            {email.name}
                            {email.status && email.status !== 'active' && (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border ${STATUS_STYLES[email.status]}`}>
                                {email.status}
                              </span>
                            )}
                          </div>
                          {email.variant && (
                            <span className="block text-xs text-muted-foreground mt-0.5 font-normal">{email.variant}</span>
                          )}
                          {email.statusNote && (
                            <span className="block text-xs text-red-600 dark:text-red-400 mt-0.5 font-normal">{email.statusNote}</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <CopyableText text={email.subject} label="Subject line" />
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${RECIPIENT_STYLES[email.recipient]}`}>
                            {email.recipient}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{email.trigger}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{email.edgeFunction}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setPreviewEmail(email)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ))}

      {filteredCatalog.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No emails match "{search}"
        </div>
      )}

      <Dialog open={!!previewEmail} onOpenChange={() => setPreviewEmail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-6">
              <span>{previewEmail?.name}</span>
              {previewEmail && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${RECIPIENT_STYLES[previewEmail.recipient]}`}>
                  {previewEmail.recipient}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {previewEmail && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Subject</span>
                  <p className="font-mono text-xs mt-0.5">{previewEmail.subject}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Edge Function</span>
                  <p className="font-mono text-xs mt-0.5">{previewEmail.edgeFunction}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground text-xs">Design Notes</span>
                  <p className="text-xs mt-0.5">{previewEmail.designNotes}</p>
                </div>
              </div>
              <div className="border rounded-lg overflow-hidden bg-gray-100">
                <div className="bg-muted px-3 py-1.5 border-b flex items-center gap-2">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Email Preview</span>
                </div>
                <iframe
                  srcDoc={previewEmail.previewHtml}
                  className="w-full border-0"
                  style={{ height: '500px' }}
                  sandbox=""
                  title={`Preview of ${previewEmail.name}`}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
