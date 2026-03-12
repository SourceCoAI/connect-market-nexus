import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { User } from '@/types';
import { Search, Download, UserCheck, Zap } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { UserOverviewTab } from './user-overview/UserOverviewTab';
import { formatFieldValueForExport } from '@/lib/field-formatting';
import { getProfileCompletionDetails } from '@/lib/buyer-metrics';

interface EnhancedUserManagementProps {
  users: User[];
  onApprove: (user: User) => void;
  onMakeAdmin: (user: User) => void;
  onRevokeAdmin: (user: User) => void;
  onDelete: (user: User) => void;
  isLoading: boolean;
  onFilteredUsersChange?: (filteredUsers: User[]) => void;
}

export function EnhancedUserManagement({
  users,
  onApprove,
  onFilteredUsersChange,
}: EnhancedUserManagementProps) {
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
  const statusFilter = searchParams.get('status') ?? 'all';
  const setStatusFilter = useCallback(
    (v: string) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'all') n.set('status', v);
          else n.delete('status');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const buyerTypeFilter = searchParams.get('buyerType') ?? 'all';
  const setBuyerTypeFilter = useCallback(
    (v: string) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'all') n.set('buyerType', v);
          else n.delete('buyerType');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const profileCompletionFilter = searchParams.get('profile') ?? 'all';
  const setProfileCompletionFilter = useCallback(
    (v: string) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'all') n.set('profile', v);
          else n.delete('profile');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const tierFilter = searchParams.get('tier') ?? 'all';
  const setTierFilter = useCallback(
    (v: string) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'all') n.set('tier', v);
          else n.delete('tier');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const platformSignalFilter = searchParams.get('signal') === '1';
  const setPlatformSignalFilter = useCallback(
    (v: boolean) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v) n.set('signal', '1');
          else n.delete('signal');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // Use centralized profile completion calculation
  const calculateProfileCompletion = (user: User): number => {
    return getProfileCompletionDetails(user).percentage;
  };

  // Enhanced filtering and analytics
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        searchQuery === '' ||
        user.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.company?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || user.approval_status === statusFilter;
      const matchesBuyerType = buyerTypeFilter === 'all' || user.buyer_type === buyerTypeFilter;

      const profileCompletion = calculateProfileCompletion(user);
      const matchesCompletion =
        profileCompletionFilter === 'all' ||
        (profileCompletionFilter === 'complete' && profileCompletion >= 80) ||
        (profileCompletionFilter === 'incomplete' && profileCompletion < 80);

      const matchesTier =
        tierFilter === 'all' ||
        (tierFilter === 'not_scored' && user.buyer_tier == null) ||
        (tierFilter !== 'not_scored' && user.buyer_tier === parseInt(tierFilter, 10));

      const matchesPlatformSignal = !platformSignalFilter || user.platform_signal_detected === true;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesBuyerType &&
        matchesCompletion &&
        matchesTier &&
        matchesPlatformSignal
      );
    });
  }, [
    users,
    searchQuery,
    statusFilter,
    buyerTypeFilter,
    profileCompletionFilter,
    tierFilter,
    platformSignalFilter,
  ]);

  // Notify parent component of filtered users changes
  useEffect(() => {
    onFilteredUsersChange?.(filteredUsers);
  }, [filteredUsers, onFilteredUsersChange]);

  // Analytics calculations
  const analytics = useMemo(() => {
    const total = users.length;
    const pending = users.filter((u) => u.approval_status === 'pending').length;
    const approved = users.filter((u) => u.approval_status === 'approved').length;
    const rejected = users.filter((u) => u.approval_status === 'rejected').length;

    const avgCompletion =
      users.reduce((acc, user) => acc + calculateProfileCompletion(user), 0) / total;

    const buyerTypeBreakdown = users.reduce(
      (acc, user) => {
        acc[user.buyer_type || 'unknown'] = (acc[user.buyer_type || 'unknown'] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total,
      pending,
      approved,
      rejected,
      avgCompletion: Math.round(avgCompletion),
      buyerTypeBreakdown,
    };
  }, [users]);

  // Bulk actions
  const handleBulkApprove = () => {
    const usersToApprove = users.filter(
      (u) => selectedUsers.includes(u.id) && u.approval_status === 'pending',
    );
    usersToApprove.forEach(onApprove);
    setSelectedUsers([]);
  };

  const exportData = () => {
    const csvData = filteredUsers.map((user) => ({
      // Basic Information
      Name: `${user.first_name} ${user.last_name}`,
      Email: user.email,
      Phone: user.phone_number || '',
      Company: user.company || '',
      Website: user.website || '',
      LinkedIn: user.linkedin_profile || '',

      // Account Status
      'Buyer Type': user.buyer_type || '',
      'Approval Status': user.approval_status,
      'Email Verified': user.email_verified ? 'Yes' : 'No',
      'Is Admin': user.is_admin ? 'Yes' : 'No',
      'Onboarding Complete': user.onboarding_completed ? 'Yes' : 'No',

      // Financial Details - ALL FIELDS (with proper formatting)
      'Estimated Revenue': formatFieldValueForExport('estimated_revenue', user.estimated_revenue),
      'Fund Size': formatFieldValueForExport('fund_size', user.fund_size),
      'Investment Size': formatFieldValueForExport('investment_size', user.investment_size),
      AUM: formatFieldValueForExport('aum', user.aum),
      'Target Company Size': formatFieldValueForExport(
        'target_company_size',
        user.target_company_size,
      ),

      // Funding & Financing - ALL FIELDS (with proper formatting)
      'Funding Source': formatFieldValueForExport('funding_source', user.funding_source),
      'Is Funded': formatFieldValueForExport('is_funded', user.is_funded),
      'Funded By': formatFieldValueForExport('funded_by', user.funded_by),
      'Needs Loan': formatFieldValueForExport('needs_loan', user.needs_loan),

      // Business Profile
      'Company Name': user.company_name || '',
      'Ideal Target': user.ideal_target || '',
      'Ideal Target Description': user.ideal_target_description || '',
      Bio: user.bio || '',

      // Search Preferences
      'Business Categories': Array.isArray(user.business_categories)
        ? user.business_categories.join(';')
        : '',
      'Target Locations': user.target_locations || '',
      'Revenue Range Min': user.revenue_range_min || '',
      'Revenue Range Max': user.revenue_range_max || '',
      'Specific Business Search': user.specific_business_search || '',

      // Independent Sponsor Fields (with proper formatting)
      'Target Deal Size Min': formatFieldValueForExport(
        'target_deal_size_min',
        user.target_deal_size_min,
      ),
      'Target Deal Size Max': formatFieldValueForExport(
        'target_deal_size_max',
        user.target_deal_size_max,
      ),
      'Geographic Focus': formatFieldValueForExport('geographic_focus', user.geographic_focus),
      'Industry Expertise': formatFieldValueForExport(
        'industry_expertise',
        user.industry_expertise,
      ),
      'Deal Structure Preference': formatFieldValueForExport(
        'deal_structure_preference',
        user.deal_structure_preference,
      ),
      'Committed Equity Band': formatFieldValueForExport(
        'committed_equity_band',
        user.committed_equity_band,
      ),
      'Equity Source': formatFieldValueForExport('equity_source', user.equity_source),
      'Deployment Timing': formatFieldValueForExport('deployment_timing', user.deployment_timing),
      'Flexible on Size (<$1M EBITDA)': formatFieldValueForExport(
        'flex_subxm_ebitda',
        user.flex_subxm_ebitda,
      ),

      // Corporate Development Fields (with proper formatting)
      'Deal Size Band': formatFieldValueForExport('deal_size_band', user.deal_size_band),
      'Corp Dev Intent': formatFieldValueForExport('corpdev_intent', user.corpdev_intent),
      'Integration Plan': formatFieldValueForExport('integration_plan', user.integration_plan),
      'Deploying Capital Now': formatFieldValueForExport(
        'deploying_capital_now',
        user.deploying_capital_now,
      ),

      // Private Equity Fields (with proper formatting)
      'Permanent Capital': formatFieldValueForExport('permanent_capital', user.permanent_capital),

      // Family Office Fields (with proper formatting)
      'Discretion Type': formatFieldValueForExport('discretion_type', user.discretion_type),

      // Search Fund Fields (with proper formatting)
      'Search Type': formatFieldValueForExport('search_type', user.search_type),
      'Acq Equity Band': formatFieldValueForExport('acq_equity_band', user.acq_equity_band),
      'Financing Plan': formatFieldValueForExport('financing_plan', user.financing_plan),
      'Search Stage': formatFieldValueForExport('search_stage', user.search_stage),

      // Individual Investor Fields (with proper formatting)
      'Uses Bank Finance': formatFieldValueForExport('uses_bank_finance', user.uses_bank_finance),
      'Max Equity Today Band': formatFieldValueForExport(
        'max_equity_today_band',
        user.max_equity_today_band,
      ),

      // Advisor/Banker Fields (with proper formatting)
      'On Behalf of Buyer': formatFieldValueForExport(
        'on_behalf_of_buyer',
        user.on_behalf_of_buyer,
      ),
      'Buyer Role': formatFieldValueForExport('buyer_role', user.buyer_role),

      // Business Owner Fields (with proper formatting)
      'Owner Timeline': formatFieldValueForExport('owner_timeline', user.owner_timeline),

      // Metadata
      'Profile Completion': `${calculateProfileCompletion(user)}%`,
      'Created Date': new Date(user.created_at).toLocaleDateString(),
      'Created Time': new Date(user.created_at).toLocaleTimeString(),
      'Last Updated': new Date(user.updated_at).toLocaleDateString(),
    }));

    // Escape CSV values properly
    const escapeCSV = (value: string) => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csv = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map((row) =>
        Object.values(row)
          .map((v) => escapeCSV(String(v)))
          .join(','),
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `complete-users-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* User Overview Stats */}
      <UserOverviewTab
        users={users}
        totalUsers={analytics.total}
        pendingCount={analytics.pending}
        approvedCount={analytics.approved}
        rejectedCount={analytics.rejected}
      />

      {/* Filters Section - Inline, no card wrapper for cleaner look */}
      <div className="space-y-6 pb-6 border-b">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Filters</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={exportData}
            disabled={filteredUsers.length === 0}
            className="gap-2 h-9"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>

        <div className="space-y-5">
          {/* Search and Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="lg:col-span-2">
              <Label htmlFor="search" className="text-sm font-medium text-muted-foreground">
                Search users
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by name, email, or company..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10 border-border/60 focus:border-primary/40 transition-colors"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 border-border/60 focus:border-primary/40 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground">Buyer Type</Label>
              <Select value={buyerTypeFilter} onValueChange={setBuyerTypeFilter}>
                <SelectTrigger className="h-10 border-border/60 focus:border-primary/40 transition-colors">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="private_equity">Private Equity</SelectItem>
                  <SelectItem value="corporate">Corporate / Strategic</SelectItem>
                  <SelectItem value="family_office">Family Office</SelectItem>
                  <SelectItem value="search_fund">Search Fund</SelectItem>
                  <SelectItem value="individual_buyer">Individual Buyer</SelectItem>
                  <SelectItem value="independent_sponsor">Independent Sponsor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Profile Completion
              </Label>
              <Select value={profileCompletionFilter} onValueChange={setProfileCompletionFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Profiles</SelectItem>
                  <SelectItem value="complete">Complete (80%+)</SelectItem>
                  <SelectItem value="incomplete">&lt;80%</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Buyer Tier</Label>
              <Select value={tierFilter} onValueChange={setTierFilter}>
                <SelectTrigger className="h-10 border-border/60 focus:border-primary/40 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  <SelectItem value="1">Tier 1 — Platform Add-On</SelectItem>
                  <SelectItem value="2">Tier 2 — Committed Capital</SelectItem>
                  <SelectItem value="3">Tier 3 — Indep. Sponsor</SelectItem>
                  <SelectItem value="4">Tier 4 — Unverified</SelectItem>
                  <SelectItem value="not_scored">Not Scored</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Platform signal toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="platform-signal-filter"
              checked={platformSignalFilter}
              onCheckedChange={setPlatformSignalFilter}
            />
            <Label
              htmlFor="platform-signal-filter"
              className="text-sm cursor-pointer flex items-center gap-1"
            >
              <Zap className="h-3.5 w-3.5 text-green-600" />
              Platform / Add-On signal only
            </Label>
          </div>

          {/* Results count */}
          <div className="text-sm text-muted-foreground pt-2">
            Showing <span className="font-medium text-foreground">{filteredUsers.length}</span> of{' '}
            <span className="font-medium text-foreground">{analytics.total}</span> users
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedUsers.length > 0 && (
          <div className="flex items-center gap-3 p-4 bg-accent/50 rounded-lg border">
            <span className="text-sm font-medium">
              {selectedUsers.length} user{selectedUsers.length === 1 ? '' : 's'} selected
            </span>
            <div className="flex gap-2 ml-auto">
              <Button size="sm" onClick={handleBulkApprove} variant="default" className="h-9">
                <UserCheck className="h-4 w-4 mr-2" />
                Approve Selected
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
