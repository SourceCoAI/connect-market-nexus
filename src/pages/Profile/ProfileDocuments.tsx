import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Shield,
  FileSignature,
  Loader2,
  Mail,
} from 'lucide-react';
import { format } from 'date-fns';
import { useState, useEffect, useRef } from 'react';
import { AgreementSigningModal } from '@/components/agreements/AgreementSigningModal';
import { useAgreementStatusSync } from '@/hooks/use-agreement-status-sync';

interface DocumentItem {
  type: 'nda' | 'fee_agreement';
  label: string;
  signed: boolean;
  signedAt: string | null;
  requested: boolean;
  requestedAt: string | null;
  status: string | null;
}

function useAllDocuments() {
  const { user } = useAuth();
  const [noFirm, setNoFirm] = useState(false);

  const query = useQuery({
    queryKey: ['buyer-signed-documents', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data: resolvedFirmId, error: resolveError } = await supabase.rpc('resolve_user_firm_id', {
        p_user_id: user.id,
      });

      if (resolveError) {
        console.warn('Failed to resolve firm:', resolveError);
      }

      const firmId = resolvedFirmId as string | null;

      if (!firmId) {
        setNoFirm(true);
        return [];
      }

      setNoFirm(false);

      const { data: firmRaw } = await (
        supabase.from('firm_agreements' as never) as unknown as ReturnType<typeof supabase.from>
      )
        .select(
          'nda_status, nda_signed_at, nda_requested_at, fee_agreement_status, fee_agreement_signed_at, fee_agreement_requested_at',
        )
        .eq('id', firmId)
        .maybeSingle();

      if (!firmRaw) {
        return [
          { type: 'nda' as const, label: 'Non-Disclosure Agreement (NDA)', signed: false, signedAt: null, requested: false, requestedAt: null, status: null },
          { type: 'fee_agreement' as const, label: 'Fee Agreement', signed: false, signedAt: null, requested: false, requestedAt: null, status: null },
        ];
      }

      const firm = firmRaw as unknown as {
        nda_status: string | null;
        nda_signed_at: string | null;
        nda_requested_at: string | null;
        fee_agreement_status: string | null;
        fee_agreement_signed_at: string | null;
        fee_agreement_requested_at: string | null;
      };

      const docs: DocumentItem[] = [];

      docs.push({
        type: 'nda',
        label: 'Non-Disclosure Agreement (NDA)',
        signed: firm.nda_status === 'signed',
        signedAt: firm.nda_signed_at,
        requested: !!firm.nda_requested_at && firm.nda_status !== 'signed',
        requestedAt: firm.nda_requested_at,
        status: firm.nda_status,
      });

      docs.push({
        type: 'fee_agreement',
        label: 'Fee Agreement',
        signed: firm.fee_agreement_status === 'signed',
        signedAt: firm.fee_agreement_signed_at,
        requested: !!firm.fee_agreement_requested_at && firm.fee_agreement_status !== 'signed',
        requestedAt: firm.fee_agreement_requested_at,
        status: firm.fee_agreement_status,
      });

      return docs;
    },
    enabled: !!user?.id,
    staleTime: 15_000,
  });

  return { ...query, noFirm };
}

function StatusDot({ variant }: { variant: 'signed' | 'sent' | 'none' }) {
  if (variant === 'signed') {
    return <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />;
  }
  if (variant === 'sent') {
    return <span className="inline-block w-1.5 h-1.5 rounded-full border border-amber-400 flex-shrink-0" />;
  }
  return <span className="inline-block w-1.5 h-1.5 rounded-full border border-muted-foreground/30 flex-shrink-0" />;
}

