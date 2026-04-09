import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RefreshCw, ExternalLink, Zap, Mail, BarChart3, Webhook, Save, RotateCcw, ChevronDown, Brain, RotateCw } from 'lucide-react';
import { useSmartleadCampaigns, useSyncSmartleadCampaigns } from '@/hooks/smartlead';
import { useSmartleadWebhookEvents } from '@/hooks/smartlead';
import { SUPABASE_URL, supabase } from '@/integrations/supabase/client';
import {
  useSmartleadCategorizationStats,
  useSmartleadClassificationPrompt,
  saveClassificationPrompt,
} from '@/hooks/smartlead/use-smartlead-categorization';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

const DEFAULT_PROMPT = `You are an email reply classifier for a cold email outreach platform. Classify each reply into exactly one category and sentiment.

Categories:
- meeting_request: wants to schedule a call/meeting
- interested: expresses interest but no meeting request
- question: asking clarifying questions
- referral: directing to someone else
- not_now: timing issue, not rejecting
- not_interested: polite decline
- unsubscribe: explicit opt-out request
- out_of_office: automated OOO reply
- negative_hostile: angry/hostile response
- neutral: cannot determine intent

Sentiment values:
- positive: explicitly wants a meeting or call (maps to meeting_request category)
- activated: shows engagement, interest, asks questions, provides referral, or says "not right now" — anything other than a firm rejection (maps to interested, question, referral, not_now categories)
- negative: firm decline, hostile, or unsubscribe (maps to not_interested, unsubscribe, negative_hostile categories)
- neutral: out of office, cannot determine intent (maps to out_of_office, neutral categories)

is_positive should be true for positive and activated sentiments (meeting_request, interested, question, referral, and not_now categories).
When in doubt between "neutral" and "interested", prefer "interested" if the reply shows any engagement, curiosity, or willingness to learn more.`;

const CATEGORY_COLORS: Record<string, string> = {
  meeting_request: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  interested: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  question: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  referral: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  not_now: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  not_interested: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  unsubscribe: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  out_of_office: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  negative_hostile: 'bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  neutral: 'bg-muted text-muted-foreground',
};

