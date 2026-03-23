import React, { useState, useEffect, useRef } from 'react';
import { ClickToDialPhone } from '@/components/shared/ClickToDialPhone';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import {
  Linkedin, Building2, Mail, Send,
  AlertCircle, MessageSquare, User, Briefcase, DollarSign, MapPin,
  CalendarDays, Clock, Star, FileText, ListChecks, FileSignature,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Deal } from '@/hooks/admin/use-deals';
import { useAdminProfiles } from '@/hooks/admin/use-admin-profiles';
import { useUpdateDeal } from '@/hooks/admin/use-deals';
import { useUpdateDealFollowup } from '@/hooks/admin/use-deal-followup';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useConnectionRequestDetails } from '@/hooks/admin/use-connection-request-details';
import { useConnectionMessages, useSendMessage, useMarkMessagesReadByAdmin } from '@/hooks/use-connection-messages';
import { cn } from '@/lib/utils';

interface PipelineDetailOverviewProps {
  deal: Deal;
  onSwitchTab?: (tab: string) => void;
}

export function PipelineDetailOverview({ deal }: PipelineDetailOverviewProps) {
  const { data: allAdminProfiles, isLoading: adminProfilesLoading } = useAdminProfiles();
  const updateDeal = useUpdateDeal();
  const updateDealFollowup = useUpdateDealFollowup();
  const { data: connectionRequestDetails } = useConnectionRequestDetails(deal.connection_request_id);

  const [followedUp, setFollowedUp] = React.useState(deal.followed_up || false);
  const [negativeFollowedUp, setNegativeFollowedUp] = React.useState(deal.negative_followed_up || false);
  const [underLoi, setUnderLoi] = React.useState(deal.under_loi || false);
  const [buyerProfile, setBuyerProfile] = React.useState<any>(null);

  // Messaging
  const connectionRequestId = deal.connection_request_id;
  const { data: messages = [], isLoading: messagesLoading } = useConnectionMessages(connectionRequestId);
  const sendMessage = useSendMessage();
  const markRead = useMarkMessagesReadByAdmin();
  const [newMessage, setNewMessage] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (connectionRequestId && messages.length > 0) {
      markRead.mutate(connectionRequestId);
    }
  }, [connectionRequestId, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    if (!newMessage.trim() || !connectionRequestId) return;
    sendMessage.mutate(
      { connection_request_id: connectionRequestId, body: newMessage.trim(), sender_role: 'admin' },
      { onSuccess: () => setNewMessage('') }
    );
  };

  // Fetch buyer profile
  React.useEffect(() => {
    const fetchProfile = async () => {
      if (!connectionRequestDetails?.user_id) return;
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, email, company, phone_number, buyer_type, linkedin_url, website')
        .eq('id', connectionRequestDetails.user_id)
        .maybeSingle();
      setBuyerProfile(data);
    };
    fetchProfile();
  }, [connectionRequestDetails?.user_id]);

  React.useEffect(() => {
    setFollowedUp(deal.followed_up || false);
    setNegativeFollowedUp(deal.negative_followed_up || false);
    setUnderLoi(deal.under_loi || false);
  }, [deal.followed_up, deal.negative_followed_up, deal.under_loi]);

  const isValidDate = (value?: string | null) => {
    if (!value) return false;
    return !isNaN(new Date(value!).getTime());
  };

  const formatDateSafely = (value?: string | null) => {
    if (!isValidDate(value)) return 'N/A';
    try { return formatDistanceToNow(new Date(value!), { addSuffix: true }); } catch { return 'N/A'; }
  };

  const handleOwnerChange = (value: string) => {
    updateDeal.mutate({ dealId: deal.deal_id, updates: { assigned_to: value === 'unassigned' ? null : value } });
  };

  const handleFollowupToggle = async (type: 'positive' | 'negative', newValue: boolean) => {
    if (type === 'positive') setFollowedUp(newValue);
    else setNegativeFollowedUp(newValue);

    const requestIds: string[] = [];
    if (deal.connection_request_id) requestIds.push(deal.connection_request_id);

    updateDealFollowup.mutate({
      dealId: deal.deal_id,
      connectionRequestIds: requestIds,
      isFollowedUp: newValue,
      followupType: type,
    });
  };

  const handleLoiToggle = (newValue: boolean) => {
    setUnderLoi(newValue);
    updateDeal.mutate({ dealId: deal.deal_id, updates: { under_loi: newValue } });
  };

  // Format currency helper
  const formatCurrency = (val?: number | null) => {
    if (val == null) return '—';
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val.toLocaleString()}`;
  };

  // Build combined messages
  const allMessages = React.useMemo(() => {
    const combined: Array<{
      id: string;
      body: string;
      sender_role: string;
      senderName: string;
      created_at: string;
      message_type?: string;
      isInquiry?: boolean;
    }> = [];

    if (connectionRequestDetails?.user_message) {
      combined.push({
        id: 'inquiry',
        body: connectionRequestDetails.user_message,
        sender_role: 'buyer',
        senderName: deal.contact_name || 'Buyer',
        created_at: connectionRequestDetails.created_at || deal.deal_created_at,
        isInquiry: true,
      });
    }

    messages.forEach((msg) => {
      const isAdmin = msg.sender_role === 'admin';
      const senderName = msg.sender
        ? `${msg.sender.first_name || ''} ${msg.sender.last_name || ''}`.trim() || msg.sender.email || 'Unknown'
        : isAdmin ? 'Admin' : deal.contact_name || 'Buyer';
      combined.push({
        id: msg.id,
        body: msg.body,
        sender_role: msg.sender_role,
        senderName,
        created_at: msg.created_at,
        message_type: msg.message_type,
      });
    });

    return combined;
  }, [connectionRequestDetails, messages, deal.contact_name, deal.deal_created_at]);

  // Derive display values
  const sellerName = deal.listing_real_company_name || deal.listing_title || deal.title || '—';
  const buyerName = deal.contact_name || buyerProfile?.first_name ? `${buyerProfile?.first_name || ''} ${buyerProfile?.last_name || ''}`.trim() : deal.contact_name || 'Unknown Buyer';
  const buyerCompany = deal.contact_company || buyerProfile?.company || null;
  const buyerType = buyerProfile?.buyer_type || null;
  const inquiryMessage = connectionRequestDetails?.user_message || deal.deal_description || null;
  const stageName = deal.stage_name || 'Unknown';
  const ownerName = deal.assigned_to && allAdminProfiles?.[deal.assigned_to]
    ? allAdminProfiles[deal.assigned_to].displayName
    : 'Unassigned';

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {/* ═══════════ HIGH-LEVEL SUMMARY ═══════════ */}
      <div className="px-8 pb-5 space-y-4">
        {/* Three-column summary cards */}
        <div className="grid grid-cols-3 gap-4">
          {/* Buyer Card */}
          <Card className="border-border/60 bg-muted/20">
            <CardContent className="p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">
                <User className="h-3.5 w-3.5" />
                Buyer
              </div>
              <p className="text-sm font-semibold text-foreground leading-tight">{buyerName}</p>
              {buyerCompany && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{buyerCompany}</span>
                </div>
              )}
              {buyerType && (
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                  {buyerType === 'private_equity' ? 'Private Equity' : buyerType === 'corporate' ? 'Corporate / Strategic' : buyerType === 'search_fund' ? 'Search Fund' : buyerType === 'family_office' ? 'Family Office' : buyerType === 'independent_sponsor' ? 'Independent Sponsor' : buyerType === 'individual_buyer' ? 'Individual Buyer' : buyerType}
                </span>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {deal.contact_email && (
                  <a href={`mailto:${deal.contact_email}`} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    <Mail className="h-3 w-3" />
                    <span className="truncate max-w-[120px]">{deal.contact_email}</span>
                  </a>
                )}
                {(deal.contact_phone || buyerProfile?.phone_number) && (
                  <ClickToDialPhone
                    phone={(deal.contact_phone || buyerProfile?.phone_number)!}
                    name={deal.contact_name || undefined}
                    email={deal.contact_email || undefined}
                    company={deal.contact_company || undefined}
                    size="xs"
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  />
                )}
                {buyerProfile?.linkedin_url && (
                  <a href={buyerProfile.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <Linkedin className="h-3 w-3" />
                    LinkedIn
                  </a>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Seller / Deal Card */}
          <Card className="border-border/60 bg-muted/20">
            <CardContent className="p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">
                <Briefcase className="h-3.5 w-3.5" />
                Seller / Deal
              </div>
              <p className="text-sm font-semibold text-foreground leading-tight truncate">{sellerName}</p>
              {deal.listing_location && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{deal.listing_location}</span>
                </div>
              )}
              {deal.listing_category && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="truncate">{deal.listing_category}</span>
                </div>
              )}
              <div className="flex items-center gap-3 pt-1">
                {deal.listing_revenue != null && deal.listing_revenue > 0 && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Rev: </span>
                    <span className="font-semibold text-foreground">{formatCurrency(deal.listing_revenue)}</span>
                  </div>
                )}
                {deal.listing_ebitda != null && deal.listing_ebitda > 0 && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">EBITDA: </span>
                    <span className="font-semibold text-foreground">{formatCurrency(deal.listing_ebitda)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Deal Status Card */}
          <Card className="border-border/60 bg-muted/20">
            <CardContent className="p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">
                <Star className="h-3.5 w-3.5" />
                Deal Status
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: deal.stage_color || 'hsl(var(--muted-foreground))' }} />
                <span className="text-sm font-semibold text-foreground">{stageName}</span>
                {underLoi && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded" style={{ backgroundColor: '#9333EA', color: '#FFFFFF' }}>
                    Under LOI
                  </span>
                )}
              </div>
              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5"><User className="h-3 w-3" /> Owner</span>
                  <span className="text-foreground font-medium">{ownerName}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="h-3 w-3" /> Deal Age</span>
                  <span className="text-foreground">{formatDateSafely(deal.deal_created_at)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5"><CalendarDays className="h-3 w-3" /> In Stage</span>
                  <span className="text-foreground">{formatDateSafely(deal.deal_stage_entered_at)}</span>
                </div>
                {deal.deal_score != null && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5"><DollarSign className="h-3 w-3" /> Score</span>
                    <span className="text-foreground font-mono font-semibold">{deal.deal_score}</span>
                  </div>
                )}
                {deal.total_tasks > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5"><ListChecks className="h-3 w-3" /> Tasks</span>
                    <span className={cn('font-medium', deal.pending_tasks > 0 ? 'text-red-700' : 'text-foreground')}>
                      {deal.pending_tasks > 0 ? `${deal.pending_tasks} open` : `${deal.completed_tasks}/${deal.total_tasks} done`}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Reason for Interest / Initial Inquiry */}
        {inquiryMessage && (
          <Card className="border-border/60 bg-accent/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">
                <MessageSquare className="h-3.5 w-3.5" />
                Reason for Interest
              </div>
              <p className="text-sm text-foreground leading-relaxed">{inquiryMessage}</p>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions Row */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Owner Selector */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Owner:</Label>
            <Select
              value={deal.assigned_to || 'unassigned'}
              onValueChange={handleOwnerChange}
              disabled={adminProfilesLoading || updateDeal.isPending}
            >
              <SelectTrigger className="w-[150px] h-7 text-xs">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {allAdminProfiles && Object.values(allAdminProfiles).map((admin) => (
                  <SelectItem key={admin.id} value={admin.id}>{admin.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Follow-up Toggles */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Follow-up:</span>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-foreground">Positive</span>
              <Switch checked={followedUp} onCheckedChange={(v) => handleFollowupToggle('positive', v)} className="scale-[0.65]" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-foreground">Rejection</span>
              <Switch checked={negativeFollowedUp} onCheckedChange={(v) => handleFollowupToggle('negative', v)} className="scale-[0.65]" />
            </div>
          </div>

          {/* Under LOI Toggle */}
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1">
            <FileSignature className={cn('h-3.5 w-3.5', underLoi ? 'text-purple-600' : 'text-muted-foreground')} />
            <span className="text-[11px] text-foreground">Under LOI</span>
            <Switch checked={underLoi} onCheckedChange={handleLoiToggle} className="scale-[0.65]" />
          </div>

          {/* NDA / Fee Status indicators */}
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-3 text-[11px]">
            <span className={cn(
              "px-2 py-0.5 rounded-full border font-medium",
              deal.nda_status === 'signed' ? "bg-green-50 text-green-700 border-green-200" :
              deal.nda_status === 'sent' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
              "bg-muted text-muted-foreground border-border"
            )}>
              NDA: {deal.nda_status === 'not_sent' ? 'Not Sent' : deal.nda_status.charAt(0).toUpperCase() + deal.nda_status.slice(1)}
            </span>
            <span className={cn(
              "px-2 py-0.5 rounded-full border font-medium",
              deal.fee_agreement_status === 'signed' ? "bg-green-50 text-green-700 border-green-200" :
              deal.fee_agreement_status === 'sent' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
              "bg-muted text-muted-foreground border-border"
            )}>
              Fee: {deal.fee_agreement_status === 'not_sent' ? 'Not Sent' : deal.fee_agreement_status.charAt(0).toUpperCase() + deal.fee_agreement_status.slice(1)}
            </span>
          </div>
        </div>
      </div>

      {/* ═══════════ MESSAGING AREA ═══════════ */}
      <div className="flex-1 flex flex-col min-h-0 border-t border-border/40">
        {!connectionRequestId ? (
          <div className="flex-1 flex items-center justify-center py-8">
            <div className="text-center space-y-3 max-w-xs">
              <AlertCircle className="w-10 h-10 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">No messaging available</p>
              <p className="text-xs text-muted-foreground/60">
                This deal was not created from a marketplace connection request.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="px-8 pt-4 pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8B6F47' }}>💬 Conversation</h3>
            </div>
            <ScrollArea className="flex-1 px-8">
              <div className="pb-4 space-y-3 rounded-lg p-3" style={{ backgroundColor: '#FCF9F0' }}>
                {messagesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="p-3 rounded-lg bg-muted/20 animate-pulse h-16" />
                    ))}
                  </div>
                ) : allMessages.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <MessageSquare className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm text-muted-foreground">No messages yet</p>
                    <p className="text-xs text-muted-foreground/60">Send a message to start the conversation.</p>
                  </div>
                ) : (
                  allMessages.map((msg) => {
                    const isAdmin = msg.sender_role === 'admin';
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          'max-w-[85%] rounded-xl px-4 py-3 space-y-1 shadow-sm',
                          isAdmin
                            ? 'ml-auto border'
                            : 'mr-auto border'
                        )}
                        style={isAdmin
                          ? { backgroundColor: '#F7F4DD', borderColor: '#E5DDD0', color: '#0E101A' }
                          : { backgroundColor: '#FFFFFF', borderColor: '#E5DDD0', color: '#0E101A' }
                        }
                      >
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="font-medium">{msg.senderName}</span>
                          <span>·</span>
                          <span>{formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}</span>
                          {msg.isInquiry && (
                            <span className="inline-block px-1.5 py-0.5 rounded font-semibold text-[10px]" style={{ backgroundColor: '#DEC76B', color: '#0E101A' }}>
                              Initial Inquiry
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{msg.body}</p>
                        {msg.message_type === 'decision' && (
                          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: '#DEC76B', color: '#0E101A' }}>
                            Decision
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            {/* Compose bar */}
            <div className="px-8 py-3" style={{ borderTop: '1px solid #E5DDD0' }}>
              <div className="flex items-end gap-3 rounded-lg border-2 p-2" style={{ borderColor: '#E5DDD0', backgroundColor: '#FFFFFF' }}>
                <Textarea
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="min-h-[50px] max-h-[100px] resize-none text-sm flex-1 border-0 shadow-none focus-visible:ring-0 p-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend();
                  }}
                />
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sendMessage.isPending}
                  className="h-9 px-4"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Send
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Cmd/Ctrl + Enter to send</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
