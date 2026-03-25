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

export function ContactMemberDrawer({
  member,
  onClose,
  onRemove,
  onNavigateToDeal,
}: ContactMemberDrawerProps) {
  const isDealType = member ? DEAL_ENTITY_TYPES.includes(member.entity_type) : false;

  return (
    <Sheet open={!!member} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
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
                  {member.contact_role && (
                    <SheetDescription className="truncate">
                      {member.contact_role}
                    </SheetDescription>
                  )}
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-6 pb-20">
              {/* Contact Info */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Contact Info
                </h3>
                <div className="space-y-2">
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
                  {member.contact_phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <ClickToDialPhone
                        phone={member.contact_phone}
                        name={member.contact_name || undefined}
                        email={member.contact_email}
                        company={member.contact_company || undefined}
                        size="sm"
                      />
                    </div>
                  )}
                  {member.contact_company && (
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-foreground">{member.contact_company}</span>
                    </div>
                  )}
                  {member.contact_role && (
                    <div className="flex items-center gap-2 text-sm">
                      <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-foreground">{member.contact_role}</span>
                    </div>
                  )}
                </div>
              </section>

              <Separator />

              {/* Source & List Info */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Source & List Info
                </h3>
                <div className="space-y-2">
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
                </div>
              </section>

              {/* Deal Owner */}
              {(member.deal_owner_name || isDealType) && (
                <>
                  <Separator />
                  <section className="space-y-3">
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
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Call Activity
                </h3>
                {member.total_calls && member.total_calls > 0 ? (
                  <div className="space-y-2">
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
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => onRemove(member)}
              >
                <UserMinus className="h-3.5 w-3.5" />
                Remove from List
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
