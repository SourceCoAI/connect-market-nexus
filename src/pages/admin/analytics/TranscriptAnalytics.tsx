import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TranscriptHealth } from '@/types/transcript';

interface SourceBreakdown {
  source: string;
  count: number;
  processed: number;
}

export default function TranscriptAnalytics() {
  const { data: health = [], isLoading } = useQuery({
    queryKey: ['transcript-health'],
    queryFn: async () => {
      // transcript_extraction_health is a view not in generated Supabase types
      type UntypedTable = Parameters<typeof supabase.from>[0];
      const { data, error } = await supabase
        .from('transcript_extraction_health' as UntypedTable)
        .select('*');

      if (error) throw error;
      return (data || []) as unknown as TranscriptHealth[];
    }
  });

  const { data: sourceBreakdown = [] } = useQuery({
    queryKey: ['transcript-source-breakdown'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_transcripts')
        .select('source, processed_at');

      if (error) throw error;

      const bySource = new Map<string, { count: number; processed: number }>();
      for (const row of data || []) {
        const src = row.source || 'unknown';
        const entry = bySource.get(src) || { count: 0, processed: 0 };
        entry.count++;
        if (row.processed_at) entry.processed++;
        bySource.set(src, entry);
      }

      return Array.from(bySource.entries()).map(([source, stats]) => ({
        source,
        count: stats.count,
        processed: stats.processed,
      })) as SourceBreakdown[];
    }
  });

  const sourceColors: Record<string, string> = {
    fireflies: 'bg-orange-100 text-orange-700 border-orange-300',
    phoneburner: 'bg-green-100 text-green-700 border-green-300',
    upload: 'bg-blue-100 text-blue-700 border-blue-300',
    link: 'bg-purple-100 text-purple-700 border-purple-300',
    manual: 'bg-gray-100 text-gray-700 border-gray-300',
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-muted-foreground">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Transcript Analytics</h1>

      {sourceBreakdown.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">By Source</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {sourceBreakdown
              .sort((a, b) => b.count - a.count)
              .map((entry) => (
              <Card key={entry.source}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={sourceColors[entry.source] || 'bg-gray-100 text-gray-700'}
                    >
                      {entry.source}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total:</span>
                      <span className="font-medium">{entry.count}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Processed:</span>
                      <span className="font-medium">{entry.processed}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Rate:</span>
                      <span className="font-medium">
                        {entry.count > 0 ? Math.round((entry.processed / entry.count) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">Extraction Health</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {health.map((table) => (
            <Card key={table.table_name}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium capitalize">
                  {table.table_name.replace(/_/g, ' ')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-medium">{table.total_transcripts}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Processed:</span>
                    <span className="font-medium">{table.processed_count}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Success Rate:</span>
                    <span className="font-medium">{table.processed_percentage}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
