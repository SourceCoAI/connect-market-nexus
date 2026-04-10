import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Phone,
  Mail,
  Linkedin,
  CheckSquare,
  ArrowRight,
  Video,
  Sparkles,
  StickyNote,
  AlertTriangle,
  Bot,
  Clock,
  Activity,
  FileCheck,
  UserCog,
  Star,
  Mic,
  FileText,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useDealActivities } from '@/hooks/admin/use-deal-activities';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Types ──

interface UnifiedTimelineEntry {
  id: string;
  timestamp: string;
  source: 'deal_activity' | 'call' | 'email' | 'linkedin' | 'transcript';
  category: FilterCategory;
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  adminName?: string | null;
}

type FilterCategory = 'all' | 'calls' | 'emails' | 'linkedin' | 'tasks' | 'meetings' | 'system';

// ── Icon + color mapping for deal activity types ──

const ACTIVITY_TYPE_CONFIG: Record<
  string,
  { icon: React.ReactNode; color: string; category: FilterCategory }
> = {
  // Calls
  call_completed: {
    icon: <Phone className="h-3.5 w-3.5" />,
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    category: 'calls',
  },
  call_made: {
    icon: <Phone className="h-3.5 w-3.5" />,
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    category: 'calls',
  },
  // Emails
  email_sent: {
    icon: <Mail className="h-3.5 w-3.5" />,
    color: 'bg-green-50 text-green-700 border-green-200',
    category: 'emails',
  },
  email_received: {
    icon: <Mail className="h-3.5 w-3.5" />,
    color: 'bg-green-50 text-green-700 border-green-200',
    category: 'emails',
  },
  buyer_response: {
    icon: <Mail className="h-3.5 w-3.5" />,
    color: 'bg-green-50 text-green-700 border-green-200',
    category: 'emails',
  },
  // LinkedIn
  linkedin_message: {
    icon: <Linkedin className="h-3.5 w-3.5" />,
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    category: 'linkedin',
  },
  linkedin_connection: {
    icon: <Linkedin className="h-3.5 w-3.5" />,
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    category: 'linkedin',
  },
  // Tasks
  task_created: {
    icon: <CheckSquare className="h-3.5 w-3.5" />,
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    category: 'tasks',
  },
  task_completed: {
    icon: <CheckSquare className="h-3.5 w-3.5" />,
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    category: 'tasks',
  },
  task_assigned: {
    icon: <UserCog className="h-3.5 w-3.5" />,
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    category: 'tasks',
  },
  task_overdue: {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    color: 'bg-red-50 text-red-700 border-red-200',
    category: 'tasks',
  },
  task_snoozed: {
    icon: <Clock className="h-3.5 w-3.5" />,
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    category: 'tasks',
  },
  // Stage changes
  stage_change: {
    icon: <ArrowRight className="h-3.5 w-3.5" />,
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    category: 'system',
  },
  buyer_status_change: {
    icon: <ArrowRight className="h-3.5 w-3.5" />,
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    category: 'system',
  },
  // Transcripts / meetings
  transcript_linked: {
    icon: <Video className="h-3.5 w-3.5" />,
    color: 'bg-teal-50 text-teal-700 border-teal-200',
    category: 'meetings',
  },
  meeting_linked: {
    icon: <Video className="h-3.5 w-3.5" />,
    color: 'bg-teal-50 text-teal-700 border-teal-200',
    category: 'meetings',
  },
  meeting_summary_generated: {
    icon: <Video className="h-3.5 w-3.5" />,
    color: 'bg-teal-50 text-teal-700 border-teal-200',
    category: 'meetings',
  },
  // Enrichment
  enrichment_completed: {
    icon: <Sparkles className="h-3.5 w-3.5" />,
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    category: 'system',
  },
  // Notes / follow-ups
  note_added: {
    icon: <StickyNote className="h-3.5 w-3.5" />,
    color: 'bg-gray-50 text-gray-700 border-gray-200',
    category: 'system',
  },
  follow_up: {
    icon: <StickyNote className="h-3.5 w-3.5" />,
    color: 'bg-gray-50 text-gray-700 border-gray-200',
    category: 'system',
  },
  // Alerts
  stale_deal_flagged: {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    color: 'bg-red-50 text-red-700 border-red-200',
    category: 'system',
  },
  // Auto
  auto_followup_created: {
    icon: <Bot className="h-3.5 w-3.5" />,
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    category: 'system',
  },
  // Deal CRUD
  deal_created: {
    icon: <Star className="h-3.5 w-3.5" />,
    color: 'bg-muted text-muted-foreground border-border',
    category: 'system',
  },
  deal_updated: {
    icon: <Star className="h-3.5 w-3.5" />,
    color: 'bg-muted text-muted-foreground border-border',
    category: 'system',
  },
  deal_deleted: {
    icon: <Star className="h-3.5 w-3.5" />,
    color: 'bg-muted text-muted-foreground border-border',
    category: 'system',
  },
  deal_restored: {
    icon: <Star className="h-3.5 w-3.5" />,
    color: 'bg-muted text-muted-foreground border-border',
    category: 'system',
  },
  // Agreements
  nda_status_changed: {
    icon: <FileCheck className="h-3.5 w-3.5" />,
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    category: 'system',
  },
  nda_email_sent: {
    icon: <FileCheck className="h-3.5 w-3.5" />,
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    category: 'emails',
  },
  fee_agreement_status_changed: {
    icon: <FileCheck className="h-3.5 w-3.5" />,
    color: 'bg-green-50 text-green-700 border-green-200',
    category: 'system',
  },
  fee_agreement_email_sent: {
    icon: <FileCheck className="h-3.5 w-3.5" />,
    color: 'bg-green-50 text-green-700 border-green-200',
    category: 'emails',
  },
  assignment_changed: {
    icon: <UserCog className="h-3.5 w-3.5" />,
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    category: 'system',
  },
};

