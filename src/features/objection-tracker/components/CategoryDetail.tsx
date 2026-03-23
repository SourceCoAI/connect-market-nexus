import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Play, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useObjectionCategories } from '../hooks/useObjectionCategories';
import { useObjectionInstances } from '../hooks/useObjectionInstances';
import { usePublishedPlaybook } from '../hooks/useObjectionPlaybook';
import type { ObjectionInstance } from '../types';

interface CategoryDetailProps {
  categoryId: string;
  categoryName: string;
  onBack: () => void;
}

export function CategoryDetail({ categoryId, categoryName, onBack }: CategoryDetailProps) {
  const [filter, setFilter] = useState<'all' | 'overcame' | 'not_overcame'>('all');
  const [page, setPage] = useState(0);

  const { data: categories } = useObjectionCategories();
  const category = (categories || []).find((c) => c.id === categoryId);
  const { data: playbook, isLoading: playbookLoading } = usePublishedPlaybook(categoryId);
  const { data: instanceData, isLoading: instancesLoading } = useObjectionInstances(
    categoryId,
    filter,
    page,
  );

  const instances = instanceData?.instances || [];

  return (
    <div className="space-y-6">
      {/* Back button and title */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h2 className="text-2xl font-bold">{categoryName}</h2>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-4">
        <Card className="flex-1 min-w-[150px]">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{category?.instance_count ?? 0}</div>
            <div className="text-xs text-muted-foreground">Total Instances</div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[150px]">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{category?.overcome_rate ?? 0}%</div>
            <div className="text-xs text-muted-foreground">Overcome Rate</div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[150px]">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">
              {category?.last_updated
                ? format(new Date(category.last_updated), 'MMM d')
                : '—'}
            </div>
            <div className="text-xs text-muted-foreground">Last Updated</div>
          </CardContent>
        </Card>
      </div>

      {/* AI Playbook Section */}
      <div>
        <h3 className="text-lg font-semibold mb-3">AI Playbook</h3>
        {playbookLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : playbook ? (
          <div className="space-y-4">
            {/* Frameworks */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(playbook.frameworks || []).map((fw, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">{fw.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    <p className="text-sm text-muted-foreground">{fw.description}</p>
                    <div className="space-y-1">
                      {(fw.example_phrases || []).map((phrase, j) => (
                        <div
                          key={j}
                          className="text-xs bg-primary/5 border border-primary/10 rounded px-2 py-1.5 italic"
                        >
                          "{phrase}"
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* What not to say */}
            {playbook.mistakes_to_avoid && playbook.mistakes_to_avoid.length > 0 && (
              <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/10 dark:border-red-900/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-red-700 dark:text-red-400">
                    What Not to Say
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {playbook.mistakes_to_avoid.map((mistake, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium text-red-600 dark:text-red-400">
                        {mistake.pattern}
                      </span>
                      <span className="text-muted-foreground"> — {mistake.why_it_fails}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Metadata */}
            <p className="text-xs text-muted-foreground">
              Based on {playbook.data_basis_count} calls · AI confidence:{' '}
              {Math.round((playbook.ai_confidence || 0) * 100)}% · Last updated{' '}
              {format(new Date(playbook.generated_at), 'MMM d, yyyy')}
            </p>
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Playbook generates automatically once 10+ instances are recorded.{' '}
              {category?.instance_count ?? 0} recorded so far.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Call Examples Section */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Call Examples</h3>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-4">
          {(['all', 'overcame', 'not_overcame'] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setFilter(f);
                setPage(0);
              }}
            >
              {f === 'all' ? 'All' : f === 'overcame' ? 'Overcame' : 'Did Not Overcome'}
            </Button>
          ))}
        </div>

        {instancesLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : instances.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No call examples found for this filter.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {instances.map((inst) => (
              <InstanceCard key={inst.id} instance={inst} />
            ))}

            {instanceData?.hasMore && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setPage((p) => p + 1)}
              >
                Load More
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InstanceCard({ instance }: { instance: ObjectionInstance }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{instance.caller_name || 'Unknown'}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {format(new Date(instance.created_at), 'MMM d, yyyy')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={instance.overcame ? 'default' : 'destructive'}
              className={
                instance.overcame
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
              }
            >
              {instance.overcame ? 'Overcame' : 'Did Not Overcome'}
            </Badge>
            {instance.handling_score && (
              <Badge variant="outline" className="text-xs">
                Score: {instance.handling_score}/10
              </Badge>
            )}
          </div>
        </div>

        {/* Objection text */}
        <blockquote className="border-l-4 border-muted-foreground/20 pl-3 italic text-sm text-muted-foreground">
          "{instance.objection_text}"
        </blockquote>

        {/* Caller response */}
        {instance.caller_response_text && (
          <p className="text-sm pl-3">{instance.caller_response_text}</p>
        )}

        {/* Play button */}
        <div className="flex justify-end">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {instance.recording_url ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(instance.recording_url!, '_blank')}
                  >
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Play
                    <ExternalLink className="h-3 w-3 ml-1 opacity-50" />
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Play
                  </Button>
                )}
              </TooltipTrigger>
              {!instance.recording_url && (
                <TooltipContent>No recording available</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
