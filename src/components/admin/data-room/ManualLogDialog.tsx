/**
 * ManualLogDialog: Log a manual memo send (when admin emails outside the system)
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ClipboardList, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { LeadMemo, useLogManualSend } from '@/hooks/admin/data-room/use-data-room';

interface ManualLogDialogProps {
  memo: LeadMemo;
  dealId: string;
  onClose: () => void;
}

export function ManualLogDialog({ memo, dealId, onClose }: ManualLogDialogProps) {
  const logSend = useLogManualSend();
  const [selectedBuyerId, setSelectedBuyerId] = useState('');
  const [notes, setNotes] = useState('');
  const [buyerSearch, setBuyerSearch] = useState('');

  const { data: buyers = [] } = useQuery({
    queryKey: ['buyers-for-manual-log', buyerSearch],
    queryFn: async () => {
      let query = supabase
        .from('buyers')
        .select('id, company_name, pe_firm_name')
        .eq('archived', false)
        .order('company_name')
        .limit(50);

      if (buyerSearch) {
        query = query.or(`company_name.ilike.%${buyerSearch}%,pe_firm_name.ilike.%${buyerSearch}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const handleLog = () => {
    if (!selectedBuyerId) return;

    logSend.mutate(
      {
        deal_id: dealId,
        memo_id: memo.id,
        remarketing_buyer_id: selectedBuyerId,
        memo_type: memo.memo_type,
        notes: notes || undefined,
      },
      {
        onSuccess: () => onClose(),
      },
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Log Manual Send
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Select Buyer</Label>
            <Input
              placeholder="Search buyers..."
              value={buyerSearch}
              onChange={(e) => setBuyerSearch(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md p-2">
              {buyers.map((buyer) => (
                <button
                  key={buyer.id}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors
                    ${selectedBuyerId === buyer.id ? 'bg-primary/10 border border-primary' : 'hover:bg-accent'}`}
                  onClick={() => setSelectedBuyerId(buyer.id)}
                >
                  {buyer.pe_firm_name || buyer.company_name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Memo Type</Label>
            <Input
              value={memo.memo_type === 'anonymous_teaser' ? 'Anonymous Teaser' : 'Full Lead Memo'}
              disabled
            />
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Sent via Gmail, included deal memo attachment"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleLog} disabled={!selectedBuyerId || logSend.isPending}>
            {logSend.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ClipboardList className="mr-2 h-4 w-4" />
            )}
            Log Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
