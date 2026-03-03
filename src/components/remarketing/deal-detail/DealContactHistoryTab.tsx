import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Users, Mail, Phone, Activity, User } from 'lucide-react';
import {
  ContactActivityTimeline,
  ContactActivityTimelineByEmail,
} from '@/components/remarketing/ContactActivityTimeline';

interface AssociatedBuyer {
  id: string;
  dealId: string;
  buyerName: string;
  buyerType: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  remarketing_buyer_id: string | null;
}

interface DealContactHistoryTabProps {
  listingId: string;
  /** Primary contact email on the listing/deal itself */
  primaryContactEmail?: string | null;
  /** Primary contact name on the listing/deal itself */
  primaryContactName?: string | null;
}

/**
 * DealContactHistoryTab
 *
 * Shows the full communication history (SmartLead emails + PhoneBurner calls + HeyReach LinkedIn)
 * for every contact associated with this deal. Following CRM best practices (HubSpot/Salesforce),
 * when a contact is associated with a deal, their entire outreach history is visible
 * on the deal page — so you can see at a glance that a business owner has been
 * emailed 5 times, called 3 times, and received 2 LinkedIn messages without leaving the deal context.
 *
 * Data sources:
 * - `deals` table: buyers associated with this listing (via listing_id)
 * - `contacts` table: contacts associated with this listing (via listing_id)
 * - SmartLead webhook events: email activity (via contact email)
 * - PhoneBurner contact_activities: call activity (via buyer_contacts / remarketing_buyer_id)
 * - HeyReach webhook events: LinkedIn outreach activity (via LinkedIn URL / email)
 */
