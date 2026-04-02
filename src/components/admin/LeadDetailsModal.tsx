import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Building2, Mail, Phone, User, MessageSquare, Calendar, CheckCircle2, AlertTriangle } from 'lucide-react';
import { InboundLead } from '@/hooks/admin/use-inbound-leads';
import { useInboundLeadFirm } from '@/hooks/admin/use-inbound-lead-firm';
import { format } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link } from 'react-router-dom';

interface LeadDetailsModalProps {
  lead: InboundLead | null;
  isOpen: boolean;
  onClose: () => void;
}

export function LeadDetailsModal({ lead, isOpen, onClose }: LeadDetailsModalProps) {
  const { data: firmInfo } = useInboundLeadFirm(lead?.id || null);

  if (!lead) return null;

  const hasFirmAgreements = firmInfo && (firmInfo.fee_agreement_signed || firmInfo.nda_signed);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <User className="h-5 w-5" />
            Lead Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Firm Agreement Warning */}
          {hasFirmAgreements && (
            <Alert className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" />
              <AlertDescription className="text-sm text-green-800 dark:text-green-300">
                <Link 
                  to="/admin/buyers/firm-agreements"
                  className="font-semibold hover:underline"
                >
                  {firmInfo.firm_name}
                </Link> already has{' '}
                {firmInfo.fee_agreement_signed && firmInfo.nda_signed ? (
                  <>Fee Agreement and NDA signed</>
                ) : firmInfo.fee_agreement_signed ? (
                  <>Fee Agreement signed</>
                ) : (
                  <>NDA signed</>
                )}. No need to re-send agreements for this lead.
              </AlertDescription>
            </Alert>
          )}

          {/* Duplicate Warning */}
          {lead.is_duplicate && (
            <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
              <AlertDescription className="text-sm text-amber-800 dark:text-amber-300">
                This lead may be a duplicate. {lead.duplicate_info}
              </AlertDescription>
            </Alert>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</label>
              <div className="flex items-center gap-2 mt-1">
                <User className="h-4 w-4 text-muted-foreground" />
                <p className="font-medium">{lead.name}</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</label>
              <div className="flex items-center gap-2 mt-1">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">
                  {lead.email}
                </a>
              </div>
            </div>

            {lead.company_name && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Company</label>
                <div className="flex items-center gap-2 mt-1">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">{lead.company_name}</p>
                </div>
              </div>
            )}

            {lead.role && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role</label>
                <div className="flex items-center gap-2 mt-1">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <p>{lead.role}</p>
                </div>
              </div>
            )}

            {lead.phone_number && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone</label>
                <div className="flex items-center gap-2 mt-1">
                  <ClickToDialPhone
                    phone={lead.phone_number}
                    name={lead.full_name || undefined}
                    email={lead.email || undefined}
                    company={lead.company_name || undefined}
                    size="sm"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Source</label>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {lead.source}
                </Badge>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</label>
              <div className="flex items-center gap-2 mt-1">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm">{format(new Date(lead.created_at), 'MMM d, yyyy h:mm a')}</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</label>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={lead.status === 'converted' ? 'default' : 'outline'}>
                  {lead.status}
                </Badge>
              </div>
            </div>
          </div>

          {/* Firm Info */}
          {firmInfo && firmInfo.firm_id && (
            <div className="border-t pt-4">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Firm Information</label>
              <div className="mt-2 p-3 bg-muted/30 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <Link 
                      to="/admin/buyers/firm-agreements"
                      className="font-medium hover:underline"
                    >
                      {firmInfo.firm_name}
                    </Link>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <span className="font-medium">Fee Agreement:</span>
                    {firmInfo.fee_agreement_signed ? (
                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                        Signed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Unsigned</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">NDA:</span>
                    {firmInfo.nda_signed ? (
                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                        Signed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Unsigned</Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Message */}
          {lead.message && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <MessageSquare className="h-3 w-3" />
                Message
              </label>
              <div className="mt-2 p-3 bg-muted/30 rounded-lg">
                <p className="text-sm whitespace-pre-wrap">{lead.message}</p>
              </div>
            </div>
          )}

          {/* Mapping Info */}
          {lead.mapped_to_listing_id && (
            <div className="border-t pt-4">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mapping Details</label>
              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <p className="text-sm">
                  Mapped to: <span className="font-medium">{lead.mapped_to_listing_title}</span>
                </p>
                {lead.mapped_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    on {format(new Date(lead.mapped_at), 'MMM d, yyyy h:mm a')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
