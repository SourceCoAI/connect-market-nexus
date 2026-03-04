import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Trash2, TestTube, Check, X, Loader2, Webhook } from 'lucide-react';
import { toast } from 'sonner';

import type { Tables } from '@/integrations/supabase/types';

type WebhookConfig = Tables<'webhook_configs'>;

interface WebhookSettingsProps {
  universeId?: string;
}

export function WebhookSettings({ universeId }: WebhookSettingsProps) {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [, setIsTestDialogOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookConfig | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    webhook_url: '',
    secret: '',
    event_types: ['extraction.completed', 'ceo.detected'] as string[],
  });

  // Fetch webhook configurations
  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ['webhooks', universeId],
    queryFn: async () => {
      let query = supabase
        .from('webhook_configs')
        .select('*')
        .order('created_at', { ascending: false });

      if (universeId) {
        query = query.eq('universe_id', universeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as WebhookConfig[];
    },
  });

  // Add webhook mutation
  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('webhook_configs').insert({
        universe_id: universeId || null,
        name: formData.name,
        webhook_url: formData.webhook_url,
        secret: formData.secret || null,
        event_types: formData.event_types,
        enabled: true,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', universeId] });
      toast.success('Webhook added successfully');
      setFormData({ name: '', webhook_url: '', secret: '', event_types: ['extraction.completed'] });
      setIsAddDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(`Failed to add webhook: ${error.message}`);
    },
  });

  // Delete webhook mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('webhook_configs').delete().eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', universeId] });
      toast.success('Webhook deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete webhook: ${error.message}`);
    },
  });

  // Toggle webhook enabled/disabled
  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from('webhook_configs').update({ enabled }).eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', universeId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to toggle webhook: ${error.message}`);
    },
  });

  // Test webhook mutation
  const testMutation = useMutation({
    mutationFn: async (webhook: WebhookConfig) => {
      // Send a test payload
      const testPayload = {
        event: 'webhook.test',
        transcript_id: '00000000-0000-0000-0000-000000000000',
        entity_type: 'buyer',
        extracted_fields: ['thesis_summary', 'target_industries'],
        timestamp: new Date().toISOString(),
        test: true,
      };

      const response = await fetch(webhook.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Event-Type': 'webhook.test',
          'User-Agent': 'ConnectMarketNexus-Webhook-Test/1.0',
        },
        body: JSON.stringify(testPayload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      return response;
    },
    onSuccess: (response) => {
      toast.success(`Test successful! Webhook returned ${response.status}`);
      setIsTestDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(`Test failed: ${error.message}`);
    },
  });

  const eventOptions = [
    { value: 'extraction.completed', label: 'Extraction Completed' },
    { value: 'extraction.failed', label: 'Extraction Failed' },
    { value: 'ceo.detected', label: 'CEO Detected' },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Webhook Notifications
            </CardTitle>
            <CardDescription>
              Receive real-time notifications when transcript extraction completes
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Webhook
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Webhook</DialogTitle>
                <DialogDescription>
                  Configure a webhook to receive notifications when transcripts are processed
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Slack Notifications"
                  />
                </div>
                <div>
                  <Label htmlFor="url">Webhook URL</Label>
                  <Input
                    id="url"
                    value={formData.webhook_url}
                    onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                    placeholder="https://hooks.slack.com/services/..."
                  />
                </div>
                <div>
                  <Label htmlFor="secret">Secret (Optional)</Label>
                  <Input
                    id="secret"
                    type="password"
                    value={formData.secret}
                    onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                    placeholder="For HMAC signature verification"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    If provided, payloads will be signed with HMAC-SHA256
                  </p>
                </div>
                <div>
                  <Label>Events to Subscribe</Label>
                  <div className="space-y-2 mt-2">
                    {eventOptions.map((event) => (
                      <div key={event.value} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={formData.event_types.includes(event.value)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                event_types: [...formData.event_types, event.value],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                event_types: formData.event_types.filter((t) => t !== event.value),
                              });
                            }
                          }}
                          className="rounded"
                        />
                        <Label className="font-normal">{event.label}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => addMutation.mutate()}
                  disabled={!formData.name || !formData.webhook_url || addMutation.isPending}
                >
                  {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Webhook
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading webhooks...</div>
        ) : webhooks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No webhooks configured. Add one to get started.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Deliveries</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((webhook) => (
                <TableRow key={webhook.id}>
                  <TableCell className="font-medium">{webhook.name}</TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    {webhook.webhook_url}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {webhook.event_types.slice(0, 2).map((event) => (
                        <Badge key={event} variant="outline" className="text-xs">
                          {event.split('.')[1]}
                        </Badge>
                      ))}
                      {webhook.event_types.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{webhook.event_types.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={webhook.enabled}
                      onCheckedChange={(enabled) =>
                        toggleMutation.mutate({ id: webhook.id, enabled })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div className="flex items-center gap-1">
                        <Check className="h-3 w-3 text-green-600" />
                        {webhook.total_deliveries - webhook.total_failures}
                      </div>
                      {webhook.total_failures > 0 && (
                        <div className="flex items-center gap-1 text-red-600">
                          <X className="h-3 w-3" />
                          {webhook.total_failures}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedWebhook(webhook);
                          testMutation.mutate(webhook);
                        }}
                        disabled={testMutation.isPending}
                      >
                        {testMutation.isPending && selectedWebhook?.id === webhook.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <TestTube className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete webhook "${webhook.name}"?`)) {
                            deleteMutation.mutate(webhook.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
