import { Shield, FileSignature, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useRecentAgreementSignatures } from '@/hooks/admin/use-recent-agreement-signatures';

export function RecentAgreementSignaturesCard() {
  const { data: signatures = [], isLoading } = useRecentAgreementSignatures(8);

  if (isLoading) {
    return (
      <div className="border border-border/50 rounded-lg bg-card overflow-hidden">
        <div className="p-6 border-b border-border/50">
          <h3 className="text-sm font-semibold">Recent Signatures</h3>
          <p className="text-xs text-muted-foreground/70 mt-0.5">Loading...</p>
        </div>
        <div className="p-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="h-8 w-8 bg-muted/50 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-muted/50 rounded w-3/4" />
                <div className="h-2.5 bg-muted/50 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (signatures.length === 0) {
    return (
      <div className="border border-border/50 rounded-lg bg-card overflow-hidden">
        <div className="p-6 border-b border-border/50">
          <h3 className="text-sm font-semibold">Recent Signatures</h3>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            Signed agreements appear here in real-time
          </p>
        </div>
        <div className="p-8 text-center">
          <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground/70">No signed agreements yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border/50 rounded-lg bg-card overflow-hidden">
      <div className="p-6 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Recent Signatures</h3>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Latest signed NDAs & Fee Agreements
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground/50">
            <CheckCircle className="h-3 w-3" />
            {signatures.length} signed
          </div>
        </div>
      </div>
      <div className="divide-y divide-border/30 max-h-[400px] overflow-y-auto">
        {signatures.map((sig) => {
          const Icon = sig.agreementType === 'nda' ? Shield : FileSignature;
          const label = sig.agreementType === 'nda' ? 'NDA' : 'Fee Agreement';

          return (
            <div
              key={sig.id}
              className="flex items-center gap-3 px-6 py-3 hover:bg-muted/10 transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                <Icon className="h-3.5 w-3.5 text-accent-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {sig.firmName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {label} signed{' '}
                  {formatDistanceToNow(new Date(sig.signedAt), { addSuffix: true })}
                  {sig.signedByName && ` by ${sig.signedByName}`}
                </p>
              </div>
              <CheckCircle className="h-4 w-4 text-primary shrink-0" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
