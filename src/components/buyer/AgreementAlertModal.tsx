import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileSignature, Shield, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AgreementAlertModalProps {
  open: boolean;
  documentType: 'nda' | 'fee_agreement';
  onDismiss: () => void;
}

/**
 * Full-screen-style modal that appears when an NDA or Fee Agreement
 * notification arrives. Persists until user clicks through to Messages.
 */
export function AgreementAlertModal({ open, documentType, onDismiss }: AgreementAlertModalProps) {
  const navigate = useNavigate();
  const isNda = documentType === 'nda';

  const handleGoToDocuments = () => {
    onDismiss();
    navigate('/profile?tab=documents');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        /* prevent closing via overlay/escape */
      }}
    >
      <DialogContent
        className="sm:max-w-lg p-0 gap-0 [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header accent bar */}
        <div className="h-1.5 w-full bg-sourceco rounded-t-lg" />

        <div className="p-5 sm:p-8 text-center space-y-6">
          {/* Icon */}
          <div className="inline-flex p-4 rounded-full bg-sourceco/15 mx-auto">
            {isNda ? (
              <Shield className="h-10 w-10 text-sourceco" />
            ) : (
              <FileSignature className="h-10 w-10 text-sourceco" />
            )}
          </div>

          {/* Title */}
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">
            {isNda ? 'NDA Ready to Sign' : 'Fee Agreement Ready to Sign'}
          </h2>

          {/* Description */}
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed max-w-sm mx-auto">
            {isNda
              ? 'This is our standard NDA so we can freely exchange information about the companies on our platform. Sign it to unlock full deal access.'
              : 'Here is our fee agreement — you only pay a fee if you close a deal you meet on our platform. No upfront cost, ever.'}
          </p>

          {/* CTA */}
          <Button
            size="lg"
            className="w-full bg-sourceco hover:bg-sourceco/90 text-sourceco-foreground font-semibold text-base h-12"
            onClick={handleGoToDocuments}
          >
            View &amp; Sign Document
            <ArrowRight className="h-5 w-5 ml-2" />
          </Button>

          <p className="text-xs text-muted-foreground">
            You can also sign from your Profile &gt; Documents tab.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
