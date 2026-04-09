import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useAddEntityTask } from '@/hooks/useTaskActions';
import { useExistingTags } from '@/hooks/useTaskTags';
import { useTeamMembers } from '@/hooks/use-team-members';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLocalDateString } from '@/lib/utils';
import { TASK_TYPE_OPTIONS } from '@/types/daily-tasks';
import { TagInput } from './TagInput';
import type { TaskType } from '@/types/daily-tasks';

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamMembers?: { id: string; name: string }[];
}

function useDealList() {
  return useQuery({
    queryKey: ['add-task-deal-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_pipeline')
        .select('id, listing_id, listings(title, internal_company_name)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        listing_id: string;
        listings: { title: string | null; internal_company_name: string | null } | null;
      }>;
    },
    staleTime: 60_000,
  });
}

export function AddTaskDialog({ open, onOpenChange, teamMembers: teamMembersProp }: AddTaskDialogProps) {
  const addTask = useAddEntityTask();
  const { toast } = useToast();
  const { data: existingTags } = useExistingTags();
  const { data: fetchedMembers } = useTeamMembers();
  const { data: deals } = useDealList();
  const teamMembers = teamMembersProp?.length ? teamMembersProp : fetchedMembers || [];

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('other');
  const [dueDate, setDueDate] = useState(getLocalDateString());
  const [dealId, setDealId] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const dealList = useMemo(() => {
    if (!deals) return [];
    return deals
      .map((d) => ({
        id: d.id,
        name: d.listings?.internal_company_name || d.listings?.title || d.id.slice(0, 8),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [deals]);

  const effectiveDealId = dealId && dealId !== '__none__' ? dealId : '';
  const selectedDeal = deals?.find((d) => d.id === effectiveDealId);
  const dealName = selectedDeal?.listings?.internal_company_name || selectedDeal?.listings?.title || null;

  const handleSubmit = async () => {
    if (!title.trim()) return;

    try {
      await addTask.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        assignee_id: assigneeId || null,
        task_type: taskType,
        due_date: dueDate,
        entity_type: 'deal',
        entity_id: effectiveDealId || undefined as unknown as string,
        deal_id: effectiveDealId || null,
        deal_reference: dealName,
        ...(tags && tags.length > 0 ? { tags } as any : {}),
      });

      // Reset form
      setTitle('');
      setDescription('');
      setAssigneeId('');
      setTaskType('other');
      setDueDate(getLocalDateString());
      setDealId('');
      setTags([]);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Failed to add task',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="title">Task Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Call the owner of Smith Manufacturing"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional context..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Task Type</Label>
              <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Link to Deal</Label>
              <Select value={dealId} onValueChange={setDealId}>
                <SelectTrigger>
                  <SelectValue placeholder="None (general task)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (general task)</SelectItem>
                  {dealList.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <TagInput
              value={tags}
              onChange={setTags}
              suggestions={existingTags || []}
              placeholder="e.g., Q1 push, board meeting prep"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || addTask.isPending}>
            {addTask.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
