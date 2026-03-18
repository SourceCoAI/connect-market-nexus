import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { format } from 'date-fns';
import {
  ArrowLeft,
  ExternalLink,
  User,
  Building,
  Calendar,
  Hash,
  Mail,
  MessageSquare,
  LinkIcon,
  Plus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  useSmartleadInboxItem,
  useRecategorizeInbox,
  useLinkInboxToDeal,
} from '@/hooks/smartlead/use-smartlead-inbox';
import { CreateDealFromReplyDialog } from '@/components/admin/smartlead/CreateDealFromReplyDialog';

const CATEGORIES = [
  'meeting_request',
  'interested',
  'question',
  'referral',
  'not_now',
  'not_interested',
  'unsubscribe',
  'out_of_office',
  'negative_hostile',
  'neutral',
];

const SENTIMENTS = ['positive', 'negative', 'neutral'];

const CATEGORY_LABELS: Record<string, string> = {
  meeting_request: '📅 Meeting Request',
  interested: '✨ Interested',
  question: '❓ Question',
  referral: '👤 Referral',
  not_now: '⏰ Not Now',
  not_interested: '👎 Not Interested',
  unsubscribe: '🚫 Unsubscribe',
  out_of_office: '🏖️ Out of Office',
  negative_hostile: '⚠️ Hostile',
  neutral: '➖ Neutral',
};

function getSentimentColor(sentiment: string | null) {
  if (sentiment === 'positive') return 'bg-green-500/10 text-green-700 dark:text-green-400';
  if (sentiment === 'negative') return 'bg-destructive/10 text-destructive';
  return 'bg-muted text-muted-foreground';
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&apos;/gi, "'").replace(/&rsquo;/gi, "'").replace(/&ndash;/gi, '–').replace(/\s+/g, ' ').trim();
}

// Removed: useDeals search hook — replaced by direct deal creation

