
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { AdminConnectionRequest } from '@/types/admin';
import { MobileConnectionRequestsTable } from './MobileConnectionRequestsTable';
import { ConnectionRequestEmailDialog } from './ConnectionRequestEmailDialog';

interface MobileConnectionRequestsProps {
  requests: AdminConnectionRequest[];
  onApprove: (request: AdminConnectionRequest) => void;
  onReject: (request: AdminConnectionRequest) => void;
  isLoading: boolean;
}

export function MobileConnectionRequests({
  requests,
  onApprove,
  onReject,
  isLoading
}: MobileConnectionRequestsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<AdminConnectionRequest | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredRequests = requests.filter((request) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      !searchQuery ||
      request.user?.first_name?.toLowerCase().includes(searchLower) ||
      request.user?.last_name?.toLowerCase().includes(searchLower) ||
      request.user?.company?.toLowerCase().includes(searchLower) ||
      request.user?.email?.toLowerCase().includes(searchLower) ||
      request.lead_name?.toLowerCase().includes(searchLower) ||
      request.lead_email?.toLowerCase().includes(searchLower) ||
      request.lead_company?.toLowerCase().includes(searchLower) ||
      request.listing?.title?.toLowerCase().includes(searchLower) ||
      request.listing?.category?.toLowerCase().includes(searchLower)
    );
  });

  const handleAction = (request: AdminConnectionRequest, action: "approve" | "reject") => {
    setSelectedRequest(request);
    setActionType(action);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold">Connection Requests</h1>
          <p className="text-sm text-muted-foreground">
            Manage buyer connection requests
          </p>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search requests..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Stats */}
        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">
            Total: {requests.length}
          </Badge>
          <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
            Pending: {requests.filter((r) => r.status === "pending").length}
          </Badge>
          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
            Approved: {requests.filter((r) => r.status === "approved").length}
          </Badge>
          <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-200">
            Rejected: {requests.filter((r) => r.status === "rejected").length}
          </Badge>
        </div>

        {searchQuery && (
          <div className="text-sm text-muted-foreground">
            Found {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''} matching "{searchQuery}"
          </div>
        )}
      </div>

      {/* Requests List */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <MobileConnectionRequestsTable 
          requests={filteredRequests}
          onApprove={(request) => handleAction(request, "approve")}
          onReject={(request) => handleAction(request, "reject")}
          isLoading={isLoading}
        />
      </div>

      <ConnectionRequestEmailDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onConfirm={async (_comment, _senderEmail) => {
          if (selectedRequest && actionType) {
            if (actionType === "approve") {
              await onApprove(selectedRequest);
            } else {
              await onReject(selectedRequest);
            }
            setIsDialogOpen(false);
            setSelectedRequest(null);
            setActionType(null);
          }
        }}
        selectedRequest={selectedRequest}
        actionType={actionType}
        isLoading={false}
      />
    </div>
  );
}
