import { useState, useMemo, useEffect } from 'react';
import { useShiftSelect } from '@/hooks/useShiftSelect';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft,
  Search,
  Phone,
  Mail,
  Send,
  Download,
  Users,
  Calendar,
  Loader2,
  UserMinus,
  ListChecks,
  PhoneCall,
  X,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useContactList, useRemoveListMember } from '@/hooks/admin/use-contact-lists';
import { PushToDialerModal } from '@/components/remarketing/PushToDialerModal';
import { PushToSmartleadModal } from '@/components/remarketing/PushToSmartleadModal';
import { PushToHeyreachModal } from '@/components/remarketing/PushToHeyreachModal';
import type { ContactListMember } from '@/types/contact-list';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';
import { useAIUIActionHandler } from '@/hooks/useAIUIActionHandler';
import { ContactMemberDrawer } from '@/components/admin/lists/ContactMemberDrawer';
import { cn } from '@/lib/utils';

const ContactListDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: list, isLoading } = useContactList(id);
  const removeMember = useRemoveListMember();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDialerOpen, setIsDialerOpen] = useState(false);
  const [isSmartleadOpen, setIsSmartleadOpen] = useState(false);
  const [isHeyreachOpen, setIsHeyreachOpen] = useState(false);
  const [drawerMember, setDrawerMember] = useState<ContactListMember | null>(null);

  // Register AI Command Center context
  const { setPageContext } = useAICommandCenterContext();
  useEffect(() => {
    if (id) setPageContext({ page: 'contact_list_detail', entity_id: id, entity_type: 'contacts' });
  }, [id, setPageContext]);

  // Wire AI UI actions
  useAIUIActionHandler({
    table: 'contacts',
    onSelectRows: (rowIds, mode) => {
      if (mode === 'replace') {
        setSelectedIds(new Set(rowIds));
      } else if (mode === 'add') {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          rowIds.forEach((rid) => next.add(rid));
          return next;
        });
      } else {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          rowIds.forEach((rid) => (next.has(rid) ? next.delete(rid) : next.add(rid)));
          return next;
        });
      }
    },
    onClearSelection: () => setSelectedIds(new Set()),
    onTriggerAction: (action) => {
      if (action === 'push_to_dialer') setIsDialerOpen(true);
      if (action === 'push_to_smartlead') setIsSmartleadOpen(true);
      if (action === 'push_to_heyreach') setIsHeyreachOpen(true);
    },
  });

  const activeMembers = useMemo(
    () => (list?.members ?? []).filter((m) => !m.removed_at),
    [list?.members],
  );

  const filteredMembers = useMemo(() => {
    if (!searchQuery) return activeMembers;
    const q = searchQuery.toLowerCase();
    return activeMembers.filter(
      (m) =>
        m.contact_name?.toLowerCase().includes(q) ||
        m.contact_email.toLowerCase().includes(q) ||
        m.contact_company?.toLowerCase().includes(q),
    );
  }, [activeMembers, searchQuery]);

  const selectedMembers = filteredMembers.filter((m) => selectedIds.has(m.id));
  const selectedWithPhone = selectedMembers.filter((m) => m.contact_phone);

  const orderedIds = useMemo(() => filteredMembers.map((m) => m.id), [filteredMembers]);
  const { handleToggle: toggleSelect } = useShiftSelect(orderedIds, selectedIds, setSelectedIds);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredMembers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMembers.map((m) => m.id)));
    }
  };

  const handleExportCsv = () => {
    const members = selectedMembers.length > 0 ? selectedMembers : activeMembers;
    const headers = [
      'Name',
      'Email',
      'Phone',
      'Company',
      'Role',
      'Source',
      'Added',
      'Last Call',
      'Total Calls',
      'Last Disposition',
    ];
    const rows = members.map((m) => [
      m.contact_name || '',
      m.contact_email,
      m.contact_phone || '',
      m.contact_company || '',
      m.contact_role || '',
      m.entity_type,
      m.added_at ? new Date(m.added_at).toLocaleDateString() : '',
      m.last_call_date ? new Date(m.last_call_date).toLocaleDateString() : '',
      m.total_calls ?? 0,
      m.last_disposition || '',
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${list?.name || 'list'}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // For dialer push, use member IDs (not entity_ids) so the edge function
  // can resolve directly from contact_list_members regardless of entity_type
  const dialerContactIds = (
    selectedWithPhone.length > 0 ? selectedWithPhone : activeMembers.filter((m) => m.contact_phone)
  ).map((m) => m.id);

  const handleBulkRemove = () => {
    if (!list) return;
    selectedMembers.forEach((m) => {
      removeMember.mutate({ memberId: m.id, listId: list.id });
    });
    setSelectedIds(new Set());
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">List not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="px-4 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-3">
            <Link to="/admin/lists">
              <Button variant="ghost" size="sm" className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                Lists
              </Button>
            </Link>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">{list.name}</h1>
                <Badge variant="secondary" className="capitalize">
                  {list.list_type}
                </Badge>
              </div>
              {list.description && (
                <p className="text-sm text-muted-foreground">{list.description}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {activeMembers.length} contacts
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Created {format(new Date(list.created_at), 'MMM d, yyyy')}
                  {list.created_by_name && ` by ${list.created_by_name}`}
                </span>
                {list.last_pushed_at && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    Last pushed{' '}
                    {formatDistanceToNow(new Date(list.last_pushed_at), { addSuffix: true })}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>
          </div>
          {list.tags.length > 0 && (
            <div className="flex items-center gap-1.5 mt-3">
              {list.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs font-normal">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-4">
        {/* Search & selection info */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border border-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-sm">
                  {selectedIds.size} contact{selectedIds.size !== 1 ? 's' : ''} selected
                </Badge>

                <div className="flex items-center gap-2">
                  {selectedWithPhone.length > 0 && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsDialerOpen(true)}
                        className="flex items-center gap-1.5"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        Push {selectedWithPhone.length} to Dialer
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsSmartleadOpen(true)}
                        className="flex items-center gap-1.5"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Push {selectedWithPhone.length} to Smartlead
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsHeyreachOpen(true)}
                    className="flex items-center gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Push {selectedIds.size} to HeyReach
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBulkRemove}
                    className="flex items-center gap-1.5 text-destructive hover:text-destructive"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                    Remove from List
                  </Button>
                </div>
              </div>

              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                <X className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span>{selectedWithPhone.length} with phone</span>
              <span>{selectedMembers.filter((m) => m.contact_email).length} with email</span>
            </div>
          </div>
        )}

        {/* Members Table */}
        <div className="bg-card rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      filteredMembers.length > 0 && selectedIds.size === filteredMembers.length
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Deal Owner</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Call Activity</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    <ListChecks className="h-8 w-8 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No members match your search</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredMembers.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    isSelected={selectedIds.has(member.id)}
                    onToggle={(e?: React.MouseEvent) =>
                      toggleSelect(member.id, !selectedIds.has(member.id), e)
                    }
                    onRemove={() => removeMember.mutate({ memberId: member.id, listId: list.id })}
                    onOpenDrawer={() => setDrawerMember(member)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <PushToDialerModal
        open={isDialerOpen}
        onOpenChange={setIsDialerOpen}
        contactIds={dialerContactIds}
        contactCount={dialerContactIds.length}
        entityType="contact_list"
      />
      <PushToSmartleadModal
        open={isSmartleadOpen}
        onOpenChange={setIsSmartleadOpen}
        contactIds={dialerContactIds}
        contactCount={dialerContactIds.length}
        entityType="contacts"
      />
      <PushToHeyreachModal
        open={isHeyreachOpen}
        onOpenChange={setIsHeyreachOpen}
        contactIds={selectedMembers.map((m) => m.entity_id)}
        contactCount={selectedMembers.length}
        entityType="contacts"
      />
      <ContactMemberDrawer
        member={drawerMember}
        onClose={() => setDrawerMember(null)}
        onRemove={(m) => {
          removeMember.mutate({ memberId: m.id, listId: list.id });
          setDrawerMember(null);
        }}
        onNavigateToDeal={(m) => navigate(`/admin/deals/${m.entity_id}`)}
      />
    </div>
  );
};

function MemberRow({
  member,
  isSelected,
  onToggle,
  onRemove,
  onOpenDrawer,
}: {
  member: ContactListMember;
  isSelected: boolean;
  onToggle: (e?: React.MouseEvent) => void;
  onRemove: () => void;
  onOpenDrawer: () => void;
}) {
  return (
    <TableRow
      className={cn(
        isSelected ? 'bg-primary/5' : '',
        'cursor-pointer hover:bg-muted/50',
      )}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('[role="checkbox"]')) return;
        onOpenDrawer();
      }}
    >
      <TableCell
        onClick={(e) => {
          e.stopPropagation();
          onToggle(e);
        }}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => {
            /* handled by TableCell onClick */
          }}
        />
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium text-sm">
            {member.contact?.first_name || member.contact?.last_name
              ? `${member.contact.first_name ?? ''} ${member.contact.last_name ?? ''}`.trim()
              : member.contact_name || 'Unknown'}
          </span>
          {(member.contact?.title || member.contact_role) && (
            <span className="text-xs text-muted-foreground">
              {member.contact?.title || member.contact_role}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">
          {member.contact?.email || member.contact_email}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">
          {member.contact?.phone || member.contact_phone || '--'}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-sm">
          {member.contact?.company_name || member.contact_company || '--'}
        </span>
      </TableCell>
      <TableCell>
        {member.deal_owner_name ? (
          <span className="text-sm font-medium text-foreground">{member.deal_owner_name}</span>
        ) : (
          <span className="text-sm text-muted-foreground/50">--</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[11px] font-normal capitalize">
          {member.entity_type.split('_').join(' ')}
        </Badge>
      </TableCell>
      <TableCell>
        {member.total_calls && member.total_calls > 0 ? (
          <div className="flex flex-col">
            <span className="text-xs flex items-center gap-1">
              <PhoneCall className="h-3 w-3 text-muted-foreground" />
              {member.total_calls} call{member.total_calls !== 1 ? 's' : ''}
            </span>
            {member.last_disposition && (
              <span className="text-[10px] text-muted-foreground">{member.last_disposition}</span>
            )}
            {member.last_call_date && (
              <span className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(member.last_call_date), { addSuffix: true })}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/50">No calls</span>
        )}
      </TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground">
          {format(new Date(member.added_at), 'MMM d, yyyy')}
        </span>
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove from list"
        >
          <UserMinus className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default ContactListDetailPage;
