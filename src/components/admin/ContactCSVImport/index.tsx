/**
 * ContactCSVImport — Wizard for bulk importing contacts from CSV/XLS/XLSX.
 *
 * Steps: Upload → Map Columns → Preview → Import
 *
 * Uses contacts_upsert RPC for identity resolution and dedup. Supports
 * structured phone fields (mobile_phone_1/2/3, office_phone).
 *
 * Can be launched from:
 * - Buyer Contacts page header
 * - Contact List pages ("Import to List")
 * - Buyer detail pages (pre-sets remarketing_buyer_id)
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { SPREADSHEET_ACCEPT } from '@/lib/parseSpreadsheet';

import type { ContactCSVImportProps } from './helpers';
import { TARGET_FIELDS, hasRequiredMapping } from './helpers';
import { useContactImport } from './useContactImport';

export const ContactCSVImport = ({
  buyerId,
  onComplete,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: ContactCSVImportProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = (value: boolean) => {
    if (isControlled && onOpenChange) onOpenChange(value);
    else setInternalOpen(value);
  };

  const {
    step,
    setStep,
    csvData,
    mappings,
    isAnalyzing,
    importProgress,
    importResults,
    skippedRowsOpen,
    setSkippedRowsOpen,
    isComplete,
    validRows,
    skippedRows,
    handleFileUpload,
    updateMapping,
    proceedToPreview,
    handleImport,
    resetImport,
  } = useContactImport({ buyerId, onComplete });

  return (
    <>
      {!hideTrigger && (
        <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Import Contacts
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
              Import Contacts from Spreadsheet
            </DialogTitle>
            <DialogDescription>
              Upload a CSV, XLS, or XLSX file to bulk import contacts with phone numbers.
              Existing contacts are matched by email or LinkedIn URL.
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
                    <p className="text-xs text-muted-foreground">CSV, XLS, or XLSX files (max 5 MB, 5,000 rows)</p>
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

            {/* Step 2: Column Mapping */}
            {step === 'mapping' && (
              <div className="space-y-4 py-4">
                {isAnalyzing ? (
                  <div className="flex flex-col items-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">Analyzing columns...</p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Map your spreadsheet columns to contact fields. Name + (Email or LinkedIn) are required.
                    </p>
                    <div className="space-y-2">
                      {mappings.map((mapping) => (
                        <div key={mapping.csvColumn} className="flex items-center gap-3">
                          <span className="text-sm font-medium w-48 truncate" title={mapping.csvColumn}>
                            {mapping.csvColumn}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <Select
                            value={mapping.targetField || '_skip'}
                            onValueChange={(v) => updateMapping(mapping.csvColumn, v === '_skip' ? null : v)}
                          >
                            <SelectTrigger className="w-64">
                              <SelectValue placeholder="Skip column" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_skip">-- Skip --</SelectItem>
                              {TARGET_FIELDS.map((f) => (
                                <SelectItem key={f.value} value={f.value}>
                                  {f.label} {f.required && '*'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {mapping.aiSuggested && (
                            <Badge variant="secondary" className="text-[10px]">AI</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Step 3: Preview */}
            {step === 'preview' && (
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-4">
                  <Badge variant="default" className="text-sm">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    {validRows.length} valid contacts
                  </Badge>
                  {skippedRows.length > 0 && (
                    <Badge variant="destructive" className="text-sm">
                      <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                      {skippedRows.length} skipped
                    </Badge>
                  )}
                </div>

                {skippedRows.length > 0 && (
                  <Collapsible open={skippedRowsOpen} onOpenChange={setSkippedRowsOpen}>
                    <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                      <ChevronDown className={`h-4 w-4 transition-transform ${skippedRowsOpen ? '' : '-rotate-90'}`} />
                      Show skipped rows
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Row</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {skippedRows.map((s) => (
                            <TableRow key={s.index}>
                              <TableCell>{s.index + 1}</TableCell>
                              <TableCell>{s.name}</TableCell>
                              <TableCell className="text-muted-foreground">{s.reason}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Preview table */}
                {validRows.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {mappings
                            .filter((m) => m.targetField)
                            .slice(0, 6)
                            .map((m) => (
                              <TableHead key={m.csvColumn}>
                                {TARGET_FIELDS.find((f) => f.value === m.targetField)?.label || m.targetField}
                              </TableHead>
                            ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {validRows.slice(0, 5).map((row, i) => (
                          <TableRow key={i}>
                            {mappings
                              .filter((m) => m.targetField)
                              .slice(0, 6)
                              .map((m) => (
                                <TableCell key={m.csvColumn} className="text-sm truncate max-w-[200px]">
                                  {row[m.csvColumn] || '--'}
                                </TableCell>
                              ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {validRows.length > 5 && (
                      <div className="text-xs text-muted-foreground text-center py-2 border-t">
                        + {validRows.length - 5} more rows
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Import progress */}
            {step === 'importing' && (
              <div className="space-y-6 py-8">
                {!isComplete ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-sm">Importing contacts...</span>
                    </div>
                    <Progress value={importProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-center">
                      {Math.round(importProgress)}% complete
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                    <h3 className="text-lg font-semibold">Import Complete</h3>
                    <div className="flex items-center justify-center gap-6 text-sm">
                      <span><strong>{importResults.created}</strong> created</span>
                      {importResults.errors > 0 && (
                        <span className="text-destructive"><strong>{importResults.errors}</strong> errors</span>
                      )}
                      {importResults.skipped > 0 && (
                        <span className="text-muted-foreground"><strong>{importResults.skipped}</strong> skipped</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="border-t pt-4">
            {step === 'mapping' && !isAnalyzing && (
              <>
                <Button variant="outline" onClick={resetImport}>Back</Button>
                <Button onClick={proceedToPreview} disabled={!hasRequiredMapping(mappings)}>
                  Preview Import
                </Button>
              </>
            )}
            {step === 'preview' && (
              <>
                <Button variant="outline" onClick={() => setStep('mapping')}>Back</Button>
                <Button onClick={handleImport} disabled={validRows.length === 0}>
                  Import {validRows.length} Contacts
                </Button>
              </>
            )}
            {step === 'importing' && isComplete && (
              <Button onClick={() => { setIsOpen(false); resetImport(); }}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ContactCSVImport;
