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
import { supabase } from '@/integrations/supabase/client';

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
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&ndash;/gi, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

function companyFromEmail(email: string) {
  if (!email || !email.includes('@')) return '';
  const domain = email.split('@')[1]?.split('.')[0] || '';
  if (
    ['gmail', 'yahoo', 'hotmail', 'outlook', 'aol', 'icloud', 'mail', 'protonmail'].includes(
      domain.toLowerCase(),
    )
  ) {
    return '';
  }
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

export default function SmartleadResponseDetail() {
  const { inboxId } = useParams<{ inboxId: string }>();
  const navigate = useNavigate();
  const { data: item, isLoading } = useSmartleadInboxItem(inboxId);
  const recategorize = useRecategorizeInbox();
  const linkToDeal = useLinkInboxToDeal();
  const [showCreateDealDialog, setShowCreateDealDialog] = useState(false);
  const [isResolvingDeal, setIsResolvingDeal] = useState(false);

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

  const category = String(item.manual_category || item.ai_category || 'neutral');
  const sentiment = String(item.manual_sentiment || item.ai_sentiment || 'neutral');
  const replyText = item.reply_body
    ? stripHtml(String(item.reply_body))
    : String(item.reply_message || item.preview_text || '');
  const sentText = item.sent_message_body
    ? stripHtml(String(item.sent_message_body))
    : item.sent_message
      ? stripHtml(String(item.sent_message))
      : '';

  const handleRecategorize = (field: 'category' | 'sentiment', value: string) => {
    recategorize.mutate(
      {
        id: item.id,
        ...(field === 'category' ? { category: value } : { sentiment: value }),
      },
      { onSuccess: () => toast.success('Classification updated') },
    );
  };

  const handleUnlinkDeal = () => {
    linkToDeal.mutate(
      { id: item.id, dealId: null },
      { onSuccess: () => toast.success('Deal unlinked') },
    );
  };

  const resolveLinkedDealRoute = async (): Promise<
    | { kind: 'listing'; id: string }
    | { kind: 'pipeline'; id: string }
    | null
  > => {
    const linkedId = item.linked_deal_id ? String(item.linked_deal_id) : '';

    if (linkedId) {
      const { data: listingById, error: listingError } = await supabase
        .from('listings')
        .select('id')
        .eq('id', linkedId)
        .maybeSingle();
      if (listingError) throw listingError;
      if (listingById) return { kind: 'listing', id: listingById.id };

      const { data: pipelineById, error: pipelineError } = await supabase
        .from('deal_pipeline')
        .select('id')
        .eq('id', linkedId)
        .maybeSingle();
      if (pipelineError) throw pipelineError;
      if (pipelineById) return { kind: 'pipeline', id: pipelineById.id };
    }

    const remarketingSources = ['captarget', 'gp_partners', 'sourceco'];
    const candidateEmails = [item.to_email, item.sl_lead_email, item.from_email]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    for (const email of candidateEmails) {
      const { data: listingByEmail, error: listingError } = await supabase
        .from('listings')
        .select('id')
        .eq('main_contact_email', email)
        .in('deal_source', remarketingSources)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (listingError) throw listingError;
      if (listingByEmail) return { kind: 'listing', id: listingByEmail.id };
    }

    const companyGuess = companyFromEmail(String(item.to_email || item.sl_lead_email || ''));
    if (companyGuess) {
      const { data: listingByCompany, error: listingError } = await supabase
        .from('listings')
        .select('id')
        .or(`internal_company_name.ilike.%${companyGuess}%,title.ilike.%${companyGuess}%`)
        .in('deal_source', remarketingSources)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (listingError) throw listingError;
      if (listingByCompany) return { kind: 'listing', id: listingByCompany.id };
    }

    return null;
  };

  const handleViewDeal = async () => {
    setIsResolvingDeal(true);
    try {
      const resolved = await resolveLinkedDealRoute();

      if (!resolved) {
        if (item.linked_deal_id) {
          linkToDeal.mutate({ id: item.id, dealId: null });
        }
        toast.error('This linked deal no longer exists. Recreate it from this reply.');
        return;
      }

      if (resolved.kind === 'listing') {
        if (resolved.id !== item.linked_deal_id) {
          linkToDeal.mutate({ id: item.id, dealId: resolved.id });
        }
        navigate(`/admin/deals/${resolved.id}`);
        return;
      }

      navigate(`/admin/deals/pipeline?deal=${resolved.id}`);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to open linked deal');
    } finally {
      setIsResolvingDeal(false);
    }
  };

  return (
    <div className="space-y-4">
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
        <div className="lg:col-span-2 space-y-4">
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
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-3.5 w-3.5" /> Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{String(item.to_email || item.sl_lead_email || item.from_email || 'Unknown')}</span>
              </div>
              {item.to_name && (
                <div className="flex items-center gap-2">
                  <Building className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{String(item.to_name)}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  {item.time_replied || item.created_at
                    ? format(new Date(String(item.time_replied || item.created_at)), 'PPp')
                    : 'Unknown time'}
                </span>
              </div>
              {item.message_id && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Hash className="h-3.5 w-3.5 mt-0.5" />
                  <span className="break-all">{String(item.message_id)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Separator />

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
                      onClick={handleViewDeal}
                      disabled={isResolvingDeal}
                    >
                      {isResolvingDeal ? 'Opening...' : 'View Deal'}
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
                  onClick={() => setShowCreateDealDialog(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Create Lead from Reply
                </Button>
              )}
            </CardContent>
          </Card>

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

      <CreateDealFromReplyDialog
        open={showCreateDealDialog}
        onOpenChange={setShowCreateDealDialog}
        inboxItem={item as unknown as Record<string, unknown>}
      />
    </div>
  );
}
