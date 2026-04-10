/**
 * WebflowLeadDetail.tsx
 *
 * Purpose-built detail view for Webflow form submissions (guest leads only).
 * When a Webflow lead is matched to a marketplace user, ConnectionRequestRow
 * routes through ConnectionRequestActions instead.
 *
 * Includes full approval workflow (Accept/Decline/On Hold/Flag) for guest leads.
 */
import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Globe, User, Building2, Mail, Phone, Briefcase, ExternalLink, FileText, Clock, CheckCircle, Info } from 'lucide-react';
import { ConnectionRequestEmailDialog } from './ConnectionRequestEmailDialog';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AdminConnectionRequest } from '@/types/admin';
import { LeadRequestActions } from './LeadRequestActions';
import { ApprovalSection } from './connection-request-actions/ApprovalSection';
import { FlagReviewBanner, FlagReviewPopover } from './connection-request-actions/FlagReviewSection';
import { useUpdateConnectionRequestStatus } from '@/hooks/admin/use-connection-request-status';
import { useFlagConnectionRequest } from '@/hooks/admin/use-flag-connection-request';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AdminProfile } from './connection-request-actions/types';

interface WebflowLeadDetailProps {
  request: AdminConnectionRequest;
}

export function WebflowLeadDetail({ request }: WebflowLeadDetailProps) {
  const meta = (request.source_metadata || {}) as Record<string, unknown>;
  const rawPayload = (meta.raw_payload as Record<string, unknown>) || {};
  const payload = (rawPayload.payload as Record<string, unknown>) || {};
  const formData = (payload.data as Record<string, string>) || {};
  const formName = (payload.name as string) || (meta.form_name as string) || 'Deal Request Form';
  const pageUrl = (meta.page_url as string) || '';
  const submittedAt = (meta.submitted_at as string) || request.created_at;

  // Status & approval state
  const requestStatus = (request.status === 'converted' ? 'approved' : request.status === 'notified' || request.status === 'reviewed' ? 'pending' : request.status) as 'pending' | 'approved' | 'rejected' | 'on_hold';
  const updateStatus = useUpdateConnectionRequestStatus();
  const flagMutation = useFlagConnectionRequest();
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [flagPopoverOpen, setFlagPopoverOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailActionType, setEmailActionType] = useState<'approve' | 'reject' | null>(null);

  // Fetch admin list for flag assignment
  const { data: adminList = [] } = useQuery<AdminProfile[]>({
    queryKey: ['admin-profiles-for-flag'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('is_admin', true);
      return (data || []).map((p) => ({
        id: p.id,
        displayName: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Admin',
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const leadName = request.lead_name || 'Website Lead';
  const leadCompany = request.lead_company || '';

  const openEmailDialog = (action: 'approve' | 'reject') => {
    setEmailActionType(action);
    setEmailDialogOpen(true);
  };
  const handleEmailDialogConfirm = async (_comment: string, senderEmail: string, customBody?: string) => {
    if (!request.id) return;

    // Look up sender info
    const { DEAL_OWNER_SENDERS } = await import('@/lib/admin-profiles');
    const senderInfo = senderEmail ? DEAL_OWNER_SENDERS.find(s => s.email === senderEmail) : null;

    if (emailActionType === 'approve') {
      updateStatus.mutate({ requestId: request.id, status: 'approved' });

      // Send approval email
      const buyerEmail = request.lead_email || request.user?.email;
      const buyerName = request.lead_name || (request.user ? `${request.user.first_name || ''} ${request.user.last_name || ''}`.trim() : '');
      const listingTitle = request.listing?.title || 'the listing';
      const listingId = request.listing?.id;
      if (buyerEmail && listingId) {
        supabase.functions
          .invoke('send-connection-notification', {
            body: {
              type: 'approval_notification',
              recipientEmail: buyerEmail,
              recipientName: buyerName || buyerEmail,
              requesterName: buyerName || buyerEmail,
              requesterEmail: buyerEmail,
              listingTitle,
              listingId,
              requestId: request.id,
              ...(senderEmail && senderInfo ? {
                senderEmail: senderInfo.email,
                senderName: senderInfo.name,
                replyTo: senderInfo.email,
              } : {}),
              ...(customBody ? { customBodyText: customBody } : {}),
            },
          })
          .catch((err) => console.error('[webflow-approval-email] Failed:', err));
      }
    } else if (emailActionType === 'reject') {
      updateStatus.mutate({ requestId: request.id, status: 'rejected', notes: rejectNote || undefined });

      // Send rejection email
      const buyerEmail = request.lead_email || request.user?.email;
      const buyerName = request.lead_name || (request.user ? `${request.user.first_name || ''} ${request.user.last_name || ''}`.trim() : '');
      const companyName = request.listing?.title || 'the listing';
      if (buyerEmail) {
        supabase.functions
          .invoke('notify-buyer-rejection', {
            body: {
              connectionRequestId: request.id,
              buyerEmail,
              buyerName: buyerName || buyerEmail,
              companyName,
              ...(senderEmail && senderInfo ? {
                senderEmail: senderInfo.email,
                senderName: senderInfo.name,
                replyTo: senderInfo.email,
              } : {}),
              ...(customBody ? { customBodyText: customBody } : {}),
            },
          })
          .catch((err) => console.error('[webflow-rejection-email] Failed:', err));
      }

      setShowRejectDialog(false);
      setRejectNote('');
    }
    setEmailDialogOpen(false);
    setEmailActionType(null);
  };
  const handleResetToPending = () => {
    if (!request.id) return;
    updateStatus.mutate({ requestId: request.id, status: 'pending' });
  };
  const handleOnHold = () => {
    if (!request.id) return;
    updateStatus.mutate({ requestId: request.id, status: 'on_hold' });
  };
  const handleFlagForReview = (adminId: string) => {
    if (!request.id) return;
    flagMutation.mutate({ requestId: request.id, flagged: true, assignedTo: adminId });
    setFlagPopoverOpen(false);
  };
  const handleUnflag = () => {
    if (!request.id) return;
    flagMutation.mutate({ requestId: request.id, flagged: false });
  };

  // Clean URL for display
  const displayUrl = pageUrl ? pageUrl.split('?')[0].split('#')[0] : '';

  // Extract UTM data
  const utmData: Record<string, string> = {};
  if (pageUrl) {
    try {
      const url = new URL(pageUrl);
      url.searchParams.forEach((val, key) => {
        if (key.startsWith('utm_')) {
          utmData[key.replace('utm_', '')] = val;
        }
      });
    } catch { /* ignore */ }
  }

  const hasUser = !!request.user;

  return (
    <div className="space-y-5">
      {/* ── DECISION / STATUS BANNERS ── */}
      <ApprovalSection
        requestId={request.id}
        requestStatus={requestStatus}
        buyerName={leadName}
        firmName={leadCompany}
        listingTitle={request.listing?.title}
        handleAccept={() => openEmailDialog('approve')}
        handleReject={() => openEmailDialog('reject')}
        handleResetToPending={handleResetToPending}
        handleOnHold={handleOnHold}
        isStatusPending={updateStatus.isPending}
        isRejecting={updateStatus.isPending}
        showRejectDialog={showRejectDialog}
        setShowRejectDialog={setShowRejectDialog}
        rejectNote={rejectNote}
        setRejectNote={setRejectNote}
        flagButton={
          requestStatus === 'pending' && request.id ? (
            <FlagReviewPopover
              adminList={adminList}
              flagPopoverOpen={flagPopoverOpen}
              setFlagPopoverOpen={setFlagPopoverOpen}
              handleFlagForReview={handleFlagForReview}
              align="end"
            />
          ) : undefined
        }
      />

      {/* Flagged for review indicator */}
      <FlagReviewBanner
        requestId={request.id}
        flaggedForReview={request.flagged_for_review}
        flaggedByAdmin={request.flaggedByAdmin}
        flaggedAssignedToAdmin={request.flaggedAssignedToAdmin}
        handleUnflag={handleUnflag}
        isFlagPending={flagMutation.isPending}
      />

      {/* Flag button for non-pending statuses */}
      {requestStatus !== 'pending' && !request.flagged_for_review && request.id && (
        <FlagReviewPopover
          adminList={adminList}
          flagPopoverOpen={flagPopoverOpen}
          setFlagPopoverOpen={setFlagPopoverOpen}
          handleFlagForReview={handleFlagForReview}
          align="start"
        />
      )}

      {/* Webflow Source Banner */}
      <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-blue-100 dark:bg-blue-900/50">
                <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  Website Form Submission
                </p>
                <p className="text-xs text-blue-700/70 dark:text-blue-300/70 truncate max-w-md">
                  {formName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-blue-700/70 dark:text-blue-300/70">
              {submittedAt && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(submittedAt), 'MMM d, yyyy h:mm a')}
                </span>
              )}
              {Object.keys(utmData).length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {utmData.source && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300">{utmData.source}</Badge>}
                  {utmData.campaign && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300">{utmData.campaign}</Badge>}
                  {utmData.medium && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300">{utmData.medium}</Badge>}
                </div>
              )}
            </div>
          </div>
          {displayUrl && (
            <a
              href={displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline mt-1 inline-flex items-center gap-1"
            >
              {displayUrl} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </CardContent>
      </Card>

      {/* Marketplace User Indicator */}
      {hasUser ? (
        <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-900/50">
                <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                  Matched to Marketplace Profile
                </p>
                <p className="text-xs text-emerald-700/70 dark:text-emerald-300/70">
                  This lead has an existing account — you can proceed through the marketplace workflow
                </p>
              </div>
            </div>
            {request.user && (
              <div className="mt-2 flex items-center gap-4 text-xs text-emerald-800/80 dark:text-emerald-200/80">
                {request.user.company && (
                  <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {request.user.company}</span>
                )}
                {request.user.buyerType && (
                  <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> {request.user.buyerType}</span>
                )}
                {request.user.email && (
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {request.user.email}</span>
                )}
                {request.user.approval_status && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1.5 text-xs cursor-help border-b border-dotted border-muted-foreground/40 pb-0.5">
                          <span className={cn(
                            "h-2 w-2 rounded-full shrink-0",
                            request.user.approval_status === 'approved' ? 'bg-emerald-500' :
                            request.user.approval_status === 'rejected' ? 'bg-destructive' : 'bg-amber-500'
                          )} />
                          <span className={cn(
                            "font-medium",
                            request.user.approval_status === 'approved' ? 'text-emerald-700 dark:text-emerald-400' :
                            request.user.approval_status === 'rejected' ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'
                          )}>
                            {request.user.approval_status === 'approved' ? 'Marketplace Approved' :
                             request.user.approval_status === 'rejected' ? 'Marketplace Rejected' : 'Marketplace Pending'}
                          </span>
                          <Info className="h-3 w-3 text-muted-foreground/60" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {request.user.approval_status === 'approved'
                          ? 'This user has been approved to use the SourceCo Marketplace.'
                          : request.user.approval_status === 'rejected'
                          ? "This user's marketplace account application was rejected."
                          : 'This user has a marketplace account but has not yet been approved.'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
        </CardContent>
        </Card>
      ) : (
        <Card className="border-border bg-muted/30">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-muted">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Not a Marketplace User
                </p>
                <p className="text-xs text-muted-foreground">
                  This lead does not have an existing marketplace account
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column: Form Submission + Lead Info */}
        <div className="lg:col-span-2 space-y-4">
          {/* Lead Contact Info (for guest leads) */}
          {!hasUser && (
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Lead Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="grid grid-cols-2 gap-3">
                  {request.lead_name && (
                    <InfoField label="Name" value={request.lead_name} icon={<User className="h-3 w-3" />} />
                  )}
                  {request.lead_email && (
                    <InfoField label="Email" value={request.lead_email} icon={<Mail className="h-3 w-3" />} isEmail />
                  )}
                  {request.lead_phone && (
                    <InfoField label="Phone" value={request.lead_phone} icon={<Phone className="h-3 w-3" />} />
                  )}
                  {request.lead_company && (
                    <InfoField label="Company" value={request.lead_company} icon={<Building2 className="h-3 w-3" />} />
                  )}
                  {request.lead_role && (
                    <InfoField label="Role" value={request.lead_role} icon={<Briefcase className="h-3 w-3" />} />
                  )}
                </div>

                {/* Extra form fields */}
                {Object.keys(formData).length > 0 && (
                  <>
                    <Separator className="my-3" />
                    <p className="text-xs font-medium text-muted-foreground mb-2">All Form Fields</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(formData)
                        .filter(([key]) => key.toLowerCase() !== 'message')
                        .map(([key, val]) => (
                          <div key={key} className="text-xs">
                            <span className="text-muted-foreground">{key}:</span>{' '}
                            <span className="font-medium text-foreground">{val}</span>
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Form Submission (read-only message) */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Form Submission
                {submittedAt && (
                  <span className="text-xs font-normal text-muted-foreground ml-auto">
                    {formatDistanceToNow(new Date(submittedAt), { addSuffix: true })}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {request.user_message ? (
                <div className="bg-muted/50 rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                  {request.user_message}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No message submitted with this form.</p>
              )}
            </CardContent>
          </Card>

          {/* Requested Deal */}
          {request.listing && (
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  Requested Deal
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{request.listing.title}</p>
                    {request.listing.category && (
                      <p className="text-xs text-muted-foreground">{request.listing.category}</p>
                    )}
                    {request.listing.location && (
                      <p className="text-xs text-muted-foreground">{request.listing.location}</p>
                    )}
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      {request.listing.revenueFormatted && (
                        <span>Revenue: {request.listing.revenueFormatted}</span>
                      )}
                      {request.listing.ebitdaFormatted && (
                        <span>EBITDA: {request.listing.ebitdaFormatted}</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Lead Management */}
        <div className="space-y-4">
          <LeadRequestActions request={request} />
        </div>
      </div>

      {/* ── EMAIL PREVIEW DIALOG ── */}
      <ConnectionRequestEmailDialog
        isOpen={emailDialogOpen}
        onClose={() => { setEmailDialogOpen(false); setEmailActionType(null); }}
        onConfirm={handleEmailDialogConfirm}
        selectedRequest={request}
        actionType={emailActionType}
        isLoading={updateStatus.isPending}
      />
    </div>
  );
}

function InfoField({ label, value, icon, isEmail }: { label: string; value: string; icon: React.ReactNode; isEmail?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        {isEmail ? (
          <a href={`mailto:${value}`} className="text-xs font-medium text-primary hover:underline">{value}</a>
        ) : (
          <p className="text-xs font-medium text-foreground">{value}</p>
        )}
      </div>
    </div>
  );
}
