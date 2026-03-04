import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/** Get the current session's access token for edge function calls */
export const getSessionToken = async (): Promise<string> => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error('Not authenticated');
  return session.access_token;
};

/** Save guide to Supporting Documents with direct DB persistence */
export const saveGuideToDocuments = async (
  content: string,
  industryName: string,
  universeId: string,
  onDocumentAdded: (doc: { id: string; name: string; url: string; uploaded_at: string }) => void,
  onComplete?: (documentUrl: string) => void,
): Promise<string | null> => {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-guide-pdf`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getSessionToken()}`,
        },
        body: JSON.stringify({ universeId, industryName, content }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to generate guide: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.document) {
      throw new Error(data.error || 'No document returned');
    }

    const { data: universe, error: readError } = await supabase
      .from('buyer_universes')
      .select('documents')
      .eq('id', universeId)
      .single();

    if (readError) throw new Error(`Failed to read universe: ${readError.message}`);

    const currentDocs =
      (universe?.documents as { type?: string; id?: string; name?: string; url?: string }[]) || [];
    const filteredDocs = currentDocs.filter((d) => !d.type || d.type !== 'ma_guide');
    const updatedDocs = [...filteredDocs, data.document];

    const { error: updateError } = await supabase
      .from('buyer_universes')
      .update({ documents: updatedDocs })
      .eq('id', universeId);

    if (updateError) throw new Error(`Failed to save document: ${updateError.message}`);

    onDocumentAdded(data.document);
    if (onComplete) onComplete(data.document.url);
    return data.document.url;
  } catch (error) {
    toast.error(`Failed to save guide: ${(error as Error).message}`);
    return null;
  }
};
