import { TestSuite } from './types';

export function buildInitialSuites(): TestSuite[] {
  return [
    {
      id: 'trigger-audit',
      name: '1. Trigger Audit',
      description: 'Verifies all 3 call-sites import and wire correctly + edge function deploy',
      requiresBuyer: false,
      steps: [],
      running: false,
    },
    {
      id: 'edge-function-direct',
      name: '2. Edge Function Direct',
      description:
        'Calls find-introduction-contacts with real buyer data, validates response shape',
      requiresBuyer: true,
      steps: [],
      running: false,
    },
    {
      id: 'db-state-inspector',
      name: '3. DB State Inspector',
      description: "Shows what's in the contacts table for a buyer",
      requiresBuyer: true,
      steps: [],
      running: false,
    },
    {
      id: 'full-workflow',
      name: '4. Full Workflow Simulation',
      description: 'Runs complete approval -> search -> DB save -> toast evaluation',
      requiresBuyer: true,
      steps: [],
      running: false,
    },
    {
      id: 'title-filter-audit',
      name: '5. Title Filter Audit',
      description: 'Validates PE + Company filter arrays against spec and alias expansion',
      requiresBuyer: false,
      steps: [],
      running: false,
    },
    {
      id: 'duplicate-guard',
      name: '6. Duplicate Guard',
      description: 'Re-runs on same buyer, confirms no duplicate rows',
      requiresBuyer: true,
      steps: [],
      running: false,
    },
    {
      id: 'bulk-simulation',
      name: '7. Bulk Approval Simulation',
      description: 'Multi-buyer Promise.allSettled test, validates consolidated toast',
      requiresBuyer: false,
      steps: [],
      running: false,
    },
    {
      id: 'contacts-query-validator',
      name: '8. ContactsTab Query Validator',
      description: 'Replicates exact useBuyerData.ts query, validates shape',
      requiresBuyer: true,
      steps: [],
      running: false,
    },
  ];
}
