import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';

// Small delay to yield to UI thread
export const yieldToUI = () => new Promise((resolve) => setTimeout(resolve, 50));

// Helper to merge arrays (deduped)
export const mergeArrays = (
  existing: string[] | null | undefined,
  newItems: string[] | null | undefined,
): string[] | undefined => {
  if (!newItems || newItems.length === 0) return undefined;
  const combined = [...(existing || []), ...newItems];
  return [...new Set(combined)];
};

// Process a single file to extract text with retry logic for rate limits
export const processFileText = async (file: File, retryCount = 0): Promise<string> => {
  const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();

  if (['.txt', '.vtt', '.srt'].includes(fileExt)) {
    return await file.text();
  } else {
    // For PDF/DOC, use the edge function
    const formData = new FormData();
    formData.append('file', file);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-transcript-file`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: formData,
    });

    // Handle rate limits with retry (longer delays for Gemini)
    if (response.status === 429 && retryCount < 5) {
      const waitTime = Math.pow(2, retryCount) * 3000; // 3s, 6s, 12s, 24s, 48s
      const { toast } = await import('sonner');
      toast.info(`Rate limited, retrying ${file.name} in ${Math.round(waitTime / 1000)}s...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return processFileText(file, retryCount + 1);
    }

    if (!response.ok) {
      const errorText = await response.text();
      void errorText;
      throw new Error(`Failed to parse ${file.name} (${response.status})`);
    }

    const result = await response.json();
    return result.text || '';
  }
};

// State name to code mapping for geographic normalization
export const stateNameToCode: Record<string, string> = {
  minnesota: 'MN',
  texas: 'TX',
  california: 'CA',
  florida: 'FL',
  arizona: 'AZ',
  'new york': 'NY',
  illinois: 'IL',
  ohio: 'OH',
  georgia: 'GA',
  pennsylvania: 'PA',
  michigan: 'MI',
  washington: 'WA',
  colorado: 'CO',
  'north carolina': 'NC',
  virginia: 'VA',
  tennessee: 'TN',
  indiana: 'IN',
  missouri: 'MO',
  wisconsin: 'WI',
  maryland: 'MD',
  massachusetts: 'MA',
  oregon: 'OR',
  oklahoma: 'OK',
  utah: 'UT',
  nevada: 'NV',
  'new jersey': 'NJ',
  kentucky: 'KY',
  louisiana: 'LA',
  alabama: 'AL',
  'south carolina': 'SC',
  iowa: 'IA',
  connecticut: 'CT',
  arkansas: 'AR',
  kansas: 'KS',
  mississippi: 'MS',
  nebraska: 'NE',
  'new mexico': 'NM',
  idaho: 'ID',
  'west virginia': 'WV',
  maine: 'ME',
  'new hampshire': 'NH',
  hawaii: 'HI',
  'rhode island': 'RI',
  montana: 'MT',
  delaware: 'DE',
  'south dakota': 'SD',
  'north dakota': 'ND',
  alaska: 'AK',
  vermont: 'VT',
  wyoming: 'WY',
};
