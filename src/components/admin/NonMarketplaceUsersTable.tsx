import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ChevronDown,
  ChevronRight,
  Mail,
  FileText,
  Briefcase,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Phone,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { NonMarketplaceUser, NonMarketplaceUserFilters } from '@/types/non-marketplace-user';
import { AgreementToggle } from './non-marketplace/AgreementToggle';

const PAGE_SIZE = 25;

interface NonMarketplaceUsersTableProps {
  users: NonMarketplaceUser[];
  isLoading: boolean;
  filters?: NonMarketplaceUserFilters;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}

type SortColumn = 'name' | 'company' | 'source' | 'engagement' | 'created_at' | 'last_activity';
type SortDirection = 'asc' | 'desc';

const SourceBadge = ({ source }: { source: 'connection_request' | 'inbound_lead' | 'deal' }) => {
  const config = {
    connection_request: { label: 'Request', icon: FileText },
    inbound_lead: { label: 'Lead', icon: Mail },
    deal: { label: 'Deal', icon: Briefcase },
  }[source];
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className="text-[11px] font-normal gap-1 border-border/50 text-muted-foreground bg-transparent px-1.5 py-0"
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
};

const SortIcon = ({
  column,
  sortColumn,
  sortDirection,
}: {
  column: SortColumn;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
}) => {
  if (sortColumn !== column) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
  return sortDirection === 'asc' ? (
    <ArrowUp className="h-3.5 w-3.5 ml-1" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5 ml-1" />
  );
};

const NonMarketplaceUsersTableSkeleton = () => (
  <div className="space-y-3 p-4">
    {Array(8)
      .fill(0)
      .map((_, i) => (
        <div key={i} className="h-14 bg-muted/30 rounded-md animate-pulse" />
      ))}
  </div>
);

