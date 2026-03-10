import { lazy, Suspense, useState, useCallback, useRef, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Loader2,
  FlaskConical,
  Activity,
  Bot,
  Mail,
  ListChecks,
  Store,
  Sparkles,
  PlayCircle,
  Download,
  Square,
  History,
  FileText,
  Users,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useTestRunTracking } from '@/hooks/useTestRunTracking';
import type { TestContext } from './system-test-runner/testDefinitions';
import { INTER_TEST_DELAY_MS, sleep, withRateLimitRetry } from './system-test-runner/types';
import type { ChatbotTestContext } from './chatbot-test-runner/chatbotInfraTests';

// Lazy-loaded tab components
const SystemTestRunner = lazy(() => import('@/pages/admin/SystemTestRunner'));
const PandaDocHealthCheck = lazy(() => import('@/pages/admin/PandaDocHealthCheck'));
const ChatbotTestRunner = lazy(() => import('@/pages/admin/ChatbotTestRunner'));
const SmartleadTestPage = lazy(() => import('@/pages/admin/SmartleadTestPage'));
const ThirtyQuestionTest = lazy(() => import('@/pages/admin/ThirtyQuestionTest'));
const ListingPipelineTest = lazy(() => import('@/pages/admin/ListingPipelineTest'));
const BuyerRecommendationTest = lazy(() => import('@/pages/admin/BuyerRecommendationTest'));
const BuyerClassificationTest = lazy(() => import('@/pages/admin/BuyerClassificationTest'));
const PromptTestRunner = lazy(() => import('@/pages/admin/PromptTestRunner'));
const TestRunTracker = lazy(() => import('@/pages/admin/TestRunTracker'));
const ContactLookupTestPanel = lazy(() => import('@/pages/admin/ContactLookupTestPanel'));

// Storage keys — must match individual tab components exactly
const SYSTEM_TEST_KEY = 'sourceco-system-test-results';
const PANDADOC_KEY = 'sourceco-pandadoc-test-results';
const CHATBOT_INFRA_KEY = 'sourceco-chatbot-infra-test-results';
const SCENARIO_KEY = 'sourceco-chatbot-scenario-results';
const THIRTY_Q_KEY = 'sourceco-30q-test-results';

// ── Types ──

interface TestResult {
  id: string;
  name: string;
  category: string;
  status: 'pending' | 'running' | 'pass' | 'fail' | 'warn';
  error?: string;
  durationMs?: number;
}

interface ChatbotTestResult {
  id: string;
  name: string;
  category: string;
  status: 'pending' | 'running' | 'pass' | 'fail' | 'warn';
  error?: string;
  durationMs?: number;
}

interface RunAllProgress {
  running: boolean;
  currentSuite: string;
  suitesCompleted: number;
  testsRun: number;
  testsTotal: number;
}

// ── Warning heuristics (match individual tab components) ──

function isSystemTestWarning(msg: string): boolean {
  return (
    (msg.includes('does not exist') && !msg.includes('table')) ||
    msg.includes('No documents exist') ||
    msg.includes('No test ')
  );
}

function isChatbotTestWarning(msg: string): boolean {
  return (
    (msg.includes('does not exist') && !msg.includes('table')) ||
    msg.includes('empty') ||
    msg.includes('Expected multiple')
  );
}

// ── Generic test runner loop (rate-limit aware) ──

async function runTestLoop<Ctx>(
  tests: Array<{ id: string; name: string; category: string; fn: (ctx: Ctx) => Promise<void> }>,
  ctx: Ctx,
  abortRef: React.MutableRefObject<boolean>,
  isWarning: (msg: string) => boolean,
  onProgress: (completed: number) => void,
): Promise<TestResult[]> {
  const results: TestResult[] = tests.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    status: 'pending' as const,
  }));

  for (let i = 0; i < tests.length; i++) {
    if (abortRef.current) break;
    const test = tests[i];
    results[i] = { ...results[i], status: 'running' };

    const start = performance.now();
    try {
      // Wrap each test in rate-limit retry so transient 429s don't fail the suite
      await withRateLimitRetry(() => test.fn(ctx));
      results[i] = {
        ...results[i],
        status: 'pass',
        durationMs: Math.round(performance.now() - start),
        error: undefined,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results[i] = {
        ...results[i],
        status: isWarning(msg) ? 'warn' : 'fail',
        error: msg,
        durationMs: Math.round(performance.now() - start),
      };
    }
    onProgress(i + 1);

    // Small delay between tests to stay under Supabase rate limits
    if (i < tests.length - 1 && !abortRef.current) {
      await sleep(INTER_TEST_DELAY_MS);
    }
  }

  return results;
}

