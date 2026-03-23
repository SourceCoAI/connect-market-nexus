import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle, Globe, FileText, Zap, MessageSquare } from "lucide-react";

export interface SingleDealEnrichmentResult {
  success: boolean;
  message?: string;
  fieldsUpdated?: string[];
  rejectedFields?: string[];
  rejectedFieldCount?: number;
  error?: string;
  extracted?: Record<string, unknown>;
  scrapeReport?: {
    totalPagesAttempted: number;
    successfulPages: number;
    totalCharactersScraped: number;
    pages: Array<{ url: string; success: boolean; chars: number }>;
  };
  transcriptReport?: {
    totalTranscripts: number;
    processed: number; // Legacy: includes already-extracted transcripts
    processedThisRun?: number; // Newly extracted this run
    processable?: number; // Pending with sufficient text
    skipped?: number; // Too short (<100 chars)
    appliedFromExisting?: number; // Fields applied from already-extracted transcripts
    appliedFromExistingTranscripts?: number; // Count of transcripts that contributed fields
    errors: string[];
  };
  notesReport?: {
    status: 'analyzed' | 'skipped_empty' | 'skipped_timeout' | 'failed';
    fieldsUpdated: number;
    notesLength: number;
    error?: string;
  };
}

// Map database field names to human-readable labels
const FIELD_LABELS: Record<string, string> = {
  executive_summary: "Executive Summary",
  geographic_states: "Geographic States",
  industry: "Industry",
  services: "Services",
  service_mix: "Service Mix",
  customer_types: "Customer Types",
  address: "Address",
  address_city: "City",
  address_state: "State",
  street_address: "Street Address",
  founded_year: "Founded Year",
  revenue: "Revenue",
  ebitda: "EBITDA",
  full_time_employees: "Employees",
  website: "Website",
  location: "Location",
  company_name: "Company Name",
  internal_company_name: "Company Name",
  deal_summary: "Deal Summary",
  owner_goals: "Owner Goals",
  key_selling_points: "Key Selling Points",
  growth_opportunities: "Growth Opportunities",
  technology_systems: "Technology Systems",
  key_risks: "Key Risks",
  number_of_locations: "Number of Locations",
};

const getFieldLabel = (field: string): string => {
  return FIELD_LABELS[field] || field.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

interface SingleDealEnrichmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: SingleDealEnrichmentResult | null;
  onRetry?: () => void;
}