export function ProfileDocuments() {
  const { user } = useAuth();
  const { data: documents, isLoading, noFirm, refetch } = useAllDocuments();
  const [signingOpen, setSigningOpen] = useState(false);
  const [signingType, setSigningType] = useState<'nda' | 'fee_agreement'>('nda');
  const [firmCreating, setFirmCreating] = useState(false);
  const [firmError, setFirmError] = useState(false);
  const healAttempted = useRef(false);

  useAgreementStatusSync();

  useEffect(() => {
    if (!noFirm || !user?.id || healAttempted.current) return;
    healAttempted.current = true;

    async function selfHeal() {
      setFirmCreating(true);
      try {
        const { error } = await supabase.functions.invoke('auto-create-firm-on-signup', {
          body: {
            userId: user!.id,
            company: '',
          },
        });
        if (error) {
          console.warn('Self-heal firm creation failed:', error);
          setFirmError(true);
        } else {
          await refetch();
        }
      } catch (err) {
        console.warn('Self-heal firm creation failed:', err);
        setFirmError(true);
      } finally {
        setFirmCreating(false);
      }
    }

    selfHeal();
  }, [noFirm, user?.id, refetch]);

  const pendingDocs = documents?.filter((d) => !d.signed && d.requested) || [];

  const openSigning = (type: 'nda' | 'fee_agreement') => {
    setSigningType(type);
    setSigningOpen(true);
  };

  if (isLoading || firmCreating) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        {firmCreating && (
          <p className="text-sm text-muted-foreground">Setting up your account...</p>
        )}
      </div>
    );
  }

  if (firmError) {
    return (
      <div className="py-12 text-center">
        <Shield className="h-5 w-5 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          We couldn't set up your document access. Please contact support@sourcecodeals.com
        </p>
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="py-12 text-center">
        <Shield className="h-5 w-5 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Request an NDA or Fee Agreement to get started with deal access.
        </p>
      </div>
    );
  }

  return (
    <>
      {pendingDocs.length > 0 && (
        <div className="rounded-lg bg-muted/50 px-4 py-3 mb-6">
          <p className="text-sm text-foreground">
            {pendingDocs.length} document{pendingDocs.length > 1 ? 's' : ''} sent to your email for signing
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sign and return to support@sourcecodeals.com to receive deal materials and request introductions.
          </p>
        </div>
      )}

      <div className="space-y-0">
        <h2 className="text-lg font-semibold text-foreground mb-1">Documents</h2>
        <p className="text-sm text-muted-foreground mb-6">Your agreements and signing status</p>

        <div className="divide-y divide-border">
          {documents.map((doc) => {
            const dotVariant = doc.signed ? 'signed' : doc.requested ? 'sent' : 'none';
            const statusLabel = doc.signed ? 'Signed' : doc.requested ? 'Sent to email' : 'Not requested';
            const timestamp = doc.signed && doc.signedAt
              ? `Signed ${format(new Date(doc.signedAt), 'MMM d, yyyy')}`
              : doc.requested && doc.requestedAt
                ? `Requested ${format(new Date(doc.requestedAt), 'MMM d, yyyy')}`
                : null;

            return (
              <div key={doc.type} className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3 min-w-0">
                  {doc.type === 'nda' ? (
                    <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <FileSignature className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{doc.label}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <StatusDot variant={dotVariant} />
                      <span className={`text-xs ${doc.signed ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                        {statusLabel}
                      </span>
                      {timestamp && (
                        <>
                          <span className="text-muted-foreground/30 text-xs hidden sm:inline">·</span>
                          <span className="text-xs text-muted-foreground hidden sm:inline">{timestamp}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {!doc.signed && (
                  <button
                    onClick={() => openSigning(doc.type)}
                    className="text-xs text-foreground hover:text-foreground/70 transition-colors flex items-center gap-1 flex-shrink-0 ml-4"
                  >
                    <Mail className="h-3 w-3" />
                    {doc.requested ? 'Resend' : 'Request'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <AgreementSigningModal
        open={signingOpen}
        onOpenChange={setSigningOpen}
        documentType={signingType}
      />
    </>
  );
}