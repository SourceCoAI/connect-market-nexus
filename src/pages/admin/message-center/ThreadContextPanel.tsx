import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shield,
  FileSignature,
  Check,
  Clock,
  Send,
  Eye,
  AlertCircle,
  ExternalLink,
  Building2,
  ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ThreadContextPanelProps {
  userId: string | null;
  buyerName: string;
  buyerEmail: string | null;
  buyerCompany: string | null;
}

type AgreementStatus = 'not_sent' | 'sent' | 'viewed' | 'signed' | 'declined';

const STATUS_CONFIG: Record<AgreementStatus, {
  label: string;
  className: string;
  icon: typeof Check;
}> = {
  not_sent: { label: 'Not Sent', className: 'border-border/40 bg-muted/30 text-muted-foreground', icon: Clock },
  sent: { label: 'Sent', className: 'border-blue-500/20 bg-blue-50 text-blue-700', icon: Send },
  viewed: { label: 'Viewed', className: 'border-amber-500/20 bg-amber-50 text-amber-700', icon: Eye },
  signed: { label: 'Signed', className: 'border-emerald-500/20 bg-emerald-50 text-emerald-700', icon: Check },
  declined: { label: 'Declined', className: 'border-red-500/20 bg-red-50 text-red-700', icon: AlertCircle },
};

function useThreadBuyerFirm(userId: string | null) {
  return useQuery({
    queryKey: ['thread-buyer-firm', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data: membership } = await supabase
        .from('firm_members')
        .select('firm_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (!membership) return null;

      const { data: firm } = await supabase
        .from('firm_agreements')
        .select(
          'id, primary_company_name, nda_signed, nda_docuseal_status, nda_signed_document_url, fee_agreement_signed, fee_docuseal_status, fee_signed_document_url',
        )
        .eq('id', membership.firm_id)
        .maybeSingle();

      return firm;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

function resolveStatus(signed: boolean, docusealStatus: string | null): AgreementStatus {
  if (signed) return 'signed';
  if (docusealStatus === 'declined') return 'declined';
  if (docusealStatus === 'viewed') return 'viewed';
  if (docusealStatus === 'sent') return 'sent';
  return 'not_sent';
}

function StatusBadge({ status }: { status: AgreementStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`h-5 px-2 font-medium text-[11px] ${config.className}`}>
      <Icon className="h-2.5 w-2.5 mr-1" />
      {config.label}
    </Badge>
  );
}

export function ThreadContextPanel({ userId, buyerName, buyerEmail, buyerCompany }: ThreadContextPanelProps) {
  const { data: firm, isLoading } = useThreadBuyerFirm(userId);
  const navigate = useNavigate();

  const ndaStatus = firm ? resolveStatus(!!firm.nda_signed, firm.nda_docuseal_status) : null;
  const feeStatus = firm ? resolveStatus(!!firm.fee_agreement_signed, firm.fee_docuseal_status) : null;

  return (
    <div className="w-[240px] flex-shrink-0 flex flex-col min-h-0 overflow-y-auto" style={{ borderLeft: '1px solid #E5DDD0', backgroundColor: '#FCF9F0' }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #E5DDD0' }}>
        <p className="text-xs font-semibold" style={{ color: '#0E101A' }}>Buyer Context</p>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Buyer info */}
        <div>
          <p className="text-xs font-medium" style={{ color: '#0E101A' }}>{buyerName}</p>
          {buyerCompany && (
            <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: '#5A5A5A' }}>
              <Building2 className="h-3 w-3" />{buyerCompany}
            </p>
          )}
          {buyerEmail && (
            <p className="text-[11px] mt-0.5 truncate" style={{ color: '#5A5A5A' }}>{buyerEmail}</p>
          )}
        </div>

        {/* Firm & agreements */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#9A9A9A' }}>Agreements</p>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : !firm ? (
            <div className="rounded-lg p-2.5" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
              <p className="text-[11px] font-medium" style={{ color: '#991B1B' }}>No firm linked</p>
              <p className="text-[10px] mt-0.5" style={{ color: '#B91C1C' }}>
                Buyer has no firm record. Create one from the All Buyers page.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[11px] font-medium" style={{ color: '#0E101A' }}>{firm.primary_company_name}</p>

              {/* NDA */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" style={{ color: '#5A5A5A' }} />
                  <span className="text-[11px] font-medium" style={{ color: '#0E101A' }}>NDA</span>
                </div>
                {ndaStatus && <StatusBadge status={ndaStatus} />}
              </div>
              {ndaStatus === 'signed' && firm.nda_signed_document_url && (
                <a
                  href={firm.nda_signed_document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] underline flex items-center gap-1"
                  style={{ color: '#5A5A5A' }}
                >
                  Download signed NDA <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}

              {/* Fee Agreement */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <FileSignature className="h-3.5 w-3.5" style={{ color: '#5A5A5A' }} />
                  <span className="text-[11px] font-medium" style={{ color: '#0E101A' }}>Fee Agreement</span>
                </div>
                {feeStatus && <StatusBadge status={feeStatus} />}
              </div>
              {feeStatus === 'signed' && firm.fee_signed_document_url && (
                <a
                  href={firm.fee_signed_document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] underline flex items-center gap-1"
                  style={{ color: '#5A5A5A' }}
                >
                  Download signed Fee Agmt <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}

              {/* Link to firm detail */}
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-[11px] justify-between mt-1"
                onClick={() => navigate(`/admin/marketplace/buyers`)}
              >
                View in All Buyers
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
