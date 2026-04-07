import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Bell, Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { CreateDealAlertDialog } from './CreateDealAlertDialog';
import { EditDealAlertDialog } from './EditDealAlertDialog';
import { DealAlertCard } from './DealAlertCard';
import { useDealAlerts, useDeleteDealAlert, useToggleDealAlert, DealAlert } from '@/hooks/use-deal-alerts';
import { toast } from 'sonner';

export function DealAlertsTab() {
  const [selectedAlert, setSelectedAlert] = useState<DealAlert | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  const { data: alerts, isLoading, error } = useDealAlerts();
  const deleteAlert = useDeleteDealAlert();
  const toggleAlert = useToggleDealAlert();

  const handleEdit = (alert: DealAlert) => {
    setSelectedAlert(alert);
    setEditDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this alert?')) {
      await deleteAlert.mutateAsync(id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    await toggleAlert.mutateAsync({ id, is_active: isActive });
  };

  const handleSelectToggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!alerts) return;
    if (selectedIds.size === alerts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(alerts.map((a) => a.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(`Are you sure you want to delete ${count} alert${count !== 1 ? 's' : ''}?`)) return;
    
    setIsBulkDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => deleteAlert.mutateAsync(id)));
      toast.success(`Deleted ${count} alert${count !== 1 ? 's' : ''}`);
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Bulk delete error:', err);
      toast.error('Some alerts failed to delete');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load deal alerts. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  const allSelected = alerts && alerts.length > 0 && selectedIds.size === alerts.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Deal Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
            <div className="flex-1 min-w-0">
              <p className="text-muted-foreground mb-2">
                Never miss opportunities. Create alerts and get in-app notifications the moment a matching deal is published.
              </p>
              <p className="text-sm text-muted-foreground">
                Choose instant, daily, or weekly summaries based on your preference.
              </p>
            </div>
            <div className="shrink-0">
              <CreateDealAlertDialog />
            </div>
          </div>

          {!alerts || alerts.length === 0 ? (
            <div className="text-center py-12 bg-muted/20 rounded-lg border-2 border-dashed border-muted">
              <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Deal Alerts Set Up</h3>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                Create your first deal alert to start receiving notifications when new opportunities match your criteria.
              </p>
              <CreateDealAlertDialog 
                trigger={
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Alert
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all alerts"
                    />
                    <button
                      onClick={handleSelectAll}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {allSelected ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {alerts.length} alert{alerts.length !== 1 ? 's' : ''} configured
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {someSelected && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleBulkDelete}
                      disabled={isBulkDeleting}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      {isBulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size} Selected`}
                    </Button>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {alerts.filter(a => a.is_active).length} active • {alerts.filter(a => !a.is_active).length} paused
                  </div>
                </div>
              </div>
              
              <div className="grid gap-4">
                {alerts.map((alert) => (
                  <DealAlertCard
                    key={alert.id}
                    alert={alert}
                    selected={selectedIds.has(alert.id)}
                    onSelect={handleSelectToggle}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <EditDealAlertDialog
        alert={selectedAlert}
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setSelectedAlert(null);
        }}
      />
    </div>
  );
}