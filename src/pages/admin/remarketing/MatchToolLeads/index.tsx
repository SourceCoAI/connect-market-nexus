import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Ban, Trash2, Globe } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMatchToolLeadsData } from './useMatchToolLeadsData';
import { MatchToolLeadPanel } from './MatchToolLeadPanel';
import type { MatchToolLead } from './types';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return 'Today';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function cleanDomain(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

function getDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname;
  } catch {
    return url;
  }
}

const REVENUE_LABELS: Record<string, string> = {
  'under_500k': '<$500K',
  '500k_1m': '$500K–1M',
  '1m_5m': '$1M–5M',
  '5m_10m': '$5M–10M',
  '10m_25m': '$10M–25M',
  '25m_50m': '$25M–50M',
  '50m_plus': '$50M+',
};

const PROFIT_LABELS: Record<string, string> = {
  'under_100k': '<$100K',
  '100k_500k': '$100K–500K',
  '500k_1m': '$500K–1M',
  '1m_3m': '$1M–3M',
  '3m_5m': '$3M–5M',
  '5m_plus': '$5M+',
};

function formatFinancials(revenue: string | null, profit: string | null): string | null {
  const parts: string[] = [];
  if (revenue) parts.push(REVENUE_LABELS[revenue] || revenue);
  if (profit) parts.push(PROFIT_LABELS[profit] || profit);
  if (parts.length === 0) return null;
  if (parts.length === 2) return `${parts[0]} rev · ${parts[1]} profit`;
  return revenue ? `${parts[0]} rev` : `${parts[0]} profit`;
}

export default function MatchToolLeads() {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState<MatchToolLead | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const {
    leads,
    isLoading,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    selectedIds,
    setSelectedIds,
    markNotAFit,
    deleteLeads,
    enrichLead,
  } = useMatchToolLeadsData();

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)));
    }
  };

  const handleRowClick = (lead: MatchToolLead) => {
    setSelectedLead(lead);
    setPanelOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight text-foreground">
            Match Tool Leads
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {leads.length} lead{leads.length !== 1 ? 's' : ''} from the buyer/seller match tool
          </p>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => markNotAFit.mutate(Array.from(selectedIds))}
              className="h-7 text-xs"
            >
              <Ban className="h-3 w-3 mr-1" />
              Not a Fit ({selectedIds.size})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              className="h-7 text-xs text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Delete ({selectedIds.size})
            </Button>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="flex items-center gap-3">
          <TabsList className="h-8 bg-muted/50">
            <TabsTrigger value="all" className="text-xs px-3 py-1">All</TabsTrigger>
            <TabsTrigger value="has_contact" className="text-xs px-3 py-1">Has Contact</TabsTrigger>
            <TabsTrigger value="has_financials" className="text-xs px-3 py-1">Has Financials</TabsTrigger>
            <TabsTrigger value="website_only" className="text-xs px-3 py-1">Website Only</TabsTrigger>
            <TabsTrigger value="pushed" className="text-xs px-3 py-1">Pushed</TabsTrigger>
            <TabsTrigger value="archived" className="text-xs px-3 py-1">Archived</TabsTrigger>
          </TabsList>

          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <Input
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs border-border/50"
            />
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="text-center py-20 text-[13px] text-muted-foreground">Loading...</div>
          ) : leads.length === 0 ? (
            <div className="text-center py-20 text-[13px] text-muted-foreground">
              No leads found.
            </div>
          ) : (
            <div>
              {/* Header */}
              <div className="grid grid-cols-[28px_1.2fr_1.2fr_1fr_100px_80px_64px] gap-6 px-4 py-2.5 text-[11px] font-normal text-muted-foreground/70 border-b border-border/40">
                <div>
                  <Checkbox
                    checked={selectedIds.size === leads.length && leads.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </div>
                <div>Website</div>
                <div>Contact</div>
                <div>Financials</div>
                <div>Location</div>
                <div>Stage</div>
                <div className="text-right">Date</div>
              </div>

              {leads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  selected={selectedIds.has(lead.id)}
                  onToggle={() => toggleSelect(lead.id)}
                  onClick={() => handleRowClick(lead)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} lead{selectedIds.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected leads will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteLeads.mutate(Array.from(selectedIds));
                setShowDeleteDialog(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MatchToolLeadPanel
        lead={selectedLead}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onEnrich={(lead_id, website) => enrichLead.mutate({ lead_id, website })}
        isEnriching={enrichLead.isPending}
      />
    </div>
  );
}

function LeadRow({
  lead,
  selected,
  onToggle,
  onClick,
}: {
  lead: MatchToolLead;
  selected: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  const isFullForm = lead.submission_stage === 'full_form';
  const isFinancials = lead.submission_stage === 'financials';
  const financials = formatFinancials(lead.revenue, lead.profit);
  const domain = getDomain(lead.website);

  const raw = lead.raw_inputs as Record<string, any> | null;
  const city = raw?.city || null;
  const region = raw?.region || null;
  const country = raw?.country || null;
  const locationDisplay = city && region
    ? `${city}, ${region}`
    : city || region || country || null;

  return (
    <div
      className={`
        grid grid-cols-[28px_1.2fr_1.2fr_1fr_100px_80px_64px] gap-6 px-4 py-4 items-center
        border-b border-border/30 transition-colors cursor-pointer
        ${isFullForm
          ? 'border-l-[3px] border-l-emerald-500'
          : selected
            ? 'bg-muted/30'
            : 'hover:bg-muted/15'
        }
      `}
      onClick={onClick}
    >
      {/* Checkbox */}
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={onToggle} />
      </div>

      {/* Website */}
      <div className="min-w-0 flex items-center gap-2">
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
          alt=""
          className="h-5 w-5 rounded flex-shrink-0"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            target.nextElementSibling?.classList.remove('hidden');
          }}
        />
        <Globe className="h-5 w-5 text-muted-foreground/40 flex-shrink-0 hidden" />
        <div className="min-w-0">
          <span className="text-[13px] font-medium text-foreground truncate block">
            {cleanDomain(lead.website)}
          </span>
          {lead.business_name && (
            <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
              {lead.business_name}
            </p>
          )}
        </div>
      </div>

      {/* Contact */}
      <div className="min-w-0">
        {lead.full_name ? (
          <div>
            <p className="text-[13px] font-medium text-foreground truncate">{lead.full_name}</p>
            <div className="flex items-center gap-3 mt-0.5">
              {lead.email && (
                <span className="text-[11px] text-muted-foreground/70 truncate">
                  {lead.email}
                </span>
              )}
              {lead.phone && (
                <span className="text-[11px] text-muted-foreground/70">
                  {lead.phone}
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Financials */}
      <div className="min-w-0">
        {financials ? (
          <span className="text-[12px] text-foreground/70">{financials}</span>
        ) : null}
        {lead.timeline && (
          <p className="text-[11px] text-muted-foreground/50 mt-0.5">{lead.timeline}</p>
        )}
      </div>

      {/* Location */}
      <div className="min-w-0">
        {locationDisplay ? (
          <span className="text-[12px] text-muted-foreground/70 truncate block">{locationDisplay}</span>
        ) : null}
      </div>

      {/* Stage */}
      <div>
        {isFullForm ? (
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
            Wants Buyers
          </span>
        ) : isFinancials ? (
          <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400">
            Financials
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Browse
          </span>
        )}
      </div>

      {/* Date */}
      <div className="text-right">
        <span className="text-[11px] text-muted-foreground/60">{formatDate(lead.created_at)}</span>
      </div>
    </div>
  );
}
