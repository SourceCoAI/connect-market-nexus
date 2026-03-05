/**
 * BuyerCSVImport/index.tsx
 *
 * Main dialog component for the Buyer CSV Import wizard. Renders the dialog
 * shell, step indicator, upload area (step 1), and footer navigation. Steps
 * 2-4 are delegated to dedicated sub-components.
 *
 * Re-exports the same named + default export as the original monolith so that
 * barrel-file imports (`from './BuyerCSVImport'`) continue to resolve.
 *
 * Data sources:
 *   File upload parsed by parseSpreadsheet utility; writes to buyers
 *   table via Supabase client
 *
 * Used on:
 *   ReMarketing buyers page and universe detail page
 *   (/admin/remarketing/buyers, /admin/remarketing/universes/:id)
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Upload, FileSpreadsheet, Loader2, ChevronRight } from 'lucide-react';
import { SPREADSHEET_ACCEPT } from '@/lib/parseSpreadsheet';

import type { BuyerCSVImportProps } from './helpers';
import { hasRequiredMapping } from './helpers';
import { useBuyerImport } from './useBuyerImport';
import { ColumnMappingStep } from './ColumnMappingStep';
import { PreviewStep, DedupeStep } from './ValidationStep';
import { ImportProgressStep } from './ImportProgressStep';

export const BuyerCSVImport = ({
  universeId,
  onComplete,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: BuyerCSVImportProps) => {
  const [internalOpen, setInternalOpen] = useState(false);

  // Use controlled or uncontrolled mode
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = (value: boolean) => {
    if (isControlled && onOpenChange) {
      onOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };

  const {
    step,
    setStep,
    csvData,
    mappings,
    isAnalyzing,
    importProgress,
    importResults,
    duplicates,
    skipDuplicates,
    isCheckingDuplicates,
    skippedRowsOpen,
    setSkippedRowsOpen,
    isComplete,
    validRows,
    skippedRows,
    skippedRowDetails,
    handleFileUpload,
    updateMapping,
    proceedToPreview,
    toggleSkipDuplicate,
    handleImport,
    checkForDuplicates,
    resetImport,
  } = useBuyerImport({ universeId, onComplete });

  return (
    <>
      {!hideTrigger && (
        <Button variant="outline" onClick={() => setIsOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Import CSV
        </Button>
      )}

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) resetImport();
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import Buyers from CSV
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file to bulk import buyers. AI will help map your columns.
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs">
            <Badge variant={step === 'upload' ? 'default' : 'outline'}>1. Upload</Badge>
            <ChevronRight className="h-3 w-3" />
            <Badge variant={step === 'mapping' ? 'default' : 'outline'}>2. Map Columns</Badge>
            <ChevronRight className="h-3 w-3" />
            <Badge variant={step === 'preview' ? 'default' : 'outline'}>3. Preview</Badge>
            <ChevronRight className="h-3 w-3" />
            <Badge variant={step === 'importing' ? 'default' : 'outline'}>4. Import</Badge>
          </div>

          <ScrollArea className="flex-1 min-h-0 pr-4">
            {/* Step 1: Upload */}
            {step === 'upload' && (
              <div className="py-8">
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="h-10 w-10 text-muted-foreground mb-4" />
                    <p className="mb-2 text-sm text-muted-foreground">
                      <span className="font-semibold">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-muted-foreground">CSV, XLS, or XLSX files</p>
                  </div>
                  <input
                    type="file"
                    accept={SPREADSHEET_ACCEPT}
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
            )}

            {/* Step 2: Column mapping */}
            {step === 'mapping' && (
              <ColumnMappingStep
                mappings={mappings}
                csvData={csvData}
                isAnalyzing={isAnalyzing}
                onUpdateMapping={updateMapping}
              />
            )}

            {/* Step 3a: Preview */}
            {step === 'preview' && (
              <PreviewStep
                validRows={validRows}
                skippedRows={skippedRows}
                skippedRowDetails={skippedRowDetails}
                mappings={mappings}
                skippedRowsOpen={skippedRowsOpen}
                onSkippedRowsOpenChange={setSkippedRowsOpen}
              />
            )}

            {/* Step 3b: Dedupe */}
            {step === 'dedupe' && (
              <DedupeStep
                duplicates={duplicates}
                skipDuplicates={skipDuplicates}
                validRowCount={validRows.length}
                onToggleSkip={toggleSkipDuplicate}
              />
            )}

            {/* Step 4: Import progress */}
            {step === 'importing' && (
              <ImportProgressStep
                importProgress={importProgress}
                isComplete={isComplete}
                importResults={importResults}
              />
            )}
          </ScrollArea>

          <DialogFooter className="border-t pt-4">
            {step === 'mapping' && !isAnalyzing && (
              <>
                <Button variant="outline" onClick={resetImport}>
                  Back
                </Button>
                <Button onClick={proceedToPreview} disabled={!hasRequiredMapping(mappings)}>
                  Preview Import
                </Button>
              </>
            )}
            {step === 'preview' && (
              <>
                <Button variant="outline" onClick={() => setStep('mapping')}>
                  Back
                </Button>
                <Button
                  onClick={checkForDuplicates}
                  disabled={isCheckingDuplicates || validRows.length === 0}
                >
                  {isCheckingDuplicates ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    `Import ${validRows.length} Buyers`
                  )}
                </Button>
              </>
            )}
            {step === 'dedupe' && (
              <>
                <Button variant="outline" onClick={() => setStep('preview')}>
                  Back
                </Button>
                <Button onClick={handleImport}>
                  Continue Import ({validRows.length - skipDuplicates.size} buyers)
                </Button>
              </>
            )}

            {step === 'importing' && isComplete && (
              <Button
                onClick={() => {
                  setIsOpen(false);
                  resetImport();
                }}
              >
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BuyerCSVImport;
