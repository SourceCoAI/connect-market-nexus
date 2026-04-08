/**
 * SnoozeMenu — Dropdown menu with snooze presets + custom date picker for a task.
 */

import { useState } from 'react';
import { format, differenceInCalendarDays, startOfDay, addDays } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { AlarmClock, CalendarIcon } from 'lucide-react';
import { useSnoozeTask } from '@/hooks/useTaskActions';
import { useToast } from '@/hooks/use-toast';
import { SNOOZE_PRESETS } from '@/types/daily-tasks';

interface SnoozeMenuProps {
  taskId: string;
  /** Rendered as a dropdown inside a parent menu */
  asMenuItem?: boolean;
}

export function SnoozeMenu({ taskId }: SnoozeMenuProps) {
  const snooze = useSnoozeTask();
  const { toast } = useToast();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleSnooze = async (days: number, label: string) => {
    try {
      await snooze.mutateAsync({ taskId, days });
      toast({ title: `Task snoozed for ${label}` });
    } catch (err) {
      toast({
        title: 'Failed to snooze',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleCustomDate = async (date: Date | undefined) => {
    if (!date) return;
    setCalendarOpen(false);
    setDropdownOpen(false);

    const today = startOfDay(new Date());
    const days = differenceInCalendarDays(date, today);

    if (days < 1) {
      toast({
        title: 'Invalid date',
        description: 'Please pick a date in the future.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await snooze.mutateAsync({ taskId, days });
      toast({ title: `Task snoozed until ${format(date, 'MMM d, yyyy')}` });
    } catch (err) {
      toast({
        title: 'Failed to snooze',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
          <AlarmClock className="h-3.5 w-3.5" />
          Snooze
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SNOOZE_PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset.days}
            onClick={() => handleSnooze(preset.days, preset.label)}
          >
            {preset.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setCalendarOpen(true);
              }}
              className="gap-2"
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              Pick date...
            </DropdownMenuItem>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end" side="right">
            <Calendar
              mode="single"
              selected={undefined}
              onSelect={handleCustomDate}
              disabled={(date) => date < addDays(startOfDay(new Date()), 1)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
