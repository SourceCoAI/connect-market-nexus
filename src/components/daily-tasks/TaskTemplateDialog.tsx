/**
 * TaskTemplateDialog — "Start Deal Process" dialog that applies task
 * templates to a listing/deal. Supports both static process templates
 * and database-stored templates from the task_templates table.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ListChecks, Calendar, ArrowRight, FileText } from 'lucide-react';
import { useApplyTaskTemplate } from '@/hooks/useTaskActions';
import { useToast } from '@/hooks/use-toast';
import {
  DEAL_PROCESS_TEMPLATES,
  BUYER_ENGAGEMENT_TEMPLATES,
  TASK_TYPE_LABELS,
  PRIORITY_COLORS,
} from '@/types/daily-tasks';
import type { TaskEntityType, TaskTemplate } from '@/types/daily-tasks';

interface TaskTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  listingName?: string;
  teamMembers: { id: string; name: string }[];
  entityType?: TaskEntityType;
  /** When provided, enables DB-template mode for a specific deal */
  dealId?: string;
  onSuccess?: () => void;
}

type TemplateMode = 'process' | 'database';

export function TaskTemplateDialog({
  open,
  onOpenChange,
  listingId,
  listingName,
  teamMembers,
  entityType,
  dealId,
  onSuccess,
}: TaskTemplateDialogProps) {
  const applyTemplate = useApplyTaskTemplate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [mode, setMode] = useState<TemplateMode>('process');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [selectedDbTemplateId, setSelectedDbTemplateId] = useState<string>('');
  const [assigneeId, setAssigneeId] = useState('');

  const isBuyerEntity = entityType === 'buyer' || entityType === 'contact';
  const templates = isBuyerEntity ? BUYER_ENGAGEMENT_TEMPLATES : DEAL_PROCESS_TEMPLATES;
  const template = templates[selectedIndex];

  // Fetch DB-stored templates
  const { data: dbTemplates, isLoading: dbTemplatesLoading } = useQuery({
    queryKey: ['task-templates'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('task_templates')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as TaskTemplate[];
    },
    enabled: open,
  });

  const selectedDbTemplate = dbTemplates?.find((t) => t.id === selectedDbTemplateId) ?? null;

  // Mutation to apply DB-based templates
  const applyDbTemplate = useMutation({
    mutationFn: async () => {
      if (!selectedDbTemplate) throw new Error('No template selected');
      const targetDealId = dealId || (entityType === 'deal' ? listingId : null);
      if (!targetDealId) throw new Error('Deal ID is required');

      const tasks = selectedDbTemplate.tasks.map((t) => ({
        title: t.title,
        description: t.description || null,
        task_type: t.task_type,
        priority: t.priority,
        status: 'pending' as const,
        due_date: addDays(new Date(), t.due_offset_days).toISOString().split('T')[0],
        entity_type: 'deal' as const,
        entity_id: targetDealId,
        deal_id: targetDealId,
        assignee_id: assigneeId || null,
        template_id: selectedDbTemplate.id,
        auto_generated: true,
        generation_source: 'template',
        source: 'template',
        is_manual: false,
        priority_score: 50,
        extraction_confidence: 'high',
        needs_review: false,
      }));

      const { error } = await supabase.from('daily_standup_tasks' as never).insert(tasks as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-standup-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['entity-tasks'] });
      toast({
        title: 'Template applied',
        description: `${selectedDbTemplate?.tasks.length} tasks created from "${selectedDbTemplate?.name}"`,
      });
      setSelectedDbTemplateId('');
      setAssigneeId('');
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      toast({
        title: 'Failed to apply template',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const handleApplyProcess = async () => {
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
      onSuccess?.();
    } catch (err) {
      toast({
        title: 'Failed to apply template',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const hasDbTemplates = (dbTemplates?.length ?? 0) > 0;
  const isPending = mode === 'process' ? applyTemplate.isPending : applyDbTemplate.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            {isBuyerEntity ? 'Start Buyer Engagement' : 'Apply Task Template'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {listingName && (
            <p className="text-sm text-muted-foreground">
              Create template tasks for{' '}
              <span className="font-medium text-foreground">{listingName}</span>
            </p>
          )}

          {/* Mode toggle — only show if DB templates exist */}
          {hasDbTemplates && (
            <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5 w-fit">
              <button
                onClick={() => setMode('process')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  mode === 'process'
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ListChecks className="h-3 w-3 inline mr-1 -mt-0.5" />
                Process Stages
              </button>
              <button
                onClick={() => setMode('database')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  mode === 'database'
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText className="h-3 w-3 inline mr-1 -mt-0.5" />
                Saved Templates
              </button>
            </div>
          )}

          {mode === 'process' ? (
            <>
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
            </>
          ) : (
            <>
              {/* DB Template selector */}
              <div className="space-y-2">
                <Label>Template</Label>
                {dbTemplatesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select value={selectedDbTemplateId} onValueChange={setSelectedDbTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(dbTemplates || []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                          {t.category && (
                            <span className="ml-2 text-muted-foreground">({t.category})</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {selectedDbTemplate?.description && (
                <p className="text-xs text-muted-foreground">{selectedDbTemplate.description}</p>
              )}

              {/* Assignee */}
              <div className="space-y-2">
                <Label>Assign All Tasks To</Label>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select team member (optional)" />
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

              {/* DB Template task preview */}
              {selectedDbTemplate && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Tasks to create ({selectedDbTemplate.tasks.length})
                  </Label>
                  <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                    {selectedDbTemplate.tasks.map((t, idx) => (
                      <div key={idx} className="px-3 py-2 flex items-center justify-between">
                        <span className="text-sm truncate flex-1">{t.title}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-[10px] h-5">
                            {TASK_TYPE_LABELS[t.task_type] ?? t.task_type}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-[10px] h-5 ${PRIORITY_COLORS[t.priority] ?? ''}`}
                          >
                            {t.priority}
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
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {mode === 'process' ? (
            <Button onClick={handleApplyProcess} disabled={!assigneeId || isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create {template.tasks.length} Tasks
            </Button>
          ) : (
            <Button
              onClick={() => applyDbTemplate.mutate()}
              disabled={!selectedDbTemplateId || isPending}
            >
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Apply Template
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
