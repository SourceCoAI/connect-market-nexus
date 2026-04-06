// Admin email routing data is maintained inline below (derived from ADMIN_PROFILES + edge function audit)
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Inbox, Users, Mail, Settings, Send, AlertTriangle, CheckCircle } from 'lucide-react';

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

const SUPPORT_EMAIL = 'support@sourcecodeals.com';

const ALL_EMAILS: Record<Category, EmailEntry[]> = {
  'Admin Notifications': [
    { emailType: 'New User Registration', edgeFunction: 'enhanced-admin-notification', recipient: SUPPORT_EMAIL, senderName: 'SourceCo Notifications', replyTo: SUPPORT_EMAIL },
    { emailType: 'New User Registration (journey)', edgeFunction: 'user-journey-notifications', recipient: SUPPORT_EMAIL, senderName: 'SourceCo Notifications', replyTo: SUPPORT_EMAIL },
    { emailType: 'Connection Request (admin copy)', edgeFunction: 'send-connection-notification', recipient: SUPPORT_EMAIL, senderName: 'SourceCo Notifications', replyTo: SUPPORT_EMAIL },
    { emailType: 'Feedback Submitted', edgeFunction: 'send-feedback-notification', recipient: SUPPORT_EMAIL, senderName: 'SourceCo Notifications', replyTo: SUPPORT_EMAIL },
    { emailType: 'Admin Digest', edgeFunction: 'admin-digest', recipient: SUPPORT_EMAIL, senderName: 'SourceCo Notifications', replyTo: SUPPORT_EMAIL },
    { emailType: 'Task Assigned', edgeFunction: 'send-task-notification-email', recipient: 'Assigned admin (assignee_email)', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Deal Owner Change', edgeFunction: 'notify-deal-owner-change', recipient: 'Previous deal owner', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Owner Inquiry', edgeFunction: 'send-owner-inquiry-notification', recipient: SUPPORT_EMAIL, senderName: 'SourceCo Notifications', replyTo: SUPPORT_EMAIL },
  ],
  'Messaging': [
    { emailType: 'New Buyer Message', edgeFunction: 'notify-support-inbox', recipient: SUPPORT_EMAIL, senderName: 'SourceCo Notifications', replyTo: SUPPORT_EMAIL },
    { emailType: 'Admin Reply Copy', edgeFunction: 'notify-support-inbox', recipient: SUPPORT_EMAIL, senderName: 'SourceCo Notifications', replyTo: SUPPORT_EMAIL },
    { emailType: 'Document Request', edgeFunction: 'notify-support-inbox', recipient: SUPPORT_EMAIL, senderName: 'SourceCo Notifications', replyTo: SUPPORT_EMAIL },
    { emailType: 'Admin Reply to Buyer', edgeFunction: 'notify-buyer-new-message', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Inquiry Confirmation to Buyer', edgeFunction: 'notify-buyer-inquiry-received', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
  ],
  'Buyer Lifecycle': [
    { emailType: 'Welcome Email', edgeFunction: 'user-journey-notifications', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Email Verified', edgeFunction: 'user-journey-notifications', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Marketplace Signup Approved', edgeFunction: 'user-journey-notifications', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Profile Rejected', edgeFunction: 'user-journey-notifications', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Buyer Rejection', edgeFunction: 'notify-buyer-rejection', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Verification Success', edgeFunction: 'send-verification-success-email', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Simple Verification', edgeFunction: 'send-simple-verification-email', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Password Reset', edgeFunction: 'password-reset', recipient: 'Individual user', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Onboarding Day 2', edgeFunction: 'send-onboarding-day2', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Onboarding Day 7', edgeFunction: 'send-onboarding-day7', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Marketplace Invitation', edgeFunction: 'send-marketplace-invitation', recipient: 'Invited buyer', senderName: 'SourceCo Marketplace', replyTo: SUPPORT_EMAIL },
    { emailType: 'Anonymous Teaser Release', edgeFunction: 'approve-marketplace-buyer', recipient: 'Individual buyer', senderName: 'Adam Haile - SourceCo', replyTo: 'adam.haile@sourcecodeals.com' },
    { emailType: 'First Request Followup', edgeFunction: 'send-first-request-followup', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Feedback Response', edgeFunction: 'send-feedback-email', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'User Notification', edgeFunction: 'send-user-notification', recipient: 'Individual user', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Contact Response', edgeFunction: 'send-contact-response', recipient: 'Individual user', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Templated Approval', edgeFunction: 'send-templated-approval-email', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Data Recovery', edgeFunction: 'send-data-recovery-email', recipient: 'Individual user', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
  ],
  'Agreements': [
    { emailType: 'Agreement Sent (NDA/Fee)', edgeFunction: 'request-agreement-email', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'NDA Confirmed', edgeFunction: 'notify-agreement-confirmed', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Fee Agreement Confirmed', edgeFunction: 'notify-agreement-confirmed', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
  ],
  'Deal Flow': [
    { emailType: 'Connection User Confirmation', edgeFunction: 'send-connection-notification', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Connection Approved', edgeFunction: 'send-connection-notification', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Deal Alert', edgeFunction: 'send-deal-alert', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Deal Memo', edgeFunction: 'send-memo-email', recipient: 'Individual buyer', senderName: 'Calling admin profile', replyTo: 'Calling admin email' },
    { emailType: 'Deal Referral', edgeFunction: 'send-deal-referral', recipient: 'Referred buyer', senderName: 'SourceCo Marketplace', replyTo: SUPPORT_EMAIL },
    { emailType: 'Data Room Access Granted', edgeFunction: 'grant-data-room-access', recipient: 'Individual buyer', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'Deal Reassignment', edgeFunction: 'notify-deal-reassignment', recipient: 'Previous deal owner', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
    { emailType: 'New Deal Owner Assigned', edgeFunction: 'notify-new-deal-owner', recipient: 'Newly assigned owner', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
  ],
  'Owner-Facing': [
    { emailType: 'Owner Intro Notification', edgeFunction: 'send-owner-intro-notification', recipient: 'Listing primary owner', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
  ],
  'System': [],
  'Deprecated': [
    { emailType: 'Admin New Message (deprecated)', edgeFunction: 'notify-admin-new-message', recipient: 'No longer called', senderName: 'SourceCo', replyTo: SUPPORT_EMAIL },
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
  sends: string[];
  sharedInbox: boolean;
}

const ADMIN_ROUTING: AdminReceives[] = [
  {
    name: 'Adam Haile',
    email: 'adam.haile@sourcecodeals.com',
    title: 'Founder & CEO',
    sends: ['Deal Memo (as sender profile)'],
    sharedInbox: true,
  },
  {
    name: 'Tomos Mughan',
    email: 'tomos.mughan@sourcecodeals.com',
    title: 'CEO',
    sends: ['Deal Memo (when sent by this admin)'],
    sharedInbox: true,
  },
  {
    name: 'Bill Martin',
    email: 'bill.martin@sourcecodeals.com',
    title: 'Principal & SVP - Growth',
    sends: ['Deal Memo (when sent by this admin)'],
    sharedInbox: true,
  },
  {
    name: 'Kyle Collins',
    email: 'kyle.collins@sourcecodeals.com',
    title: 'Team Member',
    sends: [],
    sharedInbox: true,
  },
  {
    name: 'Daniel Kobayashi',
    email: 'daniel.kobayashi@sourcecodeals.com',
    title: 'Team Member',
    sends: [],
    sharedInbox: true,
  },
  {
    name: 'Oz De La Luna',
    email: 'oz.delaluna@sourcecodeals.com',
    title: 'Team Member',
    sends: [],
    sharedInbox: true,
  },
];

export function AdminEmailRouting() {
  const [view, setView] = useState<'category' | 'recipient'>('category');
  const categories = Object.entries(ALL_EMAILS).filter(([, entries]) => entries.length > 0) as [Category, EmailEntry[]][];
  const totalEmails = categories.reduce((sum, [, entries]) => sum + entries.length, 0);

  // Build recipient-grouped view
  const allFlat: (EmailEntry & { category: Category })[] = [];
  for (const [cat, entries] of categories) {
    for (const e of entries) {
      allFlat.push({ ...e, category: cat });
    }
  }
  const byRecipient: Record<string, (EmailEntry & { category: Category })[]> = {};
  for (const e of allFlat) {
    const key = e.recipient;
    if (!byRecipient[key]) byRecipient[key] = [];
    byRecipient[key].push(e);
  }
  const recipientGroups = Object.entries(byRecipient).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      {/* Sender Identity Banner */}
      <Card className="border-green-200 bg-green-50/30 dark:border-green-900 dark:bg-green-950/20">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Sender Identity</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Default outbound emails send FROM <code className="bg-muted px-1 rounded font-semibold">{SUPPORT_EMAIL}</code> with sender name "SourceCo". Admin-bound notifications (to the support inbox) send FROM <code className="bg-muted px-1 rounded font-semibold">noreply@sourcecodeals.com</code> with sender name "SourceCo Notifications" to avoid Outlook spam filtering.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 1: Master Email Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">All Platform Emails</CardTitle>
            <Badge variant="secondary" className="ml-auto">{totalEmails} email types</Badge>
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-sm text-muted-foreground">
              {view === 'category' ? 'Grouped by email category' : 'Grouped by recipient address'}
            </p>
            <Tabs value={view} onValueChange={(v) => setView(v as 'category' | 'recipient')}>
              <TabsList className="h-8">
                <TabsTrigger value="category" className="text-xs px-3 py-1">By Category</TabsTrigger>
                <TabsTrigger value="recipient" className="text-xs px-3 py-1">By Recipient</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {view === 'category' ? (
            categories.map(([category, entries]) => (
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
            ))
          ) : (
            recipientGroups.map(([recipient, entries]) => (
              <div key={recipient}>
                <div className="flex items-center gap-2 mb-2">
                  <Inbox className="h-4 w-4 text-muted-foreground" />
                  <h4 className="font-semibold text-sm font-mono">{recipient}</h4>
                  <Badge variant="outline" className="text-xs">{entries.length}</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Email Type</TableHead>
                      <TableHead className="w-[160px]">Category</TableHead>
                      <TableHead className="w-[220px]">Edge Function</TableHead>
                      <TableHead className="w-[180px]">Sender Name</TableHead>
                      <TableHead className="w-[200px]">Reply-To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((e) => (
                      <TableRow key={e.emailType + e.category} className={e.category === 'Deprecated' ? 'opacity-50' : ''}>
                        <TableCell className="font-medium text-sm">{e.emailType}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">{e.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{e.edgeFunction}</code>
                        </TableCell>
                        <TableCell className="text-sm">{e.senderName}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{e.replyTo}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Section 2: Per-Admin Routing */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Per-Admin Routing</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">No individual admin receives notification emails. All notifications go to the shared support inbox. Admins only send deal memos.</p>
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

                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Receives:</p>
                  <p className="text-xs text-muted-foreground italic">No individual emails. All notifications go to {SUPPORT_EMAIL}</p>
                </div>

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
            <Badge variant="secondary" className="ml-auto font-mono text-xs">{SUPPORT_EMAIL}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">ALL admin notifications go here. Every message, reply, connection request, feedback, registration, digest, and document request triggers an email to this inbox.</p>
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
              <TableRow>
                <TableCell className="font-medium">Connection Request</TableCell>
                <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">send-connection-notification</code></TableCell>
                <TableCell className="text-sm text-muted-foreground">Buyer requests connection on a listing</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Feedback Submitted</TableCell>
                <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">send-feedback-notification</code></TableCell>
                <TableCell className="text-sm text-muted-foreground">User submits feedback from the widget</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">New User Registration</TableCell>
                <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">user-journey-notifications</code></TableCell>
                <TableCell className="text-sm text-muted-foreground">New user signs up on the marketplace</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Admin Digest</TableCell>
                <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">admin-digest</code></TableCell>
                <TableCell className="text-sm text-muted-foreground">Scheduled daily/weekly digest of platform activity</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Owner Inquiry</TableCell>
                <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">send-owner-inquiry-notification</code></TableCell>
                <TableCell className="text-sm text-muted-foreground">Owner submits inquiry from the landing page</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section 4: Sender Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Sender Configuration</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">Platform-wide email sender settings (locked in email-sender.ts)</p>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Setting</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded font-semibold">VERIFIED_SENDER_EMAIL</code></TableCell>
                <TableCell className="text-sm font-mono">{SUPPORT_EMAIL}</TableCell>
                <TableCell className="text-sm text-muted-foreground">FROM address for all outbound emails</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded font-semibold">VERIFIED_SENDER_NAME</code></TableCell>
                <TableCell className="text-sm font-mono">SourceCo</TableCell>
                <TableCell className="text-sm text-muted-foreground">Default sender display name</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded font-semibold">DEFAULT_REPLY_TO</code></TableCell>
                <TableCell className="text-sm font-mono">{SUPPORT_EMAIL}</TableCell>
                <TableCell className="text-sm text-muted-foreground">Default reply-to address</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div className="mt-3 p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <strong>Brevo requirement:</strong> The FROM address <code className="bg-muted px-1 rounded">{SUPPORT_EMAIL}</code> must be verified as a sender in Brevo. If not verified, all email sends will be rejected.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
