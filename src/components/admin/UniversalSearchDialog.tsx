import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import {
  useUniversalSearch,
  getCategoryConfig,
  type SearchCategory,
} from '@/hooks/admin/use-universal-search';
import {
  Building2,
  Briefcase,
  Crosshair,
  Calculator,
  Mail,
  ClipboardList,
  Handshake,
  Users,
  Loader2,
  Target,
} from 'lucide-react';

const CATEGORY_ICONS: Record<SearchCategory, React.ReactNode> = {
  deals: <Briefcase className="h-4 w-4 shrink-0" />,
  all_deals: <Building2 className="h-4 w-4 shrink-0" />,
  captarget: <Crosshair className="h-4 w-4 shrink-0" />,
  gp_partners: <Target className="h-4 w-4 shrink-0" />,
  sourceco: <Building2 className="h-4 w-4 shrink-0" />,
  valuation_leads: <Calculator className="h-4 w-4 shrink-0" />,
  inbound_leads: <Mail className="h-4 w-4 shrink-0" />,
  owner_leads: <ClipboardList className="h-4 w-4 shrink-0" />,
  referral_partners: <Handshake className="h-4 w-4 shrink-0" />,
  buyers: <Users className="h-4 w-4 shrink-0" />,
  buyer_contacts: <Users className="h-4 w-4 shrink-0" />,
};

interface UniversalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UniversalSearchDialog({ open, onOpenChange }: UniversalSearchDialogProps) {
  const navigate = useNavigate();
  const { query, setQuery, grouped, isLoading } = useUniversalSearch();

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) setQuery('');
  }, [open, setQuery]);

  const handleSelect = useCallback(
    (href: string) => {
      onOpenChange(false);
      navigate(href);
    },
    [navigate, onOpenChange],
  );

  const categoryOrder: SearchCategory[] = [
    'deals',
    'all_deals',
    'captarget',
    'gp_partners',
    'valuation_leads',
    'inbound_leads',
    'owner_leads',
    'referral_partners',
    'buyers',
    'buyer_contacts',
  ];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Search across all deals, leads, buyers, partners..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[400px]">
        {isLoading && query.length > 0 && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading data...
          </div>
        )}
        {!isLoading && query.length > 0 && grouped.size === 0 && (
          <CommandEmpty>No results found for &ldquo;{query}&rdquo;</CommandEmpty>
        )}
        {query.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Type to search across all deals, leads, buyers, and partners...
          </div>
        )}
        {categoryOrder.map((cat) => {
          const items = grouped.get(cat);
          if (!items || items.length === 0) return null;
          const config = getCategoryConfig(cat);
          return (
            <CommandGroup key={cat} heading={config.label}>
              {items.map((item) => (
                <CommandItem
                  key={`${cat}-${item.id}`}
                  value={`${item.title} ${item.subtitle ?? ''} ${item.meta ?? ''}`}
                  onSelect={() => handleSelect(item.href)}
                  className="flex items-start gap-3 py-2"
                >
                  <span className={config.color}>{CATEGORY_ICONS[cat]}</span>
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{item.title}</span>
                    {item.subtitle && (
                      <span className="text-xs text-muted-foreground truncate">
                        {item.subtitle}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