export function DealContactHistoryTab({
  listingId,
  primaryContactEmail,
  primaryContactName,
}: DealContactHistoryTabProps) {
  const [activeTab, setActiveTab] = useState<string>('all');

  // 1. Fetch all buyers associated with this deal (from `deals` table)
  const { data: associatedBuyers = [], isLoading: buyersLoading } = useQuery({
    queryKey: ['deal-contact-history-buyers', listingId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase
        .from('deal_pipeline')
        .select(
          `
          id,
          contact_name,
          contact_email,
          contact_phone,
          remarketing_buyer_id,
          remarketing_buyers!deals_remarketing_buyer_id_fkey ( company_name, buyer_type )
        `,
        )
        .eq('listing_id', listingId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }) as { data: any[] | null; error: any };

      if (error) throw error;

      return (data || []).map(
        (d: any) => ({
          id: d.id,
          dealId: d.id,
          buyerName: d.remarketing_buyers?.company_name || d.contact_name || 'Unknown',
          buyerType: d.remarketing_buyers?.buyer_type || null,
          contactName: d.contact_name,
          contactEmail: d.contact_email,
          contactPhone: d.contact_phone,
          remarketing_buyer_id: d.remarketing_buyer_id,
        }),
      ) as AssociatedBuyer[];
    },
    enabled: !!listingId,
  });

  // 2. Fetch seller-side contacts (from `contacts` table linked to this listing)
  const { data: sellerContacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ['deal-contact-history-seller', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone, title, contact_type')
        .eq('listing_id', listingId)
        .eq('archived', false)
        .order('is_primary_seller_contact', { ascending: false });

      if (error) throw error;

      return (data || []).map((c) => ({
        id: c.id,
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
        email: c.email,
        phone: c.phone,
        title: c.title,
        contactType: c.contact_type,
      }));
    },
    enabled: !!listingId,
  });

  const isLoading = buyersLoading || contactsLoading;

  // Deduplicate contacts by email to avoid showing the same person twice
  const allContactEmails = new Set<string>();
  const uniqueBuyers: AssociatedBuyer[] = [];

  // Add primary contact first if it exists and isn't in the buyer list
  if (primaryContactEmail) {
    allContactEmails.add(primaryContactEmail.toLowerCase());
  }

  for (const b of associatedBuyers) {
    const email = b.contactEmail?.toLowerCase();
    if (email && allContactEmails.has(email)) continue;
    if (email) allContactEmails.add(email);
    uniqueBuyers.push(b);
  }

  // Total unique contacts = primary + unique buyers + seller contacts
  const totalContacts =
    (primaryContactEmail ? 1 : 0) +
    uniqueBuyers.length +
    sellerContacts.filter((c) => !allContactEmails.has(c.email?.toLowerCase() || '')).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Contact Communication History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasNoContacts =
    !primaryContactEmail && uniqueBuyers.length === 0 && sellerContacts.length === 0;

  if (hasNoContacts) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Contact Communication History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No contacts associated with this deal yet</p>
            <p className="text-xs mt-1">
              Add a primary contact or associate buyers to see their email and call history here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Build tab items
  const tabs: Array<{
    id: string;
    label: string;
    sublabel?: string;
    email?: string | null;
    buyerId?: string | null;
    type: 'primary' | 'buyer' | 'seller';
  }> = [];

  if (primaryContactEmail) {
    tabs.push({
      id: 'primary',
      label: primaryContactName || 'Primary Contact',
      sublabel: primaryContactEmail,
      email: primaryContactEmail,
      type: 'primary',
    });
  }

  for (const b of uniqueBuyers) {
    tabs.push({
      id: `buyer-${b.id}`,
      label: b.contactName || b.buyerName,
      sublabel: b.contactEmail || b.buyerType?.replace(/_/g, ' ') || undefined,
      email: b.contactEmail,
      buyerId: b.remarketing_buyer_id,
      type: 'buyer',
    });
  }

  for (const c of sellerContacts) {
    if (allContactEmails.has(c.email?.toLowerCase() || '')) continue;
    tabs.push({
      id: `seller-${c.id}`,
      label: c.name,
      sublabel: c.email || c.title || undefined,
      email: c.email,
      type: 'seller',
    });
  }

  const defaultTab = tabs.length > 0 ? tabs[0].id : 'all';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Contact Communication History
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {totalContacts} contact{totalContacts !== 1 ? 's' : ''}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Unified email (SmartLead), call (PhoneBurner), and LinkedIn (HeyReach) history for all
          contacts associated with this deal
        </p>
      </CardHeader>
      <CardContent>
        {tabs.length === 1 ? (
          // Single contact - show timeline directly
          <SingleContactTimeline tab={tabs[0]} />
        ) : (
          // Multiple contacts - tabbed view
          <Tabs value={activeTab === 'all' ? defaultTab : activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full flex overflow-x-auto">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="text-xs min-w-0 flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3 w-3" />
                    <span className="truncate max-w-[120px]">{tab.label}</span>
                    {tab.type === 'primary' && (
                      <Badge variant="default" className="text-[8px] px-1 py-0 h-4">
                        Primary
                      </Badge>
                    )}
                    {tab.type === 'buyer' && (
                      <Badge
                        variant="outline"
                        className="text-[8px] px-1 py-0 h-4 border-blue-200 text-blue-700"
                      >
                        Buyer
                      </Badge>
                    )}
                  </div>
                </TabsTrigger>
              ))}
            </TabsList>

            {tabs.map((tab) => (
              <TabsContent key={tab.id} value={tab.id} className="mt-4">
                {/* Contact info header */}
                <div className="flex items-center gap-4 mb-4 p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{tab.label}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {tab.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {tab.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                <SingleContactTimeline tab={tab} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

// Render the appropriate timeline based on available data
function SingleContactTimeline({
  tab,
}: {
  tab: {
    buyerId?: string | null;
    email?: string | null;
    label: string;
  };
}) {
  // Prefer buyer ID (gives us both email + call data), fall back to email-only lookup
  if (tab.buyerId) {
    return (
      <ContactActivityTimeline
        buyerId={tab.buyerId}
        title={`${tab.label} - Activity`}
        maxHeight={600}
        compact
      />
    );
  }

  if (tab.email) {
    return (
      <ContactActivityTimelineByEmail
        email={tab.email}
        title={`${tab.label} - Activity`}
        maxHeight={600}
        compact
      />
    );
  }

  return (
    <div className="text-center py-6 text-muted-foreground text-sm">
      <Phone className="h-6 w-6 mx-auto mb-2 opacity-40" />
      No email address on file — cannot look up communication history
    </div>
  );
}
