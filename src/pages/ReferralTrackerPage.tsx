import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, Lock, Building2, ChevronDown, Users, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { ReferralSubmissionForm } from '@/components/remarketing/ReferralSubmissionForm';
import { ReferralCSVUpload } from '@/components/remarketing/ReferralCSVUpload';
const sourcecoLogo = '/lovable-uploads/b879fa06-6a99-4263-b973-b9ced4404acb.png';

interface PartnerData {
  name: string;
  company: string | null;
}

interface DealRow {
  id: string;
  title: string | null;
  category: string | null;
  revenue: number | null;
  ebitda: number | null;
  full_time_employees: number | null;
  location: string | null;
  source: 'listing' | 'submission';
  status?: string;
  is_priority_target?: boolean;
  website?: string | null;
  deal_total_score?: number | null;
  main_contact_name?: string | null;
  main_contact_title?: string | null;
  main_contact_email?: string | null;
  linkedin_employee_count?: number | null;
  linkedin_employee_range?: string | null;
}

const formatCurrency = (value: number | null) => {
  if (!value) return '-';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
};

const statusBadge = (status: string | undefined, source: 'listing' | 'submission') => {
  if (!status) return null;
  if (source === 'listing') {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>;
      case 'draft':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">In Review</Badge>;
      case 'archived':
        return <Badge className="bg-gray-100 text-gray-600 border-gray-200">Archived</Badge>;
      default:
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">{status}</Badge>;
    }
  }
  switch (status) {
    case 'pending':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pending</Badge>;
    case 'approved':
      return <Badge className="bg-green-100 text-green-800 border-green-200">Approved</Badge>;
    case 'rejected':
      return <Badge className="bg-gray-100 text-gray-600 border-gray-200">Rejected</Badge>;
    default:
      return null;
  }
};

