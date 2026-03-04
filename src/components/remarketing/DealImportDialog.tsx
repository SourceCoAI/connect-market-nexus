/**
 * DealImportDialog.tsx
 *
 * Multi-step dialog for importing deals from spreadsheets (CSV/XLS/XLSX).
 * Orchestrates upload, AI column mapping, preview, and import steps.
 * Heavy logic is delegated to:
 *   - DealImportMapping   -- column mapping UI
 *   - DealImportPreview   -- data preview UI
 *   - useDealImportSubmit  -- import/merge logic
 */
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  Check,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { parseSpreadsheet, SPREADSHEET_ACCEPT } from "@/lib/parseSpreadsheet";
import {
  type ColumnMapping,
  type MergeStats,
  normalizeHeader,
  mergeColumnMappings,
} from "@/lib/deal-csv-import";
import { DealImportMapping } from "./deal-import/DealImportMapping";
import { DealImportPreview } from "./deal-import/DealImportPreview";
import { handleImport, type ImportResults } from "./deal-import/useDealImportSubmit";

interface DealImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
  onImportCompleteWithIds?: (importedIds: string[]) => void;
  referralPartnerId?: string;
  /** Optional deal_source value injected into every imported listing (e.g. "gp_partners") */
  dealSource?: string;
  /** If true, sets pushed_to_all_deals=false on imported listings */
  hideFromAllDeals?: boolean;
}

type ImportStep = "upload" | "mapping" | "preview" | "importing" | "complete";

