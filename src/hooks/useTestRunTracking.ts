/**
 * useTestRunTracking
 *
 * Persists Testing & Diagnostics results to Supabase so users can
 * review historical test runs even after navigating away or if the
 * browser tab was closed mid-run.
 *
 * Tables: test_run_tracking, test_run_results
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ── Types ──

export type TestRunType =
  | 'run_all'
  | 'system'
  | 'pandadoc'
  | 'chatbot_infra'
  | 'chatbot_scenarios'
  | '30q'
  | 'enrichment'
  | 'smartlead'
  | 'listing_pipeline'
  | 'buyer_rec';

export type TestRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface TestRunRow {
  id: string;
  run_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  total_tests: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  duration_ms: number | null;
  suites_completed: number | null;
  suites_total: number | null;
  error_summary: unknown;
  triggered_by: string | null;
  created_at: string;
}

export interface TestResultRow {
  id: string;
  run_id: string;
  suite: string;
  test_id: string;
  test_name: string;
  category: string | null;
  status: string;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

interface ErrorSummaryEntry {
  testId: string;
  testName: string;
  suite: string;
  error: string;
}

// ── Hook ──

export function useTestRunTracking() {
  const [runs, setRuns] = useState<TestRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const activeRunIdRef = useRef<string | null>(null);

  // Fetch recent runs (last 30 days, max 50)
  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('test_run_tracking')
        .select('*')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setRuns((data as TestRunRow[]) || []);
    } catch (err) {
      console.error('Failed to fetch test runs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch individual results for a specific run
  const fetchRunResults = useCallback(async (runId: string): Promise<TestResultRow[]> => {
    try {
      const { data, error } = await supabase
        .from('test_run_results')
        .select('*')
        .eq('run_id', runId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data as TestResultRow[]) || [];
    } catch (err) {
      console.error('Failed to fetch run results:', err);
      return [];
    }
  }, []);

  // Start a new test run — returns the run ID
  const startRun = useCallback(
    async (runType: TestRunType, suitesTotal?: number): Promise<string | null> => {
      try {
        const { data, error } = await supabase
          .from('test_run_tracking')
          .insert({
            run_type: runType,
            status: 'running',
            suites_total: suitesTotal ?? null,
          })
          .select('id')
          .single();

        if (error) throw error;
        const id = (data as { id: string }).id;
        activeRunIdRef.current = id;
        // Refresh list
        fetchRuns();
        return id;
      } catch (err) {
        console.error('Failed to start test run:', err);
        return null;
      }
    },
    [fetchRuns],
  );

  // Save a batch of test results for a suite within a run
  const saveResults = useCallback(
    async (
      runId: string,
      suite: string,
      results: Array<{
        id: string;
        name: string;
        category: string;
        status: string;
        error?: string;
        durationMs?: number;
      }>,
    ) => {
      if (results.length === 0) return;

      try {
        const rows = results.map((r) => ({
          run_id: runId,
          suite,
          test_id: r.id,
          test_name: r.name,
          category: r.category || null,
          status: r.status,
          error: r.error || null,
          duration_ms: r.durationMs ?? null,
        }));

        // Insert in batches of 500 to avoid payload limits
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500);
          const { error } = await supabase.from('test_run_results').insert(batch);
          if (error) throw error;
        }
      } catch (err) {
        console.error('Failed to save test results:', err);
      }
    },
    [],
  );

  // Update suite progress on the run
  const updateProgress = useCallback(
    async (runId: string, suitesCompleted: number) => {
      try {
        const { error } = await supabase
          .from('test_run_tracking')
          .update({ suites_completed: suitesCompleted })
          .eq('id', runId);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to update progress:', err);
      }
    },
    [],
  );

  // Complete a test run with final stats
  const completeRun = useCallback(
    async (
      runId: string,
      finalStatus: 'completed' | 'failed' | 'cancelled',
      stats: {
        totalTests: number;
        passed: number;
        failed: number;
        warnings: number;
        skipped?: number;
        durationMs: number;
        suitesCompleted: number;
        errorSummary?: ErrorSummaryEntry[];
      },
    ) => {
      try {
        const { error } = await supabase
          .from('test_run_tracking')
          .update({
            status: finalStatus,
            completed_at: new Date().toISOString(),
            total_tests: stats.totalTests,
            passed: stats.passed,
            failed: stats.failed,
            warnings: stats.warnings,
            skipped: stats.skipped ?? 0,
            duration_ms: stats.durationMs,
            suites_completed: stats.suitesCompleted,
            error_summary: (stats.errorSummary ?? []) as unknown as import('@/integrations/supabase/types').Json,
          })
          .eq('id', runId);

        if (error) throw error;
        activeRunIdRef.current = null;
        fetchRuns();
      } catch (err) {
        console.error('Failed to complete test run:', err);
      }
    },
    [fetchRuns],
  );

  // Delete a historical run
  const deleteRun = useCallback(
    async (runId: string) => {
      try {
        const { error } = await supabase
          .from('test_run_tracking')
          .delete()
          .eq('id', runId);
        if (error) throw error;
        setRuns((prev) => prev.filter((r) => r.id !== runId));
      } catch (err) {
        console.error('Failed to delete test run:', err);
      }
    },
    [],
  );

  // Load on mount
  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  return {
    runs,
    loading,
    fetchRuns,
    fetchRunResults,
    startRun,
    saveResults,
    updateProgress,
    completeRun,
    deleteRun,
    activeRunId: activeRunIdRef.current,
  };
}
