import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, Phone, Mail, Globe, Calendar, DollarSign, MessageSquare, ExternalLink, StickyNote, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { format } from "date-fns";
import {
  OwnerLead,
  formatRevenueRange,
  formatSaleTimeline,
  REVENUE_PRIORITY,
  TIMELINE_PRIORITY,
  STATUS_PRIORITY
} from "@/hooks/admin/use-owner-leads";
import { useShiftSelect } from "@/hooks/useShiftSelect";

const STATUS_OPTIONS = [
  { value: "new", label: "New", color: "bg-blue-100 text-blue-800" },
  { value: "contacted", label: "Contacted", color: "bg-yellow-100 text-yellow-800" },
  { value: "meeting_scheduled", label: "Meeting Scheduled", color: "bg-purple-100 text-purple-800" },
  { value: "engaged", label: "Engaged", color: "bg-green-100 text-green-800" },
  { value: "not_interested", label: "Not Interested", color: "bg-gray-100 text-gray-800" },
  { value: "not_a_fit", label: "Not a Fit", color: "bg-orange-100 text-orange-800" },
  { value: "closed", label: "Closed", color: "bg-emerald-100 text-emerald-800" },
];

type SortColumn = 'contacted' | 'contact' | 'company' | 'revenue' | 'timeline' | 'status' | 'date';
type SortDirection = 'asc' | 'desc';

function getStatusBadge(status: string) {
  const statusOption = STATUS_OPTIONS.find(s => s.value === status);
  return (
    <Badge variant="outline" className={statusOption?.color || "bg-gray-100 text-gray-800"}>
      {statusOption?.label || status}
    </Badge>
  );
}

interface SortableHeaderProps {
  column: SortColumn;
  label: string;
  currentSort: SortColumn | null;
  direction: SortDirection;
  onSort: (column: SortColumn) => void;
}

function SortableHeader({ column, label, currentSort, direction, onSort }: SortableHeaderProps) {
  const isActive = currentSort === column;
  
  return (
    <button
      onClick={() => onSort(column)}
      className="flex items-center gap-1 hover:text-foreground transition-colors group"
    >
      <span>{label}</span>
      {isActive ? (
        direction === 'asc' ? (
          <ArrowUp className="h-4 w-4" />
        ) : (
          <ArrowDown className="h-4 w-4" />
        )
      ) : (
        <ArrowUpDown className="h-4 w-4 opacity-0 group-hover:opacity-50 transition-opacity" />
      )}
    </button>
  );
}

