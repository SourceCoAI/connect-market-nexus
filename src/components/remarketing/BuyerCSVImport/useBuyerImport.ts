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
  const [_csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{ success: number; errors: number }>({
    success: 0,
    errors: 0,
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
        const { data, columns: headers } = await parseSpreadsheet(file);

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
        setCsvHeaders(headers);
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
      toast.error('Company Name mapping is required');
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
      toast.error('Company Name mapping is required');
      return;
    }

    setStep('importing');
    setImportProgress(0);
    setImportResults({ success: 0, errors: 0 });

    let success = 0;
    let errors = 0;
    let contactsCreated = 0;

    // Filter out skipped duplicates
    const dataToImport = validRows.filter(({ index }) => !skipDuplicates.has(index));
    const wantContacts = hasContactMapping(mappings);

    if (wantContacts) {
      // Single-insert mode: need buyer IDs to create linked contacts
      for (let i = 0; i < dataToImport.length; i++) {
        const { row } = dataToImport[i];
        const buyer = buildBuyerFromRow(row, mappings, universeId);
        if (!buyer.company_name) {
          errors += 1;
          continue;
        }

        const { data: inserted, error: buyerError } = await supabase
          .from('buyers')
          .insert(buyer as never)
          .select('id')
          .single();

        if (buyerError || !inserted) {
          console.warn('Failed to import buyer:', buyer.company_name, buyerError?.message);
          errors += 1;
        } else {
          success += 1;

          // Create contact if we have contact data
          const contact = extractContactFromRow(row, mappings);
          if (contact && inserted.id) {
            const { error: contactError } = await supabase
              .from('remarketing_buyer_contacts')
              .insert({
                buyer_id: inserted.id,
                name:
                  contact.name ||
                  `${contact.first_name || ''} ${contact.last_name || ''}`.trim() ||
                  'Unknown',
                email: contact.email || null,
                phone: contact.phone || null,
                role: contact.title || null,
                linkedin_url: contact.linkedin_url || null,
                is_primary: true,
              } as never);

            if (!contactError) contactsCreated++;
          }
        }

        setImportProgress(((i + 1) / dataToImport.length) * 100);
      }
    } else {
      // Batch mode: faster when no contact fields are mapped
      const batchSize = 10;
      for (let i = 0; i < dataToImport.length; i += batchSize) {
        const batch = dataToImport.slice(i, i + batchSize);
        const buyersToInsert = batch
          .map(({ row }) => buildBuyerFromRow(row, mappings, universeId))
          .filter((b): b is typeof b & { company_name: string } => !!b.company_name);

        if (buyersToInsert.length > 0) {
          const { error } = await supabase.from('buyers').insert(buyersToInsert as never);

          if (error) {
            for (const buyer of buyersToInsert) {
              const { error: singleError } = await supabase.from('buyers').insert(buyer as never);

              if (singleError) {
                console.warn('Failed to import buyer:', buyer.company_name, singleError.message);
                errors += 1;
              } else {
                success += 1;
              }
            }
          } else {
            success += buyersToInsert.length;
          }
        }

        setImportProgress(((i + batchSize) / dataToImport.length) * 100);
      }
    }

    setImportResults((prev) => ({ ...prev, success, errors }));

    if (success > 0) {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyers'] });
      const contactMsg = contactsCreated > 0 ? ` with ${contactsCreated} contacts` : '';
      toast.success(`Imported ${success} buyers${contactMsg}`);
    }

    if (errors > 0) {
      toast.error(`Failed to import ${errors} buyers`);
    }

    onComplete?.();
  }, [mappings, validRows, skipDuplicates, universeId, queryClient, onComplete]);

  // -----------------------------------------------------------------------
  // Dedupe check (calls handleImport internally if no dupes found)
  // -----------------------------------------------------------------------
  const checkForDuplicates = useCallback(async () => {
    if (!hasRequiredMapping(mappings)) {
      toast.error('Company Name mapping is required');
      return;
    }

    setIsCheckingDuplicates(true);

    try {
      const buyersToCheck = validRows
        .map(({ index, row }) => {
          const buyer = buildBuyerFromRow(row, mappings, universeId);
          return {
            index,
            companyName: buyer.company_name || '',
            website:
              buyer.platform_website || buyer.pe_firm_website || buyer.company_website || null,
          };
        })
        .filter((b) => b.companyName);

      const { data, error } = await supabase.functions.invoke('dedupe-buyers', {
        body: { buyers: buyersToCheck },
      });

      if (error) {
        // Dedupe check failed -- proceeding with import
        await handleImport();
        return;
      }

      const foundDuplicates = (data?.results || []).filter(
        (r: { isDuplicate: boolean }) => r.isDuplicate,
      );

      if (foundDuplicates.length > 0) {
        setDuplicates(foundDuplicates);
        setStep('dedupe');
      } else {
        await handleImport();
      }
    } catch (err) {
      // Dedupe error -- proceeding with import
      await handleImport();
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
    setCsvHeaders([]);
    setMappings([]);
    setImportProgress(0);
    setImportResults({ success: 0, errors: 0 });
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
