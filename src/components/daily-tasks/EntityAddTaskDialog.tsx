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
import { Loader2, FileText, Repeat } from 'lucide-react';
import { useAddEntityTask } from '@/hooks/useTaskActions';
import { useTeamMembers } from '@/hooks/use-team-members';
import { getLocalDateString } from '@/lib/utils';
import {
  TASK_TYPE_OPTIONS,
  DEAL_TASK_TYPE_OPTIONS,
  ENTITY_TYPE_LABELS,
  PRIORITY_LABELS,
} from '@/types/daily-tasks';
import type { TaskType, TaskPriority, TaskEntityType, RecurrenceRule } from '@/types/daily-tasks';
import { TaskTemplateDialog } from './TaskTemplateDialog';

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
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | 'none'>('none');
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

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
        ...(recurrenceRule !== 'none' ? { recurrence_rule: recurrenceRule } : {}),
      });

      // Reset form
      setTitle('');
      setDescription('');
      setAssigneeId('');
      setTaskType(entityType === 'deal' ? 'call' : 'other');
      setDueDate(getLocalDateString());
      setPriority('medium');
      setRecurrenceRule('none');
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
          {/* Use Template shortcut */}
          {entityType === 'deal' && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs gap-1.5"
              onClick={() => setTemplateDialogOpen(true)}
            >
              <FileText className="h-3.5 w-3.5" />
              Use Template Instead
            </Button>
          )}

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

          {/* Recurrence */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Repeat className="h-3.5 w-3.5" />
              Repeat
            </Label>
            <Select
              value={recurrenceRule}
              onValueChange={(v) => setRecurrenceRule(v as RecurrenceRule | 'none')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Biweekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
            {recurrenceRule !== 'none' && (
              <p className="text-[11px] text-muted-foreground">
                Task will auto-recreate when completed
              </p>
            )}
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

      {/* Template dialog — opened via "Use Template" button */}
      {entityType === 'deal' && (
        <TaskTemplateDialog
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
          listingId={entityId}
          listingName={entityName}
          teamMembers={teamMembers}
          entityType={entityType}
          dealId={entityType === 'deal' ? entityId : defaultDealId}
          onSuccess={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}
