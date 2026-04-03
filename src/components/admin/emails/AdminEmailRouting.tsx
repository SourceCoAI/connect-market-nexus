// Admin email routing data is maintained inline below (derived from ADMIN_PROFILES + edge function audit)
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Inbox, Users, Mail, Settings, Send, AlertTriangle } from 'lucide-react';

interface EmailEntry {
  emailType: string;
  edgeFunction: string;
  recipient: string;
  senderName: string;
  replyTo: string;
}

type Category =
  | 'Admin Notifications'
  | 'Buyer Lifecycle'
  | 'Messaging'
  | 'Agreements'
  | 'Deal Flow'
  | 'Owner-Facing'
  | 'System'
  | 'Deprecated';

const ALL_EMAILS: Record<Category, EmailEntry[]> = {
  'Admin Notifications': [
    { emailType: 'New User Registration', edgeFunction: 'enhanced-admin-notification', recipient: 'ADMIN_NOTIFICATION_EMAIL env var', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'Listing Saved', edgeFunction: 'enhanced-admin-notification', recipient: 'ADMIN_NOTIFICATION_EMAIL env var', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'Connection Request (admin copy)', edgeFunction: 'send-connection-notification', recipient: 'All admins (user_roles query)', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'Feedback Submitted', edgeFunction: 'send-feedback-notification', recipient: 'All admins (profiles.is_admin)', senderName: 'SourceCo', replyTo: 'adam.haile@sourcecodeals.com' },
    { emailType: 'Admin Digest', edgeFunction: 'admin-digest', recipient: 'ADMIN_NOTIFICATION_EMAILS env var', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'Task Assigned', edgeFunction: 'send-task-notification-email', recipient: 'Assigned admin (assignee_email)', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'Deal Owner Change', edgeFunction: 'notify-deal-owner-change', recipient: 'Previous deal owner', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'Owner Inquiry', edgeFunction: 'send-owner-inquiry-notification', recipient: 'OWNER_INQUIRY_RECIPIENT_EMAIL env var', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
  ],
  'Messaging': [
    { emailType: 'New Buyer Message', edgeFunction: 'notify-support-inbox', recipient: 'support@sourcecodeals.com', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'Admin Reply Copy', edgeFunction: 'notify-support-inbox', recipient: 'support@sourcecodeals.com', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'Document Request', edgeFunction: 'notify-support-inbox', recipient: 'support@sourcecodeals.com', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'Admin Reply to Buyer', edgeFunction: 'notify-buyer-new-message', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
  ],
  'Buyer Lifecycle': [
    { emailType: 'Welcome Email', edgeFunction: 'user-journey-notifications', recipient: 'Individual buyer', senderName: 'Adam Haile - SourceCo', replyTo: 'adam.haile@sourcecodeals.com' },
    { emailType: 'Email Verified', edgeFunction: 'user-journey-notifications', recipient: 'Individual buyer', senderName: 'Adam Haile - SourceCo', replyTo: 'adam.haile@sourcecodeals.com' },
    { emailType: 'Profile Approved', edgeFunction: 'user-journey-notifications', recipient: 'Individual buyer', senderName: 'Adam Haile - SourceCo', replyTo: 'adam.haile@sourcecodeals.com' },
    { emailType: 'Profile Rejected', edgeFunction: 'user-journey-notifications', recipient: 'Individual buyer', senderName: 'Adam Haile - SourceCo', replyTo: 'adam.haile@sourcecodeals.com' },
    { emailType: 'Verification Success', edgeFunction: 'send-verification-success-email', recipient: 'Individual buyer', senderName: 'Adam Haile', replyTo: 'adam.haile@sourcecodeals.com' },
    { emailType: 'Simple Verification', edgeFunction: 'send-simple-verification-email', recipient: 'Individual buyer', senderName: 'Adam Haile', replyTo: 'adam.haile@sourcecodeals.com' },
    { emailType: 'Password Reset', edgeFunction: 'password-reset', recipient: 'Individual user', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'Onboarding Day 2', edgeFunction: 'send-onboarding-day2', recipient: 'Individual buyer', senderName: 'Adam Haile - SourceCo', replyTo: 'adam.haile@sourcecodeals.com' },
    { emailType: 'Onboarding Day 7', edgeFunction: 'send-onboarding-day7', recipient: 'Individual buyer', senderName: 'Adam Haile - SourceCo', replyTo: 'adam.haile@sourcecodeals.com' },
    { emailType: 'Marketplace Invitation', edgeFunction: 'send-marketplace-invitation', recipient: 'Invited buyer', senderName: 'SourceCo Marketplace', replyTo: 'adam.haile@sourcecodeals.com' },
    { emailType: 'Marketplace Buyer Approved', edgeFunction: 'approve-marketplace-buyer', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'First Request Followup', edgeFunction: 'send-first-request-followup', recipient: 'Individual buyer', senderName: 'Adam Haile - SourceCo', replyTo: 'adam.haile@sourcecodeals.com' },
    { emailType: 'Feedback Response', edgeFunction: 'send-feedback-email', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'User Notification', edgeFunction: 'send-user-notification', recipient: 'Individual user', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'Contact Response', edgeFunction: 'send-contact-response', recipient: 'Individual user', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'Templated Approval', edgeFunction: 'send-templated-approval-email', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'Data Recovery', edgeFunction: 'send-data-recovery-email', recipient: 'Individual user', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
  ],
  'Agreements': [
    { emailType: 'Agreement Sent (NDA/Fee)', edgeFunction: 'request-agreement-email', recipient: 'Individual buyer', senderName: 'Adam Haile - SourceCo', replyTo: 'adam.haile@sourcecodeals.com' },
    { emailType: 'NDA Confirmed', edgeFunction: 'notify-agreement-confirmed', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'Fee Agreement Confirmed', edgeFunction: 'notify-agreement-confirmed', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
  ],
  'Deal Flow': [
    { emailType: 'Connection User Confirmation', edgeFunction: 'send-connection-notification', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'Connection Approved', edgeFunction: 'send-connection-notification', recipient: 'Individual buyer', senderName: 'Adam Haile - SourceCo', replyTo: 'adam.haile@sourcecodeals.com' },
    { emailType: 'Deal Alert', edgeFunction: 'send-deal-alert', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
    { emailType: 'Deal Memo', edgeFunction: 'send-memo-email', recipient: 'Individual buyer', senderName: 'Calling admin profile', replyTo: 'Calling admin email' },
    { emailType: 'Deal Referral', edgeFunction: 'send-deal-referral', recipient: 'Referred buyer', senderName: 'SourceCo Marketplace', replyTo: 'adam.haile@sourcecodeals.com' },
    { emailType: 'Data Room Access Granted', edgeFunction: 'grant-data-room-access', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
  ],
  'Owner-Facing': [
    { emailType: 'Owner Intro Notification', edgeFunction: 'send-owner-intro-notification', recipient: 'Listing primary owner', senderName: 'Adam Haile - SourceCo', replyTo: 'adam.haile@sourcecodeals.com' },
  ],
  'System': [],
  'Deprecated': [
    { emailType: 'Admin New Message (deprecated)', edgeFunction: 'notify-admin-new-message', recipient: 'All admins (no longer called)', senderName: 'SourceCo', replyTo: 'support@sourcecodeals.com' },
  ],
};

const CATEGORY_ICONS: Record<Category, string> = {
  'Admin Notifications': '🔔',
  'Messaging': '💬',
  'Buyer Lifecycle': '👤',
  'Agreements': '📝',
  'Deal Flow': '🤝',
  'Owner-Facing': '🏢',
  'System': '⚙️',
  'Deprecated': '🚫',
};

interface AdminReceives {
  name: string;
  email: string;
  title: string;
  receives: string[];
  sends: string[];
  sharedInbox: boolean;
}

const ADMIN_ROUTING: AdminReceives[] = [
  {
    name: 'Adam Haile',
    email: 'adam.haile@sourcecodeals.com',
    title: 'Founder & CEO',
    receives: [
      'Feedback Submitted (all admins loop)',
      'Connection Request admin copy (all admins loop)',
      'Admin Digest (ADMIN_NOTIFICATION_EMAILS)',
      'Owner Inquiry (OWNER_INQUIRY_RECIPIENT_EMAIL fallback)',
      'New User Registration (ADMIN_NOTIFICATION_EMAIL fallback)',
      'Listing Saved (ADMIN_NOTIFICATION_EMAIL fallback)',
    ],
    sends: [
      'Deal Memo (as sender profile)',
      'All emails (FROM address: adam.haile@sourcecodeals.com)',
    ],
    sharedInbox: true,
  },
  {
    name: 'Tomos Mughan',
    email: 'tomos.mughan@sourcecodeals.com',
    title: 'CEO',
    receives: [
      'Feedback Submitted (all admins loop)',
      'Connection Request admin copy (all admins loop)',
    ],
    sends: [
      'Deal Memo (when sent by this admin)',
    ],
    sharedInbox: true,
  },
  {
    name: 'Bill Martin',
    email: 'bill.martin@sourcecodeals.com',
    title: 'Principal & SVP - Growth',
    receives: [
      'Feedback Submitted (all admins loop)',
      'Connection Request admin copy (all admins loop)',
    ],
    sends: [
      'Deal Memo (when sent by this admin)',
    ],
    sharedInbox: true,
  },
  {
    name: 'Kyle Collins',
    email: 'kyle.collins@sourcecodeals.com',
    title: 'Team Member',
    receives: [
      'Feedback Submitted (all admins loop)',
      'Connection Request admin copy (all admins loop)',
    ],
    sends: [],
    sharedInbox: true,
  },
  {
    name: 'Daniel Kobayashi',
    email: 'daniel.kobayashi@sourcecodeals.com',
    title: 'Team Member',
    receives: [
      'Feedback Submitted (all admins loop)',
      'Connection Request admin copy (all admins loop)',
    ],
    sends: [],
    sharedInbox: true,
  },
  {
    name: 'Oz De La Luna',
    email: 'oz.delaluna@sourcecodeals.com',
    title: 'Team Member',
    receives: [
      'Feedback Submitted (all admins loop)',
      'Connection Request admin copy (all admins loop)',
    ],
    sends: [],
    sharedInbox: true,
  },
];

const ENV_VARS = [
  { name: 'ADMIN_NOTIFICATION_EMAIL', description: 'Single admin email for registration and listing-saved alerts', fallback: 'admin@sourcecodeals.com', usedBy: 'enhanced-admin-notification' },
  { name: 'ADMIN_NOTIFICATION_EMAILS', description: 'Comma-separated list for admin digest recipients', fallback: 'adam.haile@sourcecodeals.com', usedBy: 'admin-digest' },
  { name: 'OWNER_INQUIRY_RECIPIENT_EMAIL', description: 'Receives owner inquiry form submissions from landing page', fallback: 'adam.haile@sourcecodeals.com', usedBy: 'send-owner-inquiry-notification' },
  { name: 'ADMIN_EMAIL', description: 'General admin email fallback', fallback: 'adam.haile@sourcecodeals.com', usedBy: 'Various' },
  { name: 'SENDER_EMAIL', description: 'FROM address for all outbound emails', fallback: 'adam.haile@sourcecodeals.com', usedBy: 'email-sender.ts' },
  { name: 'NOREPLY_EMAIL', description: 'No-reply sender for system emails', fallback: 'noreply@sourcecodeals.com', usedBy: 'Various' },
];

const SHARED_INBOX_EMAIL = 'support@sourcecodeals.com';

export function AdminEmailRouting() {
  const categories = Object.entries(ALL_EMAILS).filter(([, entries]) => entries.length > 0) as [Category, EmailEntry[]][];
  const totalEmails = categories.reduce((sum, [, entries]) => sum + entries.length, 0);

  return (
    <div className="space-y-6">
      {/* Section 1: Master Email Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">All Platform Emails</CardTitle>
            <Badge variant="secondary" className="ml-auto">{totalEmails} email types</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Complete map of every email the platform sends, grouped by category</p>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {categories.map(([category, entries]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-2">
                <span>{CATEGORY_ICONS[category]}</span>
                <h4 className="font-semibold text-sm">{category}</h4>
                <Badge variant="outline" className="text-xs">{entries.length}</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Email Type</TableHead>
                    <TableHead className="w-[220px]">Edge Function</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead className="w-[180px]">Sender Name</TableHead>
                    <TableHead className="w-[200px]">Reply-To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.emailType} className={category === 'Deprecated' ? 'opacity-50' : ''}>
                      <TableCell className="font-medium text-sm">
                        {e.emailType}
                        {category === 'Deprecated' && (
                          <Badge variant="destructive" className="ml-2 text-[10px]">Deprecated</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{e.edgeFunction}</code>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.recipient}</TableCell>
                      <TableCell className="text-sm">{e.senderName}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{e.replyTo}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Section 2: Per-Admin Routing */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Per-Admin Routing</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">What each admin receives and sends</p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ADMIN_ROUTING.map((admin) => (
              <div key={admin.email} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-sm">{admin.name}</h4>
                    <p className="text-xs text-muted-foreground">{admin.title}</p>
                    <p className="text-xs font-mono mt-0.5">{admin.email}</p>
                  </div>
                  {admin.sharedInbox && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      <Inbox className="h-3 w-3 mr-1" />
                      Shared Inbox
                    </Badge>
                  )}
                </div>

                {admin.receives.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Receives:</p>
                    <ul className="space-y-0.5">
                      {admin.receives.map((r) => (
                        <li key={r} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-green-500 mt-0.5 shrink-0">&#8226;</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {admin.sends.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Sends:</p>
                    <ul className="space-y-0.5">
                      {admin.sends.map((s) => (
                        <li key={s} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <Send className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Shared Inbox */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Shared Inbox</CardTitle>
            <Badge variant="secondary" className="ml-auto font-mono text-xs">{SHARED_INBOX_EMAIL}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">All admins monitor this shared inbox. Every message, reply, and document request triggers an email here.</p>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Notification</TableHead>
                <TableHead>Edge Function</TableHead>
                <TableHead>Trigger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">New Buyer Message</TableCell>
                <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">notify-support-inbox</code></TableCell>
                <TableCell className="text-sm text-muted-foreground">Buyer sends a message in general chat or deal thread</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Admin Reply Copy</TableCell>
                <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">notify-support-inbox</code></TableCell>
                <TableCell className="text-sm text-muted-foreground">Admin replies to a buyer message</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Document Request</TableCell>
                <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">notify-support-inbox</code></TableCell>
                <TableCell className="text-sm text-muted-foreground">Buyer requests NDA or Fee Agreement signing</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section 4: Environment Variables */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Environment Variables</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">These env vars control email routing. Set in Supabase Edge Function secrets.</p>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variable</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Fallback</TableHead>
                <TableHead>Used By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ENV_VARS.map((v) => (
                <TableRow key={v.name}>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded font-semibold">{v.name}</code></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{v.description}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{v.fallback}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{v.usedBy}</code></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-3 p-3 bg-muted/50 rounded-md flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <strong>Sender identity:</strong> All outbound emails send FROM <code className="bg-muted px-1 rounded">adam.haile@sourcecodeals.com</code> (locked in email-sender.ts). The sender <em>name</em> varies per function (SourceCo, Adam Haile - SourceCo, SourceCo Marketplace).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
