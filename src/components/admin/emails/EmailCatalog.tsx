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
const LOGO_URL = 'https://cdn.prod.website-files.com/66851dae8a2c8c3f8cd9c703/66af956d372d85d43f02f481_Group%202%20(4)%20(1).png';
const outerStart = `<div style="background: #FAFAF8; padding: 40px 0;">`;
const outerEnd = `</div>`;
const wrapperStart = `${outerStart}<div style="font-family: 'Montserrat', 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #FFFFFF;">
  <div style="padding: 40px 40px 32px; text-align: center;">
    <img src="${LOGO_URL}" alt="SourceCo" height="36" style="height: 36px; width: auto;" />
  </div>
  <div style="padding: 0 40px 40px; font-size: 15px; line-height: 1.7; color: #1A1A1A;">`;
const wrapperEnd = `</div>
  <div style="padding: 32px 40px; text-align: center;">
    <p style="margin: 0; font-size: 11px; color: #9B9B9B;">&copy; 2026 SourceCo</p>
  </div>
</div>${outerEnd}`;
const ctaBtn = (text: string) => `<div style="text-align: center; margin: 28px 0;"><a href="#" style="background: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">${text}</a></div>`;
const label = (l: string, v: string) => `<p style="margin: 4px 0; font-size: 13px;"><span style="color: #6B6B6B;">${l}:</span> ${v}</p>`;
const detailBox = (content: string) => `<div style="background: #F7F6F3; padding: 20px; margin: 24px 0;">${content}</div>`;
const signoff = `<p style="color: #6B6B6B; margin-top: 28px; font-size: 13px;">The SourceCo Team</p>`;

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
        previewHtml: `${wrapperStart}<p>Click the link below to confirm your email address and activate your account.</p>${ctaBtn('Confirm Email')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Email Verification Resolved',
        subject: 'Your email has been verified',
        recipient: 'User',
        trigger: 'Admin resolves stuck email verification',
        edgeFunction: 'send-verification-success-email',
        designNotes: 'Branded wrapper, welcome message, CTA to explore marketplace',
        previewHtml: `${wrapperStart}<p>Your email has been verified. You now have full access to the SourceCo marketplace.</p>${ctaBtn('Explore Marketplace')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Technical Verification Fix',
        subject: 'Email Verification: Technical Issue Resolved',
        recipient: 'User',
        trigger: 'Admin fixes technical verification issue',
        edgeFunction: 'send-simple-verification-email',
        designNotes: 'Branded wrapper, apology for technical issue, CTA to access account',
        previewHtml: `${wrapperStart}<p>We resolved a technical issue that was preventing your email verification. Your account is now fully active.</p>${ctaBtn('Access Your Account')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Password Reset',
        subject: 'Reset Your Password',
        recipient: 'User',
        trigger: 'User requests password reset',
        edgeFunction: 'password-reset',
        designNotes: 'Branded wrapper, reset instructions, time-limited CTA button',
        previewHtml: `${wrapperStart}<p>We received a request to reset your password. Click the button below to choose a new one.</p>${ctaBtn('Reset Password')}<p style="color: #9B9B9B; font-size: 12px;">This link expires in 1 hour. If you did not request this, ignore this email.</p>${wrapperEnd}`,
      },
      {
        name: 'Onboarding Day 2',
        subject: "What's in the pipeline right now.",
        recipient: 'User',
        trigger: '2 days after signup, no connection request',
        edgeFunction: 'send-onboarding-day2',
        designNotes: 'Branded wrapper, pipeline highlights, CTA to browse deals',
        previewHtml: `${wrapperStart}<p>3 new deals were added this week that match your criteria. Take a look and let us know if anything stands out.</p>${ctaBtn('Browse Deals')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Onboarding Day 7',
        subject: "Still looking? Here is what other buyers are pursuing.",
        recipient: 'User',
        trigger: '7 days after signup re-engagement',
        edgeFunction: 'send-onboarding-day7',
        designNotes: 'Branded wrapper, social proof, active deal highlights, CTA',
        previewHtml: `${wrapperStart}<p>12 active buyers are exploring deals this week. New opportunities are added regularly.</p>${ctaBtn('View Active Deals')}${signoff}${wrapperEnd}`,
      },
    ],
  },
  {
    name: 'Buyer Lifecycle',
    emails: [
      {
        name: 'Marketplace Approval',
        subject: 'Project [Name]: Investment Opportunity',
        recipient: 'Buyer',
        trigger: 'Admin approves buyer from marketplace approval queue',
        edgeFunction: 'approve-marketplace-buyer',
        
        designNotes: 'Branded wrapper, anonymous teaser link, confidentiality notice, CTA to view teaser',
        previewHtml: `${wrapperStart}<p>Dear Jane,</p><p>Thank you for your interest in this investment opportunity. We are pleased to share the Anonymous Teaser for Project Atlas with you.</p><p>Click below to review the investment summary.</p>${ctaBtn('View Investment Teaser')}${detailBox('This is a private, tracked link generated exclusively for you. Do not share or forward this link.')}<p>If this opportunity aligns with your investment criteria, reply to this email to express your interest.</p>${signoff}<p style="font-size: 12px; color: #9B9B9B; margin-top: 16px;">This communication is confidential and intended solely for the named recipient.</p>${wrapperEnd}`,
      },
      {
        name: 'Marketplace Invitation',
        subject: "[Name], you're invited to SourceCo Marketplace",
        recipient: 'Buyer',
        trigger: 'Admin sends marketplace invitation',
        edgeFunction: 'send-marketplace-invitation',
        designNotes: 'Branded wrapper, personalized greeting, marketplace benefits, CTA to join',
        previewHtml: `${wrapperStart}<p>Hi Jane, you have been invited to join the SourceCo Marketplace. It is a curated platform for vetted buyers to access deal flow in their target sectors.</p>${ctaBtn('Accept Invitation')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Buyer Rejection',
        subject: 'Regarding Your Interest in [Company]',
        recipient: 'Buyer',
        trigger: 'Admin rejects buyer for a deal',
        edgeFunction: 'notify-buyer-rejection',
        designNotes: 'Branded wrapper, professional decline message',
        previewHtml: `${wrapperStart}<p>Thank you for your interest in Acme Corp. After review, we have determined this opportunity is not the right fit at this time.</p>${ctaBtn('Browse Other Deals')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Connection Request Confirmation',
        subject: 'Introduction request received: [Deal]',
        recipient: 'User',
        trigger: 'User submits a connection request',
        edgeFunction: 'send-connection-notification',
        variant: 'type: user_confirmation',
        designNotes: 'Branded wrapper, confirmation of request, next steps',
        previewHtml: `${wrapperStart}<p>Your introduction request has been received and is being reviewed. We will follow up once a decision has been made.</p>${ctaBtn('View Your Requests')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Connection Approval',
        subject: "You're in. Introduction to [Deal] approved.",
        recipient: 'Buyer',
        trigger: 'Admin approves connection request',
        edgeFunction: 'send-connection-notification',
        variant: 'type: approval_notification',
        designNotes: 'Branded wrapper, approval notice, CTA to view deal',
        previewHtml: `${wrapperStart}<p>Your introduction request has been approved. You now have access to the full deal details.</p>${ctaBtn('View Deal')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Connection Admin Notification',
        subject: 'New Connection Request: [Deal] / [Buyer]',
        recipient: 'Admin',
        trigger: 'Buyer submits a connection request',
        edgeFunction: 'send-connection-notification',
        variant: 'type: admin_notification',
        designNotes: 'Branded wrapper, buyer and deal details, CTA to review',
        previewHtml: `${wrapperStart}<p>Jane Smith from Apex Capital has requested an introduction.</p>${detailBox(`${label('Deal', 'Project Acme')}${label('Buyer', 'Jane Smith')}${label('Firm', 'Apex Capital')}`)}${ctaBtn('Review Request')}${wrapperEnd}`,
      },
      {
        name: 'Deal Alert',
        subject: 'New deal matching your mandate.',
        recipient: 'Buyer',
        trigger: "New listing matches buyer's alert criteria",
        edgeFunction: 'send-deal-alert',
        designNotes: 'Branded wrapper, deal summary, key metrics, CTA to view listing',
        previewHtml: `${wrapperStart}<p>A new deal has been added that matches your acquisition criteria.</p>${detailBox(`<p style="margin: 0 0 8px;">IT Services Company, Southeast</p>${label('Revenue', '$3.2M')}${label('EBITDA', '$800K')}`)}${ctaBtn('View Deal')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Deal Referral',
        subject: '[Referrer] shared a business opportunity with you',
        recipient: 'User',
        trigger: 'User shares a deal via referral',
        edgeFunction: 'send-deal-referral',
        designNotes: 'Branded wrapper, referrer name, optional personal message, deal card, CTA',
        previewHtml: `${wrapperStart}<p>John Doe shared a business listing with you.</p>${detailBox(`<p style="margin: 0 0 8px;">Managed IT Services Provider</p>${label('Revenue', '$2.1M')}${label('EBITDA', '$450K')}`)}${ctaBtn('View Full Listing')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Templated Approval (NDA Signed)',
        subject: "You're in. Full access is live.",
        recipient: 'Buyer',
        trigger: 'Buyer approved and has already signed NDA',
        edgeFunction: 'send-templated-approval-email',
        variant: 'NDA already signed',
        designNotes: 'Branded wrapper, full access confirmation, CTA to data room',
        previewHtml: `${wrapperStart}<p>You are approved and your NDA is on file. You can now access the complete data room, financials, and all deal materials.</p>${ctaBtn('Enter Data Room')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Templated Approval (NDA Unsigned)',
        subject: "You're approved. One step to full access.",
        recipient: 'Buyer',
        trigger: 'Buyer approved but NDA not yet signed',
        edgeFunction: 'send-templated-approval-email',
        variant: 'NDA not yet signed',
        designNotes: 'Branded wrapper, approval with NDA requirement, CTA to sign NDA',
        previewHtml: `${wrapperStart}<p>You have been approved. Sign the NDA to unlock full access to the data room and financials.</p>${ctaBtn('Sign NDA Now')}${signoff}${wrapperEnd}`,
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
        designNotes: 'Branded wrapper, document request, CTA to review and sign',
        previewHtml: `${wrapperStart}<p>To proceed with this opportunity, please review and sign the Non-Disclosure Agreement.</p>${detailBox(`${label('Document', 'Non-Disclosure Agreement')}${label('Deal', 'Project Acme')}`)}${ctaBtn('Review & Sign NDA')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Fee Agreement Request',
        subject: 'Your Fee Agreement from SourceCo',
        recipient: 'Buyer',
        trigger: 'Buyer needs to sign fee agreement',
        edgeFunction: 'request-agreement-email',
        variant: 'docLabel = Fee Agreement',
        designNotes: 'Branded wrapper, fee agreement details, CTA to review and sign',
        previewHtml: `${wrapperStart}<p>To proceed with this opportunity, please review and sign the Fee Agreement.</p>${detailBox(`${label('Document', 'Fee Agreement')}${label('Deal', 'Project Acme')}`)}${ctaBtn('Review & Sign Agreement')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Data Room Access Granted',
        subject: 'Data room access granted: Project [Name]',
        recipient: 'Buyer',
        trigger: 'Admin grants data room access',
        edgeFunction: 'grant-data-room-access',
        designNotes: 'Branded wrapper, access confirmation, CTA to enter data room',
        previewHtml: `${wrapperStart}<p>You now have access to the data room for Project Acme. It contains financial documents, operational data, and other confidential materials for your review.</p>${ctaBtn('Enter Data Room')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Agreement Confirmed',
        subject: 'Your [NDA/Fee Agreement] has been confirmed',
        recipient: 'Buyer',
        trigger: 'Admin marks agreement status as signed',
        edgeFunction: 'notify-agreement-confirmed',
        designNotes: 'Branded wrapper, confirmation message, CTA to browse marketplace',
        previewHtml: `${wrapperStart}<p>Jane,</p><p>Your Fee Agreement for Apex Capital has been recorded and confirmed. You now have full access to browse deals and request introductions on the SourceCo marketplace.</p>${ctaBtn('Browse Deals')}${signoff}${wrapperEnd}`,
      },
    ],
  },
  {
    name: 'Deal & Owner Notifications',
    emails: [
      {
        name: 'New Deal Owner Assigned',
        subject: 'New Deal Assigned: [Deal]',
        recipient: 'Admin',
        trigger: 'Admin assigns deal to an owner',
        edgeFunction: 'notify-new-deal-owner',
        designNotes: 'Branded wrapper, deal info, responsibilities, CTA to view deal',
        previewHtml: `${wrapperStart}<p>You have been assigned as the owner of Project Acme by Sarah.</p>${detailBox(`${label('Company', 'Acme Services')}${label('Buyer', 'Jane Smith / jane@apex.com')}<p style="margin: 16px 0 4px; font-size: 13px; color: #6B6B6B;">Next steps:</p><p style="margin: 4px 0; font-size: 13px;">Review deal details and buyer info. Follow up with the buyer promptly. Keep the deal status updated.</p>`)}${ctaBtn('View Deal Details')}${wrapperEnd}`,
      },
      {
        name: 'Deal Reassignment',
        subject: 'Your deal "[Deal]" has been reassigned',
        recipient: 'Admin',
        trigger: 'Deal is reassigned to a different owner or unassigned',
        edgeFunction: 'notify-deal-reassignment',
        designNotes: 'Branded wrapper, deal info with previous/new owner, CTA to pipeline',
        previewHtml: `${wrapperStart}<p>Your deal has been reassigned to Sarah Johnson.</p>${detailBox(`${label('Deal', 'Project Acme')}${label('Previous Owner', 'Adam Haile')}${label('New Owner', 'Sarah Johnson')}`)}${ctaBtn('Open Deal in Pipeline')}${wrapperEnd}`,
      },
      {
        name: 'Deal Owner Change',
        subject: 'Deal Modified: [Company]',
        recipient: 'Owner',
        trigger: 'Deal details or ownership modified',
        edgeFunction: 'notify-deal-owner-change',
        designNotes: 'Branded wrapper, modification summary, CTA to view changes',
        previewHtml: `${wrapperStart}<p>Changes have been made to the deal for Acme Corp.</p>${detailBox(`${label('Company', 'Acme Corp')}${label('Modified by', 'Sarah Johnson')}`)}${ctaBtn('View Deal')}${wrapperEnd}`,
      },
      {
        name: 'Owner Inquiry Notification',
        subject: 'New Owner Inquiry: [Company] ([Revenue])',
        recipient: 'Admin',
        trigger: 'Owner inquiry submitted about a deal',
        edgeFunction: 'send-owner-inquiry-notification',
        designNotes: 'Branded wrapper, inquiry details, CTA to review',
        previewHtml: `${wrapperStart}<p>A new owner inquiry has been submitted.</p>${detailBox(`${label('Company', 'Acme Services LLC')}${label('Revenue', '$2M - $5M')}${label('Contact', 'John Owner')}`)}${ctaBtn('Review Inquiry')}${wrapperEnd}`,
      },
      {
        name: 'Owner Intro Notification',
        subject: 'Owner Intro Requested: [Buyer] to [Company]',
        recipient: 'Admin',
        trigger: 'Buyer is introduced to deal owner',
        edgeFunction: 'send-owner-intro-notification',
        designNotes: 'Branded wrapper, intro details, CTA to view intro',
        previewHtml: `${wrapperStart}<p>A buyer introduction has been requested.</p>${detailBox(`${label('Buyer', 'Jane Smith (Apex Capital)')}${label('Company', 'Acme Services LLC')}`)}${ctaBtn('View Introduction')}${wrapperEnd}`,
      },
      {
        name: 'Memo Email',
        subject: '(Admin-composed subject)',
        recipient: 'Dynamic',
        trigger: 'Admin sends a memo/CIM to a recipient',
        edgeFunction: 'send-memo-email',
        designNotes: 'Branded wrapper, admin-composed body, attachment links',
        previewHtml: `${wrapperStart}<p>Please find the attached Confidential Information Memorandum for your review.</p>${detailBox(`<p style="margin: 0; font-size: 13px;"><a href="#" style="color: #1A1A1A; text-decoration: underline;">Project_Acme_CIM.pdf</a></p>`)}<p style="font-size: 13px; color: #6B6B6B;">This document is strictly confidential. Do not distribute without authorization.</p>${wrapperEnd}`,
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
        previewHtml: `${wrapperStart}<p>You have a new message regarding Project Acme.</p>${detailBox(`<p style="margin: 0; font-size: 14px;">Hi Jane, thanks for your interest. I would like to schedule a call to discuss the opportunity further...</p>`)}<p style="font-size: 13px; color: #6B6B6B;">Log in to read the full message and reply.</p>${ctaBtn('View Full Message')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Admin New Message',
        subject: 'New Buyer Message: [Deal] / [Buyer]',
        recipient: 'Admin',
        trigger: 'Buyer sends message via message center',
        edgeFunction: 'notify-admin-new-message',
        designNotes: 'Branded wrapper, buyer info, message preview, CTA to reply',
        previewHtml: `${wrapperStart}<p>Jane Smith sent a new message about Project Acme.</p>${detailBox(`<p style="margin: 0 0 8px; font-size: 12px; color: #6B6B6B;">From: Jane Smith / Apex Capital</p><p style="margin: 0; font-size: 14px;">I am very interested in this opportunity. Could we schedule a call this week?</p>`)}${ctaBtn('Reply in Admin')}${wrapperEnd}`,
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
        designNotes: 'Branded wrapper, application received, next steps',
        previewHtml: `${wrapperStart}<p>Your application has been received. We will review it and follow up once a decision has been made. Make sure your profile is complete to speed up the process.</p>${ctaBtn('Complete Your Profile')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Journey: Email Verified',
        subject: "Email confirmed. You are in the queue.",
        recipient: 'User',
        trigger: 'User verifies their email (journey event)',
        edgeFunction: 'user-journey-notifications',
        variant: 'event_type: email_verified',
        designNotes: 'Branded wrapper, email confirmed, queue status',
        previewHtml: `${wrapperStart}<p>Your email is confirmed. You are in the review queue. We will notify you once your account has been approved.</p>${signoff}${wrapperEnd}`,
      },
      {
        name: 'Journey: Profile Approved',
        subject: 'Account Approved. Welcome to SourceCo.',
        recipient: 'User',
        trigger: 'Admin approves user profile (journey event)',
        edgeFunction: 'user-journey-notifications',
        variant: 'event_type: profile_approved',
        designNotes: 'Branded wrapper, approval confirmation, CTA to browse marketplace',
        previewHtml: `${wrapperStart}<p>Your account has been approved. You now have full access to the SourceCo marketplace.</p>${ctaBtn('Browse Marketplace')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Journey: Admin New User',
        subject: 'New user signup: [Name]',
        recipient: 'Admin',
        trigger: 'New user signs up (admin notification)',
        edgeFunction: 'user-journey-notifications',
        variant: 'event_type: admin_new_user',
        designNotes: 'Branded wrapper, new user details, CTA to review',
        previewHtml: `${wrapperStart}<p>A new user has signed up and needs review.</p>${detailBox(`${label('Name', 'Jane Smith')}${label('Email', 'jane@apex.com')}${label('Company', 'Apex Capital')}${label('Type', 'Private Equity')}`)}${ctaBtn('Review User')}${wrapperEnd}`,
      },
    ],
  },
  {
    name: 'Admin & System',
    emails: [
      {
        name: 'Enhanced Admin Notification',
        subject: '[Deal]: [Action Type] Notification',
        recipient: 'Admin',
        trigger: 'Various admin-level events (deal updates, buyer actions, etc.)',
        edgeFunction: 'send-enhanced-admin-notification',
        designNotes: 'Branded wrapper, action summary, context details, CTA to admin panel',
        previewHtml: `${wrapperStart}<p>A buyer has submitted a new connection request for Project Acme.</p>${detailBox(`${label('Deal', 'Project Acme')}${label('Buyer', 'Jane Smith')}${label('Action', 'Connection Request')}`)}${ctaBtn('View in Admin Panel')}${wrapperEnd}`,
      },
      {
        name: 'Feedback Notification',
        subject: 'New Feedback: [Category]',
        recipient: 'Admin',
        trigger: 'User submits feedback',
        edgeFunction: 'send-feedback-notification',
        designNotes: 'Branded wrapper, feedback details, CTA to admin dashboard',
        previewHtml: `${wrapperStart}<p>A user has submitted feedback.</p>${detailBox(`${label('Category', 'Bug Report')}${label('Priority', 'Urgent')}${label('From', 'Jane Smith')}<p style="margin: 12px 0 0; font-size: 13px; color: #1A1A1A;">The data room download button is not working on the Project Acme page.</p>`)}${ctaBtn('View in Admin Dashboard')}${wrapperEnd}`,
      },
      {
        name: 'Contact Form Response',
        subject: '(Admin-composed subject)',
        recipient: 'User',
        trigger: 'Admin responds to user feedback via email',
        edgeFunction: 'send-contact-response',
        designNotes: 'Branded wrapper, admin-composed reply',
        previewHtml: `${wrapperStart}<p>Hi Jane,</p><p>Thanks for reaching out. We looked into the issue you reported and it has been resolved. The data room download should now be working correctly.</p><p>Let us know if you run into any other issues.</p>${signoff}${wrapperEnd}`,
      },
      {
        name: 'Task Notification',
        subject: 'New Task Assigned: [Task Title]',
        recipient: 'Admin',
        trigger: 'Task assigned to admin in deal pipeline',
        edgeFunction: 'send-task-notification-email',
        designNotes: 'Branded wrapper, task details, CTA to view task',
        previewHtml: `${wrapperStart}<p>A new task has been assigned to you.</p>${detailBox(`${label('Task', 'Follow up with buyer on NDA')}${label('Deal', 'Project Acme')}${label('Due', 'April 5, 2026')}`)}${ctaBtn('View Task')}${wrapperEnd}`,
      },
      {
        name: 'Data Recovery Email',
        subject: 'Complete Your Profile: Missing Information',
        recipient: 'User',
        trigger: 'Admin triggers data recovery for incomplete profiles',
        edgeFunction: 'send-data-recovery-email',
        designNotes: 'Branded wrapper, missing info notice, CTA to complete profile',
        previewHtml: `${wrapperStart}<p>Some important information is missing from your profile. Completing it helps us match you with the right opportunities.</p>${ctaBtn('Complete Profile Now')}${signoff}${wrapperEnd}`,
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
        designNotes: 'Branded wrapper, admin-composed message, optional CTA',
        previewHtml: `${wrapperStart}<p>Your account settings have been updated. Review the changes and contact us if you have questions.</p>${ctaBtn('View Details')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'First Request Follow-up',
        subject: 'Quick update on your request.',
        recipient: 'User',
        trigger: 'Follow-up after first connection request',
        edgeFunction: 'send-first-request-followup',
        designNotes: 'Branded wrapper, request status update, CTA to check status',
        previewHtml: `${wrapperStart}<p>Your connection request is being reviewed. You will hear back soon.</p>${ctaBtn('Browse Marketplace')}${signoff}${wrapperEnd}`,
      },
      {
        name: 'Feedback Reply Email',
        subject: '(Admin-composed reply)',
        recipient: 'User',
        trigger: 'Admin replies to user feedback via email',
        edgeFunction: 'send-feedback-email',
        designNotes: 'Branded wrapper, admin-composed reply body',
        previewHtml: `${wrapperStart}<p>Hi Jane,</p><p>Thank you for your feedback. We reviewed your suggestion and have implemented the changes.</p>${signoff}${wrapperEnd}`,
      },
      {
        name: 'Transactional Email (Generic)',
        subject: '(Template-defined subject)',
        recipient: 'Dynamic',
        trigger: 'Any registered transactional email template',
        edgeFunction: 'send-transactional-email',
        designNotes: 'React Email template system, supports multiple registered templates',
        previewHtml: `${wrapperStart}<p>This is the generic transactional email sender. It supports any registered React Email template, rendered server-side with dynamic data.</p>${signoff}${wrapperEnd}`,
      },
    ],
  },
  {
    name: 'Broken / Deprecated',
    emails: [
      {
        name: 'Admin Digest',
        subject: '[Type] Admin Digest: SourceCo Marketplace',
        recipient: 'Admin',
        trigger: 'Scheduled digest of admin activity',
        edgeFunction: 'admin-digest',
        status: 'broken',
        statusNote: 'Calls deleted enhanced-email-delivery function. Needs migration to sendEmail().',
        designNotes: 'Currently non-functional.',
        previewHtml: `${wrapperStart}<p>This email is currently non-functional. The function calls a deleted dependency and will fail at runtime.</p>${detailBox(`<p style="margin: 0; font-size: 13px; color: #6B6B6B;">Needs migration to use sendEmail() from _shared/email-sender.ts</p>`)}${wrapperEnd}`,
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
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          <CopyableText text={email.edgeFunction} label="Function name" />
                        </TableCell>
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
              {previewEmail.status === 'broken' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  This email is currently broken. {previewEmail.statusNote}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Subject</span>
                  <p className="font-mono text-xs mt-0.5"><CopyableText text={previewEmail.subject} label="Subject" /></p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Edge Function</span>
                  <p className="font-mono text-xs mt-0.5"><CopyableText text={previewEmail.edgeFunction} label="Function" /></p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">From</span>
                  <p className="font-mono text-xs mt-0.5">{SENDER_EMAIL}</p>
                </div>
                <div>
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
