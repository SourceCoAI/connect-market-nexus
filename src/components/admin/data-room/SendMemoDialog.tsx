/**
 * SendMemoDialog: Send memo to buyer via email with AI-drafted outreach
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
import { Sparkles, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  LeadMemo,
  useDraftOutreachEmail,
  useSendMemoEmail,
} from '@/hooks/admin/data-room/use-data-room';

interface SendMemoDialogProps {
  memo: LeadMemo;
  dealId: string;
  onClose: () => void;
}

export function SendMemoDialog({ memo, dealId, onClose }: SendMemoDialogProps) {
  const draftEmail = useDraftOutreachEmail();
  const sendEmail = useSendMemoEmail();

  const [selectedBuyerId, setSelectedBuyerId] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [buyerSearch, setBuyerSearch] = useState('');

  // Fetch buyers
  const { data: buyers = [] } = useQuery({
    queryKey: ['buyers-for-memo-send', buyerSearch],
    queryFn: async () => {
      let query = supabase
        .from('buyers')
        .select('id, company_name, pe_firm_name, email_domain')
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

  const handleSelectBuyer = (buyer: {
    id: string;
    email_domain: string | null;
    company_name: string | null;
    pe_firm_name: string | null;
  }) => {
    setSelectedBuyerId(buyer.id);
    setEmailAddress(buyer.email_domain ? `contact@${buyer.email_domain}` : '');
    setEmailSubject(
      `Deal Opportunity: ${memo.memo_type === 'anonymous_teaser' ? 'Anonymous Teaser' : 'Lead Memo'}`,
    );
  };

  const handleDraftWithAI = async () => {
    if (!selectedBuyerId) return;
    const result = await draftEmail.mutateAsync({
      deal_id: dealId,
      buyer_id: selectedBuyerId,
      memo_id: memo.id,
    });
    if (result?.email) {
      setEmailSubject(result.email.subject);
      setEmailBody(result.email.body);
    }
  };

  const handleSend = () => {
    if (!selectedBuyerId || !emailAddress || !emailSubject || !emailBody) return;

    sendEmail.mutate(
      {
        memo_id: memo.id,
        buyer_id: selectedBuyerId,
        email_address: emailAddress,
        email_subject: emailSubject,
        email_body: emailBody,
        deal_id: dealId,
      },
      {
        onSuccess: () => onClose(),
      },
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send Memo via Email</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Buyer Selection */}
          {!selectedBuyerId ? (
            <div className="space-y-3">
              <Label>Select Buyer</Label>
              <Input
                placeholder="Search buyers..."
                value={buyerSearch}
                onChange={(e) => setBuyerSearch(e.target.value)}
              />
              <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md p-2">
                {buyers.map((buyer) => (
                  <button
                    key={buyer.id}
                    className="w-full text-left px-3 py-2 rounded text-sm hover:bg-accent"
                    onClick={() => handleSelectBuyer(buyer)}
                  >
                    <p className="font-medium">{buyer.pe_firm_name || buyer.company_name}</p>
                    {buyer.email_domain && (
                      <p className="text-xs text-muted-foreground">{buyer.email_domain}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Email Composition */}
              <div className="space-y-3">
                <div>
                  <Label>To</Label>
                  <Input
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder="buyer@example.com"
                  />
                </div>
                <div>
                  <Label>Subject</Label>
                  <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Email Body</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDraftWithAI}
                      disabled={draftEmail.isPending}
                    >
                      {draftEmail.isPending ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1 h-3 w-3" />
                      )}
                      Draft with AI
                    </Button>
                  </div>
                  <Textarea
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="min-h-[200px]"
                    placeholder="Write your email or click 'Draft with AI' for a personalized outreach email..."
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedBuyerId('')}>
                  Change Buyer
                </Button>
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSend}
                  disabled={!emailAddress || !emailSubject || !emailBody || sendEmail.isPending}
                >
                  {sendEmail.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send Email
                </Button>
              </DialogFooter>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
