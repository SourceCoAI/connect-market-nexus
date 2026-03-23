
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { TestSuite, TestStep } from './types';
import { statusIcon } from './utils';

interface TestSuiteCardProps {
  suite: TestSuite;
  canRun: boolean;
  isAnyRunning: boolean;
  onRun: () => void;
}

export function TestSuiteCard({ suite, canRun, isAnyRunning, onRun }: TestSuiteCardProps) {
  const hasResults = suite.steps.length > 0;
  const passCount = suite.steps.filter((s: TestStep) => s.status === 'pass').length;
  const failCount = suite.steps.filter((s: TestStep) => s.status === 'fail').length;
  const warnCount = suite.steps.filter((s: TestStep) => s.status === 'warn').length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{suite.name}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{suite.description}</p>
          </div>
          <div className="flex items-center gap-2">
            {hasResults && (
              <div className="flex gap-1.5 text-xs">
                {passCount > 0 && <span className="text-green-600">{passCount} pass</span>}
                {failCount > 0 && <span className="text-red-600">{failCount} fail</span>}
                {warnCount > 0 && <span className="text-yellow-600">{warnCount} warn</span>}
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={!canRun || suite.running || isAnyRunning}
              onClick={onRun}
              className="gap-1.5"
            >
              {suite.running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Run
            </Button>
          </div>
        </div>
      </CardHeader>
      {suite.steps.length > 0 && (
        <CardContent className="pt-0">
          <div className="space-y-1">
            {suite.steps.map((s: TestStep, i: number) => (
              <div key={i} className="flex items-start gap-2 text-sm py-0.5">
                {statusIcon(s.status)}
                <span className="font-medium min-w-0">{s.label}</span>
                {s.detail && (
                  <span className="text-muted-foreground text-xs ml-auto shrink-0 max-w-[50%] truncate">
                    {s.detail}
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
