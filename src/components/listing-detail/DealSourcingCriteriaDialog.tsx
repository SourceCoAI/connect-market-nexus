import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ChevronDown, ChevronUp, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';
import { User as AppUser } from '@/types';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { BUYER_TYPE_LABELS } from '@/constants';

interface DealSourcingCriteriaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AppUser | null;
}

type DialogState = 'form' | 'calendar' | 'success';

export const DealSourcingCriteriaDialog = ({
  open,
  onOpenChange,
  user,
}: DealSourcingCriteriaDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>('form');
  const [isCollapsibleOpen, setIsCollapsibleOpen] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [showAllIndustries, setShowAllIndustries] = useState(false);
  const [calendarLoaded, setCalendarLoaded] = useState(false);

  const INITIAL_INDUSTRIES_DISPLAY = 3;

  const formatBuyerType = (type: string) => {
    return BUYER_TYPE_LABELS[type] || type;
  };

  const handleGetMyDeals = async () => {
    if (!user) return;
    setIsSubmitting(true);

    try {
      const { error } = await supabase.from('deal_sourcing_requests').insert([
        {
          user_id: user.id,
          buyer_type: user.buyer_type,
          business_categories: (user.business_categories as string[]) || null,
          target_locations: Array.isArray(user.target_locations)
            ? user.target_locations
            : user.target_locations
              ? [user.target_locations]
              : null,
          revenue_min: user.revenue_range_min || null,
          revenue_max: user.revenue_range_max || null,
          investment_thesis: user.ideal_target_description || null,
          additional_notes: customMessage || null,
          custom_message: customMessage || null,
        },
      ]);

      if (error) throw error;

      // Invalidate admin dashboard queries
      queryClient.invalidateQueries({ queryKey: ['deal-sourcing-requests'] });

      toast({
        title: '✅ Request Submitted Successfully',
        description: 'Redirecting you to schedule a discovery call...',
        duration: 4000,
      });

      // Add smooth transition delay
      setTimeout(() => {
        setDialogState('calendar');
        setIsSubmitting(false);
      }, 500);
    } catch (error) {
      toast({
        title: '❌ Submission Failed',
        description:
          error instanceof Error ? error.message : 'Please try again or contact support.',
        variant: 'destructive',
        duration: 6000,
      });
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setDialogState('form');
      setCustomMessage('');
      setCalendarLoaded(false);
    }, 200);
  };

  const renderFormView = () => (
    <DialogContent className="max-w-[92vw] w-full sm:max-w-[600px] lg:max-w-[680px] px-0 py-0 gap-0 overflow-hidden">
      <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-6 pb-3 sm:pb-4 border-b border-border/10">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-sourceco" />
            <DialogTitle className="text-[22px] sm:text-[26px] font-[300] tracking-tight text-foreground leading-[28px] sm:leading-[32px]">
              Let Us Source Deals for You
            </DialogTitle>
          </div>
          <DialogDescription className="text-[13px] sm:text-[14px] font-normal text-foreground/70 leading-[1.6]">
            From this form to qualified owner targets ready for conversations in 30 days.
            <br />
            <br />
            Gain 100% off-market visibility with our plug-in proprietary sourcing engine. We deliver
            4-10 pre-qualified, exclusive owner meetings monthly by uncovering off-market
            opportunities invisible to standard sourcing methods. Each one vetted by our in-house
            M&A team and aligned with your revenue range, industry thesis, and geography.
          </DialogDescription>
        </DialogHeader>
      </div>

      <ScrollArea className="max-h-[calc(65vh-160px)] sm:max-h-[calc(70vh-160px)]">
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 space-y-3.5 sm:space-y-4">
          <div className="pb-3 sm:pb-4 border-b border-border/10">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[13px] sm:text-[15px]">
              <span className="font-semibold text-foreground">
                {user?.company_name || 'Your Company'}
              </span>
              <span className="text-foreground/40">•</span>
              <span className="text-foreground/70">{formatBuyerType(user?.buyer_type || '')}</span>
              {user?.job_title && (
                <>
                  <span className="text-foreground/40">•</span>
                  <span className="text-foreground/70">{user.job_title}</span>
                </>
              )}
            </div>
          </div>

          <div className="space-y-4 sm:space-y-5">
            {user?.business_categories &&
              Array.isArray(user.business_categories) &&
              user.business_categories.length > 0 && (
                <div className="space-y-2 sm:space-y-2.5">
                  <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                    Target Industries
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {(showAllIndustries
                      ? user.business_categories
                      : user.business_categories.slice(0, INITIAL_INDUSTRIES_DISPLAY)
                    ).map((category) => (
                      <Badge
                        key={category}
                        variant="secondary"
                        className="bg-secondary/50 text-foreground/80 hover:bg-secondary text-[12px] sm:text-[13px] px-2.5 sm:px-3 py-0.5 sm:py-1 font-normal"
                      >
                        {category}
                      </Badge>
                    ))}
                    {user.business_categories.length > INITIAL_INDUSTRIES_DISPLAY && (
                      <button
                        onClick={() => setShowAllIndustries(!showAllIndustries)}
                        className="text-[12px] sm:text-[13px] text-primary hover:text-primary/80 transition-colors font-medium flex items-center gap-1"
                      >
                        {showAllIndustries ? (
                          <>
                            Show less <ChevronUp className="h-3 w-3" />
                          </>
                        ) : (
                          <>
                            +{user.business_categories.length - INITIAL_INDUSTRIES_DISPLAY} more{' '}
                            <ChevronDown className="h-3 w-3" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}

            {user?.target_locations &&
              Array.isArray(user.target_locations) &&
              user.target_locations.length > 0 && (
                <div className="space-y-2 sm:space-y-2.5">
                  <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                    Geographic Focus
                  </div>
                  <div className="text-[14px] sm:text-[15px] font-normal text-foreground">
                    {user.target_locations.join(', ')}
                  </div>
                </div>
              )}

            {(user?.revenue_range_min || user?.revenue_range_max) && (
              <div className="space-y-2">
                <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                  Revenue Target
                </div>
                <div className="text-[14px] sm:text-[15px] font-normal text-foreground tabular-nums">
                  {user.revenue_range_min && user.revenue_range_max
                    ? `$${parseInt(user.revenue_range_min).toLocaleString()} - $${parseInt(user.revenue_range_max).toLocaleString()}`
                    : user.revenue_range_min
                      ? `$${parseInt(user.revenue_range_min).toLocaleString()}+`
                      : user.revenue_range_max
                        ? `Up to $${parseInt(user.revenue_range_max).toLocaleString()}`
                        : 'Not specified'}
                </div>
              </div>
            )}

            {user?.ideal_target_description && (
              <div className="space-y-2 sm:space-y-3 pt-2">
                <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                  Investment Thesis
                </div>
                <div className="text-[14px] sm:text-[15px] font-normal text-foreground/80 leading-[1.65] whitespace-pre-wrap">
                  {user.ideal_target_description}
                </div>
              </div>
            )}
          </div>

          <Collapsible open={isCollapsibleOpen} onOpenChange={setIsCollapsibleOpen}>
            <CollapsibleTrigger className="w-full h-10 sm:h-11 rounded-md flex items-center justify-between text-[14px] sm:text-[15px] font-medium text-foreground hover:bg-secondary/50 transition-colors px-3 -mx-3">
              Additional Profile Details
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isCollapsibleOpen ? '-rotate-180' : 'rotate-0'}`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 sm:pt-4 space-y-3 sm:space-y-4">
              {(user?.ebitda_min || user?.ebitda_max) && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                    EBITDA Target
                  </div>
                  <div className="text-[14px] sm:text-[15px] font-normal text-foreground tabular-nums">
                    {user.ebitda_min && user.ebitda_max
                      ? `$${parseInt(user.ebitda_min).toLocaleString()} - $${parseInt(user.ebitda_max).toLocaleString()}`
                      : user.ebitda_min
                        ? `$${parseInt(user.ebitda_min).toLocaleString()}+`
                        : user.ebitda_max
                          ? `Up to $${parseInt(user.ebitda_max).toLocaleString()}`
                          : 'Not specified'}
                  </div>
                </div>
              )}

              {(user?.target_deal_size_min || user?.target_deal_size_max) && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                    Deal Size Range
                  </div>
                  <div className="text-[14px] sm:text-[15px] font-normal text-foreground tabular-nums">
                    {user.target_deal_size_min && user.target_deal_size_max
                      ? `$${user.target_deal_size_min.toLocaleString()} - $${user.target_deal_size_max.toLocaleString()}`
                      : user.target_deal_size_min
                        ? `$${user.target_deal_size_min.toLocaleString()}+`
                        : user.target_deal_size_max
                          ? `Up to $${user.target_deal_size_max.toLocaleString()}`
                          : 'Not specified'}
                  </div>
                </div>
              )}

              {user?.investment_size && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                    Investment Size
                  </div>
                  <div className="text-[14px] sm:text-[15px] font-normal text-foreground">
                    {Array.isArray(user.investment_size)
                      ? user.investment_size.join(', ')
                      : user.investment_size}
                  </div>
                </div>
              )}

              {user?.fund_size && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                    Fund Size
                  </div>
                  <div className="text-[14px] sm:text-[15px] font-normal text-foreground">
                    {user.fund_size}
                  </div>
                </div>
              )}

              {user?.aum && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                    AUM
                  </div>
                  <div className="text-[14px] sm:text-[15px] font-normal text-foreground">
                    {user.aum}
                  </div>
                </div>
              )}

              {user?.deal_intent && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                    Deal Intent
                  </div>
                  <div className="text-[14px] sm:text-[15px] font-normal text-foreground">
                    {user.deal_intent}
                  </div>
                </div>
              )}

              {user?.company_type && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                    Company Type
                  </div>
                  <div className="text-[14px] sm:text-[15px] font-normal text-foreground">
                    {user.company_type}
                  </div>
                </div>
              )}

              {user?.preferred_deal_structure && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                    Preferred Deal Structure
                  </div>
                  <div className="text-[14px] sm:text-[15px] font-normal text-foreground">
                    {user.preferred_deal_structure}
                  </div>
                </div>
              )}

              {user?.exclusions && Array.isArray(user.exclusions) && user.exclusions.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                    Exclusions
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {user.exclusions.map((exclusion) => (
                      <Badge
                        key={exclusion}
                        variant="outline"
                        className="text-[12px] sm:text-[13px] px-2.5 sm:px-3 py-0.5 sm:py-1 font-normal"
                      >
                        {exclusion}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {user?.include_keywords &&
                Array.isArray(user.include_keywords) &&
                user.include_keywords.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                      Include Keywords
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {user.include_keywords.map((keyword) => (
                        <Badge
                          key={keyword}
                          variant="secondary"
                          className="bg-secondary/50 text-foreground/80 hover:bg-secondary text-[12px] sm:text-[13px] px-2.5 sm:px-3 py-0.5 sm:py-1 font-normal"
                        >
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

              {(user?.add_on_only || user?.platform_only) && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                    Deal Type Preferences
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {user.add_on_only && (
                      <Badge
                        variant="secondary"
                        className="bg-secondary/50 text-foreground/80 text-[12px] sm:text-[13px] px-2.5 sm:px-3 py-0.5 sm:py-1"
                      >
                        Add-on Only
                      </Badge>
                    )}
                    {user.platform_only && (
                      <Badge
                        variant="secondary"
                        className="bg-secondary/50 text-foreground/80 text-[12px] sm:text-[13px] px-2.5 sm:px-3 py-0.5 sm:py-1"
                      >
                        Platform Only
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {user?.partner_in_operations && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                    Operational Involvement
                  </div>
                  <div className="text-[14px] sm:text-[15px] font-normal text-foreground">
                    Willing to partner in operations
                  </div>
                </div>
              )}

              {user?.additional_thesis_details && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">
                    Additional Thesis Details
                  </div>
                  <div className="text-[14px] sm:text-[15px] font-normal text-foreground/80 leading-[1.65] whitespace-pre-wrap">
                    {user.additional_thesis_details}
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-2.5 sm:space-y-3 pt-2">
            <div className="text-[12px] sm:text-[13px] font-medium text-foreground/80">
              Additional Notes (Optional)
            </div>
            <Textarea
              placeholder="Any specific requirements or questions for our deal sourcing team..."
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="min-h-[80px] sm:min-h-[100px] text-[13px] sm:text-[14px] resize-none"
            />
          </div>

          <div className="pt-3 sm:pt-4 border-t border-border/10">
            <p className="text-[11px] sm:text-xs text-foreground/50 text-center">
              Need to update your profile?{' '}
              <Link
                to="/profile"
                className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
                onClick={() => onOpenChange(false)}
              >
                Edit your criteria
              </Link>
            </p>
          </div>
        </div>
      </ScrollArea>

      <div className="px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 border-t border-border/10 bg-muted/30">
        <Button
          onClick={handleGetMyDeals}
          disabled={isSubmitting}
          className="w-full h-10 sm:h-11 bg-sourceco hover:bg-sourceco/90 text-sourceco-foreground font-semibold text-[13px] sm:text-[14px] tracking-wide transition-all duration-200"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            'Get My Deals'
          )}
        </Button>
      </div>
    </DialogContent>
  );

  const renderCalendarView = () => (
    <DialogContent className="max-w-[92vw] w-full sm:max-w-[660px] lg:max-w-[720px] px-0 py-0 gap-0 overflow-hidden">
      <div className="px-4 sm:px-8 pt-6 sm:pt-8 pb-4 sm:pb-6 border-b border-border/10">
        <DialogHeader className="space-y-2 sm:space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
            <DialogTitle className="text-[22px] sm:text-[28px] font-[300] tracking-tight text-foreground leading-[28px] sm:leading-[34px]">
              Request Submitted Successfully
            </DialogTitle>
          </div>
          <DialogDescription className="text-[14px] sm:text-[15px] font-normal text-foreground/60 leading-[1.65]">
            Schedule a discovery call with our team to discuss your deal criteria, or skip and we'll
            reach out via email.
          </DialogDescription>
        </DialogHeader>
      </div>

      <ScrollArea className="max-h-[calc(85vh-180px)]">
        <div className="px-4 sm:px-8 py-4 sm:py-6">
          <div className="relative w-full bg-background rounded-lg overflow-hidden border border-border/10">
            {!calendarLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Loading calendar...</p>
                </div>
              </div>
            )}
            <iframe
              src="https://tidycal.com/tomosmughan/30-minute-meeting"
              onLoad={() => setCalendarLoaded(true)}
              style={{
                width: '100%',
                height: '600px',
                border: 'none',
                opacity: calendarLoaded ? 1 : 0,
                transition: 'opacity 0.3s ease-in-out',
              }}
              title="Schedule a Meeting"
            />
          </div>
        </div>
      </ScrollArea>

      <div className="px-4 sm:px-8 py-4 sm:py-6 border-t border-border/10 bg-muted/30 flex flex-col sm:flex-row gap-3">
        <Button
          onClick={() => setDialogState('success')}
          variant="outline"
          className="w-full sm:w-auto h-10 sm:h-11 text-[13px] sm:text-[14px] font-medium"
        >
          Skip for now
        </Button>
        <Button
          onClick={() => setDialogState('success')}
          className="w-full sm:flex-1 h-10 sm:h-11 bg-sourceco hover:bg-sourceco/90 text-sourceco-foreground font-semibold text-[13px] sm:text-[14px] tracking-wide transition-all duration-200"
        >
          Done
        </Button>
      </div>
    </DialogContent>
  );

  const renderSuccessView = () => (
    <DialogContent className="max-w-[95vw] sm:max-w-[520px] px-0 py-0 gap-0">
      <div className="px-6 sm:px-8 py-8 sm:py-10 text-center space-y-4">
        <DialogHeader className="space-y-3 sm:space-y-4">
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-green-100 p-3 animate-in zoom-in duration-300">
              <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12 text-green-600" />
            </div>
            <DialogTitle className="text-[24px] sm:text-[28px] font-[300] tracking-tight text-foreground">
              All Set!
            </DialogTitle>
          </div>
          <DialogDescription className="text-[15px] sm:text-[16px] font-normal text-foreground/70 leading-[1.65] max-w-md mx-auto">
            Our team will review your criteria and reach out with tailored opportunities within
            24-48 hours.
          </DialogDescription>
          <div className="pt-2">
            <p className="text-sm text-muted-foreground">
              You can also check your dashboard for real-time updates on matching deals.
            </p>
          </div>
        </DialogHeader>

        <div className="pt-4">
          <Button
            onClick={handleClose}
            className="w-full sm:w-auto px-8 h-11 bg-sourceco hover:bg-sourceco/90 text-sourceco-foreground font-semibold"
          >
            Close
          </Button>
        </div>
      </div>
    </DialogContent>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <div
        className={cn(
          'transition-opacity duration-300',
          dialogState === 'form' ? 'opacity-100' : 'opacity-0 hidden',
        )}
      >
        {dialogState === 'form' && renderFormView()}
      </div>
      <div
        className={cn(
          'transition-opacity duration-300',
          dialogState === 'calendar' ? 'opacity-100' : 'opacity-0 hidden',
        )}
      >
        {dialogState === 'calendar' && renderCalendarView()}
      </div>
      <div
        className={cn(
          'transition-opacity duration-300',
          dialogState === 'success' ? 'opacity-100' : 'opacity-0 hidden',
        )}
      >
        {dialogState === 'success' && renderSuccessView()}
      </div>
    </Dialog>
  );
};
