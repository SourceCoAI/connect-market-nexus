import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, ChevronDown, ChevronRight, Mail } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

type RecipientType = 'Buyer' | 'Admin' | 'Owner' | 'User' | 'System' | 'Dynamic';

interface CatalogEmail {
  name: string;
  subject: string;
  recipient: RecipientType;
  trigger: string;
  edgeFunction: string;
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

const EMAIL_CATALOG: CatalogCategory[] = [
  {
    name: 'Onboarding & Auth',
    emails: [
      { name: 'Signup Confirmation', subject: 'Confirm Your Signup', recipient: 'User', trigger: 'User creates an account', edgeFunction: 'Supabase Auth (built-in)' },
      { name: 'Email Verification Resolved', subject: 'Email Verified Successfully — What\'s Next', recipient: 'User', trigger: 'Admin resolves stuck email verification', edgeFunction: 'resolve-email-verification' },
      { name: 'Technical Verification Fix', subject: 'Email Verification - Technical Issue Resolved', recipient: 'User', trigger: 'Admin fixes technical verification issue', edgeFunction: 'resolve-email-verification' },
      { name: 'Password Reset', subject: 'Reset Your Password — SourceCo', recipient: 'User', trigger: 'User requests password reset', edgeFunction: 'send-custom-reset-email' },
      { name: 'Onboarding Day 2', subject: 'Still exploring? Here\'s what to do next', recipient: 'User', trigger: '2 days after signup, no connection request', edgeFunction: 'send-onboarding-day2' },
      { name: 'Onboarding Day 7', subject: 'Your SourceCo journey — 1 week check-in', recipient: 'User', trigger: '7 days after signup re-engagement', edgeFunction: 'send-onboarding-day7' },
    ],
  },
  {
    name: 'Buyer Lifecycle',
    emails: [
      { name: 'Marketplace Approval', subject: 'Welcome to SourceCo Marketplace', recipient: 'Buyer', trigger: 'Admin approves buyer\'s marketplace application', edgeFunction: 'approve-marketplace-buyer' },
      { name: 'Marketplace Invitation', subject: '[Name], you\'re invited to SourceCo Marketplace', recipient: 'Buyer', trigger: 'Admin sends marketplace invitation', edgeFunction: 'invite-marketplace-buyer' },
      { name: 'Buyer Rejection', subject: 'Update on Your Interest in [Deal]', recipient: 'Buyer', trigger: 'Admin rejects buyer for a deal', edgeFunction: 'notify-buyer-rejection' },
      { name: 'Connection Request Confirmation', subject: 'We received your interest in [Deal]', recipient: 'User', trigger: 'User submits a connection request', edgeFunction: 'send-connection-confirmation' },
      { name: 'Connection Approval', subject: 'Great news — you\'ve been approved for [Deal]', recipient: 'Buyer', trigger: 'Admin approves connection request', edgeFunction: 'send-connection-approval' },
      { name: 'Deal Alert', subject: 'New Match: [Deal Title]', recipient: 'Buyer', trigger: 'New listing matches buyer\'s alert criteria', edgeFunction: 'send-deal-alert' },
      { name: 'Deal Referral', subject: '[Referrer] shared a deal with you', recipient: 'User', trigger: 'User shares a deal via referral', edgeFunction: 'send-deal-referral' },
    ],
  },
  {
    name: 'Agreements & Documents',
    emails: [
      { name: 'NDA Request', subject: 'NDA Required — [Deal]', recipient: 'Buyer', trigger: 'Buyer needs to sign NDA for deal access', edgeFunction: 'request-agreement-email' },
      { name: 'Fee Agreement Request', subject: 'Fee Agreement Required — [Deal]', recipient: 'Buyer', trigger: 'Buyer needs to sign fee agreement', edgeFunction: 'request-agreement-email' },
      { name: 'Data Room Access Granted', subject: 'Data room open — Project [Name]', recipient: 'Buyer', trigger: 'Admin grants data room access', edgeFunction: 'grant-data-room-access' },
    ],
  },
  {
    name: 'Deal & Owner Notifications',
    emails: [
      { name: 'New Deal Owner Assigned', subject: 'You\'ve been assigned a new deal — [Deal]', recipient: 'Owner', trigger: 'Admin assigns deal to an owner', edgeFunction: 'notify-new-deal-owner' },
      { name: 'Deal Owner Changed', subject: 'Deal ownership update — [Deal]', recipient: 'Owner', trigger: 'Deal is reassigned to a different owner', edgeFunction: 'notify-deal-owner-change' },
      { name: 'Owner Inquiry Notification', subject: 'New inquiry from [Buyer] — [Deal]', recipient: 'Admin', trigger: 'Owner inquiry submitted about a deal', edgeFunction: 'notify-owner-inquiry' },
      { name: 'Owner Intro Notification', subject: 'Buyer introduction update — [Deal]', recipient: 'Owner', trigger: 'Buyer is introduced to deal owner', edgeFunction: 'notify-owner-intro' },
      { name: 'Memo Email', subject: '(Admin-composed subject)', recipient: 'Dynamic', trigger: 'Admin sends a memo/CIM to a recipient', edgeFunction: 'send-memo-email' },
    ],
  },
  {
    name: 'Messaging',
    emails: [
      { name: 'Buyer New Message', subject: 'New message from SourceCo re: [Deal]', recipient: 'Buyer', trigger: 'Admin replies in message center', edgeFunction: 'notify-buyer-new-message' },
      { name: 'Admin New Message', subject: 'New Buyer Message: [Deal] — [Buyer]', recipient: 'Admin', trigger: 'Buyer sends message via message center', edgeFunction: 'notify-admin-new-message' },
    ],
  },
  {
    name: 'Admin & System',
    emails: [
      { name: 'New User Registration Alert', subject: 'New User Registration - Action Required', recipient: 'Admin', trigger: 'New user signs up on the platform', edgeFunction: 'enhanced-admin-notification' },
      { name: 'Journey: Admin New User', subject: 'New signup: [Name] from [Company]', recipient: 'Admin', trigger: 'New user completes onboarding', edgeFunction: 'journey-admin-new-user' },
      { name: 'Feedback Notification', subject: '[Category] Feedback from [User]', recipient: 'Admin', trigger: 'User submits feedback', edgeFunction: 'send-feedback-notification' },
      { name: 'Contact Form Response', subject: 'Thank you for your [category] feedback', recipient: 'User', trigger: 'Admin responds to user feedback', edgeFunction: 'send-contact-response' },
      { name: 'Task Notification', subject: '[Task Title] — assigned to you', recipient: 'Admin', trigger: 'Task assigned to admin in deal pipeline', edgeFunction: 'send-task-notification' },
      { name: 'Data Recovery Email', subject: 'Complete Your Profile - Missing Information', recipient: 'User', trigger: 'Admin triggers data recovery for incomplete profiles', edgeFunction: 'send-data-recovery-email' },
    ],
  },
  {
    name: 'Platform Notifications',
    emails: [
      { name: 'User Notification (Generic)', subject: '(Dynamic subject)', recipient: 'User', trigger: 'System sends generic transactional email', edgeFunction: 'send-transactional-email' },
      { name: 'First Request Follow-up', subject: 'Quick update on your request', recipient: 'User', trigger: 'Follow-up after first connection request', edgeFunction: 'send-first-request-followup' },
      { name: 'Feedback Email', subject: '(Admin-composed reply)', recipient: 'User', trigger: 'Admin replies to user feedback via email', edgeFunction: 'send-feedback-email' },
    ],
  },
];

export function EmailCatalog() {
  const [search, setSearch] = useState('');
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    new Set(EMAIL_CATALOG.map(c => c.name))
  );

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
        e.edgeFunction.toLowerCase().includes(q)
      ),
    })).filter(cat => cat.emails.length > 0);
  }, [search]);

  const totalEmails = EMAIL_CATALOG.reduce((sum, c) => sum + c.emails.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{totalEmails} email types across {EMAIL_CATALOG.length} categories</span>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {category.emails.map(email => (
                      <TableRow key={email.edgeFunction + email.name}>
                        <TableCell className="font-medium text-sm">{email.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{email.subject}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${RECIPIENT_STYLES[email.recipient]}`}>
                            {email.recipient}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{email.trigger}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{email.edgeFunction}</TableCell>
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
    </div>
  );
}
