import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowUpDown,
  Download,
  CheckCheck,
  XCircle,
  MailPlus,
  ArrowDown,
  ArrowUp,
  Search,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { SortOption, FilterTab } from './types';

interface MatchingControlsProps {
  // Universe
  linkedUniverses: Array<{ id: string; name: string }> | undefined;
  selectedUniverse: string;
  onUniverseChange: (value: string) => void;
  universeMatchCounts: Record<string, number>;
  // Filter tabs
  activeTab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  stats: {
    qualified: number;
    approved: number;
    passed: number;
    total: number;
    disqualified: number;
    disqualificationReason: string;
  };
  outreachCount: number;
  // Sort
  sortBy: SortOption;
  sortDesc: boolean;
  onSortChange: (sort: SortOption) => void;
  onSortDescToggle: () => void;
  // Search
  searchQuery: string;
  onSearchChange: (query: string) => void;
  // Hide disqualified
  hideDisqualified: boolean;
  onHideDisqualifiedToggle: () => void;
  // Bulk selection
  selectedCount: number;
  onBulkApprove: () => void;
  onBulkPassOpen: () => void;
  onExportCSV: () => void;
  onEmailDialogOpen: () => void;
}

export function MatchingControls({
  linkedUniverses,
  selectedUniverse,
  onUniverseChange,
  universeMatchCounts,
  activeTab,
  onTabChange,
  stats,
  outreachCount,
  sortBy,
  sortDesc,
  onSortChange,
  onSortDescToggle,
  searchQuery,
  onSearchChange,
  hideDisqualified,
  onHideDisqualifiedToggle,
  selectedCount,
  onBulkApprove,
  onBulkPassOpen,
  onExportCSV,
  onEmailDialogOpen,
}: MatchingControlsProps) {
  return (
    <div className="space-y-3">
      {/* Universe selector */}
      <div className="flex items-center gap-3">
        {linkedUniverses && linkedUniverses.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Universe:</span>
            <div className="flex gap-1 flex-wrap">
              <Badge
                variant={selectedUniverse === 'all' ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => onUniverseChange('all')}
              >
                All ({stats.total})
              </Badge>
              {linkedUniverses.map((u) => (
                <Badge
                  key={u.id}
                  variant={selectedUniverse === u.id ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => onUniverseChange(u.id)}
                >
                  {u.name} ({universeMatchCounts[u.id] || 0})
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabs + controls row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as FilterTab)}>
          <TabsList>
            <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
            <TabsTrigger
              value="approved"
              className="data-[state=active]:bg-green-100 data-[state=active]:text-green-800"
            >
              Approved ({stats.approved})
            </TabsTrigger>
            <TabsTrigger
              value="passed"
              className="data-[state=active]:bg-red-100 data-[state=active]:text-red-800"
            >
              Passed ({stats.passed})
            </TabsTrigger>
            <TabsTrigger
              value="outreach"
              className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800"
            >
              Outreach ({outreachCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search buyers..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          {/* Sort */}
          <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortOption)}>
            <SelectTrigger className="w-[160px] h-9">
              <ArrowUpDown className="mr-2 h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Sort by Score</SelectItem>
              <SelectItem value="geography">Sort by Geography</SelectItem>
              <SelectItem value="score_geo">Score + Geography</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onSortDescToggle}>
            {sortDesc ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
          </Button>

          {/* Disqualified toggle */}
          <Button
            variant={hideDisqualified ? 'default' : 'outline'}
            size="sm"
            className="h-9 gap-1.5"
            onClick={onHideDisqualifiedToggle}
          >
            {hideDisqualified ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {stats.disqualified > 0 && <span className="text-xs">({stats.disqualified})</span>}
          </Button>

          {/* Bulk actions */}
          {selectedCount > 0 && (
            <>
              <Button
                variant="default"
                size="sm"
                className="h-9 bg-green-600 hover:bg-green-700 text-white gap-1.5"
                onClick={onBulkApprove}
              >
                <CheckCheck className="h-4 w-4" />
                Approve ({selectedCount})
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    Actions ({selectedCount})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={onBulkApprove}>
                    <CheckCheck className="mr-2 h-4 w-4" />
                    Approve All
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onBulkPassOpen}>
                    <XCircle className="mr-2 h-4 w-4" />
                    Pass All
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onExportCSV}>
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onEmailDialogOpen}>
                    <MailPlus className="mr-2 h-4 w-4" />
                    Email Selected
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
