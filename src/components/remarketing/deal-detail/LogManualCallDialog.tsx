import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Phone } from 'lucide-react';
import { toast } from 'sonner';

interface LogManualCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId?: string | null;
  listingId?: string | null;
  defaultContactName?: string;
  defaultContactEmail?: string;
  defaultContactPhone?: string;
}

const OUTCOMES = [
  { value: 'connected', label: 'Connected' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'callback', label: 'Callback Scheduled' },
  { value: 'busy', label: 'Busy' },
  { value: 'wrong_number', label: 'Wrong Number' },
];

export function LogManualCallDialog({
  open,
  onOpenChange,
  dealId,
  listingId,
  defaultContactName = '',
  defaultContactEmail = '',
  defaultContactPhone = '',
}: LogManualCallDialogProps) {
  const queryClient = useQueryClient();

  const [contactName, setContactName] = useState(defaultContactName);
  const [contactEmail, setContactEmail] = useState(defaultContactEmail);
  const [contactPhone, setContactPhone] = useState(defaultContactPhone);
  const [direction, setDirection] = useState<'outbound' | 'inbound'>('outbound');
  const [outcome, setOutcome] = useState('connected');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setContactName(defaultContactName);
    setContactEmail(defaultContactEmail);
    setContactPhone(defaultContactPhone);
    setDirection('outbound');
    setOutcome('connected');
    setDurationMinutes('');
    setNotes('');
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  };

  const logCallMutation = useMutation({
    mutationFn: async () => {
      const parsedMinutes = durationMinutes ? parseInt(durationMinutes, 10) : 0;
      const durationSeconds = isNaN(parsedMinutes) ? 0 : Math.max(0, parsedMinutes) * 60;
      const connected = outcome === 'connected' || outcome === 'callback';
      const now = new Date().toISOString();

      // 1. Insert into contact_activities
      const { data: activity, error: actErr } = await (supabase as any)
        .from('contact_activities')
        .insert({
          activity_type: 'call_completed',
          source_system: 'manual',
          call_started_at: now,
          call_ended_at: now,
          call_duration_seconds: durationSeconds,
          call_outcome: outcome,
          call_connected: connected,
          call_direction: direction,
          disposition_label: OUTCOMES.find((o) => o.value === outcome)?.label || outcome,
          disposition_notes: notes || null,
          contact_email: contactEmail || null,
          user_name: null,
          listing_id: listingId || null,
          matching_status: listingId ? 'matched' : 'unmatched',
        })
        .select('id')
        .single();

      if (actErr) throw actErr;

      // 2. Log to deal_activities if we have a dealId
      if (dealId) {
        try {
          await supabase.rpc('log_deal_activity', {
            p_deal_id: dealId,
            p_activity_type: 'call_completed',
            p_title: `Manual call logged: ${contactName || contactEmail || 'contact'} (${OUTCOMES.find((o) => o.value === outcome)?.label || outcome})`,
            p_description: [
              durationSeconds > 0 ? `Duration: ${durationMinutes}m` : null,
              notes ? `Notes: ${notes.substring(0, 200)}` : null,
            ].filter(Boolean).join(' | ') || null,
            p_admin_id: null,
            p_metadata: {
              contact_activity_id: activity?.id,
              contact_name: contactName,
              contact_email: contactEmail,
              contact_phone: contactPhone,
              direction,
              outcome,
              connected,
              duration_seconds: durationSeconds,
              notes: notes || null,
              source: 'manual',
            },
          });
        } catch (e) {
          console.error('Failed to log deal activity:', e);
        }

        // 3. Auto-create follow-up task for certain outcomes
        if (outcome === 'voicemail' || outcome === 'no_answer' || outcome === 'callback') {
          const daysOffset = outcome === 'callback' ? 1 : 3;
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + daysOffset);

          try {
            await (supabase as any).from('daily_standup_tasks').insert({
              title: outcome === 'callback'
                ? `Callback: ${contactName || contactEmail || 'contact'}`
                : `Follow up (${outcome.replace('_', ' ')}): ${contactName || contactEmail || 'contact'}`,
              task_type: outcome === 'callback' ? 'schedule_call' : 'follow_up_with_buyer',
              status: 'pending',
              priority: connected ? 'high' : 'medium',
              priority_score: connected ? 80 : 50,
              due_date: dueDate.toISOString().split('T')[0],
              entity_type: 'deal',
              entity_id: dealId,
              deal_id: dealId,
              auto_generated: true,
              generation_source: 'manual_call',
              source: 'system',
              description: `Auto-created from manual call log. Contact: ${contactName || 'Unknown'}${contactEmail ? ` (${contactEmail})` : ''}. Outcome: ${OUTCOMES.find((o) => o.value === outcome)?.label || outcome}.`,
            });
          } catch (e) {
            console.error('Failed to create follow-up task:', e);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal-activities'] });
      queryClient.invalidateQueries({ queryKey: ['contact-combined-history'] });
      queryClient.invalidateQueries({ queryKey: ['unified-timeline'] });
      toast.success('Call logged successfully');
      handleOpenChange(false);
    },
    onError: (err) => {
      toast.error(`Failed to log call: ${(err as Error).message}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Log Manual Call
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="john@example.com"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as 'outbound' | 'inbound')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">Outbound</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duration (min)</Label>
              <Input
                type="number"
                min="0"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                placeholder="5"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Call notes, key takeaways..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => logCallMutation.mutate()}
            disabled={logCallMutation.isPending}
          >
            {logCallMutation.isPending ? 'Logging...' : 'Log Call'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
