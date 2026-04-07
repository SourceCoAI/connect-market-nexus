import { useState, useEffect } from 'react';
import { Building2, Loader2, Phone, XCircle, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useOwnerLeads,
  useUpdateOwnerLeadStatus,
  useUpdateOwnerLeadContacted,
} from '@/hooks/admin/use-owner-leads';
import { useUpdateOwnerLeadNotes } from '@/hooks/admin/use-update-owner-lead-notes';
import { useMarkOwnerLeadsViewed } from '@/hooks/admin/use-mark-owner-leads-viewed';
import { OwnerLeadsStats } from '@/components/admin/OwnerLeadsStats';
import { OwnerLeadsFilters } from '@/components/admin/OwnerLeadsFilters';
import { OwnerLeadsTableContent } from '@/components/admin/OwnerLeadsTableContent';
import { PushToDialerModal } from '@/components/remarketing/PushToDialerModal';
import { PushToSmartleadModal } from '@/components/remarketing/PushToSmartleadModal';
import { OwnerLead } from '@/hooks/admin/use-owner-leads';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';
import { useAIUIActionHandler } from '@/hooks/useAIUIActionHandler';

const OwnerLeadsPage = () => {
  const { data: ownerLeads = [], isLoading: isLoadingOwnerLeads } = useOwnerLeads();
  const updateOwnerStatus = useUpdateOwnerLeadStatus();
  const updateOwnerNotes = useUpdateOwnerLeadNotes();
  const updateOwnerContacted = useUpdateOwnerLeadContacted();
  const { markAsViewed: markOwnerLeadsAsViewed } = useMarkOwnerLeadsViewed();
  const [filteredOwnerLeads, setFilteredOwnerLeads] = useState<OwnerLead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialerOpen, setDialerOpen] = useState(false);
  const [smartleadOpen, setSmartleadOpen] = useState(false);
  const [hideNotFit, setHideNotFit] = useState(true);
  const [showNotFitDialog, setShowNotFitDialog] = useState(false);
  const [isMarkingNotFit, setIsMarkingNotFit] = useState(false);

  // Register AI Command Center context
  const { setPageContext } = useAICommandCenterContext();
  useEffect(() => {
    setPageContext({ page: 'owner_leads', entity_type: 'leads' });
  }, [setPageContext]);

  // Wire AI UI actions
  useAIUIActionHandler({
    table: 'leads',
    onSelectRows: (rowIds, mode) => {
      if (mode === 'replace') {
        setSelectedIds(new Set(rowIds));
      } else if (mode === 'add') {
        setSelectedIds((prev) => { const next = new Set(prev); rowIds.forEach((id) => next.add(id)); return next; });
      } else {
        setSelectedIds((prev) => { const next = new Set(prev); rowIds.forEach((id) => (next.has(id) ? next.delete(id) : next.add(id))); return next; });
      }
    },
    onClearSelection: () => setSelectedIds(new Set()),
    onTriggerAction: (action) => {
      if (action === 'push_to_dialer') setDialerOpen(true);
      if (action === 'push_to_smartlead') setSmartleadOpen(true);
    },
  });

  useEffect(() => {
    markOwnerLeadsAsViewed();
  }, []);

  useEffect(() => {
    setFilteredOwnerLeads(ownerLeads);
  }, [ownerLeads]);

  const handleOwnerStatusChange = (id: string, status: string) => {
    updateOwnerStatus.mutate({ id, status });
  };

  const handleOwnerNotesUpdate = (id: string, notes: string) => {
    updateOwnerNotes.mutate({ id, notes });
  };

  const handleOwnerContactedChange = (id: string, contacted: boolean) => {
    updateOwnerContacted.mutate({ id, contacted });
  };

  const handleMarkNotFit = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsMarkingNotFit(true);
    try {
      const { error } = await supabase
        .from('inbound_leads')
        .update({ status: 'not_a_fit', updated_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      toast({
        title: 'Marked as Not a Fit',
        description: `${ids.length} lead(s) marked as not a fit.`,
      });
      setSelectedIds(new Set());
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to mark leads as not a fit.',
      });
    } finally {
      setIsMarkingNotFit(false);
    }
  };

  // Apply hideNotFit filter on top of the filtered leads
  const displayedLeads = hideNotFit
    ? filteredOwnerLeads.filter((l) => l.status !== 'not_a_fit')
    : filteredOwnerLeads;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="px-4 md:px-8 py-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Owner/Seller Leads</h1>
            <p className="text-sm text-muted-foreground">
              Business owner inquiries submitted through the /sell form. Track, qualify, and convert
              to deals.
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-8">
        <div className="space-y-6 mb-6">
          <OwnerLeadsStats leads={ownerLeads} />
          <OwnerLeadsFilters leads={ownerLeads} onFilteredLeadsChange={setFilteredOwnerLeads} />
        </div>

        {/* Hide Not Fit Toggle */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setHideNotFit(!hideNotFit)}
            className={cn(
              'flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border transition-colors',
              hideNotFit
                ? 'bg-orange-100 border-orange-300 text-orange-700 font-medium'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            {hideNotFit ? 'Not Fit Hidden' : 'Show Not Fit'}
          </button>
        </div>

        <div className="bg-card rounded-lg border overflow-hidden">
          {isLoadingOwnerLeads ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : displayedLeads.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">No owner inquiries yet</h3>
              <p className="text-sm text-muted-foreground">
                {hideNotFit && filteredOwnerLeads.length > 0
                  ? 'All leads in this view are marked as "Not a Fit". Toggle the filter above to see them.'
                  : 'Owner inquiries from the /sell form will appear here.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <OwnerLeadsTableContent
                leads={displayedLeads}
                onStatusChange={handleOwnerStatusChange}
                onNotesUpdate={handleOwnerNotesUpdate}
                onContactedChange={handleOwnerContactedChange}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
              />
            </div>
          )}
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 p-3 bg-background border border-primary/20 rounded-lg shadow-lg">
            <Badge variant="secondary" className="text-sm font-medium">
              {selectedIds.size} selected
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              <XCircle className="h-4 w-4 mr-1" />
              Clear
            </Button>
            <div className="h-5 w-px bg-border" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDialerOpen(true)}
              className="gap-2"
            >
              <Phone className="h-4 w-4" />
              Push to Dialer
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSmartleadOpen(true)}
              className="gap-2"
            >
              <Phone className="h-4 w-4" />
              Push to Smartlead
            </Button>
            <div className="h-5 w-px bg-border" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowNotFitDialog(true)}
              disabled={isMarkingNotFit}
              className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
            >
              {isMarkingNotFit ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ThumbsDown className="h-4 w-4" />
              )}
              Not a Fit
            </Button>
          </div>
        )}

        {/* Not a Fit Confirmation Dialog */}
        <AlertDialog open={showNotFitDialog} onOpenChange={setShowNotFitDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark {selectedIds.size} Lead(s) as Not a Fit?</AlertDialogTitle>
              <AlertDialogDescription>
                These leads will be marked as "Not a Fit" and hidden from the default view. You can
                show them again using the "Show Not Fit" toggle.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  handleMarkNotFit();
                  setShowNotFitDialog(false);
                }}
                disabled={isMarkingNotFit}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {isMarkingNotFit ? 'Marking...' : 'Mark as Not a Fit'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <PushToDialerModal
          open={dialerOpen}
          onOpenChange={setDialerOpen}
          contactIds={Array.from(selectedIds)}
          contactCount={selectedIds.size}
          entityType="leads"
        />
        <PushToSmartleadModal
          open={smartleadOpen}
          onOpenChange={setSmartleadOpen}
          contactIds={Array.from(selectedIds)}
          contactCount={selectedIds.size}
          entityType="leads"
        />
      </div>
    </div>
  );
};

export default OwnerLeadsPage;
