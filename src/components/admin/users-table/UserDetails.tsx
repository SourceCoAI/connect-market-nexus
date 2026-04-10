import { User } from '@/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExternalLink, Mail, Building, UserIcon, Linkedin, Search } from 'lucide-react';
import { UserSavedListings } from '../UserSavedListings';
import { UserActivityTimeline } from '../UserActivityTimeline';
import { BuyerQualityScorePanel } from '../BuyerQualityScorePanel';
import { getFieldCategories, FIELD_LABELS } from '@/lib/buyer-type-fields';
import { formatFieldValue } from '@/lib/field-formatting';

// Helper function to render user detail with proper field filtering
export const UserDetails = ({ user }: { user: User }) => {
  // Get buyer-type specific field categories
  const fieldCategories = getFieldCategories(user.buyer_type || 'corporate');

  return (
    <div className="space-y-6 p-4 bg-muted/20 rounded-lg">
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="quality-score">Quality Score</TabsTrigger>
          <TabsTrigger value="saved">Saved Listings</TabsTrigger>
          <TabsTrigger value="timeline">Activity Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6 mt-6">
          {/* Account Information Section */}
          <div className="space-y-3">
            <h4 className="font-medium text-foreground flex items-center gap-2">
              <UserIcon className="h-4 w-4" />
              Account Information
            </h4>
            <div className="pl-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Created:</span>{' '}
                {new Date(user.created_at).toLocaleString()}
              </div>
              <div>
                <span className="text-muted-foreground">Email Verified:</span>
                {user.email_verified ? ' Yes' : ' No'}
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <span
                  className={`capitalize ml-1 ${
                    user.approval_status === 'approved'
                      ? 'text-green-600'
                      : user.approval_status === 'rejected'
                        ? 'text-red-600'
                        : 'text-yellow-600'
                  }`}
                >
                  {user.approval_status}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Admin:</span>{' '}
                {user.is_admin ? ' Yes' : ' No'}
              </div>
            </div>
          </div>

          {/* Render each field category dynamically */}
          {Object.entries(fieldCategories).map(([categoryName, fields]) => {
            if (fields.length === 0) return null;

            return (
              <div key={categoryName} className="space-y-3">
                <h4 className="font-medium text-foreground flex items-center gap-2">
                  {categoryName === 'Contact Information' && <Mail className="h-4 w-4" />}
                  {categoryName === 'Business Profile' && <Building className="h-4 w-4" />}
                  {categoryName === 'Financial Information' && <UserIcon className="h-4 w-4" />}
                  {categoryName === 'Sourcing & Discovery' && <Search className="h-4 w-4" />}
                  {categoryName}
                  {categoryName === 'Financial Information' && ` (${user.buyer_type})`}
                </h4>
                <div className="pl-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {fields.map((fieldKey: string) => {
                    const fieldLabel =
                      FIELD_LABELS[fieldKey as keyof typeof FIELD_LABELS] || fieldKey;
                    const fieldValue = user[fieldKey as keyof User];

                    // Handle special field rendering
                    if (fieldKey === 'website' && fieldValue) {
                      return (
                        <div key={fieldKey} className="flex items-center gap-2">
                          <span className="text-muted-foreground">{fieldLabel}:</span>
                          <a
                            href={fieldValue as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            {fieldValue as string} <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      );
                    }

                    if (fieldKey === 'linkedin_profile' && fieldValue) {
                      return (
                        <div key={fieldKey} className="flex items-center gap-2">
                          <span className="text-muted-foreground">{fieldLabel}:</span>
                          <a
                            href={fieldValue as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            <Linkedin className="h-3 w-3" />
                            Profile
                          </a>
                        </div>
                      );
                    }

                    if (fieldKey === 'additional_phone_numbers') {
                      const phones = fieldValue as string[] | undefined;
                      return (
                        <div key={fieldKey}>
                          <span className="text-muted-foreground">{fieldLabel}:</span>{' '}
                          {phones && phones.length > 0
                            ? phones.join(', ')
                            : '\u2014'}
                        </div>
                      );
                    }

                    if (fieldKey === 'business_categories') {
                      return (
                        <div key={fieldKey} className="col-span-2">
                          <span className="text-muted-foreground">{fieldLabel}:</span>
                          <div className="mt-1">
                            {fieldValue && Array.isArray(fieldValue) && fieldValue.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {fieldValue.map((cat, index) => (
                                  <span key={index} className="text-xs bg-muted px-2 py-1 rounded">
                                    {cat}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              '\u2014'
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (fieldKey === 'target_locations') {
                      const locationsToDisplay = Array.isArray(fieldValue)
                        ? fieldValue
                        : fieldValue
                          ? [fieldValue]
                          : [];
                      return (
                        <div key={fieldKey} className="col-span-2">
                          <span className="text-muted-foreground">{fieldLabel}:</span>
                          <div className="mt-1">
                            {locationsToDisplay.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {locationsToDisplay.map((loc, index) => (
                                  <span key={index} className="text-xs bg-muted px-2 py-1 rounded">
                                    {loc}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              '\u2014'
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (
                      fieldKey === 'ideal_target_description' ||
                      fieldKey === 'specific_business_search'
                    ) {
                      return (
                        <div key={fieldKey} className="col-span-2">
                          <span className="text-muted-foreground">{fieldLabel}:</span>
                          <p className="mt-1 text-xs leading-relaxed">
                            {(fieldValue as string) || '\u2014'}
                          </p>
                        </div>
                      );
                    }

                    if (fieldKey === 'revenue_range_min' || fieldKey === 'revenue_range_max') {
                      return (
                        <div key={fieldKey}>
                          <span className="text-muted-foreground">{fieldLabel}:</span>{' '}
                          {fieldValue ? String(fieldValue) : '—'}
                        </div>
                      );
                    }

                    if (fieldKey === 'target_deal_size_min' || fieldKey === 'target_deal_size_max') {
                      const numValue = Number(fieldValue);
                      return (
                        <div key={fieldKey}>
                          <span className="text-muted-foreground">{fieldLabel}:</span>{' '}
                          {numValue ? `$${numValue.toLocaleString()}` : '—'}
                        </div>
                      );
                    }

                    if (fieldKey === 'industry_expertise') {
                      // Handle both array and text formats for industry_expertise
                      const displayValue = Array.isArray(fieldValue)
                        ? fieldValue.join(', ')
                        : (fieldValue as string) || '\u2014';
                      return (
                        <div key={fieldKey} className="col-span-2">
                          <span className="text-muted-foreground">{fieldLabel}:</span>{' '}
                          {displayValue}
                        </div>
                      );
                    }

                    // Skip funded_by if user is not funded
                    if (fieldKey === 'funded_by' && user.is_funded !== 'yes') {
                      return null;
                    }

                    // Handle Independent Sponsor specific fields with proper formatting
                    if (
                      [
                        'committed_equity_band',
                        'equity_source',
                        'deployment_timing',
                        'flex_subxm_ebitda',
                      ].includes(fieldKey)
                    ) {
                      return (
                        <div key={fieldKey}>
                          <span className="text-muted-foreground">{fieldLabel}:</span>{' '}
                          {formatFieldValue(fieldKey, fieldValue)}
                        </div>
                      );
                    }

                    // Handle deal_sourcing_methods array
                    if (fieldKey === 'deal_sourcing_methods') {
                      const methods = fieldValue as string[] | undefined;
                      return (
                        <div key={fieldKey} className="col-span-2">
                          <span className="text-muted-foreground">{fieldLabel}:</span>
                          <div className="mt-1">
                            {methods && methods.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {methods.map((method, index) => (
                                  <span
                                    key={index}
                                    className="text-xs bg-muted px-2 py-1 rounded capitalize"
                                  >
                                    {method.replace(/_/g, ' ')}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              '\u2014'
                            )}
                          </div>
                        </div>
                      );
                    }

                    // Handle referral_source with special formatting
                    if (fieldKey === 'referral_source') {
                      return (
                        <div key={fieldKey}>
                          <span className="text-muted-foreground">{fieldLabel}:</span>{' '}
                          <span className="capitalize">
                            {fieldValue ? String(fieldValue).replace(/_/g, ' ') : '\u2014'}
                          </span>
                        </div>
                      );
                    }

                    // Handle target_acquisition_volume with special formatting
                    if (fieldKey === 'target_acquisition_volume') {
                      return (
                        <div key={fieldKey}>
                          <span className="text-muted-foreground">{fieldLabel}:</span>{' '}
                          <span className="capitalize">
                            {fieldValue ? String(fieldValue).replace(/_/g, ' ') : '\u2014'}
                          </span>
                        </div>
                      );
                    }

                    // Handle first_seen_at timestamp
                    if (fieldKey === 'first_seen_at' && fieldValue) {
                      return (
                        <div key={fieldKey}>
                          <span className="text-muted-foreground">{fieldLabel}:</span>{' '}
                          {new Date(fieldValue as string).toLocaleString()}
                        </div>
                      );
                    }

                    // Handle first_external_referrer - show with external link styling
                    if (fieldKey === 'first_external_referrer' && fieldValue) {
                      return (
                        <div key={fieldKey}>
                          <span className="text-muted-foreground">{fieldLabel}:</span>{' '}
                          <span className="text-primary">{fieldValue as string}</span>
                        </div>
                      );
                    }

                    // Handle first_blog_landing - show the blog path
                    if (fieldKey === 'first_blog_landing' && fieldValue) {
                      return (
                        <div key={fieldKey}>
                          <span className="text-muted-foreground">{fieldLabel}:</span>{' '}
                          <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                            {fieldValue as string}
                          </span>
                        </div>
                      );
                    }

                    // Default field rendering with formatting
                    return (
                      <div key={fieldKey}>
                        <span className="text-muted-foreground">{fieldLabel}:</span>{' '}
                        {formatFieldValue(fieldKey, fieldValue)}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="quality-score" className="mt-6">
          <BuyerQualityScorePanel user={user} />
        </TabsContent>

        <TabsContent value="saved" className="mt-6">
          <UserSavedListings userId={user.id} />
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <UserActivityTimeline userId={user.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
