import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { X, SlidersHorizontal, Search } from 'lucide-react';

export interface ScoreFiltersState {
  status: string;
  tier: string;
  minScore: number | null;
  buyerType: string;
  search: string;
}

interface ScoreFiltersProps {
  filters: ScoreFiltersState;
  onFiltersChange: (filters: ScoreFiltersState) => void;
  totalCount: number;
  filteredCount: number;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'passed', label: 'Passed' },
];

const TIER_OPTIONS = [
  { value: 'all', label: 'All Tiers' },
  { value: 'A', label: 'Tier A (80+)' },
  { value: 'B', label: 'Tier B (65-79)' },
  { value: 'C', label: 'Tier C (50-64)' },
  { value: 'D', label: 'Tier D (35-49)' },
  { value: 'F', label: 'Tier F (<35)' },
];

const BUYER_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'private_equity', label: 'PE Firms' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'family_office', label: 'Family Office' },
];

export const ScoreFilters = ({
  filters,
  onFiltersChange,
  totalCount,
  filteredCount,
}: ScoreFiltersProps) => {
  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.tier !== 'all' ||
    filters.buyerType !== 'all' ||
    filters.minScore !== null ||
    filters.search !== '';

  const clearFilters = () => {
    onFiltersChange({
      status: 'all',
      tier: 'all',
      minScore: null,
      buyerType: 'all',
      search: '',
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search buyers..."
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className="pl-9"
          />
        </div>

        {/* Status Filter */}
        <Select
          value={filters.status}
          onValueChange={(value) => onFiltersChange({ ...filters, status: value })}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Tier Filter */}
        <Select
          value={filters.tier}
          onValueChange={(value) => onFiltersChange({ ...filters, tier: value })}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Buyer Type Filter */}
        <Select
          value={filters.buyerType}
          onValueChange={(value) => onFiltersChange({ ...filters, buyerType: value })}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUYER_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground"
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 text-sm">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">
            Showing {filteredCount} of {totalCount} matches
          </span>
          <div className="flex gap-1.5">
            {filters.status !== 'all' && (
              <Badge variant="secondary" className="gap-1 text-xs">
                {STATUS_OPTIONS.find((o) => o.value === filters.status)?.label}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => onFiltersChange({ ...filters, status: 'all' })}
                />
              </Badge>
            )}
            {filters.tier !== 'all' && (
              <Badge variant="secondary" className="gap-1 text-xs">
                {TIER_OPTIONS.find((o) => o.value === filters.tier)?.label}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => onFiltersChange({ ...filters, tier: 'all' })}
                />
              </Badge>
            )}
            {filters.buyerType !== 'all' && (
              <Badge variant="secondary" className="gap-1 text-xs">
                {BUYER_TYPE_OPTIONS.find((o) => o.value === filters.buyerType)?.label}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => onFiltersChange({ ...filters, buyerType: 'all' })}
                />
              </Badge>
            )}
            {filters.search && (
              <Badge variant="secondary" className="gap-1 text-xs">
                "{filters.search}"
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => onFiltersChange({ ...filters, search: '' })}
                />
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Helper to filter scores based on filter state
// eslint-disable-next-line react-refresh/only-export-components
export const filterScores = (scores: unknown[], filters: ScoreFiltersState): unknown[] => {
  return scores.filter((_score) => {
    const score = _score as Record<string, unknown>;
    const buyer = score.buyer as Record<string, unknown> | undefined;
    // Status filter
    if (filters.status !== 'all' && score.status !== filters.status) {
      return false;
    }

    // Tier filter
    if (filters.tier !== 'all' && score.tier !== filters.tier) {
      return false;
    }

    // Buyer type filter
    if (filters.buyerType !== 'all' && buyer?.buyer_type !== filters.buyerType) {
      return false;
    }

    // Min score filter
    if (filters.minScore !== null && ((score.composite_score as number) || 0) < filters.minScore) {
      return false;
    }

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const companyName = ((buyer?.company_name as string) || '').toLowerCase();
      const thesis = ((buyer?.thesis_summary as string) || '').toLowerCase();
      if (!companyName.includes(searchLower) && !thesis.includes(searchLower)) {
        return false;
      }
    }

    return true;
  });
};
