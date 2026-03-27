import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  FileDown,
  Shield,
  FileSignature,
  CheckCircle,
  Loader2,
  AlertTriangle,
  ArrowRight,
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
  documentUrl: string | null;
  hasSubmission: boolean;
  status: string | null;
}

function useAllDocuments() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['buyer-signed-documents', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Use canonical firm resolver RPC (deterministic: email domain → company name → latest member)
      const { data: resolvedFirmId, error: resolveError } = await supabase.rpc('resolve_user_firm_id', {
        p_user_id: user.id,
      });

      if (resolveError) {
        console.error('Failed to resolve firm:', resolveError);
        return [];
      }

      const firmId = resolvedFirmId as string | null;
      if (!firmId) return [];

      const { data: firmRaw } = await (
        supabase.from('firm_agreements' as never) as unknown as ReturnType<typeof supabase.from>
      )
        .select(
          'nda_status, nda_signed_at, nda_pandadoc_signed_url, nda_document_url, nda_pandadoc_document_id, nda_pandadoc_status, fee_agreement_status, fee_agreement_signed_at, fee_pandadoc_signed_url, fee_agreement_document_url, fee_pandadoc_document_id, fee_pandadoc_status',
        )
        .eq('id', firmId)
        .maybeSingle();

      if (!firmRaw) return [];
      const firm = firmRaw as unknown as {
        nda_status: string | null;
        nda_signed_at: string | null;
        nda_pandadoc_signed_url: string | null;
        nda_document_url: string | null;
        nda_pandadoc_document_id: string | null;
        nda_pandadoc_status: string | null;
        fee_agreement_status: string | null;
        fee_agreement_signed_at: string | null;
        fee_pandadoc_signed_url: string | null;
        fee_agreement_document_url: string | null;
        fee_pandadoc_document_id: string | null;
        fee_pandadoc_status: string | null;
      };

      const docs: DocumentItem[] = [];

      // Always show NDA row if firm exists
      docs.push({
        type: 'nda',
        label: 'Non-Disclosure Agreement (NDA)',
        signed: firm.nda_status === 'signed',
        signedAt: firm.nda_signed_at,
        documentUrl: firm.nda_pandadoc_signed_url || firm.nda_document_url || null,
        hasSubmission: !!firm.nda_pandadoc_document_id,
        status: firm.nda_pandadoc_status,
      });

      // Always show Fee Agreement row if firm exists
      docs.push({
        type: 'fee_agreement',
        label: 'Fee Agreement',
        signed: firm.fee_agreement_status === 'signed',
        signedAt: firm.fee_agreement_signed_at,
        documentUrl: firm.fee_pandadoc_signed_url || firm.fee_agreement_document_url || null,
        hasSubmission: !!firm.fee_pandadoc_document_id,
        status: firm.fee_pandadoc_status,
      });

      return docs;
    },
    enabled: !!user?.id,
    staleTime: 15_000,
  });
}

function DownloadOnDemandButton({ documentType }: { documentType: 'nda' | 'fee_agreement' }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-agreement-document', {
        body: { documentType },
      });
      if (error) throw error;
      if (data?.documentUrl) {
        window.open(data.documentUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('Failed to fetch document:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleDownload} disabled={loading}>
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <FileDown className="h-3.5 w-3.5 mr-1.5" />
      )}
      Download
    </Button>
  );
}

export function ProfileDocuments() {
  const { data: documents, isLoading } = useAllDocuments();
  const [signingOpen, setSigningOpen] = useState(false);
  const [signingType, setSigningType] = useState<'nda' | 'fee_agreement'>('nda');

  // Realtime sync for agreement status changes
  useAgreementStatusSync();

  const pendingDocs =
    documents?.filter(
      (d) => !d.signed && (d.hasSubmission || d.status === 'sent' || d.status === 'awaiting'),
    ) || [];

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
          <CardDescription>Your signed agreements will appear here</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <Shield className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No signed documents yet. Once you sign your NDA or Fee Agreement, copies will be
              available here for your compliance records.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Pending signing callout */}
      {pendingDocs.length > 0 && (
        <div className="rounded-lg border-2 border-amber-300/60 bg-amber-50 p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-amber-100 flex-shrink-0">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                You have {pendingDocs.length} document{pendingDocs.length > 1 ? 's' : ''} ready for
                signing
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sign below to unlock full deal access and data room materials.
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
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 border-emerald-300 text-emerald-700 bg-emerald-50"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Signed
                      </Badge>
                    ) : doc.hasSubmission ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50"
                      >
                        Ready to Sign
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 border-muted text-muted-foreground"
                      >
                        Not Sent
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

              {doc.signed && doc.documentUrl && doc.documentUrl.startsWith('https://') ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(doc.documentUrl!, '_blank', 'noopener,noreferrer')}
                >
                  <FileDown className="h-3.5 w-3.5 mr-1.5" />
                  Download
                </Button>
              ) : doc.signed ? (
                <DownloadOnDemandButton documentType={doc.type} />
              ) : (
                <Button
                  size="sm"
                  className="bg-sourceco hover:bg-sourceco/90 text-sourceco-foreground font-medium"
                  onClick={() => openSigning(doc.type)}
                >
                  Sign Now
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
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