function getCategoryLabel(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SmartleadSettingsPage() {
  const { data: campaignsData, isLoading } = useSmartleadCampaigns();
  const syncMutation = useSyncSmartleadCampaigns();
  const { data: webhookEvents } = useSmartleadWebhookEvents(10);
  const { data: catStats, isLoading: loadingStats } = useSmartleadCategorizationStats();
  const { data: savedPrompt, isLoading: loadingPrompt } = useSmartleadClassificationPrompt();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [promptText, setPromptText] = useState<string | null>(null);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [reclassifyingAll, setReclassifyingAll] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const localCampaigns = campaignsData?.local_campaigns || [];
  const remoteCampaigns = campaignsData?.campaigns || [];
  const webhookUrl = `${SUPABASE_URL}/functions/v1/smartlead-webhook`;

  // Initialize prompt text from saved or default
  const currentPrompt = promptText ?? savedPrompt ?? DEFAULT_PROMPT;

  const handleSavePrompt = async () => {
    setSavingPrompt(true);
    try {
      await saveClassificationPrompt(currentPrompt);
      queryClient.invalidateQueries({ queryKey: ['smartlead', 'classification-prompt'] });
      toast({ title: 'Saved', description: 'Classification prompt updated.' });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to save prompt.', variant: 'destructive' });
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleResetPrompt = () => {
    setPromptText(DEFAULT_PROMPT);
  };

  const handleReclassifyAll = async () => {
    setReclassifyingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke('smartlead-reclassify-all', {
        body: {},
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ['smartlead', 'categorization-stats'] });
      toast({
        title: 'Reclassification complete',
        description: `Processed ${data.total} records. ${data.changed} changed. Sentiment breakdown: ${Object.entries(data.by_sentiment || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
      });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to reclassify', variant: 'destructive' });
    } finally {
      setReclassifyingAll(false);
    }
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Smartlead Integration</h1>
            <p className="text-muted-foreground">
              Manage your Smartlead cold email campaigns and sync with platform contacts
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            Sync Campaigns
          </Button>
        </div>
      </div>

      {/* Connection Status */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Zap className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Connection</p>
            {isLoading ? (
              <Badge variant="outline" className="mt-1">Checking...</Badge>
            ) : remoteCampaigns.length > 0 || localCampaigns.length > 0 ? (
              <Badge className="mt-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">Connected</Badge>
            ) : (
              <Badge variant="destructive" className="mt-1">Not configured</Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Mail className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Remote Campaigns</p>
            <p className="text-xl font-bold mt-1">{remoteCampaigns.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <BarChart3 className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Tracked Locally</p>
            <p className="text-xl font-bold mt-1">{localCampaigns.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Webhook className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Webhook Events</p>
            <p className="text-xl font-bold mt-1">{webhookEvents?.length ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Response Categorization Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Response Categorization Matrix
          </CardTitle>
          <CardDescription>
            Breakdown of how Smartlead replies are being classified by AI
            {catStats && ` — ${catStats.total} total replies, ${catStats.totalOverrides} manual overrides`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingStats ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !catStats || catStats.categories.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No reply data yet.</p>
          ) : (
            <div className="space-y-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Category</TableHead>
                    <TableHead className="text-right w-[80px]">Count</TableHead>
                    <TableHead className="text-right w-[60px]">%</TableHead>
                    <TableHead className="text-right w-[100px]">Avg Confidence</TableHead>
                    <TableHead className="w-[200px]">Sentiment</TableHead>
                    <TableHead className="text-right w-[80px]">Overrides</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catStats.categories.map(cat => (
                    <Collapsible key={cat.category} open={expandedCategories.has(cat.category)} onOpenChange={() => toggleCategory(cat.category)} asChild>
                      <>
                        <CollapsibleTrigger asChild>
                          <TableRow className="cursor-pointer hover:bg-muted/50">
                            <TableCell>
                              <Badge className={`text-xs ${CATEGORY_COLORS[cat.category] || CATEGORY_COLORS.neutral}`}>
                                {getCategoryLabel(cat.category)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">{cat.count}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{cat.percentage}%</TableCell>
                            <TableCell className="text-right">
                              <span className={cat.avgConfidence >= 0.8 ? 'text-emerald-600' : cat.avgConfidence >= 0.5 ? 'text-amber-600' : 'text-red-500'}>
                                {(cat.avgConfidence * 100).toFixed(0)}%
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {Object.entries(cat.sentimentBreakdown).map(([s, c]) => (
                                  <Badge key={s} variant="outline" className="text-[10px] px-1.5">
                                    {s}: {c}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {cat.manualOverrides > 0 && (
                                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                                  {cat.manualOverrides}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedCategories.has(cat.category) ? 'rotate-180' : ''}`} />
                            </TableCell>
                          </TableRow>
                        </CollapsibleTrigger>
                        <CollapsibleContent asChild>
                          <>
                            {cat.examples.map(ex => (
                              <TableRow key={ex.id} className="bg-muted/20">
                                <TableCell colSpan={7} className="py-2">
                                  <div className="pl-4 text-xs space-y-0.5">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{ex.from_email || 'Unknown'}</span>
                                      <span className="text-muted-foreground">—</span>
                                      <span className="text-muted-foreground">{ex.subject || '(No subject)'}</span>
                                      {ex.time_replied && (
                                        <span className="text-muted-foreground ml-auto">
                                          {new Date(ex.time_replied).toLocaleDateString()}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-muted-foreground truncate max-w-[600px]">
                                      {ex.reply_preview || '(empty)'}
                                    </p>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Classification Prompt Editor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Response Classification Prompt
          </CardTitle>
          <CardDescription>
            Edit the AI system prompt used to classify incoming Smartlead replies. Changes apply to new replies only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingPrompt ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <Textarea
                value={currentPrompt}
                onChange={(e) => setPromptText(e.target.value)}
                rows={14}
                className="font-mono text-xs"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={handleSavePrompt} disabled={savingPrompt} size="sm">
                  <Save className="h-4 w-4 mr-1.5" />
                  {savingPrompt ? 'Saving...' : 'Save Prompt'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleResetPrompt}>
                  <RotateCcw className="h-4 w-4 mr-1.5" />
                  Reset to Default
                </Button>
                <div className="ml-auto">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleReclassifyAll}
                    disabled={reclassifyingAll}
                  >
                    <RotateCw className={`h-4 w-4 mr-1.5 ${reclassifyingAll ? 'animate-spin' : ''}`} />
                    {reclassifyingAll ? 'Reclassifying...' : 'Reclassify All Responses'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Setup</CardTitle>
          <CardDescription>Configure the Smartlead API key in your Supabase environment variables</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">1. API Key</h3>
            <p className="text-sm text-muted-foreground">
              Add <code className="bg-muted px-1.5 py-0.5 rounded text-xs">SMARTLEAD_API_KEY</code>{' '}
              to your Supabase Edge Function secrets.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">2. Webhook URL</h3>
            <p className="text-sm text-muted-foreground">Add this webhook URL in your Smartlead campaign settings:</p>
            <div className="flex items-center gap-2">
              <code className="bg-muted px-3 py-2 rounded text-xs flex-1 overflow-x-auto">{webhookUrl}</code>
              <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(webhookUrl)}>Copy</Button>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">3. Webhook Secret (Optional)</h3>
            <p className="text-sm text-muted-foreground">
              Set <code className="bg-muted px-1.5 py-0.5 rounded text-xs">SMARTLEAD_WEBHOOK_SECRET</code> for added security.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Recent Webhook Events */}
      {webhookEvents && webhookEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Webhook Events</CardTitle>
            <CardDescription>Latest events received from Smartlead</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {webhookEvents.map((event: Record<string, unknown>) => (
                <div key={event.id as string} className="flex items-center justify-between py-2 px-3 rounded bg-muted/50 text-sm">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">{event.event_type as string}</Badge>
                    <span className="text-muted-foreground">{(event.lead_email as string) || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {event.processed ? (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs">Processed</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Pending</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{new Date(event.created_at as string).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* External Link */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" asChild>
          <a href="https://app.smartlead.ai" target="_blank" rel="noopener noreferrer">
            Open Smartlead Dashboard
            <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}
