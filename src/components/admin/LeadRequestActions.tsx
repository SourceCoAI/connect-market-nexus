import { useState } from "react";
import { FileText, Shield, MessageSquare } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AdminConnectionRequest } from "@/types/admin";
import { useUpdateFollowup, useUpdateNegativeFollowup } from "@/hooks/admin/use-followup";
import {
  useUpdateLeadFeeAgreementEmailStatus,
  useUpdateLeadFeeAgreementStatus,
  useUpdateLeadNDAEmailStatus,
  useUpdateLeadNDAStatus,
} from "@/hooks/admin/requests/use-lead-status-updates";
import { formatDistanceToNow } from "date-fns";

interface LeadRequestActionsProps {
  request: AdminConnectionRequest;
}

export function LeadRequestActions({ request }: LeadRequestActionsProps) {
  const [leadFeeSent, setLeadFeeSent] = useState<boolean>(!!request.lead_fee_agreement_email_sent);
  const [leadFeeSigned, setLeadFeeSigned] = useState<boolean>(!!request.lead_fee_agreement_signed);
  const [leadFeeSentAt, setLeadFeeSentAt] = useState<string | null | undefined>(request.lead_fee_agreement_email_sent_at);
  const [leadFeeSignedAt, setLeadFeeSignedAt] = useState<string | null | undefined>(request.lead_fee_agreement_signed_at);

  const [leadNDASent, setLeadNDASent] = useState<boolean>(!!request.lead_nda_email_sent);
  const [leadNDASigned, setLeadNDASigned] = useState<boolean>(!!request.lead_nda_signed);
  const [leadNDASentAt, setLeadNDASentAt] = useState<string | null | undefined>(request.lead_nda_email_sent_at);
  const [leadNDASignedAt, setLeadNDASignedAt] = useState<string | null | undefined>(request.lead_nda_signed_at);

  const [followedUp, setFollowedUp] = useState<boolean>(!!request.followed_up);
  const [negativeFollowedUp, setNegativeFollowedUp] = useState<boolean>(!!request.negative_followed_up);

  const updateFollowup = useUpdateFollowup();
  const updateNegativeFollowup = useUpdateNegativeFollowup();
  const updateLeadNdaStatus = useUpdateLeadNDAStatus();
  const updateLeadNdaEmailStatus = useUpdateLeadNDAEmailStatus();
  const updateLeadFeeStatus = useUpdateLeadFeeAgreementStatus();
  const updateLeadFeeEmailStatus = useUpdateLeadFeeAgreementEmailStatus();

  const getStatusIndicator = (sent: boolean, signed: boolean, sentAt?: string | null, signedAt?: string | null) => {
    if (signed && signedAt) {
      const timeAgo = formatDistanceToNow(new Date(signedAt), { addSuffix: true });
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={`Signed ${timeAgo}`}>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
          <span className="font-medium text-foreground">Signed</span>
          <span className="text-muted-foreground/60">{timeAgo}</span>
        </div>
      );
    }
    if (sent && sentAt) {
      const timeAgo = formatDistanceToNow(new Date(sentAt), { addSuffix: true });
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={`Sent ${timeAgo}`}>
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
          <span className="font-medium text-foreground">Sent</span>
          <span className="text-muted-foreground/60">{timeAgo}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
        <span className="font-medium text-foreground">Required</span>
      </div>
    );
  };

  return (
    <div className="bg-card border border-border/40 rounded-lg p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
          Status
        </h3>
      </div>

      <div className="space-y-3">
        {/* Fee Agreement Row */}
        <div className="py-2 px-3 rounded-md border border-border/50 bg-background/50 hover:bg-accent/20 transition-colors space-y-1.5">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Fee Agreement</span>
            <div className="ml-auto">
              {getStatusIndicator(leadFeeSent, leadFeeSigned, leadFeeSentAt || undefined, leadFeeSignedAt || undefined)}
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label htmlFor={`lead-fee-sent-${request.id}`} className="text-xs font-medium text-muted-foreground">Sent</Label>
              <Switch
                id={`lead-fee-sent-${request.id}`}
                checked={leadFeeSent}
                onCheckedChange={(checked) => {
                  setLeadFeeSent(checked);
                  setLeadFeeSentAt(checked ? new Date().toISOString() : null);
                  updateLeadFeeEmailStatus.mutate({ requestId: request.id, value: checked });
                }}
                className="scale-90"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor={`lead-fee-signed-${request.id}`} className="text-xs font-medium text-muted-foreground">Signed</Label>
              <Switch
                id={`lead-fee-signed-${request.id}`}
                checked={leadFeeSigned}
                onCheckedChange={(checked) => {
                  setLeadFeeSigned(checked);
                  setLeadFeeSignedAt(checked ? new Date().toISOString() : null);
                  updateLeadFeeStatus.mutate({ requestId: request.id, value: checked });
                }}
                className="scale-90"
              />
            </div>
          </div>
        </div>

        {/* NDA Row */}
        <div className="py-2 px-3 rounded-md border border-border/50 bg-background/50 hover:bg-accent/20 transition-colors space-y-1.5">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">NDA</span>
            <div className="ml-auto">
              {getStatusIndicator(leadNDASent, leadNDASigned, leadNDASentAt || undefined, leadNDASignedAt || undefined)}
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label htmlFor={`lead-nda-sent-${request.id}`} className="text-xs font-medium text-muted-foreground">Sent</Label>
              <Switch
                id={`lead-nda-sent-${request.id}`}
                checked={leadNDASent}
                onCheckedChange={(checked) => {
                  setLeadNDASent(checked);
                  setLeadNDASentAt(checked ? new Date().toISOString() : null);
                  updateLeadNdaEmailStatus.mutate({ requestId: request.id, value: checked });
                }}
                className="scale-90"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor={`lead-nda-signed-${request.id}`} className="text-xs font-medium text-muted-foreground">Signed</Label>
              <Switch
                id={`lead-nda-signed-${request.id}`}
                checked={leadNDASigned}
                onCheckedChange={(checked) => {
                  setLeadNDASigned(checked);
                  setLeadNDASignedAt(checked ? new Date().toISOString() : null);
                  updateLeadNdaStatus.mutate({ requestId: request.id, value: checked });
                }}
                className="scale-90"
              />
            </div>
          </div>
        </div>

        {/* Follow-up Row */}
        <div className="py-2 px-3 rounded-md border border-border/50 bg-background/50 hover:bg-accent/20 transition-colors space-y-1.5">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Follow-up</span>
            <div className="ml-auto">
              {followedUp ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  <span className="font-medium text-foreground">Positive</span>
                </div>
              ) : negativeFollowedUp ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-destructive"></div>
                  <span className="font-medium text-foreground">Negative</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                  <span className="font-medium text-foreground">Required</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label htmlFor={`lead-positive-followup-${request.id}`} className="text-xs font-medium text-muted-foreground">Positive</Label>
              <Switch
                id={`lead-positive-followup-${request.id}`}
                checked={followedUp}
                onCheckedChange={(checked) => {
                  if (checked && negativeFollowedUp) {
                    setNegativeFollowedUp(false);
                    updateNegativeFollowup.mutate({ requestId: request.id, isFollowedUp: false });
                  }
                  setFollowedUp(checked);
                  updateFollowup.mutate({ requestId: request.id, isFollowedUp: checked });
                }}
                className="scale-90"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor={`lead-negative-followup-${request.id}`} className="text-xs font-medium text-muted-foreground">Negative</Label>
              <Switch
                id={`lead-negative-followup-${request.id}`}
                checked={negativeFollowedUp}
                onCheckedChange={(checked) => {
                  if (checked && followedUp) {
                    setFollowedUp(false);
                    updateFollowup.mutate({ requestId: request.id, isFollowedUp: false });
                  }
                  setNegativeFollowedUp(checked);
                  updateNegativeFollowup.mutate({ requestId: request.id, isFollowedUp: checked });
                }}
                className="scale-90"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