export default function SmartleadResponseDetail() {
  const { inboxId } = useParams<{ inboxId: string }>();
  const navigate = useNavigate();
  const { data: item, isLoading } = useSmartleadInboxItem(inboxId);
  const recategorize = useRecategorizeInbox();
  const linkToDeal = useLinkInboxToDeal();
  const [showCreateDealDialog, setShowCreateDealDialog] = useState(false);

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  }

  if (!item) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Reply not found</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate('/admin/marketplace/messages/smartlead')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to inbox
        </Button>
      </div>
    );
  }

  const category: string = String(item.manual_category || item.ai_category || 'neutral');
  const sentiment: string = String(item.manual_sentiment || item.ai_sentiment || 'neutral');
  const replyText: string = item.reply_body ? stripHtml(String(item.reply_body)) : String(item.reply_message || item.preview_text || '');
  const sentText: string = item.sent_message_body ? stripHtml(String(item.sent_message_body)) : (item.sent_message ? stripHtml(String(item.sent_message)) : '');

  const handleRecategorize = (field: 'category' | 'sentiment', value: string) => {
    recategorize.mutate(
      {
        id: item.id,
        ...(field === 'category' ? { category: value } : { sentiment: value }),
      },
      { onSuccess: () => toast.success('Classification updated') },
    );
  };

  const handleCreateDeal = async () => {
    if (!item || isCreatingDeal) return;
    setIsCreatingDeal(true);

    // Find default stage
    const defaultStage = stages?.find((s) => s.is_default) || stages?.[0];
    if (!defaultStage) {
      toast.error('No deal stages configured. Please create a stage first.');
      setIsCreatingDeal(false);
      return;
    }

    // Derive a sensible title
    const contactName = String(item.to_name || '').trim();
    const campaignName = String(item.campaign_name || '').trim();
    const subject = String(item.subject || '').trim();
    const dealTitle = contactName
      ? `${contactName}${campaignName ? ` – ${campaignName}` : ''}`
      : subject || campaignName || 'SmartLead Response';

    // Map AI category → priority
    const category = String(item.manual_category || item.ai_category || '');
    let priority = 'medium';
    if (['meeting_request', 'interested'].includes(category)) priority = 'high';
    else if (['not_interested', 'unsubscribe', 'negative_hostile'].includes(category)) priority = 'low';

    const dealPayload: Record<string, unknown> = {
      title: dealTitle,
      stage_id: defaultStage.id,
      source: 'smartlead',
      priority,
      contact_name: contactName || null,
      contact_email: String(item.to_email || item.sl_lead_email || '').trim() || null,
      contact_phone: null,
      contact_company: null,
      description: [
        subject ? `Subject: ${subject}` : null,
        campaignName ? `Campaign: ${campaignName}` : null,
        item.ai_reasoning ? `AI Summary: ${String(item.ai_reasoning)}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    };

    try {
      const newDeal = await createDeal.mutateAsync(dealPayload);
      // Link inbox item to newly created deal
      const newDealId = (newDeal as { id: string }).id;
      linkToDeal.mutate(
        { id: item.id, dealId: newDealId },
        {
          onSuccess: () => {
            toast.success(`Deal created: ${dealTitle}`);
            setIsCreatingDeal(false);
          },
          onError: () => setIsCreatingDeal(false),
        },
      );
    } catch {
      setIsCreatingDeal(false);
    }
  };

  const handleUnlinkDeal = () => {
    linkToDeal.mutate(
      { id: item.id, dealId: null },
      { onSuccess: () => toast.success('Deal unlinked') },
    );
  };

  return (
    <div className="space-y-4">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin/marketplace/messages/smartlead')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        {item.ui_master_inbox_link && (
          <Button variant="outline" size="sm" asChild>
            <a href={item.ui_master_inbox_link} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" /> View in SmartLead
            </a>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Reply */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Reply
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{replyText || 'No reply content'}</p>
            </CardContent>
          </Card>

          {/* Original message */}
          {sentText.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Original Message
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{sentText}</p>
              </CardContent>
            </Card>
          ) : null}

          {/* AI Analysis */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">AI Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{CATEGORY_LABELS[category] || category}</Badge>
                <Badge className={getSentimentColor(sentiment)}>{sentiment}</Badge>
                {item.ai_is_positive && (
                  <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">
                    ✅ Positive Reply
                  </Badge>
                )}
              </div>
              {item.ai_reasoning ? (
                <blockquote className="border-l-2 border-muted pl-3 text-sm text-muted-foreground italic">
                  {String(item.ai_reasoning)}
                </blockquote>
              ) : null}
              {item.ai_confidence !== null && item.ai_confidence !== undefined && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Confidence</span>
                    <span>{Math.round(Number(item.ai_confidence) * 100)}%</span>
                  </div>
                  <Progress value={Number(item.ai_confidence) * 100} className="h-2" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Thread view */}
          {Array.isArray(item.lead_correspondence) && item.lead_correspondence.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Email Thread</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(item.lead_correspondence as Array<Record<string, unknown>>).map(
                  (msg, idx) => (
                    <div key={idx} className="border-l-2 border-muted pl-3">
                      <div className="text-xs text-muted-foreground mb-1">
                        {String(msg.from || msg.sender || 'Unknown')} •{' '}
                        {msg.time ? String(msg.time) : ''}
                      </div>
                      <p className="text-sm">
                        {msg.body ? stripHtml(String(msg.body)) : String(msg.message || '')}
                      </p>
                    </div>
                  ),
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Contact */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-3.5 w-3.5" /> Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {item.to_name && <p className="font-medium">{String(item.to_name)}</p>}
              {item.to_email && (
                <p className="text-muted-foreground">Reply from: {String(item.to_email)}</p>
              )}
              {item.sl_lead_email && (
                <p className="text-muted-foreground">Lead: {String(item.sl_lead_email)}</p>
              )}
              {item.from_email && (
                <p className="text-muted-foreground">Sent from: {String(item.from_email)}</p>
              )}
            </CardContent>
          </Card>

          {/* Campaign */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building className="h-3.5 w-3.5" /> Campaign
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {item.campaign_name && <p className="font-medium">{String(item.campaign_name)}</p>}
              {item.campaign_id && (
                <p className="text-muted-foreground">ID: {String(item.campaign_id)}</p>
              )}
              {item.campaign_status && (
                <Badge variant="outline" className="capitalize">
                  {String(item.campaign_status)}
                </Badge>
              )}
              {item.sequence_number && (
                <p className="text-muted-foreground">Sequence step: {String(item.sequence_number)}</p>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" /> Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {item.time_replied && (
                <p>Replied: {format(new Date(String(item.time_replied)), 'MMM d, yyyy h:mm a')}</p>
              )}
              <p>Received: {format(new Date(String(item.created_at)), 'MMM d, yyyy h:mm a')}</p>
            </CardContent>
          </Card>

          {/* Identifiers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Hash className="h-3.5 w-3.5" /> Identifiers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {item.sl_email_lead_id && (
                <p className="font-mono text-xs">Lead ID: {String(item.sl_email_lead_id)}</p>
              )}
              {item.event_type && (
                <p className="font-mono text-xs">Event: {String(item.event_type)}</p>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Add to Deal */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <LinkIcon className="h-3.5 w-3.5" /> Deal Link
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {item.linked_deal_id ? (
                <div className="space-y-2">
                  <Badge variant="secondary" className="text-xs">
                    Linked to deal
                  </Badge>
                  <p className="text-xs text-muted-foreground font-mono">{String(item.linked_deal_id)}</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => navigate(`/admin/deals/${item.linked_deal_id}`)}
                    >
                      View Deal
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 text-destructive"
                      onClick={handleUnlinkDeal}
                    >
                      Unlink
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  disabled={isCreatingDeal}
                  onClick={handleCreateDeal}
                >
                  {isCreatingDeal ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3 mr-1" />
                  )}
                  {isCreatingDeal ? 'Creating...' : 'Create Deal from Reply'}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Manual re-classification */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Manual Override</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                <Select
                  value={String(item.manual_category || '')}
                  onValueChange={(v) => handleRecategorize('category', v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Override category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs">
                        {CATEGORY_LABELS[c] || c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Sentiment</label>
                <Select
                  value={String(item.manual_sentiment || '')}
                  onValueChange={(v) => handleRecategorize('sentiment', v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Override sentiment" />
                  </SelectTrigger>
                  <SelectContent>
                    {SENTIMENTS.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs capitalize">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
