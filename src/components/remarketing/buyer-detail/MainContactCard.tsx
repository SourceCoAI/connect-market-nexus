import { useState } from "react";
import { Star, Plus, Mail, Linkedin, Users } from "lucide-react";
import { ClickToDialPhone } from '@/components/shared/ClickToDialPhone';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Contact {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  linkedin_url?: string | null;
  company_type?: string | null;
  is_primary?: boolean;
}

interface MainContactCardProps {
  contacts: Contact[];
  onAddContact: () => void;
  hasFeeAgreement?: boolean;
  onFeeAgreementChange?: (value: boolean) => void;
  feeAgreementDisabled?: boolean;
}

export const MainContactCard = ({
  contacts,
  onAddContact,
  hasFeeAgreement = false,
  onFeeAgreementChange,
  feeAgreementDisabled = false,
}: MainContactCardProps) => {
  const [selectedContactId, setSelectedContactId] = useState<string>(
    contacts.find(c => c.is_primary)?.id || contacts[0]?.id || ""
  );

  const selectedContact = contacts.find(c => c.id === selectedContactId);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Star className="h-4 w-4" />
            Main Contact
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onAddContact}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground flex-1">
            <Users className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No contacts yet</p>
          </div>
        ) : (
          <div className="space-y-3 flex-1">
            {/* Contact Selector */}
            {contacts.length > 1 && (
              <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                <SelectTrigger className="w-full h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.name} · {contact.role || "No role"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Selected Contact Display */}
            {selectedContact && (
              <div className="flex items-start gap-3">
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarFallback className="bg-muted text-muted-foreground text-sm font-medium">
                    {getInitials(selectedContact.name)}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">{selectedContact.name}</span>
                    {selectedContact.company_type && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {selectedContact.company_type}
                      </Badge>
                    )}
                  </div>
                  
                  {selectedContact.role && (
                    <p className="text-xs text-muted-foreground truncate">
                      {selectedContact.role}
                    </p>
                  )}
                  
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {selectedContact.email && (
                      <a 
                        href={`mailto:${selectedContact.email}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Mail className="h-3 w-3" />
                        Email
                      </a>
                    )}
                    {selectedContact.phone && (
                      <ClickToDialPhone
                        phone={selectedContact.phone}
                        name={selectedContact.name || undefined}
                        email={selectedContact.email || undefined}
                        label="Call"
                        size="xs"
                      />
                    )}
                    {selectedContact.linkedin_url && (
                      <a 
                        href={selectedContact.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Linkedin className="h-3 w-3" />
                        LinkedIn
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Fee Agreement Toggle - integrated at bottom */}
        {onFeeAgreementChange && (
          <div className="flex items-center gap-2 pt-3 mt-auto border-t">
            <Switch
              id="fee-agreement"
              checked={hasFeeAgreement}
              onCheckedChange={onFeeAgreementChange}
              disabled={feeAgreementDisabled}
              className="scale-90"
            />
            <Label 
              htmlFor="fee-agreement" 
              className="text-xs font-medium cursor-pointer text-muted-foreground"
            >
              Fee Agreement in Place
            </Label>
          </div>
        )}
      </CardContent>
    </Card>
  );
};