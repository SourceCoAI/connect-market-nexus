import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Layers,
  Search,
  ArrowUpDown,
  ExternalLink,
  EyeOff,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useMasterLeads, type LeadSource, type SortColumn } from './useMasterLeads';

const SOURCE_CONFIG: Record<LeadSource, { label: string; color: string }> = {
  captarget: { label: 'CapTarget', color: 'bg-blue-100 text-blue-800' },
  gp_partner: { label: 'GP Partner', color: 'bg-purple-100 text-purple-800' },
  sourceco: { label: 'SourceCo', color: 'bg-emerald-100 text-emerald-800' },
  valuation: { label: 'Valuation', color: 'bg-amber-100 text-amber-800' },
  referral: { label: 'Referral', color: 'bg-pink-100 text-pink-800' },
};

const SOURCE_TABS: Array<{ key: 'all' | LeadSource; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'captarget', label: 'CapTarget' },
  { key: 'gp_partner', label: 'GP Partner' },
  { key: 'sourceco', label: 'SourceCo' },
  { key: 'valuation', label: 'Valuation' },
  { key: 'referral', label: 'Referral' },
];

function formatCurrency(value: number | null): string {
  if (value == null) return '-';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground">-</span>;
  const color =
    score >= 75
      ? 'bg-green-100 text-green-800'
      : score >= 50
        ? 'bg-amber-100 text-amber-800'
        : 'bg-red-100 text-red-800';
  return <Badge className={cn('font-mono text-xs', color)}>{score}</Badge>;
}

