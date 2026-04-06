import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  Copy, 
  ExternalLink, 
  Loader2, 
  Mail, 
  Sparkles,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

interface BuyerEmailData {
  buyerId: string;
  buyerName: string;
  companyWebsite?: string;
  peFirmName?: string;
  contacts?: Array<{ name: string; email: string | null; role?: string }>;
  fitReasoning?: string;
  compositeScore: number;
}

interface DealData {
  id: string;
  title: string;
  location?: string;
  revenue?: number;
  ebitda?: number;
  category?: string;
  description?: string;
}

interface EmailPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyers: BuyerEmailData[];
  deal: DealData;
}

interface GeneratedEmail {
  buyerId: string;
  buyerName: string;
  subject: string;
  body: string;
  contactEmail?: string;
  contactName?: string;
  isLoading: boolean;
  error?: string;
}

export const EmailPreviewDialog = ({
  open,
  onOpenChange,
  buyers,
  deal,
}: EmailPreviewDialogProps) => {
  const [emails, setEmails] = useState<GeneratedEmail[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateAllEmailsRef = useRef<() => Promise<void>>();

  // Initialize emails when dialog opens
  useEffect(() => {
    if (open && buyers.length > 0) {
      setEmails(buyers.map(b => ({
        buyerId: b.buyerId,
        buyerName: b.buyerName,
        subject: '',
        body: '',
        contactEmail: b.contacts?.[0]?.email || undefined,
        contactName: b.contacts?.[0]?.name,
        isLoading: true,
      })));
      setCurrentIndex(0);
      generateAllEmailsRef.current?.();
    }
  }, [open, buyers]);

  const generateAllEmails = async () => {
    setIsGenerating(true);
    
    for (let i = 0; i < buyers.length; i++) {
      const buyer = buyers[i];
      try {
        const { data, error } = await supabase.functions.invoke('generate-buyer-intro', {
          body: {
            buyerId: buyer.buyerId,
            buyerName: buyer.buyerName,
            peFirmName: buyer.peFirmName,
            fitReasoning: buyer.fitReasoning,
            compositeScore: buyer.compositeScore,
            deal: {
              id: deal.id,
              title: deal.title,
              location: deal.location,
              revenue: deal.revenue,
              ebitda: deal.ebitda,
              category: deal.category,
              executive_summary: deal.executive_summary,
            },
            contactName: buyer.contacts?.[0]?.name,
          }
        });

        if (error) throw error;

        setEmails(prev => prev.map((e, idx) =>
          idx === i ? {
            ...e,
            subject: data.subject || `Introduction: ${deal.title}`,
            body: data.body || '',
            isLoading: false,
          } : e
        ));
      } catch (error) {
        // Generation failed — falling back to template
        setEmails(prev => prev.map((e, idx) =>
          idx === i ? {
            ...e,
            subject: `Introduction: ${deal.title}`,
            body: `Dear ${buyer.contacts?.[0]?.name || 'Team'},\n\nI wanted to reach out regarding a potential acquisition opportunity that aligns with your investment criteria...\n\nBest regards`,
            isLoading: false,
            error: 'Failed to generate - using template',
          } : e
        ));
      }
    }

    setIsGenerating(false);
  };
  generateAllEmailsRef.current = generateAllEmails;

  const regenerateEmail = async (index: number) => {
    const buyer = buyers[index];
    setEmails(prev => prev.map((e, i) => i === index ? { ...e, isLoading: true, error: undefined } : e));

    try {
      const { data, error } = await supabase.functions.invoke('generate-buyer-intro', {
        body: {
          buyerId: buyer.buyerId,
          buyerName: buyer.buyerName,
          peFirmName: buyer.peFirmName,
          fitReasoning: buyer.fitReasoning,
          compositeScore: buyer.compositeScore,
          deal: {
            id: deal.id,
            title: deal.title,
            location: deal.location,
            revenue: deal.revenue,
            ebitda: deal.ebitda,
            category: deal.category,
            executive_summary: deal.executive_summary,
          },
          contactName: buyer.contacts?.[0]?.name,
        }
      });

      if (error) throw error;

      setEmails(prev => prev.map((e, i) => 
        i === index ? {
          ...e,
          subject: data.subject || e.subject,
          body: data.body || e.body,
          isLoading: false,
        } : e
      ));
    } catch (error) {
      // Regeneration failed — error state set below
      setEmails(prev => prev.map((e, i) => 
        i === index ? { ...e, isLoading: false, error: 'Failed to regenerate' } : e
      ));
    }
  };

  const handleCopyToClipboard = async () => {
    const email = emails[currentIndex];
    const fullEmail = `Subject: ${email.subject}\n\n${email.body}`;
    await navigator.clipboard.writeText(fullEmail);
    toast.success('Email copied to clipboard');
  };

  const handleOpenInMailClient = () => {
    const email = emails[currentIndex];
    const mailtoLink = `mailto:${email.contactEmail || ''}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
    window.open(mailtoLink, '_blank');
  };

  const updateEmailField = (field: 'subject' | 'body', value: string) => {
    setEmails(prev => prev.map((e, i) => 
      i === currentIndex ? { ...e, [field]: value } : e
    ));
  };

  const currentEmail = emails[currentIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Generate Introduction Emails
          </DialogTitle>
          <DialogDescription>
            AI-generated personalized intro emails for selected buyers
          </DialogDescription>
        </DialogHeader>

        {/* Navigation Bar */}
        {buyers.length > 1 && (
          <div className="flex items-center justify-between border-b pb-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex(prev => prev - 1)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {currentIndex + 1} of {buyers.length}
              </span>
              {isGenerating && (
                <Badge variant="secondary" className="text-xs">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Generating...
                </Badge>
              )}
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              disabled={currentIndex === buyers.length - 1}
              onClick={() => setCurrentIndex(prev => prev + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Email Preview */}
        <ScrollArea className="max-h-[60vh]">
          {currentEmail?.isLoading ? (
            <div className="space-y-4 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                <span className="text-sm text-muted-foreground">
                  Generating personalized email for {currentEmail.buyerName}...
                </span>
              </div>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : currentEmail ? (
            <div className="space-y-4 p-1">
              {/* Buyer Info */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{currentEmail.buyerName}</h4>
                  {currentEmail.contactName && (
                    <p className="text-sm text-muted-foreground">
                      To: {currentEmail.contactName} {currentEmail.contactEmail && `<${currentEmail.contactEmail}>`}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => regenerateEmail(currentIndex)}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Regenerate
                </Button>
              </div>

              {currentEmail.error && (
                <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                  {currentEmail.error}
                </div>
              )}

              {/* Subject */}
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={currentEmail.subject}
                  onChange={(e) => updateEmailField('subject', e.target.value)}
                  placeholder="Email subject"
                />
              </div>

              {/* Body */}
              <div className="space-y-2">
                <Label>Body</Label>
                <Textarea
                  value={currentEmail.body}
                  onChange={(e) => updateEmailField('body', e.target.value)}
                  placeholder="Email body"
                  className="min-h-[250px] font-mono text-sm"
                />
              </div>
            </div>
          ) : null}
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleCopyToClipboard}
            disabled={!currentEmail || currentEmail.isLoading}
          >
            <Copy className="h-4 w-4 mr-1" />
            Copy to Clipboard
          </Button>
          <Button
            onClick={handleOpenInMailClient}
            disabled={!currentEmail || currentEmail.isLoading}
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            Open in Mail Client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmailPreviewDialog;
