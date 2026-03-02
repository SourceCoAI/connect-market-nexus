/**
 * connection-request-actions/index.tsx
 *
 * Main orchestrator for the ConnectionRequestActions component.
 * Composes all sub-sections and passes shared state from the
 * useConnectionRequestActions hook.
 *
 * Data sources:
 *   useUpdateConnectionRequestStatus, useFlagConnectionRequest, useUpdateAccess,
 *   useConnectionMessages, useSendMessage, useAdminProfiles, useAddManualTask hooks;
 *   connection_requests, data_room_access, connection_messages Supabase tables
 *
 * Used on:
 *   Embedded within ConnectionRequestsTable on the admin requests page
 *   (/admin/requests)
 */
import { SendAgreementDialog } from '@/components/docuseal/SendAgreementDialog';
import { Listing } from '@/types';
import { format } from 'date-fns';
import { getBuyerTier } from '@/lib/buyer-metrics';
import { processUrl } from '@/lib/url-utils';

import type { ConnectionRequestActionsProps } from './types';
import { useConnectionRequestActions } from './useConnectionRequestActions';
import { ApprovalSection } from './ApprovalSection';
import { FlagReviewBanner, FlagReviewPopover } from './FlagReviewSection';
import { AccessMatrixSection } from './AccessMatrixSection';
import { MessagesSection } from './MessagesSection';
import { NDASection } from './NDASection';
import { SidebarCard } from './SidebarCard';

export type { ConnectionRequestActionsProps };

