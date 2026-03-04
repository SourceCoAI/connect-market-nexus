import { useMemo, useCallback } from 'react';
import { useBuyerIntroductions } from '@/hooks/use-buyer-introductions';
import type { BuyerIntroduction, IntroductionStatus, ScoreSnapshot, UpdateBuyerIntroductionInput } from '@/types/buyer-introductions';

export type KanbanColumn = 'to_introduce' | 'introduced' | 'interested' | 'passed';

const COLUMN_STATUSES: Record<KanbanColumn, IntroductionStatus[]> = {
  to_introduce: ['need_to_show_deal'],
  introduced: ['outreach_initiated'],
  interested: ['meeting_scheduled', 'fit_and_interested'],
  passed: ['not_a_fit'],
};

const STATUS_FOR_COLUMN: Record<KanbanColumn, IntroductionStatus> = {
  to_introduce: 'need_to_show_deal',
  introduced: 'outreach_initiated',
  interested: 'meeting_scheduled',
  passed: 'not_a_fit',
};

export function getColumnForStatus(status: IntroductionStatus): KanbanColumn {
  for (const [column, statuses] of Object.entries(COLUMN_STATUSES)) {
    if (statuses.includes(status)) return column as KanbanColumn;
  }
  return 'to_introduce';
}

export function getStatusForColumn(column: KanbanColumn): IntroductionStatus {
  return STATUS_FOR_COLUMN[column];
}

export function useIntroductionPipeline(listingId: string | undefined) {
  const hook = useBuyerIntroductions(listingId);
  const { introductions, updateStatus } = hook;

  const columns = useMemo(() => {
    const result: Record<KanbanColumn, BuyerIntroduction[]> = {
      to_introduce: [],
      introduced: [],
      interested: [],
      passed: [],
    };

    for (const intro of introductions) {
      const col = getColumnForStatus(intro.introduction_status);
      result[col].push(intro);
    }

    // Sort each column
    result.to_introduce.sort((a, b) => {
      const aSnap = a.score_snapshot as ScoreSnapshot | null;
      const bSnap = b.score_snapshot as ScoreSnapshot | null;
      return (bSnap?.composite_score ?? 0) - (aSnap?.composite_score ?? 0); // highest score first
    });

    result.introduced.sort((a, b) => {
      const aDate = a.introduction_date ? new Date(a.introduction_date).getTime() : Infinity;
      const bDate = b.introduction_date ? new Date(b.introduction_date).getTime() : Infinity;
      return aDate - bDate; // oldest first (longest-waiting at top)
    });

    result.interested.sort((a, b) => {
      const aDate = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bDate = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bDate - aDate; // newest first
    });

    result.passed.sort((a, b) => {
      const aDate = a.passed_date ? new Date(a.passed_date).getTime() : 0;
      const bDate = b.passed_date ? new Date(b.passed_date).getTime() : 0;
      return bDate - aDate; // newest first
    });

    return result;
  }, [introductions]);

  const moveToColumn = useCallback(
    (
      introId: string,
      targetColumn: KanbanColumn,
      extra?: {
        introduction_method?: string;
        introduction_notes?: string;
        passed_reason?: string;
        passed_notes?: string;
        buyer_feedback?: string;
        next_step?: string;
        expected_next_step_date?: string;
      },
    ) => {
      const newStatus = getStatusForColumn(targetColumn);
      const updates: UpdateBuyerIntroductionInput = {
        introduction_status: newStatus,
        ...extra,
      };

      if (targetColumn === 'introduced') {
        updates.introduction_date = new Date().toISOString();
      }
      if (targetColumn === 'passed') {
        updates.passed_date = new Date().toISOString().split('T')[0];
      }

      updateStatus({ id: introId, updates });
    },
    [updateStatus],
  );

  /** Update only the notes on an introduction — does NOT change status */
  const updateIntroductionNotes = useCallback(
    (introId: string, notes: string) => {
      updateStatus({
        id: introId,
        updates: { introduction_notes: notes },
      });
    },
    [updateStatus],
  );

  const introductionIds = useMemo(() => {
    return new Set(introductions.map((i) => i.remarketing_buyer_id).filter(Boolean) as string[]);
  }, [introductions]);

  return {
    ...hook,
    columns,
    moveToColumn,
    updateIntroductionNotes,
    introductionIds,
  };
}
