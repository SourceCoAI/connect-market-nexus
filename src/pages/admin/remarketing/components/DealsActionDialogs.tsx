import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Calculator, Zap } from 'lucide-react';
import {
  DealImportDialog,
  AddDealDialog,
  DealEnrichmentSummaryDialog,
} from '@/components/remarketing';
import { BulkAssignUniverseDialog } from '@/components/remarketing/BulkAssignUniverseDialog';

interface DealsActionDialogsProps {
  // Import dialog
  showImportDialog: boolean;
  setShowImportDialog: (v: boolean) => void;
  refetchListings: () => void;
  handleImportCompleteWithIds: (ids: string[]) => void;
  // Archive dialog
  showArchiveDialog: boolean;
  setShowArchiveDialog: (v: boolean) => void;
  handleBulkArchive: () => void;
  isArchiving: boolean;
  selectedDealsSize: number;
  // Delete dialog
  showDeleteDialog: boolean;
  setShowDeleteDialog: (v: boolean) => void;
  handleBulkDelete: () => void;
  isDeleting: boolean;
  // Universe dialog
  showUniverseDialog: boolean;
  setShowUniverseDialog: (v: boolean) => void;
  selectedDealIds: string[];
  onUniverseComplete: () => void;
  // Single delete dialog
  singleDeleteTarget: { id: string; name: string } | null;
  setSingleDeleteTarget: (v: { id: string; name: string } | null) => void;
  handleConfirmSingleDelete: () => void;
  // Calculate scores dialog
  showCalculateDialog: boolean;
  setShowCalculateDialog: (v: boolean) => void;
  handleCalculateScores: (mode: 'all' | 'unscored') => void;
  isCalculating: boolean;
  // Enrich dialog
  showEnrichDialog: boolean;
  setShowEnrichDialog: (v: boolean) => void;
  handleEnrichDeals: (mode: 'all' | 'unenriched') => void;
  isEnrichingAll: boolean;
  listingsCount: number;
  unenrichedCount: number;
  // Add deal dialog
  showAddDealDialog: boolean;
  setShowAddDealDialog: (v: boolean) => void;
  // Enrichment summary
  showEnrichmentSummary: boolean;
  dismissSummary: () => void;
  enrichmentSummary: {
    total?: number;
    success?: number;
    failed?: number;
    errors?: { id: string; error: string }[];
  } | null;
  handleRetryFailedEnrichment: () => void;
}

