import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { usePipelineCore } from '@/hooks/admin/use-pipeline-core';

interface ActiveFilterChipsProps {
  pipeline: ReturnType<typeof usePipelineCore>;
}

export function ActiveFilterChips({ pipeline }: ActiveFilterChipsProps) {
  const activeFilters: Array<{ key: string; label: string; onRemove: () => void }> = [];

  // Search query
  if (pipeline.searchQuery.trim()) {
    activeFilters.push({
      key: 'search',
      label: `Search: "${pipeline.searchQuery}"`,
      onRemove: () => pipeline.setSearchQuery(''),
    });
  }

  // Stage filter - Dynamic stage name lookup
  if (pipeline.statusFilter !== 'all') {
    let stageLabel = pipeline.statusFilter;
    
    // Check for special filters
    if (pipeline.statusFilter === 'active_only') {
      stageLabel = 'Active Only';
    } else if (pipeline.statusFilter === 'closed_won') {
      stageLabel = 'Closed Won';
    } else if (pipeline.statusFilter === 'closed_lost') {
      stageLabel = 'Closed Lost';
    } else if (pipeline.statusFilter === 'closed') {
      stageLabel = 'Closed (All)';
    } else {
      // Try to find the stage name from pipeline.stages
      const stage = pipeline.stages.find(s => s.id === pipeline.statusFilter);
      stageLabel = stage?.name || pipeline.statusFilter;
    }
    
    activeFilters.push({
      key: 'stage',
      label: `Stage: ${stageLabel}`,
      onRemove: () => pipeline.setStatusFilter('all'),
    });
  }

  // Document status filter
  if (pipeline.documentStatusFilter !== 'all') {
    const docLabels: Record<string, string> = {
      'both_signed': 'Both Docs Signed',
      'nda_signed': 'NDA Signed',
      'fee_signed': 'Fee Signed',
      'none_signed': 'No Docs Signed',
      'overdue_followup': 'Overdue Follow-up',
    };
    activeFilters.push({
      key: 'docs',
      label: `Docs: ${docLabels[pipeline.documentStatusFilter] || pipeline.documentStatusFilter}`,
      onRemove: () => pipeline.setDocumentStatusFilter('all'),
    });
  }

  // Buyer type filter
  if (pipeline.buyerTypeFilter !== 'all') {
    const buyerLabels: Record<string, string> = {
      'private_equity': 'Private Equity',
      'family_office': 'Family Office',
      'search_fund': 'Search Fund',
      'corporate': 'Corporate / Strategic',
      'individual_buyer': 'Individual Buyer',
      'independent_sponsor': 'Independent Sponsor',
    };
    activeFilters.push({
      key: 'buyer',
      label: `Buyer: ${buyerLabels[pipeline.buyerTypeFilter] || pipeline.buyerTypeFilter}`,
      onRemove: () => pipeline.setBuyerTypeFilter('all'),
    });
  }

  // Listing filter
  if (pipeline.listingFilter !== 'all') {
    const listingObj = pipeline.uniqueListings?.find(l => l.id === pipeline.listingFilter);
    const displayLabel = listingObj?.title || 'Unknown Listing';
    activeFilters.push({
      key: 'listing',
      label: `Listing: ${displayLabel}`,
      onRemove: () => pipeline.setListingFilter('all'),
    });
  }

  // Company filter (multi-select)
  if (pipeline.companyFilter.length > 0) {
    pipeline.companyFilter.forEach(companyValue => {
      // Find the display label for this company value
      const companyObj = pipeline.uniqueCompanies?.find(c => c.value === companyValue);
      const displayLabel = companyObj?.label || companyValue;
      
      activeFilters.push({
        key: `company-${companyValue}`,
        label: `Company: ${displayLabel}`,
        onRemove: () => pipeline.setCompanyFilter(pipeline.companyFilter.filter(c => c !== companyValue)),
      });
    });
  }

  // Admin filter
  if (pipeline.adminFilter !== 'all') {
    let adminLabel = '';
    if (pipeline.adminFilter === 'unassigned') {
      adminLabel = 'Unassigned';
    } else if (pipeline.adminFilter === 'assigned_to_me') {
      adminLabel = 'Assigned to Me';
    } else {
      adminLabel = `Owner: ${pipeline.adminFilter}`;
    }
    activeFilters.push({
      key: 'admin',
      label: adminLabel,
      onRemove: () => pipeline.setAdminFilter('all'),
    });
  }

  // Created date range
  if (pipeline.createdDateRange.start || pipeline.createdDateRange.end) {
    let dateLabel = 'Created: ';
    if (pipeline.createdDateRange.start && pipeline.createdDateRange.end) {
      dateLabel += `${format(pipeline.createdDateRange.start, 'MMM d')} - ${format(pipeline.createdDateRange.end, 'MMM d')}`;
    } else if (pipeline.createdDateRange.start) {
      dateLabel += `After ${format(pipeline.createdDateRange.start, 'MMM d, yyyy')}`;
    } else if (pipeline.createdDateRange.end) {
      dateLabel += `Before ${format(pipeline.createdDateRange.end, 'MMM d, yyyy')}`;
    }
    activeFilters.push({
      key: 'created',
      label: dateLabel,
      onRemove: () => pipeline.setCreatedDateRange({ start: null, end: null }),
    });
  }

  // Last activity range
  if (pipeline.lastActivityRange.start || pipeline.lastActivityRange.end) {
    let dateLabel = 'Activity: ';
    if (pipeline.lastActivityRange.start && pipeline.lastActivityRange.end) {
      dateLabel += `${format(pipeline.lastActivityRange.start, 'MMM d')} - ${format(pipeline.lastActivityRange.end, 'MMM d')}`;
    } else if (pipeline.lastActivityRange.start) {
      dateLabel += `After ${format(pipeline.lastActivityRange.start, 'MMM d, yyyy')}`;
    } else if (pipeline.lastActivityRange.end) {
      dateLabel += `Before ${format(pipeline.lastActivityRange.end, 'MMM d, yyyy')}`;
    }
    activeFilters.push({
      key: 'activity',
      label: dateLabel,
      onRemove: () => pipeline.setLastActivityRange({ start: null, end: null }),
    });
  }

  if (activeFilters.length === 0) return null;

  const clearAllFilters = () => {
    pipeline.setListingFilter('all');
    pipeline.setStatusFilter('all');
    pipeline.setDocumentStatusFilter('all');
    pipeline.setBuyerTypeFilter('all');
    pipeline.setCompanyFilter([]);
    pipeline.setAdminFilter('all');
    pipeline.setCreatedDateRange({ start: null, end: null });
    pipeline.setLastActivityRange({ start: null, end: null });
    pipeline.setSearchQuery('');
  };

  return (
    <div className="flex items-center gap-2 flex-wrap p-2 bg-muted/30 border-b">
      <span className="text-xs font-medium text-muted-foreground">Active Filters:</span>
      {activeFilters.map((filter) => (
        <Badge
          key={filter.key}
          variant="secondary"
          className="gap-1 pr-1 text-xs"
        >
          {filter.label}
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
            onClick={filter.onRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      ))}
      {activeFilters.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={clearAllFilters}
        >
          Clear all
        </Button>
      )}
    </div>
  );
}
