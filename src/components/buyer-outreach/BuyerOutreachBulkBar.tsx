import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Phone, ListChecks, UserMinus, X } from 'lucide-react';
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
import { PushToDialerModal } from '@/components/remarketing/PushToDialerModal';

interface BuyerOutreachBulkBarProps {
  selectedCount: number;
  contactIds: string[];
  contactsWithPhone: number;
  onRemoveFromList: () => void;
  onAddToList: () => void;
  onClearSelection: () => void;
}

export function BuyerOutreachBulkBar({
  selectedCount,
  contactIds,
  contactsWithPhone,
  onRemoveFromList,
  onAddToList,
  onClearSelection,
}: BuyerOutreachBulkBarProps) {
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [isDialerOpen, setIsDialerOpen] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <>
      <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg flex-wrap">
        <Badge variant="secondary" className="text-sm font-medium">
          {selectedCount} selected
        </Badge>

        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>

        <div className="h-5 w-px bg-border" />

        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowRemoveDialog(true)}
          className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
        >
          <UserMinus className="h-3.5 w-3.5" />
          Remove from List
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setIsDialerOpen(true)}
          className="gap-1.5"
          disabled={contactsWithPhone === 0}
        >
          <Phone className="h-3.5 w-3.5" />
          Push to PhoneBurner{contactsWithPhone > 0 ? ` (${contactsWithPhone})` : ''}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onAddToList}
          className="gap-1.5"
        >
          <ListChecks className="h-3.5 w-3.5" />
          Add to List
        </Button>
      </div>

      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selectedCount} Contact{selectedCount !== 1 ? 's' : ''} from List?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the selected contacts from the deal buyer list. The contacts will still exist in the system but won't be associated with this deal's outreach.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onRemoveFromList();
                setShowRemoveDialog(false);
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PushToDialerModal
        open={isDialerOpen}
        onOpenChange={setIsDialerOpen}
        contactIds={contactIds}
        contactCount={contactsWithPhone}
        entityType="contacts"
      />
    </>
  );
}
