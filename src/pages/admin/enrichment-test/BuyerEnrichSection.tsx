import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FlaskConical } from 'lucide-react';
import { StatusBadge, JsonBlock, ComparisonTable, SectionCard, EntityPicker } from './shared';
import type { AddLogFn } from './shared';

const BUYER_FIELDS = [
  'company_name',
  'business_summary',
  'target_industries',
  'target_services',
  'target_geographies',
  'geographic_footprint',
  'service_regions',
  'hq_state',
  'hq_city',
  'target_revenue_min',
  'target_revenue_max',
  'target_ebitda_min',
  'target_ebitda_max',
  'pe_firm_name',
  'thesis_summary',
  'data_last_updated',
];

interface Props {
  addLog: AddLogFn;
  buyerId: string;
  onBuyerIdChange: (id: string) => void;
}

export default function BuyerEnrichSection({ addLog, buyerId, onBuyerIdChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [before, setBefore] = useState<Record<string, unknown> | null>(null);
  const [after, setAfter] = useState<Record<string, unknown> | null>(null);

  const run = async () => {
    if (!buyerId.trim()) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    setAfter(null);
    const t0 = Date.now();
    try {
      const { data: bData, error: bDataError } = await supabase
        .from('buyers')
        .select('*')
        .eq('id', buyerId)
        .single();
      if (bDataError) throw bDataError;
      setBefore(bData as Record<string, unknown> | null);

      // Queue buyer enrichment via shared queue utility
      const { queueBuyerEnrichment } = await import('@/lib/remarketing/queueEnrichment');
      await queueBuyerEnrichment([buyerId]);

      // Poll for completion (enrichment runs in background)
      let attempts = 0;
      let enrichmentDone = false;
      while (attempts < 45 && !enrichmentDone) {
        await new Promise((r) => setTimeout(r, 4000));
        attempts++;
        const { data: queueItem } = await supabase
          .from('buyer_enrichment_queue')
          .select('status')
          .eq('buyer_id', buyerId)
          .order('queued_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (queueItem?.status === 'completed' || queueItem?.status === 'failed') {
          enrichmentDone = true;
          if (queueItem.status === 'failed') {
            setError('Enrichment failed in queue');
            addLog(
              `enrich-buyer for ${buyerId.slice(0, 8)}… — queue failed`,
              Date.now() - t0,
              false,
            );
            return;
          }
        }
      }

      const data = enrichmentDone
        ? { success: true, message: 'Enrichment completed via queue' }
        : { success: true, message: 'Enrichment queued — still running in background' };
      setResponse(data);

      const { data: aData, error: aDataError } = await supabase
        .from('buyers')
        .select('*')
        .eq('id', buyerId)
        .single();
      if (aDataError) throw aDataError;
      setAfter(aData as Record<string, unknown> | null);

      addLog(
        `enrich-buyer for ${buyerId.slice(0, 8)}… (enrichment ${enrichmentDone ? 'completed' : 'queued'})`,
        Date.now() - t0,
      );
    } catch (e: unknown) {
      const dur = Date.now() - t0;
      setError((e as Error).message);
      addLog(`enrich-buyer for ${buyerId.slice(0, 8)}… — ${(e as Error).message}`, dur, false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SectionCard title="Single Buyer Enrichment Test" icon={<FlaskConical className="h-5 w-5" />}>
      <p className="text-xs text-muted-foreground">
        Search for a buyer by PE firm name, or use the shuffle button to pick a random unenriched
        buyer.
      </p>
      <EntityPicker
        entity="buyer"
        value={buyerId}
        onChange={onBuyerIdChange}
        placeholder="Search buyers by name or pick random…"
      />
      <div className="flex gap-2 items-center">
        {buyerId && (
          <span className="text-xs font-mono text-muted-foreground truncate flex-1">
            Selected: {buyerId}
          </span>
        )}
        <div className="ml-auto">
          <Button onClick={run} disabled={loading || !buyerId.trim()}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Test Enrich Buyer
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {response && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <StatusBadge ok={response.success} />
            {response.fieldsExtracted !== undefined && (
              <Badge variant="secondary">{response.fieldsExtracted} fields extracted</Badge>
            )}
            {response.dataCompleteness && (
              <Badge variant="outline">{response.dataCompleteness}</Badge>
            )}
            {response.error_code && <Badge variant="destructive">{response.error_code}</Badge>}
          </div>
          <JsonBlock data={response} />
        </div>
      )}

      <ComparisonTable fields={BUYER_FIELDS} before={before} after={after} />
    </SectionCard>
  );
}
