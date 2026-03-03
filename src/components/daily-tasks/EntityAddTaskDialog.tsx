/**
 * EntityAddTaskDialog — Create a task pre-linked to a specific entity.
 */

import { useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
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
import { useTeamMembers } from '@/hooks/use-team-members';
import { getLocalDateString } from '@/lib/utils';
import { TASK_TYPE_OPTIONS, DEAL_TASK_TYPE_OPTIONS, ENTITY_TYPE_LABELS, PRIORITY_LABELS } from '@/types/daily-tasks';
import type { TaskType, TaskPriority, TaskEntityType } from '@/types/daily-tasks';

interface EntityAddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: TaskEntityType;
  entityId: string;
  entityName?: string;
  teamMembers?: { id: string; name: string }[];
  defaultDealId?: string;
}

export function EntityAddTaskDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityName,
  teamMembers: teamMembersProp,
  defaultDealId,
}: EntityAddTaskDialogProps) {
  const addTask = useAddEntityTask();
  const { data: fetchedMembers } = useTeamMembers();
  const teamMembers = teamMembersProp?.length ? teamMembersProp : fetchedMembers || [];
  const taskTypeOptions = entityType === 'deal' ? DEAL_TASK_TYPE_OPTIONS : TASK_TYPE_OPTIONS;
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [taskType, setTaskType] = useState<TaskType>(entityType === 'deal' ? 'call' : 'other');
  const [dueDate, setDueDate] = useState(getLocalDateString());
  const [priority, setPriority] = useState<TaskPriority>('medium');

  const handleSubmit = async () => {
    if (!title.trim()) return;

    try {
      await addTask.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        assignee_id: assigneeId || null,
        task_type: taskType,
        due_date: dueDate,
        priority,
        entity_type: entityType,
        entity_id: entityId,
        deal_id: entityType === 'deal' ? entityId : defaultDealId || null,
        deal_reference: entityName || null,
      });

      // Reset form
      setTitle('');
      setDescription('');
      setAssigneeId('');
      setTaskType(entityType === 'deal' ? 'call' : 'other');
      setDueDate(getLocalDateString());
      setPriority('medium');
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
          <DialogTitle className="flex items-center gap-2">
            Add Task
            <Badge variant="outline" className="text-xs font-normal">
              {ENTITY_TYPE_LABELS[entityType]}: {entityName || entityId.slice(0, 8)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="entity-task-title">Task Title *</Label>
            <Input
              id="entity-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Follow up with buyer on deal memo review"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="entity-task-desc">Description</Label>
            <Textarea
              id="entity-task-desc"
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
                  {taskTypeOptions.map((opt) => (
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
              <Label htmlFor="entity-task-due">Due Date</Label>
              <Input
                id="entity-task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(PRIORITY_LABELS) as [TaskPriority, string][]).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
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
