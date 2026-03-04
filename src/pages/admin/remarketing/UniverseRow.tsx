import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { TableCell, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Globe2,
  Users,
  Building2,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  MoreHorizontal,
  Handshake,
  Plus,
  X,
  Network,
  GripVertical,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IntelligenceCoverageBar } from '@/components/remarketing';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { FlaggedDeal } from './useUniversesData';

/** Extract a short industry description from the guide's markdown content */
export function extractGuideDescription(guideContent: string | null | undefined): string | null {
  if (!guideContent) return null;

  const boilerplatePatterns = [
    /^\*?\*?analyst\s*note/i,
    /^here\s+is\s+(the|a)\s+(comprehensive|definitive|foundational|complete)/i,
    /^this\s+document\s+provides/i,
    /^this\s+(guide|report|analysis)\s+(is|provides|covers|presents)/i,
    /^\[uploaded\s+guide/i,
    /^(note|disclaimer|warning)\s*:/i,
  ];

  const lines = guideContent.split('\n');
  for (const line of lines) {
    const trimmed = line
      .trim()
      .replace(/^\*\*+/, '')
      .replace(/\*\*+$/, '')
      .trim();
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('|') ||
      trimmed.startsWith('-') ||
      trimmed.length < 40
    )
      continue;
    if (boilerplatePatterns.some((p) => p.test(trimmed))) continue;
    return trimmed.length > 200 ? trimmed.slice(0, 197) + '...' : trimmed;
  }
  return null;
}

// ─── Universe Row (Existing tab) ───

interface UniverseRowProps {
  universe: {
    id: string;
    name: string;
    description: string | null;
    archived: boolean;
    fee_agreement_required: boolean;
    ma_guide_content?: string | null;
  };
  stats: { total: number; enriched: number; withTranscripts: number };
  deals: number;
  isSelected: boolean;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onArchive: (params: { id: string; archived: boolean }) => void;
  onDelete: (id: string) => void;
}

export function UniverseRow({
  universe,
  stats,
  deals,
  isSelected,
  onToggleSelect,
  onArchive,
  onDelete,
}: UniverseRowProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const websiteIntel = stats.total > 0 ? Math.round((stats.enriched / stats.total) * 50) : 0;
  const transcriptIntel =
    stats.total > 0 ? Math.round((stats.withTranscripts / stats.total) * 50) : 0;
  const coverage = websiteIntel + transcriptIntel;

  return (
    <TableRow
      className={`cursor-pointer hover:bg-muted/50 ${isSelected ? 'bg-primary/5' : ''}`}
      onClick={() => navigate(`/admin/buyers/universes/${universe.id}`)}
    >
      <TableCell onClick={(e) => onToggleSelect(universe.id, e)}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => {}}
          aria-label={`Select ${universe.name}`}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Globe2 className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 max-w-[400px]">
            <p className="font-medium text-foreground">{universe.name}</p>
            {(() => {
              const desc =
                universe.description || extractGuideDescription(universe.ma_guide_content);
              return desc ? (
                <p className="text-sm text-muted-foreground line-clamp-2">{desc}</p>
              ) : (
                <p className="text-sm text-muted-foreground/50 italic">No description</p>
              );
            })()}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="h-4 w-4" />
          <span className="font-medium text-foreground">{stats.total}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span className="font-medium text-foreground">{deals}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="w-40">
          <IntelligenceCoverageBar
            current={stats.withTranscripts}
            total={stats.total}
            enrichedCount={stats.enriched}
          />
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={coverage >= 50 ? 'default' : 'secondary'} className="text-xs">
          {coverage}% intel
        </Badge>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/admin/buyers/universes/${universe.id}`);
              }}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async (e) => {
                e.stopPropagation();
                const newVal = !universe.fee_agreement_required;
                await supabase
                  .from('buyer_universes')
                  .update({ fee_agreement_required: newVal } as never)
                  .eq('id', universe.id);
                queryClient.invalidateQueries({ queryKey: ['remarketing'] });
                toast.success(newVal ? 'Fee agreement required' : 'Fee agreement not required');
              }}
            >
              <Handshake
                className={`h-4 w-4 mr-2 ${universe.fee_agreement_required ? 'text-green-600' : ''}`}
              />
              {universe.fee_agreement_required
                ? 'Fee Agreement Required'
                : 'Flag: Fee Agreement Required'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onArchive({ id: universe.id, archived: !universe.archived });
              }}
            >
              {universe.archived ? (
                <>
                  <ArchiveRestore className="h-4 w-4 mr-2" />
                  Restore
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </>
              )}
            </DropdownMenuItem>
            {universe.archived && (
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Are you sure you want to permanently delete this universe?')) {
                    onDelete(universe.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

// ─── Sortable Flagged Row (To Be Created tab) ───

interface SortableFlaggedRowProps {
  deal: FlaggedDeal;
  index: number;
  onCreateClick: (e: React.MouseEvent) => void;
  onNavigate: () => void;
  onRemoveClick: (e: React.MouseEvent) => void;
}

export function SortableFlaggedRow({
  deal,
  index,
  onCreateClick,
  onNavigate,
  onRemoveClick,
}: SortableFlaggedRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasAIData = !!deal.buyer_universe_generated_at;

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className="cursor-pointer hover:bg-muted/50"
      onClick={onNavigate}
    >
      <TableCell className="w-[40px]" onClick={(e) => e.stopPropagation()}>
        <button
          className="flex items-center justify-center h-8 w-8 cursor-grab active:cursor-grabbing rounded hover:bg-muted"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </TableCell>
      <TableCell className="w-[40px] text-center text-xs text-muted-foreground tabular-nums">
        {index + 1}
      </TableCell>
      <TableCell>
        {hasAIData ? (
          <span className="text-sm font-medium">{deal.buyer_universe_label}</span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>
      <TableCell className="max-w-[320px]">
        {hasAIData && deal.buyer_universe_description ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-sm text-muted-foreground line-clamp-2 cursor-default">
                  {deal.buyer_universe_description}
                </p>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-md">
                <p className="text-sm">{deal.buyer_universe_description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <Network className="h-4 w-4 text-blue-600" />
          </div>
          <p className="font-medium text-foreground truncate">
            {deal.internal_company_name || deal.title}
          </p>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-sm">{deal.address_state || '—'}</span>
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">
          {deal.universe_build_flagged_at
            ? new Date(deal.universe_build_flagged_at).toLocaleDateString()
            : '—'}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onCreateClick}>
            <Plus className="h-3.5 w-3.5" />
            Create
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-muted-foreground hover:text-destructive"
            onClick={onRemoveClick}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