export function DealImportDialog({
  open,
  onOpenChange,
  onImportComplete,
  onImportCompleteWithIds,
  referralPartnerId,
  dealSource,
  hideFromAllDeals,
}: DealImportDialogProps) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [mappingStats, setMappingStats] = useState<MergeStats | null>(null);
  const [isMapping, setIsMapping] = useState(false);
  const [mappingVersion, setMappingVersion] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<ImportResults | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [columnFilter, setColumnFilter] = useState("");

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);

    try {
      const { data, columns } = await parseSpreadsheet(uploadedFile, normalizeHeader);
      setCsvData(data);

      if (columns.length === 0) {
        toast.error('Could not detect headers', {
          description: 'Please verify the file has a header row and is a valid CSV, XLS, or XLSX file.'
        });
        reset();
        return;
      }

      const sampleData = data.slice(0, 3);

      setIsMapping(true);
      setStep("mapping");

      try {
        const { data: mappingResult, error } = await supabase.functions.invoke(
          "map-csv-columns",
          {
            body: {
              columns,
              targetType: "deal",
              sampleData
            },
          }
        );

        if (error) throw error;

        setMappingVersion(mappingResult?._version ?? null);

        const [merged, stats] = mergeColumnMappings(columns, mappingResult?.mappings);
        setColumnMappings(merged);
        setMappingStats(stats);
      } catch (error) {
        const [merged, stats] = mergeColumnMappings(columns, []);
        setColumnMappings(merged);
        setMappingStats(stats);
      } finally {
        setIsMapping(false);
      }
    } catch (error) {
      toast.error(`Failed to parse file: ${(error as Error).message}`);
    }
  }, []);

  const updateMapping = (csvColumn: string, targetField: string | null) => {
    setColumnMappings((prev) =>
      prev.map((m) =>
        m.csvColumn === csvColumn
          ? { ...m, targetField, aiSuggested: false }
          : m
      )
    );
  };

  const doImport = async () => {
    setStep("importing");
    setIsImporting(true);
    setImportProgress(0);

    try {
      const results = await handleImport({
        csvData,
        columnMappings,
        referralPartnerId,
        dealSource,
        hideFromAllDeals,
        onProgress: setImportProgress,
      });

      setImportResults(results);
      setStep("complete");
    } catch (error) {
      toast.error(`Import failed: ${(error as Error).message}`);
      setStep("preview");
    } finally {
      setIsImporting(false);
    }
  };

  const reset = () => {
    setStep("upload");
    setFile(null);
    setCsvData([]);
    setColumnMappings([]);
    setMappingStats(null);
    setImportProgress(0);
    setImportResults(null);
  };

  const handleClose = () => {
    // If closing after a successful import, notify the parent so it can
    // invalidate queries and refresh the deals list.
    if (step === "complete" && importResults && (importResults.imported > 0 || importResults.merged > 0)) {
      onImportComplete();
      if (onImportCompleteWithIds && importResults.importedIds.length > 0) {
        onImportCompleteWithIds(importResults.importedIds);
      }
    }
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl h-[85vh] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Deals from Spreadsheet
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload a CSV, XLS, or XLSX file with your deal data"}
            {step === "mapping" && "Review and confirm column mappings"}
            {step === "preview" && "Preview the data before importing"}
            {step === "importing" && "Importing deals..."}
            {step === "complete" && "Import complete"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Step: Upload */}
          {step === "upload" && (
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              <div className="border-2 border-dashed rounded-lg p-12 text-center w-full max-w-md">
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">Upload Spreadsheet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  CSV, XLS, or XLSX -- AI will automatically map your columns
                </p>
                <Label htmlFor="csv-upload" className="cursor-pointer">
                  <Input
                    id="csv-upload"
                    type="file"
                    accept={SPREADSHEET_ACCEPT}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button asChild>
                    <span>
                      <Upload className="h-4 w-4 mr-2" />
                      Select File
                    </span>
                  </Button>
                </Label>
              </div>
            </div>
          )}

          {/* Step: Column Mapping */}
          {step === "mapping" && (
            isMapping ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <Sparkles className="h-8 w-8 mb-4 text-primary animate-pulse" />
                <p className="font-medium">AI is analyzing your columns...</p>
                <p className="text-sm text-muted-foreground">This will just take a moment</p>
              </div>
            ) : (
              <DealImportMapping
                csvData={csvData}
                columnMappings={columnMappings}
                mappingStats={mappingStats}
                mappingVersion={mappingVersion}
                columnFilter={columnFilter}
                onColumnFilterChange={setColumnFilter}
                onUpdateMapping={updateMapping}
                onBack={reset}
                onNext={() => setStep("preview")}
              />
            )
          )}

          {/* Step: Preview */}
          {step === "preview" && (
            <DealImportPreview
              csvData={csvData}
              columnMappings={columnMappings}
              onBack={() => setStep("mapping")}
              onImport={doImport}
            />
          )}

          {/* Step: Importing */}
          {step === "importing" && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 mb-4 text-primary animate-spin" />
              <p className="font-medium">Importing deals...</p>
              <div className="w-full max-w-xs mt-4">
                <Progress value={importProgress} />
                <p className="text-sm text-muted-foreground text-center mt-2">
                  {importProgress}% complete
                </p>
              </div>
            </div>
          )}

          {/* Step: Complete */}
          {step === "complete" && importResults && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="text-center">
                <div className="mb-4">
                  {(importResults.imported > 0 || importResults.merged > 0) ? (
                    <Check className="h-12 w-12 mx-auto text-primary" />
                  ) : (
                    <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground" />
                  )}
                </div>
                <p className="font-medium text-lg">
                  {importResults.imported > 0 || importResults.merged > 0
                    ? (() => {
                        const parts: string[] = [];
                        if (importResults.imported > 0) parts.push(`${importResults.imported} new deal${importResults.imported !== 1 ? 's' : ''} imported`);
                        if (importResults.merged > 0) parts.push(`${importResults.merged} existing deal${importResults.merged !== 1 ? 's' : ''} updated`);
                        return parts.join(', ');
                      })()
                    : "No deals were imported"}
                </p>
                {importResults.merged > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Empty fields on existing deals were filled with new data from the CSV
                  </p>
                )}
                {importResults.errors.length > 0 && (() => {
                  const duplicateErrors = importResults.errors.filter(e =>
                    e.includes('duplicate key') || e.includes('unique constraint') || e.includes('idx_listings_unique')
                  );
                  const otherErrors = importResults.errors.filter(e =>
                    !e.includes('duplicate key') && !e.includes('unique constraint') && !e.includes('idx_listings_unique')
                  );

                  return (
                    <div className="mt-4 text-left max-w-md space-y-3">
                      {duplicateErrors.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
                            {duplicateErrors.length} already existed
                          </p>
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            These deals were skipped because they already exist in the system (matched by website URL or name).
                          </p>
                        </div>
                      )}
                      {otherErrors.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-destructive mb-2">
                            {otherErrors.length} failed to import:
                          </p>
                          <ScrollArea className="h-32 border rounded p-2">
                            {otherErrors.slice(0, 10).map((err) => (
                              <p key={err} className="text-xs text-muted-foreground">
                                {err}
                              </p>
                            ))}
                            {otherErrors.length > 10 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                ...and {otherErrors.length - 10} more
                              </p>
                            )}
                          </ScrollArea>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          {step === "complete" ? (
            <Button onClick={handleClose}>
              Close
            </Button>
          ) : (
            <Button variant="ghost" onClick={handleClose} disabled={isImporting}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