// ── Suite count ──
const SUITE_COUNT = 5; // System Tests, PandaDoc, Chatbot Infra, Chatbot Scenarios, 30-Question QA

const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function TestingHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'system';
  const [progress, setProgress] = useState<RunAllProgress | null>(null);
  const abortRef = useRef(false);
  const [showTracker, setShowTracker] = useState(false);
  const trackerRef = useRef<HTMLDivElement>(null);

  // ── Test Run Tracking (persists to Supabase) ──
  const tracking = useTestRunTracking();

  // Scroll the History panel into view when opened
  useEffect(() => {
    if (showTracker) {
      // Small delay to let React render the panel before scrolling
      requestAnimationFrame(() => {
        trackerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [showTracker]);

  const setTab = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  // ── Run All Suites ──

  const runAllSuites = useCallback(async () => {
    abortRef.current = false;
    let suitesCompleted = 0;
    let totalRun = 0;
    const runStart = performance.now();

    // Aggregate stats for tracking
    let totalPassed = 0;
    let totalFailed = 0;
    let totalWarnings = 0;
    const errorEntries: Array<{ testId: string; testName: string; suite: string; error: string }> =
      [];

    const updateProgress = (suite: string, testsRun: number, testsTotal: number) => {
      setProgress({
        running: true,
        currentSuite: suite,
        suitesCompleted,
        testsRun,
        testsTotal,
      });
    };

    setProgress({
      running: true,
      currentSuite: 'Starting...',
      suitesCompleted: 0,
      testsRun: 0,
      testsTotal: 0,
    });

    // Start tracking run in Supabase
    const trackingRunId = await tracking.startRun('run_all', SUITE_COUNT);

    try {
      // --- Suite 1: System Tests ---
      const { buildTests, STORAGE_KEY } = await import('./system-test-runner/testDefinitions');
      const systemTests = buildTests();

      updateProgress('System Tests', 0, systemTests.length);

      const sysCtx: TestContext = {
        createdContactIds: [],
        createdAccessIds: [],
        createdReleaseLogIds: [],
        createdTrackedLinkIds: [],
        testListingId: null,
        testBuyerId: null,
        testDealId: null,
      };

      const systemResults = await runTestLoop(
        systemTests,
        sysCtx,
        abortRef,
        isSystemTestWarning,
        (n) => updateProgress('System Tests', n, systemTests.length),
      );

      totalRun += systemResults.length;
      const sysTs = new Date().toISOString();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(systemResults));
        localStorage.setItem(STORAGE_KEY + '-ts', sysTs);
      } catch {
        /* ignore */
      }

      // Persist to Supabase
      if (trackingRunId) {
        await tracking.saveResults(trackingRunId, 'system', systemResults);
      }
      for (const r of systemResults) {
        if (r.status === 'pass') totalPassed++;
        else if (r.status === 'fail') {
          totalFailed++;
          if (r.error)
            errorEntries.push({ testId: r.id, testName: r.name, suite: 'system', error: r.error });
        } else if (r.status === 'warn') totalWarnings++;
      }

      suitesCompleted = 1;
      if (trackingRunId) await tracking.updateProgress(trackingRunId, suitesCompleted);
      if (abortRef.current) throw new Error('aborted');

      // --- Suite 2: PandaDoc Health Check ---
      updateProgress('PandaDoc Health Check', 0, 1);
      const { supabase } = await import('@/integrations/supabase/client');

      let pandaDocStatus: 'pass' | 'fail' = 'pass';
      let pandaDocError: string | undefined;
      const pandaDocStart = performance.now();

      try {
        const { data, error } = await supabase.functions.invoke('pandadoc-integration-test');
        if (error) {
          pandaDocStatus = 'fail';
          pandaDocError = error.message || 'Edge function invocation failed';
          localStorage.setItem(PANDADOC_KEY, JSON.stringify({ error: pandaDocError, results: [] }));
        } else if (data?.error) {
          pandaDocStatus = 'fail';
          pandaDocError = data.error;
          localStorage.setItem(PANDADOC_KEY, JSON.stringify({ error: data.error, results: [] }));
        } else {
          localStorage.setItem(PANDADOC_KEY, JSON.stringify(data));
        }
      } catch (e: unknown) {
        pandaDocStatus = 'fail';
        pandaDocError = e instanceof Error ? e.message : 'Unexpected error';
        localStorage.setItem(PANDADOC_KEY, JSON.stringify({ error: pandaDocError, results: [] }));
      }

      const pandaDocDuration = Math.round(performance.now() - pandaDocStart);
      if (trackingRunId) {
        await tracking.saveResults(trackingRunId, 'pandadoc', [
          {
            id: 'pandadoc-health',
            name: 'PandaDoc Health Check',
            category: 'Integration',
            status: pandaDocStatus,
            error: pandaDocError,
            durationMs: pandaDocDuration,
          },
        ]);
      }
      if (pandaDocStatus === 'pass') totalPassed++;
      else {
        totalFailed++;
        if (pandaDocError)
          errorEntries.push({
            testId: 'pandadoc-health',
            testName: 'PandaDoc Health Check',
            suite: 'pandadoc',
            error: pandaDocError,
          });
      }

      totalRun += 1;
      suitesCompleted = 2;
      if (trackingRunId) await tracking.updateProgress(trackingRunId, suitesCompleted);
      updateProgress('PandaDoc Health Check', 1, 1);
      if (abortRef.current) throw new Error('aborted');

      // --- Suite 3: Chatbot Infra Tests ---
      const { buildChatbotTests, CHATBOT_INFRA_STORAGE_KEY } =
        await import('./chatbot-test-runner/chatbotInfraTests');
      const chatbotTests = buildChatbotTests();

      updateProgress('Chatbot Infrastructure', 0, chatbotTests.length);

      const chatCtx: ChatbotTestContext = {
        createdConversationIds: [],
        createdAnalyticsIds: [],
        createdFeedbackIds: [],
      };

      const chatResults = await runTestLoop(
        chatbotTests,
        chatCtx,
        abortRef,
        isChatbotTestWarning,
        (n) => updateProgress('Chatbot Infrastructure', n, chatbotTests.length),
      );

      totalRun += chatResults.length;
      const chatTs = new Date().toISOString();
      try {
        localStorage.setItem(CHATBOT_INFRA_STORAGE_KEY, JSON.stringify(chatResults));
        localStorage.setItem(CHATBOT_INFRA_STORAGE_KEY + '-ts', JSON.stringify(chatTs));
      } catch {
        /* ignore */
      }

      // Persist to Supabase
      if (trackingRunId) {
        await tracking.saveResults(trackingRunId, 'chatbot_infra', chatResults);
      }
      for (const r of chatResults) {
        if (r.status === 'pass') totalPassed++;
        else if (r.status === 'fail') {
          totalFailed++;
          if (r.error)
            errorEntries.push({
              testId: r.id,
              testName: r.name,
              suite: 'chatbot_infra',
              error: r.error,
            });
        } else if (r.status === 'warn') totalWarnings++;
      }

      suitesCompleted = 3;
      if (trackingRunId) await tracking.updateProgress(trackingRunId, suitesCompleted);
      if (abortRef.current) throw new Error('aborted');

      // --- Suite 4: Chatbot Scenarios (auto-runnable only) ---
      const { getChatbotTestScenarios, runAutoChecks: runScenarioAutoChecks } =
        await import('./chatbot-test-runner/chatbotTestScenarios');
      const { sendAIQuery } = await import('./chatbot-test-runner/chatbotInfraTests');
      const { SCENARIO_STORAGE_KEY } = await import('./chatbot-test-runner/types');
      const allScenarios = getChatbotTestScenarios();
      const autoRunnable = allScenarios.filter((s) => !s.skipAutoRun);

      updateProgress('Chatbot Scenarios', 0, autoRunnable.length);

      const scenarioResultsMap: Record<string, unknown> = {};

      for (let si = 0; si < autoRunnable.length; si++) {
        if (abortRef.current) break;
        const scenario = autoRunnable[si];
        updateProgress('Chatbot Scenarios', si, autoRunnable.length);

        const start = performance.now();
        try {
          const response = await sendAIQuery(scenario.userMessage, 45000);
          const durationMs = Math.round(performance.now() - start);
          const autoChecks = runScenarioAutoChecks(scenario, response);
          const allPassed =
            autoChecks.length > 0 && autoChecks.every((c: { passed: boolean }) => c.passed);
          const anyFailed = autoChecks.some((c: { passed: boolean }) => !c.passed);
          const status = response.error ? 'fail' : allPassed ? 'pass' : anyFailed ? 'fail' : 'pass';

          scenarioResultsMap[scenario.id] = {
            id: scenario.id,
            status,
            notes: '',
            testedAt: new Date().toISOString(),
            aiResponse: response.text,
            toolsCalled: response.toolCalls.map((t: { name: string }) => t.name),
            routeCategory: response.routeInfo?.category ?? undefined,
            durationMs,
            autoChecks,
            error: response.error ?? undefined,
          };

          if (status === 'pass') {
            totalPassed++;
          } else {
            totalFailed++;
            if (response.error)
              errorEntries.push({
                testId: scenario.id,
                testName: scenario.name,
                suite: 'chatbot_scenarios',
                error: response.error,
              });
          }
        } catch (err) {
          const durationMs = Math.round(performance.now() - start);
          const errorMsg = err instanceof Error ? err.message : String(err);
          scenarioResultsMap[scenario.id] = {
            id: scenario.id,
            status: 'fail',
            notes: '',
            testedAt: new Date().toISOString(),
            error: errorMsg,
            durationMs,
            autoChecks: [],
          };
          totalFailed++;
          errorEntries.push({
            testId: scenario.id,
            testName: scenario.name,
            suite: 'chatbot_scenarios',
            error: errorMsg,
          });
        }
      }

      totalRun += autoRunnable.length;
      try {
        localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(scenarioResultsMap));
      } catch {
        /* ignore */
      }

      // Persist chatbot scenario results to Supabase
      if (trackingRunId) {
        const scenarioTrackingResults = Object.values(scenarioResultsMap).map((r: unknown) => {
          const sr = r as { id: string; status: string; error?: string; durationMs?: number };
          const scenarioDef = autoRunnable.find((s) => s.id === sr.id);
          return {
            id: sr.id,
            name: scenarioDef?.name || sr.id,
            category: scenarioDef?.category || 'Scenario',
            status: sr.status,
            error: sr.error,
            durationMs: sr.durationMs,
          };
        });
        await tracking.saveResults(trackingRunId, 'chatbot_scenarios', scenarioTrackingResults);
      }

      updateProgress('Chatbot Scenarios', autoRunnable.length, autoRunnable.length);
      suitesCompleted = 4;
      if (trackingRunId) await tracking.updateProgress(trackingRunId, suitesCompleted);
      if (abortRef.current) throw new Error('aborted');

      // --- Suite 5: 30-Question QA ---
      const { THIRTY_Q_SUITE } = await import('./chatbot-test-runner/thirtyQuestionSuite');

      updateProgress('30-Question QA', 0, THIRTY_Q_SUITE.length);

      const thirtyQResults: TestResult[] = [];

      for (let qi = 0; qi < THIRTY_Q_SUITE.length; qi++) {
        if (abortRef.current) break;
        const q = THIRTY_Q_SUITE[qi];
        updateProgress('30-Question QA', qi, THIRTY_Q_SUITE.length);

        const start = performance.now();
        try {
          const res = await sendAIQuery(q.question, 60000);
          const durationMs = Math.round(performance.now() - start);
          const hasError = !!res.error;
          const hasResponse = !!res.text?.trim();

          const status = hasError ? 'fail' : hasResponse ? 'pass' : 'fail';
          thirtyQResults.push({
            id: `30q-${q.id}`,
            name: `Q${q.id}: ${q.question.substring(0, 80)}`,
            category: q.category,
            status: status as TestResult['status'],
            error: res.error || undefined,
            durationMs,
          });

          if (status === 'pass') totalPassed++;
          else {
            totalFailed++;
            if (res.error)
              errorEntries.push({
                testId: `30q-${q.id}`,
                testName: `Q${q.id}`,
                suite: '30q',
                error: res.error,
              });
          }
        } catch (err) {
          const durationMs = Math.round(performance.now() - start);
          const errorMsg = err instanceof Error ? err.message : String(err);
          thirtyQResults.push({
            id: `30q-${q.id}`,
            name: `Q${q.id}: ${q.question.substring(0, 80)}`,
            category: q.category,
            status: 'fail',
            error: errorMsg,
            durationMs,
          });
          totalFailed++;
          errorEntries.push({
            testId: `30q-${q.id}`,
            testName: `Q${q.id}`,
            suite: '30q',
            error: errorMsg,
          });
        }
      }

      totalRun += THIRTY_Q_SUITE.length;
      try {
        // Save as the same format ThirtyQuestionTest uses so results show in that tab
        const thirtyQStorage = THIRTY_Q_SUITE.map((q, i) => {
          const result = thirtyQResults[i];
          return {
            question: q,
            status:
              result?.status === 'pass' ? 'pass' : result?.status === 'fail' ? 'fail' : 'error',
            actualResponse: '',
            routeCategory: '',
            tools: [],
            durationMs: result?.durationMs || 0,
            error: result?.error,
          };
        });
        localStorage.setItem('sourceco-30q-test-results', JSON.stringify(thirtyQStorage));
        localStorage.setItem('sourceco-30q-test-results-ts', new Date().toISOString());
      } catch {
        /* ignore */
      }

      if (trackingRunId) {
        await tracking.saveResults(trackingRunId, '30q', thirtyQResults);
      }

      updateProgress('30-Question QA', THIRTY_Q_SUITE.length, THIRTY_Q_SUITE.length);
      suitesCompleted = 5;

      // Complete the tracking run
      if (trackingRunId) {
        await tracking.completeRun(trackingRunId, 'completed', {
          totalTests: totalRun,
          passed: totalPassed,
          failed: totalFailed,
          warnings: totalWarnings,
          durationMs: Math.round(performance.now() - runStart),
          suitesCompleted,
          errorSummary: errorEntries,
        });
      }

      toast.success(`Run All complete: ${totalRun} tests across ${SUITE_COUNT} suites`);
    } catch (e) {
      if (abortRef.current) {
        // Mark as cancelled in tracking
        if (trackingRunId) {
          await tracking.completeRun(trackingRunId, 'cancelled', {
            totalTests: totalRun,
            passed: totalPassed,
            failed: totalFailed,
            warnings: totalWarnings,
            durationMs: Math.round(performance.now() - runStart),
            suitesCompleted,
            errorSummary: errorEntries,
          });
        }
        toast.info('Run All stopped');
      } else {
        // Mark as failed in tracking
        if (trackingRunId) {
          await tracking.completeRun(trackingRunId, 'failed', {
            totalTests: totalRun,
            passed: totalPassed,
            failed: totalFailed,
            warnings: totalWarnings,
            durationMs: Math.round(performance.now() - runStart),
            suitesCompleted,
            errorSummary: errorEntries,
          });
        }
        toast.error('Run All failed: ' + (e instanceof Error ? e.message : String(e)));
      }
    } finally {
      setProgress(null);
    }
  }, [tracking]);

  const stopAll = useCallback(() => {
    abortRef.current = true;
  }, []);

  // ── Export All Results ──

  const exportAllResults = useCallback(() => {
    const readTs = (key: string): string | null => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        // Try JSON parse first (chatbot infra stores as JSON string)
        try {
          return JSON.parse(raw);
        } catch {
          return raw; // System tests store raw ISO string
        }
      } catch {
        return null;
      }
    };

    const suites: Record<string, unknown> = {};
    let hasSomeData = false;

    // 1. System Tests
    try {
      const raw = localStorage.getItem(SYSTEM_TEST_KEY);
      if (raw) {
        const results = JSON.parse(raw) as TestResult[];
        const pass = results.filter((r) => r.status === 'pass').length;
        const fail = results.filter((r) => r.status === 'fail').length;
        const warn = results.filter((r) => r.status === 'warn').length;
        suites['system_tests'] = {
          ranAt: readTs(SYSTEM_TEST_KEY + '-ts'),
          summary: { total: results.length, pass, fail, warn },
          results,
        };
        hasSomeData = true;
      }
    } catch {
      /* skip */
    }

    // 2. PandaDoc
    try {
      const raw = localStorage.getItem(PANDADOC_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.error) {
          suites['pandadoc'] = { error: data.error };
        } else {
          const results = data.results || [];
          const pass = results.filter((r: { status: string }) => r.status === 'pass').length;
          const fail = results.filter((r: { status: string }) => r.status === 'fail').length;
          const warn = results.filter((r: { status: string }) => r.status === 'warn').length;
          const skip = results.filter((r: { status: string }) => r.status === 'skip').length;
          suites['pandadoc'] = {
            ranAt: data.ranAt || null,
            summary: { total: results.length, pass, fail, warn, skip },
            results,
          };
        }
        hasSomeData = true;
      }
    } catch {
      /* skip */
    }

    // 3. Chatbot Infra
    try {
      const raw = localStorage.getItem(CHATBOT_INFRA_KEY);
      if (raw) {
        const results = JSON.parse(raw) as ChatbotTestResult[];
        const pass = results.filter((r) => r.status === 'pass').length;
        const fail = results.filter((r) => r.status === 'fail').length;
        const warn = results.filter((r) => r.status === 'warn').length;
        suites['chatbot_infra'] = {
          ranAt: readTs(CHATBOT_INFRA_KEY + '-ts'),
          summary: { total: results.length, pass, fail, warn },
          results,
        };
        hasSomeData = true;
      }
    } catch {
      /* skip */
    }

    // 4. Chatbot Scenarios
    try {
      const raw = localStorage.getItem(SCENARIO_KEY);
      if (raw) {
        const results = JSON.parse(raw);
        const pass = results.filter((r: { status: string }) => r.status === 'pass').length;
        const fail = results.filter((r: { status: string }) => r.status === 'fail').length;
        const skip = results.filter((r: { status: string }) => r.status === 'skip').length;
        suites['chatbot_scenarios'] = {
          summary: { total: results.length, pass, fail, skip },
          results,
        };
        hasSomeData = true;
      }
    } catch {
      /* skip */
    }

    // 5. 30-Question QA
    try {
      const raw = localStorage.getItem(THIRTY_Q_KEY);
      if (raw) {
        const results = JSON.parse(raw);
        const pass = results.filter((r: { status: string }) => r.status === 'pass').length;
        const fail = results.filter((r: { status: string }) => r.status === 'fail').length;
        const error = results.filter((r: { status: string }) => r.status === 'error').length;
        suites['thirty_question_qa'] = {
          ranAt: readTs(THIRTY_Q_KEY + '-ts'),
          summary: { total: results.length, pass, fail, error },
          results,
        };
        hasSomeData = true;
      }
    } catch {
      /* skip */
    }

    if (!hasSomeData) {
      toast.error('No test results to export. Run some tests first.');
      return;
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      platform: 'SourceCo Connect Market Nexus',
      suites,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Exported all test results');
  }, []);

  // ── Overall progress percentage ──
  const overallProgress =
    progress && progress.testsTotal > 0
      ? Math.round(
          (progress.suitesCompleted / SUITE_COUNT) * 100 +
            (progress.testsRun / progress.testsTotal / SUITE_COUNT) * 100,
        )
      : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="px-8 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1 min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">Testing & Diagnostics</h1>
              <p className="text-sm text-muted-foreground">
                Enrichment tests, system integration tests, PandaDoc health checks, Smartlead
                integration, and AI chatbot QA.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {progress ? (
                <Button variant="destructive" onClick={stopAll} className="gap-2">
                  <Square className="h-4 w-4" />
                  Stop All
                </Button>
              ) : (
                <Button onClick={runAllSuites} className="gap-2">
                  <PlayCircle className="h-4 w-4" />
                  Run All Suites
                </Button>
              )}
              <Button
                variant={showTracker ? 'default' : 'outline'}
                onClick={() => setShowTracker((v) => !v)}
                className="gap-2"
              >
                <History className="h-4 w-4" />
                History
              </Button>
              <Button variant="outline" onClick={exportAllResults} className="gap-2">
                <Download className="h-4 w-4" />
                Export Results
              </Button>
            </div>
          </div>

          {/* Run All progress bar */}
          {progress && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Running:{' '}
                  <span className="font-medium text-foreground">{progress.currentSuite}</span>
                  {progress.testsTotal > 0 && (
                    <span className="ml-2">
                      ({progress.testsRun}/{progress.testsTotal} tests)
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground">
                  Suite {progress.suitesCompleted + 1} of {SUITE_COUNT}
                </span>
              </div>
              <Progress value={overallProgress} className="h-2" />
            </div>
          )}
        </div>
      </div>

      {showTracker && (
        <div ref={trackerRef} className="px-8 pt-6">
          <Suspense fallback={<Loading />}>
            <TestRunTracker
              runs={tracking.runs}
              loading={tracking.loading}
              onRefresh={tracking.fetchRuns}
              onDelete={tracking.deleteRun}
              onFetchResults={tracking.fetchRunResults}
            />
          </Suspense>
        </div>
      )}

      <div className="px-8 py-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="system" className="gap-2">
              <FlaskConical className="h-4 w-4" />
              System Tests
            </TabsTrigger>
            <TabsTrigger value="pandadoc" className="gap-2">
              <Activity className="h-4 w-4" />
              PandaDoc Health
            </TabsTrigger>
            <TabsTrigger value="smartlead" className="gap-2">
              <Mail className="h-4 w-4" />
              Smartlead
            </TabsTrigger>
            <TabsTrigger value="chatbot" className="gap-2">
              <Bot className="h-4 w-4" />
              AI Chatbot
            </TabsTrigger>
            <TabsTrigger value="30q" className="gap-2">
              <ListChecks className="h-4 w-4" />
              30-Question QA
            </TabsTrigger>
            <TabsTrigger value="listing-pipeline" className="gap-2">
              <Store className="h-4 w-4" />
              Listing Pipeline
            </TabsTrigger>
            <TabsTrigger value="buyer-rec" className="gap-2">
              <Sparkles className="h-4 w-4" />
              AI Buyer Engine
            </TabsTrigger>
            <TabsTrigger value="buyer-classify" className="gap-2">
              <ListChecks className="h-4 w-4" />
              Buyer Classifier
            </TabsTrigger>
            <TabsTrigger value="prompt-tests" className="gap-2">
              <FileText className="h-4 w-4" />
              Prompt Tests
            </TabsTrigger>
            <TabsTrigger value="contact-lookup" className="gap-2">
              <Users className="h-4 w-4" />
              Contact Lookup
            </TabsTrigger>
          </TabsList>

          <TabsContent value="system">
            <Suspense fallback={<Loading />}>
              <SystemTestRunner />
            </Suspense>
          </TabsContent>

          <TabsContent value="pandadoc">
            <Suspense fallback={<Loading />}>
              <PandaDocHealthCheck />
            </Suspense>
          </TabsContent>

          <TabsContent value="smartlead">
            <Suspense fallback={<Loading />}>
              <SmartleadTestPage />
            </Suspense>
          </TabsContent>

          <TabsContent value="chatbot">
            <Suspense fallback={<Loading />}>
              <ChatbotTestRunner />
            </Suspense>
          </TabsContent>

          <TabsContent value="30q">
            <Suspense fallback={<Loading />}>
              <ThirtyQuestionTest />
            </Suspense>
          </TabsContent>

          <TabsContent value="listing-pipeline">
            <Suspense fallback={<Loading />}>
              <ListingPipelineTest />
            </Suspense>
          </TabsContent>

          <TabsContent value="buyer-rec">
            <Suspense fallback={<Loading />}>
              <BuyerRecommendationTest />
            </Suspense>
          </TabsContent>

          <TabsContent value="buyer-classify">
            <Suspense fallback={<Loading />}>
              <BuyerClassificationTest />
            </Suspense>
          </TabsContent>

          <TabsContent value="prompt-tests">
            <Suspense fallback={<Loading />}>
              <PromptTestRunner />
            </Suspense>
          </TabsContent>

          <TabsContent value="contact-lookup">
            <Suspense fallback={<Loading />}>
              <ContactLookupTestPanel />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
