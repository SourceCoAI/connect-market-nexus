import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Shield,
  FileSignature,
  CheckCircle,
  Loader2,
  AlertTriangle,
  Mail,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { useState } from 'react';
import { AgreementSigningModal } from '@/components/pandadoc/AgreementSigningModal';
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

  return useQuery({
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

      // If no firm yet, still show both docs as requestable
      if (!firmId) {
        return [
          {
            type: 'nda' as const,
            label: 'Non-Disclosure Agreement (NDA)',
            signed: false,
            signedAt: null,
            requested: false,
            requestedAt: null,
            status: null,
          },
          {
            type: 'fee_agreement' as const,
            label: 'Fee Agreement',
            signed: false,
            signedAt: null,
            requested: false,
            requestedAt: null,
            status: null,
          },
        ];
      }

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
}

export function ProfileDocuments() {
  const { data: documents, isLoading } = useAllDocuments();
  const [signingOpen, setSigningOpen] = useState(false);
  const [signingType, setSigningType] = useState<'nda' | 'fee_agreement'>('nda');

  useAgreementStatusSync();

  const pendingDocs = documents?.filter((d) => !d.signed && d.requested) || [];

  const openSigning = (type: 'nda' | 'fee_agreement') => {
    setSigningType(type);
    setSigningOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Documents</CardTitle>
          <CardDescription>Your agreements and signing status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <Shield className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Request an NDA or Fee Agreement to get started with deal access.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {pendingDocs.length > 0 && (
        <div className="rounded-lg border-2 border-amber-300/60 bg-amber-50 p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-amber-100 flex-shrink-0">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {pendingDocs.length} document{pendingDocs.length > 1 ? 's' : ''} requested — check your email
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sign and return to adam.haile@sourcecodeals.com to unlock full deal access.
              </p>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Documents</CardTitle>
          <CardDescription>Your agreements and signing status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {documents.map((doc) => (
            <div
              key={doc.type}
              className="flex items-center justify-between p-4 rounded-lg border border-border bg-card"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-accent p-2">
                  {doc.type === 'nda' ? (
                    <Shield className="h-4 w-4 text-accent-foreground" />
                  ) : (
                    <FileSignature className="h-4 w-4 text-accent-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{doc.label}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {doc.signed ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-300 text-emerald-700 bg-emerald-50">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Signed
                      </Badge>
                    ) : doc.requested ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50">
                        <Clock className="h-3 w-3 mr-1" />
                        Sent to Email
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted text-muted-foreground">
                        Not Requested
                      </Badge>
                    )}
                    {doc.signedAt && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(doc.signedAt), 'MMM d, yyyy')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {doc.signed ? (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-300 text-emerald-700 bg-emerald-50">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Complete
                </Badge>
              ) : doc.requested ? (
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Check your inbox</p>
                  <Button variant="outline" size="sm" className="mt-1" onClick={() => openSigning(doc.type)}>
                    <Mail className="h-3.5 w-3.5 mr-1.5" />
                    Resend
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  className="bg-sourceco hover:bg-sourceco/90 text-sourceco-foreground font-medium"
                  onClick={() => openSigning(doc.type)}
                >
                  <Mail className="h-3.5 w-3.5 mr-1" />
                  Request via Email
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <AgreementSigningModal
        open={signingOpen}
        onOpenChange={setSigningOpen}
        documentType={signingType}
      />
    </>
  );
}
