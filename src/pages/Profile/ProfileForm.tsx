import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, Plus, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { MultiCategorySelect } from '@/components/ui/category-select';
import { MultiLocationSelect } from '@/components/ui/location-select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { InvestmentSizeSelect } from '@/components/ui/investment-size-select';
import { EnhancedCurrencyInput } from '@/components/ui/enhanced-currency-input';
import { ChipInput } from '@/components/ui/chip-input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DEAL_INTENT_OPTIONS } from '@/lib/signup-field-options';
import { ProfileSettings } from './ProfileSettings';
import { getMissingRequiredFields, getProfileCompletionPercentage, isProfileComplete } from '@/lib/profile-completeness';
import { FIELD_LABELS } from '@/lib/buyer-type-fields';
import type { ProfileFormProps } from './types';

export function ProfileForm({
  user,
  formData,
  isLoading,
  onInputChange,
  onSelectChange,
  onLocationChange,
  onSetFormData,
  onSubmit,
}: ProfileFormProps) {
  // Merge formData with user for live completeness tracking
  const mergedUser = { ...user, ...formData };
  const missingKeys = getMissingRequiredFields(mergedUser);
  const completionPct = getProfileCompletionPercentage(mergedUser);
  const profileComplete = isProfileComplete(mergedUser);

  const scrollToField = (fieldKey: string) => {
    const el = document.getElementById(fieldKey);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => el.focus(), 400);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
        <CardDescription>Update your profile information and preferences.</CardDescription>
      </CardHeader>

      <CardContent>
        {!profileComplete && (
          <div className="mb-6 rounded-lg border border-[#E5E5E5] p-4 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-[#0E101A]">
                {completionPct}% complete
              </p>
              <p className="text-xs text-[#6B6B6B]">
                Fill in the remaining fields to request introductions.
              </p>
            </div>
            <div className="h-1 rounded-full bg-[#E5E5E5] overflow-hidden">
              <div
                className="h-full bg-[#0E101A] transition-all duration-500"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            {missingKeys.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                {missingKeys.map((key, i) => (
                  <span key={key} className="inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => scrollToField(key)}
                      className="text-xs font-medium text-[#0E101A] underline-offset-2 hover:underline cursor-pointer"
                    >
                      {(FIELD_LABELS as Record<string, string>)[key] ?? key}
                    </button>
                    {i < missingKeys.length - 1 && (
                      <span className="text-[#C0C0C0] ml-1.5">·</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" value={user.email} disabled className="bg-muted/50" />
              <p className="text-xs text-muted-foreground">
                Need to update your email? Contact{' '}
                <a href="mailto:support@sourcecodeals.com" className="text-primary hover:underline">
                  support@sourcecodeals.com
                </a>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="buyer_type">Buyer Type</Label>
              <Select
                value={formData.buyer_type}
                onValueChange={(value) => onSelectChange(value, 'buyer_type')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a buyer type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="privateEquity">Private Equity</SelectItem>
                  <SelectItem value="corporate">Corporate / Strategic</SelectItem>
                  <SelectItem value="familyOffice">Family Office</SelectItem>
                  <SelectItem value="independentSponsor">Independent Sponsor</SelectItem>
                  <SelectItem value="searchFund">Search Fund</SelectItem>
                  <SelectItem value="individual">Individual Buyer</SelectItem>
                  <SelectItem value="advisor">Advisor / Broker</SelectItem>
                  <SelectItem value="businessOwner">Business Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="first_name">First Name</Label>
              <Input
                id="first_name"
                name="first_name"
                value={formData.first_name}
                onChange={onInputChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name</Label>
              <Input
                id="last_name"
                name="last_name"
                value={formData.last_name}
                onChange={onInputChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                name="company"
                value={formData.company}
                onChange={onInputChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                name="website"
                value={formData.website}
                onChange={onInputChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedin_profile">LinkedIn Profile</Label>
              <Input
                id="linkedin_profile"
                name="linkedin_profile"
                value={formData.linkedin_profile}
                onChange={onInputChange}
                placeholder="https://www.linkedin.com/in/yourprofile"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone_number">Mobile Number 1</Label>
              <Input
                id="phone_number"
                name="phone_number"
                value={formData.phone_number}
                onChange={onInputChange}
              />
              {/* Additional phone numbers */}
              {(formData.additional_phone_numbers || []).map((num, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    placeholder={`Mobile Number ${idx + 2}`}
                    value={num}
                    onChange={(e) => {
                      const updated = [...(formData.additional_phone_numbers || [])];
                      updated[idx] = e.target.value;
                      onSetFormData((prev) => ({ ...prev, additional_phone_numbers: updated }));
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => {
                      const updated = (formData.additional_phone_numbers || []).filter((_, i) => i !== idx);
                      onSetFormData((prev) => ({ ...prev, additional_phone_numbers: updated }));
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => {
                  const current = formData.additional_phone_numbers || [];
                  onSetFormData((prev) => ({ ...prev, additional_phone_numbers: [...current, ''] }));
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Mobile Number
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="job_title">Job Title</Label>
              <Input
                id="job_title"
                name="job_title"
                value={formData.job_title || ''}
                onChange={onInputChange}
                placeholder="e.g., Partner, VP Business Development, Investment Associate"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="target_locations">Target Locations</Label>
              <MultiLocationSelect
                value={Array.isArray(formData.target_locations) ? formData.target_locations : []}
                onValueChange={onLocationChange}
                placeholder="Select target regions..."
              />
            </div>
          </div>

          <Separator />

          {/* Investment Criteria Section */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium">Investment Criteria</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-2">
                <Label htmlFor="investment_size">Investment Size Range</Label>
                <InvestmentSizeSelect
                  value={
                    Array.isArray(formData.investment_size)
                      ? formData.investment_size
                      : formData.investment_size
                        ? [formData.investment_size]
                        : []
                  }
                  onValueChange={(values) => onSelectChange(values, 'investment_size')}
                  placeholder="Select investment size ranges..."
                />
              </div>

              {(formData.buyer_type === 'privateEquity' || formData.buyer_type === 'private_equity' ||
                formData.buyer_type === 'familyOffice' || formData.buyer_type === 'family_office') && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fund_size">Fund Size</Label>
                    <EnhancedCurrencyInput
                      id="fund_size"
                      name="fund_size"
                      value={formData.fund_size || ''}
                      onChange={(value) => onSelectChange(value, 'fund_size')}
                      fieldType="fund"
                      currencyMode="millions"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="aum">Assets Under Management</Label>
                    <EnhancedCurrencyInput
                      id="aum"
                      name="aum"
                      value={formData.aum || ''}
                      onChange={(value) => onSelectChange(value, 'aum')}
                      fieldType="aum"
                      currencyMode="millions"
                    />
                  </div>
                </>
              )}

              {formData.buyer_type === 'corporate' && (
                <div className="space-y-2">
                  <Label htmlFor="estimated_revenue">Your Company Revenue</Label>
                  <EnhancedCurrencyInput
                    id="estimated_revenue"
                    name="estimated_revenue"
                    value={formData.estimated_revenue || ''}
                    onChange={(value) => onSelectChange(value, 'estimated_revenue')}
                    fieldType="revenue"
                    currencyMode="millions"
                  />
                </div>
              )}

              {(formData.buyer_type === 'searchFund' || formData.buyer_type === 'search_fund') && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="is_funded">Funding Status</Label>
                    <Select
                      value={formData.is_funded}
                      onValueChange={(value) => onSelectChange(value, 'is_funded')}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select funding status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Funded</SelectItem>
                        <SelectItem value="no">Not Funded</SelectItem>
                        <SelectItem value="seeking">Seeking Funding</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.is_funded === 'yes' && (
                    <div className="space-y-2">
                      <Label htmlFor="funded_by">Funded By</Label>
                      <Input
                        id="funded_by"
                        name="funded_by"
                        value={formData.funded_by || ''}
                        onChange={onInputChange}
                        placeholder="Name of investor/fund"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="target_company_size">Target Company Size</Label>
                    <Select
                      value={formData.target_company_size}
                      onValueChange={(value) => onSelectChange(value, 'target_company_size')}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select target size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small (under $5M revenue)</SelectItem>
                        <SelectItem value="medium">Medium ($5M-$50M revenue)</SelectItem>
                        <SelectItem value="large">Large (over $50M revenue)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {formData.buyer_type === 'individual' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="funding_source">Primary Funding Source</Label>
                    <Select
                      value={formData.funding_source}
                      onValueChange={(value) => onSelectChange(value, 'funding_source')}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select funding source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="personal">Personal Funds</SelectItem>
                        <SelectItem value="investors">External Investors</SelectItem>
                        <SelectItem value="bank_loan">Bank Loan</SelectItem>
                        <SelectItem value="sba_loan">SBA Loan</SelectItem>
                        <SelectItem value="combination">Combination</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="needs_loan">SBA/Bank Loan Interest</Label>
                    <Select
                      value={formData.needs_loan}
                      onValueChange={(value) => onSelectChange(value, 'needs_loan')}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select loan interest" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="maybe">Maybe</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ideal_target">Ideal Target Type</Label>
                    <Input
                      id="ideal_target"
                      name="ideal_target"
                      value={formData.ideal_target || ''}
                      onChange={onInputChange}
                      placeholder="e.g. lifestyle business, growth company"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Buyer-specific additional fields */}
            <ProfileSettings
              formData={formData}
              onInputChange={onInputChange}
              onSelectChange={onSelectChange}
              onSetFormData={onSetFormData}
            />
          </div>

          <Separator />

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="ideal_target_description">Ideal Target Description</Label>
              <Textarea
                id="ideal_target_description"
                name="ideal_target_description"
                value={formData.ideal_target_description || ''}
                onChange={onInputChange}
                placeholder="Describe your ideal acquisition target or investment criteria..."
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="business_categories">Business Categories of Interest</Label>
              <MultiCategorySelect
                value={formData.business_categories || []}
                onValueChange={(value) => onSelectChange(value, 'business_categories')}
                placeholder="Select business categories..."
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-2">
                <Label htmlFor="revenue_range_min">Revenue Range (Min)</Label>
                <CurrencyInput
                  id="revenue_range_min"
                  name="revenue_range_min"
                  placeholder="Minimum revenue"
                  value={formData.revenue_range_min || ''}
                  onChange={(value) =>
                    onSetFormData((prev) => ({ ...prev, revenue_range_min: value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="revenue_range_max">Revenue Range (Max)</Label>
                <CurrencyInput
                  id="revenue_range_max"
                  name="revenue_range_max"
                  placeholder="Maximum revenue"
                  value={formData.revenue_range_max || ''}
                  onChange={(value) =>
                    onSetFormData((prev) => ({ ...prev, revenue_range_max: value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="specific_business_search">Specific Business Search</Label>
              <Textarea
                id="specific_business_search"
                name="specific_business_search"
                value={formData.specific_business_search || ''}
                onChange={onInputChange}
                placeholder="Describe any specific types of businesses you're looking for..."
                className="min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Deal Intent</Label>
              <RadioGroup
                value={formData.deal_intent || ''}
                onValueChange={(value) => onSelectChange(value, 'deal_intent')}
              >
                {DEAL_INTENT_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={option.value} id={`dealIntent-${option.value}`} />
                    <Label htmlFor={`dealIntent-${option.value}`} className="text-sm font-normal">
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              <p className="text-sm text-muted-foreground">
                What type of deals are you primarily focused on pursuing?
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="exclusions">Hard Exclusions</Label>
              <ChipInput
                value={formData.exclusions || []}
                onChange={(value) => onSelectChange(value, 'exclusions')}
                placeholder="e.g., unionized, DTC, heavy CapEx"
                maxChips={10}
              />
              <p className="text-sm text-muted-foreground">
                Industries, business models, or characteristics to avoid (e.g., unionized, DTC,
                heavy CapEx).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="include_keywords">Keywords (optional)</Label>
              <ChipInput
                value={formData.include_keywords || []}
                onChange={(value) => onSelectChange(value, 'include_keywords')}
                placeholder="e.g., route-based, B2B services"
                maxChips={5}
              />
              <p className="text-sm text-muted-foreground">
                2-5 keywords you care about (e.g., 'route-based', 'B2B services').
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">About Me / Bio</Label>
              <Textarea
                id="bio"
                name="bio"
                value={formData.bio || ''}
                onChange={onInputChange}
                placeholder="Tell us about yourself and your investment interests..."
                className="min-h-[120px]"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
