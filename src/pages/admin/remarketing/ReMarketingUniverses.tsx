import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Search,
  Plus,
  Globe2,
  ArrowUpDown,
  X,
  Network,
  Sparkles,
  Loader2,
  ChevronDown,
  Trash2,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';
import { useAIUIActionHandler } from '@/hooks/useAIUIActionHandler';
import { useUniversesData, type SortField } from './useUniversesData';
import { UniverseRow, SortableFlaggedRow } from './UniverseRow';

const ReMarketingUniverses = () => {
  const {
    // Query data
    universes,
    isLoading,
    buyerStats,
    dealStats,
    archivedCount,
    flaggedDeals,
    orderedFlagged,
    sortedUniverses,

    // Sort state
    sortField,
    sortOrder: _sortOrder,
    handleSort,

    // Search state
    search,
    setSearch,

    // Archive toggle
    showArchived,
    setShowArchived,

    // New universe dialog
    showNewDialog,
    newName,
    setNewName,
    newDescription,
    setNewDescription,
    isGeneratingDescription,
    handleGenerateDescription,

    // Mutations
    createMutation,
    archiveMutation,
    deleteMutation,
    bulkDeleteMutation,

    // Flagged deals / drag-and-drop
    handleFlaggedDragEnd,

    // Enrichment
    enrichAllFlaggedDeals,
    isBulkEnriching,
    runningOp,
    isDealEnriching,
    handleBulkDealEnrich,

    // Navigation & params
    navigate,
    setSearchParams,

    // Flagged deal removal
    removeFlaggedDeal,

    // Description backfill
    isBackfillingDescriptions,
    backfillMissingDescriptions,
  } = useUniversesData();

  const [activeTab, setActiveTab] = useState<'existing' | 'to_be_created'>('existing');

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  // Register AI Command Center context
  const { setPageContext } = useAICommandCenterContext();
  useEffect(() => {
    setPageContext({ page: 'universes', entity_type: 'universes' });
  }, [setPageContext]);

  // Wire AI UI actions
  useAIUIActionHandler({
    table: 'universes',
    onSelectRows: (rowIds, mode) => {
      if (mode === 'replace') {
        setSelectedIds(new Set(rowIds));
      } else if (mode === 'add') {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          rowIds.forEach((id) => next.add(id));
          return next;
        });
      } else {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          rowIds.forEach((id) => (next.has(id) ? next.delete(id) : next.add(id)));
          return next;
        });
      }
    },
    onClearSelection: () => setSelectedIds(new Set()),
  });

  const flaggedSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer hover:bg-muted/50 select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown
          className={`h-3.5 w-3.5 ${sortField === field ? 'text-foreground' : 'text-muted-foreground/50'}`}
        />
      </div>
    </TableHead>
  );

  // Selection helpers
  const allSelected =
    sortedUniverses.length > 0 && sortedUniverses.every((u) => selectedIds.has(u.id));
  const someSelected = sortedUniverses.some((u) => selectedIds.has(u.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedUniverses.map((u) => u.id)));
    }
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  return (
    <div className="p-6 space-y-6 h-fit">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Buyer Universes</h1>
          <p className="text-muted-foreground">
            {universes?.length || 0} existing · {flaggedDeals?.length || 0} to be created{' '}
            {archivedCount ? `· ${archivedCount} archived` : ''}
          </p>
        </div>
        <Button
          onClick={() =>
            setSearchParams((prev) => {
              const n = new URLSearchParams(prev);
              n.set('new', 'true');
              return n;
            })
          }
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          New Universe
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'existing' | 'to_be_created')}
      >
        <TabsList>
          <TabsTrigger value="existing">
            <Globe2 className="h-4 w-4 mr-1.5" />
            Existing ({universes?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="to_be_created">
            <Network className="h-4 w-4 mr-1.5" />
            To Be Created ({flaggedDeals?.length || 0})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'existing' ? (
        <>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search universes..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-archived"
                    checked={showArchived}
                    onCheckedChange={setShowArchived}
                  />
                  <Label htmlFor="show-archived" className="text-sm text-muted-foreground">
                    Show archived ({archivedCount})
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 ml-2"
                    onClick={backfillMissingDescriptions}
                    disabled={isBackfillingDescriptions}
                  >
                    {isBackfillingDescriptions ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {isBackfillingDescriptions ? 'Generating...' : 'Generate Missing Descriptions'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bulk Action Bar */}
          {selectedIds.size > 0 && (
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
                      {selectedIds.size} universe{selectedIds.size > 1 ? 's' : ''} selected
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedIds(new Set())}
                      className="h-7 px-2 text-muted-foreground"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Clear
                    </Button>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowBulkDeleteDialog(true)}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Selected
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Universes Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                        className={
                          someSelected && !allSelected ? 'data-[state=checked]:bg-primary/50' : ''
                        }
                      />
                    </TableHead>
                    <SortableHeader field="name">Industry / Universe</SortableHeader>
                    <SortableHeader field="buyers">Buyers</SortableHeader>
                    <SortableHeader field="deals">Deals</SortableHeader>
                    <SortableHeader field="coverage">Intelligence Coverage</SortableHeader>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Skeleton className="h-4 w-4" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-40" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-12" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-12" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-8 w-32" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-16" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-8 w-8" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : sortedUniverses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        <Globe2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No universes found</p>
                        <p className="text-sm">Create your first buyer universe to get started</p>
                        <Button
                          variant="outline"
                          className="mt-4"
                          onClick={() =>
                            setSearchParams((prev) => {
                              const n = new URLSearchParams(prev);
                              n.set('new', 'true');
                              return n;
                            })
                          }
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Create Universe
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedUniverses.map((universe) => (
                      <UniverseRow
                        key={universe.id}
                        universe={{ ...universe, fee_agreement_required: universe.fee_agreement_required ?? false }}
                        stats={
                          buyerStats?.[universe.id] || {
                            total: 0,
                            enriched: 0,
                            withTranscripts: 0,
                          }
                        }
                        deals={dealStats?.[universe.id] || 0}
                        isSelected={selectedIds.has(universe.id)}
                        onToggleSelect={toggleSelect}
                        onArchive={(params) => archiveMutation.mutate(params)}
                        onDelete={(id) => deleteMutation.mutate(id)}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        /* To Be Created Tab */
        <Card>
          <CardContent className="p-0">
            {/* Enrich toolbar */}
            {orderedFlagged.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <p className="text-sm text-muted-foreground">
                  {orderedFlagged.filter((d) => !d.enriched_at).length} of{' '}
                  {orderedFlagged.length} deals need data enrichment &middot;{' '}
                  {orderedFlagged.filter((d) => !d.buyer_universe_generated_at).length} need universe generation
                </p>
                <div className="flex items-center gap-2">
                  {/* Deal-level enrichment dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={isDealEnriching}
                      >
                        {isDealEnriching ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        Enrich Deals
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleBulkDealEnrich('unenriched')}>
                        Enrich Unenriched
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBulkDealEnrich('all')}>
                        Re-enrich All
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Universe generation button */}
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={isBulkEnriching || orderedFlagged.every((d) => !!d.buyer_universe_generated_at)}
                    onClick={enrichAllFlaggedDeals}
                  >
                    {isBulkEnriching ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Generating {runningOp?.completed_items || 0}/{runningOp?.total_items || 0}...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        Generate Universes
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
            <DndContext
              sensors={flaggedSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleFlaggedDragEnd}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]" />
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead>Buyer Universe</TableHead>
                    <TableHead className="min-w-[280px]">Description</TableHead>
                    <TableHead>Deal Name</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Flagged At</TableHead>
                    <TableHead className="w-[150px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderedFlagged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        <Network className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No deals flagged for universe build</p>
                        <p className="text-sm">
                          Flag deals in Active Deals to queue them for universe creation
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <SortableContext
                      items={orderedFlagged.map((d) => d.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {orderedFlagged.map((deal, idx) => (
                        <SortableFlaggedRow
                          key={deal.id}
                          deal={deal}
                          index={idx}
                          onNavigate={() => navigate(`/admin/deals/${deal.id}`, { state: { from: '/admin/buyers/universes' } })}
                          onCreateClick={(e) => {
                            e.stopPropagation();
                            setSearchParams((prev) => {
                              const n = new URLSearchParams(prev);
                              n.set('new', 'true');
                              return n;
                            });
                          }}
                          onRemoveClick={async (e) => {
                            e.stopPropagation();
                            await removeFlaggedDeal(deal.id);
                          }}
                        />
                      ))}
                    </SortableContext>
                  )}
                </TableBody>
              </Table>
            </DndContext>
          </CardContent>
        </Card>
      )}

      {/* New Universe Dialog */}
      <Dialog
        open={showNewDialog}
        onOpenChange={(open) =>
          !open &&
          setSearchParams((prev) => {
            const n = new URLSearchParams(prev);
            n.delete('new');
            return n;
          })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Buyer Universe</DialogTitle>
            <DialogDescription>
              A buyer universe is a collection of buyers that share similar characteristics and
              investment criteria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Universe Name</Label>
              <Input
                id="name"
                placeholder="e.g., HVAC & Plumbing PE"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Description (optional)</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs text-primary"
                  onClick={handleGenerateDescription}
                  disabled={!newName.trim() || isGeneratingDescription}
                >
                  {isGeneratingDescription ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {isGeneratingDescription ? 'Generating...' : 'AI Generate'}
                </Button>
              </div>
              <Input
                id="description"
                placeholder="Brief description of this buyer universe"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setSearchParams((prev) => {
                  const n = new URLSearchParams(prev);
                  n.delete('new');
                  return n;
                })
              }
            >
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Universe'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} Universe{selectedIds.size > 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected universe{selectedIds.size > 1 ? 's' : ''}{' '}
              and all associated buyers, scores, and data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => {
                bulkDeleteMutation.mutate(Array.from(selectedIds));
                setShowBulkDeleteDialog(false);
                setSelectedIds(new Set());
              }}
            >
              {bulkDeleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default ReMarketingUniverses;
