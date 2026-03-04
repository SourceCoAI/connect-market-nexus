import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Sparkles, Globe, UserPlus } from 'lucide-react';

const SOURCE_CONFIG: Record<string, { label: string; color: string; icon: typeof Sparkles }> = {
  ai_seeded: { label: 'AI Search', color: 'bg-purple-100 text-purple-700', icon: Sparkles },
  recommendation: { label: 'Recommended', color: 'bg-teal-100 text-teal-700', icon: Sparkles },
  marketplace: { label: 'Marketplace', color: 'bg-blue-100 text-blue-700', icon: Globe },
  manual: { label: 'Manual', color: 'bg-gray-100 text-gray-600', icon: UserPlus },
  scored: { label: 'Buyer Pool', color: 'bg-gray-100 text-gray-600', icon: Globe },
};

interface SourceBadgeProps {
  source: string | null | undefined;
  className?: string;
}

export function SourceBadge({ source, className }: SourceBadgeProps) {
  if (!source) return null;
  const config = SOURCE_CONFIG[source] || SOURCE_CONFIG.manual;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn('text-[10px] gap-0.5', config.color, className)}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </Badge>
  );
}
