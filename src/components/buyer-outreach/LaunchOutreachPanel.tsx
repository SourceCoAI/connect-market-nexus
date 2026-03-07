import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/integrations/supabase/client';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Mail, Linkedin, Phone, AlertTriangle, Loader2, FileText } from 'lucide-react';

interface OutreachProfile {
  deal_descriptor: string;
  geography: string;
  ebitda: string;
}

interface SelectedBuyer {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  linkedin_url: string | null;
  phone: string | null;
  remarketing_buyer_id: string | null;
}

interface LaunchOutreachPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  dealName?: string;
  selectedBuyers: SelectedBuyer[];
  onSuccess: () => void;
}

interface Campaign {
  id: number;
  name: string;
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
  const [phoneEnabled, setPhoneEnabled] = useState(true);
  const [smartleadCampaignId, setSmartleadCampaignId] = useState<string>('');
  const [heyreachCampaignId, setHeyreachCampaignId] = useState<string>('');
  const [isLaunching, setIsLaunching] = useState(false);

  // Fetch deal outreach profile
  const { data: profile } = useQuery({
    queryKey: ['deal-outreach-profile', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_outreach_profiles' as any)
        .select('deal_descriptor, geography, ebitda')
        .eq('deal_id', dealId)
        .single();
      if (error) throw error;
      return data as OutreachProfile | null;
    },
    enabled: !!dealId && open,
  });

  // Fetch Smartlead campaigns
  const { data: smartleadCampaigns } = useQuery({
    queryKey: ['smartlead-campaigns-active'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const res = await fetch(`${SUPABASE_URL}/functions/v1/smartlead-campaigns`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'list' }),
      });
      if (!res.ok) return [];
      const { campaigns } = await res.json();
      return (campaigns || [])
        .filter((c: any) => c.status === 'ACTIVE' || c.status === 'active')
        .map((c: any) => ({ id: c.id, name: c.name })) as Campaign[];
    },
    enabled: open && emailEnabled,
  });

  // Fetch HeyReach campaigns
  const { data: heyreachCampaigns } = useQuery({
    queryKey: ['heyreach-campaigns-active'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const res = await fetch(`${SUPABASE_URL}/functions/v1/heyreach-campaigns`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'list' }),
      });
      if (!res.ok) return [];
      const { campaigns } = await res.json();
      return (campaigns || [])
        .filter((c: any) => c.status === 'ACTIVE' || c.status === 'active' || !c.status)
        .map((c: any) => ({ id: c.id || c.campaignId, name: c.name })) as Campaign[];
    },
    enabled: open && linkedinEnabled,
  });

  // Compute skip warnings
  const warnings = useMemo(() => {
    const result: { channel: string; field: string; count: number }[] = [];
    if (emailEnabled) {
      const missing = selectedBuyers.filter(b => !b.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email));
      if (missing.length > 0) {
        result.push({ channel: 'Email', field: 'email', count: missing.length });
      }
    }
    if (linkedinEnabled) {
      const missing = selectedBuyers.filter(b => !b.linkedin_url);
      if (missing.length > 0) {
        result.push({ channel: 'LinkedIn', field: 'LinkedIn URL', count: missing.length });
      }
    }
    if (phoneEnabled) {
      const missing = selectedBuyers.filter(b => !b.phone);
      if (missing.length > 0) {
        result.push({ channel: 'Phone', field: 'phone number', count: missing.length });
      }
    }
    return result;
  }, [selectedBuyers, emailEnabled, linkedinEnabled, phoneEnabled]);

  const activeChannels = [
    emailEnabled && 'Email',
    linkedinEnabled && 'LinkedIn',
    phoneEnabled && 'Calls',
  ].filter(Boolean);

  const handleLaunch = async () => {
    if (!profile) {
      toast({ title: 'Complete the outreach profile first', variant: 'destructive' });
      return;
    }

    if (activeChannels.length === 0) {
      toast({ title: 'Select at least one channel', variant: 'destructive' });
      return;
    }

    setIsLaunching(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast({ title: 'Not authenticated', variant: 'destructive' });
      setIsLaunching(false);
      return;
    }

    const buyerIds = selectedBuyers.map(b => b.id);
    const results: { channel: string; pushed: number; errors: string[] }[] = [];

    try {
      // Launch all channels in parallel
      const promises: Promise<void>[] = [];

      if (emailEnabled && smartleadCampaignId) {
        promises.push(
          fetch(`${SUPABASE_URL}/functions/v1/push-buyer-to-smartlead`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              deal_id: dealId,
              buyer_ids: buyerIds,
              campaign_id: Number(smartleadCampaignId),
            }),
          })
            .then(r => r.json())
            .then(data => {
              results.push({ channel: 'Email', pushed: data.pushed || 0, errors: data.errors || [] });
            })
            .catch(err => {
              results.push({ channel: 'Email', pushed: 0, errors: [err.message] });
            }),
        );
      }

      if (linkedinEnabled && heyreachCampaignId) {
        promises.push(
          fetch(`${SUPABASE_URL}/functions/v1/push-buyer-to-heyreach`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              deal_id: dealId,
              buyer_ids: buyerIds,
              campaign_id: Number(heyreachCampaignId),
            }),
          })
            .then(r => r.json())
            .then(data => {
              results.push({ channel: 'LinkedIn', pushed: data.pushed || 0, errors: data.errors || [] });
            })
            .catch(err => {
              results.push({ channel: 'LinkedIn', pushed: 0, errors: [err.message] });
            }),
        );
      }

      if (phoneEnabled) {
        promises.push(
          fetch(`${SUPABASE_URL}/functions/v1/push-buyer-to-phoneburner`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              deal_id: dealId,
              buyer_ids: buyerIds,
            }),
          })
            .then(r => r.json())
            .then(data => {
              results.push({ channel: 'Calls', pushed: data.pushed || 0, errors: data.errors || [] });
            })
            .catch(err => {
              results.push({ channel: 'Calls', pushed: 0, errors: [err.message] });
            }),
        );
      }

      await Promise.all(promises);

      const totalPushed = results.reduce((sum, r) => sum + r.pushed, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      const channelSummary = results.map(r => r.channel).join(', ');

      if (totalPushed === 0 && totalErrors > 0) {
        // Full failure — keep panel open for retry
        toast({
          title: 'Launch failed',
          description: `${totalErrors} error(s) across ${channelSummary}. No contacts were pushed.`,
          variant: 'destructive',
        });
      } else if (totalErrors > 0) {
        // Partial success — close panel but warn
        toast({
          title: `Outreach launched with some issues`,
          description: `Pushed ${totalPushed} contacts across ${channelSummary}. ${totalErrors} error(s).`,
          variant: 'destructive',
        });
        onSuccess();
        onOpenChange(false);
      } else {
        // Full success
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
                    <span className="font-medium">{profile.ebitda}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Buyer Ref: </span>
                    <span className="text-xs italic text-muted-foreground">derived per buyer type</span>
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
                    <SelectValue placeholder="Select Smartlead campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    {(smartleadCampaigns || []).map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
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
                    {(heyreachCampaigns || []).map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-green-600" />
                  <Label htmlFor="phone-toggle">Calls (PhoneBurner)</Label>
                </div>
                <Switch
                  id="phone-toggle"
                  checked={phoneEnabled}
                  onCheckedChange={setPhoneEnabled}
                />
              </div>
            </div>
          </div>

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
                    {w.count} buyer{w.count !== 1 ? 's' : ''} will be skipped for {w.channel} — missing {w.field}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Launch button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleLaunch}
            disabled={isLaunching || !profile || activeChannels.length === 0}
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
