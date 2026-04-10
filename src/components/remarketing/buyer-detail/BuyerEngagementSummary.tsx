import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Phone, Mail, Video, Linkedin, Clock } from 'lucide-react';
import type { UnifiedActivityEntry } from '@/hooks/use-contact-combined-history';

interface BuyerEngagementSummaryProps {
  entries: UnifiedActivityEntry[];
  activeDealCount?: number;
}

export function BuyerEngagementSummary({ entries, activeDealCount }: BuyerEngagementSummaryProps) {
  const stats = useMemo(() => {
    const calls = entries.filter(e => e.channel === 'call' && e.event_type !== 'meeting_recorded');
    const meetings = entries.filter(e => e.event_type === 'meeting_recorded');
    const emails = entries.filter(e => e.channel === 'email');
    const linkedin = entries.filter(e => e.channel === 'linkedin');
    const lastEntry = entries[0] || null;
    const daysSince = lastEntry
      ? Math.floor((Date.now() - new Date(lastEntry.timestamp).getTime()) / 86400000)
      : null;

    return {
      totalCalls: calls.length,
      totalMeetings: meetings.length,
      totalEmails: emails.length,
      totalLinkedIn: linkedin.length,
      lastContact: lastEntry?.timestamp || null,
      lastChannel: lastEntry?.channel || null,
      daysSinceContact: daysSince,
    };
  }, [entries]);

  if (entries.length === 0) return null;

  const urgencyColor =
    stats.daysSinceContact === null ? 'text-muted-foreground' :
    stats.daysSinceContact <= 7 ? 'text-green-600' :
    stats.daysSinceContact <= 14 ? 'text-yellow-600' :
    'text-red-600';

  return (
    <Card className="bg-muted/30">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-4 flex-wrap text-sm">
          {stats.totalCalls > 0 && (
            <span className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-blue-600" />
              <span className="font-medium">{stats.totalCalls}</span> calls
            </span>
          )}
          {stats.totalEmails > 0 && (
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-green-600" />
              <span className="font-medium">{stats.totalEmails}</span> emails
            </span>
          )}
          {stats.totalMeetings > 0 && (
            <span className="flex items-center gap-1.5">
              <Video className="h-3.5 w-3.5 text-teal-600" />
              <span className="font-medium">{stats.totalMeetings}</span> meetings
            </span>
          )}
          {stats.totalLinkedIn > 0 && (
            <span className="flex items-center gap-1.5">
              <Linkedin className="h-3.5 w-3.5 text-indigo-600" />
              <span className="font-medium">{stats.totalLinkedIn}</span> LinkedIn
            </span>
          )}

          <span className="ml-auto flex items-center gap-1.5">
            <Clock className={`h-3.5 w-3.5 ${urgencyColor}`} />
            <span className={urgencyColor}>
              {stats.daysSinceContact !== null
                ? `${stats.daysSinceContact}d since last contact`
                : 'No contact recorded'}
            </span>
          </span>
          {activeDealCount != null && activeDealCount > 1 && (
            <Badge variant="outline" className="text-xs">Active on {activeDealCount} deals</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
