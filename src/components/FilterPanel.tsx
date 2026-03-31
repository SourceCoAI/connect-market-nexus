import { memo, useState, useEffect, useRef } from "react";
import { FilterOptions } from "@/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, DollarSign, Bell } from "lucide-react";
import { useAnalyticsTracking } from "@/hooks/use-analytics-tracking";
import { CreateDealAlertDialog } from "./deal-alerts/CreateDealAlertDialog";
import { STANDARDIZED_CATEGORIES, STANDARDIZED_LOCATIONS } from "@/lib/financial-parser";

// Filter panel props
export interface FilterPanelProps {
  onFilterChange: (filters: FilterOptions) => void;
  onResetFilters: () => void;
  totalListings: number;
  filteredCount: number;
  categories?: string[];
  locations?: string[];
  // Current filter values (controlled component)
  currentFilters: {
    search: string;
    category: string;
    location: string;
    revenueMin?: number;
    revenueMax?: number;
    ebitdaMin?: number;
    ebitdaMax?: number;
  };
}

// Categories now sourced from standardized constants

// Revenue range options (in millions)
const REVENUE_RANGES = [
  { label: 'Any', value: null },
  { label: 'Under $1M', value: { min: 0, max: 1000000 } },
  { label: '$1M - $5M', value: { min: 1000000, max: 5000000 } },
  { label: '$5M - $10M', value: { min: 5000000, max: 10000000 } },
  { label: '$10M - $25M', value: { min: 10000000, max: 25000000 } },
  { label: '$25M - $50M', value: { min: 25000000, max: 50000000 } },
  { label: 'Over $50M', value: { min: 50000000, max: null } }
];

// EBITDA range options (in millions)
const EBITDA_RANGES = [
  { label: 'Any', value: null },
  { label: 'Under $500K', value: { min: 0, max: 500000 } },
  { label: '$500K - $1M', value: { min: 500000, max: 1000000 } },
  { label: '$1M - $2.5M', value: { min: 1000000, max: 2500000 } },
  { label: '$2.5M - $5M', value: { min: 2500000, max: 5000000 } },
  { label: '$5M - $10M', value: { min: 5000000, max: 10000000 } },
  { label: 'Over $10M', value: { min: 10000000, max: null } }
];

const FilterPanel = memo(function FilterPanel({
  onFilterChange,
  onResetFilters,
  totalListings,
  filteredCount,
  categories: _categories = [],
  locations: _locations = [],
  currentFilters
}: FilterPanelProps) {
  const { trackSearch } = useAnalyticsTracking();
  const [localSearch, setLocalSearch] = useState(currentFilters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync local search when external filter changes (e.g. reset)
  useEffect(() => {
    setLocalSearch(currentFilters.search);
  }, [currentFilters.search]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  // Helper function to get current revenue range label
  const getCurrentRevenueRange = () => {
    if (currentFilters.revenueMin == null && currentFilters.revenueMax == null) return 'Any';
    const range = REVENUE_RANGES.find(r => {
      if (!r.value) return false;
      const minMatch = r.value.min === currentFilters.revenueMin || (r.value.min === null && currentFilters.revenueMin == null);
      const maxMatch = r.value.max === currentFilters.revenueMax || (r.value.max === null && currentFilters.revenueMax == null);
      return minMatch && maxMatch;
    });
    return range?.label || 'Any';
  };

  // Helper function to get current EBITDA range label
  const getCurrentEbitdaRange = () => {
    if (currentFilters.ebitdaMin == null && currentFilters.ebitdaMax == null) return 'Any';
    const range = EBITDA_RANGES.find(r => {
      if (!r.value) return false;
      const minMatch = r.value.min === currentFilters.ebitdaMin || (r.value.min === null && currentFilters.ebitdaMin == null);
      const maxMatch = r.value.max === currentFilters.ebitdaMax || (r.value.max === null && currentFilters.ebitdaMax == null);
      return minMatch && maxMatch;
    });
    return range?.label || 'Any';
  };

  const allCategories = STANDARDIZED_CATEGORIES;

  // Debounced search handler (300ms delay)
  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFilterChange({ search: value });
      if (value.trim()) {
        trackSearch(value, { search: value, category: currentFilters.category, location: currentFilters.location }, filteredCount, filteredCount === 0);
      }
    }, 300);
  };

  const handleCategoryChange = (value: string) => {
    onFilterChange({ category: value });
  };

  const handleLocationChange = (value: string) => {
    onFilterChange({ location: value });
  };

  const handleRevenueRangeChange = (rangeLabel: string) => {
    const range = REVENUE_RANGES.find(r => r.label === rangeLabel);
    if (range?.value) {
      onFilterChange({ 
        revenueMin: range.value.min ?? undefined, 
        revenueMax: range.value.max ?? undefined 
      });
    } else {
      onFilterChange({ revenueMin: undefined, revenueMax: undefined });
    }
  };

  const handleEbitdaRangeChange = (rangeLabel: string) => {
    const range = EBITDA_RANGES.find(r => r.label === rangeLabel);
    if (range?.value) {
      onFilterChange({ 
        ebitdaMin: range.value.min ?? undefined, 
        ebitdaMax: range.value.max ?? undefined 
      });
    } else {
      onFilterChange({ ebitdaMin: undefined, ebitdaMax: undefined });
    }
  };

  const handleResetFilters = () => {
    onResetFilters();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Filters
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="space-y-2">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            placeholder="Search listings..."
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        
        {/* Category select */}
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select value={currentFilters.category} onValueChange={handleCategoryChange}>
            <SelectTrigger id="category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent className="z-50 bg-background">
              <SelectItem value="all">All categories</SelectItem>
              {allCategories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* Location select */}
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Select value={currentFilters.location} onValueChange={handleLocationChange}>
            <SelectTrigger id="location">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent className="z-50 bg-background">
              <SelectItem value="all">All locations</SelectItem>
              {STANDARDIZED_LOCATIONS.map((loc) => (
                <SelectItem key={loc} value={loc}>{loc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* Revenue Range */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Annual Revenue
          </Label>
          <Select value={getCurrentRevenueRange()} onValueChange={handleRevenueRangeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Any revenue" />
            </SelectTrigger>
            <SelectContent>
              {REVENUE_RANGES.map((range) => (
                <SelectItem key={range.label} value={range.label}>
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* EBITDA Range */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Annual EBITDA
          </Label>
          <Select value={getCurrentEbitdaRange()} onValueChange={handleEbitdaRangeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Any EBITDA" />
            </SelectTrigger>
            <SelectContent>
              {EBITDA_RANGES.map((range) => (
                <SelectItem key={range.label} value={range.label}>
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* Results summary and actions */}
        <div className="pt-4 space-y-4 border-t">
          <div className="text-sm">
            <p>Showing {filteredCount} of {totalListings} listings</p>
          </div>
          
          <CreateDealAlertDialog 
            trigger={
              <Button variant="default" className="w-full">
                <Bell className="h-4 w-4 mr-2" />
                Get Deal Alerts
              </Button>
            }
          />
          
          <Button variant="outline" onClick={handleResetFilters} className="w-full">
            Reset all filters
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

export default FilterPanel;