export const SingleDealEnrichmentDialog = ({
  open,
  onOpenChange,
  result,
  onRetry
}: SingleDealEnrichmentDialogProps) => {
  if (!result) return null;

  const isSuccess = result.success;
  const fieldsUpdated = result.fieldsUpdated || [];
  const scrapeReport = result.scrapeReport;
  const transcriptReport = result.transcriptReport;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isSuccess ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Enrichment Complete
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-600" />
                Enrichment Failed
              </>
            )}
          </DialogTitle>
          {result.message && (
            <DialogDescription>{result.message}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Success: Show fields updated */}
          {isSuccess && fieldsUpdated.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Zap className="h-4 w-4 text-primary" />
                Updated {fieldsUpdated.length} fields:
              </div>
              <ScrollArea className="max-h-[200px]">
                <div className="grid gap-1.5">
                  {fieldsUpdated.map((field) => (
                    <div key={field} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                      <span>{getFieldLabel(field)}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Success but no NEW website fields updated - show contextual message */}
          {isSuccess && fieldsUpdated.length === 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted text-muted-foreground text-sm">
              <FileText className="h-4 w-4" />
              {(transcriptReport?.appliedFromExisting ?? 0) > 0
                ? `No new website fields extracted. ${transcriptReport?.appliedFromExisting} fields from transcripts were verified.`
                : 'No new fields were extracted. The deal may already be up to date.'}
            </div>
          )}

          {/* Transcript Report - Show accurate breakdown */}
          {transcriptReport && transcriptReport.totalTranscripts > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-lg border text-sm">
                <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="space-y-1">
                  {/* Show already-extracted transcripts that contributed fields */}
                  {(transcriptReport.appliedFromExistingTranscripts ?? 0) > 0 && (
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        {transcriptReport.appliedFromExistingTranscripts} transcript{transcriptReport.appliedFromExistingTranscripts !== 1 ? 's' : ''} applied
                      </span>
                      {(transcriptReport.appliedFromExisting ?? 0) > 0 && (
                        <span className="text-muted-foreground">
                          ({transcriptReport.appliedFromExisting} fields)
                        </span>
                      )}
                    </div>
                  )}
                  
                  {/* Show newly processed this run */}
                  {(transcriptReport.processedThisRun ?? 0) > 0 && (
                    <div className="flex items-center gap-1">
                      <Zap className="h-3.5 w-3.5 text-primary" />
                      <span>
                        {transcriptReport.processedThisRun} new transcript{transcriptReport.processedThisRun !== 1 ? 's' : ''} extracted
                      </span>
                    </div>
                  )}
                  
                  {/* Show skipped transcripts */}
                  {(transcriptReport.skipped ?? 0) > 0 && (
                    <div className="text-muted-foreground text-xs">
                      {transcriptReport.skipped} skipped (insufficient content)
                    </div>
                  )}
                  
                  {/* Show total context */}
                  <div className="text-muted-foreground text-xs">
                    Total: {transcriptReport.totalTranscripts} transcript{transcriptReport.totalTranscripts !== 1 ? 's' : ''} on file
                  </div>
                  
                  {/* Show errors if any */}
                  {transcriptReport.errors.length > 0 && (
                    <div className="text-destructive text-xs">
                      {transcriptReport.errors.length} error{transcriptReport.errors.length !== 1 ? 's' : ''} occurred
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Notes Analysis Report */}
          {isSuccess && result.notesReport && (
            <div className="flex items-center gap-3 p-3 rounded-lg border text-sm">
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div>
                {result.notesReport.status === 'analyzed' && (
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    Notes analyzed — {result.notesReport.fieldsUpdated} field{result.notesReport.fieldsUpdated !== 1 ? 's' : ''} extracted
                  </span>
                )}
                {result.notesReport.status === 'skipped_empty' && (
                  <span className="text-muted-foreground">No general notes to analyze</span>
                )}
                {result.notesReport.status === 'skipped_timeout' && (
                  <span className="text-amber-600 dark:text-amber-400">
                    Notes analysis skipped — not enough time remaining. Use "Analyze Notes" button directly.
                  </span>
                )}
                {result.notesReport.status === 'failed' && (
                  <span className="text-destructive">
                    Notes analysis failed{result.notesReport.error ? `: ${result.notesReport.error}` : ''}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Rejected Fields (blocked by source priority) */}
          {isSuccess && (result.rejectedFieldCount ?? 0) > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-sm">
              <FileText className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <div>
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  {result.rejectedFieldCount} financial field{result.rejectedFieldCount !== 1 ? 's' : ''} skipped
                </span>
                <span className="text-amber-600 dark:text-amber-500 ml-1">
                  — financials must come from call transcripts
                </span>
              </div>
            </div>
          )}

          {/* Scrape Report */}
          {scrapeReport && (
            <div className="flex items-center gap-3 p-3 rounded-lg border text-sm">
              <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div>
                <span className="font-medium">
                  Scraped {scrapeReport.successfulPages} of {scrapeReport.totalPagesAttempted} pages
                </span>
                {scrapeReport.totalCharactersScraped > 0 && (
                  <span className="text-muted-foreground ml-1">
                    ({scrapeReport.totalCharactersScraped.toLocaleString()} chars)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {!isSuccess && result.error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
              <p className="text-sm text-red-700 dark:text-red-400">
                {result.error}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          {!isSuccess && onRetry && (
            <Button variant="outline" onClick={onRetry}>
              Retry
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SingleDealEnrichmentDialog;
