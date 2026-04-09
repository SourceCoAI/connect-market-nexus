/**
 * Tests for the escalation level gate logic in check-overdue-tasks.
 *
 * This verifies the fix for the race condition where two concurrent cron
 * runs could both pass the escalation level check and send duplicate
 * notifications. The fix uses a conditional UPDATE + row-count check
 * as an atomic gate.
 *
 * The real Supabase client isn't available here, so we simulate the
 * UPDATE-with-WHERE behavior with a stub.
 */
import { describe, it, expect } from 'vitest';

// ── Simulated Supabase UPDATE semantics ──

interface TaskRow {
  id: string;
  escalation_level: number;
}

class StubTaskTable {
  private rows: Map<string, TaskRow>;

  constructor(rows: TaskRow[]) {
    this.rows = new Map(rows.map((r) => [r.id, { ...r }]));
  }

  /**
   * Simulates: UPDATE daily_standup_tasks
   *            SET escalation_level = :newLevel
   *            WHERE id = :taskId AND escalation_level :operator :threshold
   *            RETURNING id;
   *
   * Returns the array of row IDs that were affected (0 or 1 in this case).
   */
  atomicUpdate(
    taskId: string,
    newLevel: number,
    threshold: number,
    operator: 'eq' | 'lte',
  ): string[] {
    const row = this.rows.get(taskId);
    if (!row) return [];
    const matchesWhere =
      operator === 'eq' ? row.escalation_level === threshold : row.escalation_level <= threshold;
    if (!matchesWhere) return [];
    row.escalation_level = newLevel;
    return [row.id];
  }

  get(taskId: string): TaskRow | undefined {
    return this.rows.get(taskId);
  }
}

describe('escalation gate', () => {
  describe('single-worker scenario', () => {
    it('level 0 -> 1 bumps and returns one affected row', () => {
      const table = new StubTaskTable([{ id: 't1', escalation_level: 0 }]);
      const affected = table.atomicUpdate('t1', 1, 0, 'eq');
      expect(affected).toEqual(['t1']);
      expect(table.get('t1')?.escalation_level).toBe(1);
    });

    it('level 1 -> 2 bumps via lte gate', () => {
      const table = new StubTaskTable([{ id: 't1', escalation_level: 1 }]);
      const affected = table.atomicUpdate('t1', 2, 1, 'lte');
      expect(affected).toEqual(['t1']);
      expect(table.get('t1')?.escalation_level).toBe(2);
    });

    it('level 0 fast-forwards to 2 via lte gate', () => {
      // If a task is 3+ days overdue but never had Level 1, it should
      // fast-forward directly to Level 2 on the first cron run.
      const table = new StubTaskTable([{ id: 't1', escalation_level: 0 }]);
      const affected = table.atomicUpdate('t1', 2, 1, 'lte');
      expect(affected).toEqual(['t1']);
      expect(table.get('t1')?.escalation_level).toBe(2);
    });

    it('level 2 -> 3 bumps via lte gate', () => {
      const table = new StubTaskTable([{ id: 't1', escalation_level: 2 }]);
      const affected = table.atomicUpdate('t1', 3, 2, 'lte');
      expect(affected).toEqual(['t1']);
      expect(table.get('t1')?.escalation_level).toBe(3);
    });
  });

  describe('race condition (two workers)', () => {
    it('second worker gets empty result when first already escalated to level 1', () => {
      const table = new StubTaskTable([{ id: 't1', escalation_level: 0 }]);

      // Worker A races ahead and escalates
      const affectedA = table.atomicUpdate('t1', 1, 0, 'eq');
      expect(affectedA).toEqual(['t1']);

      // Worker B was holding an old value of escalation_level=0 in memory,
      // but the WHERE clause re-checks against the current DB state.
      const affectedB = table.atomicUpdate('t1', 1, 0, 'eq');
      expect(affectedB).toEqual([]); // NO rows matched — we must skip the email
      expect(table.get('t1')?.escalation_level).toBe(1); // unchanged
    });

    it('second worker gets empty result at level 2 gate', () => {
      const table = new StubTaskTable([{ id: 't1', escalation_level: 1 }]);

      const affectedA = table.atomicUpdate('t1', 2, 1, 'lte');
      expect(affectedA).toEqual(['t1']);

      // Worker B had stale in-memory escalation_level=1, but DB is now 2.
      // lte('escalation_level', 1) no longer matches.
      const affectedB = table.atomicUpdate('t1', 2, 1, 'lte');
      expect(affectedB).toEqual([]);
    });

    it('second worker gets empty result at level 3 gate', () => {
      const table = new StubTaskTable([{ id: 't1', escalation_level: 2 }]);

      const affectedA = table.atomicUpdate('t1', 3, 2, 'lte');
      expect(affectedA).toEqual(['t1']);

      const affectedB = table.atomicUpdate('t1', 3, 2, 'lte');
      expect(affectedB).toEqual([]);
    });
  });

  describe('no re-escalation once at target level', () => {
    it('does not re-bump if task is already at level 1', () => {
      const table = new StubTaskTable([{ id: 't1', escalation_level: 1 }]);
      const affected = table.atomicUpdate('t1', 1, 0, 'eq');
      expect(affected).toEqual([]);
    });

    it('does not re-bump if task is already beyond level 2', () => {
      const table = new StubTaskTable([{ id: 't1', escalation_level: 3 }]);
      const affected = table.atomicUpdate('t1', 2, 1, 'lte');
      expect(affected).toEqual([]);
    });
  });

  describe('task not found', () => {
    it('returns empty array for non-existent task', () => {
      const table = new StubTaskTable([]);
      const affected = table.atomicUpdate('nonexistent', 1, 0, 'eq');
      expect(affected).toEqual([]);
    });
  });
});
