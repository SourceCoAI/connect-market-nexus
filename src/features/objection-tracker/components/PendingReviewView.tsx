import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Check, X, ChevronDown, Edit, Loader2, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { usePendingPlaybooks } from '../hooks/useObjectionPlaybook';
import { usePendingInstances } from '../hooks/useObjectionInstances';
import { useObjectionMutations } from '../hooks/useObjectionMutations';
import type { ObjectionPlaybook, ObjectionInstance } from '../types';

export function PendingReviewView() {
  const { data: pendingPlaybooks, isLoading: playbooksLoading } = usePendingPlaybooks();
  const { data: pendingInstances, isLoading: instancesLoading } = usePendingInstances();

  const isLoading = playbooksLoading || instancesLoading;
  const hasContent =
    (pendingPlaybooks && pendingPlaybooks.length > 0) ||
    (pendingInstances && pendingInstances.length > 0);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!hasContent) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">
            No items pending review. The team is up to date.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Pending Playbook Entries */}
      {pendingPlaybooks && pendingPlaybooks.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Pending Playbook Entries</h3>
          <div className="space-y-3">
            {pendingPlaybooks.map((pb) => (
              <PendingPlaybookCard key={pb.id} playbook={pb} />
            ))}
          </div>
        </div>
      )}

      {/* Unconfirmed Extractions */}
      {pendingInstances && pendingInstances.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Unconfirmed Extractions</h3>
          <div className="space-y-2">
            {pendingInstances.map((inst) => (
              <PendingInstanceCard key={inst.id} instance={inst} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PendingPlaybookCard({ playbook }: { playbook: ObjectionPlaybook }) {
  const [expanded, setExpanded] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const { approvePlaybook, rejectPlaybook } = useObjectionMutations();

  const handleApprove = () => {
    approvePlaybook.mutate({ id: playbook.id });
  };

  const handleReject = () => {
    if (!rejectReason.trim()) return;
    rejectPlaybook.mutate({ id: playbook.id, reason: rejectReason });
    setRejectOpen(false);
    setRejectReason('');
  };

  return (
    <>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold">{playbook.category_name}</h4>
              <Badge variant="outline" className="text-xs">
                {playbook.version === 1 ? 'New entry' : `Update (v${playbook.version})`}
              </Badge>
            </div>
            <span className="text-sm text-muted-foreground">
              Based on {playbook.data_basis_count} calls · AI confidence:{' '}
              {Math.round((playbook.ai_confidence || 0) * 100)}%
            </span>
          </div>

          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1">
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
                {expanded ? 'Hide draft' : 'Show draft'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-2">
              {/* Frameworks */}
              {(playbook.frameworks || []).map((fw, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2">
                  <h5 className="font-medium text-sm">{fw.title}</h5>
                  <p className="text-sm text-muted-foreground">{fw.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {(fw.example_phrases || []).map((phrase, j) => (
                      <span
                        key={j}
                        className="text-xs bg-muted rounded px-2 py-1 italic"
                      >
                        "{phrase}"
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              {/* Mistakes */}
              {(playbook.mistakes_to_avoid || []).length > 0 && (
                <div className="border border-red-200 bg-red-50/50 dark:bg-red-950/10 rounded-lg p-3 space-y-1">
                  <h5 className="font-medium text-sm text-red-700 dark:text-red-400">
                    What Not to Say
                  </h5>
                  {(playbook.mistakes_to_avoid || []).map((m, i) => (
                    <p key={i} className="text-sm">
                      <span className="font-medium text-red-600 dark:text-red-400">
                        {m.pattern}
                      </span>{' '}
                      — <span className="text-muted-foreground">{m.why_it_fails}</span>
                    </p>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="default"
              className="bg-green-600 hover:bg-green-700"
              onClick={handleApprove}
              disabled={approvePlaybook.isPending}
            >
              {approvePlaybook.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Check className="h-3.5 w-3.5 mr-1" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditOpen(true)}
            >
              <Edit className="h-3.5 w-3.5 mr-1" />
              Edit & Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setRejectOpen(true)}
              disabled={rejectPlaybook.isPending}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Reject
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Playbook Entry</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection (required)..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectPlaybook.isPending}
              onClick={handleReject}
            >
              {rejectPlaybook.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit & Approve Dialog */}
      <EditPlaybookDialog
        playbook={playbook}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}

function EditPlaybookDialog({
  playbook,
  open,
  onOpenChange,
}: {
  playbook: ObjectionPlaybook;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [frameworksJson, setFrameworksJson] = useState(
    JSON.stringify(playbook.frameworks, null, 2),
  );
  const [mistakesJson, setMistakesJson] = useState(
    JSON.stringify(playbook.mistakes_to_avoid, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const { approvePlaybook } = useObjectionMutations();

  const handleSave = () => {
    try {
      const frameworks = JSON.parse(frameworksJson);
      const mistakes = JSON.parse(mistakesJson);
      setJsonError(null);
      approvePlaybook.mutate({
        id: playbook.id,
        frameworks,
        mistakes_to_avoid: mistakes,
      });
      onOpenChange(false);
    } catch {
      setJsonError('Invalid JSON. Please check your edits.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit & Approve — {playbook.category_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Frameworks (JSON)</label>
            <Textarea
              value={frameworksJson}
              onChange={(e) => setFrameworksJson(e.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Mistakes to Avoid (JSON)</label>
            <Textarea
              value={mistakesJson}
              onChange={(e) => setMistakesJson(e.target.value)}
              rows={6}
              className="font-mono text-xs"
            />
          </div>
          {jsonError && <p className="text-sm text-red-600">{jsonError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={handleSave}
            disabled={approvePlaybook.isPending}
          >
            {approvePlaybook.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Save & Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PendingInstanceCard({ instance }: { instance: ObjectionInstance }) {
  const { confirmInstance, rejectInstance } = useObjectionMutations();

  return (
    <Card>
      <CardContent className="p-3 flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{instance.caller_name}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {format(new Date(instance.created_at), 'MMM d, yyyy')}
            </span>
            <span className="text-muted-foreground">·</span>
            <Badge variant="outline" className="text-xs">
              {instance.category_name}
            </Badge>
            <Badge variant="outline" className="text-xs">
              Confidence: {Math.round((instance.confidence_score || 0) * 100)}%
            </Badge>
          </div>
          <p className="text-sm italic text-muted-foreground truncate">
            "{instance.objection_text}"
          </p>
          {instance.caller_response_text && (
            <p className="text-xs text-muted-foreground truncate">
              Response: {instance.caller_response_text}
            </p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-green-600 border-green-200 hover:bg-green-50"
            onClick={() => confirmInstance.mutate(instance.id)}
            disabled={confirmInstance.isPending}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => rejectInstance.mutate({ id: instance.id })}
            disabled={rejectInstance.isPending}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
