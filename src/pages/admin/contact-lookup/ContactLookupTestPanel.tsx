import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlayCircle, Loader2, Users } from 'lucide-react';
import { TestSuite } from './types';
import { useBuyerSearch } from './useBuyerSearch';
import { useTestSuiteRunners } from './useTestSuiteRunners';
import { BuyerPicker } from './BuyerPicker';
import { TestSuiteCard } from './TestSuiteCard';

export default function ContactLookupTestPanel() {
  const [bulkIds, setBulkIds] = useState('');

  const {
    selectedBuyer,
    buyerSearch,
    setBuyerSearch,
    buyerResults,
    searching,
    searchBuyers,
    selectBuyer,
    clearBuyer,
  } = useBuyerSearch();

  const { suites, suiteRunners, isAnyRunning, runAll } = useTestSuiteRunners(
    selectedBuyer,
    bulkIds,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Auto Contact Lookup Test Panel
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            8 test suites covering trigger wiring, edge function, DB state, dedup, bulk ops, and
            query validation
          </p>
        </div>
        <Button onClick={runAll} disabled={isAnyRunning} className="gap-2">
          {isAnyRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="h-4 w-4" />
          )}
          Run All
        </Button>
      </div>

      {/* Buyer picker */}
      <BuyerPicker
        buyerSearch={buyerSearch}
        setBuyerSearch={setBuyerSearch}
        searchBuyers={searchBuyers}
        searching={searching}
        buyerResults={buyerResults}
        selectedBuyer={selectedBuyer}
        selectBuyer={selectBuyer}
        clearBuyer={clearBuyer}
        bulkIds={bulkIds}
        setBulkIds={setBulkIds}
      />

      {/* Test suites */}
      <div className="grid gap-4">
        {suites.map((suite: TestSuite) => {
          const canRun = !suite.requiresBuyer || !!selectedBuyer || suite.id === 'bulk-simulation';
          return (
            <TestSuiteCard
              key={suite.id}
              suite={suite}
              canRun={canRun}
              isAnyRunning={isAnyRunning}
              onRun={() => suiteRunners[suite.id]?.()}
            />
          );
        })}
      </div>
    </div>
  );
}
