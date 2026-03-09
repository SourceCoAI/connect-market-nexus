import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Mail, Linkedin, Phone, Send, Users } from 'lucide-react';
import { format } from 'date-fns';
import { DealOutreachProfileForm } from './DealOutreachProfileForm';
import { StatusBadge } from './StatusBadge';
import { OutreachInlineDetail } from './OutreachInlineDetail';
import { LaunchOutreachPanel } from './LaunchOutreachPanel';
import { useBuyerOutreachStatus } from './useBuyerOutreachStatus';

interface BuyerOutreachTabProps {
  dealId: string;
  dealName?: string;
}

interface BuyerContact {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  company_name: string | null;
  title: string | null;
  remarketing_buyer_id: string | null;
  buyer_type: string | null;
  buyer_company_name: string | null;
}

export function BuyerOutreachTab({ dealId, dealName }: BuyerOutreachTabProps) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [launchPanelOpen, setLaunchPanelOpen] = useState(false);

  // Fetch outreach profile existence
  const { data: profile } = useQuery({
    queryKey: ['deal-outreach-profile', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_outreach_profiles')
        .select('id')
        .eq('deal_id', dealId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!dealId,
  });

  // Fetch buyer contacts for this deal
  // Get buyers via deal_pipeline AND buyer_introductions linked to this listing
  const { data: buyers, isLoading: buyersLoading } = useQuery({
    queryKey: ['deal-buyer-contacts', dealId],
    queryFn: async () => {
      // Get buyer IDs from deal pipeline
      const { data: pipelineEntries } = await supabase
        .from('deal_pipeline')
        .select('remarketing_buyer_id')
        .eq('listing_id', dealId)
        .is('deleted_at', null)
        .not('remarketing_buyer_id', 'is', null);

      // Also get buyer introductions (includes embedded contact info as fallback)
      const { data: introEntries } = await supabase
        .from('buyer_introductions' as never)
        .select('id, remarketing_buyer_id, buyer_name, buyer_email, buyer_phone, buyer_linkedin_url, buyer_firm_name')
        .eq('listing_id', dealId)
        .is('archived_at', null)
        .not('remarketing_buyer_id', 'is', null);

      const typedIntroEntries = (introEntries || []) as Array<{
        id: string;
        remarketing_buyer_id: string;
        buyer_name: string;
        buyer_email: string | null;
        buyer_phone: string | null;
        buyer_linkedin_url: string | null;
        buyer_firm_name: string;
      }>;

      const buyerIds = [...new Set([
        ...(pipelineEntries || []).map(e => e.remarketing_buyer_id),
        ...typedIntroEntries.map(e => e.remarketing_buyer_id),
      ].filter(Boolean))] as string[];
      if (!buyerIds.length) return [];

      // Get contacts for these buyers
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone, linkedin_url, company_name, title, remarketing_buyer_id')
        .in('remarketing_buyer_id', buyerIds)
        .eq('archived', false);

      // Get buyer info
      const { data: buyerRows } = await supabase
        .from('buyers')
        .select('id, company_name, buyer_type')
        .in('id', buyerIds);

      const buyerMap = new Map((buyerRows || []).map(b => [b.id, b]));

      // Create contacts for buyer introductions that don't have one yet
      const contactsByBuyer = new Set((contacts || []).map(c => c.remarketing_buyer_id));
      const missingIntros = typedIntroEntries.filter(
        intro => !contactsByBuyer.has(intro.remarketing_buyer_id),
      );

      if (missingIntros.length > 0) {
        // Insert each missing contact individually — skip on conflict
        for (const intro of missingIntros) {
          const nameParts = intro.buyer_name.trim().split(/\s+/);
          try {
            await supabase
              .from('contacts')
              .insert({
                first_name: nameParts[0] || '',
                last_name: nameParts.slice(1).join(' ') || '',
                email: intro.buyer_email?.toLowerCase().trim() || null,
                phone: intro.buyer_phone || null,
                linkedin_url: intro.buyer_linkedin_url || null,
                company_name: intro.buyer_firm_name,
                contact_type: 'buyer',
                source: 'buyer_introduction',
                remarketing_buyer_id: intro.remarketing_buyer_id,
              });
          } catch {
            // Skip duplicates — contact already exists
          }
        }

        // Re-fetch all contacts now that new ones exist
        const { data: refreshedContacts } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, email, phone, linkedin_url, company_name, title, remarketing_buyer_id')
          .in('remarketing_buyer_id', buyerIds)
          .eq('archived', false);

        return (refreshedContacts || []).map(c => {
          const buyer = c.remarketing_buyer_id ? buyerMap.get(c.remarketing_buyer_id) : null;
          return {
            ...c,
            buyer_type: buyer?.buyer_type || null,
            buyer_company_name: buyer?.company_name || null,
          } as BuyerContact;
        });
      }

      return (contacts || []).map(c => {
        const buyer = c.remarketing_buyer_id ? buyerMap.get(c.remarketing_buyer_id) : null;
        return {
          ...c,
          buyer_type: buyer?.buyer_type || null,
          buyer_company_name: buyer?.company_name || null,
        } as BuyerContact;
      });
    },
    enabled: !!dealId,
  });

  const buyerIds = useMemo(() => (buyers || []).map(b => b.id), [buyers]);
  const { data: outreachStatusMap } = useBuyerOutreachStatus(dealId, buyerIds);

  const hasProfile = !!profile;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === (buyers?.length || 0)) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set((buyers || []).map(b => b.id)));
    }
  };

  const selectedBuyers = useMemo(
    () => (buyers || []).filter(b => selectedIds.has(b.id)),
    [buyers, selectedIds],
  );

  const channelIcon = (channel: string | null) => {
    switch (channel) {
      case 'email': return <Mail className="h-3 w-3" />;
      case 'linkedin': return <Linkedin className="h-3 w-3" />;
      case 'phone': return <Phone className="h-3 w-3" />;
      default: return null;
    }
  };

  const handleLaunchSuccess = () => {
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['buyer-outreach-events'] });
  };

  return (
    <div className="space-y-4">
      {/* Outreach Profile */}
      <DealOutreachProfileForm dealId={dealId} />

      {/* Buyer List */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Buyer Contacts
              {buyers && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({buyers.length})
                </span>
              )}
            </CardTitle>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      size="sm"
                      className="gap-2"
                      disabled={selectedIds.size === 0 || !hasProfile}
                      onClick={() => setLaunchPanelOpen(true)}
                    >
                      <Send className="h-4 w-4" />
                      Launch Outreach ({selectedIds.size})
                    </Button>
                  </div>
                </TooltipTrigger>
                {(selectedIds.size === 0 || !hasProfile) && (
                  <TooltipContent>
                    {!hasProfile
                      ? 'Complete the outreach profile first'
                      : 'Select at least one buyer to launch outreach'}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardHeader>
        <CardContent>
          {buyersLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !buyers?.length ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No buyer contacts found for this deal. Add buyers to the deal pipeline first.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              {/* Header row */}
              <div className="grid grid-cols-[40px_1fr_200px_160px_120px_120px_100px] gap-2 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                <div className="flex items-center justify-center">
                  <Checkbox
                    checked={selectedIds.size === buyers.length && buyers.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </div>
                <div>Contact</div>
                <div>Email</div>
                <div>Phone</div>
                <div>Channels</div>
                <div>Outreach Status</div>
                <div>Last Contact</div>
              </div>

              {/* Buyer rows */}
              {buyers.map(buyer => {
                const summary = outreachStatusMap?.get(buyer.id);
                const status = summary?.status || 'not_contacted';
                const isExpanded = expandedId === buyer.id;

                return (
                  <div key={buyer.id}>
                    <div className="grid grid-cols-[40px_1fr_120px_120px_100px] gap-2 px-3 py-2.5 border-b hover:bg-muted/20 transition-colors items-center">
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={selectedIds.has(buyer.id)}
                          onCheckedChange={() => toggleSelect(buyer.id)}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {buyer.first_name} {buyer.last_name}
                          </span>
                          {buyer.buyer_type && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {buyer.buyer_type.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                        {buyer.buyer_company_name && (
                          <p className="text-xs text-muted-foreground truncate">
                            {buyer.buyer_company_name}
                            {buyer.title && ` — ${buyer.title}`}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {buyer.email && (
                          <Mail className="h-3.5 w-3.5 text-blue-500" />
                        )}
                        {buyer.linkedin_url && (
                          <Linkedin className="h-3.5 w-3.5 text-blue-700" />
                        )}
                        {buyer.phone && (
                          <Phone className="h-3.5 w-3.5 text-green-600" />
                        )}
                        {!buyer.email && !buyer.linkedin_url && !buyer.phone && (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </div>

                      <div>
                        <StatusBadge
                          status={status}
                          onClick={() => setExpandedId(isExpanded ? null : buyer.id)}
                        />
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {summary?.lastEventDate ? (
                          <div className="flex items-center gap-1">
                            {channelIcon(summary.lastEventChannel)}
                            {format(new Date(summary.lastEventDate), 'MMM d')}
                          </div>
                        ) : (
                          '—'
                        )}
                      </div>
                    </div>

                    {/* Expanded inline detail */}
                    {isExpanded && summary && (
                      <OutreachInlineDetail
                        dealId={dealId}
                        buyerId={buyer.id}
                        summary={summary}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Launch panel */}
      <LaunchOutreachPanel
        open={launchPanelOpen}
        onOpenChange={setLaunchPanelOpen}
        dealId={dealId}
        dealName={dealName}
        selectedBuyers={selectedBuyers}
        onSuccess={handleLaunchSuccess}
      />
    </div>
  );
}