export function ConnectionRequestActions({
  user,
  listing,
  requestId,
  requestStatus = 'pending',
  userMessage,
  createdAt,
  flaggedForReview,
  flaggedByAdmin,
  flaggedAssignedToAdmin,
}: ConnectionRequestActionsProps) {
  const actions = useConnectionRequestActions({ user, listing, requestId });

  const tierInfo = getBuyerTier(user);
  const buyerInitials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase();
  const buyerName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  const firmName = user.company || user.company_name || '';
  const buyerEmail = user.email || '';
  const formattedDate = createdAt ? format(new Date(createdAt), 'MMM d, yyyy') : '';
  const aum = user.aum;

  return (
    <div className="space-y-5">
      {/* ── DECISION / STATUS BANNERS ── */}
      <ApprovalSection
        requestId={requestId}
        requestStatus={requestStatus}
        buyerName={buyerName}
        firmName={firmName}
        listingTitle={listing?.title}
        handleAccept={actions.handleAccept}
        handleReject={actions.handleReject}
        handleResetToPending={actions.handleResetToPending}
        isStatusPending={actions.updateStatus.isPending}
        isRejecting={actions.isRejecting}
        showRejectDialog={actions.showRejectDialog}
        setShowRejectDialog={actions.setShowRejectDialog}
        rejectNote={actions.rejectNote}
        setRejectNote={actions.setRejectNote}
        flagButton={
          requestStatus === 'pending' && requestId ? (
            <FlagReviewPopover
              adminList={actions.adminList}
              flagPopoverOpen={actions.flagPopoverOpen}
              setFlagPopoverOpen={actions.setFlagPopoverOpen}
              handleFlagForReview={actions.handleFlagForReview}
              align="end"
            />
          ) : undefined
        }
      />

      {/* Flagged for review indicator — shown across all statuses */}
      <FlagReviewBanner
        requestId={requestId}
        flaggedForReview={flaggedForReview}
        flaggedByAdmin={flaggedByAdmin}
        flaggedAssignedToAdmin={flaggedAssignedToAdmin}
        handleUnflag={actions.handleUnflag}
        isFlagPending={actions.flagMutation.isPending}
      />

      {/* Flag for Review button — for non-pending statuses when not already flagged */}
      {requestStatus !== 'pending' && !flaggedForReview && requestId && (
        <FlagReviewPopover
          adminList={actions.adminList}
          flagPopoverOpen={actions.flagPopoverOpen}
          setFlagPopoverOpen={actions.setFlagPopoverOpen}
          handleFlagForReview={actions.handleFlagForReview}
          align="start"
        />
      )}

      {/* Document status + access for approved */}
      {requestStatus === 'approved' && listing && (
        <AccessMatrixSection
          hasNDA={actions.hasNDA}
          hasFeeAgreement={actions.hasFeeAgreement}
          accessRecord={actions.accessRecord}
          requestAccessToggle={actions.requestAccessToggle}
          isAccessPending={actions.updateAccess.isPending}
          pendingAccessToggle={actions.pendingAccessToggle}
          setPendingAccessToggle={actions.setPendingAccessToggle}
          confirmAccessToggle={actions.confirmAccessToggle}
          buyerName={buyerName}
        />
      )}

      {/* ── BUYER HERO CARD ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-5 flex items-start gap-5">
          {/* Avatar */}
          <div className="w-[48px] h-[48px] rounded-full bg-sourceco/20 border-2 border-sourceco flex items-center justify-center shrink-0">
            <span
              className="text-foreground text-base font-bold"
              style={{ fontFamily: 'Manrope, sans-serif' }}
            >
              {buyerInitials}
            </span>
          </div>

          {/* Left: Name + description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h2
                className="text-2xl font-extrabold text-foreground tracking-tight"
                style={{ fontFamily: 'Manrope, sans-serif' }}
              >
                {buyerName}
              </h2>
              {user.linkedin_profile && (
                <a
                  href={processUrl(user.linkedin_profile)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  LinkedIn ↗
                </a>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {user.job_title ? `${user.job_title} at ` : ''}
              {firmName}
              {buyerEmail && (
                <>
                  {' '}
                  ·{' '}
                  <a href={`mailto:${buyerEmail}`} className="text-foreground hover:underline">
                    {buyerEmail}
                  </a>
                </>
              )}
              {user.website && (
                <>
                  {' '}
                  ·{' '}
                  <a
                    href={processUrl(user.website)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {user.website.replace(/^https?:\/\//, '')}
                  </a>
                </>
              )}
            </p>

            {/* Quick snapshot — the key info for fast decisions */}
            <p className="text-sm text-foreground mt-2 leading-relaxed">
              {user.bio ||
                `${tierInfo.description || 'Buyer'} ${firmName ? `at ${firmName}` : ''}${user.business_categories && Array.isArray(user.business_categories) && user.business_categories.length > 0 ? `, focused on ${(user.business_categories as string[]).slice(0, 3).join(', ')}` : ''}${aum ? `. AUM: ${aum}` : ''}.`}
            </p>

            {/* Tags — no Marketplace badge, no duplicate AUM */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {tierInfo.description && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-foreground">
                  {tierInfo.description}
                </span>
              )}
              {firmName && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sourceco/10 text-sourceco">
                  {firmName}
                </span>
              )}
            </div>
          </div>

          {/* Right: Key stats — bigger text */}
          <div className="shrink-0 text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Requested
            </p>
            <p className="text-base font-semibold text-foreground">{formattedDate || '—'}</p>
          </div>
        </div>
      </div>

      {/* ── TWO-COLUMN LAYOUT ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── LEFT COLUMN ── */}
        <div className="space-y-4">
          <MessagesSection
            requestId={requestId}
            userId={user.id}
            buyerName={buyerName}
            buyerInitials={buyerInitials}
            userMessage={userMessage}
            createdAt={createdAt}
            activeTab={actions.activeTab}
            setActiveTab={actions.setActiveTab}
          />
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div className="space-y-4">
          {/* Agreements */}
          <NDASection
            hasNDA={actions.hasNDA}
            hasFeeAgreement={actions.hasFeeAgreement}
            ndaStatus={actions.ndaStatus}
            feeStatus={actions.feeStatus}
            firmId={actions.firmInfo?.firm_id ?? undefined}
            firmAgreement={actions.firmInfo?.firmAgreement ?? null}
            firmMembers={actions.firmInfo?.firmMembers ?? []}
            onSendAgreement={(type) => {
              actions.setSendAgreementType(type);
              actions.setSendAgreementOpen(true);
            }}
          />

          {/* Requested Deal */}
          {listing && <RequestedDealCard listing={listing} />}

          {/* Other Active Interests */}
          {actions.otherRequests.length > 0 && (
            <OtherInterestsCard otherRequests={actions.otherRequests} />
          )}
        </div>
      </div>

      {/* ── SEND AGREEMENT DIALOG ── */}
      {actions.firmInfo?.firm_id && (
        <SendAgreementDialog
          open={actions.sendAgreementOpen}
          onOpenChange={actions.setSendAgreementOpen}
          firmId={actions.firmInfo.firm_id}
          documentType={actions.sendAgreementType}
          buyerEmail={buyerEmail}
          buyerName={buyerName || buyerEmail}
          firmName={actions.firmInfo.firm_name || undefined}
        />
      )}
    </div>
  );
}

