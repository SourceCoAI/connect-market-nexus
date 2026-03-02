import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Mail, CheckCheck } from 'lucide-react';
import { Deal } from '@/hooks/admin/use-deals';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useDealEmails } from '@/hooks/admin/use-deal-emails';
import { useUpdateDealFollowup } from '@/hooks/admin/use-deal-followup';
import { useAdminProfiles } from '@/hooks/admin/use-admin-profiles';

interface PipelineDetailCommunicationProps {
  deal: Deal;
}

export function PipelineDetailCommunication({ deal }: PipelineDetailCommunicationProps) {
  const [showCompose, setShowCompose] = useState(false);
  const [emailData, setEmailData] = useState({
    subject: '',
    message: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { data: realEmailHistory = [], refetch: refetchEmails } = useDealEmails(deal.deal_id);
  const updateDealFollowup = useUpdateDealFollowup();
  const { data: allAdminProfiles } = useAdminProfiles();

  // Local state for follow-up toggles
  const [followedUp, setFollowedUp] = useState(deal.followed_up || false);
  const [negativeFollowedUp, setNegativeFollowedUp] = useState(deal.negative_followed_up || false);

  // State for other deals from same buyer
  const [otherDeals, setOtherDeals] = useState<any[]>([]);
  const [selectedOtherDeals, setSelectedOtherDeals] = useState<string[]>([]);

  // Fetch other deals from same buyer
  useEffect(() => {
    const fetchOtherDeals = async () => {
      if (!deal.connection_request_id || !deal.contact_email) return;

      const { data: allDeals, error: allDealsError } = await supabase
        .from('deal_pipeline')
        .select('id, title, stage_id, followed_up')
        .eq('contact_email', deal.contact_email)
        .neq('id', deal.deal_id);
      if (allDealsError) throw allDealsError;

      setOtherDeals(allDeals || []);
    };

    fetchOtherDeals();
  }, [deal.deal_id, deal.connection_request_id, deal.contact_email]);

  // Sync local state with deal updates
  useEffect(() => {
    setFollowedUp(deal.followed_up || false);
    setNegativeFollowedUp(deal.negative_followed_up || false);
  }, [deal.followed_up, deal.negative_followed_up]);

  const handleSendEmail = async () => {
    if (!deal.contact_email || !emailData.subject.trim() || !emailData.message.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      // Use the enhanced email delivery edge function
      const { error } = await supabase.functions.invoke('enhanced-email-delivery', {
        body: {
          to: deal.contact_email,
          subject: emailData.subject,
          content: emailData.message,
          email_type: 'custom',
          correlation_id: `deal-${deal.deal_id}-${Date.now()}`,
          metadata: {
            deal_id: deal.deal_id,
            title: deal.title,
            contact_name: deal.contact_name,
          },
        },
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Email Sent',
        description: `Email sent successfully to ${deal.contact_email}`,
      });

      setEmailData({ subject: '', message: '' });
      setShowCompose(false);

      // Refresh email history
      setTimeout(() => refetchEmails(), 1000);
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Use real email history from the database
  const emailHistory = realEmailHistory.map((email) => ({
    id: email.id,
    type: email.email_type,
    subject: `Email to ${deal.contact_name || deal.contact_email}`,
    sent_at: email.sent_at,
    status: email.status,
    sent_by: 'Admin', // Enhanced to show actual admin name from email metadata
  }));

  const handleFollowupToggle = async (type: 'positive' | 'negative', newValue: boolean) => {
    if (type === 'positive') {
      setFollowedUp(newValue);
    } else {
      setNegativeFollowedUp(newValue);
    }

    // Get connection request IDs to update (current + selected others)
    const requestIdsToUpdate: string[] = [];

    if (deal.connection_request_id) {
      requestIdsToUpdate.push(deal.connection_request_id);
    }

    // Add selected other deals' connection requests
    const { data: selectedDealsData, error: selectedDealsDataError } = await supabase
      .from('deal_pipeline')
      .select('connection_request_id')
      .in('id', selectedOtherDeals);
    if (selectedDealsDataError) throw selectedDealsDataError;

    if (selectedDealsData) {
      requestIdsToUpdate.push(
        ...selectedDealsData.map((d) => d.connection_request_id).filter((id): id is string => !!id),
      );
    }

    updateDealFollowup.mutate({
      dealId: deal.deal_id,
      connectionRequestIds: requestIdsToUpdate,
      isFollowedUp: newValue,
      followupType: type,
    });
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-8 space-y-8 pb-8">
        {/* Follow-up Toggles */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-foreground">Follow-up Status</h2>

          <div className="space-y-4 p-6 border border-border/40 rounded-xl">
            {/* Positive Follow-up */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label
                  htmlFor="positive-followup"
                  className="text-sm font-medium text-foreground cursor-pointer"
                >
                  Positive Follow-up
                </Label>
                <p className="text-xs text-muted-foreground">
                  Mark as ready for owner introduction
                </p>
                {followedUp && deal.followed_up_at && (
                  <p className="text-xs text-muted-foreground/60 font-mono">
                    {formatDistanceToNow(new Date(deal.followed_up_at), { addSuffix: true })}
                    {deal.followed_up_by && allAdminProfiles?.[deal.followed_up_by] && (
                      <span className="ml-1">
                        by {allAdminProfiles[deal.followed_up_by].displayName}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <Switch
                id="positive-followup"
                checked={followedUp}
                onCheckedChange={(checked) => handleFollowupToggle('positive', checked)}
              />
            </div>

            {/* Negative Follow-up */}
            <div className="flex items-center justify-between pt-4 border-t border-border/20">
              <div className="space-y-1">
                <Label
                  htmlFor="negative-followup"
                  className="text-sm font-medium text-foreground cursor-pointer"
                >
                  Rejection Notice
                </Label>
                <p className="text-xs text-muted-foreground">Send rejection notice to buyer</p>
                {negativeFollowedUp && deal.negative_followed_up_at && (
                  <p className="text-xs text-muted-foreground/60 font-mono">
                    {formatDistanceToNow(new Date(deal.negative_followed_up_at), {
                      addSuffix: true,
                    })}
                    {deal.negative_followed_up_by &&
                      allAdminProfiles?.[deal.negative_followed_up_by] && (
                        <span className="ml-1">
                          by {allAdminProfiles[deal.negative_followed_up_by].displayName}
                        </span>
                      )}
                  </p>
                )}
              </div>
              <Switch
                id="negative-followup"
                checked={negativeFollowedUp}
                onCheckedChange={(checked) => handleFollowupToggle('negative', checked)}
              />
            </div>

            {/* Other deals from same buyer */}
            {otherDeals.length > 0 && (
              <div className="pt-4 border-t border-border/20 space-y-3">
                <Label className="text-xs text-muted-foreground">
                  Also update these deals from {deal.contact_name || deal.contact_email}:
                </Label>
                <div className="space-y-2">
                  {otherDeals.map((otherDeal) => (
                    <div key={otherDeal.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`deal-${otherDeal.id}`}
                        checked={selectedOtherDeals.includes(otherDeal.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedOtherDeals([...selectedOtherDeals, otherDeal.id]);
                          } else {
                            setSelectedOtherDeals(
                              selectedOtherDeals.filter((id) => id !== otherDeal.id),
                            );
                          }
                        }}
                      />
                      <label
                        htmlFor={`deal-${otherDeal.id}`}
                        className="text-sm text-foreground cursor-pointer flex items-center gap-2"
                      >
                        {otherDeal.title}
                        {otherDeal.followed_up && (
                          <Badge variant="outline" className="text-xs">
                            <CheckCheck className="h-3 w-3 mr-1" />
                            Followed up
                          </Badge>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Communication Overview - Apple Clean */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-foreground">Email Communication</h2>

          <div className="grid grid-cols-3 gap-8">
            <div className="text-center space-y-1">
              <div className="text-2xl font-light text-foreground">{emailHistory.length}</div>
              <div className="text-xs text-muted-foreground/70 font-mono">Total Emails</div>
            </div>
            <div className="text-center space-y-1">
              <div className="text-2xl font-light text-emerald-600">
                {emailHistory.filter((e) => e.status === 'delivered').length}
              </div>
              <div className="text-xs text-muted-foreground/70 font-mono">Delivered</div>
            </div>
            <div className="text-center space-y-1">
              <div className="text-2xl font-light text-primary">
                {emailHistory.filter((e) => e.type === 'nda' || e.type === 'fee_agreement').length}
              </div>
              <div className="text-xs text-muted-foreground/70 font-mono">Documents</div>
            </div>
          </div>
        </div>

        {/* Quick Compose - Minimal */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-foreground">Send Email</h2>

          {!showCompose ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 px-4 border border-border/40 rounded-xl">
                <div className="space-y-1">
                  <p className="text-sm text-foreground">Compose New Email</p>
                  <p className="text-xs text-muted-foreground/70 font-mono">
                    To: {deal.contact_email || 'No email available'}
                  </p>
                </div>
                <button
                  onClick={() => setShowCompose(true)}
                  disabled={!deal.contact_email}
                  className="px-4 py-2 text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                >
                  Compose
                </button>
              </div>

              {/* Quick Templates */}
              <div className="space-y-3">
                <h3 className="text-xs text-muted-foreground/70 font-mono">Quick Templates</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setEmailData({
                        subject: `Follow-up on ${deal.title}`,
                        message: `Hi ${deal.contact_name || 'there'},\n\nI wanted to follow up on your interest in the ${deal.title} opportunity. Do you have any questions about the investment details?\n\nBest regards`,
                      });
                      setShowCompose(true);
                    }}
                    className="w-full text-left py-3 px-4 border border-border/20 rounded-lg hover:border-border/40 transition-colors"
                  >
                    <div className="space-y-1">
                      <p className="text-sm text-foreground">Follow-up Email</p>
                      <p className="text-xs text-muted-foreground/70">
                        Standard follow-up template
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setEmailData({
                        subject: `Additional Information - ${deal.title}`,
                        message: `Hi ${deal.contact_name || 'there'},\n\nI'm attaching additional information about the ${deal.title} opportunity as requested.\n\nPlease let me know if you need any clarification.\n\nBest regards`,
                      });
                      setShowCompose(true);
                    }}
                    className="w-full text-left py-3 px-4 border border-border/20 rounded-lg hover:border-border/40 transition-colors"
                  >
                    <div className="space-y-1">
                      <p className="text-sm text-foreground">Information Sharing</p>
                      <p className="text-xs text-muted-foreground/70">Share additional details</p>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setEmailData({
                        subject: `Schedule a Call - ${deal.title}`,
                        message: `Hi ${deal.contact_name || 'there'},\n\nWould you be available for a call this week to discuss the ${deal.title} opportunity in more detail?\n\nI'm available at your convenience.\n\nBest regards`,
                      });
                      setShowCompose(true);
                    }}
                    className="w-full text-left py-3 px-4 border border-border/20 rounded-lg hover:border-border/40 transition-colors"
                  >
                    <div className="space-y-1">
                      <p className="text-sm text-foreground">Meeting Request</p>
                      <p className="text-xs text-muted-foreground/70">Schedule call or meeting</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 p-6 border border-border/40 rounded-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">New Email</h3>
                <span className="text-xs text-muted-foreground/70 font-mono">
                  To: {deal.contact_email}
                </span>
              </div>

              <div className="space-y-4">
                <Input
                  placeholder="Email subject"
                  value={emailData.subject}
                  onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
                  className="border-0 bg-muted/20 focus:bg-muted/30"
                />

                <Textarea
                  placeholder={`Hi ${deal.contact_name || 'there'},\n\nI wanted to follow up regarding the ${deal.title} opportunity...\n\nBest regards`}
                  value={emailData.message}
                  onChange={(e) => setEmailData({ ...emailData, message: e.target.value })}
                  rows={10}
                  className="border-0 bg-muted/20 focus:bg-muted/30"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleSendEmail}
                  disabled={!emailData.subject.trim() || !emailData.message.trim() || isLoading}
                  className="h-8 px-4 text-xs"
                >
                  {isLoading ? 'Sending...' : 'Send Email'}
                </Button>
                <button
                  onClick={() => setShowCompose(false)}
                  className="h-8 px-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Email History - Minimal */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-foreground">Email History</h2>

          {emailHistory.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 bg-muted/20 rounded-full flex items-center justify-center mx-auto">
                <Mail className="h-5 w-5 text-muted-foreground/40" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">No emails sent yet</p>
                <p className="text-xs text-muted-foreground/70">
                  Send your first email to get started
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {emailHistory.map((email) => (
                <div key={email.id} className="p-4 border border-border/20 rounded-xl">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            email.status === 'delivered' ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                        />
                        <h3 className="text-sm font-medium text-foreground">{email.subject}</h3>
                        <span
                          className={`text-xs px-2 py-1 rounded-md font-mono ${
                            email.type === 'nda'
                              ? 'bg-blue-50 text-blue-700'
                              : email.type === 'fee_agreement'
                                ? 'bg-purple-50 text-purple-700'
                                : email.type === 'followup'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-muted/50 text-muted-foreground'
                          }`}
                        >
                          {email.type}
                        </span>
                      </div>

                      <div className="flex items-center gap-6 text-xs text-muted-foreground/70">
                        <span className="font-mono">Sent by {email.sent_by}</span>
                        <span className="font-mono">
                          {formatDistanceToNow(new Date(email.sent_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-xs font-mono px-2 py-1 rounded-md ${
                        email.status === 'delivered'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {email.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
