import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Search,
  FileCheck,
  FileText,
  Briefcase,
  Mail,
  TrendingUp,
  ListChecks,
} from 'lucide-react';
import { NonMarketplaceUsersTable } from '@/components/admin/NonMarketplaceUsersTable';
import { BulkContactActions } from '@/components/admin/non-marketplace/BulkContactActions';
import { useNonMarketplaceUsers } from '@/hooks/admin/use-non-marketplace-users';
import type { NonMarketplaceUserFilters } from '@/types/non-marketplace-user';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';
import { useAIUIActionHandler } from '@/hooks/useAIUIActionHandler';

const BuyerContactsPage = () => {
  const { data: nonMarketplaceUsers = [], isLoading } = useNonMarketplaceUsers();

  // URL-persisted filter state (survives browser Back navigation)
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') ?? '';
  const setSearchQuery = useCallback(
    (v: string) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v) n.set('q', v);
          else n.delete('q');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const sourceFilter = searchParams.get('source') ?? 'all';
  const setSourceFilter = useCallback(
    (v: string) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'all') n.set('source', v);
          else n.delete('source');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const agreementFilter = searchParams.get('agreement') ?? 'all';
  const setAgreementFilter = useCallback(
    (v: string) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'all') n.set('agreement', v);
          else n.delete('agreement');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Register AI Command Center context
  const { setPageContext } = useAICommandCenterContext();
  useEffect(() => {
    setPageContext({ page: 'buyer_contacts', entity_type: 'contacts' });
  }, [setPageContext]);

  // Wire AI UI actions
  useAIUIActionHandler({
    table: 'contacts',
    onSelectRows: (rowIds, mode) => {
      if (mode === 'replace') {
        setSelectedIds(new Set(rowIds));
      } else if (mode === 'add') {
        setSelectedIds((prev) => { const next = new Set(prev); rowIds.forEach((id) => next.add(id)); return next; });
      } else {
        setSelectedIds((prev) => { const next = new Set(prev); rowIds.forEach((id) => (next.has(id) ? next.delete(id) : next.add(id))); return next; });
      }
    },
    onClearSelection: () => setSelectedIds(new Set()),
  });

  const filters: NonMarketplaceUserFilters = useMemo(
    () => ({
      searchQuery,
      sourceFilter: sourceFilter as NonMarketplaceUserFilters['sourceFilter'],
      agreementFilter: agreementFilter as NonMarketplaceUserFilters['agreementFilter'],
    }),
    [searchQuery, sourceFilter, agreementFilter],
  );

  // Compute filtered users for stats (same logic as table)
  const filteredUsers = useMemo(() => {
    return nonMarketplaceUsers.filter((user) => {
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchesSearch =
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          user.company?.toLowerCase().includes(query) ||
          user.role?.toLowerCase().includes(query) ||
          user.firm_name?.toLowerCase().includes(query) ||
          user.listing_names.some((l) => l.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }
      if (filters.sourceFilter && filters.sourceFilter !== 'all') {
        if (!user.sources.includes(filters.sourceFilter)) return false;
      }
      if (filters.agreementFilter && filters.agreementFilter !== 'all') {
        const ndaSigned = user.nda_status === 'signed';
        const feeSigned = user.fee_agreement_status === 'signed';
        switch (filters.agreementFilter) {
          case 'nda_signed':
            if (!ndaSigned) return false;
            break;
          case 'fee_signed':
            if (!feeSigned) return false;
            break;
          case 'both_signed':
            if (!ndaSigned || !feeSigned) return false;
            break;
          case 'none_signed':
            if (ndaSigned || feeSigned) return false;
            break;
        }
      }
      return true;
    });
  }, [nonMarketplaceUsers, filters]);

  // Stats
  const stats = useMemo(() => {
    const total = nonMarketplaceUsers.length;
    const ndaSigned = nonMarketplaceUsers.filter((u) => u.nda_status === 'signed').length;
    const feeSigned = nonMarketplaceUsers.filter((u) => u.fee_agreement_status === 'signed').length;
    const fromRequests = nonMarketplaceUsers.filter((u) =>
      u.sources.includes('connection_request'),
    ).length;
    const fromLeads = nonMarketplaceUsers.filter((u) => u.sources.includes('inbound_lead')).length;
    const fromDeals = nonMarketplaceUsers.filter((u) => u.sources.includes('deal')).length;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentCount = nonMarketplaceUsers.filter(
      (u) => new Date(u.created_at) >= thirtyDaysAgo,
    ).length;
    return { total, ndaSigned, feeSigned, fromRequests, fromLeads, fromDeals, recentCount };
  }, [nonMarketplaceUsers]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filteredUsers.length) return new Set();
      return new Set(filteredUsers.map((u) => u.id));
    });
  }, [filteredUsers]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectedUsers = useMemo(
    () => nonMarketplaceUsers.filter((u) => selectedIds.has(u.id)),
    [nonMarketplaceUsers, selectedIds],
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="px-4 md:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Buyer Contacts</h1>
              <p className="text-sm text-muted-foreground">
                Non-marketplace contacts from connection requests, inbound leads, and deal contacts.
              </p>
            </div>
            {!isLoading && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {stats.recentCount} new this month
                </Badge>
                <Link to="/admin/lists">
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <ListChecks className="h-3.5 w-3.5" />
                    View Lists
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-6">
        {/* Stats Cards */}
        {!isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <StatsCard icon={Users} label="Total Contacts" value={stats.total} />
            <StatsCard icon={FileCheck} label="NDA Signed" value={stats.ndaSigned} />
            <StatsCard icon={FileCheck} label="Fee Agmt Signed" value={stats.feeSigned} />
            <StatsCard icon={FileText} label="From Requests" value={stats.fromRequests} />
            <StatsCard icon={Mail} label="From Leads" value={stats.fromLeads} />
            <StatsCard icon={Briefcase} label="From Deals" value={stats.fromDeals} />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, company, listing..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="connection_request">Requests</SelectItem>
              <SelectItem value="inbound_lead">Inbound Leads</SelectItem>
              <SelectItem value="deal">Deals</SelectItem>
            </SelectContent>
          </Select>
          <Select value={agreementFilter} onValueChange={setAgreementFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Agreement Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agreements</SelectItem>
              <SelectItem value="nda_signed">NDA Signed</SelectItem>
              <SelectItem value="fee_signed">Fee Agmt Signed</SelectItem>
              <SelectItem value="both_signed">Both Signed</SelectItem>
              <SelectItem value="none_signed">None Signed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results count */}
        <div className="text-sm text-muted-foreground">
          {filteredUsers.length} contact{filteredUsers.length !== 1 ? 's' : ''} found
          {nonMarketplaceUsers.length !== filteredUsers.length &&
            ` (${nonMarketplaceUsers.length} total)`}
        </div>

        {/* Bulk Actions */}
        <BulkContactActions
          selectedUsers={selectedUsers}
          onClearSelection={clearSelection}
          filters={filters}
        />

        {/* Table */}
        <div className="bg-card rounded-lg border overflow-hidden">
          <NonMarketplaceUsersTable
            users={nonMarketplaceUsers}
            isLoading={isLoading}
            filters={filters}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
          />
        </div>
      </div>
    </div>
  );
};

function StatsCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-2xl font-semibold">{value}</span>
    </div>
  );
}

export default BuyerContactsPage;