export default function ReferralTrackerPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [partner, setPartner] = useState<PartnerData | null>(null);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');

  // Derive unique categories, statuses, and locations from deals
  const filterOptions = useMemo(() => {
    const categories = new Set<string>();
    const statuses = new Set<string>();
    const locations = new Set<string>();
    for (const d of deals) {
      if (d.category) categories.add(d.category);
      if (d.status) statuses.add(d.status);
      if (d.location) locations.add(d.location);
    }
    return {
      categories: Array.from(categories).sort(),
      statuses: Array.from(statuses).sort(),
      locations: Array.from(locations).sort(),
    };
  }, [deals]);

  // Filtered deals
  const filteredDeals = useMemo(() => {
    return deals.filter((deal) => {
      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          (deal.title || '').toLowerCase().includes(q) ||
          (deal.category || '').toLowerCase().includes(q) ||
          (deal.location || '').toLowerCase().includes(q) ||
          (deal.website || '').toLowerCase().includes(q) ||
          (deal.main_contact_name || '').toLowerCase().includes(q) ||
          (deal.main_contact_email || '').toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      // Category filter
      if (categoryFilter !== 'all' && deal.category !== categoryFilter) return false;
      // Status filter
      if (statusFilter !== 'all' && deal.status !== statusFilter) return false;
      // Location filter
      if (locationFilter !== 'all' && deal.location !== locationFilter) return false;
      return true;
    });
  }, [deals, searchQuery, categoryFilter, statusFilter, locationFilter]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    categoryFilter !== 'all' ||
    statusFilter !== 'all' ||
    locationFilter !== 'all';

  const clearAllFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setStatusFilter('all');
    setLocationFilter('all');
  };

  const fetchData = useCallback(async () => {
    if (!shareToken || !authenticated) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-referral-access', {
        body: {
          action: 'get-data',
          shareToken,
          password,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setPartner(data.partner);

      const dealRows: DealRow[] = [];

      if (data.listings) {
        for (const l of data.listings) {
          dealRows.push({
            id: l.id,
            title: l.title || l.internal_company_name,
            category: l.category,
            revenue: l.revenue,
            ebitda: l.ebitda,
            full_time_employees: l.full_time_employees,
            location: l.location,
            source: 'listing',
            status: l.status,
            is_priority_target: l.is_priority_target,
            website: l.website,
            deal_total_score: l.deal_total_score,
            main_contact_name: l.main_contact_name,
            main_contact_title: l.main_contact_title,
            main_contact_email: l.main_contact_email,
            linkedin_employee_count: l.linkedin_employee_count,
            linkedin_employee_range: l.linkedin_employee_range,
          });
        }
      }

      if (data.submissions) {
        for (const s of data.submissions) {
          if (s.status === 'approved' && s.listing_id) continue;

          dealRows.push({
            id: s.id,
            title: s.company_name,
            category: s.industry,
            revenue: s.revenue,
            ebitda: s.ebitda,
            full_time_employees: null,
            location: s.location,
            source: 'submission',
            status: s.status,
            website: s.website || null,
            main_contact_name: s.contact_name || null,
            main_contact_email: s.contact_email || null,
          });
        }
      }

      setDeals(dealRows);
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [shareToken, authenticated, password]);

  useEffect(() => {
    if (authenticated) {
      fetchData();
    }
  }, [authenticated, fetchData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareToken || !password.trim()) return;

    setIsAuthenticating(true);
    setLoginError(null);
    try {
      const { data, error } = await supabase.functions.invoke('validate-referral-access', {
        body: {
          action: 'validate',
          shareToken,
          password: password.trim(),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.valid) {
        setAuthenticated(true);
        setPartner(data.partner);
      } else {
        const msg = 'Invalid password';
        setLoginError(msg);
        toast.error(msg);
      }
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Authentication failed';
      setLoginError(msg);
      toast.error(msg);
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Login screen
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-sourceco-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-sourceco-form bg-white shadow-lg">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img src={sourcecoLogo} alt="SourceCo" className="h-12 w-auto" />
            </div>
            <CardTitle className="text-2xl text-foreground">Referral Tracker</CardTitle>
            <p className="text-muted-foreground text-sm mt-1">
              Enter your password to access your referral dashboard
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tracker-password" className="text-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="tracker-password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 bg-sourceco-form border-sourceco-form text-foreground placeholder:text-muted-foreground"
                    autoFocus
                  />
                </div>
              </div>
              {loginError && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                  {loginError}
                </p>
              )}
              <Button
                type="submit"
                className="w-full bg-sourceco-accent hover:bg-sourceco-accent/90 text-sourceco-accent-foreground"
                disabled={isAuthenticating || !password.trim()}
              >
                {isAuthenticating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4 mr-2" />
                )}
                Access Tracker
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main tracker page
  return (
    <div className="min-h-screen bg-sourceco-background">
      <header className="border-b border-sourceco-form bg-white/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={sourcecoLogo} alt="SourceCo" className="h-9 w-auto" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                {partner?.name || 'Partner'} — Referral Tracker
              </h1>
              {partner?.company && (
                <p className="text-sm text-muted-foreground">{partner.company}</p>
              )}
            </div>
          </div>
          <Badge variant="outline" className="border-sourceco-accent text-sourceco-accent">
            {deals.length} {deals.length === 1 ? 'Referral' : 'Referrals'}
          </Badge>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <Card className="border-sourceco-form bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-foreground">Your Referrals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-sourceco-accent" />
              </div>
            ) : deals.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No referrals yet. Submit your first below.</p>
              </div>
            ) : (
              <>
                {/* Search & Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search referrals..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9 bg-sourceco-form border-sourceco-form text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  {filterOptions.categories.length > 1 && (
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-[160px] h-9 bg-sourceco-form border-sourceco-form text-foreground">
                        <SelectValue placeholder="Industry" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Industries</SelectItem>
                        {filterOptions.categories.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {filterOptions.statuses.length > 1 && (
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[140px] h-9 bg-sourceco-form border-sourceco-form text-foreground">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {filterOptions.statuses.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {filterOptions.locations.length > 1 && (
                    <Select value={locationFilter} onValueChange={setLocationFilter}>
                      <SelectTrigger className="w-[160px] h-9 bg-sourceco-form border-sourceco-form text-foreground">
                        <SelectValue placeholder="Location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Locations</SelectItem>
                        {filterOptions.locations.map((l) => (
                          <SelectItem key={l} value={l}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllFilters}
                      className="h-9 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
                {hasActiveFilters && (
                  <p className="text-xs text-muted-foreground">
                    Showing <span className="font-medium text-foreground">{filteredDeals.length}</span> of{' '}
                    <span className="font-medium text-foreground">{deals.length}</span> referrals
                  </p>
                )}

                {filteredDeals.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No referrals match your search</p>
                  </div>
                ) : (
              <div className="border border-sourceco-form rounded-lg overflow-auto">
                <Table className="table-fixed w-full" style={{ minWidth: '1100px' }}>
                  <TableHeader>
                    <TableRow className="border-sourceco-form bg-sourceco-form/30">
                      <TableHead
                        className="text-foreground font-semibold overflow-hidden resize-x"
                        style={{ width: 180 }}
                      >
                        Company Name
                      </TableHead>
                      <TableHead
                        className="text-foreground font-semibold overflow-hidden resize-x"
                        style={{ width: 180 }}
                      >
                        Industry
                      </TableHead>
                      <TableHead
                        className="text-foreground font-semibold overflow-hidden resize-x"
                        style={{ width: 140 }}
                      >
                        Website
                      </TableHead>
                      <TableHead
                        className="text-foreground font-semibold text-center overflow-hidden resize-x"
                        style={{ width: 70 }}
                      >
                        Score
                      </TableHead>
                      <TableHead
                        className="text-foreground font-semibold overflow-hidden resize-x"
                        style={{ width: 160 }}
                      >
                        Contact
                      </TableHead>
                      <TableHead
                        className="text-foreground font-semibold text-right overflow-hidden resize-x"
                        style={{ width: 100 }}
                      >
                        Revenue
                      </TableHead>
                      <TableHead
                        className="text-foreground font-semibold text-right overflow-hidden resize-x"
                        style={{ width: 100 }}
                      >
                        EBITDA
                      </TableHead>
                      <TableHead
                        className="text-foreground font-semibold overflow-hidden resize-x"
                        style={{ width: 120 }}
                      >
                        LinkedIn
                      </TableHead>
                      <TableHead
                        className="text-foreground font-semibold overflow-hidden resize-x"
                        style={{ width: 110 }}
                      >
                        Location
                      </TableHead>
                      <TableHead
                        className="text-foreground font-semibold overflow-hidden resize-x"
                        style={{ width: 80 }}
                      >
                        Status
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDeals.map((deal) => (
                      <TableRow
                        key={deal.id}
                        className={`border-sourceco-form ${deal.is_priority_target ? 'bg-amber-50' : ''}`}
                      >
                        <TableCell className="font-medium text-foreground truncate">
                          {deal.title || 'Untitled'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm truncate">
                          {deal.category || '-'}
                        </TableCell>
                        <TableCell className="text-sm truncate">
                          {deal.website ? (
                            <a
                              href={
                                deal.website.startsWith('http')
                                  ? deal.website
                                  : `https://${deal.website}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sourceco-accent hover:underline truncate block"
                            >
                              {deal.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {deal.deal_total_score ? (
                            <Badge
                              className={`text-xs ${
                                deal.deal_total_score >= 80
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : deal.deal_total_score >= 60
                                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                                    : deal.deal_total_score >= 40
                                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                                      : 'bg-red-100 text-red-800 border-red-200'
                              }`}
                            >
                              {deal.deal_total_score}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm truncate">
                          {deal.main_contact_name ? (
                            <div className="space-y-0.5 overflow-hidden">
                              <div className="text-foreground font-medium text-xs truncate">
                                {deal.main_contact_name}
                              </div>
                              {deal.main_contact_title && (
                                <div className="text-muted-foreground text-xs truncate">
                                  {deal.main_contact_title}
                                </div>
                              )}
                              {deal.main_contact_email && (
                                <a
                                  href={`mailto:${deal.main_contact_email}`}
                                  className="text-sourceco-accent hover:underline text-xs block truncate"
                                >
                                  {deal.main_contact_email}
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm text-right truncate">
                          {formatCurrency(deal.revenue)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm text-right truncate">
                          {formatCurrency(deal.ebitda)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {deal.linkedin_employee_count ? (
                            <div className="space-y-0.5 overflow-hidden">
                              <div className="flex items-center gap-1 text-foreground">
                                <Users className="h-3 w-3 text-blue-600 shrink-0" />
                                <span className="font-medium text-xs">
                                  {deal.linkedin_employee_count.toLocaleString()}
                                </span>
                              </div>
                              {deal.linkedin_employee_range && (
                                <div className="text-muted-foreground text-xs truncate">
                                  {deal.linkedin_employee_range}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm truncate">
                          {deal.location || '-'}
                        </TableCell>
                        <TableCell>{statusBadge(deal.status, deal.source)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-sourceco-form bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-foreground">Submit New Referrals</CardTitle>
            <p className="text-sm text-muted-foreground">
              Submit a single company or upload a spreadsheet with multiple companies
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">Upload Spreadsheet</h3>
              <ReferralCSVUpload
                shareToken={shareToken!}
                password={password}
                onUploaded={fetchData}
              />
            </div>

            <Collapsible defaultOpen={false} className="border-t border-sourceco-form pt-6">
              <CollapsibleTrigger className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Or Submit One Company
                <ChevronDown className="h-4 w-4 transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <ReferralSubmissionForm
                  shareToken={shareToken!}
                  password={password}
                  onSubmitted={fetchData}
                />
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
