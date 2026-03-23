
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { AdminConnectionRequest, AdminListing } from '@/types/admin';
import { MessageSquare, User, Building, MapPin, DollarSign, Clipboard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { InternalCompanyInfoDisplay } from './InternalCompanyInfoDisplay';

interface MobileConnectionRequestsTableProps {
  requests: AdminConnectionRequest[];
  onApprove: (request: AdminConnectionRequest) => void;
  onReject: (request: AdminConnectionRequest) => void;
  isLoading: boolean;
}

const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case "approved":
      return <Badge className="bg-green-500 text-white text-xs">Approved</Badge>;
    case "rejected":
      return <Badge className="bg-red-500 text-white text-xs">Rejected</Badge>;
    case "pending":
    default:
      return <Badge className="bg-yellow-500 text-white text-xs">Pending</Badge>;
  }
};

const MobileRequestCard = ({ 
  request, 
  onApprove, 
  onReject 
}: { 
  request: AdminConnectionRequest;
  onApprove: (request: AdminConnectionRequest) => void;
  onReject: (request: AdminConnectionRequest) => void;
}) => (
  <Card className="w-full">
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-base font-semibold truncate">
            {request.user ? `${request.user.first_name} ${request.user.last_name}` : "Unknown User"}
          </CardTitle>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={request.status} />
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>
    </CardHeader>
    
    <CardContent className="pt-0 space-y-3">
      {/* User Details */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Contact:</span>
          <span className="text-muted-foreground truncate">{request.user?.email || "-"}</span>
        </div>
        
        {request.user?.company && (
          <div className="flex items-center gap-2 text-sm">
            <Building className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Company:</span>
            <span className="text-muted-foreground truncate">{request.user.company}</span>
          </div>
        )}
        
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="font-medium">Fee Agreement:</span>
            <Badge variant={request.lead_fee_agreement_signed ? "success" : "secondary"} className="text-xs">
              {request.lead_fee_agreement_signed ? "Signed" : "Not Signed"}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-medium">NDA:</span>
            <Badge variant={request.lead_nda_signed ? "success" : "secondary"} className="text-xs">
              {request.lead_nda_signed ? "Signed" : "Not Signed"}
            </Badge>
            {request.lead_nda_email_sent && (
              <Badge variant="outline" className="text-xs ml-1">
                Email Sent
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Listing Details */}
      <div className="border-t pt-3 space-y-2">
        <div className="font-medium text-sm">Interested in:</div>
        <div className="text-sm">
          {request.listing?.id ? (
            <Link 
              to={`/listing/${request.listing.id}`} 
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              {request.listing.title || "Unknown Listing"}
            </Link>
          ) : (
            <span>{request.listing?.title || "Unknown Listing"}</span>
          )}
        </div>
        
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {request.listing?.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span>{request.listing.location}</span>
            </div>
          )}
          {request.listing?.revenue && (
            <div className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              <span>Rev: ${(request.listing.revenue).toLocaleString()}</span>
            </div>
          )}
        </div>
        
        {/* Deal Identifier */}
        {request.listing?.deal_identifier && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <div className="flex items-center gap-2">
              <Clipboard className="h-3 w-3 text-orange-600" />
              <span className="text-xs font-medium text-orange-700 dark:text-orange-400">Deal ID:</span>
              <code className="text-xs font-mono bg-orange-100 dark:bg-orange-900 px-1.5 py-0.5 rounded text-orange-800 dark:text-orange-200">
                {request.listing.deal_identifier}
              </code>
            </div>
          </div>
        )}
      </div>
      
      {/* Internal Company Info Display */}
      {request.listing && <InternalCompanyInfoDisplay listing={request.listing as unknown as AdminListing} />}

      {/* Message */}
      {request.user_message && (
        <div className="border-t pt-3">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Message:</span>
          </div>
          <div className="bg-muted/30 p-3 rounded-md text-sm">
            {request.user_message}
          </div>
        </div>
      )}

      {/* Admin Comment */}
      {request.admin_comment && (
        <div className="bg-blue-50 p-3 rounded-md">
          <div className="font-medium text-sm mb-1">Admin Comment:</div>
          <div className="text-sm text-muted-foreground">{request.admin_comment}</div>
        </div>
      )}

      {/* Actions */}
      <div className="border-t pt-3">
        {request.status === "pending" ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-green-500 hover:bg-green-600 text-white"
              onClick={() => onApprove(request)}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
              onClick={() => onReject(request)}
            >
              Reject
            </Button>
          </div>
        ) : request.status === "rejected" ? (
          <Button
            size="sm"
            className="w-full bg-green-500 hover:bg-green-600 text-white"
            onClick={() => onApprove(request)}
          >
            Approve
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="w-full border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
            onClick={() => onReject(request)}
          >
            Revoke
          </Button>
        )}
      </div>
    </CardContent>
  </Card>
);

export const MobileConnectionRequestsTable = ({
  requests,
  onApprove,
  onReject,
  isLoading,
}: MobileConnectionRequestsTableProps) => {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-muted rounded mb-2"></div>
              <div className="h-3 bg-muted rounded w-2/3 mb-4"></div>
              <div className="h-16 bg-muted rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No connection requests found
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <MobileRequestCard
          key={request.id}
          request={request}
          onApprove={onApprove}
          onReject={onReject}
        />
      ))}
    </div>
  );
};
