import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { sanitizeHtml } from '@/lib/sanitize';
import { useSmartleadCampaigns, useSmartleadSequences } from '@/hooks/smartlead';
import {
  extractTagsFromSequences,
  classifyTags,
  AVAILABLE_DATA_SOURCES,
  type ClassifiedTag,
} from '@/lib/merge-field-map';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import {
  Mail,
  Linkedin,
  AlertTriangle,
  Loader2,
  FileText,
  Eye,
  EyeOff,
  CheckCircle2,
  Info,
  CircleAlert,
} from 'lucide-react';

const DEFAULT_OUTREACH_TEMPLATE = `Hi {{first_name}},
We have an off-market {{deal_descriptor}} {{geography}} generating {{ebitda}} that could be a fit for {{buyer_ref}}.
Would you be interested in learning more?
Best,
[Sender Name]
SourceCo`;

interface SelectedBuyer {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  linkedin_url: string | null;
  phone: string | null;
  remarketing_buyer_id: string | null;
  buyer_company_name?: string | null;
  buyer_type?: string | null;
  pe_firm_name?: string | null;
  company_name?: string | null;
  title?: string | null;
}

interface LaunchOutreachPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  dealName?: string;
  selectedBuyers: SelectedBuyer[];
  onSuccess: () => void;
}

interface HeyReachCampaign {
  id: number;
  name: string;
}

/**
 * Derives the {{buyer_ref}} variable to match the edge function logic
 * in supabase/functions/_shared/derive-buyer-ref.ts
 */
function deriveBuyerRef(buyerType: string | null, peFirmName: string | null): string {
  const normalized = buyerType?.toLowerCase().trim() || '';
  if (normalized === 'private_equity' || normalized === 'pe_firm') {
    if (peFirmName && peFirmName.trim().length > 0) {
      return `your ${peFirmName.trim()} platform`;
    }
    return 'your portfolio';
  }
  if (normalized === 'independent_sponsor') return 'your deal pipeline';
  if (normalized === 'family_office') return 'your acquisition criteria';
  if (normalized === 'individual_buyer') return 'your search';
  if (normalized === 'corporate' || normalized === 'strategic') return 'your growth strategy';
  return 'your investment criteria';
}

/**
 * Builds a full replacement map from all available data sources.
 */
function buildReplacementMap(
  profile: { deal_descriptor: string; geography: string; ebitda: string } | null,
  buyer: SelectedBuyer | null,
  customMappings: Record<string, string>,
): Record<string, string> {
  const ebitdaFormatted = profile?.ebitda
    ? `$${Number(profile.ebitda.replace(/,/g, '')).toLocaleString('en-US')}`
    : '';
  const buyerRef = deriveBuyerRef(buyer?.buyer_type || null, buyer?.pe_firm_name || null);

  // All available field values keyed by field name
  const fieldValues: Record<string, string> = {
    first_name: buyer?.first_name || '',
    last_name: buyer?.last_name || '',
    email: buyer?.email || '',
    phone: buyer?.phone || '',
    company_name: buyer?.company_name || buyer?.buyer_company_name || '',
    title: buyer?.title || '',
    deal_descriptor: profile?.deal_descriptor || '',
    geography: profile?.geography || '',
    ebitda: ebitdaFormatted,
    buyer_ref: buyerRef,
    sourceco_deal_id: '',
    sourceco_buyer_id: buyer?.id || '',
    buyer_type: buyer?.buyer_type || '',
    buyer_company_name: buyer?.buyer_company_name || '',
    pe_firm_name: buyer?.pe_firm_name || '',
  };

  // Build the replacement map: tag → resolved value
  const map: Record<string, string> = { ...fieldValues };

  // Add custom mappings: unknown tag → value from mapped source field
  for (const [tag, sourceField] of Object.entries(customMappings)) {
    map[tag] = fieldValues[sourceField] || '';
  }

  return map;
}

