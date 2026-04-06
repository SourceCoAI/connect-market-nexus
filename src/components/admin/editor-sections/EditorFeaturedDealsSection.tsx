import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EDITOR_DESIGN } from '@/lib/editor-design-system';
import { cn } from '@/lib/utils';
import { ChevronDown, X, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface DealOption {
  id: string;
  title: string;
  internal_company_name: string | null;
  revenue: number | null;
  ebitda: number | null;
  created_at: string;
}

interface EditorFeaturedDealsSectionProps {
  featuredDealIds: string[] | null;
  onChange: (ids: string[] | null) => void;
  currentListingId?: string;
  currentListing?: {
    category?: string;
    categories?: string[];
    revenue?: number;
    ebitda?: number;
    location?: string;
  };
}

const SELECT_FIELDS = 'id, title, internal_company_name, revenue, ebitda, created_at';

function formatCurrency(val: number | null) {
  if (!val) return '-';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${Math.round(val / 1_000)}K`;
  return `$${val}`;
}

function DealLabel({ deal }: { deal: DealOption }) {
  const name = deal.internal_company_name || deal.title;
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="font-medium truncate">{name}</span>
      <span className="text-xs text-muted-foreground shrink-0">
        Rev {formatCurrency(deal.revenue)} · EBITDA {formatCurrency(deal.ebitda)}
      </span>
    </span>
  );
}

function DealSelectBox({
  label,
  selectedDeal,
  onSelect,
  onClear,
  allDeals,
  excludeId,
  currentListingId,
}: {
  label: string;
  selectedDeal: DealOption | null;
  onSelect: (deal: DealOption) => void;
  onClear: () => void;
  allDeals: DealOption[];
  excludeId: string | null;
  currentListingId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = allDeals.filter((d) => {
    if (d.id === currentListingId) return false;
    if (d.id === excludeId) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (d.internal_company_name?.toLowerCase().includes(q) ?? false) ||
      d.title.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 min-w-0" ref={containerRef}>
      <div className="text-xs font-medium text-muted-foreground mb-1.5">{label}</div>
      <div className="relative">
        {selectedDeal ? (
          <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 bg-muted/40 min-h-[38px]">
            <DealLabel deal={selectedDeal} />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="ml-auto p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-between border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/30 transition-colors min-h-[38px]"
          >
            <span>Select a deal...</span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </button>
        )}

        {open && !selectedDeal && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg overflow-hidden">
            {/* Search within dropdown */}
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search deals..."
                  className="pl-7 h-8 text-sm"
                  autoFocus
                />
              </div>
            </div>

            {/* Deal list */}
            <div className="max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                  No deals found
                </div>
              ) : (
                filtered.map((deal) => (
                  <button
                    key={deal.id}
                    type="button"
                    onClick={() => {
                      onSelect(deal);
                      setOpen(false);
                      setSearch('');
                    }}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-center justify-between text-sm border-b border-border/50 last:border-b-0"
                  >
                    <span className="font-medium truncate">
                      {deal.internal_company_name || deal.title}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2 shrink-0">
                      Rev {formatCurrency(deal.revenue)} · EBITDA {formatCurrency(deal.ebitda)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function scoreSimilarity(
  deal: DealOption,
  current: { category?: string; categories?: string[]; revenue?: number; ebitda?: number; location?: string },
) {
  let score = 0;
  const currentCats = Array.isArray(current.categories) ? current.categories : [current.category].filter(Boolean);
  // We don't have categories on DealOption, but title overlap is a proxy
  // Category overlap scored via title keyword match as a fallback
  const rev = Number(deal.revenue ?? 0);
  const curRev = Number(current.revenue ?? 0);
  const revAvg = (rev + curRev) / 2;
  if (revAvg > 0 && Math.abs(rev - curRev) / revAvg < 0.3) score += 35;
  if (curRev > 0 && rev > 0) {
    const m1 = Number(current.ebitda ?? 0) / curRev;
    const m2 = Number(deal.ebitda ?? 0) / rev;
    if (Math.abs(m1 - m2) < 0.05) score += 20;
  }
  return score;
}

export function EditorFeaturedDealsSection({
  featuredDealIds,
  onChange,
  currentListingId,
  currentListing,
}: EditorFeaturedDealsSectionProps) {
  const [allDeals, setAllDeals] = useState<DealOption[]>([]);
  const [selectedDeal1, setSelectedDeal1] = useState<DealOption | null>(null);
  const [selectedDeal2, setSelectedDeal2] = useState<DealOption | null>(null);
  const [loading, setLoading] = useState(true);

  // Load all active marketplace deals sorted by most recent
  useEffect(() => {
    async function loadDeals() {
      const { data } = await supabase
        .from('listings')
        .select(SELECT_FIELDS)
        .eq('status', 'active')
        .eq('is_internal_deal', false)
        .order('created_at', { ascending: false })
        .limit(100);

      if (data) setAllDeals(data as DealOption[]);
      setLoading(false);
    }
    loadDeals();
  }, []);

  // Load selected deals on mount when featuredDealIds are provided
  useEffect(() => {
    if (!featuredDealIds || featuredDealIds.length === 0) {
      setSelectedDeal1(null);
      setSelectedDeal2(null);
      return;
    }

    async function loadSelected() {
      const { data } = await supabase
        .from('listings')
        .select(SELECT_FIELDS)
        .in('id', featuredDealIds!);

      if (data) {
        const deals = data as DealOption[];
        const deal1 = deals.find((d) => d.id === featuredDealIds![0]) ?? null;
        const deal2 = deals.find((d) => d.id === featuredDealIds![1]) ?? null;
        setSelectedDeal1(deal1);
        setSelectedDeal2(deal2);
      }
    }
    loadSelected();
  }, [featuredDealIds]);

  const handleSelect1 = (deal: DealOption) => {
    setSelectedDeal1(deal);
    const newIds = [deal.id, ...(selectedDeal2 ? [selectedDeal2.id] : [])];
    onChange(newIds);
  };

  const handleSelect2 = (deal: DealOption) => {
    setSelectedDeal2(deal);
    const newIds = [...(selectedDeal1 ? [selectedDeal1.id] : []), deal.id];
    onChange(newIds);
  };

  const handleClear1 = () => {
    setSelectedDeal1(null);
    if (selectedDeal2) {
      onChange([selectedDeal2.id]);
    } else {
      onChange(null);
    }
  };

  const handleClear2 = () => {
    setSelectedDeal2(null);
    if (selectedDeal1) {
      onChange([selectedDeal1.id]);
    } else {
      onChange(null);
    }
  };

  return (
    <div className={cn(EDITOR_DESIGN.cardBg, EDITOR_DESIGN.cardBorder, 'rounded-xl p-5')}>
      <div className="mb-4">
        <div className={EDITOR_DESIGN.microHeader}>Featured Deals</div>
        <div className={cn(EDITOR_DESIGN.helperText, 'mt-0.5')}>
          Select up to 2 deals to show on the landing page. Leave empty for automatic selection.
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-2">Loading deals...</div>
      ) : (
        <div className="flex gap-4">
          <DealSelectBox
            label="Featured Deal 1"
            selectedDeal={selectedDeal1}
            onSelect={handleSelect1}
            onClear={handleClear1}
            allDeals={allDeals}
            excludeId={selectedDeal2?.id ?? null}
            currentListingId={currentListingId}
          />
          <DealSelectBox
            label="Featured Deal 2"
            selectedDeal={selectedDeal2}
            onSelect={handleSelect2}
            onClear={handleClear2}
            allDeals={allDeals}
            excludeId={selectedDeal1?.id ?? null}
            currentListingId={currentListingId}
          />
        </div>
      )}
    </div>
  );
}
