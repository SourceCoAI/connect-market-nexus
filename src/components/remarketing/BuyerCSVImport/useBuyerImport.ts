/**
 * useBuyerImport.ts
 *
 * Custom hook encapsulating all state management for the Buyer CSV Import
 * wizard: file parsing, AI column mapping, validation, duplicate checking,
 * and row-by-row / batch import via Supabase.
 */
import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { parseSpreadsheet } from '@/lib/parseSpreadsheet';
import { toast } from 'sonner';

import {
  CSVRow,
  ColumnMapping,
  DuplicateWarning,
  WizardStep,
  MAX_FILE_SIZE_BYTES,
  MAX_ROW_COUNT,
  guessMapping,
  buildBuyerFromRow,
  extractContactFromRow,
  hasRequiredMapping,
  hasContactMapping,
  computeRowValidation,
} from './helpers';

export interface UseBuyerImportOptions {
  universeId?: string;
  onComplete?: () => void;
}

export function useBuyerImport({ universeId, onComplete }: UseBuyerImportOptions) {
  const [step, setStep] = useState<WizardStep>('upload');
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{
    success: number;
    errors: number;
    skipped: number;
    linked: number;
  }>({
    success: 0,
    errors: 0,
    skipped: 0,
    linked: 0,
  });
  const [duplicates, setDuplicates] = useState<DuplicateWarning[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState<Set<number>>(new Set());
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [skippedRowsOpen, setSkippedRowsOpen] = useState(false);

  const queryClient = useQueryClient();

  // -----------------------------------------------------------------------
  // Derived: row validation
  // -----------------------------------------------------------------------
  const { validRows, skippedRows, skippedRowDetails } = useMemo(
    () => computeRowValidation(csvData, mappings),
    [csvData, mappings],
  );

  // -----------------------------------------------------------------------
  // AI column analysis
  // -----------------------------------------------------------------------
  const analyzeColumnsWithAI = useCallback(async (headers: string[], sampleRows: CSVRow[]) => {
    setIsAnalyzing(true);

    try {
      const { data, error } = await supabase.functions.invoke('map-csv-columns', {
        body: {
          columns: headers,
          targetType: 'buyer',
          sampleData: sampleRows,
        },
      });

      if (error) {
        // AI mapping error -- falling back to heuristic mapping
        setMappings(
          headers.map((col) => ({
            csvColumn: col,
            targetField: guessMapping(col),
            confidence: 0.5,
            aiSuggested: false,
          })),
        );
      } else {
        setMappings(
          data.mappings ||
            headers.map((col) => ({
              csvColumn: col,
              targetField: guessMapping(col),
              confidence: 0.5,
              aiSuggested: false,
            })),
        );
      }
    } catch (err) {
      // Column analysis error -- falling back to heuristic mapping
      setMappings(
        headers.map((col) => ({
          csvColumn: col,
          targetField: guessMapping(col),
          confidence: 0.5,
          aiSuggested: false,
        })),
      );
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // -----------------------------------------------------------------------
  // File upload handler
  // -----------------------------------------------------------------------
  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Check file size before processing
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error(
          `File too large. Maximum size is 5MB, but file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
        );
        event.target.value = '';
        return;
      }

      try {
        const { data, columns: headers } = await parseSpreadsheet(file, (h) =>
          h.replace(/^\ufeff/, '').trim(),
        );

        if (data.length === 0) {
          toast.error('File is empty');
          return;
        }

        if (data.length > MAX_ROW_COUNT) {
          toast.error(
            `File has ${data.length.toLocaleString()} rows, which exceeds the ${MAX_ROW_COUNT.toLocaleString()} row limit. Please split the file into smaller batches.`,
          );
          return;
        }

        setCsvData(data as CSVRow[]);
        setStep('mapping');

        // Analyze columns with AI
        await analyzeColumnsWithAI(headers, data.slice(0, 3));
      } catch (error) {
        toast.error(`Failed to parse file: ${(error as Error).message}`);
      }
    },
    [analyzeColumnsWithAI],
  );

  // -----------------------------------------------------------------------
  // Mapping helpers
  // -----------------------------------------------------------------------
  const updateMapping = (csvColumn: string, targetField: string | null) => {
    setMappings((prev) =>
      prev.map((m) => (m.csvColumn === csvColumn ? { ...m, targetField, aiSuggested: false } : m)),
    );
  };

  const proceedToPreview = () => {
    if (!hasRequiredMapping(mappings)) {
      toast.error('Both a Company Name and a Website column must be mapped before importing.');
      return;
    }
    setStep('preview');
  };

  // -----------------------------------------------------------------------
  // Duplicate checking
  // -----------------------------------------------------------------------
  const toggleSkipDuplicate = (index: number) => {
    setSkipDuplicates((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // -----------------------------------------------------------------------
  // Import
  // -----------------------------------------------------------------------
  const handleImport = useCallback(async () => {
    if (!hasRequiredMapping(mappings)) {
      toast.error('Both a Company Name and a Website column must be mapped before importing.');
      return;
    }

    setStep('importing');
    setImportProgress(0);
    setImportResults({ success: 0, errors: 0, skipped: 0, linked: 0 });

    try {
      // Build a map from row index → existing buyer ID for duplicates that should be linked
      const existingBuyerMap = new Map<number, string>();
      for (const dup of duplicates) {
        if (!skipDuplicates.has(dup.index) && dup.potentialDuplicates.length > 0) {
          existingBuyerMap.set(dup.index, dup.potentialDuplicates[0].id);
        }
      }

      // Filter out skipped duplicates
      const dataToImport = validRows.filter(({ index }) => !skipDuplicates.has(index));
      const wantContacts = hasContactMapping(mappings);

      // Build the batch payload for the edge function
      const payload = dataToImport.map(({ index: rowIndex, row }) => {
        const existingBuyerId = existingBuyerMap.get(rowIndex) || null;
        const buyer = buildBuyerFromRow(row, mappings, universeId);
        const contact = wantContacts ? extractContactFromRow(row, mappings) : null;
        return { buyer, contact, existingBuyerId };
      });

      setImportProgress(10);

      // Send to edge function (uses service role to bypass RLS)
      const { data, error } = await supabase.functions.invoke('import-buyers', {
        body: { buyers: payload, universeId },
      });

      if (error) {
        console.error('import-buyers edge function error:', error);
        toast.error('Import failed. Please try again.');
        setImportResults({ success: 0, errors: dataToImport.length, skipped: 0, linked: 0 });
        setImportProgress(100);
        onComplete?.();
        return;
      }

      const { success = 0, errors: errorCount = 0, skipped = 0, linked = 0, contactsCreated = 0 } = data || {};

      setImportProgress(100);
      setImportResults({ success, errors: errorCount, skipped, linked });

      if (success > 0 || linked > 0) {
        queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyers'] });
        const parts: string[] = [];
        if (success > 0) {
          const contactMsg = contactsCreated > 0 ? ` with ${contactsCreated} contacts` : '';
          parts.push(`Imported ${success} new buyer${success !== 1 ? 's' : ''}${contactMsg}`);
        }
        if (linked > 0) {
          parts.push(`Linked ${linked} existing buyer${linked !== 1 ? 's' : ''} to universe`);
        }
        toast.success(parts.join('. '));
      }

      if (skipped > 0) {
        toast.info(`${skipped} duplicate buyer(s) skipped`);
      }

      if (errorCount > 0) {
        toast.error(`Failed to import ${errorCount} buyers`);
      }

      onComplete?.();
    } catch (err) {
      console.error('import-buyers exception:', err);
      toast.error('Import failed. Please try again.');
      setStep('preview');
    }
  }, [mappings, validRows, skipDuplicates, duplicates, universeId, queryClient, onComplete]);

  // -----------------------------------------------------------------------
  // Dedupe check (calls handleImport internally if no dupes found)
  // -----------------------------------------------------------------------
  const checkForDuplicates = useCallback(async () => {
    if (!hasRequiredMapping(mappings)) {
      toast.error('Both a Company Name and a Website column must be mapped before importing.');
      return;
    }

    setIsCheckingDuplicates(true);

    try {
      const buyersToCheck = validRows
        .map(({ index, row }) => {
          const buyer = buildBuyerFromRow(row, mappings, universeId);
          return {
            index,
            company_name: (buyer.company_name as string) || '',
            company_website:
              (buyer.company_website as string) ||
              (buyer.platform_website as string) ||
              (buyer.pe_firm_website as string) ||
              null,
          };
        })
        .filter((b) => b.company_name);

      const { data, error } = await supabase.functions.invoke('dedupe-buyers', {
        body: { buyers: buyersToCheck },
      });

      if (error) {
        // Dedupe check failed — surface the error rather than silently importing.
        // Importing without a dedup check risks creating duplicate buyers.
        toast.error('Could not check for duplicate buyers. Please try again before importing.');
        return;
      }

      const foundDuplicates = (data?.results || [])
        .filter((r: { isDuplicate: boolean }) => r.isDuplicate)
        .map(
          (r: {
            index: number;
            companyName: string;
            potentialDuplicates: Array<{
              existingId: string;
              existingName: string;
              matchType: string;
              confidence: number;
            }>;
          }) => ({
            index: r.index,
            companyName: r.companyName,
            potentialDuplicates: r.potentialDuplicates
              .filter((d) => d.matchType !== 'no_website')
              .map((d) => ({
                id: d.existingId,
                companyName: d.existingName,
                confidence: d.confidence,
                matchType: d.matchType as 'domain' | 'name',
              })),
          }),
        )
        .filter((dup: DuplicateWarning) => dup.potentialDuplicates.length > 0);

      if (foundDuplicates.length > 0) {
        setDuplicates(foundDuplicates);
        setStep('dedupe');
      } else {
        await handleImport();
      }
    } catch (err) {
      console.error('dedupe-buyers exception:', err);
      toast.error(
        'An error occurred while checking for duplicates. Please try again before importing.',
      );
      setStep('preview');
    } finally {
      setIsCheckingDuplicates(false);
    }
  }, [mappings, validRows, universeId, handleImport]);

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------
  const resetImport = () => {
    setStep('upload');
    setCsvData([]);
    setMappings([]);
    setImportProgress(0);
    setImportResults({ success: 0, errors: 0, skipped: 0, linked: 0 });
    setDuplicates([]);
    setSkipDuplicates(new Set());
    setSkippedRowsOpen(false);
  };

  const isComplete = step === 'importing' && importProgress >= 100;

  return {
    // State
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

    // Derived
    validRows,
    skippedRows,
    skippedRowDetails,

    // Actions
    handleFileUpload,
    updateMapping,
    proceedToPreview,
    toggleSkipDuplicate,
    handleImport,
    checkForDuplicates,
    resetImport,
  };
}
