/**
 * ValidationStep.tsx
 *
 * Wizard step 3: preview of valid / skipped rows and duplicate resolution.
 * Renders two sub-views:
 *   - "preview" -- summary counts, skipped-row collapsible, preview table
 *   - "dedupe"  -- potential duplicates list with skip toggles
 */
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

import {
  CSVRow,
  ColumnMapping,
  SkippedRowDetail,
  DuplicateWarning,
  TARGET_FIELDS,
  hasWebsiteMapping,
} from './helpers';

// ---------------------------------------------------------------------------
// Preview sub-step
// ---------------------------------------------------------------------------

interface PreviewStepProps {
  validRows: { index: number; row: CSVRow }[];
  skippedRows: { index: number; row: CSVRow }[];
  skippedRowDetails: SkippedRowDetail[];
  mappings: ColumnMapping[];
  skippedRowsOpen: boolean;
  onSkippedRowsOpenChange: (open: boolean) => void;
}

export function PreviewStep({
  validRows,
  skippedRows,
  skippedRowDetails,
  mappings,
  skippedRowsOpen,
  onSkippedRowsOpenChange,
}: PreviewStepProps) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
        <div>
          <p className="font-medium">{validRows.length} buyers will be imported</p>
          {skippedRows.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {skippedRows.length} rows will be skipped
            </p>
          )}
        </div>
        {hasWebsiteMapping(mappings) && (
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3 w-3" />
            Will auto-enrich
          </Badge>
        )}
      </div>

      {/* Skipped rows warning */}
      {skippedRows.length > 0 && (
        <Collapsible open={skippedRowsOpen} onOpenChange={onSkippedRowsOpenChange}>
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-amber-700 dark:text-amber-400">
                {skippedRows.length} rows will be skipped
              </p>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-0 text-amber-600">
                  {skippedRowsOpen ? (
                    <ChevronDown className="h-3 w-3 mr-1" />
                  ) : (
                    <ChevronRight className="h-3 w-3 mr-1" />
                  )}
                  {skippedRowsOpen ? 'Hide details' : 'Show details'}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
          <CollapsibleContent>
            <div className="border rounded-lg overflow-hidden mt-2 max-h-32 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Row</TableHead>
                    <TableHead className="text-xs">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skippedRowDetails.map((item) => (
                    <TableRow key={item.index}>
                      <TableCell className="text-xs">{item.companyName}</TableCell>
                      <TableCell className="text-xs text-amber-600">
                        {item.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Preview table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="max-h-[250px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {mappings
                  .filter((m) => m.targetField)
                  .slice(0, 5)
                  .map((m) => (
                    <TableHead key={m.csvColumn} className="text-xs whitespace-nowrap">
                      {TARGET_FIELDS.find((f) => f.value === m.targetField)?.label ||
                        m.targetField}
                    </TableHead>
                  ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {validRows.slice(0, 5).map(({ index: rowIndex, row }) => (
                <TableRow key={rowIndex}>
                  {mappings
                    .filter((m) => m.targetField)
                    .slice(0, 5)
                    .map((m) => (
                      <TableCell
                        key={m.csvColumn}
                        className="text-xs truncate max-w-[150px]"
                      >
                        {row[m.csvColumn] || '\u2014'}
                      </TableCell>
                    ))}
                </TableRow>
              ))}
              {validRows.length > 5 && (
                <TableRow>
                  <TableCell
                    colSpan={Math.min(5, mappings.filter((m) => m.targetField).length)}
                    className="text-center text-xs text-muted-foreground"
                  >
                    ...and {validRows.length - 5} more
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dedupe sub-step
// ---------------------------------------------------------------------------

interface DedupeStepProps {
  duplicates: DuplicateWarning[];
  skipDuplicates: Set<number>;
  validRowCount: number;
  onToggleSkip: (index: number) => void;
}

export function DedupeStep({
  duplicates,
  skipDuplicates,
  validRowCount,
  onToggleSkip,
}: DedupeStepProps) {
  const linkCount = duplicates.filter((d) => !skipDuplicates.has(d.index)).length;
  const newCount = validRowCount - duplicates.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-blue-500/10 rounded-lg text-blue-700 dark:text-blue-400 text-sm">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>
          Found {duplicates.length} buyer(s) already in the system. They will be added
          to this universe. Deselect any you don&apos;t want to include.
        </span>
      </div>

      <div className="max-h-[300px] overflow-y-auto space-y-2">
        {duplicates.map((dup) => (
          <div
            key={dup.index}
            className={`p-3 border rounded-lg ${skipDuplicates.has(dup.index) ? 'bg-muted/50 opacity-60' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{dup.companyName}</p>
                <p className="text-xs text-muted-foreground">
                  Existing match: {dup.potentialDuplicates.map((d) => d.companyName).filter(Boolean).join(', ') || 'domain match'}
                </p>
              </div>
              <Button
                variant={skipDuplicates.has(dup.index) ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => onToggleSkip(dup.index)}
              >
                {skipDuplicates.has(dup.index) ? 'Excluded' : 'Exclude'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {linkCount > 0 && <>{linkCount} existing buyer(s) will be linked. </>}
        {newCount > 0 && <>{newCount} new buyer(s) will be imported. </>}
        {skipDuplicates.size > 0 && <>{skipDuplicates.size} excluded.</>}
      </p>
    </div>
  );
}
