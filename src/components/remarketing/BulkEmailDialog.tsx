import { EmailPreviewDialog } from "./EmailPreviewDialog";

interface ScoreWithBuyer {
  id: string;
  buyer_id: string;
  composite_score: number;
  fit_reasoning?: string;
  buyer?: {
    company_name?: string;
    company_website?: string;
    pe_firm_name?: string;
    contacts?: Array<{
      id: string;
      first_name?: string;
      last_name?: string;
      email?: string;
    }>;
  };
}

interface Listing {
  id: string;
  title: string;
  location?: string;
  revenue?: number;
  ebitda?: number;
  category?: string;
  description?: string;
  executive_summary?: string;
}

interface BulkEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scores: ScoreWithBuyer[];
  listing: Listing | undefined;
  onSent?: (buyerIds: string[]) => void;
}

export const BulkEmailDialog = ({
  open,
  onOpenChange,
  scores,
  listing,
  onSent,
}: BulkEmailDialogProps) => {
  // Transform scores into the buyer email data format expected by EmailPreviewDialog
  const buyers = scores.map((score) => ({
    buyerId: score.buyer_id,
    buyerName: score.buyer?.company_name || "Unknown Buyer",
    companyWebsite: score.buyer?.company_website,
    peFirmName: score.buyer?.pe_firm_name,
    contacts: (score.buyer?.contacts || []).map((c) => ({
      name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown",
      email: c.email || null,
    })),
    fitReasoning: score.fit_reasoning,
    compositeScore: score.composite_score,
  }));

  const deal = listing
    ? {
        id: listing.id,
        title: listing.title,
        location: listing.location,
        revenue: listing.revenue,
        ebitda: listing.ebitda,
        category: listing.category,
        executive_summary: listing.executive_summary,
      }
    : { id: "", title: "Unknown Deal" };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && onSent) {
      // Notify parent of the buyer IDs that were in the email dialog
      onSent(scores.map((s) => s.buyer_id));
    }
    onOpenChange(isOpen);
  };

  return (
    <EmailPreviewDialog
      open={open}
      onOpenChange={handleOpenChange}
      buyers={buyers}
      deal={deal}
    />
  );
};

export default BulkEmailDialog;
