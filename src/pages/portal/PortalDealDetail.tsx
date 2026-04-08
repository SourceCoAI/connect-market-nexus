import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ChevronLeft,
  Building2,
  MapPin,
  DollarSign,
  CheckCircle,
  XCircle,
  HelpCircle,
  Clock,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useMyPortalUser } from '@/hooks/portal/use-portal-users';
import { usePortalDealPush, usePortalDealResponses, useSubmitDealResponse, useMarkDealViewed } from '@/hooks/portal/use-portal-deals';
import { PushStatusBadge, PriorityBadge } from '@/components/portal/PortalStatusBadge';
import { PortalDealChat } from '@/components/portal/PortalDealChat';
import type { PortalResponseType, TeaserSection } from '@/types/portal';

function formatCurrency(value: number | null | undefined): string {
  if (!value) return '-';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

const responseConfig: Record<string, { label: string; icon: React.ReactNode; variant: 'default' | 'outline' | 'destructive' }> = {
  interested: { label: 'Interested', icon: <CheckCircle className="h-4 w-4" />, variant: 'default' },
  pass: { label: 'Pass', icon: <XCircle className="h-4 w-4" />, variant: 'destructive' },
  need_more_info: { label: 'Need More Info', icon: <HelpCircle className="h-4 w-4" />, variant: 'outline' },
  reviewing: { label: 'Reviewing Internally', icon: <Clock className="h-4 w-4" />, variant: 'outline' },
};

const RESPONSE_TYPES: PortalResponseType[] = ['interested', 'pass', 'need_more_info', 'reviewing'];

export default function PortalDealDetail() {
  const { slug, pushId } = useParams<{ slug: string; pushId: string }>();
  const { data: portalUser } = useMyPortalUser(slug);
  const { data: push, isLoading } = usePortalDealPush(pushId);
  const { data: responses } = usePortalDealResponses(pushId);
  const submitResponse = useSubmitDealResponse();
  const markViewed = useMarkDealViewed();

  const [responseDialogOpen, setResponseDialogOpen] = useState(false);
  const [selectedResponseType, setSelectedResponseType] = useState<PortalResponseType | null>(null);
  const [responseNotes, setResponseNotes] = useState('');

  const canRespond = portalUser?.role !== 'viewer';

  // Track deal view when portal user opens the detail page
  useEffect(() => {
    if (push && portalUser && !push.first_viewed_at) {
      markViewed.mutate({
        pushId: push.id,
        portalOrgId: portalUser.portal_org.id,
        viewerName: portalUser.name,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [push?.id, portalUser?.id]);

  const handleOpenResponse = (type: PortalResponseType) => {
    setSelectedResponseType(type);
    setResponseNotes('');
    setResponseDialogOpen(true);
  };

  const handleSubmitResponse = async () => {
    if (!selectedResponseType || !portalUser || !push) return;
    await submitResponse.mutateAsync({
      push_id: push.id,
      response_type: selectedResponseType,
      notes: responseNotes.trim() || undefined,
      portal_user_id: portalUser.id,
      portal_org_id: portalUser.portal_org.id,
      responder_name: portalUser.name,
    });
    setResponseDialogOpen(false);
  };

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  if (!push) return <div className="py-12 text-center text-muted-foreground">Deal not found.</div>;

  const snapshot = push.deal_snapshot;
  const hasTeaserSections = snapshot?.teaser_sections && snapshot.teaser_sections.length > 0;
  const hasMemoHtml = !!snapshot?.memo_html;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Link
          to={`/portal/${slug}/deals`}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ChevronLeft className="h-3 w-3" />
          All Deals
        </Link>

        {/* Deal header */}
        <div>
          <h1 className="text-2xl font-bold">
            {snapshot?.project_name || snapshot?.headline || 'Untitled Deal'}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <PushStatusBadge status={push.status} />
            <PriorityBadge priority={push.priority} />
            <span className="text-sm text-muted-foreground">
              Shared {new Date(push.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Key metrics bar */}
        <Card>
          <CardContent className="pt-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {snapshot?.industry && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Industry</p>
                    <p className="font-medium text-sm">{snapshot.industry}</p>
                  </div>
                </div>
              )}
              {snapshot?.geography && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="font-medium text-sm">{snapshot.geography}</p>
                  </div>
                </div>
              )}
              {snapshot?.ebitda != null && (
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">EBITDA</p>
                    <p className="font-medium text-sm">{formatCurrency(snapshot.ebitda)}</p>
                  </div>
                </div>
              )}
              {snapshot?.revenue != null && (
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Revenue</p>
                    <p className="font-medium text-sm">{formatCurrency(snapshot.revenue)}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Push note from SourceCo */}
        {push.push_note && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="pt-5">
              <p className="text-sm font-medium text-blue-900 mb-1">Note from SourceCo</p>
              <p className="text-sm text-blue-800">{push.push_note}</p>
            </CardContent>
          </Card>
        )}

        {/* Teaser sections */}
        {hasTeaserSections && (
          <div className="space-y-4">
            {snapshot.teaser_sections!.map((section: TeaserSection) => (
              <Card key={section.key}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base uppercase tracking-wide text-muted-foreground">
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{section.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Full memo (rich HTML) */}
        {hasMemoHtml && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                Deal Memo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="prose prose-sm max-w-none
                  prose-headings:text-foreground prose-p:text-muted-foreground
                  prose-strong:text-foreground prose-li:text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: snapshot.memo_html! }}
              />
            </CardContent>
          </Card>
        )}

        {/* Fallback: plain description if no teaser/memo */}
        {!hasTeaserSections && !hasMemoHtml && snapshot?.business_description && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Business Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {snapshot.business_description.replace(/<[^>]*>/g, '')}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Data room link */}
        {push.data_room_access_token && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <a
                href={`/dataroom/${push.data_room_access_token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline font-medium"
              >
                <FileText className="h-4 w-4" />
                View Data Room
              </a>
              <p className="text-xs text-muted-foreground mt-1">
                Access deal documents, CIM, and financials.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Response section — appears after all content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Response buttons */}
          {canRespond && (
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-base">What's your decision?</CardTitle>
                <p className="text-sm text-muted-foreground">
                  After reviewing the deal above, let us know your interest level.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {RESPONSE_TYPES.map((type) => {
                  const config = responseConfig[type];
                  return (
                    <Button
                      key={type}
                      variant={config.variant}
                      className="w-full justify-start gap-2"
                      size="sm"
                      onClick={() => handleOpenResponse(type)}
                    >
                      {config.icon}
                      {config.label}
                    </Button>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Deal messaging */}
          {portalUser && (
            <PortalDealChat
              pushId={push.id}
              portalOrgId={portalUser.portal_org.id}
              senderType="portal_user"
              senderName={portalUser.name}
            />
          )}
        </div>

        {/* Response history */}
        {responses && responses.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Response History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {responses.map((r) => (
                <div key={r.id} className="text-sm border-b last:border-0 pb-2 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">
                      {r.response_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {r.notes && (
                    <p className="text-muted-foreground mt-1">{r.notes}</p>
                  )}
                  {r.responder && (
                    <p className="text-xs text-muted-foreground mt-1">
                      by {r.responder.name}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Response dialog */}
        <Dialog open={responseDialogOpen} onOpenChange={setResponseDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {selectedResponseType && responseConfig[selectedResponseType]?.label}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Notes (optional)</label>
                <Textarea
                  value={responseNotes}
                  onChange={(e) => setResponseNotes(e.target.value)}
                  placeholder={
                    selectedResponseType === 'interested'
                      ? "Any additional context? e.g., 'Can we get the CIM?'"
                      : selectedResponseType === 'pass'
                        ? 'Why is this not a fit?'
                        : selectedResponseType === 'need_more_info'
                          ? 'What information do you need?'
                          : 'Any timeline to share?'
                  }
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResponseDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitResponse}
                disabled={submitResponse.isPending}
              >
                {submitResponse.isPending ? 'Submitting...' : 'Submit Response'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
