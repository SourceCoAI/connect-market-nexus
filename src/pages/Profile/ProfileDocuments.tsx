import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { FileDown, Shield, FileSignature, CheckCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

interface SignedDocument {
  type: 'nda' | 'fee_agreement';
  label: string;
  signed: boolean;
  signedAt: string | null;
  documentUrl: string | null;
}

function useSignedDocuments() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['buyer-signed-documents', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get firm membership
      const { data: membership } = await (
        supabase.from('firm_members' as never) as unknown as ReturnType<typeof supabase.from>
      )
        .select('firm_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (!membership) return [];
      const membershipData = membership as unknown as { firm_id: string };

      // Get firm agreement with signed doc URLs
      const { data: firmRaw } = await (
        supabase.from('firm_agreements' as never) as unknown as ReturnType<typeof supabase.from>
      )
        .select(
          'nda_signed, nda_signed_at, nda_signed_document_url, nda_document_url, fee_agreement_signed, fee_agreement_signed_at, fee_signed_document_url, fee_agreement_document_url',
        )
        .eq('id', membershipData.firm_id)
        .maybeSingle();

      if (!firmRaw) return [];
      const firm = firmRaw as unknown as {
        nda_signed: boolean | null;
        nda_signed_at: string | null;
        nda_signed_document_url: string | null;
        nda_document_url: string | null;
        fee_agreement_signed: boolean | null;
        fee_agreement_signed_at: string | null;
        fee_signed_document_url: string | null;
        fee_agreement_document_url: string | null;
      };

      const docs: SignedDocument[] = [];

      // NDA
      if (firm.nda_signed || firm.nda_signed_document_url || firm.nda_document_url) {
        docs.push({
          type: 'nda',
          label: 'Non-Disclosure Agreement (NDA)',
          signed: !!firm.nda_signed,
          signedAt: firm.nda_signed_at,
          documentUrl: firm.nda_signed_document_url || firm.nda_document_url || null,
        });
      }

      // Fee Agreement
      if (
        firm.fee_agreement_signed ||
        firm.fee_signed_document_url ||
        firm.fee_agreement_document_url
      ) {
        docs.push({
          type: 'fee_agreement',
          label: 'Fee Agreement',
          signed: !!firm.fee_agreement_signed,
          signedAt: firm.fee_agreement_signed_at,
          documentUrl: firm.fee_signed_document_url || firm.fee_agreement_document_url || null,
        });
      }

      return docs;
    },
    enabled: !!user?.id,
    staleTime: 15_000,
  });
}

export function ProfileDocuments() {
  const { data: documents, isLoading } = useSignedDocuments();

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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Signed Documents</CardTitle>
        <CardDescription>
          Download copies of your signed agreements for compliance records
        </CardDescription>
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
                  {doc.signed && (
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <CheckCircle className="h-3 w-3" />
                      Signed
                    </span>
                  )}
                  {doc.signedAt && (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(doc.signedAt), 'MMM d, yyyy')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {doc.documentUrl && doc.documentUrl.startsWith('https://') ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(doc.documentUrl!, '_blank', 'noopener,noreferrer')}
              >
                <FileDown className="h-3.5 w-3.5 mr-1.5" />
                Download
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Processing...</span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
