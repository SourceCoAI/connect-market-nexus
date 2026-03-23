/**
 * FlagForBuyerButton — Quick action to flag a buyer for follow-up on a deal.
 *
 * Creates a 'follow_up_with_buyer' task linked to the buyer+deal pair.
 * Shows amber/filled state when a pending follow-up already exists.
 */

import { useState, useMemo } from 'react';
import { Flag, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useAddEntityTask } from '@/hooks/useTaskActions';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminProfiles } from '@/hooks/admin/use-admin-profiles';
import { addDays, format } from 'date-fns';

interface FlagForBuyerButtonProps {
  buyerId: string;
  buyerName: string;
  dealId?: string;
  listingId?: string;
  listingName?: string;
}

export function FlagForBuyerButton({
  buyerId,
  buyerName,
  dealId,
  listingId: _listingId,
  listingName,
}: FlagForBuyerButtonProps) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [assigneeId, setAssigneeId] = useState('');
  const { toast } = useToast();
  const { user } = useAuth();
  const addTask = useAddEntityTask();
  const { data: adminProfiles } = useAdminProfiles();

  // Check if a pending follow_up_with_buyer task already exists for this buyer+deal
  const { data: existingTask } = useQuery({
    queryKey: ['flag-for-buyer-check', buyerId, dealId],
    queryFn: async () => {
      let query = supabase
        .from('daily_standup_tasks' as 'profiles')
        .select('id, due_date')
        .eq('entity_id', buyerId)
        .eq('task_type', 'follow_up_with_buyer')
        .in('status', ['pending', 'pending_approval', 'in_progress']);

      if (dealId) {
        query = query.eq('deal_id', dealId);
      }

      const { data } = await query.limit(1).maybeSingle();
      return data as { id: string; due_date: string } | null;
    },
    staleTime: 30_000,
  });

  const adminList = useMemo(() => {
    if (!adminProfiles) return [];
    return Object.entries(adminProfiles)
      .map(([id, profile]) => ({
        id,
        name: profile.displayName,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [adminProfiles]);

  const handleSubmit = async () => {
    const title = listingName
      ? `Introduce ${listingName} to ${buyerName}`
      : `Follow up with ${buyerName}`;

    try {
      await addTask.mutateAsync({
        title,
        description: notes.trim() || null,
        assignee_id: assigneeId || user?.id || null,
        task_type: 'follow_up_with_buyer',
        due_date: dueDate,
        priority: 'high',
        entity_type: 'buyer',
        entity_id: buyerId,
        secondary_entity_type: dealId ? 'deal' : null,
        secondary_entity_id: dealId || null,
        deal_id: dealId || null,
      });

      toast({ title: `Flagged ${buyerName} for follow-up` });
      setOpen(false);
      setNotes('');
      setDueDate(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
      setAssigneeId('');
    } catch (err) {
      toast({
        title: 'Failed to flag buyer',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const isFlagged = !!existingTask;

  // If already flagged, show amber filled button with tooltip
  if (isFlagged) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
              onClick={(e) => e.stopPropagation()}
            >
              <Flag className="h-3.5 w-3.5 fill-amber-500" />
              Flagged
            </Button>
          </TooltipTrigger>
          <TooltipContent>Already flagged — due {existingTask.due_date}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <Flag className="h-3.5 w-3.5" />
          Flag for Follow-up
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Flag for Follow-up</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {listingName
                ? `Introduce ${listingName} to ${buyerName}`
                : `Follow up with ${buyerName}`}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="flag-due-date" className="text-xs">
              Follow-up date
            </Label>
            <Input
              id="flag-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Assign to</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent>
                {adminList.map((admin) => (
                  <SelectItem key={admin.id} value={admin.id}>
                    {admin.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="flag-notes" className="text-xs">
              Notes (optional)
            </Label>
            <Input
              id="flag-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Buyer showed strong interest..."
              className="h-8 text-xs"
            />
          </div>

          <Button
            size="sm"
            className="w-full text-xs"
            disabled={addTask.isPending}
            onClick={handleSubmit}
          >
            {addTask.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Flag for Follow-up
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
