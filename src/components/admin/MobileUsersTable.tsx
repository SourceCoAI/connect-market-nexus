import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { User } from '@/types';
import { MoreHorizontal, UserCheck, UserPlus, UserMinus, Trash2, Mail, Building, Phone, Globe } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { DualFeeAgreementToggle } from "./DualFeeAgreementToggle";
import { SimpleFeeAgreementDialog } from "./SimpleFeeAgreementDialog";
import { DualNDAToggle } from "./DualNDAToggle";
import { SimpleNDADialog } from "./SimpleNDADialog";
import { useLogFeeAgreementEmail } from '@/hooks/admin/use-fee-agreement';
import { supabase } from '@/integrations/supabase/client';
import { formatFinancialRange } from '@/lib/buyer-metrics';

interface MobileUsersTableProps {
  users: User[];
  onApprove: (user: User) => void;
  onMakeAdmin: (user: User) => void;
  onRevokeAdmin: (user: User) => void;
  onDelete: (user: User) => void;
  isLoading: boolean;
  onSendFeeAgreement: (user: User) => void;
  onSendNDAEmail: (user: User) => void;
}

const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case "approved":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Approved</Badge>;
    case "pending":
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 text-xs">Pending</Badge>;
    case "rejected":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-xs">Rejected</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
};

