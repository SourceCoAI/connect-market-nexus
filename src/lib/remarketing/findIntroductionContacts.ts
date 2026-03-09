/**
 * findIntroductionContacts.ts
 *
 * Fire-and-forget helper that fetches buyer details and calls the
 * find-introduction-contacts edge function to auto-discover contacts
 * when a buyer is approved to the introduction stage.
 *
 * Returns a summary for toast display, or null on error.
 */
import { supabase } from '@/integrations/supabase/client';

interface ContactSearchResult {
  success: boolean;
  pe_contacts_found: number;
  company_contacts_found: number;
  total_saved: number;
  skipped_duplicates: number;
  message?: string;
  firmName: string;
}

/**
 * Looks up buyer details and invokes the find-introduction-contacts edge function.
 * Non-blocking — callers should `.catch(() => {})` or handle errors gracefully.
 */
export async function findIntroductionContacts(
  buyerId: string,
  triggerSource: 'approval' | 'bulk_approval' | 'manual' | 'retry' = 'approval',
): Promise<ContactSearchResult | null> {
  try {
    // Fetch buyer details
    const { data: buyer, error: buyerError } = await supabase
      .from('buyers')
      .select(
        'id, company_name, company_website, buyer_type, pe_firm_name, pe_firm_website, platform_website',
      )
      .eq('id', buyerId)
      .single();

    if (buyerError || !buyer) {
      console.error('[findIntroductionContacts] Failed to fetch buyer:', buyerError?.message);
      return null;
    }

    // Extract email domain from website
    const website = buyer.platform_website || buyer.company_website;
    const emailDomain = extractDomain(website);

    const { data, error } = await supabase.functions.invoke('find-introduction-contacts', {
      body: {
        buyer_id: buyer.id,
        buyer_type: buyer.buyer_type || 'corporate',
        pe_firm_name: buyer.pe_firm_name || undefined,
        pe_firm_website: buyer.pe_firm_website || undefined,
        company_name: buyer.company_name,
        company_website: website || undefined,
        email_domain: emailDomain || undefined,
        trigger_source: triggerSource,
      },
    });

    if (error || !data) {
      console.error('[findIntroductionContacts] Edge function error:', error?.message || 'No data');
      return null;
    }

    return {
      success: data.success ?? false,
      pe_contacts_found: data.pe_contacts_found ?? 0,
      company_contacts_found: data.company_contacts_found ?? 0,
      total_saved: data.total_saved ?? 0,
      skipped_duplicates: data.skipped_duplicates ?? 0,
      message: data.message,
      firmName: buyer.pe_firm_name || buyer.company_name,
    };
  } catch (err) {
    console.error('[findIntroductionContacts] Unexpected error:', err);
    return null;
  }
}

function extractDomain(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
