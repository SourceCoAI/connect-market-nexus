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

    let success = 0;
    let errors = 0;
    let skipped = 0;
    let linked = 0;
    let contactsCreated = 0;

    // Build a map from row index → existing buyer ID for duplicates that should be linked
    const existingBuyerMap = new Map<number, string>();
    for (const dup of duplicates) {
      if (!skipDuplicates.has(dup.index) && dup.potentialDuplicates.length > 0) {
        existingBuyerMap.set(dup.index, dup.potentialDuplicates[0].id);
      }
    }

    // Helper: update an existing buyer's universe_id (link to this universe)
    const linkBuyerToUniverse = async (buyerId: string): Promise<boolean> => {
      const { error } = await supabase
        .from('buyers')
        .update({ universe_id: universeId } as never)
        .eq('id', buyerId);
      if (error) {
        console.error(
          'Link failed:',
          buyerId,
          error.code,
          error.message,
          error.details,
          error.hint,
        );
      }
      return !error;
    };

    // Filter out skipped duplicates
    const dataToImport = validRows.filter(({ index }) => !skipDuplicates.has(index));
    const wantContacts = hasContactMapping(mappings);

    for (let i = 0; i < dataToImport.length; i++) {
      const { index: rowIndex, row } = dataToImport[i];
      const existingBuyerId = existingBuyerMap.get(rowIndex);

      if (existingBuyerId && universeId) {
        // Buyer already exists — link to this universe instead of creating a duplicate
        if (await linkBuyerToUniverse(existingBuyerId)) {
          linked += 1;
        } else {
          errors += 1;
        }
        setImportProgress(((i + 1) / dataToImport.length) * 100);
        continue;
      }

      const buyer = buildBuyerFromRow(row, mappings, universeId);
      if (!buyer.company_name) {
        errors += 1;
        setImportProgress(((i + 1) / dataToImport.length) * 100);
        continue;
      }

      if (wantContacts) {
        // Single-insert mode: need buyer ID to create linked contacts
        const { data: inserted, error: buyerError } = await supabase
          .from('buyers')
          .insert(buyer as never)
          .select('id')
          .single();

        if (buyerError || !inserted) {
          if (buyerError?.code === '23505' && universeId) {
            // Unique constraint — buyer already exists. Try to link instead.
            const domain =
              (buyer.company_website as string) ||
              (buyer.platform_website as string) ||
              (buyer.pe_firm_website as string) ||
              '';
            if (domain) {
              const { data: existing } = await supabase
                .from('buyers')
                .select('id')
                .ilike('company_website', `%${domain}%`)
                .eq('archived', false)
                .limit(1)
                .single();
              if (existing && (await linkBuyerToUniverse(existing.id))) {
                linked += 1;
              } else {
                skipped += 1;
              }
            } else {
              skipped += 1;
            }
          } else if (buyerError?.code === '23505') {
            skipped += 1;
          } else {
            console.warn(
              'Failed to import buyer:',
              buyer.company_name,
              buyerError?.code,
              buyerError?.message,
            );
            errors += 1;
          }
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

            if (contactError) {
              console.warn(
                'Failed to create contact for buyer:',
                inserted.id,
                contactError.message,
              );
            } else {
              contactsCreated++;
            }
          }
        }
      } else {
        // Direct insert (no contacts needed)
        const { error: insertError } = await supabase.from('buyers').insert(buyer as never);

        if (insertError) {
          if (insertError.code === '23505' && universeId) {
            // Unique constraint — buyer already exists. Try to link instead.
            const domain =
              (buyer.company_website as string) ||
              (buyer.platform_website as string) ||
              (buyer.pe_firm_website as string) ||
              '';
            if (domain) {
              const { data: existing } = await supabase
                .from('buyers')
                .select('id')
                .ilike('company_website', `%${domain}%`)
                .eq('archived', false)
                .limit(1)
                .single();
              if (existing && (await linkBuyerToUniverse(existing.id))) {
                linked += 1;
              } else {
                skipped += 1;
              }
            } else {
              skipped += 1;
            }
          } else if (insertError.code === '23505') {
            skipped += 1;
          } else {
            console.warn(
              'Failed to import buyer:',
              buyer.company_name,
              insertError.code,
              insertError.message,
            );
            errors += 1;
          }
        } else {
          success += 1;
        }
      }

      setImportProgress(((i + 1) / dataToImport.length) * 100);
    }

    setImportResults((prev) => ({ ...prev, success, errors, skipped, linked }));

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

    if (errors > 0) {
      toast.error(`Failed to import ${errors} buyers`);
    }

    onComplete?.();
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
      // Dedupe error — surface it rather than silently importing.
      toast.error(
        'An error occurred while checking for duplicates. Please try again before importing.',
      );
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
