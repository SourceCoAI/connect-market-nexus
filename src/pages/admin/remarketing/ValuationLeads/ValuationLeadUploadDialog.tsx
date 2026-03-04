import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  Upload,
  FileSpreadsheet,
  Loader2,
  Check,
  AlertCircle,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseSpreadsheet, SPREADSHEET_ACCEPT } from '@/lib/parseSpreadsheet';

// ─── Target fields — only direct valuation_leads columns ───

interface TargetField {
  value: string;
  label: string;
}

const VALUATION_LEAD_IMPORT_FIELDS: TargetField[] = [
  { value: 'business_name', label: 'Business Name' },
  { value: 'full_name', label: 'Contact Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'website', label: 'Website' },
  { value: 'linkedin_url', label: 'LinkedIn URL' },
  { value: 'display_name', label: 'Display Name' },
  { value: 'location', label: 'Location' },
  { value: 'region', label: 'Region' },
  { value: 'industry', label: 'Industry' },
  { value: 'calculator_type', label: 'Calculator Type' },
  { value: 'locations_count', label: 'Locations Count' },
  { value: 'growth_trend', label: 'Growth Trend' },
  { value: 'owner_dependency', label: 'Owner Dependency' },
  { value: 'revenue_model', label: 'Revenue Model' },
  { value: 'buyer_lane', label: 'Buyer Lane' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'ebitda', label: 'EBITDA' },
  { value: 'valuation_low', label: 'Valuation Low' },
  { value: 'valuation_mid', label: 'Valuation Mid' },
  { value: 'valuation_high', label: 'Valuation High' },
  { value: 'quality_label', label: 'Quality Label' },
  { value: 'quality_tier', label: 'Quality Tier' },
  { value: 'readiness_score', label: 'Readiness Score' },
  { value: 'exit_timing', label: 'Exit Timing' },
  { value: 'open_to_intros', label: 'Open to Intros' },
  { value: 'lead_source', label: 'Lead Source' },
  { value: 'source_submission_id', label: 'Source ID' },
  { value: 'created_at', label: 'Created Date' },
];

// ─── Auto-mapping from CSV headers to target fields ───

const HEADER_MAPPING: Record<string, string> = {
  // Core
  'business name': 'business_name',
  'company name': 'business_name',
  company: 'business_name',
  business: 'business_name',
  'contact name': 'full_name',
  'full name': 'full_name',
  name: 'full_name',
  contact: 'full_name',
  owner: 'full_name',
  'owner name': 'full_name',
  email: 'email',
  'email address': 'email',
  phone: 'phone',
  'phone number': 'phone',
  telephone: 'phone',
  mobile: 'phone',
  website: 'website',
  url: 'website',
  'web site': 'website',
  domain: 'website',
  linkedin: 'linkedin_url',
  'linkedin url': 'linkedin_url',
  'display name': 'display_name',

  // Location
  location: 'location',
  city: 'location',
  'city state': 'location',
  'city, state': 'location',
  address: 'location',
  region: 'region',
  state: 'region',

  // Business
  industry: 'industry',
  sector: 'industry',
  'calculator type': 'calculator_type',
  calculator: 'calculator_type',
  'locations count': 'locations_count',
  locations: 'locations_count',
  '# of locations': 'locations_count',
  'number of locations': 'locations_count',
  'growth trend': 'growth_trend',
  growth: 'growth_trend',
  'trend 24m': 'growth_trend',
  'owner dependency': 'owner_dependency',
  'revenue model': 'revenue_model',
  'buyer lane': 'buyer_lane',

  // Financial
  revenue: 'revenue',
  sales: 'revenue',
  'annual revenue': 'revenue',
  'total revenue': 'revenue',
  'revenue ltm': 'revenue',
  ebitda: 'ebitda',
  'adj ebitda': 'ebitda',
  'adjusted ebitda': 'ebitda',
  earnings: 'ebitda',
  sde: 'ebitda',
  'ebitda ltm': 'ebitda',
  'valuation low': 'valuation_low',
  'valuation min': 'valuation_low',
  'low valuation': 'valuation_low',
  'valuation mid': 'valuation_mid',
  valuation: 'valuation_mid',
  'est valuation': 'valuation_mid',
  'estimated valuation': 'valuation_mid',
  'valuation high': 'valuation_high',
  'valuation max': 'valuation_high',
  'high valuation': 'valuation_high',

  // Scoring & Quality
  'quality label': 'quality_label',
  'quality tier': 'quality_tier',
  tier: 'quality_tier',
  'readiness score': 'readiness_score',
  'exit timing': 'exit_timing',
  'exit timeline': 'exit_timing',
  timeline: 'exit_timing',
  'open to intros': 'open_to_intros',
  intros: 'open_to_intros',

  // Metadata
  'lead source': 'lead_source',
  'created at': 'created_at',
  id: 'source_submission_id',
  'source submission id': 'source_submission_id',
};

// Map service_type values from auto/collision calculators to calculator_type DB values
const SERVICE_TYPE_TO_CALCULATOR: Record<string, string> = {
  auto_repair: 'auto_shop',
  'auto repair': 'auto_shop',
  collision: 'collision',
  specialty: 'auto_shop',
  hvac: 'hvac',
  general: 'general',
};

interface ColumnMapping {
  csvColumn: string;
  targetField: string | null;
  autoMapped: boolean;
}

type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ValuationLeadUploadDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<ImportStep>('upload');
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [columnFilter, setColumnFilter] = useState('');
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  // Detect calculator type from service_type column in the spreadsheet
  const detectCalculatorType = (row: Record<string, string>): string => {
    // Look for a service_type column (case-insensitive)
    for (const [key, value] of Object.entries(row)) {
      if (key.toLowerCase().replace(/[_-]/g, ' ').trim() === 'service type' && value) {
        const mapped = SERVICE_TYPE_TO_CALCULATOR[value.toLowerCase().trim()];
        if (mapped) return mapped;
      }
    }
    return 'general';
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const stripBom = (header: string) => header.replace(/^\uFEFF/, '').trim();
      const { data, columns } = await parseSpreadsheet(file, stripBom);
      setCsvData(data);

      if (columns.length === 0) {
        toast.error('Could not detect headers', {
          description: 'Please verify the file has a header row.',
        });
        reset();
        return;
      }

      // Auto-map columns based on header names
      const usedTargets = new Set<string>();
      const mappings: ColumnMapping[] = columns.map((col) => {
        const normalized = col.toLowerCase().trim().replace(/[_-]/g, ' ');
        const target = HEADER_MAPPING[normalized] || null;
        const autoMapped = target !== null && !usedTargets.has(target);
        if (autoMapped && target) usedTargets.add(target);
        return {
          csvColumn: col,
          targetField: autoMapped ? target : null,
          autoMapped,
        };
      });

      setColumnMappings(mappings);
      setStep('mapping');
    } catch (error) {
      toast.error(`Failed to parse file: ${(error as Error).message}`);
    }
  }, []);

  const updateMapping = (csvColumn: string, targetField: string | null) => {
    setColumnMappings((prev) =>
      prev.map((m) => (m.csvColumn === csvColumn ? { ...m, targetField, autoMapped: false } : m)),
    );
  };

  const parseNumericValue = (raw: string): number | null => {
    if (!raw || !raw.trim()) return null;
    // Handle scientific notation like 4.44E+08
    if (/^\d+\.?\d*[eE][+-]?\d+$/.test(raw.trim())) {
      const val = parseFloat(raw.trim());
      return isNaN(val) ? null : val;
    }
    let numStr = raw.trim().replace(/[$,]/g, '');
    let multiplier = 1;
    if (numStr.toUpperCase().endsWith('M')) {
      multiplier = 1_000_000;
      numStr = numStr.slice(0, -1);
    } else if (numStr.toUpperCase().endsWith('K')) {
      multiplier = 1_000;
      numStr = numStr.slice(0, -1);
    }
    const val = parseFloat(numStr) * multiplier;
    return isNaN(val) ? null : val;
  };

  const parseBooleanValue = (raw: string): boolean | null => {
    if (!raw || !raw.trim()) return null;
    const lower = raw.trim().toLowerCase();
    if (['yes', 'true', '1', 'y'].includes(lower)) return true;
    if (['no', 'false', '0', 'n'].includes(lower)) return false;
    return null;
  };

  const startImport = async () => {
    setStep('importing');
    setImportProgress(0);

    const numericFields = new Set([
      'revenue',
      'ebitda',
      'valuation_low',
      'valuation_mid',
      'valuation_high',
      'locations_count',
      'readiness_score',
    ]);
    const booleanFields = new Set(['open_to_intros', 'cta_clicked']);

    const results = { imported: 0, skipped: 0, errors: [] as string[] };
    const activeMappings = columnMappings.filter((m) => m.targetField);

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      setImportProgress(Math.round(((i + 1) / csvData.length) * 100));

      try {
        // Auto-detect calculator type from service_type column
        const detectedCalcType = detectCalculatorType(row);

        const record: Record<string, unknown> = {
          calculator_type: detectedCalcType,
          lead_source: 'spreadsheet_upload',
          excluded: false,
        };

        for (const mapping of activeMappings) {
          const rawValue = row[mapping.csvColumn]?.trim();
          if (!rawValue) continue;

          if (numericFields.has(mapping.targetField!)) {
            const num = parseNumericValue(rawValue);
            if (num !== null) record[mapping.targetField!] = num;
          } else if (booleanFields.has(mapping.targetField!)) {
            const bool = parseBooleanValue(rawValue);
            if (bool !== null) record[mapping.targetField!] = bool;
          } else {
            record[mapping.targetField!] = rawValue;
          }
        }

        // If calculator_type was explicitly mapped from a column, it takes precedence
        // Otherwise the auto-detected value from service_type is used

        // Must have at least a name, email, or website
        if (!record.business_name && !record.email && !record.website && !record.full_name) {
          results.errors.push(`Row ${i + 2}: Skipped — needs at least a name, email, or website`);
          results.skipped++;
          continue;
        }

        // Set display_name if not mapped
        if (!record.display_name) {
          if (record.business_name) {
            record.display_name = record.business_name;
          } else if (record.full_name) {
            record.display_name = record.full_name;
          }
        }

        const { error } = await supabase.from('valuation_leads').insert(record as never);

        if (error) {
          results.errors.push(`Row ${i + 2}: ${error.message}`);
        } else {
          results.imported++;
        }
      } catch (error) {
        results.errors.push(`Row ${i + 2}: ${(error as Error).message}`);
      }
    }

    setImportResults(results);
    setStep('complete');

    if (results.imported > 0) {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'valuation-leads'] });
      toast.success(`Imported ${results.imported} lead${results.imported !== 1 ? 's' : ''}`);
    }
  };

  const reset = () => {
    setStep('upload');
    setCsvData([]);
    setColumnMappings([]);
    setColumnFilter('');
    setImportProgress(0);
    setImportResults(null);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const mappedCount = columnMappings.filter((m) => m.targetField).length;
  const filteredMappings = columnMappings.filter((m) => {
    const q = columnFilter.trim().toLowerCase();
    if (!q) return true;
    return m.csvColumn.toLowerCase().includes(q);
  });

  const hasRequiredMapping = columnMappings.some(
    (m) =>
      m.targetField === 'business_name' ||
      m.targetField === 'full_name' ||
      m.targetField === 'email' ||
      m.targetField === 'website',
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Valuation Leads
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Step: Upload */}
          {step === 'upload' && (
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              <div className="border-2 border-dashed rounded-lg p-12 text-center w-full">
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">Upload Spreadsheet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  CSV, XLS, or XLSX — general or industry calculator exports
                </p>
                <Label htmlFor="valuation-lead-upload" className="cursor-pointer">
                  <Input
                    id="valuation-lead-upload"
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
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">{csvData.length} rows</Badge>
                  <Badge variant="outline">
                    {mappedCount}/{columnMappings.length} mapped
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">Unmapped columns are ignored</p>
              </div>

              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1">
                  <Input
                    value={columnFilter}
                    onChange={(e) => setColumnFilter(e.target.value)}
                    placeholder="Search columns..."
                  />
                </div>
                {columnFilter.trim() && (
                  <Button variant="outline" size="sm" onClick={() => setColumnFilter('')}>
                    Clear
                  </Button>
                )}
              </div>

              <ScrollArea className="flex-1 border rounded-lg max-h-[350px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Spreadsheet Column</TableHead>
                      <TableHead>Sample Value</TableHead>
                      <TableHead>Map To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMappings.map((mapping) => (
                      <TableRow key={mapping.csvColumn}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{mapping.csvColumn}</span>
                            {mapping.autoMapped && mapping.targetField && (
                              <Badge variant="secondary" className="text-xs">
                                <Sparkles className="h-3 w-3 mr-1" />
                                Auto
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {csvData[0]?.[mapping.csvColumn] || '\u2014'}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={mapping.targetField || 'none'}
                            onValueChange={(value) =>
                              updateMapping(mapping.csvColumn, value === 'none' ? null : value)
                            }
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Don't import" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Don't import</SelectItem>
                              {VALUATION_LEAD_IMPORT_FIELDS.map((field) => (
                                <SelectItem key={field.value} value={field.value}>
                                  {field.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              <div className="pt-4 flex justify-between">
                <Button variant="outline" onClick={reset}>
                  Back
                </Button>
                <Button onClick={() => setStep('preview')} disabled={!hasRequiredMapping}>
                  Preview Import
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="mb-4">
                <p className="font-medium">
                  Ready to import {csvData.length} valuation lead{csvData.length !== 1 ? 's' : ''}
                </p>
                <p className="text-sm text-muted-foreground">
                  Mapped:{' '}
                  {columnMappings
                    .filter((m) => m.targetField)
                    .map(
                      (m) =>
                        VALUATION_LEAD_IMPORT_FIELDS.find((f) => f.value === m.targetField)?.label,
                    )
                    .join(', ')}
                </p>
              </div>

              <ScrollArea className="flex-1 border rounded-lg max-h-[350px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      {columnMappings
                        .filter((m) => m.targetField)
                        .map((m) => (
                          <TableHead key={m.csvColumn}>
                            {
                              VALUATION_LEAD_IMPORT_FIELDS.find((f) => f.value === m.targetField)
                                ?.label
                            }
                          </TableHead>
                        ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvData.slice(0, 10).map((row, i) => (
                      <TableRow key={`preview-${i}`}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        {columnMappings
                          .filter((m) => m.targetField)
                          .map((m) => (
                            <TableCell key={m.csvColumn} className="max-w-[150px] truncate">
                              {row[m.csvColumn] || '\u2014'}
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
                  Import {csvData.length} Lead{csvData.length !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          )}

          {/* Step: Importing */}
          {step === 'importing' && (
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 mb-4 text-primary animate-spin" />
              <p className="font-medium mb-2">Importing leads...</p>
              <Progress value={importProgress} className="w-64 mb-2" />
              <p className="text-sm text-muted-foreground">{importProgress}% complete</p>
            </div>
          )}

          {/* Step: Complete */}
          {step === 'complete' && importResults && (
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              {importResults.errors.length === 0 ? (
                <Check className="h-12 w-12 mb-4 text-primary" />
              ) : (
                <AlertCircle className="h-12 w-12 mb-4 text-destructive" />
              )}
              <p className="font-medium mb-2">
                {importResults.imported} of {csvData.length} lead
                {csvData.length !== 1 ? 's' : ''} imported
                {importResults.skipped > 0 && ` (${importResults.skipped} skipped)`}
              </p>

              {importResults.errors.length > 0 && (
                <ScrollArea className="max-h-32 w-full border rounded-lg p-4 mt-4">
                  <div className="space-y-1 text-sm text-destructive">
                    {importResults.errors.map((error, i) => (
                      <p key={i}>{error}</p>
                    ))}
                  </div>
                </ScrollArea>
              )}

              <div className="flex gap-3 mt-6">
                <Button variant="outline" onClick={reset}>
                  Import More
                </Button>
                <Button onClick={handleClose}>Done</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
