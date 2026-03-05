/**
 * ImportProgressStep.tsx
 *
 * Wizard step 4: shows a progress bar during import and a success/error
 * summary once complete.
 */
import { Progress } from '@/components/ui/progress';

interface ImportProgressStepProps {
  importProgress: number;
  isComplete: boolean;
  importResults: { success: number; errors: number; skipped: number; linked: number };
}

export function ImportProgressStep({
  importProgress,
  isComplete,
  importResults,
}: ImportProgressStepProps) {
  return (
    <div className="py-8 space-y-4">
      <Progress value={importProgress} className="h-2" />
      <p className="text-center text-sm text-muted-foreground">
        {importProgress < 100 && <>Importing buyers... {Math.round(importProgress)}%</>}
        {isComplete && (
          <>
            Import complete!
            <br />
            {importResults.success > 0 && (
              <span className="text-emerald-600">{importResults.success} imported</span>
            )}
            {importResults.linked > 0 && (
              <>
                {importResults.success > 0 && ', '}
                <span className="text-blue-600">{importResults.linked} linked to universe</span>
              </>
            )}
            {importResults.skipped > 0 && (
              <>
                {(importResults.success > 0 || importResults.linked > 0) && ', '}
                <span className="text-amber-600">{importResults.skipped} duplicates skipped</span>
              </>
            )}
            {importResults.errors > 0 && (
              <>
                , <span className="text-destructive">{importResults.errors} failed</span>
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}