export const NonMarketplaceUsersTable = ({
  users,
  isLoading,
  filters,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: NonMarketplaceUsersTableProps) => {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);

  // Filter users
  const filteredUsers = useMemo(() => {
    if (!filters) return users;

    return users.filter((user) => {
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

      if (filters.firmFilter && filters.firmFilter !== 'all') {
        if (user.firm_id !== filters.firmFilter) return false;
      }

      if (filters.phoneFilter && filters.phoneFilter !== 'all') {
        const hasMobile = !!(user.mobile_phone_1 || user.mobile_phone_2 || user.mobile_phone_3);
        const hasOffice = !!user.office_phone;
        const hasAnyPhone = hasMobile || hasOffice || !!user.phone;
        switch (filters.phoneFilter) {
          case 'needs_mobile':
            if (hasMobile) return false;
            break;
          case 'has_mobile':
            if (!hasMobile) return false;
            break;
          case 'office_only':
            if (hasMobile || !hasOffice) return false;
            break;
          case 'no_phone':
            if (hasAnyPhone) return false;
            break;
        }
      }

      return true;
    });
  }, [users, filters]);

  // Sort users
  const sortedUsers = useMemo(() => {
    const sorted = [...filteredUsers];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'company':
          cmp = (a.company || '').localeCompare(b.company || '');
          break;
        case 'source':
          cmp = a.source.localeCompare(b.source);
          break;
        case 'engagement':
          cmp = a.total_engagement_count - b.total_engagement_count;
          break;
        case 'created_at':
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'last_activity':
          cmp =
            new Date(a.last_activity_date || 0).getTime() -
            new Date(b.last_activity_date || 0).getTime();
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredUsers, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(sortedUsers.length / PAGE_SIZE);
  const pagedUsers = sortedUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset page when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [filters]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const toggleExpanded = (userId: string) => {
    setExpandedUserId(expandedUserId === userId ? null : userId);
  };

  if (isLoading) {
    return <NonMarketplaceUsersTableSkeleton />;
  }

  if (filteredUsers.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-sm font-medium">No contacts match your filters</p>
        <p className="text-xs mt-1">Try adjusting your search or filter criteria</p>
      </div>
    );
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-10">
              <Checkbox
                checked={filteredUsers.length > 0 && selectedIds.size === filteredUsers.length}
                onCheckedChange={onToggleSelectAll}
              />
            </TableHead>
            <TableHead className="w-8" />
            <TableHead
              className="cursor-pointer select-none hover:bg-muted/50"
              onClick={() => handleSort('name')}
            >
              <span className="flex items-center">
                Name
                <SortIcon column="name" sortColumn={sortColumn} sortDirection={sortDirection} />
              </span>
            </TableHead>
            <TableHead>Email</TableHead>
            <TableHead
              className="cursor-pointer select-none hover:bg-muted/50"
              onClick={() => handleSort('company')}
            >
              <span className="flex items-center">
                Company
                <SortIcon column="company" sortColumn={sortColumn} sortDirection={sortDirection} />
              </span>
            </TableHead>
            <TableHead>Sources</TableHead>
            <TableHead
              className="cursor-pointer select-none hover:bg-muted/50 text-center"
              onClick={() => handleSort('engagement')}
            >
              <span className="flex items-center justify-center">
                Activity
                <SortIcon
                  column="engagement"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                />
              </span>
            </TableHead>
            <TableHead className="text-center">Agreements</TableHead>
            <TableHead
              className="cursor-pointer select-none hover:bg-muted/50"
              onClick={() => handleSort('last_activity')}
            >
              <span className="flex items-center">
                Last Activity
                <SortIcon
                  column="last_activity"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                />
              </span>
            </TableHead>
            <TableHead
              className="cursor-pointer select-none hover:bg-muted/50"
              onClick={() => handleSort('created_at')}
            >
              <span className="flex items-center">
                Added
                <SortIcon
                  column="created_at"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                />
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedUsers.map((user) => {
            const isExpanded = expandedUserId === user.id;
            const isSelected = selectedIds.has(user.id);

            return (
              <React.Fragment key={user.id}>
                <TableRow className={`hover:bg-muted/50 ${isSelected ? 'bg-primary/5' : ''}`}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect(user.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => toggleExpanded(user.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>

                  <TableCell className="cursor-pointer" onClick={() => toggleExpanded(user.id)}>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{user.name}</span>
                      {user.role && (
                        <span className="text-xs text-muted-foreground">{user.role}</span>
                      )}
                      {user.phone && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-2.5 w-2.5" />
                          {user.phone}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <span className="text-sm text-muted-foreground">{user.email}</span>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">{user.company || '—'}</span>
                      {user.firm_name && user.firm_name !== user.company && (
                        <span className="text-xs text-muted-foreground">{user.firm_name}</span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.sources.map((s) => (
                        <SourceBadge key={s} source={s} />
                      ))}
                    </div>
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {user.connection_requests_count > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 gap-0.5 font-normal"
                        >
                          <FileText className="h-2.5 w-2.5" />
                          {user.connection_requests_count}
                        </Badge>
                      )}
                      {user.inbound_leads_count > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 gap-0.5 font-normal"
                        >
                          <Mail className="h-2.5 w-2.5" />
                          {user.inbound_leads_count}
                        </Badge>
                      )}
                      {user.deals_count > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 gap-0.5 font-normal"
                        >
                          <Briefcase className="h-2.5 w-2.5" />
                          {user.deals_count}
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-4">
                      <AgreementToggle
                        user={user}
                        type="nda"
                        checked={user.nda_status === 'signed'}
                      />
                      <AgreementToggle
                        user={user}
                        type="fee"
                        checked={user.fee_agreement_status === 'signed'}
                      />
                    </div>
                  </TableCell>

                  <TableCell>
                    {user.last_activity_date && (
                      <span
                        className="text-xs text-muted-foreground"
                        title={format(new Date(user.last_activity_date), 'PPp')}
                      >
                        {formatDistanceToNow(new Date(user.last_activity_date), {
                          addSuffix: true,
                        })}
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(user.created_at), 'MMM d, yyyy')}
                    </span>
                  </TableCell>
                </TableRow>

                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={10} className="bg-muted/10 p-6">
                      <div className="space-y-6">
                        {/* Listings engaged with */}
                        {user.listing_names.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                              Listings Engaged
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                              {user.listing_names.map((name) => (
                                <Badge
                                  key={name}
                                  variant="secondary"
                                  className="text-xs font-normal"
                                >
                                  {name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Activity Breakdown */}
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                            Associated Activity
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {user.associated_records.connection_requests.length > 0 && (
                              <div className="bg-card border rounded-md p-3">
                                <div className="flex items-center gap-2 mb-3">
                                  <FileText className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm font-medium">
                                    Connection Requests (
                                    {user.associated_records.connection_requests.length})
                                  </span>
                                </div>
                                <div className="space-y-3">
                                  {(
                                    user.associated_records.connection_requests as Array<
                                      Record<string, unknown> & {
                                        id: string;
                                        created_at: string;
                                        listing?: { title?: string };
                                        lead_nda_signed?: boolean;
                                        lead_fee_agreement_signed?: boolean;
                                      }
                                    >
                                  ).map((cr) => (
                                    <div key={cr.id} className="space-y-1">
                                      {cr.listing?.title && (
                                        <div className="font-medium text-sm text-foreground">
                                          {cr.listing.title}
                                        </div>
                                      )}
                                      <div className="text-xs text-muted-foreground">
                                        {format(new Date(cr.created_at), 'MMM d, yyyy')} &middot;{' '}
                                        {format(new Date(cr.created_at), 'h:mm a')}
                                      </div>
                                      {(cr.lead_nda_signed || cr.lead_fee_agreement_signed) && (
                                        <div className="flex gap-1 mt-1">
                                          {cr.lead_nda_signed && (
                                            <Badge variant="outline" className="text-xs">
                                              NDA Signed
                                            </Badge>
                                          )}
                                          {cr.lead_fee_agreement_signed && (
                                            <Badge variant="outline" className="text-xs">
                                              Fee Signed
                                            </Badge>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {user.associated_records.inbound_leads.length > 0 && (
                              <div className="bg-card border rounded-md p-3">
                                <div className="flex items-center gap-2 mb-3">
                                  <Mail className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm font-medium">
                                    Inbound Leads ({user.associated_records.inbound_leads.length})
                                  </span>
                                </div>
                                <div className="space-y-3">
                                  {(
                                    user.associated_records.inbound_leads as Array<
                                      Record<string, unknown> & {
                                        id: string;
                                        created_at: string;
                                        source?: string;
                                      }
                                    >
                                  ).map((lead) => (
                                    <div key={lead.id} className="space-y-1">
                                      <div className="font-medium text-sm">
                                        {lead.source || 'Contact Form'}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {format(new Date(lead.created_at), 'MMM d, yyyy')} &middot;{' '}
                                        {format(new Date(lead.created_at), 'h:mm a')}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {user.associated_records.deals.length > 0 && (
                              <div className="bg-card border rounded-md p-3">
                                <div className="flex items-center gap-2 mb-3">
                                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm font-medium">
                                    Deals ({user.associated_records.deals.length})
                                  </span>
                                </div>
                                <div className="space-y-3">
                                  {(
                                    user.associated_records.deals as Array<
                                      Record<string, unknown> & {
                                        id: string;
                                        title?: string;
                                        listing?: { title?: string };
                                        nda_status?: string;
                                        fee_agreement_status?: string;
                                      }
                                    >
                                  ).map((deal) => (
                                    <div key={deal.id} className="space-y-1">
                                      <div className="font-medium text-sm">
                                        {deal.title || 'Untitled Deal'}
                                      </div>
                                      {deal.listing?.title && (
                                        <div className="text-xs text-muted-foreground">
                                          For: {deal.listing.title}
                                        </div>
                                      )}
                                      {(deal.nda_status === 'signed' ||
                                        deal.fee_agreement_status === 'signed') && (
                                        <div className="flex gap-1 mt-1">
                                          {deal.nda_status === 'signed' && (
                                            <Badge variant="outline" className="text-xs">
                                              NDA Signed
                                            </Badge>
                                          )}
                                          {deal.fee_agreement_status === 'signed' && (
                                            <Badge variant="outline" className="text-xs">
                                              Fee Signed
                                            </Badge>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>

      {/* Pagination Footer */}
      {sortedUsers.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
          <span>
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, sortedUsers.length)} of {sortedUsers.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(1)}
            >
              &laquo;
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              &lsaquo; Prev
            </Button>
            <span className="px-3 font-medium text-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next &rsaquo;
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
            >
              &raquo;
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
