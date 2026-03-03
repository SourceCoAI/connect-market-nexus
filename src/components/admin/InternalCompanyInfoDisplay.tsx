import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Building, User, Link as LinkIcon, FileText, Clipboard, ExternalLink, Users } from "lucide-react";
import { AdminListing } from "@/types/admin";
import { useSourceCoAdmins } from "@/hooks/admin/use-source-co-admins";
import { StatusTagSwitcher } from "@/components/admin/StatusTagSwitcher";
import { useAdminListings } from "@/hooks/admin/use-admin-listings";

interface InternalCompanyInfoDisplayProps {
  listing: AdminListing;
}

export function InternalCompanyInfoDisplay({ listing }: InternalCompanyInfoDisplayProps) {
  const { data: sourceCoAdmins } = useSourceCoAdmins();
  const { useUpdateListing } = useAdminListings();
  const { mutate: updateListing } = useUpdateListing();
  
  const handleStatusChange = (newStatus: string | null) => {
    updateListing({
      id: listing.id,
      listing: {
        status_tag: newStatus,
      },
    });
  };

  const primaryOwner = sourceCoAdmins?.find(admin => admin.id === listing?.primary_owner_id);

  return (
    <Card className="border-slate-200 bg-slate-50/30 dark:border-slate-700 dark:bg-slate-900/30 mt-4">
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2 text-slate-700 dark:text-slate-300">
          <Shield className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          Internal Company Information
          <Badge variant="outline" className="text-xs border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-400">
            Admin Only
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Listing Status */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Listing Status</h3>
          </div>
          <StatusTagSwitcher
            currentValue={listing.status_tag || null}
            onChange={handleStatusChange}
            className="w-full"
          />
        </div>

        {/* Buyer Visibility */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Buyer Visibility</h3>
          </div>
          <div className="text-sm bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            {!listing.visible_to_buyer_types || listing.visible_to_buyer_types.length === 0 ? (
              <div className="text-slate-600 dark:text-slate-400">
                Visible to <span className="font-medium text-slate-900 dark:text-slate-100">all buyer types</span>
              </div>
            ) : (
              <div>
                <div className="text-slate-700 dark:text-slate-300 font-medium mb-2">Restricted to:</div>
                <div className="flex flex-wrap gap-2">
                  {listing.visible_to_buyer_types.map((type) => (
                    <Badge key={type} variant="secondary" className="text-xs">
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Deal Identifier */}
        {listing.deal_identifier && (
          <div className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
            <Clipboard className="h-5 w-5 text-slate-600 dark:text-slate-400 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-sm text-slate-700 dark:text-slate-300">Deal ID</div>
              <code className="text-sm font-mono text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                {listing.deal_identifier}
              </code>
            </div>
          </div>
        )}

        {/* Company Name & Primary Owner */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {listing.internal_company_name && (
            <div className="flex items-start gap-3">
              <Building className="h-5 w-5 text-slate-600 dark:text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-sm text-slate-700 dark:text-slate-300">Real Company Name</div>
                <div className="text-sm text-slate-900 dark:text-slate-100 font-medium">{listing.internal_company_name}</div>
              </div>
            </div>
          )}

          {(primaryOwner || listing.internal_primary_owner) && (
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-slate-600 dark:text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-sm text-slate-700 dark:text-slate-300">Primary Owner/Lead</div>
                <div className="text-sm text-slate-900 dark:text-slate-100">
                  {primaryOwner ? `${primaryOwner.displayName} (${primaryOwner.email})` : listing.internal_primary_owner}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {listing.internal_salesforce_link && (
            <div className="flex items-start gap-3">
              <LinkIcon className="h-5 w-5 text-slate-600 dark:text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-sm text-slate-700 dark:text-slate-300">Salesforce</div>
                <Button 
                  variant="link" 
                  size="sm" 
                  className="p-0 h-auto text-blue-600 hover:text-blue-800 text-sm"
                  onClick={() => window.open(listing.internal_salesforce_link, '_blank')}
                >
                  Open in Salesforce
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {listing.internal_deal_memo_link && (
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-slate-600 dark:text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-sm text-slate-700 dark:text-slate-300">Deal Memo</div>
                <Button 
                  variant="link" 
                  size="sm" 
                  className="p-0 h-auto text-blue-600 hover:text-blue-800 text-sm"
                  onClick={() => window.open(listing.internal_deal_memo_link, '_blank')}
                >
                  View Deal Memo
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Contact Info */}
        {listing.internal_contact_info && (
          <div>
            <div className="font-medium text-sm text-slate-700 dark:text-slate-300 mb-2">Contact Information</div>
            <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
              {listing.internal_contact_info}
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}