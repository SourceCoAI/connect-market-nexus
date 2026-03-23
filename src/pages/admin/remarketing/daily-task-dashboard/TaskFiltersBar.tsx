import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, ListChecks, Tag, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DistinctMeeting {
  id: string;
  title: string;
  date: string | null;
  count: number;
}

interface TaskFiltersBarProps {
  view: 'my' | 'all';
  onViewChange: (view: 'my' | 'all') => void;
  entityFilter: 'all' | 'deal' | 'buyer';
  onEntityFilterChange: (filter: 'all' | 'deal' | 'buyer') => void;
  selectedTags: Set<string>;
  onSelectedTagsChange: (tags: Set<string>) => void;
  allDistinctTags: string[] | undefined;
  selectedMeeting: string | null;
  onSelectedMeetingChange: (meetingId: string | null) => void;
  distinctMeetings: DistinctMeeting[];
  showCompleted: boolean;
  onShowCompletedChange: (show: boolean) => void;
}

export function TaskFiltersBar({
  view,
  onViewChange,
  entityFilter,
  onEntityFilterChange,
  selectedTags,
  onSelectedTagsChange,
  allDistinctTags,
  selectedMeeting,
  onSelectedMeetingChange,
  distinctMeetings,
  showCompleted,
  onShowCompletedChange,
}: TaskFiltersBarProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1 rounded-lg border bg-white p-0.5">
        <button
          onClick={() => onViewChange('my')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            view === 'my'
              ? 'bg-gray-900 text-white'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Users className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
          My Tasks
        </button>
        <button
          onClick={() => onViewChange('all')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            view === 'all'
              ? 'bg-gray-900 text-white'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <ListChecks className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
          All Tasks
        </button>
      </div>

      {/* Entity type filter */}
      <div className="flex items-center gap-1 rounded-lg border bg-white p-0.5">
        {(['all', 'deal', 'buyer'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => onEntityFilterChange(filter)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              entityFilter === filter
                ? 'bg-gray-900 text-white'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {filter === 'all' ? 'All Types' : filter === 'deal' ? 'Deal Tasks' : 'Buyer Tasks'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {/* Tag filter */}
        {allDistinctTags && allDistinctTags.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={selectedTags.size > 0 ? 'default' : 'outline'}
                size="sm"
                className="text-xs gap-1.5"
              >
                <Tag className="h-3.5 w-3.5" />
                Tags
                {selectedTags.size > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[9px] ml-1">
                    {selectedTags.size}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-48 overflow-auto">
              {allDistinctTags.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag}
                  checked={selectedTags.has(tag)}
                  onCheckedChange={(checked) => {
                    const next = new Set(selectedTags);
                    if (checked) next.add(tag);
                    else next.delete(tag);
                    onSelectedTagsChange(next);
                  }}
                >
                  {tag}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Meeting source filter */}
        {distinctMeetings.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={selectedMeeting ? 'default' : 'outline'}
                size="sm"
                className="text-xs gap-1.5"
              >
                <Mic className="h-3.5 w-3.5" />
                {selectedMeeting
                  ? distinctMeetings.find((m) => m.id === selectedMeeting)?.title || 'Meeting'
                  : 'Meeting'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-auto min-w-[280px]">
              <DropdownMenuCheckboxItem
                checked={!selectedMeeting}
                onCheckedChange={() => onSelectedMeetingChange(null)}
              >
                All Meetings
              </DropdownMenuCheckboxItem>
              {distinctMeetings.map((m) => (
                <DropdownMenuCheckboxItem
                  key={m.id}
                  checked={selectedMeeting === m.id}
                  onCheckedChange={() =>
                    onSelectedMeetingChange(selectedMeeting === m.id ? null : m.id)
                  }
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm truncate max-w-[220px]">{m.title}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {m.date
                        ? (() => {
                            const d = new Date(m.date);
                            return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
                          })()
                        : 'No date'}{' '}
                      · {m.count} {m.count === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button size="sm" onClick={() => onShowCompletedChange(!showCompleted)} className="text-xs">
          {showCompleted ? 'Hide Completed' : 'Show Completed'}
        </Button>
      </div>
    </div>
  );
}
