import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import type { NewDealForm } from './types';

interface ExistingDeal {
  id: string;
  title: string | null;
  website: string | null;
  main_contact_name: string | null;
  main_contact_email: string | null;
  main_contact_phone: string | null;
  main_contact_title: string | null;
  industry: string | null;
  executive_summary: string | null;
  location: string | null;
  revenue: number | null;
  ebitda: number | null;
}

export interface DuplicateDealInfo {
  existing: ExistingDeal;
  newDeal: NewDealForm;
}

type FieldKey =
  | 'company_name'
  | 'contact_name'
  | 'contact_email'
  | 'contact_phone'
  | 'contact_title'
  | 'industry'
  | 'executive_summary'
  | 'location'
  | 'revenue'
  | 'ebitda';

interface FieldDef {
  key: FieldKey;
  label: string;
  existingValue: (e: ExistingDeal) => string;
  newValue: (n: NewDealForm) => string;
}

const FIELDS: FieldDef[] = [
  {
    key: 'company_name',
    label: 'Company Name',
    existingValue: (e) => e.title || e.website || '—',
    newValue: (n) => n.company_name || '—',
  },
  {
    key: 'contact_name',
    label: 'Contact Name',
    existingValue: (e) => e.main_contact_name || '—',
    newValue: (n) => n.contact_name || '—',
  },
  {
    key: 'contact_email',
    label: 'Contact Email',
    existingValue: (e) => e.main_contact_email || '—',
    newValue: (n) => n.contact_email || '—',
  },
  {
    key: 'contact_phone',
    label: 'Contact Phone',
    existingValue: (e) => e.main_contact_phone || '—',
    newValue: (n) => n.contact_phone || '—',
  },
  {
    key: 'contact_title',
    label: 'Contact Title',
    existingValue: (e) => e.main_contact_title || '—',
    newValue: (n) => n.contact_title || '—',
  },
  {
    key: 'industry',
    label: 'Industry',
    existingValue: (e) => e.industry || '—',
    newValue: (n) => n.industry || '—',
  },
  {
    key: 'location',
    label: 'Location',
    existingValue: (e) => e.location || '—',
    newValue: (n) => n.location || '—',
  },
  {
    key: 'revenue',
    label: 'Revenue',
    existingValue: (e) => (e.revenue != null ? `$${e.revenue.toLocaleString()}` : '—'),
    newValue: (n) => (n.revenue ? `$${Number(n.revenue).toLocaleString()}` : '—'),
  },
  {
    key: 'ebitda',
    label: 'EBITDA',
    existingValue: (e) => (e.ebitda != null ? `$${e.ebitda.toLocaleString()}` : '—'),
    newValue: (n) => (n.ebitda ? `$${Number(n.ebitda).toLocaleString()}` : '—'),
  },
  {
    key: 'executive_summary',
    label: 'Executive Summary',
    existingValue: (e) => e.executive_summary || '—',
    newValue: (n) => n.executive_summary || '—',
  },
];

interface DuplicateDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicateInfo: DuplicateDealInfo | null;
  isUpdating: boolean;
  onConfirmUpdate: (fieldsToUpdate: FieldKey[]) => void;
}

export function DuplicateDealDialog({
  open,
  onOpenChange,
  duplicateInfo,
  isUpdating,
  onConfirmUpdate,
}: DuplicateDealDialogProps) {
  const [selectedFields, setSelectedFields] = useState<Set<FieldKey>>(new Set());

  // Determine which fields have new non-empty values different from existing
  const updatableFields = useMemo(() => {
    if (!duplicateInfo) return [];
    const { existing, newDeal } = duplicateInfo;
    return FIELDS.filter((f) => {
      const nv = f.newValue(newDeal);
      const ev = f.existingValue(existing);
      // Only show fields where the new value is not empty and differs from existing
      return nv !== '—' && nv !== ev;
    });
  }, [duplicateInfo]);

  // Auto-select all updatable fields when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && updatableFields.length > 0) {
      setSelectedFields(new Set(updatableFields.map((f) => f.key)));
    }
    onOpenChange(isOpen);
  };

  // Also reset selection when duplicateInfo changes
  const toggleField = (key: FieldKey) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelectedFields(new Set(updatableFields.map((f) => f.key)));
  const deselectAll = () => setSelectedFields(new Set());

  if (!duplicateInfo) return null;
  const { existing, newDeal } = duplicateInfo;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Duplicate Deal Found</DialogTitle>
          <DialogDescription>
            A deal with the website <span className="font-semibold">{existing.website}</span>{' '}
            already exists. Select which fields you'd like to update with the new values.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-1 py-2">
          {/* Header row */}
          <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-0 items-center px-2 pb-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <div className="w-5" />
            <div>Current Value</div>
            <div className="w-4" />
            <div>New Value</div>
          </div>

          {FIELDS.map((field) => {
            const ev = field.existingValue(existing);
            const nv = field.newValue(newDeal);
            const isUpdatable = updatableFields.some((f) => f.key === field.key);
            const isSelected = selectedFields.has(field.key);
            const hasNoNew = nv === '—';

            return (
              <div
                key={field.key}
                className={`grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 items-start px-2 py-2 rounded-md transition-colors ${
                  isSelected ? 'bg-orange-50 dark:bg-orange-950/20' : ''
                } ${isUpdatable ? 'cursor-pointer hover:bg-muted/50' : 'opacity-60'}`}
                onClick={() => isUpdatable && toggleField(field.key)}
              >
                <div className="pt-0.5">
                  {isUpdatable ? (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleField(field.key)}
                      className="h-4 w-4"
                    />
                  ) : (
                    <div className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-0.5">
                    {field.label}
                  </div>
                  <div
                    className={`text-sm ${isSelected ? 'line-through text-muted-foreground' : ''}`}
                  >
                    {ev}
                  </div>
                </div>
                <div className="pt-4">
                  {isUpdatable && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-0.5">&nbsp;</div>
                  <div className="text-sm">
                    {hasNoNew ? (
                      <span className="text-muted-foreground">—</span>
                    ) : isUpdatable ? (
                      <Badge
                        variant="outline"
                        className="font-normal text-sm bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800"
                      >
                        {nv}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground italic text-xs">same</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {updatableFields.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              All provided values match the existing deal. Nothing to update.
            </p>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2 pt-2 border-t">
          <div className="flex gap-2">
            {updatableFields.length > 1 && (
              <>
                <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs">
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAll} className="text-xs">
                  Deselect All
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => onConfirmUpdate(Array.from(selectedFields))}
              disabled={isUpdating || selectedFields.size === 0}
            >
              {isUpdating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Update {selectedFields.size} Field{selectedFields.size !== 1 ? 's' : ''}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { FieldKey };
