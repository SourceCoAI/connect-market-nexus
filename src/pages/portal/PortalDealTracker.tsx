import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, DollarSign, MapPin, Building2, MessageSquare, LayoutGrid, List, Globe, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMyPortalUser } from '@/hooks/portal/use-portal-users';
import { useMyPortalDeals } from '@/hooks/portal/use-portal-deals';
import { usePortalMessageSummaries } from '@/hooks/portal/use-portal-messages';
import { PushStatusBadge, PriorityBadge } from '@/components/portal/PortalStatusBadge';
import { CompanyDetailsModal } from '@/components/portal/CompanyDetailsModal';
import type { PortalDealPush } from '@/types/portal';

function formatCurrency(value: number | null | undefined): string {
  if (!value) return '-';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function formatWebsiteUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function ensureProtocol(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `https://${url}`;
}

export default function PortalDealTracker() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: portalUser } = useMyPortalUser(slug);
  const { data: deals, isLoading } = useMyPortalDeals(portalUser?.portal_org?.id);
  const { data: messageSummaries } = usePortalMessageSummaries(
    portalUser?.portal_org?.id,
    'portal_user',
  );
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'ebitda'>('newest');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [companyModalDeal, setCompanyModalDeal] = useState<PortalDealPush | null>(null);

  let filtered = (deals || []).filter(
    (d) => statusFilter === 'all' || d.status === statusFilter
  );

  filtered = [...filtered].sort((a, b) => {
    if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sortBy === 'ebitda') return (b.deal_snapshot?.ebitda || 0) - (a.deal_snapshot?.ebitda || 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const totalUnread = Object.values(messageSummaries || {}).reduce((sum, s) => sum + s.unread, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link
            to={`/portal/${slug}`}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
          >
            <ChevronLeft className="h-3 w-3" />
            Dashboard
          </Link>
          <h1 className="text-2xl font-bold">Deal Tracker</h1>
          <p className="text-muted-foreground">
            All deals shared with {portalUser?.portal_org?.name || 'your portal'}.
          </p>
        </div>

        {/* Filters & View Toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="viewed">Viewed</SelectItem>
              <SelectItem value="interested">Interested</SelectItem>
              <SelectItem value="passed">Passed</SelectItem>
              <SelectItem value="needs_info">Needs Info</SelectItem>
              <SelectItem value="reviewing">Reviewing</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'newest' | 'oldest' | 'ebitda')}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="ebitda">EBITDA</SelectItem>
            </SelectContent>
          </Select>

          {/* View toggle */}
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-r-none"
              onClick={() => setViewMode('table')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'card' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-l-none"
              onClick={() => setViewMode('card')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-3 ml-auto text-sm text-muted-foreground">
            {totalUnread > 0 && (
              <span className="flex items-center gap-1 text-blue-600 font-medium">
                <MessageSquare className="h-3.5 w-3.5" />
                {totalUnread} unread message{totalUnread !== 1 ? 's' : ''}
              </span>
            )}
            <span>
              {filtered.length} deal{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Deal list */}
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading deals...</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {statusFilter === 'all'
                ? 'No deals have been shared with you yet.'
                : 'No deals match this filter.'}
            </CardContent>
          </Card>
        ) : viewMode === 'table' ? (
          /* ── Table View ── */
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">EBITDA</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((deal) => {
                  const msgSummary = messageSummaries?.[deal.id];
                  const hasUnread = (msgSummary?.unread || 0) > 0;
                  const description =
                    deal.deal_snapshot?.business_description ||
                    deal.deal_snapshot?.teaser_sections?.[0]?.content ||
                    '';

                  return (
                    <TableRow
                      key={deal.id}
                      className={`cursor-pointer ${hasUnread ? 'bg-blue-50/50' : ''}`}
                      onClick={() => navigate(`/portal/${slug}/deals/${deal.id}`)}
                    >
                      <TableCell className="font-medium whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="text-left text-blue-600 hover:text-blue-800 hover:underline font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCompanyModalDeal(deal);
                            }}
                          >
                            {deal.deal_snapshot?.headline || 'Untitled Deal'}
                          </button>
                          {hasUnread && (
                            <span className="flex items-center gap-0.5 bg-blue-100 text-blue-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                              <MessageSquare className="h-2.5 w-2.5" />
                              {msgSummary!.unread}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {deal.deal_snapshot?.website ? (
                          <a
                            href={ensureProtocol(deal.deal_snapshot.website)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline text-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {formatWebsiteUrl(deal.deal_snapshot.website)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {deal.deal_snapshot?.geography || '-'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {deal.deal_snapshot?.industry || '-'}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                        {formatCurrency(deal.deal_snapshot?.revenue)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                        {formatCurrency(deal.deal_snapshot?.ebitda)}
                      </TableCell>
                      <TableCell className="max-w-[250px]">
                        <p className="text-muted-foreground text-xs line-clamp-2">
                          {description || '-'}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                        {new Date(deal.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <PushStatusBadge status={deal.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        ) : (
          /* ── Card View ── */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((deal) => {
              const msgSummary = messageSummaries?.[deal.id];
              const hasUnread = (msgSummary?.unread || 0) > 0;

              return (
                <Link key={deal.id} to={`/portal/${slug}/deals/${deal.id}`}>
                  <Card className={`hover:shadow-md transition-shadow cursor-pointer h-full ${hasUnread ? 'ring-2 ring-blue-200' : ''}`}>
                    <CardContent className="pt-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          className="text-left font-semibold text-sm leading-tight text-blue-600 hover:text-blue-800 hover:underline"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setCompanyModalDeal(deal);
                          }}
                        >
                          {deal.deal_snapshot?.headline || 'Untitled Deal'}
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          {hasUnread && (
                            <span className="flex items-center gap-1 bg-blue-100 text-blue-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                              <MessageSquare className="h-3 w-3" />
                              {msgSummary!.unread}
                            </span>
                          )}
                          <PriorityBadge priority={deal.priority} />
                          <PushStatusBadge status={deal.status} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        {deal.deal_snapshot?.industry && (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5" />
                            <span className="truncate">{deal.deal_snapshot.industry}</span>
                          </div>
                        )}
                        {deal.deal_snapshot?.geography && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            <span className="truncate">{deal.deal_snapshot.geography}</span>
                          </div>
                        )}
                        {deal.deal_snapshot?.ebitda != null && (
                          <div className="flex items-center gap-1.5">
                            <DollarSign className="h-3.5 w-3.5" />
                            <span>EBITDA: {formatCurrency(deal.deal_snapshot.ebitda)}</span>
                          </div>
                        )}
                        {deal.deal_snapshot?.revenue != null && (
                          <div className="flex items-center gap-1.5">
                            <DollarSign className="h-3.5 w-3.5" />
                            <span>Rev: {formatCurrency(deal.deal_snapshot.revenue)}</span>
                          </div>
                        )}
                      </div>

                      {deal.deal_snapshot?.website && (
                        <a
                          href={ensureProtocol(deal.deal_snapshot.website)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Globe className="h-3.5 w-3.5" />
                          {formatWebsiteUrl(deal.deal_snapshot.website)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}

                      {/* Memo excerpt: show first section */}
                      {deal.deal_snapshot?.teaser_sections?.[0]?.content && (
                        <p className="text-xs text-muted-foreground border-t pt-2 line-clamp-3">
                          {deal.deal_snapshot.teaser_sections[0].content}
                        </p>
                      )}

                      {/* Latest message preview */}
                      {msgSummary && msgSummary.total > 0 && (
                        <div className={`flex items-start gap-2 border-t pt-2 text-xs ${hasUnread ? 'text-blue-700' : 'text-muted-foreground'}`}>
                          <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                          <p className="truncate">
                            <span className="font-medium">
                              {msgSummary.latest_sender_type === 'admin' ? 'SourceCo' : 'You'}:
                            </span>
                            {' '}{msgSummary.latest_message}
                          </p>
                        </div>
                      )}

                      {deal.push_note && !msgSummary?.total && (
                        <p className="text-xs text-muted-foreground italic border-t pt-2 truncate">
                          "{deal.push_note}"
                        </p>
                      )}

                      <div className="text-xs text-muted-foreground pt-1">
                        Shared {new Date(deal.created_at).toLocaleDateString()}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {companyModalDeal && (
        <CompanyDetailsModal
          open={!!companyModalDeal}
          onOpenChange={(open) => {
            if (!open) setCompanyModalDeal(null);
          }}
          push={companyModalDeal}
          portalSlug={slug!}
        />
      )}
    </div>
  );
}
