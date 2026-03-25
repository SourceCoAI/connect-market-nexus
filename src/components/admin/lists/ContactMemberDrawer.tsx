import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ClickToDialPhone } from '@/components/shared/ClickToDialPhone';
import {
  Mail,
  Phone,
  Building2,
  Briefcase,
  Calendar,
  PhoneCall,
  ExternalLink,
  UserMinus,
  User,
  Globe,
  Linkedin,
  MapPin,
  TrendingUp,
  
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { ContactListMember } from '@/types/contact-list';

const DEAL_ENTITY_TYPES = [
  'deal',
  'listing',
  'sourceco_deal',
  'gp_partner_deal',
  'referral_deal',
];

interface ContactMemberDrawerProps {
  member: ContactListMember | null;
  onClose: () => void;
  onRemove: (member: ContactListMember) => void;
  onNavigateToDeal: (member: ContactListMember) => void;
}

/**
 * Fetches enriched data for a contact list member by looking up:
 * 1. The contact record (from contacts table by email)
 * 2. The associated buyer/company (from buyers table)
 * 3. Related deals (from deal_pipeline)
 * 4. Related connection requests
 */
function useContactEnrichedData(member: ContactListMember | null) {
  const email = member?.contact_email || null;
  const entityType = member?.entity_type || null;
  const entityId = member?.entity_id || null;

  // Fetch contact record by email
  const { data: contactRecord, isLoading: contactLoading } = useQuery({
    queryKey: ['contact-member-detail', 'contact', email],
    queryFn: async () => {
      if (!email) return null;
      const { data, error } = await supabase
        .from('contacts')
        .select(
          'id, first_name, last_name, email, phone, linkedin_url, title, contact_type, firm_id, nda_signed, fee_agreement_signed, created_at, remarketing_buyer_id, listing_id, company_name',
        )
        .eq('email', email)
        .eq('archived', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!email,
    staleTime: 30000,
  });

  // Fetch buyer/company record
  const buyerId = contactRecord?.remarketing_buyer_id || null;
  const { data: buyerRecord, isLoading: buyerLoading } = useQuery({
    queryKey: ['contact-member-detail', 'buyer', buyerId, email],
    queryFn: async () => {
      // Try by buyer ID from contact first
      if (buyerId) {
        const { data } = await supabase
          .from('buyers')
          .select(
            'id, company_name, company_website, buyer_type, buyer_linkedin, hq_state, hq_city, target_revenue_min, target_revenue_max, target_geographies, target_services, thesis_summary, business_summary, pe_firm_name, acquisition_appetite, has_fee_agreement, industry_vertical, is_marketplace_member, buyer_tier',
          )
          .eq('id', buyerId)
          .maybeSingle();
        if (data) return data;
      }
      // Fallback: try matching by company name
      if (member?.contact_company) {
        const { data } = await supabase
          .from('buyers')
          .select(
            'id, company_name, company_website, buyer_type, buyer_linkedin, hq_state, hq_city, target_revenue_min, target_revenue_max, target_geographies, target_services, thesis_summary, business_summary, pe_firm_name, acquisition_appetite, has_fee_agreement, industry_vertical, is_marketplace_member, buyer_tier',
          )
          .ilike('company_name', member.contact_company)
          .eq('archived', false)
          .limit(1)
          .maybeSingle();
        if (data) return data;
      }
      return null;
    },
    enabled: !!buyerId || !!member?.contact_company,
    staleTime: 30000,
  });

  // Fetch related deals by email
  const { data: relatedDeals = [] } = useQuery({
    queryKey: ['contact-member-detail', 'deals', email],
    queryFn: async () => {
      if (!email) return [];
      const { data, error } = await supabase
        .from('deal_pipeline')
        .select('id, title, contact_name, contact_company, stage_id, priority, created_at, listing_id')
        .eq('contact_email', email)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) return [];
      return (data || []) as Array<{ id: string; title: string; contact_company: string | null; stage_id: string; priority: string | null; created_at: string | null; listing_id: string | null }>;
    },
    enabled: !!email,
    staleTime: 30000,
  });

  // Fetch connection request if entity is a CR type
  const { data: connectionRequest } = useQuery({
    queryKey: ['contact-member-detail', 'cr', entityId, entityType],
    queryFn: async () => {
      if (!entityId) return null;
      const { data } = await supabase
        .from('connection_requests' as never)
        .select('id, status, created_at, buyer_type, company_name, services_needed')
        .eq('id', entityId)
        .maybeSingle();
      return data as Record<string, unknown> | null;
    },
    enabled: !!entityId && entityType === 'connection_request',
    staleTime: 30000,
  });

  // Fetch firm agreement if contact has a firm
  const firmId = contactRecord?.firm_id || null;
  const { data: firmRecord } = useQuery({
    queryKey: ['contact-member-detail', 'firm', firmId],
    queryFn: async () => {
      if (!firmId) return null;
      const { data } = await supabase
        .from('firm_agreements')
        .select('id, primary_company_name, nda_signed, fee_agreement_signed, member_count')
        .eq('id', firmId)
        .maybeSingle();
      return data;
    },
    enabled: !!firmId,
    staleTime: 30000,
  });

  return {
    contactRecord,
    buyerRecord,
    relatedDeals,
    connectionRequest,
    firmRecord,
    isLoading: contactLoading || buyerLoading,
  };
}

function formatRevenue(min: number | null, max: number | null): string {
  const fmt = (v: number) => (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(0)}M` : `$${(v / 1_000).toFixed(0)}K`);
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  if (max) return `Up to ${fmt(max)}`;
  return '—';
}

function formatBuyerType(type: string | null): string {
  if (!type) return '—';
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function ContactMemberDrawer({
  member,
  onClose,
  onRemove,
  onNavigateToDeal,
}: ContactMemberDrawerProps) {
  const navigate = useNavigate();
  const isDealType = member ? DEAL_ENTITY_TYPES.includes(member.entity_type) : false;
  const { contactRecord, buyerRecord, relatedDeals, connectionRequest, firmRecord, isLoading } =
    useContactEnrichedData(member);

  return (
    <Sheet open={!!member} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        {member && (
          <>
            <SheetHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-lg truncate">
                    {member.contact_name || 'Unknown Contact'}
                  </SheetTitle>
                  {(member.contact_role || contactRecord?.title) && (
                    <SheetDescription className="truncate">
                      {member.contact_role || contactRecord?.title}
                      {member.contact_company && ` at ${member.contact_company}`}
                    </SheetDescription>
                  )}
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-5 pb-20">
              {isLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading details…
                </div>
              )}

              {/* Contact Info */}
              <section className="space-y-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Contact Info
                </h3>
                <div className="space-y-1.5">
                  {member.contact_email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <a
                        href={`mailto:${member.contact_email}`}
                        className="text-primary hover:underline truncate"
                      >
                        {member.contact_email}
                      </a>
                    </div>
                  )}
                  {(member.contact_phone || contactRecord?.phone) && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <ClickToDialPhone
                        phone={member.contact_phone || contactRecord?.phone || ''}
                        name={member.contact_name || undefined}
                        email={member.contact_email}
                        company={member.contact_company || undefined}
                        size="sm"
                      />
                    </div>
                  )}
                  {contactRecord?.linkedin_url && (
                    <div className="flex items-center gap-2 text-sm">
                      <Linkedin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <a
                        href={contactRecord.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline truncate"
                      >
                        LinkedIn Profile
                      </a>
                    </div>
                  )}
                  {member.contact_company && (
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-foreground">{member.contact_company}</span>
                    </div>
                  )}
                  {(member.contact_role || contactRecord?.title) && (
                    <div className="flex items-center gap-2 text-sm">
                      <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-foreground">
                        {member.contact_role || contactRecord?.title}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              <Separator />

              {/* Company / Buyer Info */}
              {buyerRecord && (
                <>
                  <section className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Company Details
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs gap-1 text-primary"
                        onClick={() => {
                          navigate(`/admin/remarketing/buyers/${buyerRecord.id}`);
                          onClose();
                        }}
                      >
                        View Buyer <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">
                          {buyerRecord.company_name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {buyerRecord.buyer_type && (
                            <Badge variant="secondary" className="text-[10px]">
                              {formatBuyerType(buyerRecord.buyer_type)}
                            </Badge>
                          )}
                          {buyerRecord.buyer_tier && (
                            <Badge variant="outline" className="text-[10px]">
                              Tier {buyerRecord.buyer_tier}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {buyerRecord.company_website && (
                        <div className="flex items-center gap-2 text-sm">
                          <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <a
                            href={
                              buyerRecord.company_website.startsWith('http')
                                ? buyerRecord.company_website
                                : `https://${buyerRecord.company_website}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline truncate"
                          >
                            {buyerRecord.company_website}
                          </a>
                        </div>
                      )}

                      {buyerRecord.buyer_linkedin && (
                        <div className="flex items-center gap-2 text-sm">
                          <Linkedin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <a
                            href={buyerRecord.buyer_linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline truncate"
                          >
                            Company LinkedIn
                          </a>
                        </div>
                      )}

                      {(buyerRecord.hq_city || buyerRecord.hq_state) && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-foreground">
                            {[buyerRecord.hq_city, buyerRecord.hq_state].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}

                      {buyerRecord.pe_firm_name && (
                        <div className="flex items-center gap-2 text-sm">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">PE Firm:</span>
                          <span className="text-foreground">{buyerRecord.pe_firm_name}</span>
                        </div>
                      )}

                      {buyerRecord.industry_vertical && (
                        <div className="flex items-center gap-2 text-sm">
                          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-foreground">{buyerRecord.industry_vertical}</span>
                        </div>
                      )}

                      {(buyerRecord.target_revenue_min || buyerRecord.target_revenue_max) && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Target Revenue</span>
                          <span className="text-foreground font-medium">
                            {formatRevenue(buyerRecord.target_revenue_min, buyerRecord.target_revenue_max)}
                          </span>
                        </div>
                      )}

                      {buyerRecord.acquisition_appetite && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Acquisition Appetite</span>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {buyerRecord.acquisition_appetite.split('_').join(' ')}
                          </Badge>
                        </div>
                      )}

                      {buyerRecord.target_geographies && buyerRecord.target_geographies.length > 0 && (
                        <div className="text-sm">
                          <span className="text-muted-foreground block mb-1">Target Geographies</span>
                          <div className="flex flex-wrap gap-1">
                            {(buyerRecord.target_geographies as string[]).slice(0, 6).map((geo) => (
                              <Badge key={geo} variant="secondary" className="text-[10px]">
                                {geo}
                              </Badge>
                            ))}
                            {(buyerRecord.target_geographies as string[]).length > 6 && (
                              <Badge variant="secondary" className="text-[10px]">
                                +{(buyerRecord.target_geographies as string[]).length - 6}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      {buyerRecord.target_services && buyerRecord.target_services.length > 0 && (
                        <div className="text-sm">
                          <span className="text-muted-foreground block mb-1">Target Services</span>
                          <div className="flex flex-wrap gap-1">
                            {(buyerRecord.target_services as string[]).slice(0, 6).map((svc) => (
                              <Badge key={svc} variant="secondary" className="text-[10px]">
                                {svc}
                              </Badge>
                            ))}
                            {(buyerRecord.target_services as string[]).length > 6 && (
                              <Badge variant="secondary" className="text-[10px]">
                                +{(buyerRecord.target_services as string[]).length - 6}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      {buyerRecord.thesis_summary && (
                        <div className="text-sm">
                          <span className="text-muted-foreground block mb-1">Investment Thesis</span>
                          <p className="text-foreground text-xs leading-relaxed line-clamp-3">
                            {buyerRecord.thesis_summary}
                          </p>
                        </div>
                      )}

                      {buyerRecord.business_summary && (
                        <div className="text-sm">
                          <span className="text-muted-foreground block mb-1">Business Summary</span>
                          <p className="text-foreground text-xs leading-relaxed line-clamp-3">
                            {buyerRecord.business_summary}
                          </p>
                        </div>
                      )}

                      {/* Agreement status */}
                      <div className="flex items-center gap-2 pt-1">
                        {buyerRecord.has_fee_agreement && (
                          <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            Fee Agreement ✓
                          </Badge>
                        )}
                        {buyerRecord.is_marketplace_member && (
                          <Badge className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                            Marketplace Member
                          </Badge>
                        )}
                      </div>
                    </div>
                  </section>
                  <Separator />
                </>
              )}

              {/* Firm Info */}
              {firmRecord && (
                <>
                  <section className="space-y-2.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Firm Agreement
                    </h3>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-foreground font-medium">
                          {firmRecord.primary_company_name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {firmRecord.member_count} member{firmRecord.member_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {firmRecord.nda_signed && (
                          <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            NDA ✓
                          </Badge>
                        )}
                        {firmRecord.fee_agreement_signed && (
                          <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            Fee Agreement ✓
                          </Badge>
                        )}
                      </div>
                    </div>
                  </section>
                  <Separator />
                </>
              )}

              {/* Source & List Info */}
              <section className="space-y-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Source & List Info
                </h3>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Entity Type</span>
                    <Badge variant="outline" className="text-[11px] font-normal capitalize">
                      {member.entity_type.split('_').join(' ')}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Added</span>
                    <span className="text-sm text-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(member.added_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                  {contactRecord?.contact_type && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Contact Type</span>
                      <Badge variant="secondary" className="text-[11px] capitalize">
                        {contactRecord.contact_type}
                      </Badge>
                    </div>
                  )}
                </div>
              </section>

              {/* Deal Owner */}
              {(member.deal_owner_name || isDealType) && (
                <>
                  <Separator />
                  <section className="space-y-2.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Deal Owner
                    </h3>
                    {member.deal_owner_name ? (
                      <span className="text-sm font-medium text-foreground">
                        {member.deal_owner_name}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground/60">Unassigned</span>
                    )}
                  </section>
                </>
              )}

              <Separator />

              {/* Call Activity */}
              <section className="space-y-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Call Activity
                </h3>
                {member.total_calls && member.total_calls > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Calls</span>
                      <span className="text-sm font-medium text-foreground flex items-center gap-1">
                        <PhoneCall className="h-3 w-3" />
                        {member.total_calls}
                      </span>
                    </div>
                    {member.last_call_date && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Last Call</span>
                        <span className="text-sm text-foreground">
                          {formatDistanceToNow(new Date(member.last_call_date), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    )}
                    {member.last_disposition && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Last Disposition</span>
                        <Badge variant="secondary" className="text-[11px]">
                          {member.last_disposition}
                        </Badge>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground/60">No call activity recorded</p>
                )}
              </section>

              {/* Related Deals */}
              {relatedDeals.length > 0 && (
                <>
                  <Separator />
                  <section className="space-y-2.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Related Deals ({relatedDeals.length})
                    </h3>
                    <div className="space-y-2">
                      {relatedDeals.map((deal) => (
                        <button
                          key={deal.id}
                          className="w-full text-left p-2 rounded-md border border-border hover:bg-muted/50 transition-colors"
                          onClick={() => {
                            navigate(`/admin/deals/${deal.id}`);
                            onClose();
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground truncate">
                              {deal.title || deal.contact_company || 'Unknown'}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {deal.stage_id && (
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {deal.stage_id.split('_').join(' ')}
                              </Badge>
                            )}
                            {deal.priority && (
                              <Badge variant="secondary" className="text-[10px] capitalize">
                                {deal.priority}
                              </Badge>
                            )}
                            {deal.created_at && (
                              <span className="text-[10px] text-muted-foreground ml-auto">
                                {format(new Date(deal.created_at), 'MMM d, yyyy')}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {/* Connection Request info */}
              {connectionRequest && (
                <>
                  <Separator />
                  <section className="space-y-2.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Connection Request
                    </h3>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Status</span>
                        <Badge variant="outline" className="text-[11px] capitalize">
                          {String(connectionRequest.status || '').split('_').join(' ')}
                        </Badge>
                      </div>
                      {!!connectionRequest.buyer_type && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Buyer Type</span>
                          <span className="text-sm text-foreground capitalize">
                            {String(connectionRequest.buyer_type).split('_').join(' ')}
                          </span>
                        </div>
                      )}
                      {!!connectionRequest.services_needed && (
                        <div className="text-sm">
                          <span className="text-muted-foreground block mb-1">Services Needed</span>
                          <p className="text-foreground text-xs">{String(connectionRequest.services_needed)}</p>
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}
            </div>

            {/* Fixed Footer Actions */}
            <div className="absolute bottom-0 left-0 right-0 border-t bg-background p-4 flex items-center gap-2">
              {isDealType && (
                <Button
                  size="sm"
                  onClick={() => onNavigateToDeal(member)}
                  className="gap-1.5"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View Deal
                </Button>
              )}
              {buyerRecord && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigate(`/admin/remarketing/buyers/${buyerRecord.id}`);
                    onClose();
                  }}
                  className="gap-1.5"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  View Company
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive hover:text-destructive ml-auto"
                onClick={() => onRemove(member)}
              >
                <UserMinus className="h-3.5 w-3.5" />
                Remove
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
