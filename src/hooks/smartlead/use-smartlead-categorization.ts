/**
 * Hook for fetching Smartlead reply categorization stats.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CategoryStat {
  category: string;
  count: number;
  percentage: number;
  avgConfidence: number;
  sentimentBreakdown: Record<string, number>;
  manualOverrides: number;
  examples: {
    id: string;
    from_email: string | null;
    subject: string | null;
    reply_preview: string;
    ai_sentiment: string | null;
    ai_confidence: number | null;
    time_replied: string | null;
  }[];
}

export interface CategorizationStats {
  total: number;
  categories: CategoryStat[];
  totalOverrides: number;
}

export function useSmartleadCategorizationStats() {
  return useQuery({
    queryKey: ['smartlead', 'categorization-stats'],
    queryFn: async (): Promise<CategorizationStats> => {
      const { data, error } = await (supabase as any)
        .from('smartlead_reply_inbox')
        .select('id, from_email, subject, reply_body, ai_category, ai_sentiment, ai_confidence, ai_reasoning, manual_category, recategorized_by, time_replied')
        .order('time_replied', { ascending: false })
        .limit(1000);

      if (error) throw error;
      if (!data || data.length === 0) {
        return { total: 0, categories: [], totalOverrides: 0 };
      }

      const catMap = new Map<string, {
        count: number;
        confidences: number[];
        sentiments: Record<string, number>;
        overrides: number;
        examples: CategoryStat['examples'];
      }>();

      let totalOverrides = 0;

      for (const row of data) {
        const effectiveCategory = row.manual_category || row.ai_category || 'neutral';
        if (!catMap.has(effectiveCategory)) {
          catMap.set(effectiveCategory, {
            count: 0,
            confidences: [],
            sentiments: {},
            overrides: 0,
            examples: [],
          });
        }
        const bucket = catMap.get(effectiveCategory)!;
        bucket.count++;
        if (row.ai_confidence != null) bucket.confidences.push(row.ai_confidence);
        
        const sentiment = row.ai_sentiment || 'neutral';
        bucket.sentiments[sentiment] = (bucket.sentiments[sentiment] || 0) + 1;
        
        if (row.recategorized_by) {
          bucket.overrides++;
          totalOverrides++;
        }

        if (bucket.examples.length < 3) {
          const preview = (row.reply_body || '')
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120);
          bucket.examples.push({
            id: row.id,
            from_email: row.from_email,
            subject: row.subject,
            reply_preview: preview,
            ai_sentiment: row.ai_sentiment,
            ai_confidence: row.ai_confidence,
            time_replied: row.time_replied,
          });
        }
      }

      const total = data.length;
      const categories: CategoryStat[] = [];

      for (const [category, bucket] of catMap) {
        const avgConf = bucket.confidences.length > 0
          ? bucket.confidences.reduce((a, b) => a + b, 0) / bucket.confidences.length
          : 0;
        categories.push({
          category,
          count: bucket.count,
          percentage: Math.round((bucket.count / total) * 100),
          avgConfidence: Math.round(avgConf * 100) / 100,
          sentimentBreakdown: bucket.sentiments,
          manualOverrides: bucket.overrides,
          examples: bucket.examples,
        });
      }

      categories.sort((a, b) => b.count - a.count);

      return { total, categories, totalOverrides };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSmartleadClassificationPrompt() {
  return useQuery({
    queryKey: ['smartlead', 'classification-prompt'],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await (supabase as any)
        .from('app_settings')
        .select('value')
        .eq('key', 'smartlead_classification_prompt')
        .maybeSingle();

      if (error) throw error;
      return data?.value || null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export async function saveClassificationPrompt(prompt: string) {
  const { error } = await (supabase as any)
    .from('app_settings')
    .upsert(
      { key: 'smartlead_classification_prompt', value: prompt, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  if (error) throw error;
}
