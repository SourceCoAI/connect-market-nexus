import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  X,
  CalendarIcon,
  Building2,
  UserCircle,
  Filter,
  CheckCircle2,
  Target,
  XCircle,
  Save,
  MoreVertical,
  Trash2,
  ArrowUpDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { usePipelineCore } from '@/hooks/admin/use-pipeline-core';
import { useFilterPresets, useDeleteFilterPreset } from '@/hooks/admin/use-filter-presets';
import { SaveFilterPresetDialog } from './SaveFilterPresetDialog';
import { DateRangeFilter } from './DateRangeFilter';
import { useState as useReactState } from 'react';

interface PipelineFilterPanelProps {
  pipeline: ReturnType<typeof usePipelineCore>;
}

export function PipelineFilterPanel({ pipeline }: PipelineFilterPanelProps) {
  const [isSavePresetOpen, setIsSavePresetOpen] = useReactState(false);
  const { data: presets = [] } = useFilterPresets();
  const deletePreset = useDeleteFilterPreset();

  if (!pipeline.isFilterPanelOpen) return null;

  const activeFiltersCount = [
    pipeline.statusFilter !== 'all',
    pipeline.documentStatusFilter !== 'all',
    pipeline.buyerTypeFilter !== 'all',
    pipeline.companyFilter.length > 0,
    pipeline.adminFilter !== 'all',
    pipeline.createdDateRange.start !== null,
    pipeline.createdDateRange.end !== null,
    pipeline.lastActivityRange.start !== null,
    pipeline.lastActivityRange.end !== null,
    pipeline.searchQuery.trim() !== '',
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    pipeline.setStatusFilter('all');
    pipeline.setDocumentStatusFilter('all');
    pipeline.setBuyerTypeFilter('all');
    pipeline.setCompanyFilter([]);
    pipeline.setAdminFilter('all');
    pipeline.setCreatedDateRange({ start: null, end: null });
    pipeline.setLastActivityRange({ start: null, end: null });
    pipeline.setSearchQuery('');
  };

  const getCurrentFilters = () => ({
    statusFilter: pipeline.statusFilter,
    documentStatusFilter: pipeline.documentStatusFilter,
    buyerTypeFilter: pipeline.buyerTypeFilter,
    companyFilter: pipeline.companyFilter,
    adminFilter: pipeline.adminFilter,
    createdDateRange: pipeline.createdDateRange,
    lastActivityRange: pipeline.lastActivityRange,
    searchQuery: pipeline.searchQuery,
    sortOption: pipeline.sortOption, // Added: Include sort option in saved presets
  });

  const loadPreset = (preset: { filters: Record<string, unknown> }) => {
    const filters = preset.filters;
    if (filters.statusFilter) pipeline.setStatusFilter(filters.statusFilter as string);
    if (filters.documentStatusFilter)
      pipeline.setDocumentStatusFilter(
        filters.documentStatusFilter as
          | 'all'
          | 'nda_signed'
          | 'fee_signed'
          | 'both_signed'
          | 'none_signed'
          | 'overdue_followup',
      );
    if (filters.buyerTypeFilter)
      pipeline.setBuyerTypeFilter(
        filters.buyerTypeFilter as
          | 'all'
          | 'private_equity'
          | 'corporate'
          | 'family_office'
          | 'independent_sponsor'
          | 'search_fund'
          | 'individual_buyer',
      );
    if (filters.companyFilter) pipeline.setCompanyFilter(filters.companyFilter as string[]);
    if (filters.adminFilter) pipeline.setAdminFilter(filters.adminFilter as string);
    if (filters.createdDateRange)
      pipeline.setCreatedDateRange(
        filters.createdDateRange as { start: Date | null; end: Date | null },
      );
    if (filters.lastActivityRange)
      pipeline.setLastActivityRange(
        filters.lastActivityRange as { start: Date | null; end: Date | null },
      );
    if (filters.searchQuery) pipeline.setSearchQuery(filters.searchQuery as string);
    if (filters.sortOption)
      pipeline.setSortOption(filters.sortOption as typeof pipeline.sortOption); // Added: Restore sort option from presets
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 lg:relative lg:bg-transparent lg:backdrop-blur-none lg:z-auto">
      <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-background border-l shadow-2xl lg:relative lg:w-full lg:h-auto lg:shadow-none overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-muted/50">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Filters</h3>
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeFiltersCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Saved Presets */}
            {presets.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5 text-sm font-semibold">Saved Presets</div>
                  <DropdownMenuSeparator />
                  {presets.map((preset) => (
                    <DropdownMenuItem
                      key={preset.id}
                      onSelect={() => loadPreset(preset)}
                      className="flex items-center justify-between"
                    >
                      <span>{preset.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePreset.mutate(preset.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Save Current Filters */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setIsSavePresetOpen(true)}
              title="Save current filters"
            >
              <Save className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={pipeline.toggleFilterPanel}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="h-[calc(100vh-140px)] lg:h-[600px]">
          <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
            {/* Search - Always visible */}
            <div>
              <label className="text-sm font-medium mb-2 block">Search</label>
              <Input
                placeholder="Search deals, buyers..."
                value={pipeline.searchQuery}
                onChange={(e) => pipeline.setSearchQuery(e.target.value)}
                className="h-9"
              />
            </div>

            {/* Collapsible Filter Sections */}
            <Accordion
              type="multiple"
              defaultValue={['stage', 'company', 'admin']}
              className="space-y-2"
            >
              {/* Stage Status */}
              <AccordionItem value="stage" className="border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Deal Stage
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div className="space-y-2">
                    {/* All Stages */}
                    <Button
                      variant={pipeline.statusFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => pipeline.setStatusFilter('all')}
                    >
                      <Target className="h-4 w-4 mr-2" />
                      <span className="flex-1 text-left">All Stages</span>
                      <Badge variant="secondary" className="ml-auto">
                        {pipeline.deals.length}
                      </Badge>
                    </Button>

                    {/* Active Only */}
                    <Button
                      variant={pipeline.statusFilter === 'active_only' ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => pipeline.setStatusFilter('active_only')}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      <span className="flex-1 text-left">Active Only</span>
                      <Badge variant="secondary" className="ml-auto">
                        {
                          pipeline.deals.filter(
                            (d) => !['Closed Won', 'Closed Lost'].includes(d.stage_name || ''),
                          ).length
                        }
                      </Badge>
                    </Button>

                    <Separator className="my-2" />

                    {/* Dynamic stages from database (active stages only) */}
                    {pipeline.stages
                      .filter(
                        (stage) =>
                          stage.is_active && (stage.stage_type === 'active' || !stage.stage_type),
                      )
                      .map((stage) => {
                        const stageDeals = pipeline.deals.filter((d) => d.stage_id === stage.id);

                        return (
                          <Button
                            key={stage.id}
                            variant={pipeline.statusFilter === stage.id ? 'default' : 'outline'}
                            size="sm"
                            className="w-full justify-start gap-2"
                            onClick={() => pipeline.setStatusFilter(stage.id)}
                          >
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: stage.color }}
                            />
                            <span className="flex-1 text-left">{stage.name}</span>
                            <Badge variant="secondary" className="ml-auto">
                              {stageDeals.length}
                            </Badge>
                          </Button>
                        );
                      })}

                    <Separator className="my-2" />

                    {/* Closed Won */}
                    <Button
                      variant={pipeline.statusFilter === 'closed_won' ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start gap-2"
                      onClick={() => pipeline.setStatusFilter('closed_won')}
                    >
                      <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                      <span className="flex-1 text-left">Closed Won</span>
                      <Badge variant="secondary" className="ml-auto">
                        {pipeline.deals.filter((d) => d.stage_name === 'Closed Won').length}
                      </Badge>
                    </Button>

                    {/* Closed Lost */}
                    <Button
                      variant={pipeline.statusFilter === 'closed_lost' ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start gap-2"
                      onClick={() => pipeline.setStatusFilter('closed_lost')}
                    >
                      <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                      <span className="flex-1 text-left">Closed Lost</span>
                      <Badge variant="secondary" className="ml-auto">
                        {pipeline.deals.filter((d) => d.stage_name === 'Closed Lost').length}
                      </Badge>
                    </Button>

                    {/* Closed (All) */}
                    <Button
                      variant={pipeline.statusFilter === 'closed' ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start gap-2"
                      onClick={() => pipeline.setStatusFilter('closed')}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      <span className="flex-1 text-left">Closed (All)</span>
                      <Badge variant="secondary" className="ml-auto">
                        {
                          pipeline.deals.filter((d) =>
                            ['Closed Won', 'Closed Lost'].includes(d.stage_name || ''),
                          ).length
                        }
                      </Badge>
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Company Filter */}
              <AccordionItem value="company" className="border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Company
                    {pipeline.companyFilter.length > 0 && (
                      <Badge variant="secondary" className="ml-auto">
                        {pipeline.companyFilter.length}
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <MultiSelect
                    options={pipeline.uniqueCompanies || []}
                    selected={pipeline.companyFilter}
                    onSelectedChange={pipeline.setCompanyFilter}
                    placeholder="All companies"
                    className="w-full"
                  />
                </AccordionContent>
              </AccordionItem>

              {/* Admin/Owner Filter */}
              <AccordionItem value="admin" className="border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                  <div className="flex items-center gap-2">
                    <UserCircle className="h-4 w-4" />
                    Assigned To
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div className="space-y-2">
                    <Button
                      variant={pipeline.adminFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => pipeline.setAdminFilter('all')}
                    >
                      All Deals
                    </Button>
                    <Button
                      variant={pipeline.adminFilter === 'assigned_to_me' ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => pipeline.setAdminFilter('assigned_to_me')}
                    >
                      <UserCircle className="h-4 w-4 mr-2" />
                      Assigned to Me
                    </Button>
                    <Button
                      variant={pipeline.adminFilter === 'unassigned' ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => pipeline.setAdminFilter('unassigned')}
                    >
                      Unassigned
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Sorting */}
              <AccordionItem value="sorting" className="border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4" />
                    Sorting
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <Select
                    value={pipeline.sortOption}
                    onValueChange={(value) =>
                      pipeline.setSortOption(
                        value as
                          | 'newest'
                          | 'oldest'
                          | 'priority'
                          | 'value'
                          | 'probability'
                          | 'stage_entered'
                          | 'last_activity',
                      )
                    }
                  >
                    <SelectTrigger className="w-full h-9">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-[100]">
                      <SelectItem value="newest">Newest First</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                      <SelectItem value="priority">Highest Priority</SelectItem>
                      <SelectItem value="value">Highest Value</SelectItem>
                      <SelectItem value="probability">Highest Probability</SelectItem>
                      <SelectItem value="stage_entered">Recently Entered Stage</SelectItem>
                      <SelectItem value="last_activity">Last Activity</SelectItem>
                    </SelectContent>
                  </Select>
                </AccordionContent>
              </AccordionItem>

              {/* Date Filters */}
              <AccordionItem value="dates" className="border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    Date Ranges
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-4">
                  <DateRangeFilter
                    label="Created Date"
                    range={pipeline.createdDateRange}
                    onRangeChange={pipeline.setCreatedDateRange}
                  />

                  <Separator />

                  <DateRangeFilter
                    label="Last Activity"
                    range={pipeline.lastActivityRange}
                    onRangeChange={pipeline.setLastActivityRange}
                  />
                </AccordionContent>
              </AccordionItem>

              {/* Additional Filters */}
              <AccordionItem value="additional" className="border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                  Additional Filters
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-4">
                  {/* Buyer Type */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Buyer Type</label>
                    <Select
                      value={pipeline.buyerTypeFilter}
                      onValueChange={(value) =>
                        pipeline.setBuyerTypeFilter(
                          value as
                            | 'all'
                            | 'private_equity'
                            | 'corporate'
                            | 'family_office'
                            | 'independent_sponsor'
                            | 'search_fund'
                            | 'individual_buyer',
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All buyer types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Buyer Types</SelectItem>
                        <SelectItem value="private_equity">Private Equity</SelectItem>
                        <SelectItem value="family_office">Family Office</SelectItem>
                        <SelectItem value="search_fund">Search Fund</SelectItem>
                        <SelectItem value="corporate">Corporate / Strategic</SelectItem>
                        <SelectItem value="individual_buyer">Individual Buyer</SelectItem>
                        <SelectItem value="independent_sponsor">Independent Sponsor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  {/* Document Status */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Documents</label>
                    <Select
                      value={pipeline.documentStatusFilter}
                      onValueChange={(value) =>
                        pipeline.setDocumentStatusFilter(
                          value as
                            | 'all'
                            | 'nda_signed'
                            | 'fee_signed'
                            | 'both_signed'
                            | 'none_signed'
                            | 'overdue_followup',
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All documents" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Documents</SelectItem>
                        <SelectItem value="both_signed">NDA & Fee Signed</SelectItem>
                        <SelectItem value="nda_signed">NDA Signed Only</SelectItem>
                        <SelectItem value="fee_signed">Fee Signed Only</SelectItem>
                        <SelectItem value="none_signed">No Documents</SelectItem>
                        <SelectItem value="overdue_followup">Overdue Follow-up</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Active Filters Display */}
            {activeFiltersCount > 0 && (
              <>
                <Separator />
                <div>
                  <label className="text-sm font-medium mb-3 block">Active Filters</label>
                  <div className="flex flex-wrap gap-2">
                    {pipeline.statusFilter !== 'all' && (
                      <Badge variant="secondary" className="gap-1">
                        Stage: {pipeline.statusFilter}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() => pipeline.setStatusFilter('all')}
                        />
                      </Badge>
                    )}
                    {pipeline.companyFilter.length > 0 &&
                      pipeline.companyFilter.map((company) => (
                        <Badge key={company} variant="secondary" className="gap-1">
                          Company: {company}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() =>
                              pipeline.setCompanyFilter(
                                pipeline.companyFilter.filter((c) => c !== company),
                              )
                            }
                          />
                        </Badge>
                      ))}
                    {pipeline.adminFilter !== 'all' && (
                      <Badge variant="secondary" className="gap-1">
                        Admin:{' '}
                        {pipeline.adminFilter === 'assigned_to_me' ? 'Me' : pipeline.adminFilter}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() => pipeline.setAdminFilter('all')}
                        />
                      </Badge>
                    )}
                    {pipeline.createdDateRange.start && (
                      <Badge variant="secondary" className="gap-1">
                        Created: {format(pipeline.createdDateRange.start, 'PP')}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() =>
                            pipeline.setCreatedDateRange({
                              ...pipeline.createdDateRange,
                              start: null,
                            })
                          }
                        />
                      </Badge>
                    )}
                    {pipeline.lastActivityRange.start && (
                      <Badge variant="secondary" className="gap-1">
                        Activity: {format(pipeline.lastActivityRange.start, 'PP')}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() =>
                            pipeline.setLastActivityRange({
                              ...pipeline.lastActivityRange,
                              start: null,
                            })
                          }
                        />
                      </Badge>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-background">
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={clearAllFilters}>
              Clear All
            </Button>
            <Button className="flex-1" onClick={pipeline.toggleFilterPanel}>
              Apply Filters
            </Button>
          </div>
        </div>
      </div>

      {/* Save Preset Dialog */}
      <SaveFilterPresetDialog
        open={isSavePresetOpen}
        onOpenChange={setIsSavePresetOpen}
        currentFilters={getCurrentFilters()}
      />
    </div>
  );
}
