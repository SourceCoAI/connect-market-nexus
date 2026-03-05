/**
 * Unified spreadsheet parser that supports CSV, XLS, and XLSX file formats.
 *
 * All import dialogs should use this utility instead of calling PapaParse directly
 * so that Excel file formats are handled transparently.
 *
 * XLSX (SheetJS) is loaded on-demand to avoid adding ~334KB to the initial bundle.
 */
import Papa from 'papaparse';

/** Accepted file extensions for spreadsheet imports */
export const SPREADSHEET_ACCEPT = '.csv,.xls,.xlsx';

/**
 * Determine whether a file is an Excel format (XLS/XLSX) based on its extension.
 */
function isExcelFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'xls' || ext === 'xlsx';
}

/** Lazy-load xlsx only when an Excel file is actually encountered */
async function getXLSX() {
  const XLSX = await import('xlsx');
  return XLSX;
}

/**
 * Parse an XLS or XLSX file into an array of row objects.
 * Uses the first sheet in the workbook. All values are coerced to strings
 * so downstream code (which was written for CSV string data) works unchanged.
 */
async function parseExcelFile(file: File): Promise<{
  data: Record<string, string>[];
  columns: string[];
}> {
  const XLSX = await getXLSX();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('The uploaded workbook has no sheets');
  }
  const sheet = workbook.Sheets[firstSheetName];

  // sheet_to_json with header:1 gives us raw arrays; using default gives objects.
  // defval: '' ensures empty cells become empty strings instead of undefined.
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });

  // Coerce every value to a string to match what PapaParse produces
  const data: Record<string, string>[] = rows.map((row) => {
    const stringRow: Record<string, string> = {};
    for (const [key, val] of Object.entries(row)) {
      stringRow[key] = val == null ? '' : String(val);
    }
    return stringRow;
  });

  // Derive column names from the first row keys (preserves header order from XLSX).
  // Filter out empty/blank headers — Excel files can have blank trailing columns.
  const columns = data.length > 0 ? Object.keys(data[0]).filter((c) => c && c.trim()) : [];

  return { data, columns };
}

export interface ParsedSpreadsheet {
  /** Array of row objects keyed by header name */
  data: Record<string, string>[];
  /** Ordered list of column headers detected in the file */
  columns: string[];
}

/**
 * Parse a spreadsheet file (CSV, XLS, or XLSX) into a common format.
 *
 * For CSV files, PapaParse is used (preserving existing behaviour).
 * For XLS/XLSX files, the SheetJS (xlsx) library converts the first sheet
 * into the same shape.
 *
 * @param file          The File object from an <input type="file"> element.
 * @param normalizeHdr  Optional header-normalisation function (e.g. strip BOM + trim).
 *                      Applied to every column name before returning.
 */
export async function parseSpreadsheet(
  file: File,
  normalizeHdr?: (header: string) => string,
): Promise<ParsedSpreadsheet> {
  if (isExcelFile(file)) {
    const { data, columns } = await parseExcelFile(file);

    if (normalizeHdr) {
      // Re-key every row and the column list through the normaliser
      const normColumns = columns.map(normalizeHdr);
      const normData = data.map((row) => {
        const out: Record<string, string> = {};
        columns.forEach((col, idx) => {
          out[normColumns[idx]] = row[col];
        });
        return out;
      });
      return { data: normData, columns: normColumns };
    }

    return { data, columns };
  }

  // ---- CSV path (uses PapaParse, matching existing behaviour) ----
  return new Promise<ParsedSpreadsheet>((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeHdr,
      complete: (results) => {
        const data = results.data as Record<string, string>[];

        // Prefer PapaParse meta.fields; fall back to first-row keys
        const metaColumns = (results.meta.fields || []).filter((c) => c && c.trim());
        const fallbackColumns = Object.keys(data?.[0] || {}).filter((c) => c && c.trim());
        const columns = metaColumns.length > 0 ? metaColumns : fallbackColumns;

        resolve({ data, columns });
      },
      error: (err: Error) => {
        reject(new Error(`Failed to parse CSV: ${err.message}`));
      },
    });
  });
}

/**
 * Parse a spreadsheet file into a raw CSV-like text string.
 * This is specifically for the BulkDealImportDialog which feeds the text into
 * its own PapaParse-based `parseCSV()` method.
 *
 * For CSV files this simply reads the file as text.
 * For XLS/XLSX files it converts the first sheet to a CSV string.
 */
export async function readSpreadsheetAsText(file: File): Promise<string> {
  if (isExcelFile(file)) {
    const XLSX = await getXLSX();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('The uploaded workbook has no sheets');
    }
    const sheet = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_csv(sheet);
  }

  // CSV — read as text (existing behaviour)
  return file.text();
}