export const DealsActionDialogs = ({
  showImportDialog,
  setShowImportDialog,
  refetchListings,
  handleImportCompleteWithIds,
  showArchiveDialog,
  setShowArchiveDialog,
  handleBulkArchive,
  isArchiving,
  selectedDealsSize,
  showDeleteDialog,
  setShowDeleteDialog,
  handleBulkDelete,
  isDeleting,
  showUniverseDialog,
  setShowUniverseDialog,
  selectedDealIds,
  onUniverseComplete,
  singleDeleteTarget,
  setSingleDeleteTarget,
  handleConfirmSingleDelete,
  showCalculateDialog,
  setShowCalculateDialog,
  handleCalculateScores,
  isCalculating,
  showEnrichDialog,
  setShowEnrichDialog,
  handleEnrichDeals,
  isEnrichingAll,
  listingsCount,
  unenrichedCount,
  showAddDealDialog,
  setShowAddDealDialog,
  showEnrichmentSummary,
  dismissSummary,
  enrichmentSummary,
  handleRetryFailedEnrichment,
}: DealsActionDialogsProps) => (
  <>
    {/* Import Dialog */}
    <DealImportDialog
      open={showImportDialog}
      onOpenChange={setShowImportDialog}
      onImportComplete={() => refetchListings()}
      onImportCompleteWithIds={handleImportCompleteWithIds}
    />

    {/* Archive Confirmation Dialog */}
    <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {selectedDealsSize} Opportunity(s)?</AlertDialogTitle>
          <AlertDialogDescription>
            This will move the selected opportunities to the archive. They will no longer appear in the
            active opportunities list.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isArchiving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleBulkArchive}
            disabled={isArchiving}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {isArchiving ? 'Archiving...' : 'Archive'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Delete Confirmation Dialog */}
    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Permanently Delete {selectedDealsSize} Opportunity(s)?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the selected opportunities and all related data (transcripts,
            scores, outreach records, etc.). This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleBulkDelete}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700"
          >
            {isDeleting ? 'Deleting...' : 'Delete Permanently'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Bulk Assign to Universe Dialog */}
    <BulkAssignUniverseDialog
      open={showUniverseDialog}
      onOpenChange={setShowUniverseDialog}
      dealIds={selectedDealIds}
      onComplete={onUniverseComplete}
    />

    {/* Single Delete Dialog */}
    <AlertDialog
      open={!!singleDeleteTarget}
      onOpenChange={(open) => !open && setSingleDeleteTarget(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Permanently Delete "{singleDeleteTarget?.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete this deal and all related data (transcripts, scores,
            outreach records, etc.). This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmSingleDelete}
            className="bg-red-600 hover:bg-red-700"
          >
            Delete Permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Calculate Scores Dialog */}
    <Dialog open={showCalculateDialog} onOpenChange={setShowCalculateDialog}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Calculate Opportunity Scores
          </DialogTitle>
          <DialogDescription>
            Choose how you want to calculate quality scores. Both options will trigger website
            enrichment for accurate data.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-4">
          <Button
            variant="default"
            className="w-full justify-start h-auto py-4 px-4"
            onClick={() => handleCalculateScores('all')}
            disabled={isCalculating}
          >
            <div className="flex flex-col items-start gap-1">
              <span className="font-medium">Calculate All</span>
              <span className="text-xs text-muted-foreground font-normal">
                Re-enrich all websites and recalculate all scores
              </span>
            </div>
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start h-auto py-4 px-4"
            onClick={() => handleCalculateScores('unscored')}
            disabled={isCalculating}
          >
            <div className="flex flex-col items-start gap-1">
              <span className="font-medium">Just Those Without a Score</span>
              <span className="text-xs text-muted-foreground font-normal">
                Only enrich and score deals that don't have a score yet
              </span>
            </div>
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowCalculateDialog(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Enrich Opportunities Dialog */}
    <Dialog open={showEnrichDialog} onOpenChange={setShowEnrichDialog}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Enrich Opportunities
          </DialogTitle>
          <DialogDescription>
            Enrichment scrapes websites, extracts company data, and fetches LinkedIn & Google info.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-4">
          <Button
            variant="default"
            className="w-full justify-start h-auto py-4 px-4"
            onClick={() => handleEnrichDeals('all')}
            disabled={isEnrichingAll}
          >
            <div className="flex flex-col items-start gap-1">
              <span className="font-medium">Enrich All</span>
              <span className="text-xs text-muted-foreground font-normal">
                Re-enrich all {listingsCount} deals (resets existing data)
              </span>
            </div>
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start h-auto py-4 px-4"
            onClick={() => handleEnrichDeals('unenriched')}
            disabled={isEnrichingAll}
          >
            <div className="flex flex-col items-start gap-1">
              <span className="font-medium">Only Unenriched</span>
              <span className="text-xs text-muted-foreground font-normal">
                Only enrich {unenrichedCount} deals that haven't been enriched yet
              </span>
            </div>
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowEnrichDialog(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Add Deal Dialog */}
    <AddDealDialog
      open={showAddDealDialog}
      onOpenChange={setShowAddDealDialog}
      onDealCreated={() => refetchListings()}
    />

    {/* Deal Enrichment Summary Dialog */}
    <DealEnrichmentSummaryDialog
      open={showEnrichmentSummary}
      onOpenChange={(open) => !open && dismissSummary()}
      summary={
        enrichmentSummary as React.ComponentProps<typeof DealEnrichmentSummaryDialog>['summary']
      }
      onRetryFailed={handleRetryFailedEnrichment}
    />
  </>
);
