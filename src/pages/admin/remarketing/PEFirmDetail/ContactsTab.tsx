import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Mail, Linkedin, Plus, Trash2, Building2 } from "lucide-react";
import { ClickToDialPhone } from '@/components/shared/ClickToDialPhone';

interface ContactsTabProps {
  firmName: string;
  contacts: Array<{
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    role: string | null;
    linkedin_url: string | null;
    is_primary: boolean | null;
    mobile_phone_1: string | null;
    mobile_phone_2: string | null;
    mobile_phone_3: string | null;
    office_phone: string | null;
  }>;
  onAddContact: () => void;
  onDeleteContact: (contactId: string) => void;
}

export const ContactsTab = ({
  firmName,
  contacts,
  onAddContact,
  onDeleteContact,
}: ContactsTabProps) => {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Firm Contacts</CardTitle>
              <CardDescription>
                Partners, VPs, and deal team members at {firmName}
              </CardDescription>
            </div>
            <Button size="sm" onClick={onAddContact}>
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p>No contacts added yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>LinkedIn</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium">
                      {contact.name}
                      {contact.is_primary && (
                        <Badge variant="secondary" className="ml-2">
                          Primary
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{contact.role || "\u2014"}</TableCell>
                    <TableCell>
                      {contact.email ? (
                        <a
                          href={`mailto:${contact.email}`}
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <Mail className="h-3 w-3" />
                          {contact.email}
                        </a>
                      ) : (
                        "\u2014"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {contact.mobile_phone_1 ? (
                          <ClickToDialPhone
                            phone={contact.mobile_phone_1}
                            name={contact.name || undefined}
                            email={contact.email || undefined}
                            size="sm"
                          />
                        ) : contact.phone ? (
                          <ClickToDialPhone
                            phone={contact.phone}
                            name={contact.name || undefined}
                            email={contact.email || undefined}
                            size="sm"
                          />
                        ) : null}
                        {contact.mobile_phone_2 && (
                          <ClickToDialPhone
                            phone={contact.mobile_phone_2}
                            name={contact.name || undefined}
                            email={contact.email || undefined}
                            size="sm"
                          />
                        )}
                        {contact.office_phone && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            {contact.office_phone}
                          </span>
                        )}
                        {!contact.mobile_phone_1 && !contact.phone && !contact.office_phone && "\u2014"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {contact.linkedin_url ? (
                        <a
                          href={contact.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <Linkedin className="h-3 w-3" />
                          Profile
                        </a>
                      ) : (
                        "\u2014"
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => {
                          if (confirm("Delete this contact?")) {
                            onDeleteContact(contact.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
