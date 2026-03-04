import { cn } from '@/lib/utils';

interface ScoreBadgeProps {
  score: number | null | undefined;
  className?: string;
}

export function ScoreBadge({ score, className }: ScoreBadgeProps) {
  if (score == null) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded-md text-xs font-bold tabular-nums',
        score >= 80
          ? 'bg-emerald-100 text-emerald-700'
          : score >= 50
            ? 'bg-amber-100 text-amber-700'
            : 'bg-red-100 text-red-600',
        className,
      )}
    >
      {score}
    </span>
  );
}
