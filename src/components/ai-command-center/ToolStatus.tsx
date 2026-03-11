/**
 * Tool execution status display components for AI Command Center.
 * Includes ToolBadge for individual tool status and StreamingIndicator
 * for the streaming response view with active tool display.
 */

import { Badge } from '@/components/ui/badge';
import { Loader2, Bot, Wrench, CheckCircle, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '@/lib/utils';
import { type ToolCallInfo } from '@/hooks/useAICommandCenter';

export function ToolBadge({ tool }: { tool: ToolCallInfo }) {
  const statusIcon =
    tool.status === 'running' ? (
      <Loader2 className="h-3 w-3 animate-spin" />
    ) : tool.status === 'success' ? (
      <CheckCircle className="h-3 w-3" />
    ) : (
      <XCircle className="h-3 w-3" />
    );

  const statusClass =
    tool.status === 'running'
      ? 'border-[#DEC76B]/50 text-[#0E101A]'
      : tool.status === 'success'
        ? 'border-green-400 text-green-800'
        : 'border-red-400 text-red-800';

  return (
    <Badge variant="outline" className={cn('text-xs gap-1', statusClass)}>
      <Wrench className="h-3 w-3" />
      {tool.name.replace(/_/g, ' ')}
      {statusIcon}
    </Badge>
  );
}

export function StreamingIndicator({
  content,
  phase,
  tools,
}: {
  content: string;
  phase: string;
  tools: ToolCallInfo[];
}) {
  const phaseLabel =
    phase === 'routing'
      ? 'Classifying intent...'
      : phase === 'processing'
        ? 'Thinking...'
        : phase === 'executing_confirmed_action'
          ? 'Executing action...'
          : 'Processing...';

  return (
    <div className="flex gap-2">
      <div className="w-7 h-7 rounded-full bg-[#F7F4DD] flex items-center justify-center flex-shrink-0 mt-0.5">
        <Bot className="h-4 w-4 text-[#DEC76B]" />
      </div>
      <div className="max-w-[85%] rounded-lg px-3 py-2" style={{ backgroundColor: '#F7F4DD' }}>
        {/* Active tools */}
        {tools.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {tools.map((tool) => (
              <ToolBadge key={tool.id} tool={tool} />
            ))}
          </div>
        )}

        {/* Streaming text */}
        {content ? (
          <div className="text-base prose prose-base max-w-none">
            <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {phaseLabel}
          </div>
        )}
      </div>
    </div>
  );
}