/**
 * Replaces all {{tag}} occurrences and Handlebars {{#if tag}} blocks in template text.
 */
function renderWithReplacements(text: string, map: Record<string, string>): string {
  if (!text) return text;

  // First handle Handlebars {{#if tag}}...{{else}}...{{/if}} blocks
  let result = text.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{(?:else)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, tag, ifContent, elseContent) => {
      const value = map[tag];
      if (value && value.trim()) {
        // Recursively replace tags within the if-content
        return renderWithReplacements(ifContent, map);
      }
      return renderWithReplacements(elseContent, map);
    },
  );

  // Handle {{#if tag}}...{{/if}} without else
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, tag, ifContent) => {
      const value = map[tag];
      if (value && value.trim()) {
        return renderWithReplacements(ifContent, map);
      }
      return '';
    },
  );

  // Replace simple {{tag}} tokens
  result = result.replace(/\{\{(\w+)\}\}/g, (_match, tag) => {
    return map[tag] ?? `{{${tag}}}`;
  });

  return result;
}

/**
 * Gets the first non-deleted sequence step content (checking variants first).
 */
function getFirstStepContent(
  sequences: {
    seq_number: number;
    subject?: string;
    email_body?: string;
    sequence_variants?: Array<{
      subject?: string;
      email_body?: string;
      is_deleted?: boolean;
      variant_label?: string;
    }> | null;
  }[],
): { subject: string; body: string } | null {
  if (!sequences?.length) return null;

  const sorted = [...sequences].sort((a, b) => a.seq_number - b.seq_number);
  for (const seq of sorted) {
    // Check non-deleted variants first (SmartLead uses variants for A/B testing)
    if (seq.sequence_variants?.length) {
      const activeVariant = seq.sequence_variants.find((v) => !v.is_deleted);
      if (activeVariant && (activeVariant.subject || activeVariant.email_body)) {
        return {
          subject: activeVariant.subject || '',
          body: activeVariant.email_body || '',
        };
      }
    }
    // Fall back to parent-level content
    if (seq.subject || seq.email_body) {
      return { subject: seq.subject || '', body: seq.email_body || '' };
    }
  }
  return null;
}

