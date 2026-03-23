import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Trash2, Users, Mail, Phone, Linkedin, Sparkles, Loader2, Pencil } from 'lucide-react';
import { Contact } from './types';

interface ContactsTabProps {
  contacts: Contact[];
  onAddContact: () => void;
  onEditContact?: (contact: Contact) => void;
  onDeleteContact: (contactId: string) => void;
  onEnrichContacts?: () => void;
  isEnrichingContacts?: boolean;
}

export const ContactsTab = ({
  contacts,
  onAddContact,
  onEditContact,
  onDeleteContact,
  onEnrichContacts,
  isEnrichingContacts,
}: ContactsTabProps) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>All Contacts</CardTitle>
            <CardDescription>Key contacts at this organization</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {onEnrichContacts && (
              <Button
                size="sm"
                variant="outline"
                onClick={onEnrichContacts}
                disabled={isEnrichingContacts}
              >
                {isEnrichingContacts ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {isEnrichingContacts ? 'Finding...' : 'Enrich Contacts'}
              </Button>
            )}
            <Button size="sm" onClick={onAddContact}>
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {contacts?.length === 0 ? (
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
              {contacts?.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell className="font-medium">
                    {contact.name}
                    {contact.is_primary && (
                      <Badge variant="secondary" className="ml-2">
                        Primary
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{contact.role || '\u2014'}</TableCell>
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
                      '\u2014'
                    )}
                  </TableCell>
                  <TableCell>
                    {contact.phone ? (
                      <a
                        href={`tel:${contact.phone}`}
                        className="flex items-center gap-1 hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {contact.phone}
                      </a>
                    ) : (
                      '\u2014'
                    )}
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
                      '\u2014'
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {onEditContact && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onEditContact(contact)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => {
                          if (confirm('Delete this contact?')) {
                            onDeleteContact(contact.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
