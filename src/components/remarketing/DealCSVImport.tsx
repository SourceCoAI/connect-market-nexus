import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColumnMappingStep } from './csv-import/ColumnMappingStep';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Upload, FileSpreadsheet, Loader2, Check, AlertCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
// Papa removed – using parseSpreadsheet instead
import { normalizeDomain, isGenericEmailDomain } from '@/lib/remarketing/normalizeDomain';
import { parseSpreadsheet, SPREADSHEET_ACCEPT } from '@/lib/parseSpreadsheet';

// Import from unified import engine
import {
  type ColumnMapping,
  type MergeStats,
  DEAL_IMPORT_FIELDS,
  // normalizeHeader is re-exported but used internally by mergeColumnMappings
  mergeColumnMappings,
  sanitizeListingInsert,
} from '@/lib/deal-csv-import';

export interface DealCSVImportProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  universeId: string;
  universeName?: string;
  onImportComplete?: () => void;
}

type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';

interface NewDealDetail {
  row: number;
  companyName: string;
  website?: string;
}

interface MergedDealDetail {
  row: number;
  csvCompanyName: string;
  existingTitle: string;
  existingId: string;
  matchedBy: 'website' | 'name';
  website?: string;
}

interface DetailedImportResults {
  imported: number;
  merged: number;
  errors: string[];
  newDeals: NewDealDetail[];
  mergedDeals: MergedDealDetail[];
  /** All listing IDs that were linked to the universe (new + merged) for scoring */
  linkedListingIds: string[];
}

