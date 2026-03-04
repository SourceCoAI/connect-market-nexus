import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, ChevronsUpDown, Check, Shuffle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────
export interface LogEntry {
  ts: string;
  msg: string;
  durationMs?: number;
  ok: boolean;
}

export type AddLogFn = (m: string, d?: number, ok?: boolean) => void;

// ─── Helpers ─────────────────────────────────────────────────────────
export function ts() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

export function StatusBadge({ ok }: { ok: boolean | null | undefined }) {
  if (ok === null || ok === undefined) return null;
  return ok ? (
    <Badge className="bg-green-600 text-white">SUCCESS</Badge>
  ) : (
    <Badge variant="destructive">FAILED</Badge>
  );
}

export function JsonBlock({ data }: { data: unknown }) {
  return (
    <ScrollArea className="max-h-64 rounded-md border bg-muted p-3">
      <pre className="text-xs whitespace-pre-wrap break-all font-mono text-foreground">
        {JSON.stringify(data, null, 2)}
      </pre>
    </ScrollArea>
  );
}

export function ComparisonTable({
  fields,
  before,
  after,
}: {
  fields: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  if (!before && !after) return null;
  return (
    <div className="overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Field</TableHead>
            <TableHead>Before</TableHead>
            <TableHead>After</TableHead>
            <TableHead className="w-[80px]">Changed?</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((f) => {
            const b = before ? String(before[f] ?? '\u2014') : '\u2014';
            const a = after ? String(after[f] ?? '\u2014') : '\u2014';
            const changed = b !== a;
            return (
              <TableRow key={f}>
                <TableCell className="font-mono text-xs">{f}</TableCell>
                <TableCell className="text-xs max-w-[260px] truncate">{b}</TableCell>
                <TableCell className="text-xs max-w-[260px] truncate">{a}</TableCell>
                <TableCell>
                  {changed ? (
                    <Badge className="bg-amber-500 text-white text-[10px]">YES</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">{'\u2014'}</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-lg">
              {icon}
              {title}
            </CardTitle>
            <ChevronDown
              className={`h-5 w-5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ─── Entity Picker ──────────────────────────────────────────────────

interface PickerOption {
  id: string;
  label: string;
  subtitle?: string;
}

interface EntityPickerProps {
  entity: 'deal' | 'buyer';
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

export function EntityPicker({ entity, value, onChange, placeholder }: EntityPickerProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingRandom, setLoadingRandom] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualId, setManualId] = useState('');

  const selectedLabel = options.find((o) => o.id === value)?.label;

  // Load recent records on mount
  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      if (entity === 'deal') {
        const { data } = await supabase
          .from('listings')
          .select('id, title, internal_company_name, industry')
          .order('created_at', { ascending: false })
          .limit(100);
        if (data) {
          setOptions(
            data.map((d) => ({
              id: d.id,
              label: d.title || d.internal_company_name || d.id.slice(0, 8),
              subtitle:
                [d.internal_company_name, d.industry].filter(Boolean).join(' · ') || undefined,
            })),
          );
        }
      } else {
        const { data } = await supabase
          .from('buyers')
          .select('id, company_name, pe_firm_name, hq_state')
          .order('created_at', { ascending: false })
          .limit(100);
        if (data) {
          setOptions(
            data.map((b) => ({
              id: b.id,
              label: b.company_name || b.pe_firm_name || b.id.slice(0, 8),
              subtitle: [b.pe_firm_name, b.hq_state].filter(Boolean).join(' · ') || undefined,
            })),
          );
        }
      }
    } catch {
      // silently fail — user can still paste manually
    } finally {
      setLoadingOptions(false);
    }
  }, [entity]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const pickRandom = async () => {
    setLoadingRandom(true);
    try {
      if (entity === 'deal') {
        // Pick a random unenriched deal (no enriched_at) for best test value
        let { data } = await supabase
          .from('listings')
          .select('id, title')
          .is('enriched_at', null)
          .limit(50);
        // Fall back to any deal if none are unenriched
        if (!data || data.length === 0) {
          const res = await supabase.from('listings').select('id, title').limit(50);
          data = res.data;
        }
        if (data && data.length > 0) {
          const pick = data[Math.floor(Math.random() * data.length)];
          onChange(pick.id);
        }
      } else {
        let { data } = await supabase
          .from('buyers')
          .select('id, company_name')
          .is('data_last_updated', null)
          .limit(50);
        if (!data || data.length === 0) {
          const res = await supabase.from('buyers').select('id, company_name').limit(50);
          data = res.data;
        }
        if (data && data.length > 0) {
          const pick = data[Math.floor(Math.random() * data.length)];
          onChange(pick.id);
        }
      }
    } catch {
      // silent
    } finally {
      setLoadingRandom(false);
    }
  };

  if (manualMode) {
    return (
      <div className="flex gap-2 items-center">
        <Input
          placeholder={placeholder ?? `Paste ${entity} UUID`}
          value={manualId}
          onChange={(e) => {
            setManualId(e.target.value);
            onChange(e.target.value);
          }}
          className="font-mono text-sm"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setManualMode(false)}
          className="text-xs whitespace-nowrap"
        >
          Search instead
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2 items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="flex-1 justify-between font-normal"
          >
            <span className={cn('truncate', !value && 'text-muted-foreground')}>
              {value
                ? selectedLabel
                  ? `${selectedLabel} (${value.slice(0, 8)}…)`
                  : `${value.slice(0, 8)}…`
                : (placeholder ?? `Select a ${entity}…`)}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-full p-0 bg-background border shadow-md pointer-events-auto z-[100]"
          style={{ minWidth: '420px' }}
          align="start"
        >
          <Command>
            <CommandInput placeholder={`Search ${entity === 'deal' ? 'deals' : 'buyers'}…`} />
            <CommandList className="max-h-[300px]">
              <CommandEmpty>
                {loadingOptions
                  ? 'Loading…'
                  : `No ${entity === 'deal' ? 'deals' : 'buyers'} found.`}
              </CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.id}
                    value={`${opt.label} ${opt.subtitle ?? ''} ${opt.id}`}
                    onSelect={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn('mr-2 h-4 w-4', value === opt.id ? 'opacity-100' : 'opacity-0')}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm truncate">{opt.label}</span>
                      <span className="text-[10px] text-muted-foreground font-mono truncate">
                        {opt.id.slice(0, 12)}…{opt.subtitle ? ` · ${opt.subtitle}` : ''}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Button
        variant="outline"
        size="icon"
        onClick={pickRandom}
        disabled={loadingRandom}
        title={`Pick a random ${entity === 'deal' ? 'unenriched deal' : 'unenriched buyer'}`}
      >
        {loadingRandom ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Shuffle className="h-4 w-4" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setManualMode(true)}
        className="text-xs whitespace-nowrap"
      >
        Paste ID
      </Button>
    </div>
  );
}
