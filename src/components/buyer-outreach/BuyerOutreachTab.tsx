import { useState, useMemo, useRef, useCallback } from 'react';
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
import { Mail, Linkedin, Phone, Send, Users, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { BuyerTypeBadge } from '@/components/admin/deals/buyer-introductions/shared/BuyerTypeBadge';
import { format } from 'date-fns';
import { DealOutreachProfileForm } from './DealOutreachProfileForm';
import { StatusBadge } from './StatusBadge';
import { OutreachInlineDetail } from './OutreachInlineDetail';
import { LaunchOutreachPanel } from './LaunchOutreachPanel';
import { useBuyerOutreachStatus } from './useBuyerOutreachStatus';
import { cn } from '@/lib/utils';

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
  is_pe_backed: boolean | null;
  buyer_company_name: string | null;
  pe_firm_name: string | null;
}

type SortField = 'name' | 'company' | 'title' | 'type' | 'email' | 'phone' | 'status' | 'lastContact';
type SortDir = 'asc' | 'desc';

const DEFAULT_WIDTHS: Record<string, number> = {
  checkbox: 40,
  name: 160,
  company: 160,
  title: 140,
  type: 110,
  email: 200,
  phone: 160,
  channels: 120,
  status: 120,
  lastContact: 100,
};

const COLUMNS: { key: string; label: string; sortable: boolean; minWidth: number }[] = [
  { key: 'checkbox', label: '', sortable: false, minWidth: 36 },
  { key: 'name', label: 'Name', sortable: true, minWidth: 80 },
  { key: 'company', label: 'Company', sortable: true, minWidth: 80 },
  { key: 'title', label: 'Title', sortable: true, minWidth: 60 },
  { key: 'type', label: 'Type', sortable: true, minWidth: 60 },
  { key: 'email', label: 'Email', sortable: true, minWidth: 80 },
  { key: 'phone', label: 'Phone', sortable: true, minWidth: 80 },
  { key: 'channels', label: 'Channels', sortable: false, minWidth: 60 },
  { key: 'status', label: 'Outreach Status', sortable: true, minWidth: 80 },
  { key: 'lastContact', label: 'Last Contact', sortable: true, minWidth: 60 },
];

