import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, Upload, Loader2, FileSpreadsheet, AlertCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
// Papa removed – using parseSpreadsheet instead
import { parseSpreadsheet, SPREADSHEET_ACCEPT } from '@/lib/parseSpreadsheet';

interface ReferralCSVUploadProps {
  shareToken: string;
  password: string;
  onUploaded: () => void;
}

const TEMPLATE_HEADERS = [
  'Company Name',
  'Website',
  'Industry',
  'Revenue',
  'EBITDA',
  'Location',
  'Contact Name',
  'Contact Email',
  'Contact Phone',
  'Notes',
];

interface ParsedRow {
  company_name: string;
  website: string | null;
  industry: string | null;
  revenue: number | null;
  ebitda: number | null;
  location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
}

function parseFinancialValue(str: string): number | null {
  if (!str || !str.trim()) return null;
  const cleaned = str.replace(/[$,\s]/g, '').toUpperCase();
  let multiplier = 1;
  let numStr = cleaned;
  if (cleaned.endsWith('M')) {
    multiplier = 1_000_000;
    numStr = cleaned.slice(0, -1);
  } else if (cleaned.endsWith('K')) {
    multiplier = 1_000;
    numStr = cleaned.slice(0, -1);
  }
  const parsed = parseFloat(numStr);
  if (isNaN(parsed)) return null;
  return parsed * multiplier;
}

export function ReferralCSVUpload({ shareToken, password, onUploaded }: ReferralCSVUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleDownloadTemplate = () => {
    const csvContent = TEMPLATE_HEADERS.join(',') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'referral-template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { data } = await parseSpreadsheet(file);
      const rows: ParsedRow[] = [];
      let skipped = 0;

      for (const row of data) {
        // Normalize header keys (case-insensitive)
        const normalized: Record<string, string> = {};
        for (const [key, val] of Object.entries(row)) {
          normalized[key.trim().toLowerCase()] = val?.toString().trim() || '';
        }

        const companyName =
          normalized['company name'] ||
          normalized['company_name'] ||
          normalized['companyname'] ||
          '';

        if (!companyName.trim()) {
          skipped++;
          continue;
        }

        rows.push({
          company_name: companyName.trim(),
          website: normalized['website'] || null,
          industry: normalized['industry'] || null,
          revenue: parseFinancialValue(normalized['revenue'] || ''),
          ebitda: parseFinancialValue(normalized['ebitda'] || ''),
          location: normalized['location'] || null,
          contact_name: normalized['contact name'] || normalized['contact_name'] || null,
          contact_email: normalized['contact email'] || normalized['contact_email'] || null,
          contact_phone: normalized['contact phone'] || normalized['contact_phone'] || null,
          notes: normalized['notes'] || null,
        });
      }

      setParsedRows(rows);
      setSkippedCount(skipped);
      setShowPreview(true);
    } catch (err: unknown) {
      toast.error(`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmitAll = async () => {
    if (parsedRows.length === 0) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('submit-referral-deal', {
        body: {
          shareToken,
          password,
          submissions: parsedRows,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`${data?.count || parsedRows.length} referrals submitted`);
      setParsedRows([]);
      setShowPreview(false);
      setSkippedCount(0);
      onUploaded();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit referrals');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setParsedRows([]);
    setShowPreview(false);
    setSkippedCount(0);
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  if (showPreview && parsedRows.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <span className="font-medium">
              {parsedRows.length} {parsedRows.length === 1 ? 'company' : 'companies'} found
            </span>
            {skippedCount > 0 && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {skippedCount} {skippedCount === 1 ? 'row' : 'rows'} skipped (no company name)
              </span>
            )}
          </div>
        </div>

        <div className="border rounded-lg max-h-[300px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company Name</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>EBITDA</TableHead>
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parsedRows.map((row) => (
                <TableRow key={row.company_name}>
                  <TableCell className="font-medium">{row.company_name}</TableCell>
                  <TableCell className="text-sm">{row.industry || '-'}</TableCell>
                  <TableCell className="text-sm">{formatCurrency(row.revenue)}</TableCell>
                  <TableCell className="text-sm">{formatCurrency(row.ebitda)}</TableCell>
                  <TableCell className="text-sm">{row.location || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleSubmitAll} disabled={isSubmitting} className="flex-1">
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Submit All ({parsedRows.length})
          </Button>
          <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
          <Download className="h-4 w-4 mr-2" />
          Download Template
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Spreadsheet
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={SPREADSHEET_ACCEPT}
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Download the template, fill in your companies (one per row), then upload the completed file
        (CSV, XLS, or XLSX).
      </p>
    </div>
  );
}
