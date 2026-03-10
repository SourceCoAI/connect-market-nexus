import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EDITOR_DESIGN } from '@/lib/editor-design-system';
import { cn } from '@/lib/utils';
import { X, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface DealOption {
  id: string;
  title: string;
  location: string | null;
  revenue: number | null;
}

interface EditorFeaturedDealsSectionProps {
  featuredDealIds: string[] | null;
  onChange: (ids: string[] | null) => void;
  currentListingId?: string;
}

export function EditorFeaturedDealsSection({
  featuredDealIds,
  onChange,
  currentListingId,
}: EditorFeaturedDealsSectionProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<DealOption[]>([]);
  const [selectedDeals, setSelectedDeals] = useState<DealOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Load selected deal details on mount
  useEffect(() => {
    if (!featuredDealIds || featuredDealIds.length === 0) {
      setSelectedDeals([]);
      return;
    }

    supabase
      .from('listings')
      .select('id, title, location, revenue')
      .in('id', featuredDealIds)
      .then(({ data }) => {
        if (data) setSelectedDeals(data as DealOption[]);
      });
  }, [featuredDealIds]);

  // Search for deals
  useEffect(() => {
    if (search.length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('listings')
        .select('id, title, location, revenue')
        .eq('status', 'active')
        .eq('is_internal_deal', false)
        .ilike('title', `%${search}%`)
        .limit(8);

      const filtered = (data ?? []).filter(
        (d) => d.id !== currentListingId && !featuredDealIds?.includes(d.id),
      ) as DealOption[];
      setResults(filtered);
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [search, currentListingId, featuredDealIds]);

  const addDeal = (deal: DealOption) => {
    const newIds = [...(featuredDealIds ?? []), deal.id];
    onChange(newIds);
    setSelectedDeals((prev) => [...prev, deal]);
    setSearch('');
    setResults([]);
  };

  const removeDeal = (dealId: string) => {
    const newIds = (featuredDealIds ?? []).filter((id) => id !== dealId);
    onChange(newIds.length > 0 ? newIds : null);
    setSelectedDeals((prev) => prev.filter((d) => d.id !== dealId));
  };

  const formatRevenue = (val: number | null) => {
    if (!val) return '';
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${Math.round(val / 1_000)}K`;
    return `$${val}`;
  };

  const atLimit = (featuredDealIds?.length ?? 0) >= 2;

  return (
    <div className={cn(EDITOR_DESIGN.cardBg, EDITOR_DESIGN.cardBorder, 'rounded-xl p-5')}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className={EDITOR_DESIGN.microHeader}>Featured Deals</div>
          <div className={cn(EDITOR_DESIGN.helperText, 'mt-0.5')}>
            Pick up to 2 deals to show on the landing page. Leave empty for automatic selection.
          </div>
        </div>
      </div>

      {/* Selected deals */}
      {selectedDeals.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selectedDeals.map((deal) => (
            <div
              key={deal.id}
              className="flex items-center gap-2 bg-muted/60 border border-border rounded-lg px-3 py-1.5 text-sm"
            >
              <span className="font-medium truncate max-w-[240px]">{deal.title}</span>
              {deal.revenue && (
                <span className="text-xs text-muted-foreground">{formatRevenue(deal.revenue)}</span>
              )}
              <button
                type="button"
                onClick={() => removeDeal(deal.id)}
                className="ml-1 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search input */}
      {!atLimit && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search marketplace listings..."
            className={cn(EDITOR_DESIGN.compactHeight, 'pl-8 text-sm')}
          />

          {/* Dropdown results */}
          {results.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {results.map((deal) => (
                <button
                  key={deal.id}
                  type="button"
                  onClick={() => addDeal(deal)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center justify-between text-sm"
                >
                  <span className="font-medium truncate">{deal.title}</span>
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">
                    {deal.location && `${deal.location} · `}
                    {formatRevenue(deal.revenue)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {isSearching && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg px-3 py-2 text-sm text-muted-foreground">
              Searching...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
