import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  Mail,
  Clock,
  AlertTriangle,
  Eye,
  Edit3,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { sanitizeHtml } from '@/lib/sanitize';

// ─── Types ────────────────────────────────────────────────────────────────────

type SendStatus = 'idle' | 'sending' | 'sent' | 'error';
type EmailCategory = 'onboarding' | 'agreement' | 'transactional' | 'reengagement' | 'engagement';

interface EmailDef {
  id: string;
  num: string;
  title: string;
  category: EmailCategory;
  trigger: string;
  triggerDetail: string;
  file: string;
  subject: string;
  preheader: string;
  bodyHtml: string;
  testPayload: Record<string, unknown>;
  invokeFunction: string;
  status: 'live' | 'new';
}

// ─── Email Definitions ────────────────────────────────────────────────────────

const CAT_COLORS: Record<EmailCategory, string> = {
  onboarding: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  agreement: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  transactional: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  reengagement: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  engagement: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

const EMAILS: EmailDef[] = [
  {
    id: 'e01',
    num: '01',
    title: 'Welcome / Signup Confirmation',
    category: 'onboarding',
    trigger: 'Signup form submitted',
    triggerDetail:
      'Fires immediately when a buyer submits the signup form. Sent by user-journey-notifications with event_type: "welcome". This is the very first email a buyer receives — sets expectations before they verify their email.',
    file: 'supabase/functions/user-journey-notifications/index.ts',
    subject: 'Your application to SourceCo is in.',
    preheader: "Off-market deal flow, reviewed by our team. We'll be in touch shortly.",
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>Your application is in. Our team will review it and you will hear from us by email the moment you are approved, typically within a few hours.</p>
<p>While you wait, verify your email address using the link we sent you. If you have already verified, sit tight. A team member is reviewing your profile now.</p>
<h3 style="color:#0e101a;font-size:15px;margin:20px 0 6px">What happens when you are approved</h3>
<ol style="padding-left:20px;color:#374151">
<li>We send you two documents to sign: an NDA and a Fee Agreement. Both are standard, take about 60 seconds each.</li>
<li>Once signed, you get full access to the deal pipeline, including confidential business details, financials, and direct introductions.</li>
</ol>
<p>The NDA protects the information we share with you. The Fee Agreement only applies if you close a deal sourced through SourceCo. No upfront cost.</p>
<p>Questions? Reply to this email.</p>
<p style="color:#6b7280;margin-top:28px">The SourceCo Team</p></div>`,
    invokeFunction: 'user-journey-notifications',
    testPayload: { event_type: 'welcome', user_name: 'Test Buyer', user_id: 'test-user-id' },
    status: 'live',
  },
  {
    id: 'e03',
    num: '03',
    title: 'Email Verified — Awaiting Approval',
    category: 'onboarding',
    trigger: 'Buyer clicks email verification link',
    triggerDetail:
      'Fires when the buyer clicks the Supabase verification link in their inbox. Sent by user-journey-notifications with event_type: "email_verified". The buyer cannot do anything on the platform yet — this email sets the expectation for how long admin review takes.',
    file: 'supabase/functions/user-journey-notifications/index.ts',
    subject: "Email confirmed — you're in the queue.",
    preheader: "Our team reviews applications same day. We'll email you the moment you're cleared.",
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>Your email is confirmed. Your application is now with our team.</p>
<p>We review applications same day during business hours. You will get an email the moment you are approved, typically within a few hours, never more than one business day.</p>
<h3 style="color:#0e101a;font-size:15px;margin:20px 0 6px">What happens next</h3>
<ol style="padding-left:20px;color:#374151">
<li>Our team reviews and approves your profile.</li>
<li>You sign two documents: an NDA and a Fee Agreement. Both are standard, sent to your email, 60 seconds each.</li>
<li>Full access to the deal pipeline: confidential details, financials, and direct introductions to founders.</li>
</ol>
<p>Nothing for you to do right now. We will email you the moment you are cleared.</p>
<p style="color:#6b7280;margin-top:28px">The SourceCo Team</p></div>`,
    invokeFunction: 'user-journey-notifications',
    testPayload: { event_type: 'email_verified', user_name: 'Test Buyer', user_id: 'test-user-id' },
    status: 'live',
  },
  {
    id: 'e04',
    num: '04',
    title: 'Account Approved — NDA Not Signed',
    category: 'onboarding',
    trigger: 'Admin approves buyer (NDA not yet on file)',
    triggerDetail:
      'Fires when an admin clicks Approve on a buyer application and the buyer has not yet signed their NDA. Sent by send-templated-approval-email with ndaSigned=false. This is the most common approval path — most buyers have not signed the NDA before approval.',
    file: 'supabase/functions/send-templated-approval-email/index.ts',
    subject: 'Welcome to SourceCo — Your account is approved',
    preheader: 'Your account is approved. Browse off-market acquisition opportunities now.',
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>Your account has been approved. You now have access to our curated pipeline of off-market acquisition opportunities.</p>
<p style="margin:20px 0"><a href="#" style="background:#1e293b;color:white;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:500">Browse the Marketplace</a></p>
<p style="font-weight:600;margin:20px 0 6px">Unlock full access</p>
<p>To view full deal details, access data rooms, and request introductions, you will need to sign two standard documents: an NDA and a Fee Agreement. You can request these from your profile or any listing page. It takes about 60 seconds.</p>
<p style="font-weight:600;margin:20px 0 6px">A few things to know</p>
<ul style="padding-left:20px;color:#374151">
<li>Every deal on SourceCo is off-market. You will not find these anywhere else.</li>
<li>We introduce a small number of buyers per deal. When you request an introduction, tell us specifically why you are a strong fit. Generic messages rarely get selected.</li>
<li>The Fee Agreement is success-only. Nothing is owed unless a deal closes. It covers every introduction we make on your behalf.</li>
</ul>
<p>Questions? Reply to this email.</p>
<p style="color:#6b7280;margin-top:28px">The SourceCo Team</p></div>`,
    invokeFunction: 'send-templated-approval-email',
    testPayload: { email: 'test+audit@sourcecodeals.com', firstName: 'Test', ndaSigned: false },
    status: 'live',
  },
  {
    id: 'e05',
    num: '05',
    title: 'Account Approved — NDA Pre-Signed',
    category: 'onboarding',
    trigger: 'Admin approves buyer (NDA already on file)',
    triggerDetail:
      'Fires when an admin approves a buyer who has already signed their NDA — less common, but happens when NDA is signed during the pending-approval wait period. Sent by send-templated-approval-email with ndaSigned=true. Buyer gets immediate full access.',
    file: 'supabase/functions/send-templated-approval-email/index.ts',
    subject: 'Your account is active. Full access is live.',
    preheader: 'Your NDA is on file. Browse deals and request introductions now.',
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>Your account is approved and your NDA is on file. You have full access to the deal pipeline now.</p>
<p style="margin:20px 0"><a href="#" style="background:#1e293b;color:white;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:500">Browse Deals</a></p>
<p style="font-weight:600;margin:20px 0 6px">Before you submit your first request</p>
<ul style="padding-left:20px;color:#374151">
<li>Every deal is off-market. You will not find these anywhere else.</li>
<li>We introduce a small number of buyers per deal. Tell us specifically why you are a strong fit. Generic messages rarely get selected.</li>
<li>Before your first introduction, you will need a Fee Agreement in place. It is success-only. Nothing is owed unless a deal closes. You can request it anytime from any listing page, or reply to this email.</li>
</ul>
<p>Questions? Reply to this email.</p>
<p style="color:#6b7280;margin-top:28px">The SourceCo Team</p></div>`,
    invokeFunction: 'send-templated-approval-email',
    testPayload: { email: 'test+audit@sourcecodeals.com', firstName: 'Test', ndaSigned: true },
    status: 'live',
  },
  {
    id: 'e06',
    num: '06',
    title: 'NDA Request Email',
    category: 'agreement',
    trigger: 'Buyer clicks "Request NDA" button',
    triggerDetail:
      'Fires when a buyer requests their NDA via the marketplace. The request-agreement-email edge function sends the NDA document to the buyer via email from adam.haile@sourcecodeals.com. Admins are notified and can track the request in Document Tracking.',
    file: 'supabase/functions/request-agreement-email/index.ts',
    subject: 'Your NDA (Non-Disclosure Agreement) from SourceCo',
    preheader: 'Review and sign your NDA to access the full SourceCo pipeline.',
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>Thank you for your interest in working with SourceCo. Please find your NDA attached or linked below.</p>
<p><strong>To complete the signing process:</strong></p>
<ol>
<li>Review the document carefully</li>
<li>Sign where indicated</li>
<li>Reply to this email with the signed copy attached</li>
</ol>
<p style="color:#6b7280;margin-top:28px">— The SourceCo Team</p></div>`,
    invokeFunction: 'request-agreement-email',
    testPayload: {
      documentType: 'nda',
    },
    status: 'live',
  },
  {
    id: 'e07',
    num: '07',
    title: 'Fee Agreement Request Email',
    category: 'agreement',
    trigger: 'Buyer clicks "Request Fee Agreement" button',
    triggerDetail:
      'Fires when a buyer requests their Fee Agreement via the marketplace. The request-agreement-email edge function sends the document to the buyer via email from adam.haile@sourcecodeals.com. Admins are notified and can track the request in Document Tracking.',
    file: 'supabase/functions/request-agreement-email/index.ts',
    subject: "Your Fee Agreement from SourceCo",
    preheader: 'Review and sign your Fee Agreement to complete your SourceCo setup.',
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>Thank you for your interest in working with SourceCo. Please find your Fee Agreement attached or linked below.</p>
<p><strong>To complete the signing process:</strong></p>
<ol>
<li>Review the document carefully</li>
<li>Sign where indicated</li>
<li>Reply to this email with the signed copy attached</li>
</ol>
<p style="color:#6b7280;margin-top:28px">— The SourceCo Team</p></div>`,
    invokeFunction: 'request-agreement-email',
    testPayload: {
      documentType: 'fee_agreement',
    },
    status: 'live',
  },
  {
    id: 'e08',
    num: '08',
    title: 'Introduction Request Submitted',
    category: 'transactional',
    trigger: 'Buyer clicks "Request Introduction" on a listing',
    triggerDetail:
      'Fires immediately when a buyer submits an introduction request. Sent by send-connection-notification with type: "user_confirmation". Confirms receipt to the buyer and sets a 24-hour expectation for the review decision. Also redirects them back to the marketplace to keep browsing.',
    file: 'supabase/functions/send-connection-notification/index.ts',
    subject: 'Introduction request received — [Deal Title]',
    preheader: "Our team reviews every request. You'll hear from us within 24 hours.",
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>We've received your introduction request for <strong>[Deal Title]</strong>. Our team reviews every request and selects buyers based on fit — you'll hear from us within 24 hours.</p>
<h3 style="color:#0e101a;font-size:15px;margin:20px 0 6px">What happens if you're selected</h3>
<ul style="padding-left:20px;color:#374151">
<li>We make a direct introduction to the business owner</li>
<li>You'll receive access to deal details and supporting materials</li>
<li>Our team supports through the process</li>
</ul>
<p>In the meantime, keep browsing — new deals are added regularly.</p>
<p style="color:#6b7280;margin-top:28px">— The SourceCo Team</p></div>`,
    invokeFunction: 'send-connection-notification',
    testPayload: {
      type: 'user_confirmation',
      recipientEmail: 'test+audit@sourcecodeals.com',
      recipientName: 'Test Buyer',
      requesterName: 'Test Buyer',
      requesterEmail: 'test+audit@sourcecodeals.com',
      listingTitle: 'Test Deal — Audit',
      listingId: '00000000-0000-0000-0000-000000000000',
    },
    status: 'live',
  },
  {
    id: 'e09',
    num: '09',
    title: 'Introduction Approved',
    category: 'transactional',
    trigger: 'Admin approves a connection request',
    triggerDetail:
      'Fires when an admin approves a buyer\'s introduction request. Sent by send-connection-notification with type: "approval_notification". This is the most important transactional email — it converts a browser into an active deal participant. Creates urgency with exclusivity language.',
    file: 'supabase/functions/send-connection-notification/index.ts',
    subject: "You're in — introduction to [Deal Title] approved.",
    preheader: "Your introduction is confirmed. Here's what happens next.",
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>Your introduction to <strong>[Deal Title]</strong> has been approved.</p>
<p>We're making a direct introduction to the business owner. You'll receive a message from our team with next steps — typically within one business day.</p>
<h3 style="color:#0e101a;font-size:15px;margin:20px 0 6px">What to expect</h3>
<ul style="padding-left:20px;color:#374151">
<li>Our team facilitates the initial introduction</li>
<li>You'll receive access to deal details and supporting materials</li>
<li>Reply to any email or message us in the platform — we support through the process</li>
</ul>
<p>This is an exclusive introduction — we work with a small number of buyers per deal. Move at your own pace, but don't sit on it.</p>
<p style="color:#6b7280;margin-top:28px">— The SourceCo Team</p></div>`,
    invokeFunction: 'send-connection-notification',
    testPayload: {
      type: 'approval_notification',
      recipientEmail: 'test+audit@sourcecodeals.com',
      recipientName: 'Test Buyer',
      requesterName: 'Test Buyer',
      requesterEmail: 'test+audit@sourcecodeals.com',
      listingTitle: 'Test Deal — Audit',
      listingId: '00000000-0000-0000-0000-000000000000',
    },
    status: 'live',
  },
  {
    id: 'e10',
    num: '10',
    title: 'NDA Reminder — Day 3',
    category: 'reengagement',
    trigger: 'Cron: 3 days after approval, NDA still unsigned',
    triggerDetail:
      'Fired by pg_cron daily at 9am UTC. send-nda-reminder checks firm_agreements for buyers whose NDA email was sent 2.5–3.5 days ago and nda_signed = false. Deduplication prevents double-sends — checks pandadoc_webhook_log before sending.',
    file: 'supabase/functions/send-nda-reminder/index.ts',
    subject: 'Your documents are still waiting to be signed.',
    preheader: 'Sign your NDA and Fee Agreement to unlock deal details and introductions.',
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>You were approved for SourceCo three days ago, but your documents are not signed yet. Deal details, data rooms, and introductions are locked until you sign your NDA and Fee Agreement.</p>
<p>You can browse the marketplace now. To unlock full access, sign both documents. Each takes about 60 seconds.</p>
<p style="margin:20px 0"><a href="#" style="background:#1e293b;color:white;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:500">Sign Your Documents</a></p>
<p>If you have questions about either agreement, reply to this email and we will sort it out.</p>
<p style="color:#6b7280;margin-top:28px">The SourceCo Team</p></div>`,
    invokeFunction: 'send-nda-reminder',
    testPayload: {},
    status: 'live',
  },
  {
    id: 'e11',
    num: '11',
    title: 'NDA Reminder — Day 7',
    category: 'reengagement',
    trigger: 'Cron: 7 days after approval, NDA still unsigned',
    triggerDetail:
      'Fired by pg_cron daily at 9am UTC. send-nda-reminder checks for buyers whose NDA email was sent 6.5–7.5 days ago and nda_signed = false. This is the final automated nudge — offers a direct reply and call option for buyers who have genuine questions about the agreement.',
    file: 'supabase/functions/send-nda-reminder/index.ts',
    subject: 'One week in. Your documents are still unsigned.',
    preheader: 'Questions about the NDA or Fee Agreement? Reply and we will sort it out.',
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>It has been a week since you were approved. Your NDA and Fee Agreement are still unsigned, which means deal details and introductions remain locked.</p>
<p>You can browse the marketplace anytime. To unlock full access, sign both documents. If something is holding you back, questions about the agreements, concerns about specific language, or you just have not had the 60 seconds, reply to this email and we will get it sorted.</p>
<p style="margin:20px 0"><a href="#" style="background:#1e293b;color:white;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:500">Sign Your Documents</a></p>
<p style="color:#6b7280;margin-top:28px">The SourceCo Team</p></div>`,
    invokeFunction: 'send-nda-reminder',
    testPayload: {},
    status: 'live',
  },
  {
    id: 'e12',
    num: '12',
    title: 'Fee Agreement Reminder — Day 3',
    category: 'reengagement',
    trigger: 'Cron: 3 days after first request, fee agreement unsigned',
    triggerDetail:
      'Fired by pg_cron daily at 9am UTC. send-fee-agreement-reminder checks firm_agreements for buyers whose fee agreement email was sent 2.5–3.5 days ago and fee_agreement_signed = false. The buyer has already signalled intent by requesting an introduction — this reconnects the action to the deal they wanted.',
    file: 'supabase/functions/send-fee-agreement-reminder/index.ts',
    subject: 'Your introduction request is on hold — one step to continue.',
    preheader: 'One more step and we can make the introduction. Takes 60 seconds.',
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>Your introduction request is on hold — we're waiting on your fee agreement before we can proceed.</p>
<p>The agreement is success-only. Nothing is owed unless a deal closes. Takes about 60 seconds and covers every introduction we make on your behalf.</p>
<p style="margin:20px 0"><a href="#" style="background:#1e293b;color:white;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:500">Sign Fee Agreement</a></p>
<p>If you have questions about the terms before signing, reply to this email.</p>
<p style="color:#6b7280;margin-top:28px">— The SourceCo Team</p></div>`,
    invokeFunction: 'send-fee-agreement-reminder',
    testPayload: {},
    status: 'live',
  },
  {
    id: 'e13',
    num: '13',
    title: 'Fee Agreement Reminder — Day 7',
    category: 'reengagement',
    trigger: 'Cron: 7 days after first request, fee agreement unsigned',
    triggerDetail:
      'Fired by pg_cron daily. send-fee-agreement-reminder targets buyers 6.5–7.5 days after fee email sent with fee_agreement_signed = false. Uses scarcity framing ("small number of buyers per deal") without being aggressive. Offers a call as escape valve for genuine term concerns.',
    file: 'supabase/functions/send-fee-agreement-reminder/index.ts',
    subject: 'A week on — your introduction is still waiting for you.',
    preheader:
      "If something is holding you back on the fee agreement, reply and we'll talk through it.",
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>It's been a week and your introduction request is still on hold pending your fee agreement.</p>
<p>We work with a small number of buyers per deal — if you're still interested, the sooner we can formalise things, the better.</p>
<p style="margin:20px 0"><a href="#" style="background:#1e293b;color:white;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:500">Sign Fee Agreement</a></p>
<p>If you have concerns about the terms, reply to this email — we can work through it.</p>
<p style="color:#6b7280;margin-top:28px">— The SourceCo Team</p></div>`,
    invokeFunction: 'send-fee-agreement-reminder',
    testPayload: {},
    status: 'live',
  },
  {
    id: 'e14',
    num: '14',
    title: 'Deal Match Alert',
    category: 'engagement',
    trigger: 'New listing goes active + matches buyer mandate',
    triggerDetail:
      'Fired by send-deal-alert when a new listing is activated and matches a buyer\'s saved deal alert criteria. This is an ongoing engagement email — not part of onboarding. Scarcity signal ("1–3 buyers per deal") drives faster action. Previously exposed internal alert names in the subject line.',
    file: 'supabase/functions/send-deal-alert/index.ts',
    subject: 'New deal — matches your mandate.',
    preheader: '[Deal teaser] — off-market, sourced by our team.',
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>A new deal just hit the pipeline that matches your mandate.</p>
<p><strong>[Deal Code / Project Name]</strong></p>
<ul style="padding-left:20px;color:#374151">
<li>Sector: [e.g. B2B Services]</li>
<li>Revenue: [e.g. $4.2M]</li>
<li>EBITDA: [e.g. $1.1M]</li>
<li>Location: [e.g. Midwest]</li>
</ul>
<p style="margin:20px 0"><a href="#" style="background:#1e293b;color:white;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:500">View Deal</a></p>
<p>We typically introduce a small number of buyers per deal. If this is a fit, request an introduction soon.</p>
<p style="color:#6b7280;margin-top:28px">— The SourceCo Team</p></div>`,
    invokeFunction: 'send-deal-alert',
    testPayload: {},
    status: 'live',
  },
  {
    id: 'e15',
    num: '15',
    title: 'New Message Notification',
    category: 'transactional',
    trigger: 'Admin sends a message to a buyer in the platform',
    triggerDetail:
      'Fires when any admin sends a message through the deal messaging system. Sent by notify-buyer-new-message. Includes a preview of the message and a link back to the platform. Subject line uses "re:" convention to feel like direct correspondence rather than a platform notification.',
    file: 'supabase/functions/notify-buyer-new-message/index.ts',
    subject: 'New message from SourceCo re: [Deal Title]',
    preheader: 'Log in to view the full message and reply.',
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>You have a new message from the SourceCo team regarding <strong>[Deal Title]</strong>.</p>
<div style="background:#fefce8;border-left:4px solid #ca8a04;padding:14px;border-radius:0 6px 6px 0;margin:16px 0">
<p style="margin:0;font-style:italic;font-size:14px">"[Message preview...]"</p>
</div>
<p style="margin:20px 0"><a href="#" style="background:#1e293b;color:white;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:500">View Message & Reply</a></p>
<p style="color:#6b7280;margin-top:28px">— The SourceCo Team</p></div>`,
    invokeFunction: 'notify-buyer-new-message',
    testPayload: {},
    status: 'live',
  },
  {
    id: 'e16',
    num: '16',
    title: 'Data Room Access Granted',
    category: 'transactional',
    trigger: 'Admin grants buyer access to a data room',
    triggerDetail:
      "Fires when an admin manually grants a buyer access to a deal's data room. Sent by grant-data-room-access. High-intent moment for a serious buyer — they've been selected and now have access to detailed materials. The access link is personal and tracked.",
    file: 'supabase/functions/grant-data-room-access/index.ts',
    subject: 'Data room open — Project [Code]',
    preheader: 'Detailed materials are now available. Your link is below.',
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>You've been granted access to the data room for <strong>Project [Code]</strong>.</p>
<p>The data room contains deal details, supporting documentation, and diligence materials. Your access link is personal — please don't share or forward it. All access is tracked.</p>
<p style="margin:20px 0"><a href="#" style="background:#1e293b;color:white;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:500">Open Data Room</a></p>
<p>Questions about the materials? Reply to this email — it goes directly to our deal team.</p>
<p style="color:#6b7280;margin-top:28px">— SourceCo Deal Team</p></div>`,
    invokeFunction: 'grant-data-room-access',
    testPayload: {},
    status: 'live',
  },
  {
    id: 'e17',
    num: '17',
    title: 'Day 2 Pipeline Digest',
    category: 'engagement',
    trigger: 'Cron: 2 days after approval, no introduction request submitted yet',
    triggerDetail:
      "NEW EMAIL — fired by send-onboarding-day2, runs daily at 9am UTC. Targets buyers approved ~2 days ago who have not yet submitted any introduction request. Skipped if they already have a request (they're active). Deduplication via email_delivery_logs ensures it fires at most once per buyer.",
    file: 'supabase/functions/send-onboarding-day2/index.ts',
    subject: "What's in the pipeline right now.",
    preheader: 'Deals matched to your mandate. Sourced by our team.',
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>You've been in the pipeline for a couple of days. Wanted to give you a quick picture of what's there.</p>
<p>Every deal on SourceCo is off-market — sourced and reviewed by our team before it reaches buyers. When you find a fit, request an introduction. We review every request and select based on match quality.</p>
<p style="margin:20px 0"><a href="#" style="background:#1e293b;color:white;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:500">Browse the Pipeline</a></p>
<h3 style="color:#0e101a;font-size:15px;margin:20px 0 6px">How to get the most out of SourceCo</h3>
<ul style="padding-left:20px;color:#374151">
<li>Be specific in your introduction requests — generic messages rarely get selected</li>
<li>Set up deal alerts so new deals reach you immediately</li>
<li>Want deals sourced for your thesis? <a href="https://www.sourcecodeals.com/private-equity" style="color:#1e293b">Our retained search team</a></li>
</ul>
<p style="color:#6b7280;margin-top:28px">— The SourceCo Team</p></div>`,
    invokeFunction: 'send-onboarding-day2',
    testPayload: {},
    status: 'new',
  },
  {
    id: 'e18',
    num: '18',
    title: 'Day 7 Re-engagement',
    category: 'reengagement',
    trigger: 'Cron: 7 days after approval, no introduction request submitted',
    triggerDetail:
      "NEW EMAIL — fired by send-onboarding-day7, runs daily at 9am UTC. Targets buyers approved ~7 days ago with no introduction request. Addresses three types of cold buyer: didn't find a fit (fresh pipeline link), passive looker (deal alerts), high-intent (retained search). Offers direct reply for anyone with a bad experience.",
    file: 'supabase/functions/send-onboarding-day7/index.ts',
    subject: "Still looking? Here's what other buyers are pursuing.",
    preheader: 'The pipeline has been updated this week. Come take a look.',
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>You've been on the platform for a week. If you haven't found a fit yet, it's worth a fresh look — the pipeline gets updated regularly.</p>
<p style="margin:20px 0"><a href="#" style="background:#1e293b;color:white;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:500">View Updated Pipeline</a></p>
<ul style="padding-left:20px;color:#374151">
<li>Set up a deal alert to hear from us the moment something matches</li>
<li>Want deals sourced for your mandate? <a href="https://www.sourcecodeals.com/private-equity" style="color:#1e293b">Retained search</a></li>
</ul>
<p>If something felt off or you have questions, reply to this email.</p>
<p style="color:#6b7280;margin-top:28px">— The SourceCo Team</p></div>`,
    invokeFunction: 'send-onboarding-day7',
    testPayload: {},
    status: 'new',
  },
  {
    id: 'e19',
    num: '19',
    title: 'First Request Follow-up',
    category: 'transactional',
    trigger: '~24 hours after buyer submits their very first introduction request',
    triggerDetail:
      "NEW EMAIL — fired by send-first-request-followup, runs hourly. Targets buyers whose first-ever connection request was created 20–28 hours ago. Verifies it's their first request (count = 1 check). Fills the post-request silence that causes buyer doubt. Fires at most once per buyer lifetime.",
    file: 'supabase/functions/send-first-request-followup/index.ts',
    subject: 'Quick update on your request.',
    preheader: "Your introduction is being reviewed. Here's where things stand.",
    bodyHtml: `<div style="font-family:sans-serif;max-width:520px;color:#333;line-height:1.6;padding:20px">
<p>Hi [First Name],</p>
<p>Just a quick note on your introduction request for <strong>[Deal Title]</strong>.</p>
<p>Our team is reviewing it now. We look at fit, mandate alignment, and deal timing before making introductions — you'll hear from us with our decision shortly.</p>
<p>In the meantime, it's worth browsing the rest of the pipeline — building a short list of 2–3 deals is how most buyers get the most out of SourceCo.</p>
<p style="margin:20px 0"><a href="#" style="background:#1e293b;color:white;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:500">Browse More Deals</a></p>
<p style="color:#6b7280;margin-top:28px">— The SourceCo Team</p></div>`,
    invokeFunction: 'send-first-request-followup',
    testPayload: {},
    status: 'new',
  },
];

// ─── Single Email Row ─────────────────────────────────────────────────────────

function EmailRow({
  email,
  testEmail,
  onTestEmailChange,
}: {
  email: EmailDef;
  testEmail: string;
  onTestEmailChange: (v: string) => void;
}) {
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
  const [sendError, setSendError] = useState('');
  const [editedSubject, setEditedSubject] = useState(email.subject);
  const [editedBody, setEditedBody] = useState(email.bodyHtml);
  const [activeView, setActiveView] = useState<'preview' | 'edit'>('preview');
  const [showRaw, setShowRaw] = useState(false);

  const isNew = email.status === 'new';
  const catCls = CAT_COLORS[email.category];

  const handleSendTest = async () => {
    if (!testEmail) {
      toast.error('Enter a test email address first');
      return;
    }
    setSendStatus('sending');
    setSendError('');
    try {
      const payload = {
        ...email.testPayload,
        _testMode: true,
        _testEmail: testEmail,
        _overrideSubject: editedSubject,
      };
      const { error } = await supabase.functions.invoke(email.invokeFunction, {
        body: payload,
      });
      if (error) throw new Error(error.message);
      setSendStatus('sent');
      toast.success(`Test sent to ${testEmail}`);
      setTimeout(() => setSendStatus('idle'), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setSendError(msg);
      setSendStatus('error');
      toast.error(`Send failed: ${msg}`);
    }
  };

  return (
    <AccordionItem
      value={email.id}
      className="border border-border/50 rounded-lg mb-3 overflow-hidden"
    >
      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/30">
        <div className="flex items-center gap-3 w-full text-left">
          {/* Number */}
          <span className="text-xs font-mono font-bold text-muted-foreground w-6 shrink-0">
            {email.num}
          </span>

          {/* Category badge */}
          <Badge variant="outline" className={cn('text-xs shrink-0 hidden sm:flex', catCls)}>
            {email.category}
          </Badge>

          {/* Title */}
          <span className="font-medium text-sm flex-1 min-w-0 truncate">{email.title}</span>

          {/* Status badges */}
          <div className="flex items-center gap-2 shrink-0 mr-2">
            {isNew && (
              <Badge
                variant="outline"
                className="text-xs bg-green-500/10 text-green-400 border-green-500/20"
              >
                NEW
              </Badge>
            )}
            <Badge variant="outline" className="text-xs text-muted-foreground">
              <Clock className="h-3 w-3 mr-1" />
              {email.trigger.length > 32 ? email.trigger.slice(0, 32) + '…' : email.trigger}
            </Badge>
          </div>
        </div>
      </AccordionTrigger>

      <AccordionContent className="px-0 pb-0">
        <div className="border-t border-border/50 divide-y divide-border/30">
          {/* Trigger explanation */}
          <div className="px-4 py-3 bg-muted/20">
            <div className="flex items-start gap-2">
              <Zap className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  When this fires
                </p>
                <p className="text-sm text-foreground/80">{email.triggerDetail}</p>
                <p className="text-xs text-muted-foreground mt-1.5 font-mono">{email.file}</p>
              </div>
            </div>
          </div>

          {/* Subject & Preheader */}
          <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Subject line
              </p>
              <p className="text-sm font-medium bg-muted/40 rounded px-2.5 py-1.5">
                {editedSubject}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Preheader
              </p>
              <p className="text-sm text-muted-foreground bg-muted/40 rounded px-2.5 py-1.5">
                {email.preheader}
              </p>
            </div>
          </div>

          {/* Body preview / edit */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Email body
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('h-7 text-xs gap-1', activeView === 'preview' && 'bg-muted')}
                  onClick={() => setActiveView('preview')}
                >
                  <Eye className="h-3 w-3" /> Preview
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('h-7 text-xs gap-1', activeView === 'edit' && 'bg-muted')}
                  onClick={() => setActiveView('edit')}
                >
                  <Edit3 className="h-3 w-3" /> Edit copy
                </Button>
              </div>
            </div>

            {activeView === 'preview' ? (
              <div>
                <div
                  className="border border-border/50 rounded-lg p-4 bg-white text-sm overflow-auto max-h-72"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(editedBody) }}
                />
                <button
                  className="text-xs text-muted-foreground mt-2 hover:text-foreground"
                  onClick={() => setShowRaw(!showRaw)}
                >
                  {showRaw ? 'Hide' : 'Show'} raw HTML
                </button>
                {showRaw && (
                  <pre className="mt-2 text-xs bg-muted rounded p-3 overflow-auto max-h-48 text-muted-foreground">
                    {editedBody}
                  </pre>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Subject line</Label>
                  <Input
                    value={editedSubject}
                    onChange={(e) => setEditedSubject(e.target.value)}
                    className="font-medium text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">HTML body</Label>
                  <Textarea
                    value={editedBody}
                    onChange={(e) => setEditedBody(e.target.value)}
                    className="font-mono text-xs min-h-48 resize-y"
                  />
                  <p className="text-xs text-amber-500 mt-1">
                    Warning: Editing here is for preview only — copy changes to the edge function
                    file to make them permanent.
                  </p>
                </div>
                <div
                  className="border border-border/50 rounded-lg p-4 bg-white text-sm overflow-auto max-h-48"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(editedBody) }}
                />
              </div>
            )}
          </div>

          {/* Send test */}
          <div className="px-4 py-3 bg-muted/10">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-48">
                <Input
                  placeholder="test@example.com"
                  value={testEmail}
                  onChange={(e) => onTestEmailChange(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <Button
                size="sm"
                onClick={handleSendTest}
                disabled={sendStatus === 'sending'}
                className="gap-2 h-8"
              >
                {sendStatus === 'sending' ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…
                  </>
                ) : sendStatus === 'sent' ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Sent
                  </>
                ) : sendStatus === 'error' ? (
                  <>
                    <XCircle className="h-3.5 w-3.5 text-red-400" /> Failed
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" /> Send test
                  </>
                )}
              </Button>
              {sendStatus === 'error' && <span className="text-xs text-red-400">{sendError}</span>}
              {isNew && sendStatus === 'idle' && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Deploy edge function before testing
                </span>
              )}
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EmailTestCentre() {
  const [testEmail, setTestEmail] = useState('');
  const [filterCat, setFilterCat] = useState<EmailCategory | 'all'>('all');

  const filtered = filterCat === 'all' ? EMAILS : EMAILS.filter((e) => e.category === filterCat);

  const newCount = EMAILS.filter((e) => e.status === 'new').length;
  const liveCount = EMAILS.filter((e) => e.status === 'live').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Mail className="h-6 w-6" />
            Email Test Centre
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Every buyer-facing email — trigger context, copy preview, and live test send.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-muted-foreground">{liveCount} live</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-green-400" />
            <span className="text-muted-foreground">{newCount} new</span>
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(
          [
            'onboarding',
            'agreement',
            'transactional',
            'reengagement',
            'engagement',
          ] as EmailCategory[]
        ).map((cat) => {
          const count = EMAILS.filter((e) => e.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setFilterCat(filterCat === cat ? 'all' : cat)}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                filterCat === cat
                  ? 'border-primary bg-primary/10'
                  : 'border-border/50 hover:bg-muted/40',
              )}
            >
              <p className="text-xs text-muted-foreground capitalize">{cat}</p>
              <p className="text-xl font-bold mt-0.5">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Global test email */}
      <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-48">
            <Label className="text-xs text-muted-foreground mb-1 block">
              Default test email — used by all Send test buttons
            </Label>
            <Input
              placeholder="your@email.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="h-8 text-sm max-w-72"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Set once here, used for every test send below. Override per email if needed.
          </p>
        </div>
      </div>

      {/* Filter pills */}
      {filterCat !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Showing:</span>
          <Badge variant="outline" className={cn('capitalize', CAT_COLORS[filterCat])}>
            {filterCat}
          </Badge>
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setFilterCat('all')}
          >
            clear filter
          </button>
        </div>
      )}

      {/* Email list */}
      <Accordion type="multiple" className="space-y-0">
        {filtered.map((email) => (
          <EmailRow
            key={email.id}
            email={email}
            testEmail={testEmail}
            onTestEmailChange={setTestEmail}
          />
        ))}
      </Accordion>

      <p className="text-xs text-muted-foreground border-t border-border/30 pt-4">
        Copy edits made here are preview only. To make permanent changes, update the
        subject/htmlContent variables in the listed edge function file and redeploy.
      </p>
    </div>
  );
}
