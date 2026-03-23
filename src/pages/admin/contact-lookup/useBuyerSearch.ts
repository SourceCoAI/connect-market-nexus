import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BuyerOption } from './types';

export function useBuyerSearch() {
  const [selectedBuyer, setSelectedBuyer] = useState<BuyerOption | null>(null);
  const [buyerSearch, setBuyerSearch] = useState('');
  const [buyerResults, setBuyerResults] = useState<BuyerOption[]>([]);
  const [searching, setSearching] = useState(false);

  const searchBuyers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setBuyerResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data } = await supabase
        .from('buyers')
        .select('id, company_name, buyer_type, pe_firm_name')
        .ilike('company_name', `%${query}%`)
        .limit(10);
      setBuyerResults((data as BuyerOption[]) || []);
    } catch {
      setBuyerResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const selectBuyer = useCallback((buyer: BuyerOption) => {
    setSelectedBuyer(buyer);
    setBuyerSearch(buyer.company_name);
    setBuyerResults([]);
  }, []);

  const clearBuyer = useCallback(() => {
    setSelectedBuyer(null);
    setBuyerSearch('');
  }, []);

  return {
    selectedBuyer,
    buyerSearch,
    setBuyerSearch,
    buyerResults,
    searching,
    searchBuyers,
    selectBuyer,
    clearBuyer,
  };
}
