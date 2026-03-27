import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Archive, CalendarIcon, ClipboardList } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useSoftDeleteDeal } from '@/hooks/admin/use-deals';
import { useAddEntityTask } from '@/hooks/useTaskActions';
import { useAdminProfiles } from '@/hooks/admin/use-admin-profiles';
import { useAuth } from '@/contexts/AuthContext';
import type { Deal } from '@/hooks/admin/use-deals';
import type { TaskType } from '@/types/daily-tasks';

const ARCHIVE_REASONS = [
  'Not Interested',
  'Hired a Banker/Broker',
  'Not the Right Time',
  'Sold',
  'Other',
] as const;

type ArchiveReason = (typeof ARCHIVE_REASONS)[number];

const FOLLOW_UP_TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'follow_up_with_buyer', label: 'Follow Up' },
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'seller_relationship', label: 'Seller Relationship' },
  { value: 'other', label: 'Other' },
];

const FOLLOW_UP_PRESETS = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
] as const;

interface ArchiveDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
  onArchived?: () => void;
}

export function ArchiveDealDialog({ open, onOpenChange, deal, onArchived }: ArchiveDealDialogProps) {
  const { user } = useAuth();
  const [reason, setReason] = useState<ArchiveReason | ''>('');
  const [notes, setNotes] = useState('');
  const [addFollowUp, setAddFollowUp] = useState(false);
  const [followUpTitle, setFollowUpTitle] = useState('');
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(undefined);
  const [followUpTaskType, setFollowUpTaskType] = useState<TaskType>('follow_up_with_buyer');
  const [followUpAssignee, setFollowUpAssignee] = useState<string>('');
  const [calendarOpen, setCalendarOpen] = useState(false);

  const softDeleteMutation = useSoftDeleteDeal();
  const addTaskMutation = useAddEntityTask();
  const { data: adminProfiles } = useAdminProfiles();

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setReason('');
      setNotes('');
      setAddFollowUp(false);
      setFollowUpTitle('');
      setFollowUpDate(undefined);
      setFollowUpTaskType('follow_up_with_buyer');
      setFollowUpAssignee('');
    } else if (deal) {
      // Pre-fill follow-up title and assignee when dialog opens
      setFollowUpTitle(`Follow up: ${deal.title}`);
      setFollowUpAssignee(deal.assigned_to || user?.id || '');
    }
  }, [open, deal, user?.id]);

  const handleArchive = async () => {
    if (!deal || !reason) return;

    const fullReason = reason === 'Other' && notes.trim()
      ? `Other: ${notes.trim()}`
      : reason + (notes.trim() ? ` — ${notes.trim()}` : '');

    // Archive the deal
    await softDeleteMutation.mutateAsync({
      dealId: deal.deal_id,
      reason: fullReason,
    });

    // Create follow-up task if enabled
    if (addFollowUp && followUpDate && followUpTitle.trim()) {
      await addTaskMutation.mutateAsync({
        title: followUpTitle.trim(),
        description: `Archived deal follow-up. Reason: ${fullReason}`,
        assignee_id: followUpAssignee || null,
        task_type: followUpTaskType,
        due_date: format(followUpDate, 'yyyy-MM-dd'),
        priority: 'medium',
        entity_type: 'deal',
        entity_id: deal.deal_id,
        deal_id: deal.deal_id,
        deal_reference: deal.title,
      });
    }

    onArchived?.();
    onOpenChange(false);
  };

  const isPending = softDeleteMutation.isPending || addTaskMutation.isPending;
  const isValid = !!reason && (reason !== 'Other' || notes.trim().length > 0);
  const isFollowUpValid = !addFollowUp || (followUpDate && followUpTitle.trim());

  const adminList = adminProfiles
    ? Object.values(adminProfiles).map((a) => ({
        id: a.id,
        name: a.displayName,
      }))
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Archive Deal
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {deal && (
            <Alert>
              <AlertDescription>
                <div className="space-y-1 text-sm">
                  <div><strong>Deal:</strong> {deal.title}</div>
                  <div><strong>Listing:</strong> {deal.listing_title}</div>
                  {deal.contact_name && (
                    <div><strong>Contact:</strong> {deal.contact_name}</div>
                  )}
                  <div><strong>Stage:</strong> {deal.stage_name}</div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Archival Reason */}
          <div className="space-y-2">
            <Label>
              Reason for Archiving <span className="text-destructive">*</span>
            </Label>
            <Select value={reason} onValueChange={(v) => setReason(v as ArchiveReason)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {ARCHIVE_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>
              {reason === 'Other' ? 'Details (required)' : 'Notes (optional)'}
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                reason === 'Other'
                  ? 'Please describe the reason...'
                  : 'Any additional context...'
              }
              rows={2}
            />
          </div>

          {/* Follow-up Task Toggle */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="follow-up-toggle" className="font-medium cursor-pointer">
                  Set a follow-up task
                </Label>
              </div>
              <Switch
                id="follow-up-toggle"
                checked={addFollowUp}
                onCheckedChange={setAddFollowUp}
              />
            </div>

            {addFollowUp && (
              <div className="space-y-3 pt-1">
                {/* Task Title */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Task Title</Label>
                  <Input
                    value={followUpTitle}
                    onChange={(e) => setFollowUpTitle(e.target.value)}
                    placeholder="Follow up with seller..."
                  />
                </div>

                {/* Task Type & Assignee Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Task Type</Label>
                    <Select value={followUpTaskType} onValueChange={(v) => setFollowUpTaskType(v as TaskType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FOLLOW_UP_TASK_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm">Assignee</Label>
                    <Select value={followUpAssignee} onValueChange={setFollowUpAssignee}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {adminList.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Due Date */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Due Date</Label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {FOLLOW_UP_PRESETS.map((preset) => (
                      <Button
                        key={preset.days}
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          'h-7 text-xs',
                          followUpDate &&
                            format(followUpDate, 'yyyy-MM-dd') === format(addDays(new Date(), preset.days), 'yyyy-MM-dd') &&
                            'bg-primary text-primary-foreground hover:bg-primary/90',
                        )}
                        onClick={() => setFollowUpDate(addDays(new Date(), preset.days))}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !followUpDate && 'text-muted-foreground',
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {followUpDate ? format(followUpDate, 'PPP') : 'Pick a date...'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={followUpDate}
                        onSelect={(date) => {
                          setFollowUpDate(date);
                          setCalendarOpen(false);
                        }}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleArchive}
            disabled={!isValid || !isFollowUpValid || isPending}
            variant="destructive"
          >
            <Archive className="h-3.5 w-3.5 mr-1.5" />
            {isPending ? 'Archiving...' : 'Archive Deal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
