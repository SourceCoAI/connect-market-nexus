import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BuyerData, Contact, Transcript } from "./types";

export function useBuyerData(id: string | undefined, isNew: boolean) {
  const { data: buyer, isLoading } = useQuery({
    queryKey: ['remarketing', 'buyer', id],
    queryFn: async () => {
      if (isNew) return null;

      const { data, error } = await supabase
        .from('remarketing_buyers')
        .select('*')
        .eq('id', id!)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return data as unknown as BuyerData;
    },
    enabled: !isNew
  });

  const { data: peFirmRecord } = useQuery({
    queryKey: ['remarketing', 'pe-firm-lookup', buyer?.pe_firm_name],
    queryFn: async () => {
      if (!buyer?.pe_firm_name) return null;
      const { data, error } = await supabase
        .from('remarketing_buyers')
        .select('id, company_name')
        .eq('company_name', buyer.pe_firm_name)
        .eq('buyer_type', 'private_equity')
        .eq('archived', false)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!buyer?.pe_firm_name,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['remarketing', 'contacts', id],
    queryFn: async () => {
      if (isNew) return [];

      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone, linkedin_url, title, is_primary_at_firm')
        .eq('remarketing_buyer_id', id!)
        .eq('contact_type', 'buyer')
        .eq('archived', false)
        .order('is_primary_at_firm', { ascending: false });

      if (error) throw error;
      return (data || []).map((c) => ({
        id: c.id,
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
        first_name: c.first_name || '',
        last_name: c.last_name || '',
        email: c.email,
        phone: c.phone,
        role: c.title,
        linkedin_url: c.linkedin_url,
        is_primary: c.is_primary_at_firm,
      })) as Contact[];
    },
    enabled: !isNew
  });

  const { data: transcripts = [] } = useQuery({
    queryKey: ['remarketing', 'transcripts', id],
    queryFn: async () => {
      if (isNew) return [];

      const { data, error } = await supabase
        .from('buyer_transcripts')
        .select('*')
        .eq('buyer_id', id!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as Transcript[];
    },
    enabled: !isNew
  });

  const { data: recentScores = [] } = useQuery({
    queryKey: ['remarketing', 'buyer-scores', id],
    queryFn: async () => {
      if (isNew) return [];

      const { data, error } = await supabase
        .from('remarketing_scores')
        .select(`
          id,
          composite_score,
          tier,
          status,
          created_at,
          listing:listings(id, title)
        `)
        .eq('buyer_id', id!)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    enabled: !isNew
  });

  const dataCompleteness = useMemo(() => {
    if (!buyer) return 0;

    const fields = [
      buyer.company_name,
      buyer.company_website,
      buyer.pe_firm_name,
      buyer.thesis_summary,
      buyer.target_revenue_min,
      buyer.target_revenue_max,
      buyer.target_geographies?.length,
      buyer.target_services?.length,
      buyer.business_summary,
      buyer.industry_vertical,
      buyer.acquisition_appetite,
    ];

    const filledCount = fields.filter(Boolean).length;
    return Math.round((filledCount / fields.length) * 100);
  }, [buyer]);

  const missingFields = useMemo(() => {
    if (!buyer) return [];
    const missing: string[] = [];

    if (!buyer.target_geographies?.length) missing.push("geography preferences");
    if (!buyer.target_revenue_min && !buyer.target_revenue_max) missing.push("size criteria");
    if (!buyer.target_services?.length) missing.push("target services");
    if (!buyer.thesis_summary) missing.push("investment thesis");
    if (!buyer.business_summary) missing.push("business summary");

    return missing;
  }, [buyer]);

  return {
    buyer,
    isLoading,
    peFirmRecord,
    contacts,
    transcripts,
    recentScores,
    dataCompleteness,
    missingFields,
  };
}
