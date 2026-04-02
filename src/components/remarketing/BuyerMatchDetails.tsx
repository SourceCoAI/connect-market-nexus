/**
 * BuyerMatchDetails.tsx
 *
 * Expanded detail section for BuyerMatchCard — shows primary contact info
 * and investment thesis when the card is expanded.
 *
 * Extracted from BuyerMatchCard.tsx for maintainability.
 */
import { Mail, Phone, Linkedin } from 'lucide-react';
import type { ReMarketingBuyer } from '@/types/remarketing';

interface BuyerMatchDetailsProps {
  buyer?: ReMarketingBuyer;
}

export const BuyerMatchDetails = ({ buyer }: BuyerMatchDetailsProps) => {
  const primaryContact = buyer?.contacts?.find((c) => c.is_primary) || buyer?.contacts?.[0];

  return (
    <>
      {primaryContact && (
        <div className="border-t pt-3 pb-1">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Primary Contact</p>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {primaryContact.name}
              {primaryContact.role && (
                <span className="text-muted-foreground font-normal"> · {primaryContact.role}</span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {primaryContact.email && (
                <a
                  href={`mailto:${primaryContact.email}`}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Mail className="h-3 w-3" />
                  {primaryContact.email}
                </a>
              )}
              {primaryContact.phone && (
                <ClickToDialPhone
                  phone={primaryContact.phone}
                  name={primaryContact.name || undefined}
                  email={primaryContact.email || undefined}
                  size="xs"
                />
              )}
              {primaryContact.linkedin_url && (
                <a
                  href={primaryContact.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Linkedin className="h-3 w-3" />
                  LinkedIn
                </a>
              )}
            </div>
          </div>
        </div>
      )}
      {buyer?.thesis_summary && (
        <div className="border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Investment Thesis</p>
          <p className="text-sm italic text-muted-foreground">"{buyer.thesis_summary}"</p>
        </div>
      )}
    </>
  );
};
