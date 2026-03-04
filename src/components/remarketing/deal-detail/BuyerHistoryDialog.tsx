import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Building2, XCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface BuyerHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
}

interface PassedBuyer {
  id: string;
  pass_reason: string | null;
  pass_category: string | null;
  composite_score: number | null;
  updated_at: string;
  buyer: {
    id: string;
    company_name: string;
    pe_firm_name: string | null;
  } | null;
}

export function BuyerHistoryDialog({ open, onOpenChange, dealId }: BuyerHistoryDialogProps) {
  const { data: passedBuyers, isLoading } = useQuery({
    queryKey: ['remarketing', 'passed-buyers', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remarketing_scores')
        .select(
          `
          id,
          pass_reason,
          pass_category,
          composite_score,
          updated_at,
          buyer:buyers(id, company_name, pe_firm_name)
        `,
        )
        .eq('listing_id', dealId)
        .eq('status', 'passed')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data as PassedBuyer[];
    },
    enabled: open && !!dealId,
  });

  const getCategoryColor = (category: string | null) => {
    switch (category?.toLowerCase()) {
      case 'size':
        return 'bg-orange-100 text-orange-700';
      case 'geography':
        return 'bg-blue-100 text-blue-700';
      case 'services':
        return 'bg-purple-100 text-purple-700';
      case 'timing':
        return 'bg-amber-100 text-amber-700';
      case 'other':
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-muted-foreground" />
            Buyer Pass History
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : !passedBuyers || passedBuyers.length === 0 ? (
          <div className="py-8 text-center">
            <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No buyers have passed on this deal yet</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px] pr-4">
            <div className="space-y-3">
              {passedBuyers.map((record) => (
                <div key={record.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="font-medium text-sm">
                          {record.buyer?.company_name || 'Unknown Buyer'}
                        </p>
                        {record.buyer?.pe_firm_name && (
                          <p className="text-xs text-muted-foreground">
                            {record.buyer.pe_firm_name}
                          </p>
                        )}
                      </div>
                    </div>
                    {record.pass_category && (
                      <Badge variant="secondary" className={getCategoryColor(record.pass_category)}>
                        {record.pass_category}
                      </Badge>
                    )}
                  </div>

                  {record.pass_reason && (
                    <p className="text-sm text-muted-foreground pl-6">{record.pass_reason}</p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-muted-foreground pl-6">
                    <span>Score: {record.composite_score?.toFixed(0) || '—'}</span>
                    <span>•</span>
                    <span>{format(new Date(record.updated_at), 'MMM d, yyyy')}</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