function SortableHeader({
  column,
  currentSort,
  currentDir,
  onSort,
  children,
  className,
}: {
  column: SortColumn;
  currentSort: SortColumn;
  currentDir: string;
  onSort: (col: SortColumn) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const isActive = currentSort === column;
  return (
    <TableHead
      className={cn('cursor-pointer select-none hover:text-foreground', className)}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown
          className={cn('h-3 w-3', isActive ? 'text-foreground' : 'text-muted-foreground/40')}
        />
        {isActive && (
          <span className="text-[10px] text-muted-foreground">
            {currentDir === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </span>
    </TableHead>
  );
}

export default function MasterLeads() {
  const navigate = useNavigate();
  const hook = useMasterLeads();

  if (hook.isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">All Leads</h1>
            <p className="text-sm text-muted-foreground mt-1">
              All lead sources in one unified view
            </p>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Leads</p>
          <p className="text-2xl font-bold">{hook.kpiStats.total.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Pushed to Active Deals</p>
          <p className="text-2xl font-bold">{hook.kpiStats.pushed.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Average Score</p>
          <p className="text-2xl font-bold">{hook.kpiStats.avgScore || '-'}</p>
        </div>
      </div>

      {/* Source Tabs */}
      <div className="flex items-center gap-1 border-b">
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => hook.setActiveSource(tab.key)}
            className={cn(
              'px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              hook.activeSource === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {tab.label}
            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 h-5">
              {hook.sourceCounts[tab.key] ?? 0}
            </Badge>
          </button>
        ))}
      </div>

      {/* Search + Hide Pushed Toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search company, contact, industry, location..."
            value={hook.search}
            onChange={(e) => hook.setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <button
          onClick={() => hook.setHidePushed(!hook.hidePushed)}
          className={cn(
            'flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border transition-colors',
            hook.hidePushed
              ? 'bg-primary/10 border-primary/30 text-primary font-medium'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
        >
          <EyeOff className="h-3.5 w-3.5" />
          {hook.hidePushed ? 'Showing Un-Pushed Only' : 'Hide Pushed'}
        </button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader
                column="companyName"
                currentSort={hook.sortColumn}
                currentDir={hook.sortDirection}
                onSort={hook.handleSort}
              >
                Company
              </SortableHeader>
              <SortableHeader
                column="source"
                currentSort={hook.sortColumn}
                currentDir={hook.sortDirection}
                onSort={hook.handleSort}
              >
                Source
              </SortableHeader>
              <SortableHeader
                column="contactName"
                currentSort={hook.sortColumn}
                currentDir={hook.sortDirection}
                onSort={hook.handleSort}
              >
                Contact
              </SortableHeader>
              <SortableHeader
                column="industry"
                currentSort={hook.sortColumn}
                currentDir={hook.sortDirection}
                onSort={hook.handleSort}
              >
                Industry
              </SortableHeader>
              <SortableHeader
                column="location"
                currentSort={hook.sortColumn}
                currentDir={hook.sortDirection}
                onSort={hook.handleSort}
              >
                Location
              </SortableHeader>
              <SortableHeader
                column="revenue"
                currentSort={hook.sortColumn}
                currentDir={hook.sortDirection}
                onSort={hook.handleSort}
                className="text-right"
              >
                Revenue
              </SortableHeader>
              <SortableHeader
                column="ebitda"
                currentSort={hook.sortColumn}
                currentDir={hook.sortDirection}
                onSort={hook.handleSort}
                className="text-right"
              >
                EBITDA / Valuation
              </SortableHeader>
              <SortableHeader
                column="score"
                currentSort={hook.sortColumn}
                currentDir={hook.sortDirection}
                onSort={hook.handleSort}
                className="text-center"
              >
                Score
              </SortableHeader>
              <SortableHeader
                column="linkedinEmployeeCount"
                currentSort={hook.sortColumn}
                currentDir={hook.sortDirection}
                onSort={hook.handleSort}
                className="text-right"
              >
                LI Emp
              </SortableHeader>
              <SortableHeader
                column="googleReviewCount"
                currentSort={hook.sortColumn}
                currentDir={hook.sortDirection}
                onSort={hook.handleSort}
                className="text-right"
              >
                Reviews
              </SortableHeader>
              <SortableHeader
                column="pushedToActiveDeals"
                currentSort={hook.sortColumn}
                currentDir={hook.sortDirection}
                onSort={hook.handleSort}
                className="text-center"
              >
                Status
              </SortableHeader>
              <SortableHeader
                column="dateAdded"
                currentSort={hook.sortColumn}
                currentDir={hook.sortDirection}
                onSort={hook.handleSort}
              >
                Date Added
              </SortableHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hook.paginatedLeads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                  <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No leads found</p>
                </TableCell>
              </TableRow>
            ) : (
              hook.paginatedLeads.map((lead) => {
                const srcCfg = SOURCE_CONFIG[lead.source];
                return (
                  <TableRow
                    key={`${lead.source}-${lead.id}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(lead.detailPath)}
                  >
                    {/* Company */}
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[200px]">{lead.companyName}</span>
                        {lead.website && (
                          <a
                            href={
                              lead.website.startsWith('http')
                                ? lead.website
                                : `https://${lead.website}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-primary shrink-0"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </TableCell>

                    {/* Source */}
                    <TableCell>
                      <Badge className={cn('text-xs font-medium', srcCfg.color)}>
                        {srcCfg.label}
                      </Badge>
                    </TableCell>

                    {/* Contact */}
                    <TableCell>
                      <div className="text-sm">
                        {lead.contactName || '-'}
                        {lead.contactEmail && (
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {lead.contactEmail}
                          </p>
                        )}
                      </div>
                    </TableCell>

                    {/* Industry */}
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[140px]">
                      {lead.industry || '-'}
                    </TableCell>

                    {/* Location */}
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[140px]">
                      {lead.location || '-'}
                    </TableCell>

                    {/* Revenue */}
                    <TableCell className="text-right text-sm">
                      {formatCurrency(lead.revenue)}
                    </TableCell>

                    {/* EBITDA / Valuation */}
                    <TableCell className="text-right text-sm">
                      {lead.source === 'valuation'
                        ? formatCurrency(lead.valuationEstimate)
                        : formatCurrency(lead.ebitda)}
                    </TableCell>

                    {/* Score */}
                    <TableCell className="text-center">
                      <ScoreBadge score={lead.score} />
                    </TableCell>

                    {/* Status */}
                    <TableCell className="text-center">
                      {lead.pushedToActiveDeals ? (
                        <Badge variant="default" className="text-xs bg-green-600">
                          Pushed
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Not Pushed
                        </Badge>
                      )}
                    </TableCell>

                    {/* Date Added */}
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {lead.dateAdded
                        ? format(new Date(lead.dateAdded), 'MMM d, yyyy')
                        : '-'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {hook.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(hook.safePage - 1) * hook.PAGE_SIZE + 1}–
            {Math.min(hook.safePage * hook.PAGE_SIZE, hook.filteredLeads.length)} of{' '}
            {hook.filteredLeads.length} leads
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={hook.safePage <= 1}
              onClick={() => hook.setCurrentPage(hook.safePage - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">
              Page {hook.safePage} of {hook.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={hook.safePage >= hook.totalPages}
              onClick={() => hook.setCurrentPage(hook.safePage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