function LeadDetailsDialog({ lead, onNotesUpdate }: { lead: OwnerLead; onNotesUpdate: (notes: string) => void }) {
  const [notes, setNotes] = useState(lead.admin_notes || "");
  const [hasChanges, setHasChanges] = useState(false);

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setHasChanges(value !== (lead.admin_notes || ""));
  };

  const handleSaveNotes = () => {
    onNotesUpdate(notes);
    setHasChanges(false);
  };

  return (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-sourceco-primary" />
          {lead.company_name || "Unknown Company"}
        </DialogTitle>
      </DialogHeader>
      
      <div className="space-y-4 mt-4">
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Contact Information</h4>
          <div className="grid gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{lead.name}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a>
            </div>
            {lead.phone_number && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ClickToDialPhone
                  phone={lead.phone_number}
                  name={lead.full_name || undefined}
                  email={lead.email || undefined}
                  company={lead.company_name || undefined}
                  size="sm"
                />
              </div>
            )}
            {lead.business_website && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Globe className="h-4 w-4" />
                <a href={lead.business_website.startsWith('http') ? lead.business_website : `https://${lead.business_website}`} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
                  {lead.business_website} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Business Details</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-2">
              <DollarSign className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Revenue</p>
                <p className="text-sm font-medium">{formatRevenueRange(lead.estimated_revenue_range)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Timeline</p>
                <p className="text-sm font-medium">{formatSaleTimeline(lead.sale_timeline)}</p>
              </div>
            </div>
          </div>
        </div>

        {lead.message && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              Message
            </h4>
            <p className="text-sm bg-muted/50 p-3 rounded-md">{lead.message}</p>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
            <StickyNote className="h-4 w-4" />
            Admin Notes
          </h4>
          <Textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Add internal notes about this lead..."
            className="min-h-[100px]"
          />
          {hasChanges && (
            <Button size="sm" onClick={handleSaveNotes}>
              Save Notes
            </Button>
          )}
        </div>

        <div className="pt-2 border-t text-xs text-muted-foreground">
          Submitted {format(new Date(lead.created_at), "MMM d, yyyy 'at' h:mm a")}
        </div>
      </div>
    </DialogContent>
  );
}

interface OwnerLeadsTableContentProps {
  leads: OwnerLead[];
  onStatusChange: (id: string, status: string) => void;
  onNotesUpdate: (id: string, notes: string) => void;
  onContactedChange: (id: string, contacted: boolean) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

export function OwnerLeadsTableContent({ leads, onStatusChange, onNotesUpdate, onContactedChange, selectedIds, onSelectionChange }: OwnerLeadsTableContentProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  // We need a stable setter for useShiftSelect – wrap onSelectionChange
  const setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>> = (action) => {
    if (!onSelectionChange) return;
    if (typeof action === 'function') {
      onSelectionChange(action(selectedIds ?? new Set()));
    } else {
      onSelectionChange(action);
    }
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedLeads = useMemo(() => {
    if (!sortColumn) return leads;

    return [...leads].sort((a, b) => {
      let comparison = 0;

      switch (sortColumn) {
        case 'contacted':
          comparison = (a.contacted_owner === b.contacted_owner) ? 0 : a.contacted_owner ? 1 : -1;
          break;
        case 'contact':
          comparison = (a.name || '').localeCompare(b.name || '');
          break;
        case 'company':
          comparison = (a.company_name || '').localeCompare(b.company_name || '');
          break;
        case 'revenue': {
          const aRevenue = REVENUE_PRIORITY[a.estimated_revenue_range || ''] || 0;
          const bRevenue = REVENUE_PRIORITY[b.estimated_revenue_range || ''] || 0;
          comparison = aRevenue - bRevenue;
          break;
        }
        case 'timeline': {
          const aTimeline = TIMELINE_PRIORITY[a.sale_timeline || ''] || 0;
          const bTimeline = TIMELINE_PRIORITY[b.sale_timeline || ''] || 0;
          comparison = aTimeline - bTimeline;
          break;
        }
        case 'status': {
          const aStatus = STATUS_PRIORITY[a.status] || 0;
          const bStatus = STATUS_PRIORITY[b.status] || 0;
          comparison = aStatus - bStatus;
          break;
        }
        case 'date':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [leads, sortColumn, sortDirection]);

  const orderedIds = useMemo(() => sortedLeads.map(l => l.id), [sortedLeads]);
  const { handleToggle } = useShiftSelect(orderedIds, selectedIds ?? new Set(), setSelectedIds);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {selectedIds && onSelectionChange && (
            <TableHead className="w-[40px]">
              <Checkbox
                checked={sortedLeads.length > 0 && sortedLeads.every(l => selectedIds.has(l.id))}
                onCheckedChange={(checked) => {
                  if (checked) onSelectionChange(new Set(sortedLeads.map(l => l.id)));
                  else onSelectionChange(new Set());
                }}
              />
            </TableHead>
          )}
          <TableHead className="w-[100px]">
            <SortableHeader
              column="contacted"
              label="Contacted"
              currentSort={sortColumn}
              direction={sortDirection}
              onSort={handleSort}
            />
          </TableHead>
          <TableHead>
            <SortableHeader
              column="contact"
              label="Contact"
              currentSort={sortColumn}
              direction={sortDirection}
              onSort={handleSort}
            />
          </TableHead>
          <TableHead>
            <SortableHeader
              column="company"
              label="Company"
              currentSort={sortColumn}
              direction={sortDirection}
              onSort={handleSort}
            />
          </TableHead>
          <TableHead>
            <SortableHeader
              column="revenue"
              label="Revenue"
              currentSort={sortColumn}
              direction={sortDirection}
              onSort={handleSort}
            />
          </TableHead>
          <TableHead>
            <SortableHeader
              column="timeline"
              label="Timeline"
              currentSort={sortColumn}
              direction={sortDirection}
              onSort={handleSort}
            />
          </TableHead>
          <TableHead>
            <SortableHeader
              column="status"
              label="Status"
              currentSort={sortColumn}
              direction={sortDirection}
              onSort={handleSort}
            />
          </TableHead>
          <TableHead>
            <SortableHeader
              column="date"
              label="Date"
              currentSort={sortColumn}
              direction={sortDirection}
              onSort={handleSort}
            />
          </TableHead>
          <TableHead className="w-[80px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedLeads.map((lead) => (
          <TableRow key={lead.id} className={cn(
            selectedIds?.has(lead.id) ? "bg-primary/5" : "",
            lead.status === 'not_a_fit' && "opacity-60 bg-orange-50/50 hover:bg-orange-100/50 dark:bg-orange-950/20 dark:hover:bg-orange-950/30",
          )}>
            {selectedIds && onSelectionChange && (
              <TableCell
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggle(lead.id, !selectedIds.has(lead.id), e);
                }}
              >
                <Checkbox
                  checked={selectedIds.has(lead.id)}
                  onCheckedChange={() => {/* handled by TableCell onClick for shift-key support */}}
                />
              </TableCell>
            )}
            <TableCell>
              <Checkbox
                checked={lead.contacted_owner}
                onCheckedChange={(checked) => onContactedChange(lead.id, checked === true)}
              />
            </TableCell>
            <TableCell>
              <div>
                <p className="font-medium">{lead.name}</p>
                <p className="text-xs text-muted-foreground">{lead.email}</p>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                {lead.company_name || "—"}
              </div>
            </TableCell>
            <TableCell>{formatRevenueRange(lead.estimated_revenue_range)}</TableCell>
            <TableCell>{formatSaleTimeline(lead.sale_timeline)}</TableCell>
            <TableCell>
              <Select
                value={lead.status}
                onValueChange={(value) => onStatusChange(lead.id, value)}
              >
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue>{getStatusBadge(lead.status)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {format(new Date(lead.created_at), "MMM d, yyyy")}
            </TableCell>
            <TableCell>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm">View</Button>
                </DialogTrigger>
                <LeadDetailsDialog 
                  lead={lead} 
                  onNotesUpdate={(notes) => onNotesUpdate(lead.id, notes)} 
                />
              </Dialog>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}