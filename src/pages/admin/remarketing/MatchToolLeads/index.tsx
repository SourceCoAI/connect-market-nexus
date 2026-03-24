
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Ban, ExternalLink, Globe, Mail, Phone, Clock } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useMatchToolLeadsData } from './useMatchToolLeadsData';
import type { MatchToolLead } from './types';


const STAGE_CONFIG: Record<string, { label: string; className: string }> = {
  browse: { label: 'Website Only', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  financials: { label: 'Has Financials', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  full_form: { label: 'Full Contact', className: 'bg-green-50 text-green-700 border-green-200' },
};

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Match Tool Leads</h1>
          <p className="text-sm text-muted-foreground">
            Leads from the Buyer/Seller Match Tool
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {leads.length} leads
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="flex items-center gap-3">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="has_contact">Has Contact</TabsTrigger>
            <TabsTrigger value="website_only">Website Only</TabsTrigger>
            <TabsTrigger value="pushed">Pushed</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>

          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search website, name, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {selectedIds.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markNotAFit.mutate(Array.from(selectedIds))}
            >
              <Ban className="h-3.5 w-3.5 mr-1" />
              Not a Fit ({selectedIds.size})
            </Button>
          )}
        </div>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading leads...</div>
          ) : leads.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No leads found. Leads will appear here when users interact with the Match Tool.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedIds.size === leads.length && leads.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Financials</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Timeline</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      selected={selectedIds.has(lead.id)}
                      onToggle={() => toggleSelect(lead.id)}
                    />
                  ))}
                </TableBody>
              </Table>
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
  const stage = STAGE_CONFIG[lead.submission_stage] || STAGE_CONFIG.browse;

  return (
    <TableRow className={selected ? 'bg-muted/50' : ''}>
      <TableCell>
        <Checkbox checked={selected} onCheckedChange={onToggle} />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <a
            href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-primary hover:underline truncate max-w-[200px]"
          >
            {lead.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </a>
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </div>
        {lead.business_name && (
          <p className="text-xs text-muted-foreground mt-0.5">{lead.business_name}</p>
        )}
      </TableCell>
      <TableCell>
        {lead.full_name ? (
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{lead.full_name}</p>
            {lead.email && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Mail className="h-3 w-3" />
                {lead.email}
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                <a href={`tel:${lead.phone}`} className="hover:underline">{lead.phone}</a>
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {lead.revenue || lead.profit ? (
          <div className="text-xs space-y-0.5">
            {lead.revenue && <p>Rev: {lead.revenue}</p>}
            {lead.profit && <p>Profit: {lead.profit}</p>}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={`text-[10px] ${stage.className}`}>
          {stage.label}
        </Badge>
      </TableCell>
      <TableCell>
        {lead.timeline ? (
          <div className="flex items-center gap-1 text-xs">
            <Clock className="h-3 w-3 text-muted-foreground" />
            {lead.timeline} mo
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={`text-[10px] ${
            lead.pushed_to_all_deals
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-yellow-50 text-yellow-700 border-yellow-200'
          }`}
        >
          {lead.pushed_to_all_deals ? 'Pushed' : lead.status || 'New'}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {new Date(lead.created_at).toLocaleDateString()}
        {(lead.submission_count ?? 1) > 1 && (
          <span className="ml-1 text-[10px]">({lead.submission_count}x)</span>
        )}
      </TableCell>
    </TableRow>
  );
}