export function LaunchOutreachPanel({
  open,
  onOpenChange,
  dealId,
  dealName,
  selectedBuyers,
  onSuccess,
}: LaunchOutreachPanelProps) {
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [linkedinEnabled, setLinkedinEnabled] = useState(true);
  const [smartleadCampaignId, setSmartleadCampaignId] = useState<string>('');
  const [heyreachCampaignId, setHeyreachCampaignId] = useState<string>('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [customMappings, setCustomMappings] = useState<Record<string, string>>({});

  // Reset state when panel opens with new buyers
  useEffect(() => {
    if (open) {
      setEmailEnabled(true);
      setLinkedinEnabled(true);
      setSmartleadCampaignId('');
      setHeyreachCampaignId('');
      setIsLaunching(false);
      setShowPreview(true);
      setCustomMappings({});
    }
  }, [open]);

  // Reset custom mappings when campaign changes
  useEffect(() => {
    setCustomMappings({});
  }, [smartleadCampaignId]);

  // Fetch deal outreach profile
  const { data: profile } = useQuery({
    queryKey: ['deal-outreach-profile', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_outreach_profiles')
        .select('deal_descriptor, geography, ebitda')
        .eq('deal_id', dealId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!dealId && open,
  });

  // Fetch outreach message template from app_settings (fallback only)
  const { data: messageTemplate } = useQuery({
    queryKey: ['outreach-message-template'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'outreach_message_template')
        .maybeSingle();
      if (error) throw error;
      return data?.value || DEFAULT_OUTREACH_TEMPLATE;
    },
    enabled: open,
  });

  const fallbackTemplate = messageTemplate || DEFAULT_OUTREACH_TEMPLATE;

  // ─── Smartlead campaigns (reuse existing hook) ────────────────────────
  const { data: campaignsData, isLoading: campaignsLoading } = useSmartleadCampaigns();

  const smartleadCampaigns = useMemo(() => {
    const campaigns = campaignsData?.campaigns ?? [];
    return campaigns.filter(
      (c) => c.status === 'ACTIVE' || c.status === 'DRAFTED' || c.status === 'PAUSED',
    );
  }, [campaignsData]);

  // ─── Fetch sequences for selected campaign ───────────────────────────
  const campaignIdNum = smartleadCampaignId ? Number(smartleadCampaignId) : null;
  const { data: sequencesData, isLoading: sequencesLoading } = useSmartleadSequences(
    emailEnabled ? campaignIdNum : null,
  );

  const sequences = useMemo(() => sequencesData?.sequences ?? [], [sequencesData]);

  // ─── Extract and classify merge tags ──────────────────────────────────
  const mergeFieldAudit = useMemo(() => {
    if (!sequences.length) return null;

    const tags = extractTagsFromSequences(sequences);
    const classified = classifyTags(tags);
    const needsMapping = classified.filter(
      (t) => t.status === 'needs-mapping' && !customMappings[t.tag],
    );

    return {
      tags: classified,
      hasUnmapped: needsMapping.length > 0,
      unmappedTags: needsMapping.map((t) => t.tag),
    };
  }, [sequences, customMappings]);

  // ─── Fetch HeyReach campaigns ─────────────────────────────────────────
  const { data: heyreachCampaigns } = useQuery({
    queryKey: ['heyreach-campaigns-active'],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return [];
      const res = await fetch(`${SUPABASE_URL}/functions/v1/heyreach-campaigns`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'list' }),
      });
      if (!res.ok) return [];
      const { campaigns } = await res.json();
      return (campaigns || [])
        .filter(
          (c: Record<string, unknown>) =>
            c.status === 'ACTIVE' || c.status === 'active' || !c.status,
        )
        .map((c: Record<string, unknown>) => ({
          id: c.id || c.campaignId,
          name: c.name,
        })) as HeyReachCampaign[];
    },
    enabled: open && linkedinEnabled,
  });

  // Compute skip warnings
  const warnings = useMemo(() => {
    const result: { channel: string; field: string; count: number }[] = [];
    if (emailEnabled) {
      const missing = selectedBuyers.filter(
        (b) => !b.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email),
      );
      if (missing.length > 0) {
        result.push({ channel: 'Email', field: 'email', count: missing.length });
      }
    }
    if (linkedinEnabled) {
      const missing = selectedBuyers.filter((b) => !b.linkedin_url);
      if (missing.length > 0) {
        result.push({ channel: 'LinkedIn', field: 'LinkedIn URL', count: missing.length });
      }
    }
    return result;
  }, [selectedBuyers, emailEnabled, linkedinEnabled]);

  const activeChannels = [emailEnabled && 'Email', linkedinEnabled && 'LinkedIn'].filter(Boolean);

  // Check if enabled channels have their campaigns selected
  const emailReady = !emailEnabled || !!smartleadCampaignId;
  const linkedinReady = !linkedinEnabled || !!heyreachCampaignId;
  const allChannelsReady = emailReady && linkedinReady;
  const mergeFieldsReady = !emailEnabled || !mergeFieldAudit || !mergeFieldAudit.hasUnmapped;

  // Pick first buyer with email for the preview
  const previewBuyer = useMemo(() => {
    return selectedBuyers.find((b) => b.email) || selectedBuyers[0] || null;
  }, [selectedBuyers]);

  // Build replacement map for preview
  const replacementMap = useMemo(() => {
    return buildReplacementMap(profile || null, previewBuyer, customMappings);
  }, [profile, previewBuyer, customMappings]);

  // Get actual campaign content for preview
  const campaignContent = useMemo(() => {
    return getFirstStepContent(sequences);
  }, [sequences]);

  // Rendered preview — use actual campaign content if available, else fallback
  const renderedPreview = useMemo(() => {
    if (campaignContent) {
      return {
        subject: renderWithReplacements(campaignContent.subject, replacementMap),
        body: renderWithReplacements(campaignContent.body, replacementMap),
        isFromCampaign: true,
      };
    }
    return {
      subject: '',
      body: renderWithReplacements(fallbackTemplate, replacementMap),
      isFromCampaign: false,
    };
  }, [campaignContent, fallbackTemplate, replacementMap]);

  const handleLaunch = async () => {
    if (!profile) {
      toast({ title: 'Complete the outreach profile first', variant: 'destructive' });
      return;
    }

    if (activeChannels.length === 0) {
      toast({ title: 'Select at least one channel', variant: 'destructive' });
      return;
    }

    if (mergeFieldAudit?.hasUnmapped) {
      toast({
        title: 'Unmapped merge fields',
        description: `Map all merge fields before launching: ${mergeFieldAudit.unmappedTags.join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    setIsLaunching(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      toast({ title: 'Not authenticated', variant: 'destructive' });
      setIsLaunching(false);
      return;
    }

    const buyerIds = selectedBuyers.map((b) => b.id);
    const results: { channel: string; pushed: number; errors: string[] }[] = [];

    try {
      // Launch all channels in parallel
      const promises: Promise<void>[] = [];

      if (emailEnabled && smartleadCampaignId) {
        // Include custom mappings if any unknown tags were mapped by the user
        const hasCustomMappings = Object.keys(customMappings).length > 0;

        promises.push(
          fetch(`${SUPABASE_URL}/functions/v1/push-buyer-to-smartlead`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              deal_id: dealId,
              buyer_ids: buyerIds,
              campaign_id: Number(smartleadCampaignId),
              ...(hasCustomMappings ? { custom_fields_override: customMappings } : {}),
            }),
          })
            .then((r) => r.json())
            .then((data) => {
              results.push({
                channel: 'Email',
                pushed: data.pushed || 0,
                errors: data.errors || [],
              });
            })
            .catch((err) => {
              results.push({ channel: 'Email', pushed: 0, errors: [err.message] });
            }),
        );
      }

      if (linkedinEnabled && heyreachCampaignId) {
        promises.push(
          fetch(`${SUPABASE_URL}/functions/v1/push-buyer-to-heyreach`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              deal_id: dealId,
              buyer_ids: buyerIds,
              campaign_id: Number(heyreachCampaignId),
            }),
          })
            .then((r) => r.json())
            .then((data) => {
              results.push({
                channel: 'LinkedIn',
                pushed: data.pushed || 0,
                errors: data.errors || [],
              });
            })
            .catch((err) => {
              results.push({ channel: 'LinkedIn', pushed: 0, errors: [err.message] });
            }),
        );
      }

      await Promise.all(promises);

      const totalPushed = results.reduce((sum, r) => sum + r.pushed, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      const channelSummary = results.map((r) => r.channel).join(', ');

      if (totalPushed === 0 && totalErrors > 0) {
        toast({
          title: 'Launch failed',
          description: `${totalErrors} error(s) across ${channelSummary}. No contacts were pushed.`,
          variant: 'destructive',
        });
      } else if (totalErrors > 0) {
        toast({
          title: `Outreach launched with some issues`,
          description: `Pushed ${totalPushed} contacts across ${channelSummary}. ${totalErrors} error(s).`,
          variant: 'destructive',
        });
        onSuccess();
        onOpenChange(false);
      } else {
        toast({
          title: `Outreach launched for ${selectedBuyers.length} buyers`,
          description: `Channels: ${channelSummary}`,
        });
        onSuccess();
        onOpenChange(false);
      }
    } catch (err) {
      toast({
        title: 'Launch failed',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Launch Outreach{dealName ? ` — ${dealName}` : ''}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {selectedBuyers.length} buyer{selectedBuyers.length !== 1 ? 's' : ''} selected
          </p>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Deal outreach profile preview */}
          {profile ? (
            <Card>
              <CardContent className="py-3">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Outreach Variables
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1.5 text-sm">
                  <div>
                    <span className="text-muted-foreground">Descriptor: </span>
                    <span className="font-medium">{profile.deal_descriptor}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Geography: </span>
                    <span className="font-medium">{profile.geography}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">EBITDA: </span>
                    <span className="font-medium">
                      {profile.ebitda
                        ? `$${Number(profile.ebitda.replace(/,/g, '')).toLocaleString('en-US')}`
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Buyer Ref: </span>
                    <span className="text-xs italic text-muted-foreground">
                      derived per buyer type
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="py-3 text-sm text-amber-800">
                Outreach profile not set up. Complete the profile before launching.
              </CardContent>
            </Card>
          )}

          {/* Channel toggles */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Channels</h4>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-blue-600" />
                  <Label htmlFor="email-toggle">Email (Smartlead)</Label>
                </div>
                <Switch
                  id="email-toggle"
                  checked={emailEnabled}
                  onCheckedChange={setEmailEnabled}
                />
              </div>
              {emailEnabled && (
                <Select value={smartleadCampaignId} onValueChange={setSmartleadCampaignId}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue
                      placeholder={
                        campaignsLoading ? 'Loading campaigns...' : 'Select Smartlead campaign'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {smartleadCampaigns.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        <div className="flex items-center gap-2">
                          <span>{c.name}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5">
                            {c.status}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Linkedin className="h-4 w-4 text-blue-700" />
                  <Label htmlFor="linkedin-toggle">LinkedIn (HeyReach)</Label>
                </div>
                <Switch
                  id="linkedin-toggle"
                  checked={linkedinEnabled}
                  onCheckedChange={setLinkedinEnabled}
                />
              </div>
              {linkedinEnabled && (
                <Select value={heyreachCampaignId} onValueChange={setHeyreachCampaignId}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select HeyReach campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    {(heyreachCampaigns || []).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Campaign Merge Fields audit */}
          {emailEnabled && smartleadCampaignId && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Campaign Merge Fields</h4>
              {sequencesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading campaign sequences...
                </div>
              ) : mergeFieldAudit ? (
                <Card>
                  <CardContent className="py-3">
                    <div className="space-y-2">
                      {mergeFieldAudit.tags.map((t: ClassifiedTag) => (
                        <MergeFieldRow
                          key={t.tag}
                          tag={t}
                          replacementMap={replacementMap}
                          customMapping={customMappings[t.tag]}
                          onMap={(sourceField) =>
                            setCustomMappings((prev) => ({ ...prev, [t.tag]: sourceField }))
                          }
                        />
                      ))}
                    </div>
                    {mergeFieldAudit.hasUnmapped && (
                      <div className="flex items-start gap-2 mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                        <CircleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>
                          Map all merge fields before launching:{' '}
                          {mergeFieldAudit.unmappedTags.map((t) => `{{${t}}}`).join(', ')}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="text-xs text-muted-foreground py-1">
                  No sequences found in this campaign.
                </div>
              )}
            </div>
          )}

          {/* Message Preview */}
          {emailEnabled && profile && previewBuyer && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">
                  {renderedPreview.isFromCampaign ? 'Campaign Preview (Step 1)' : 'Message Preview'}
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setShowPreview(!showPreview)}
                >
                  {showPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showPreview ? 'Hide' : 'Show'}
                </Button>
              </div>
              {showPreview && (
                <>
                  <div className="text-xs text-muted-foreground mb-1">
                    Preview for:{' '}
                    <span className="font-medium">
                      {previewBuyer.first_name} {previewBuyer.last_name}
                    </span>
                    {(previewBuyer.buyer_company_name || previewBuyer.company_name) && (
                      <span>
                        {' '}
                        at{' '}
                        <span className="font-medium">
                          {previewBuyer.buyer_company_name || previewBuyer.company_name}
                        </span>
                      </span>
                    )}
                  </div>
                  <Card className="bg-muted/30">
                    <CardContent className="py-3">
                      {renderedPreview.subject && (
                        <div className="text-sm font-semibold mb-2 pb-2 border-b">
                          Subject: {renderedPreview.subject}
                        </div>
                      )}
                      {renderedPreview.isFromCampaign ? (
                        <div
                          className="text-sm leading-relaxed [&_br]:block [&_div]:mb-1"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderedPreview.body) }}
                        />
                      ) : (
                        <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                          {renderedPreview.body}
                        </pre>
                      )}
                    </CardContent>
                  </Card>
                  {!renderedPreview.isFromCampaign && (
                    <p className="text-xs text-muted-foreground">
                      Select a campaign to preview actual email content.{' '}
                      <a
                        href="/admin/settings/outreach"
                        className="text-primary underline"
                        target="_blank"
                      >
                        Outreach Settings
                      </a>
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              {warnings.map((w) => (
                <div
                  key={w.channel}
                  className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {w.count} buyer{w.count !== 1 ? 's' : ''} will be skipped for {w.channel} —
                    missing {w.field}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Campaign selection hints */}
          {emailEnabled && !smartleadCampaignId && (
            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Select a Smartlead campaign to enable email outreach</span>
            </div>
          )}
          {linkedinEnabled && !heyreachCampaignId && (
            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Select a HeyReach campaign to enable LinkedIn outreach</span>
            </div>
          )}

          {/* Launch button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleLaunch}
            disabled={
              isLaunching ||
              !profile ||
              activeChannels.length === 0 ||
              !allChannelsReady ||
              !mergeFieldsReady
            }
          >
            {isLaunching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Launching...
              </>
            ) : (
              `Launch Outreach for ${selectedBuyers.length} buyer${selectedBuyers.length !== 1 ? 's' : ''}`
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Merge field row component ────────────────────────────────────────────

function MergeFieldRow({
  tag,
  replacementMap,
  customMapping,
  onMap,
}: {
  tag: ClassifiedTag;
  replacementMap: Record<string, string>;
  customMapping?: string;
  onMap: (sourceField: string) => void;
}) {
  if (tag.status === 'system') {
    return (
      <div className="flex items-center gap-2 text-xs">
        <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
        <code className="bg-muted px-1 py-0.5 rounded text-[11px]">{`{{${tag.tag}}}`}</code>
        <span className="text-muted-foreground">Handled by SmartLead</span>
      </div>
    );
  }

  if (tag.status === 'auto-mapped') {
    const value = replacementMap[tag.tag];
    return (
      <div className="flex items-center gap-2 text-xs">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
        <code className="bg-muted px-1 py-0.5 rounded text-[11px]">{`{{${tag.tag}}}`}</code>
        <span className="text-muted-foreground">{tag.label}</span>
        {value && (
          <span className="text-foreground font-medium truncate max-w-[150px]" title={value}>
            = {value}
          </span>
        )}
      </div>
    );
  }

  // needs-mapping
  return (
    <div className="flex items-center gap-2 text-xs">
      <CircleAlert className="h-3.5 w-3.5 text-red-500 shrink-0" />
      <code className="bg-muted px-1 py-0.5 rounded text-[11px]">{`{{${tag.tag}}}`}</code>
      <Select value={customMapping || ''} onValueChange={onMap}>
        <SelectTrigger className="h-6 text-[11px] w-[160px]">
          <SelectValue placeholder="Map to field..." />
        </SelectTrigger>
        <SelectContent>
          {AVAILABLE_DATA_SOURCES.map((ds) => (
            <SelectItem key={ds.value} value={ds.value} className="text-xs">
              <span className="text-muted-foreground">{ds.group}:</span> {ds.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
