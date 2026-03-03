/**
 * TaskTemplateDialog — "Start Deal Process" dialog that applies task
 * templates to a listing.
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
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ListChecks, Calendar, ArrowRight } from 'lucide-react';
import { useApplyTaskTemplate } from '@/hooks/useTaskActions';
import { useToast } from '@/hooks/use-toast';
import { DEAL_PROCESS_TEMPLATES, BUYER_ENGAGEMENT_TEMPLATES } from '@/types/daily-tasks';
import type { TaskEntityType } from '@/types/daily-tasks';

interface TaskTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  listingName?: string;
  teamMembers: { id: string; name: string }[];
  entityType?: TaskEntityType;
}

export function TaskTemplateDialog({
  open,
  onOpenChange,
  listingId,
  listingName,
  teamMembers,
  entityType,
}: TaskTemplateDialogProps) {
  const applyTemplate = useApplyTaskTemplate();
  const { toast } = useToast();
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [assigneeId, setAssigneeId] = useState('');

  const isBuyerEntity = entityType === 'buyer' || entityType === 'contact';
  const templates = isBuyerEntity ? BUYER_ENGAGEMENT_TEMPLATES : DEAL_PROCESS_TEMPLATES;
  const template = templates[selectedIndex];

  const handleApply = async () => {
    if (!assigneeId) {
      toast({ title: 'Please select a team member', variant: 'destructive' });
      return;
    }

    try {
      const ids = await applyTemplate.mutateAsync({
        listingId,
        assigneeId,
        template,
      });

      toast({
        title: `${ids.length} tasks created`,
        description: `Applied "${template.name}" to ${listingName || 'this listing'}`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Failed to apply template',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            {isBuyerEntity ? 'Start Buyer Engagement' : 'Start Deal Process'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {listingName && (
            <p className="text-sm text-muted-foreground">
              Create template tasks for{' '}
              <span className="font-medium text-foreground">{listingName}</span>
            </p>
          )}

          {/* Template stage picker */}
          <div className="space-y-2">
            <Label>Process Stage</Label>
            <Select
              value={String(selectedIndex)}
              onValueChange={(v) => setSelectedIndex(Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t, idx) => (
                  <SelectItem key={idx} value={String(idx)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{template.description}</p>
          </div>

          {/* Assignee */}
          <div className="space-y-2">
            <Label>Assign All Tasks To</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select team lead" />
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

          {/* Preview tasks */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Tasks to create ({template.tasks.length})
            </Label>
            <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
              {template.tasks.map((t, idx) => (
                <div key={idx} className="px-3 py-2 flex items-center justify-between">
                  <span className="text-sm">{t.title}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] h-5">
                      {t.task_type.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />+{t.due_offset_days}d
                    </span>
                    {t.depends_on_index !== undefined && (
                      <span className="text-xs text-amber-600 flex items-center gap-0.5">
                        <ArrowRight className="h-3 w-3" />#{t.depends_on_index + 1}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!assigneeId || applyTemplate.isPending}>
            {applyTemplate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create {template.tasks.length} Tasks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
