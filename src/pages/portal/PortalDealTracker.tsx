import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, FileText, DollarSign, MapPin, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import { PushStatusBadge, PriorityBadge } from '@/components/portal/PortalStatusBadge';

function formatCurrency(value: number | null | undefined): string {
  if (!value) return '-';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

export default function PortalDealTracker() {
  const { slug } = useParams<{ slug: string }>();
  const { data: portalUser } = useMyPortalUser(slug);
  const { data: deals, isLoading } = useMyPortalDeals(portalUser?.portal_org?.id);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'ebitda'>('newest');

  let filtered = (deals || []).filter(
    (d) => statusFilter === 'all' || d.status === statusFilter
  );

  filtered = [...filtered].sort((a, b) => {
    if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sortBy === 'ebitda') return (b.deal_snapshot?.ebitda || 0) - (a.deal_snapshot?.ebitda || 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
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

        {/* Filters */}
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
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
          <span className="text-sm text-muted-foreground ml-auto">
            {filtered.length} deal{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Deal cards */}
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((deal) => (
              <Link key={deal.id} to={`/portal/${slug}/deals/${deal.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="pt-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm leading-tight">
                        {deal.deal_snapshot?.headline || 'Untitled Deal'}
                      </h3>
                      <div className="flex items-center gap-1 shrink-0">
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

                    {deal.push_note && (
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