// ─── Requested Deal Card ───

function RequestedDealCard({ listing }: { listing: Listing }) {
  return (
    <SidebarCard title="Requested Deal">
      <div>
        {/* Tags */}
        <div className="flex gap-1.5 flex-wrap mb-3">
          {listing.category && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
              {listing.category}
            </span>
          )}
          {listing.location && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
              {listing.location}
            </span>
          )}
        </div>
        {/* Title */}
        <button
          onClick={() => window.open(`/listing/${listing.id}`, '_blank')}
          className="text-base font-bold text-foreground hover:text-sourceco transition-colors text-left leading-snug"
          style={{ fontFamily: 'Manrope, sans-serif' }}
        >
          {listing.title}
        </button>
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2.5 mt-3.5">
          <div className="bg-muted/40 border border-border rounded-lg px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              EBITDA
            </p>
            <p
              className="text-xl font-extrabold text-foreground tracking-tight"
              style={{ fontFamily: 'Manrope, sans-serif' }}
            >
              {listing.ebitda ? `$${Number(listing.ebitda).toLocaleString()}` : 'TBD'}
            </p>
          </div>
          <div className="bg-muted/40 border border-border rounded-lg px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Ask Price
            </p>
            <p
              className="text-xl font-extrabold text-foreground tracking-tight"
              style={{ fontFamily: 'Manrope, sans-serif' }}
            >
              {(listing as unknown as Record<string, unknown>).asking_price
                ? `$${Number((listing as unknown as Record<string, unknown>).asking_price).toLocaleString()}`
                : 'TBD'}
            </p>
          </div>
        </div>
      </div>
    </SidebarCard>
  );
}

// ─── Other Active Interests ───

function OtherInterestsCard({
  otherRequests,
}: {
  otherRequests: Array<{
    id: string;
    listing_id?: string;
    listing?: { title?: string; revenue?: number; location?: string } | null;
    status?: string;
  }>;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-[1.2px] text-muted-foreground">
          Other Active Interests
        </h3>
        <span className="text-sm font-bold px-2.5 py-0.5 rounded-full bg-sourceco/10 text-sourceco border border-sourceco/15">
          {otherRequests.length}
        </span>
      </div>
      <div className="divide-y divide-border/30">
        {otherRequests.map((req) => (
          <a
            key={req.id}
            href={`/listing/${req.listing_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-5 py-3.5 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-snug">
                  {req.listing?.title || 'Unknown Listing'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {req.listing?.revenue
                    ? `$${Number(req.listing.revenue).toLocaleString()}`
                    : 'N/A'}{' '}
                  · {req.listing?.location || 'N/A'}
                </p>
              </div>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap tracking-wide ${
                  req.status === 'approved'
                    ? 'bg-emerald-50 text-emerald-600'
                    : req.status === 'rejected'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-amber-50 text-amber-600'
                }`}
              >
                {req.status === 'approved'
                  ? 'Approved'
                  : req.status === 'rejected'
                    ? 'Declined'
                    : 'Pending'}
              </span>
            </div>
          </a>
        ))}
      </div>
      <div className="text-sm text-muted-foreground text-center py-3 border-t border-border/30 cursor-pointer hover:text-sourceco transition-colors">
        Follow-up actions apply to all active requests ›
      </div>
    </div>
  );
}

export default ConnectionRequestActions;
