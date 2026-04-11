/**
 * useContactImport.ts
 *
 * State management hook for the Contact CSV Import wizard.
 * Handles file parsing, column mapping, validation, and row-by-row import
 * via the contacts_upsert RPC.
 */
import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { parseSpreadsheet } from '@/lib/parseSpreadsheet';
import { toast } from 'sonner';

import {
  CSVRow,
  ColumnMapping,
  SkippedRowDetail,
  WizardStep,
  MAX_FILE_SIZE_BYTES,
  MAX_ROW_COUNT,
  guessMapping,
  buildContactFromRow,
  computeRowValidation,
} from './helpers';

export interface UseContactImportOptions {
  buyerId?: string;
  onComplete?: () => void;
}

export function useContactImport({ buyerId, onComplete }: UseContactImportOptions) {
  const [step, setStep] = useState<WizardStep>('upload');
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState({
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  });
  const [skippedRowsOpen, setSkippedRowsOpen] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const queryClient = useQueryClient();

  // Row validation
  const { valid: validRows, skipped: skippedRows } = useMemo(
    () => (csvData.length > 0 && mappings.length > 0
      ? computeRowValidation(csvData, mappings)
      : { valid: [] as CSVRow[], skipped: [] as SkippedRowDetail[] }),
    [csvData, mappings],
  );

  // File upload handler
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error('File too large. Maximum size is 5 MB.');
        return;
      }

      try {
        const { data, columns } = await parseSpreadsheet(file);
        if (data.length === 0) {
          toast.error('File is empty or has no data rows.');
          return;
        }
        if (data.length > MAX_ROW_COUNT) {
          toast.error(`Too many rows (${data.length}). Maximum is ${MAX_ROW_COUNT}.`);
          return;
        }

        setCsvData(data as CSVRow[]);

        // AI mapping attempt, fall back to heuristic
        setIsAnalyzing(true);
        setStep('mapping');

        try {
          const { data: aiResult, error: aiError } = await supabase.functions.invoke(
            'map-csv-columns',
            { body: { columns, targetType: 'contact', sampleData: data.slice(0, 3) } },
          );

          if (!aiError && aiResult?.mappings?.length) {
            setMappings(aiResult.mappings);
          } else {
            setMappings(guessMapping(columns));
          }
        } catch {
          setMappings(guessMapping(columns));
        } finally {
          setIsAnalyzing(false);
        }
      } catch (err) {
        toast.error('Failed to parse file. Make sure it is a valid CSV, XLS, or XLSX.');
      }
    },
    [],
  );

  const updateMapping = useCallback((csvColumn: string, targetField: string | null) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.csvColumn === csvColumn ? { ...m, targetField, aiSuggested: false } : m,
      ),
    );
  }, []);

  const proceedToPreview = useCallback(() => setStep('preview'), []);

  // Import execution
  const handleImport = useCallback(async () => {
    setStep('importing');
    setImportProgress(0);
    setIsComplete(false);

    const results = { created: 0, updated: 0, skipped: 0, errors: 0 };
    const total = validRows.length;
    const BATCH_SIZE = 10;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (row) => {
          const contact = buildContactFromRow(row, mappings);
          if (!contact) {
            results.skipped++;
            return;
          }

          try {
            const { error } = await (supabase.rpc as any)('contacts_upsert', {
              p_identity: {
                email: contact.email || null,
                linkedin_url: contact.linkedin_url || null,
              },
              p_fields: {
                first_name: contact.first_name,
                last_name: contact.last_name,
                email: contact.email || null,
                linkedin_url: contact.linkedin_url || null,
                title: contact.title || null,
                mobile_phone_1: contact.mobile_phone_1 || null,
                mobile_phone_2: contact.mobile_phone_2 || null,
                mobile_phone_3: contact.mobile_phone_3 || null,
                office_phone: contact.office_phone || null,
                phone_source: contact.phone_source,
                contact_type: contact.contact_type,
                ...(buyerId ? { remarketing_buyer_id: buyerId } : {}),
              },
              p_source: 'csv_import',
            });

            if (error) {
              results.errors++;
            } else {
              results.created++;
            }
          } catch {
            results.errors++;
          }
        }),
      );

      setImportProgress(Math.min(((i + batch.length) / total) * 100, 100));
    }

    setImportResults(results);
    setIsComplete(true);

    if (results.created > 0 || results.updated > 0) {
      queryClient.invalidateQueries({ queryKey: ['remarketing'] });
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      onComplete?.();
    }

    toast.success(
      `Import complete: ${results.created} created, ${results.errors} errors, ${results.skipped} skipped`,
    );
  }, [validRows, mappings, buyerId, queryClient, onComplete]);

  const resetImport = useCallback(() => {
    setStep('upload');
    setCsvData([]);
    setMappings([]);
    setImportProgress(0);
    setImportResults({ created: 0, updated: 0, skipped: 0, errors: 0 });
    setIsComplete(false);
    setSkippedRowsOpen(false);
  }, []);

  return {
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
  };
}