export function BuyerOutreachTab({ dealId, dealName }: BuyerOutreachTabProps) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [launchPanelOpen, setLaunchPanelOpen] = useState(false);
  const [colWidths, setColWidths] = useState<Record<string, number>>({ ...DEFAULT_WIDTHS });
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir } | null>(null);

  // Resize logic
  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[key] || DEFAULT_WIDTHS[key];
    resizingRef.current = { key, startX, startW };
    const col = COLUMNS.find(c => c.key === key);
    const minW = col?.minWidth || 40;

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const diff = ev.clientX - resizingRef.current.startX;
      setColWidths(prev => ({ ...prev, [key]: Math.max(minW, resizingRef.current!.startW + diff) }));
    };
    const onUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colWidths]);

  

  // Sort toggle
  const toggleSort = (field: SortField) => {
    setSort(prev => {
      if (prev?.field === field) {
        if (prev.dir === 'asc') return { field, dir: 'desc' };
        return null; // third click clears
      }
      return { field, dir: 'asc' };
    });
  };

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

  const { data: buyers, isLoading: buyersLoading } = useQuery({
    queryKey: ['deal-buyer-contacts', dealId],
    queryFn: async () => {
      const { data: pipelineEntries } = await supabase
        .from('deal_pipeline')
        .select('remarketing_buyer_id')
        .eq('listing_id', dealId)
        .is('deleted_at', null)
        .not('remarketing_buyer_id', 'is', null);

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

      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone, linkedin_url, company_name, title, remarketing_buyer_id')
        .in('remarketing_buyer_id', buyerIds)
        .eq('archived', false);

      const { data: buyerRows } = await supabase
        .from('buyers')
        .select('id, company_name, buyer_type, is_pe_backed, pe_firm_name')
        .in('id', buyerIds);

      const buyerMap = new Map((buyerRows || []).map(b => [b.id, b]));

      const contactsByBuyer = new Set((contacts || []).map(c => c.remarketing_buyer_id));
      const missingIntros = typedIntroEntries.filter(
        intro => !contactsByBuyer.has(intro.remarketing_buyer_id),
      );

      if (missingIntros.length > 0) {
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
            // Skip duplicates
          }
        }

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
            is_pe_backed: buyer?.is_pe_backed || null,
            buyer_company_name: buyer?.company_name || null,
            pe_firm_name: buyer?.pe_firm_name || null,
          } as BuyerContact;
        });
      }

      return (contacts || []).map(c => {
        const buyer = c.remarketing_buyer_id ? buyerMap.get(c.remarketing_buyer_id) : null;
        return {
          ...c,
          buyer_type: buyer?.buyer_type || null,
          is_pe_backed: buyer?.is_pe_backed || null,
          buyer_company_name: buyer?.company_name || null,
          pe_firm_name: buyer?.pe_firm_name || null,
        } as BuyerContact;
      });
    },
    enabled: !!dealId,
  });

  const buyerIds = useMemo(() => (buyers || []).map(b => b.id), [buyers]);
  const { data: outreachStatusMap } = useBuyerOutreachStatus(dealId, buyerIds);

  // Sort buyers
  const sortedBuyers = useMemo(() => {
    if (!buyers) return [];
    if (!sort) return buyers;
    const { field, dir } = sort;
    const mult = dir === 'asc' ? 1 : -1;

    return [...buyers].sort((a, b) => {
      let av = '', bv = '';
      switch (field) {
        case 'name':
          av = `${a.first_name} ${a.last_name}`.toLowerCase();
          bv = `${b.first_name} ${b.last_name}`.toLowerCase();
          break;
        case 'company':
          av = (a.buyer_company_name || '').toLowerCase();
          bv = (b.buyer_company_name || '').toLowerCase();
          break;
        case 'title':
          av = (a.title || '').toLowerCase();
          bv = (b.title || '').toLowerCase();
          break;
        case 'type':
          av = (a.buyer_type || '').toLowerCase();
          bv = (b.buyer_type || '').toLowerCase();
          break;
        case 'email':
          av = (a.email || '').toLowerCase();
          bv = (b.email || '').toLowerCase();
          break;
        case 'phone':
          av = (a.phone || '');
          bv = (b.phone || '');
          break;
        case 'status':
          av = outreachStatusMap?.get(a.id)?.status || 'not_contacted';
          bv = outreachStatusMap?.get(b.id)?.status || 'not_contacted';
          break;
        case 'lastContact':
          av = outreachStatusMap?.get(a.id)?.lastEventDate || '';
          bv = outreachStatusMap?.get(b.id)?.lastEventDate || '';
          break;
      }
      if (av < bv) return -1 * mult;
      if (av > bv) return 1 * mult;
      return 0;
    });
  }, [buyers, sort, outreachStatusMap]);

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

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sort?.field !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sort.dir === 'asc'
      ? <ArrowUp className="h-3 w-3 text-primary" />
      : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  const renderHeaderCell = (col: typeof COLUMNS[number]) => {
    const sortField = col.key as SortField;
    return (
      <div
        key={col.key}
        className={cn(
          "relative flex items-center gap-1 select-none",
          col.sortable && "cursor-pointer hover:text-foreground"
        )}
        style={{ width: colWidths[col.key] || DEFAULT_WIDTHS[col.key], minWidth: col.minWidth }}
        onClick={col.sortable ? () => toggleSort(sortField) : undefined}
      >
        {col.key === 'checkbox' ? (
          <div className="flex items-center justify-center w-full">
            <Checkbox
              checked={selectedIds.size === (buyers?.length || 0) && (buyers?.length || 0) > 0}
              onCheckedChange={toggleSelectAll}
            />
          </div>
        ) : (
          <>
            <span className="truncate">{col.label}</span>
            {col.sortable && <SortIcon field={sortField} />}
          </>
        )}
        {/* Resize handle */}
        {col.key !== 'checkbox' && (
          <div
            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 transition-colors z-10"
            onMouseDown={(e) => handleResizeStart(e, col.key)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <DealOutreachProfileForm dealId={dealId} />

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
            <div className="border rounded-lg overflow-x-auto">
              {/* Header */}
              <div
                className="flex gap-2 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b"
                style={{ minWidth: 'fit-content' }}
              >
                {COLUMNS.map(renderHeaderCell)}
              </div>

              {/* Rows */}
              {sortedBuyers.map(buyer => {
                const summary = outreachStatusMap?.get(buyer.id);
                const status = summary?.status || 'not_contacted';
                const isExpanded = expandedId === buyer.id;

                return (
                  <div key={buyer.id}>
                    <div
                      className="flex gap-2 px-3 py-2.5 border-b hover:bg-muted/20 transition-colors items-center"
                      style={{ minWidth: 'fit-content' }}
                    >
                      <div style={{ width: colWidths.checkbox, minWidth: 36 }} className="flex items-center justify-center shrink-0">
                        <Checkbox
                          checked={selectedIds.has(buyer.id)}
                          onCheckedChange={() => toggleSelect(buyer.id)}
                        />
                      </div>

                      <div style={{ width: colWidths.name, minWidth: 80 }} className="min-w-0 shrink-0">
                        <span className="font-medium text-sm truncate block">
                          {buyer.first_name} {buyer.last_name}
                        </span>
                      </div>

                      <div style={{ width: colWidths.company, minWidth: 80 }} className="min-w-0 shrink-0">
                        <span className="text-xs text-muted-foreground truncate block">
                          {buyer.buyer_company_name || '—'}
                        </span>
                        {buyer.is_pe_backed && buyer.buyer_type === 'corporate' && buyer.pe_firm_name && (
                          <span className="text-[10px] text-muted-foreground/70 truncate block" title={buyer.pe_firm_name}>
                            via {buyer.pe_firm_name}
                          </span>
                        )}
                      </div>

                      <div style={{ width: colWidths.title, minWidth: 60 }} className="min-w-0 shrink-0">
                        <span className="text-xs text-muted-foreground truncate block">
                          {buyer.title || '—'}
                        </span>
                      </div>

                      <div style={{ width: colWidths.type, minWidth: 60 }} className="min-w-0 shrink-0">
                        {buyer.buyer_type ? (
                          <BuyerTypeBadge buyerType={buyer.buyer_type} isPeBacked={buyer.is_pe_backed ?? false} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>

                      <div style={{ width: colWidths.email, minWidth: 80 }} className="min-w-0 shrink-0">
                        {buyer.email ? (
                          <a href={`mailto:${buyer.email}`} className="text-xs text-primary hover:underline truncate block" title={buyer.email}>
                            {buyer.email}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>

                      <div style={{ width: colWidths.phone, minWidth: 80 }} className="min-w-0 shrink-0">
                        {buyer.phone ? (
                          <a href={`tel:${buyer.phone}`} className="text-xs text-foreground hover:underline truncate block" title={buyer.phone}>
                            {buyer.phone}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>

                      <div style={{ width: colWidths.channels, minWidth: 60 }} className="flex items-center gap-1.5 shrink-0">
                        {buyer.email && <Mail className="h-3.5 w-3.5 text-primary" />}
                        {buyer.linkedin_url && <Linkedin className="h-3.5 w-3.5 text-primary" />}
                        {buyer.phone && <Phone className="h-3.5 w-3.5 text-primary" />}
                        {!buyer.email && !buyer.linkedin_url && !buyer.phone && (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </div>

                      <div style={{ width: colWidths.status, minWidth: 80 }} className="shrink-0">
                        <StatusBadge
                          status={status}
                          onClick={() => setExpandedId(isExpanded ? null : buyer.id)}
                        />
                      </div>

                      <div style={{ width: colWidths.lastContact, minWidth: 60 }} className="text-xs text-muted-foreground shrink-0">
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