const MobileUserCard = ({ 
  user, 
  onApprove, 
  onMakeAdmin,
  onRevokeAdmin,
  onDelete,
  isLoading,
  onSendFeeAgreement,
  onSendNDAEmail
}: { 
  user: User;
  onApprove: (user: User) => void;
  onMakeAdmin: (user: User) => void;
  onRevokeAdmin: (user: User) => void;
  onDelete: (user: User) => void;
  isLoading: boolean;
  onSendFeeAgreement: (user: User) => void;
  onSendNDAEmail: (user: User) => void;
}) => (
  <Card className="w-full">
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-base font-semibold">
            {user.first_name} {user.last_name}
            {user.is_admin && (
              <Badge variant="outline" className="ml-2 text-xs bg-purple-50 text-purple-700">
                Admin
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={user.approval_status} />
            {user.email_verified && (
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                Verified
              </Badge>
            )}
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={isLoading}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>User Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            {user.approval_status === "pending" && (
              <DropdownMenuItem 
                onClick={() => onApprove(user)}
                className="text-green-600"
              >
                <UserCheck className="h-4 w-4 mr-2" />
                Approve User
              </DropdownMenuItem>
            )}
            
            {user.approval_status === "rejected" && (
              <DropdownMenuItem 
                onClick={() => onApprove(user)}
                className="text-green-600"
              >
                <UserCheck className="h-4 w-4 mr-2" />
                Approve User
              </DropdownMenuItem>
            )}
            
            <DropdownMenuSeparator />
            
            {!user.is_admin ? (
              <DropdownMenuItem 
                onClick={() => onMakeAdmin(user)}
                className="text-blue-600"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Make Admin
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem 
                onClick={() => onRevokeAdmin(user)}
                className="text-orange-600"
              >
                <UserMinus className="h-4 w-4 mr-2" />
                Revoke Admin
              </DropdownMenuItem>
            )}
            
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => onDelete(user)}
              className="text-red-600"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete User
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </CardHeader>
    
    <CardContent className="pt-0 space-y-3">
      {/* Fee Agreement Section */}
      <div className="border-b pb-3">
        <DualFeeAgreementToggle 
          user={user}
          onSendEmail={onSendFeeAgreement}
          size="default"
        />
      </div>
      
      {/* NDA Section */}
      <div className="border-b pb-3">
        <DualNDAToggle 
          user={user}
          onSendEmail={onSendNDAEmail}
          size="default"
        />
      </div>
      
      {/* Contact Information */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground truncate">{user.email}</span>
        </div>
        
        {user.company && (
          <div className="flex items-center gap-2 text-sm">
            <Building className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground truncate">{user.company}</span>
          </div>
        )}
        
        {user.phone_number && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{user.phone_number}</span>
          </div>
        )}
        
        {user.website && (
          <div className="flex items-center gap-2 text-sm">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground truncate">{user.website}</span>
          </div>
        )}
        
        {user.linkedin_profile && (
          <div className="flex items-center gap-2 text-sm">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <a href={user.linkedin_profile} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
              LinkedIn Profile
            </a>
          </div>
        )}
      </div>

      {/* Buyer Type & Additional Info */}
      <div className="border-t pt-3 space-y-2">
        {user.buyer_type && (
          <div className="text-sm">
            <span className="font-medium">Buyer Type:</span>{" "}
            <Badge variant="outline" className="capitalize text-xs ml-1">
              {user.buyer_type === 'independent_sponsor' ? 'IS' :
               user.buyer_type === 'private_equity' ? 'PE' :
               user.buyer_type === 'family_office' ? 'FO' :
               user.buyer_type === 'search_fund' ? 'SF' :
               user.buyer_type === 'corporate' ? 'Corp' :
               user.buyer_type === 'individual_buyer' ? 'Indiv' :
               user.buyer_type}
            </Badge>
          </div>
        )}
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Joined {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}</span>
        </div>
      </div>

      {/* Buyer Profile */}
      {(user.ideal_target_description || user.business_categories?.length || user.target_locations || user.revenue_range_min || user.revenue_range_max) && (
        <div className="border-t pt-3 space-y-2">
          <div className="font-medium text-sm mb-2">Buyer Profile</div>
          
          {user.ideal_target_description && (
            <div className="text-sm p-2 bg-muted/30 rounded-md">
              <div className="font-medium mb-1">Ideal Targets:</div>
              <div className="text-muted-foreground text-xs leading-relaxed">{user.ideal_target_description}</div>
            </div>
          )}
          
          {user.business_categories && user.business_categories.length > 0 && (
            <div className="text-sm">
              <div className="font-medium mb-1">Business Categories:</div>
              <div className="flex flex-wrap gap-1">
                {user.business_categories.slice(0, 3).map((category) => (
                  <Badge key={category} variant="secondary" className="text-xs">
                    {category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Badge>
                ))}
                {user.business_categories.length > 3 && (
                  <Badge variant="secondary" className="text-xs">
                    +{user.business_categories.length - 3} more
                  </Badge>
                )}
              </div>
            </div>
          )}
          
          {user.target_locations && (
            <div className="text-sm">
              <span className="font-medium">Target Locations:</span>{" "}
              {Array.isArray(user.target_locations) ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {user.target_locations.map((loc) => (
                    <Badge key={loc} variant="secondary" className="text-xs">
                      {loc}
                    </Badge>
                  ))}
                </div>
              ) : (
                user.target_locations
              )}
            </div>
          )}
          
          {(user.revenue_range_min || user.revenue_range_max) && (
            <div className="text-sm">
              <span className="font-medium">Revenue Range:</span>{" "}
              {formatFinancialRange(user.revenue_range_min, user.revenue_range_max)}
            </div>
          )}
        </div>
      )}

      {/* Additional Details for certain buyer types */}
      {(user.estimated_revenue || user.fund_size || user.aum) && (
        <div className="border-t pt-3 space-y-1">
          <div className="font-medium text-sm mb-2">Additional Information</div>
          {user.estimated_revenue && (
            <div className="text-sm">
              <span className="font-medium">Est. Revenue:</span> {user.estimated_revenue}
            </div>
          )}
          {user.fund_size && (
            <div className="text-sm">
              <span className="font-medium">Fund Size:</span> {user.fund_size}
            </div>
          )}
          {user.aum && (
            <div className="text-sm">
              <span className="font-medium">AUM:</span> {user.aum}
            </div>
          )}
        </div>
      )}
    </CardContent>
  </Card>
);

export const MobileUsersTable = ({ 
  users, 
  onApprove, 
  onMakeAdmin,
  onRevokeAdmin,
  onDelete,
  isLoading,
}: MobileUsersTableProps) => {
  const [selectedUserForEmail, setSelectedUserForEmail] = useState<User | null>(null);
  const [selectedUserForNDA, setSelectedUserForNDA] = useState<User | null>(null);
  const logEmailMutation = useLogFeeAgreementEmail();
  
  const handleSendEmail = async (emailData: {
    userId: string;
    userEmail: string;
    subject: string;
    content: string;
    attachments?: Array<{name: string, content: string}>;
    useTemplate: boolean;
  }) => {
    // Get current user for admin info
    const current_auth_user = await supabase.auth.getUser();
    if (!current_auth_user.data.user) {
      return;
    }

    try {
      // Get admin profile info
      const { data: adminProfile, error: profileError } = await supabase
        .from('profiles')
        .select('email, first_name, last_name')
        .eq('id', current_auth_user.data.user.id)
        .single();

      if (profileError || !adminProfile) {
        throw new Error('Failed to fetch admin profile');
      }

      const adminName = `${adminProfile.first_name} ${adminProfile.last_name}`;

      // Use the hook for optimistic updates and consistent behavior
      await logEmailMutation.mutateAsync({
        userId: emailData.userId,
        userEmail: emailData.userEmail,
        subject: emailData.subject,
        content: emailData.content,
        attachments: emailData.attachments,
        adminId: current_auth_user.data.user.id,
        adminEmail: adminProfile.email,
        adminName: adminName,
        notes: emailData.useTemplate ? 'Template fee agreement email sent' : 'Custom fee agreement email sent'
      });

    } catch (error: unknown) {
      console.error('Mobile: Error in handleSendEmail:', error);
      // Error handling is done by the hook
    }
  };
  if (isLoading) {
    return (
      <div className="space-y-4">
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

  if (users.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No users found.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {users.map((user) => (
        <MobileUserCard
          key={user.id}
          user={user}
          onApprove={onApprove}
          onMakeAdmin={onMakeAdmin}
          onRevokeAdmin={onRevokeAdmin}
          onDelete={onDelete}
          isLoading={isLoading}
          onSendFeeAgreement={setSelectedUserForEmail}
          onSendNDAEmail={setSelectedUserForNDA}
        />
      ))}
      
      <SimpleFeeAgreementDialog
        user={selectedUserForEmail}
        isOpen={!!selectedUserForEmail}
        onClose={() => setSelectedUserForEmail(null)}
        onSendEmail={async (user, options) => {
          await handleSendEmail({
            userId: user.id,
            userEmail: user.email,
            subject: options?.subject || 'Fee Agreement | SourceCo',
            content: options?.content || 'Please review and sign the attached fee agreement.',
            attachments: options?.attachments || [],
            useTemplate: false
          });
        }}
      />
      
      <SimpleNDADialog
        open={!!selectedUserForNDA}
        onOpenChange={(open) => !open && setSelectedUserForNDA(null)}
        user={selectedUserForNDA}
        onSendEmail={async (user) => {
          const { error } = await supabase.functions.invoke('send-nda-email', {
            body: { userEmail: user.email, userId: user.id }
          });
          if (error) throw error;
        }}
      />
    </div>
  );
};