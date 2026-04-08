/**
 * BuyerEngagementSummary — Compact card showing buyer outreach stats
 * for Email, Calls, and LinkedIn channels.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users2, Mail, Phone, Linkedin } from 'lucide-react';

interface BuyerEngagementSummaryProps {
  listingId: string;
}

function pct(num: number, den: number): string {
  if (den === 0) return '0%';
  return `${Math.round((num / den) * 100)}%`;
}

export function BuyerEngagementSummary({ listingId }: BuyerEngagementSummaryProps) {
  // Email stats
  const { data: emailStats, isLoading: loadingEmail } = useQuery({
    queryKey: ['buyer-engagement-email', listingId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('contact_email_history')
        .select('id, opened_at, replied_at')
        .eq('listing_id', listingId);
      if (error) throw error;
      const items = data ?? [];
      return {
        sent: items.length,
        opened: items.filter((e: any) => !!e.opened_at).length,
        replied: items.filter((e: any) => !!e.replied_at).length,
      };
    },
    enabled: !!listingId,
    staleTime: 2 * 60_000,
  });

  // Call stats (using contact_activities with call-related types)
  const { data: callStats, isLoading: loadingCalls } = useQuery({
    queryKey: ['buyer-engagement-calls', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_activities')
        .select('id, call_outcome')
        .eq('listing_id', listingId);
      if (error) throw error;
      const items = data ?? [];
      return {
        total: items.length,
        connected: items.filter(
          (c: any) =>
            c.call_outcome === 'connected' ||
            c.call_outcome === 'answered' ||
            c.call_outcome === 'contact',
        ).length,
      };
    },
    enabled: !!listingId,
    staleTime: 2 * 60_000,
  });

  // LinkedIn stats
  const { data: linkedinStats, isLoading: loadingLinkedin } = useQuery({
    queryKey: ['buyer-engagement-linkedin', listingId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('contact_linkedin_history')
        .select('id, activity_type, response_text')
        .eq('listing_id', listingId);
      if (error) throw error;
      const items = data ?? [];
      return {
        sent: items.length,
        replied: items.filter((l: any) => !!l.response_text).length,
      };
    },
    enabled: !!listingId,
    staleTime: 2 * 60_000,
  });

  const isLoading = loadingEmail || loadingCalls || loadingLinkedin;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Users2 className="h-4 w-4 text-emerald-600" />
            Buyer Engagement
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="grid grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const email = emailStats ?? { sent: 0, opened: 0, replied: 0 };
  const calls = callStats ?? { total: 0, connected: 0 };
  const linkedin = linkedinStats ?? { sent: 0, replied: 0 };

  // Don't render if no data at all
  if (email.sent === 0 && calls.total === 0 && linkedin.sent === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Users2 className="h-4 w-4 text-emerald-600" />
          Buyer Engagement
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="grid grid-cols-3 gap-3">
          {/* Email */}
          <div className="rounded-lg border px-3 py-2 space-y-1">
            <div className="flex items-center gap-1.5 mb-1">
              <Mail className="h-3.5 w-3.5 text-green-600" />
              <span className="text-[11px] font-semibold">Email</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold tabular-nums text-green-700">{email.sent}</span>
              <span className="text-[10px] text-muted-foreground">sent</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span>
                <span className="font-medium text-blue-600">{email.opened}</span> opened
              </span>
              <span>
                <span className="font-medium text-emerald-600">{email.replied}</span> replied
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground">
              Response rate: <span className="font-semibold">{pct(email.replied, email.sent)}</span>
            </p>
          </div>

          {/* Calls */}
          <div className="rounded-lg border px-3 py-2 space-y-1">
            <div className="flex items-center gap-1.5 mb-1">
              <Phone className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-[11px] font-semibold">Calls</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold tabular-nums text-blue-700">{calls.total}</span>
              <span className="text-[10px] text-muted-foreground">total</span>
            </div>
            <div className="text-[10px]">
              <span className="font-medium text-emerald-600">{calls.connected}</span> connected
            </div>
            <p className="text-[9px] text-muted-foreground">
              Connect rate:{' '}
              <span className="font-semibold">{pct(calls.connected, calls.total)}</span>
            </p>
          </div>

          {/* LinkedIn */}
          <div className="rounded-lg border px-3 py-2 space-y-1">
            <div className="flex items-center gap-1.5 mb-1">
              <Linkedin className="h-3.5 w-3.5 text-indigo-600" />
              <span className="text-[11px] font-semibold">LinkedIn</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold tabular-nums text-indigo-700">
                {linkedin.sent}
              </span>
              <span className="text-[10px] text-muted-foreground">sent</span>
            </div>
            <div className="text-[10px]">
              <span className="font-medium text-emerald-600">{linkedin.replied}</span> replied
            </div>
            <p className="text-[9px] text-muted-foreground">
              Response rate:{' '}
              <span className="font-semibold">{pct(linkedin.replied, linkedin.sent)}</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
