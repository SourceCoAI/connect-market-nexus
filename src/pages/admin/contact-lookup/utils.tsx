
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { StepStatus, TestStep, TITLE_ALIASES } from './types';

export function matchesTitle(title: string, filters: string[]): boolean {
  const normalizedTitle = title.toLowerCase().trim();
  for (const filter of filters) {
    const normalizedFilter = filter.toLowerCase().trim();
    if (normalizedTitle.includes(normalizedFilter)) return true;
    const aliases = TITLE_ALIASES[normalizedFilter];
    if (aliases) {
      for (const alias of aliases) {
        if (normalizedTitle.includes(alias)) return true;
      }
    }
  }
  return false;
}

export function mkStep(label: string, status: StepStatus = 'pending', detail?: string): TestStep {
  return { label, status, detail };
}

export function statusIcon(s: StepStatus) {
  switch (s) {
    case 'pass':
      return <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />;
    case 'fail':
      return <XCircle className="h-4 w-4 text-red-600 shrink-0" />;
    case 'warn':
      return <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />;
    case 'running':
      return <Loader2 className="h-4 w-4 text-blue-600 animate-spin shrink-0" />;
    case 'skip':
      return <span className="h-4 w-4 text-muted-foreground shrink-0">-</span>;
    default:
      return <span className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}