export const DealCSVImport = ({
  universeId,
  universeName: _universeName,
  onImportComplete,
}: DealCSVImportProps) => {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<ImportStep>('upload');
  const [, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [mappingStats, setMappingStats] = useState<MergeStats | null>(null);
  const [isMapping, setIsMapping] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<DetailedImportResults | null>(null);
  const [showNewDeals, setShowNewDeals] = useState(false);
  const [showMergedDeals, setShowMergedDeals] = useState(false);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);

    try {
      // Normalize headers (strip BOM + trim) so mapping + row access works reliably
      const stripBom = (header: string) => header.replace(/^\uFEFF/, '').trim();
      const { data, columns } = await parseSpreadsheet(uploadedFile, stripBom);
      setCsvData(data);

      if (columns.length === 0) {
        toast.error('Could not detect headers', {
          description: 'Please verify the file has a header row and is a valid CSV, XLS, or XLSX file.',
        });
        reset();
        return;
      }

      // Try AI mapping
      setIsMapping(true);
      try {
        const { data: mappingResult, error } = await supabase.functions.invoke(
          'map-csv-columns',
          {
            // Pass a few sample rows to improve mapping quality (disambiguates similar headers)
            body: { columns, targetType: 'deal', sampleData: data.slice(0, 3) },
          },
        );

        if (error) throw error;

        // CRITICAL: Merge AI mappings with full column list
        // This ensures all parsed columns are visible even if AI returns partial list
        const [merged, stats] = mergeColumnMappings(columns, mappingResult?.mappings);

        setColumnMappings(merged);
        setMappingStats(stats);
      } catch (error) {
        // AI mapping failed — using fallback
        // Fallback to empty mapping - still use merge to ensure all columns present
        const [merged, stats] = mergeColumnMappings(columns, []);
        setColumnMappings(merged);
        setMappingStats(stats);
      } finally {
        setIsMapping(false);
        setStep('mapping');
      }
    } catch (error) {
      toast.error(`Failed to parse file: ${(error as Error).message}`);
    }
  }, []);

  const updateMapping = (csvColumn: string, targetField: string | null) => {
    setColumnMappings((prev) =>
      prev.map((m) => (m.csvColumn === csvColumn ? { ...m, targetField, aiSuggested: false } : m)),
    );
  };

  interface MergeExistingResult {
    id: string;
    existingTitle: string;
    matchedBy: 'website' | 'name';
  }

  /**
   * When a deal already exists (duplicate website), find the existing listing
   * and fill in any null/empty fields with new CSV data.
   * Returns match details if fields were updated, null otherwise.
   */
  const tryMergeExistingListing = async (
    newData: Record<string, unknown>,
    mergeableFields: string[],
  ): Promise<MergeExistingResult | null> => {
    try {
      const website = newData.website as string | undefined;
      const title = newData.title as string | undefined;

      let existingListing: Record<string, unknown> | null = null;
      let matchedBy: 'website' | 'name' = 'website';

      if (website) {
        // Primary: use DB-level normalized domain matching via RPC
        const { data: rpcData } = await supabase
          .rpc('find_listing_by_normalized_domain', { target_domain: website })
          .limit(1)
          .maybeSingle();
        existingListing = rpcData as Record<string, unknown> | null;

        // Fallback: exact match for backward compat if RPC not yet available
        if (!existingListing) {
          const { data } = await supabase
            .from('listings')
            .select('*')
            .eq('website', website)
            .limit(1)
            .maybeSingle();
          existingListing = data as Record<string, unknown> | null;
        }
      }

      // Fallback: try matching by title (case-insensitive) if website didn't match
      if (!existingListing && title) {
        const { data } = await supabase
          .from('listings')
          .select('*')
          .ilike('title', title)
          .limit(1)
          .maybeSingle();
        existingListing = data as Record<string, unknown> | null;
        if (existingListing) matchedBy = 'name';
      }

      if (!existingListing) return null;

      const existingTitle = (existingListing.title as string) || 'Unknown';

      const updates: Record<string, unknown> = {};

      for (const field of mergeableFields) {
        const newValue = newData[field];
        const existingValue = existingListing[field];

        if (newValue === undefined || newValue === null || newValue === '') continue;
        if (field === 'category' && newValue === 'Other') continue;

        const isEmpty =
          existingValue === null
          || existingValue === undefined
          || existingValue === ''
          || (field === 'description' && existingValue === (existingListing.title || ''))
          || (field === 'category' && existingValue === 'Other')
          || (field === 'location' && existingValue === 'Unknown');

        if (isEmpty) {
          updates[field] = newValue;
        }
      }

      if (
        (updates.address_city || updates.address_state) &&
        (existingListing.location === 'Unknown' || !existingListing.location)
      ) {
        const newCity = (updates.address_city || existingListing.address_city || '') as string;
        const newState = (updates.address_state || existingListing.address_state || '') as string;
        if (newCity && newState) {
          updates.location = `${newCity}, ${newState}`;
        } else if (newState || newCity) {
          updates.location = newState || newCity;
        }
      }

      if (typeof newData.revenue === 'number' && newData.revenue > 0
          && (existingListing.revenue === 0 || existingListing.revenue === null)) {
        updates.revenue = newData.revenue;
      }
      if (typeof newData.ebitda === 'number' && newData.ebitda > 0
          && (existingListing.ebitda === 0 || existingListing.ebitda === null)) {
        updates.ebitda = newData.ebitda;
      }

      if (Object.keys(updates).length === 0) return null;

      const { error: updateError } = await supabase
        .from('listings')
        .update(updates as never)
        .eq('id', existingListing.id as string);

      if (updateError) {
        console.warn('Merge update failed:', updateError.message);
        return null;
      }

      return { id: existingListing.id as string, existingTitle, matchedBy };
    } catch (err) {
      console.warn('Merge lookup failed:', (err as Error).message);
      return null;
    }
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      const results: DetailedImportResults = {
        imported: 0,
        merged: 0,
        errors: [],
        newDeals: [],
        mergedDeals: [],
        linkedListingIds: [],
      };

      // Fields eligible for merge-fill on existing deals
      const MERGEABLE_FIELDS = [
        'main_contact_name', 'main_contact_email', 'main_contact_phone', 'main_contact_title',
        'description', 'executive_summary', 'general_notes', 'internal_notes', 'owner_goals',
        'category', 'industry', 'address', 'address_city', 'address_state', 'address_zip',
        'address_country', 'geographic_states', 'services', 'linkedin_url', 'fireflies_url',
        'internal_company_name', 'full_time_employees', 'number_of_locations',
        'google_review_count', 'google_rating',
      ];

      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        setImportProgress(Math.round(((i + 1) / csvData.length) * 100));

        try {
          // Build listing object dynamically - use Record to support all mapped fields
          const listingData: Record<string, unknown> = {
            status: 'active',
            category: 'Other',
            is_internal_deal: true, // Mark as internal/research deal - not for marketplace
            // Required field defaults
            description: '',
            revenue: 0,
            ebitda: 0,
            location: 'Unknown',
          };

          // Numeric fields that need parsing
          const numericFields = [
            'revenue',
            'ebitda',
            'full_time_employees',
            'number_of_locations',
            'google_review_count',
            'google_rating',
          ];
          // Array fields that need splitting
          const arrayFields = ['geographic_states', 'services'];

          columnMappings.forEach((mapping) => {
            if (!mapping.targetField) return;

            // Get the value - handle potential whitespace in column names
            const csvColumn = mapping.csvColumn;
            let value = row[csvColumn];

            // If direct access fails, try finding by trimmed key
            if (value === undefined) {
              const rowKeys = Object.keys(row);
              const matchingKey = rowKeys.find((k) => k.trim() === csvColumn.trim());
              if (matchingKey) {
                value = row[matchingKey];
              }
            }

            if (!value || typeof value !== 'string') return;

            const trimmedValue = value.trim();
            if (!trimmedValue) return;

            if (numericFields.includes(mapping.targetField)) {
              // Parse numeric values (remove $, commas, M/K suffixes, etc.)
              let numStr = trimmedValue.replace(/[$,]/g, '');
              let multiplier = 1;
              if (numStr.toUpperCase().endsWith('M')) {
                multiplier = 1000000;
                numStr = numStr.slice(0, -1);
              } else if (numStr.toUpperCase().endsWith('K')) {
                multiplier = 1000;
                numStr = numStr.slice(0, -1);
              }
              const numValue = parseFloat(numStr) * multiplier;
              if (!isNaN(numValue)) {
                listingData[mapping.targetField] = numValue;
              }
            } else if (arrayFields.includes(mapping.targetField)) {
              // Parse as array
              listingData[mapping.targetField] = trimmedValue
                .split(/[,;]/)
                .map((s: string) => s.trim())
                .filter(Boolean);
            } else if (mapping.targetField === 'address') {
              // Full address field - parse out street, city, state, zip
              listingData.address = trimmedValue;

              // Try to extract city/state from multi-line or comma-separated address
              // Format examples:
              // "23 Westbrook Industrial Park Rd., Westbrook, CT 06498"
              // "23 Main St\n1961 Foxon Rd, North Branford, CT 06471"
              const lines = trimmedValue
                .split(/[\n\r]+/)
                .map((l) => l.trim())
                .filter(Boolean);
              const lastLine = lines[lines.length - 1] || trimmedValue;

              // Try to parse "City, ST ZIP" or "City, ST" pattern from end
              const cityStateZipMatch = lastLine.match(/([^,]+),\s*([A-Z]{2})\s*(\d{5})?/i);
              if (cityStateZipMatch) {
                // Extract just the city (last part before state might be street)
                const potentialCity = cityStateZipMatch[1].trim();
                // If city contains street indicators, try to get just the city name
                const streetIndicators =
                  /\b(rd\.?|road|st\.?|street|ave\.?|avenue|blvd\.?|boulevard|ln\.?|lane|dr\.?|drive|ct\.?|court|pl\.?|place|way|pkwy|park)\b/i;
                if (!streetIndicators.test(potentialCity)) {
                  if (!listingData.address_city) {
                    listingData.address_city = potentialCity;
                  }
                }
                if (!listingData.address_state) {
                  listingData.address_state = cityStateZipMatch[2].toUpperCase();
                }
                if (cityStateZipMatch[3] && !listingData.address_zip) {
                  listingData.address_zip = cityStateZipMatch[3];
                }
              }
            } else if (mapping.targetField === 'address_state') {
              // Validate and uppercase state code
              const stateCode = trimmedValue.toUpperCase().trim();
              if (stateCode.length === 2) {
                listingData.address_state = stateCode;
              } else {
                // Try to extract state from longer string (e.g., "Connecticut" or "CT 06498")
                const stateMatch = trimmedValue.match(/\b([A-Z]{2})\b/i);
                if (stateMatch) {
                  listingData.address_state = stateMatch[1].toUpperCase();
                }
              }
            } else if (mapping.targetField === 'address_country') {
              // Default to US if not specified
              const country = trimmedValue.toUpperCase().trim();
              listingData.address_country = country === 'CA' || country === 'CANADA' ? 'CA' : 'US';
            } else if (mapping.targetField === 'last_contacted_at') {
              // Parse date
              const date = new Date(trimmedValue);
              if (!isNaN(date.getTime())) {
                listingData.last_contacted_at = date.toISOString();
              }
            } else {
              // String fields - direct assignment
              listingData[mapping.targetField] = trimmedValue;
            }
          });

          // Set default country if we have address fields but no country
          if (
            (listingData.address_city || listingData.address_state) &&
            !listingData.address_country
          ) {
            listingData.address_country = 'US';
          }

          // Must have a title
          if (!listingData.title) {
            results.errors.push(`Row ${i + 1}: Missing company name (check CSV column mapping)`);
            continue;
          }

          // listings.location is NOT NULL in schema; set a safe default.
          // Prefer structured internal city/state; fall back to other known fields.
          if (!listingData.location) {
            const city =
              typeof listingData.address_city === 'string' ? listingData.address_city : '';
            const state =
              typeof listingData.address_state === 'string' ? listingData.address_state : '';
            const computedLocation =
              city && state ? `${city}, ${state}` : state || city || 'Unknown';
            listingData.location = computedLocation;
          }

          // Skip rows where "website" is a generic email domain
          if (listingData.website && isGenericEmailDomain(listingData.website as string)) {
            results.errors.push(
              `Row ${i + 1}: Skipped — "${listingData.website}" is a personal email domain, not a company website`
            );
            continue;
          }

          // Normalize website for dedup
          if (listingData.website) {
            const normalized = normalizeDomain(listingData.website as string);
            if (normalized) {
              listingData.website = normalized;
            }
          }

          const sanitized = sanitizeListingInsert(listingData);

          // Create listing - use any to bypass strict typing
          const { data: listing, error: listingError } = await supabase
            .from('listings')
            .insert(sanitized as never)
            .select('id')
            .single();

          if (listingError) {
            // If duplicate, try to merge empty fields on the existing listing
            const isDuplicate = listingError.message?.includes('duplicate key')
              || listingError.message?.includes('unique constraint')
              || listingError.code === '23505';

            if (isDuplicate) {
              const mergeResult = await tryMergeExistingListing(
                listingData, MERGEABLE_FIELDS,
              );
              if (mergeResult) {
                results.merged++;
                results.linkedListingIds.push(mergeResult.id);
                results.mergedDeals.push({
                  row: i + 1,
                  csvCompanyName: (listingData.title as string) || 'Unknown',
                  existingTitle: mergeResult.existingTitle,
                  existingId: mergeResult.id,
                  matchedBy: mergeResult.matchedBy,
                  website: (listingData.website as string) || undefined,
                });
                // Also ensure universe link exists
                await supabase.from('remarketing_universe_deals').upsert({
                  universe_id: universeId,
                  listing_id: mergeResult.id,
                  added_by: user?.id,
                  status: 'active',
                } as never, { onConflict: 'universe_id,listing_id' }).select();
              } else {
                results.errors.push(`Row ${i + 1}: duplicate key value violates unique constraint`);
              }
            } else {
              throw listingError;
            }
          } else {
            // Link to universe
            const { error: linkError } = await supabase.from('remarketing_universe_deals').insert({
              universe_id: universeId,
              listing_id: listing.id,
              added_by: user?.id,
              status: 'active',
            });

            if (linkError) throw linkError;

            results.imported++;
            results.linkedListingIds.push(listing.id);
            results.newDeals.push({
              row: i + 1,
              companyName: (listingData.title as string) || 'Unknown',
              website: (listingData.website as string) || undefined,
            });
          }
        } catch (error) {
          results.errors.push(`Row ${i + 1}: ${(error as Error).message}`);
        }
      }

      return results;
    },
    onSuccess: async (results) => {
      setImportResults(results);
      setStep('complete');
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'universe-deals', universeId] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals', 'universe', universeId] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });

      // Queue background scoring for all imported/merged deals
      const listingIds = results?.linkedListingIds || [];
      if (listingIds.length > 0) {
        try {
          const { queueDealScoring } = await import('@/lib/remarketing/queueScoring');
          await queueDealScoring({ universeId, listingIds });
        } catch (err) {
          console.warn('[DealCSVImport] Failed to queue scoring:', err);
        }
      }

      onImportComplete?.();
    },
    onError: (error) => {
      toast.error(`Import failed: ${(error as Error).message}`);
      setStep('preview');
    },
  });

  const startImport = () => {
    setStep('importing');
    setImportProgress(0);
    importMutation.mutate();
  };

  const reset = () => {
    setStep('upload');
    setFile(null);
    setCsvData([]);
    setColumnMappings([]);
    setMappingStats(null);
    setImportProgress(0);
    setImportResults(null);
    setShowNewDeals(false);
    setShowMergedDeals(false);
  };

  return (
    <div className="space-y-4">
      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="flex-1 flex flex-col items-center justify-center py-12">
          <div className="border-2 border-dashed rounded-lg p-12 text-center w-full">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-2">Upload Spreadsheet</p>
            <p className="text-sm text-muted-foreground mb-4">CSV, XLS, or XLSX -- drag and drop or click to browse</p>
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
      {step === 'mapping' && (
        <div className="flex-1 flex flex-col min-h-0">
          <ColumnMappingStep
            csvData={csvData}
            columnMappings={columnMappings}
            mappingStats={mappingStats}
            isMapping={isMapping}
            onUpdateMapping={updateMapping}
            onBack={reset}
            onNext={() => setStep('preview')}
          />
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="mb-4">
            <p className="font-medium">Ready to import {csvData.length} deals</p>
            <p className="text-sm text-muted-foreground">
              Mapped fields:{' '}
              {columnMappings
                .filter((m) => m.targetField)
                .map((m) => DEAL_IMPORT_FIELDS.find((f) => f.value === m.targetField)?.label)
                .join(', ')}
            </p>
          </div>

          <ScrollArea className="flex-1 border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  {columnMappings
                    .filter((m) => m.targetField)
                    .map((m) => (
                      <TableHead key={m.csvColumn}>
                        {DEAL_IMPORT_FIELDS.find((f) => f.value === m.targetField)?.label}
                      </TableHead>
                    ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {csvData.slice(0, 10).map((row, i) => (
                  <TableRow key={`row-${i}`}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    {columnMappings
                      .filter((m) => m.targetField)
                      .map((m) => (
                        <TableCell key={m.csvColumn} className="max-w-[150px] truncate">
                          {row[m.csvColumn] || '—'}
                        </TableCell>
                      ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          {csvData.length > 10 && (
            <p className="text-sm text-muted-foreground text-center mt-2">
              Showing 10 of {csvData.length} rows
            </p>
          )}

          <div className="pt-4 flex justify-between">
            <Button variant="outline" onClick={() => setStep('mapping')}>
              Back
            </Button>
            <Button onClick={startImport}>
              <Upload className="h-4 w-4 mr-2" />
              Import {csvData.length} Deals
            </Button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === 'importing' && (
        <div className="flex-1 flex flex-col items-center justify-center py-12">
          <Loader2 className="h-12 w-12 mb-4 text-primary animate-spin" />
          <p className="font-medium mb-2">Importing deals...</p>
          <Progress value={importProgress} className="w-64 mb-2" />
          <p className="text-sm text-muted-foreground">{importProgress}% complete</p>
        </div>
      )}

      {/* Step: Complete */}
      {step === 'complete' && importResults && (
        <div className="flex-1 flex flex-col items-center py-8 max-w-2xl mx-auto w-full">
          {importResults.errors.length === 0 ? (
            <Check className="h-12 w-12 mb-4 text-primary" />
          ) : (
            <AlertCircle className="h-12 w-12 mb-4 text-destructive" />
          )}
          <p className="font-medium mb-1">
            {(() => {
              const parts: string[] = [];
              if (importResults.imported > 0) parts.push(`${importResults.imported} new deals imported`);
              if (importResults.merged > 0) parts.push(`${importResults.merged} existing deals updated`);
              return parts.length > 0
                ? parts.join(', ')
                : `0 of ${csvData.length} deals imported`;
            })()}
          </p>
          {importResults.merged > 0 && (
            <p className="text-sm text-muted-foreground mb-2">
              Empty fields on existing deals were filled with new data from the CSV
            </p>
          )}

          {/* New deals breakdown */}
          {importResults.newDeals.length > 0 && (
            <div className="w-full mt-4">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-medium text-left w-full hover:underline"
                onClick={() => setShowNewDeals(!showNewDeals)}
              >
                {showNewDeals ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span className="text-green-700">{importResults.newDeals.length} new deals imported</span>
              </button>
              {showNewDeals && (
                <ScrollArea className="max-h-48 w-full border rounded-lg mt-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead>Company Name</TableHead>
                        <TableHead>Website</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResults.newDeals.map((deal) => (
                        <TableRow key={`new-${deal.row}`}>
                          <TableCell className="text-muted-foreground">{deal.row}</TableCell>
                          <TableCell className="font-medium">{deal.companyName}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{deal.website || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </div>
          )}

          {/* Merged/updated deals breakdown */}
          {importResults.mergedDeals.length > 0 && (
            <div className="w-full mt-4">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-medium text-left w-full hover:underline"
                onClick={() => setShowMergedDeals(!showMergedDeals)}
              >
                {showMergedDeals ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span className="text-amber-700">{importResults.mergedDeals.length} existing deals updated</span>
              </button>
              {showMergedDeals && (
                <ScrollArea className="max-h-48 w-full border rounded-lg mt-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead>CSV Company</TableHead>
                        <TableHead>Matched Existing Deal</TableHead>
                        <TableHead className="w-24">Matched By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResults.mergedDeals.map((deal) => (
                        <TableRow key={`merged-${deal.row}`}>
                          <TableCell className="text-muted-foreground">{deal.row}</TableCell>
                          <TableCell>{deal.csvCompanyName}</TableCell>
                          <TableCell>
                            <a
                              href={`/admin/remarketing/deals/${deal.existingId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-primary hover:underline"
                            >
                              {deal.existingTitle}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            {deal.website && (
                              <span className="text-xs text-muted-foreground block">{deal.website}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs">
                              {deal.matchedBy}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </div>
          )}

          {/* Errors */}
          {importResults.errors.length > 0 && (
            <div className="w-full mt-4">
              <p className="text-sm font-medium text-destructive mb-2">
                {importResults.errors.length} failed to import:
              </p>
              <ScrollArea className="max-h-32 w-full border rounded-lg p-4">
                <div className="space-y-1 text-sm text-destructive">
                  {importResults.errors.map((error) => (
                    <p key={error}>{error}</p>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <Button onClick={reset} className="mt-6">
            Import More
          </Button>
        </div>
      )}
    </div>
  );
};

export default DealCSVImport;
