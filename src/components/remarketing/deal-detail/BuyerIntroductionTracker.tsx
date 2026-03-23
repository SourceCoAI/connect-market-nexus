import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Target, CheckCircle, Search, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddBuyerIntroductionDialog } from './AddBuyerIntroductionDialog';
import { UpdateIntroductionStatusDialog } from './UpdateIntroductionStatusDialog';
import { useBuyerIntroductionTracker } from './useBuyerIntroductionTracker';
import { SelectionActionBar } from './SelectionActionBar';
import { ConfirmRemoveDialog } from './ConfirmRemoveDialog';
import { IntroductionBuyerRow } from './IntroductionBuyerRow';
import { IntroducedBuyerRow } from './IntroducedBuyerRow';

interface BuyerIntroductionTrackerProps {
  listingId: string;
  listingTitle?: string;
}

export function BuyerIntroductionTracker({
  listingId,
  listingTitle,
}: BuyerIntroductionTrackerProps) {
  const {
    isLoading,
    scoreMap,
    universeAssignment,
    stats,

    filteredNotIntroduced,
    filteredIntroducedPassed,

    searchQuery,
    setSearchQuery,

    addDialogOpen,
    setAddDialogOpen,
    selectedBuyer,
    updateDialogOpen,
    openBuyerUpdate,
    closeBuyerUpdate,

    selectedIds,
    toggleSelection,
    clearSelection,
    selectedBuyerNames,
    confirmRemoveOpen,
    setConfirmRemoveOpen,
    handleRemoveSelected,
    isBatchArchiving,

    allNotIntroducedSelected,
    someNotIntroducedSelected,
    toggleAllNotIntroduced,

    allIntroducedSelected,
    someIntroducedSelected,
    toggleAllIntroduced,

    sendBuyerToUniverse,
    isSendingToUniverse,
  } = useBuyerIntroductionTracker(listingId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <>
      {/* ─── Selection Action Bar ─── */}
      <SelectionActionBar
        selectedCount={selectedIds.size}
        selectedBuyerNames={selectedBuyerNames}
        onClear={clearSelection}
        onRemove={() => setConfirmRemoveOpen(true)}
        isRemoving={isBatchArchiving}
      />

      {/* ─── Section 1: Buyers to Introduce to Deal ─── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4" />
              Buyers to Introduce to Deal
              {filteredNotIntroduced.length > 0 && (
                <Badge variant="secondary" className="text-xs ml-1">
                  {filteredNotIntroduced.length}
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Buyers queued for introduction — click a buyer to update their status
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search buyers"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 w-48 text-xs"
              />
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setAddDialogOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" />
              Add Buyer
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {filteredNotIntroduced.length === 0 ? (
            <div className="py-8 text-center">
              <Target className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? 'No buyers matching your search'
                  : 'No buyers in the introduction pipeline yet'}
              </p>
              {!searchQuery && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-2"
                  onClick={() => setAddDialogOpen(true)}
                >
                  <UserPlus className="h-4 w-4" />
                  Add First Buyer
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Select all for this section */}
              <div className="flex items-center gap-2 pb-1">
                <Checkbox
                  checked={allNotIntroducedSelected}
                  ref={undefined}
                  onCheckedChange={toggleAllNotIntroduced}
                  className={cn(
                    'h-4 w-4',
                    someNotIntroducedSelected && !allNotIntroducedSelected && 'opacity-60',
                  )}
                />
                <span className="text-xs text-muted-foreground">Select all</span>
              </div>
              {filteredNotIntroduced.map((buyer) => (
                <IntroductionBuyerRow
                  key={buyer.id}
                  buyer={buyer}
                  score={
                    buyer.remarketing_buyer_id || buyer.contact_id
                      ? scoreMap.get((buyer.remarketing_buyer_id || buyer.contact_id)!)
                      : undefined
                  }
                  selected={selectedIds.has(buyer.id)}
                  onToggleSelect={toggleSelection}
                  onSelect={openBuyerUpdate}
                  universeAssignment={universeAssignment}
                  onSendToUniverse={sendBuyerToUniverse}
                  isSendingToUniverse={isSendingToUniverse}
                />
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Section 2: Buyers Introduced ─── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle className="h-4 w-4" />
              Buyers Introduced
              {filteredIntroducedPassed.length > 0 && (
                <Badge variant="secondary" className="text-xs ml-1">
                  {filteredIntroducedPassed.length}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>Buyers that have been evaluated for this deal</span>
              {stats.fitAndInterested > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200"
                >
                  {stats.fitAndInterested} Fit & Interested
                </Badge>
              )}
              {stats.notAFit > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-slate-50 text-slate-600 border-slate-200"
                >
                  {stats.notAFit} Not a Fit
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {filteredIntroducedPassed.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? 'No introduced buyers matching your search'
                  : 'No buyers have been introduced yet'}
              </p>
            </div>
          ) : (
            <>
              {/* Select all for this section */}
              <div className="flex items-center gap-2 pb-1">
                <Checkbox
                  checked={allIntroducedSelected}
                  ref={undefined}
                  onCheckedChange={toggleAllIntroduced}
                  className={cn(
                    'h-4 w-4',
                    someIntroducedSelected && !allIntroducedSelected && 'opacity-60',
                  )}
                />
                <span className="text-xs text-muted-foreground">Select all</span>
              </div>
              {filteredIntroducedPassed.map((buyer) => (
                <IntroducedBuyerRow
                  key={buyer.id}
                  buyer={buyer}
                  score={
                    buyer.remarketing_buyer_id || buyer.contact_id
                      ? scoreMap.get((buyer.remarketing_buyer_id || buyer.contact_id)!)
                      : undefined
                  }
                  selected={selectedIds.has(buyer.id)}
                  onToggleSelect={toggleSelection}
                  onSelect={openBuyerUpdate}
                  universeAssignment={universeAssignment}
                  onSendToUniverse={sendBuyerToUniverse}
                  isSendingToUniverse={isSendingToUniverse}
                />
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddBuyerIntroductionDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        listingId={listingId}
        listingTitle={listingTitle || 'This Deal'}
      />

      {selectedBuyer && (
        <UpdateIntroductionStatusDialog
          open={updateDialogOpen}
          onOpenChange={closeBuyerUpdate}
          buyer={selectedBuyer}
          listingId={listingId}
        />
      )}

      <ConfirmRemoveDialog
        open={confirmRemoveOpen}
        onOpenChange={setConfirmRemoveOpen}
        selectedCount={selectedIds.size}
        selectedBuyerNames={selectedBuyerNames}
        onConfirm={handleRemoveSelected}
        isRemoving={isBatchArchiving}
      />
    </>
  );
}