const DEFAULT_CONFIG = {
  icon: <Clock className="h-3.5 w-3.5" />,
  color: 'bg-muted text-muted-foreground border-border',
  category: 'system' as FilterCategory,
};

function getConfig(type: string) {
  return ACTIVITY_TYPE_CONFIG[type] ?? DEFAULT_CONFIG;
}

function getActivityLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Filter tabs ──

const FILTER_TABS: { label: string; value: FilterCategory }[] = [
  { label: 'All', value: 'all' },
  { label: 'Calls', value: 'calls' },
  { label: 'Emails', value: 'emails' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Tasks', value: 'tasks' },
  { label: 'Meetings', value: 'meetings' },
  { label: 'System', value: 'system' },
];

// ── Props ──

interface UnifiedDealTimelineProps {
  dealId: string;
  listingId: string;
}

export function UnifiedDealTimeline({ dealId, listingId }: UnifiedDealTimelineProps) {
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');

  // 1. Deal activities (existing hook)
  const { data: dealActivities = [], isLoading: loadingDealActivities } = useDealActivities(dealId);

  // 2. PhoneBurner calls linked to the listing
  const { data: callActivities = [], isLoading: loadingCalls } = useQuery({
    queryKey: ['unified-timeline-calls', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_activities')
        .select('*')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!listingId,
    staleTime: 60_000,
  });

  // 3. Outlook email history (via contacts linked to this listing)
  const { data: emailHistory = [], isLoading: loadingEmails } = useQuery({
    queryKey: ['unified-timeline-outlook-emails', listingId],
    queryFn: async () => {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id')
        .eq('listing_id', listingId)
        .eq('archived', false);
      const contactIds = (contacts || []).map((c: { id: string }) => c.id);
      if (contactIds.length === 0) return [];

      const { data, error } = await (supabase as any)
        .from('email_messages')
        .select('id, contact_id, direction, from_address, to_addresses, subject, body_text, sent_at, sourceco_user_id, has_attachments')
        .in('contact_id', contactIds)
        .order('sent_at', { ascending: false })
        .limit(100);
      if (error) { console.error('Outlook timeline query failed:', error); return []; }
      return data ?? [];
    },
    enabled: !!listingId,
    staleTime: 60_000,
  });

  // 4. LinkedIn outreach (via HeyReach for buyers on this listing)
  const { data: linkedinHistory = [], isLoading: loadingLinkedin } = useQuery({
    queryKey: ['unified-timeline-heyreach', listingId],
    queryFn: async () => {
      const { data: deals } = await (supabase as any)
        .from('deal_pipeline')
        .select('remarketing_buyer_id')
        .eq('listing_id', listingId)
        .not('remarketing_buyer_id', 'is', null)
        .is('deleted_at', null);
      const buyerIds = [...new Set((deals || []).map((d: any) => d.remarketing_buyer_id).filter(Boolean))] as string[];
      if (buyerIds.length === 0) return [];

      const { data: leads } = await (supabase as any)
        .from('heyreach_campaign_leads')
        .select('linkedin_url')
        .in('remarketing_buyer_id', buyerIds);
      const urls = [...new Set((leads || []).map((l: any) => l.linkedin_url).filter(Boolean))] as string[];
      if (urls.length === 0) return [];

      const { data, error } = await (supabase as any)
        .from('heyreach_webhook_events')
        .select('id, event_type, lead_linkedin_url, lead_email, heyreach_campaign_id, created_at')
        .in('lead_linkedin_url', urls)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) { console.error('HeyReach timeline query failed:', error); return []; }
      return data ?? [];
    },
    enabled: !!listingId,
    staleTime: 60_000,
  });

  // 5. Deal transcripts
  const { data: transcripts = [], isLoading: loadingTranscripts } = useQuery({
    queryKey: ['unified-timeline-transcripts', listingId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('deal_transcripts')
        .select('id, title, created_at, transcript_type, summary')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!listingId,
    staleTime: 60_000,
  });

  // 6. Smartlead reply inbox linked to the deal
  const { data: smartleadReplies = [], isLoading: loadingSmartlead } = useQuery({
    queryKey: ['unified-timeline-smartlead', dealId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('smartlead_reply_inbox')
        .select('id, from_email, to_email, subject, reply_body, sent_message_body, time_replied, event_timestamp, ai_category, ai_sentiment, campaign_name, lead_first_name, lead_last_name, lead_company_name, created_at')
        .eq('linked_deal_id', dealId)
        .order('time_replied', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!dealId,
    staleTime: 60_000,
  });

  const isLoading =
    loadingDealActivities || loadingCalls || loadingEmails || loadingLinkedin || loadingTranscripts || loadingSmartlead;

  // ── Merge all sources into unified entries ──

  const allEntries = useMemo(() => {
    const entries: UnifiedTimelineEntry[] = [];

    // Deal activities
    for (const a of dealActivities) {
      const config = getConfig(a.activity_type);
      const adminName = a.admin?.first_name
        ? `${a.admin.first_name}${a.admin.last_name ? ` ${a.admin.last_name}` : ''}`
        : (a.admin?.email ?? null);

      entries.push({
        id: `da-${a.id}`,
        timestamp: a.created_at,
        source: 'deal_activity',
        category: config.category,
        icon: config.icon,
        iconColor: config.color,
        title: a.title,
        description: a.description,
        metadata: a.metadata as Record<string, unknown> | undefined,
        adminName,
      });
    }

    // Call activities
    for (const c of callActivities) {
      const activityType = c.activity_type ?? 'call_completed';
      const config = getConfig(activityType);
      entries.push({
        id: `call-${c.id}`,
        timestamp: c.call_started_at || c.created_at,
        source: 'call',
        category: 'calls',
        icon: config.icon ?? <Phone className="h-3.5 w-3.5" />,
        iconColor: 'bg-blue-50 text-blue-700 border-blue-200',
        title: c.disposition_label || getActivityLabel(activityType),
        description: c.disposition_notes || null,
        metadata: {
          duration: c.call_duration_seconds,
          outcome: c.call_outcome,
          caller: c.user_name,
        },
        adminName: c.user_name || null,
      });
    }

    // Email history (Outlook)
    for (const e of emailHistory) {
      entries.push({
        id: `email-${e.id}`,
        timestamp: e.sent_at,
        source: 'email',
        category: 'emails',
        icon: <Mail className="h-3.5 w-3.5" />,
        iconColor: e.direction === 'inbound'
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-green-50 text-green-700 border-green-200',
        title: e.subject || '(No subject)',
        description: e.direction === 'outbound'
          ? `Sent to ${(e.to_addresses || []).join(', ')}`
          : `Received from ${e.from_address}`,
        metadata: {
          direction: e.direction,
          from: e.from_address,
          to: e.to_addresses,
          has_attachments: e.has_attachments,
          body_preview: e.body_text?.substring(0, 300),
        },
        adminName: null,
      });
    }

    // LinkedIn history (HeyReach)
    const LI_LABELS: Record<string, string> = {
      CONNECTION_REQUEST_SENT: 'Connection Request Sent',
      CONNECTION_REQUEST_ACCEPTED: 'Connection Accepted',
      MESSAGE_SENT: 'LinkedIn Message Sent',
      MESSAGE_RECEIVED: 'Message Received',
      INMAIL_SENT: 'InMail Sent',
      LEAD_REPLIED: 'Lead Replied',
      LEAD_INTERESTED: 'Marked Interested',
      LEAD_NOT_INTERESTED: 'Not Interested',
      PROFILE_VIEWED: 'Profile Viewed',
      FOLLOW_SENT: 'Followed',
      LIKE_SENT: 'Liked Post',
    };

    for (const l of linkedinHistory) {
      entries.push({
        id: `li-${l.id}`,
        timestamp: l.created_at,
        source: 'linkedin',
        category: 'linkedin',
        icon: <Linkedin className="h-3.5 w-3.5" />,
        iconColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        title: LI_LABELS[l.event_type] || l.event_type?.replace(/_/g, ' ') || 'LinkedIn Activity',
        description: l.lead_email || l.lead_linkedin_url || null,
        metadata: { linkedin_url: l.lead_linkedin_url, event_type: l.event_type },
      });
    }

    // Transcripts
    for (const t of transcripts) {
      entries.push({
        id: `transcript-${t.id}`,
        timestamp: t.created_at,
        source: 'transcript',
        category: 'meetings',
        icon: <Video className="h-3.5 w-3.5" />,
        iconColor: 'bg-teal-50 text-teal-700 border-teal-200',
        title: t.title || 'Transcript linked',
        description: t.summary || null,
        metadata: { type: t.transcript_type },
      });
    }

    // Smartlead replies
    for (const s of smartleadReplies) {
      const replyText = s.reply_body ? stripHtml(s.reply_body) : '';
      const leadName = [s.lead_first_name, s.lead_last_name].filter(Boolean).join(' ');
      const category = s.ai_category || 'neutral';
      const catLabel = category.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      entries.push({
        id: `sl-${s.id}`,
        timestamp: s.time_replied || s.event_timestamp || s.created_at,
        source: 'email',
        category: 'emails',
        icon: <Mail className="h-3.5 w-3.5" />,
        iconColor: 'bg-green-50 text-green-700 border-green-200',
        title: `${leadName || s.from_email || 'Lead'} — ${catLabel}`,
        description: replyText ? replyText.slice(0, 200) : (s.subject || 'Smartlead reply'),
        metadata: {
          ai_category: category,
          ai_sentiment: s.ai_sentiment,
          campaign: s.campaign_name,
          from: s.from_email,
        },
      });
    }

    // Sort descending by timestamp
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return entries;
  }, [dealActivities, callActivities, emailHistory, linkedinHistory, transcripts, smartleadReplies]);

  // ── Filter ──

  const filteredEntries = useMemo(() => {
    if (activeFilter === 'all') return allEntries;
    return allEntries.filter((e) => e.category === activeFilter);
  }, [allEntries, activeFilter]);

  // ── Category counts ──

  const categoryCounts = useMemo(() => {
    const counts: Record<FilterCategory, number> = {
      all: allEntries.length,
      calls: 0,
      emails: 0,
      linkedin: 0,
      tasks: 0,
      meetings: 0,
      system: 0,
    };
    for (const e of allEntries) {
      counts[e.category]++;
    }
    return counts;
  }, [allEntries]);

  // ── Render ──

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Unified Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Unified Activity Timeline
            {allEntries.length > 0 && (
              <Badge variant="secondary" className="text-xs font-normal">
                {allEntries.length}
              </Badge>
            )}
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filter bar */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTER_TABS.map((tab) => {
            const count = categoryCounts[tab.value];
            const isActive = activeFilter === tab.value;
            return (
              <Button
                key={tab.value}
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setActiveFilter(tab.value)}
              >
                {tab.label}
                {count > 0 && tab.value !== 'all' && (
                  <Badge
                    variant={isActive ? 'secondary' : 'outline'}
                    className="ml-1.5 text-[10px] h-4 min-w-[16px] px-1"
                  >
                    {count}
                  </Badge>
                )}
              </Button>
            );
          })}
        </div>

        {/* Timeline entries */}
        {filteredEntries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              {activeFilter === 'all'
                ? 'No activity recorded yet'
                : `No ${activeFilter} activity yet`}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[600px]">
            <div className="space-y-3 pr-3">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border p-3 space-y-1.5 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  {/* Header row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-xs flex items-center gap-1 ${entry.iconColor}`}
                    >
                      {entry.icon}
                      {entry.source === 'deal_activity'
                        ? getActivityLabel(
                            ((entry.metadata as Record<string, unknown> | undefined)
                              ?.activity_type as string) ?? entry.title,
                          )
                        : entry.source === 'call'
                          ? 'Call'
                          : entry.source === 'email'
                            ? 'Email'
                            : entry.source === 'linkedin'
                              ? 'LinkedIn'
                              : 'Meeting'}
                    </Badge>
                    {entry.adminName && (
                      <span className="text-xs text-muted-foreground">{entry.adminName}</span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap flex items-center gap-1.5">
                      <span className="font-medium text-foreground/70">
                        {format(new Date(entry.timestamp), 'MMM d, yyyy h:mm a')}
                      </span>
                      <span className="text-muted-foreground/50">&middot;</span>
                      <span>
                        {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                      </span>
                    </span>
                  </div>

                  {/* Content */}
                  <p className="text-sm font-medium">{entry.title}</p>
                  {entry.description && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                      {entry.description}
                    </p>
                  )}

                  {/* Rich detail for calls */}
                  {entry.source === 'call' && entry.metadata && (() => {
                    const m = entry.metadata as Record<string, any>;
                    return (m.duration || m.recording_url || m.recording_url_public || m.transcript_preview) ? (
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {m.duration != null && m.duration > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {Math.floor(m.duration / 60)}m {m.duration % 60}s
                          </span>
                        )}
                        {(m.recording_url || m.recording_url_public) && (
                          <a
                            href={m.recording_url_public || m.recording_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <Mic className="h-3 w-3" />
                            Recording
                          </a>
                        )}
                        {m.transcript_preview && (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            Transcript available
                          </span>
                        )}
                      </div>
                    ) : null;
                  })()}

                  {/* Rich detail for emails */}
                  {entry.source === 'email' && entry.metadata && (() => {
                    const m = entry.metadata as Record<string, any>;
                    return (m.body_preview || m.has_attachments) ? (
                      <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                        {m.has_attachments && (
                          <span className="flex items-center gap-1">
                            <FileCheck className="h-3 w-3" />
                            Has attachments
                          </span>
                        )}
                        {m.body_preview && (
                          <p className="line-clamp-2 italic">{m.body_preview}</p>
                        )}
                      </div>
                    ) : null;
                  })()}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
