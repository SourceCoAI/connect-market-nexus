import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Ban, Mail, Phone, Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useMatchToolLeadsData } from './useMatchToolLeadsData';
import type { MatchToolLead } from './types';

function relativeDate(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function cleanDomain(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

function compactFinancials(revenue: string | null, profit: string | null): string | null {
  const parts: string[] = [];
  if (revenue) parts.push(`Rev ${revenue}`);
  if (profit) parts.push(`Profit ${profit}`);
  return parts.length ? parts.join(' · ') : null;
}

export default function MatchToolLeads() {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Match Tool Leads
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {leads.length}
          </span>
        </h1>

        {selectedIds.size > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markNotAFit.mutate(Array.from(selectedIds))}
            className="h-8 text-xs"
          >
            <Ban className="h-3 w-3 mr-1" />
            Not a Fit ({selectedIds.size})
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="flex items-center gap-3">
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs px-3 py-1">All</TabsTrigger>
            <TabsTrigger value="has_contact" className="text-xs px-3 py-1">Has Contact</TabsTrigger>
            <TabsTrigger value="has_financials" className="text-xs px-3 py-1">Has Financials</TabsTrigger>
            <TabsTrigger value="website_only" className="text-xs px-3 py-1">Website Only</TabsTrigger>
            <TabsTrigger value="pushed" className="text-xs px-3 py-1">Pushed</TabsTrigger>
            <TabsTrigger value="archived" className="text-xs px-3 py-1">Archived</TabsTrigger>
          </TabsList>

          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="text-center py-16 text-sm text-muted-foreground">Loading...</div>
          ) : leads.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              No leads found.
            </div>
          ) : (
            <div className="space-y-0">
              {/* Header row */}
              <div className="grid grid-cols-[28px_1fr_1fr_1fr_120px_100px_60px] gap-4 px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border/60">
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
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LeadRow({
  lead,
  selected,
  onToggle,
}: {
  lead: MatchToolLead;
  selected: boolean;
  onToggle: () => void;
}) {
  const isFullForm = lead.submission_stage === 'full_form';
  const isFinancials = lead.submission_stage === 'financials';
  const financials = compactFinancials(lead.revenue, lead.profit);

  // Extract location from raw_inputs
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
        grid grid-cols-[28px_1fr_1fr_1fr_120px_100px_60px] gap-4 px-3 py-3 items-center
        border-b border-border/40 transition-colors
        ${isFullForm
          ? 'border-l-2 border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/10'
          : selected
            ? 'bg-muted/40'
            : 'hover:bg-muted/20'
        }
      `}
    >
      {/* Checkbox */}
      <div>
        <Checkbox checked={selected} onCheckedChange={onToggle} />
      </div>

      {/* Website + Business Name */}
      <div className="min-w-0">
        <a
          href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-foreground hover:text-primary hover:underline truncate block"
        >
          {cleanDomain(lead.website)}
        </a>
        {lead.business_name && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {lead.business_name}
          </p>
        )}
      </div>

      {/* Contact */}
      <div className="min-w-0">
        {lead.full_name ? (
          <div>
            <p className="text-sm font-medium text-foreground truncate">{lead.full_name}</p>
            <div className="flex items-center gap-3 mt-0.5">
              {lead.email && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                  <Mail className="h-3 w-3 flex-shrink-0" />
                  {lead.email}
                </span>
              )}
              {lead.phone && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Phone className="h-3 w-3 flex-shrink-0" />
                  {lead.phone}
                </span>
              )}
            </div>
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground/50">No contact</span>
        )}
      </div>

      {/* Financials */}
      <div className="min-w-0">
        {financials ? (
          <span className="text-xs text-foreground/80">{financials}</span>
        ) : (
          <span className="text-[11px] text-muted-foreground/50">—</span>
        )}
        {lead.timeline && (
          <p className="text-[11px] text-muted-foreground mt-0.5">Timeline: {lead.timeline}</p>
        )}
      </div>

      {/* Location */}
      <div className="min-w-0">
        {locationDisplay ? (
          <span className="text-xs text-foreground/80 truncate block">{locationDisplay}</span>
        ) : (
          <span className="text-[11px] text-muted-foreground/50">—</span>
        )}
      </div>

      {/* Stage */}
      <div>
        {isFullForm ? (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700 text-[10px] px-2 py-0.5 gap-1">
            <Users className="h-3 w-3" />
            Wants Buyers
          </Badge>
        ) : isFinancials ? (
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-blue-50/50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-800">
            Financials
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 text-muted-foreground border-border/60">
            Browse
          </Badge>
        )}
      </div>

      {/* Date */}
      <div className="text-right">
        <span className="text-[11px] text-muted-foreground">{relativeDate(lead.created_at)}</span>
      </div>
    </div>
  );
}
