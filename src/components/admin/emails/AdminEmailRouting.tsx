import { ADMIN_PROFILES } from '@/lib/admin-profiles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Inbox, Users, Mail } from 'lucide-react';

interface RoutingEntry {
  emailType: string;
  edgeFunction: string;
  description: string;
}

const SHARED_INBOX_EMAIL = 'support@sourcecodeals.com';

const SHARED_INBOX_ROUTING: RoutingEntry[] = [
  { emailType: 'New Buyer Message', edgeFunction: 'notify-support-inbox', description: 'When a buyer sends a message in the general chat or deal thread' },
  { emailType: 'Admin Reply', edgeFunction: 'notify-support-inbox', description: 'When an admin replies to a buyer message' },
  { emailType: 'Document Request', edgeFunction: 'notify-support-inbox', description: 'When a buyer requests NDA or Fee Agreement signing' },
];

const INDIVIDUAL_ADMIN_ROUTING: RoutingEntry[] = [
  { emailType: 'New User Registration', edgeFunction: 'enhanced-admin-notification', description: 'When a new user signs up on the marketplace' },
  { emailType: 'Connection Request', edgeFunction: 'send-connection-notification', description: 'When a buyer requests a deal connection' },
  { emailType: 'Feedback Submitted', edgeFunction: 'send-feedback-notification', description: 'When a user submits feedback via the feedback form' },
  { emailType: 'Listing Saved', edgeFunction: 'enhanced-admin-notification', description: 'When a buyer saves a listing to their watchlist' },
];

const BUYER_FACING_ROUTING: RoutingEntry[] = [
  { emailType: 'Admin Reply Notification', edgeFunction: 'notify-buyer-new-message', description: 'Notifies the buyer when an admin replies to their message' },
  { emailType: 'Agreement Confirmed', edgeFunction: 'notify-agreement-confirmed', description: 'Sent to buyer when NDA or Fee Agreement is confirmed' },
  { emailType: 'Connection Approved', edgeFunction: 'send-connection-notification', description: 'Notifies buyer their connection request was approved' },
  { emailType: 'Deal Alert', edgeFunction: 'send-deal-alert', description: 'Sends matching deal alerts to buyers based on their criteria' },
  { emailType: 'Deal Memo', edgeFunction: 'send-deal-memo', description: 'Sends the deal memo PDF to the buyer' },
  { emailType: 'Marketplace Invitation', edgeFunction: 'send-marketplace-invitation', description: 'Invites a new buyer to join the marketplace' },
  { emailType: 'Referral Confirmation', edgeFunction: 'send-referral-notification', description: 'Confirms a referral submission to the referrer' },
];

const adminList = Object.values(ADMIN_PROFILES);

export function AdminEmailRouting() {
  return (
    <div className="space-y-6">
      {/* Shared Inbox */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Shared Inbox</CardTitle>
            <Badge variant="secondary" className="ml-auto font-mono text-xs">{SHARED_INBOX_EMAIL}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">All admins monitor this shared inbox for real-time activity</p>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email Type</TableHead>
                <TableHead>Edge Function</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SHARED_INBOX_ROUTING.map((r) => (
                <TableRow key={r.emailType}>
                  <TableCell className="font-medium">{r.emailType}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.edgeFunction}</code></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Individual Admin Emails */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Individual Admin Emails</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">These notifications are sent to all admins individually (via ADMIN_NOTIFICATION_EMAIL env var or profiles query)</p>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email Type</TableHead>
                <TableHead>Edge Function</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {INDIVIDUAL_ADMIN_ROUTING.map((r) => (
                <TableRow key={r.emailType}>
                  <TableCell className="font-medium">{r.emailType}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.edgeFunction}</code></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Buyer-Facing Emails */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Buyer-Facing Emails</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">Emails sent directly to buyers and users</p>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email Type</TableHead>
                <TableHead>Edge Function</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {BUYER_FACING_ROUTING.map((r) => (
                <TableRow key={r.emailType}>
                  <TableCell className="font-medium">{r.emailType}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.edgeFunction}</code></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Admin Profiles */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Admin Profiles</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">All registered admins who receive platform notifications</p>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Receives</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adminList.map((admin) => (
                <TableRow key={admin.email}>
                  <TableCell className="font-medium">{admin.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{admin.title}</TableCell>
                  <TableCell className="font-mono text-xs">{admin.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs">Individual notifications</Badge>
                      <Badge variant="secondary" className="text-xs">Shared inbox</Badge>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
