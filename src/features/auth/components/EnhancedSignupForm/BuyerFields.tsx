import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { MultiSelect } from '@/components/ui/multi-select';
import { type SignupFormData } from '@/features/auth';
import {
  DEPLOYING_CAPITAL_OPTIONS,
  DEAL_SIZE_BAND_OPTIONS,
  INTEGRATION_PLAN_OPTIONS,
  CORPDEV_INTENT_OPTIONS,
  DISCRETION_TYPE_OPTIONS,
  COMMITTED_EQUITY_BAND_OPTIONS,
  EQUITY_SOURCE_OPTIONS,
  DEPLOYMENT_TIMING_OPTIONS,
  SEARCH_TYPE_OPTIONS,
  ACQ_EQUITY_BAND_OPTIONS,
  FINANCING_PLAN_OPTIONS,
  SEARCH_STAGE_OPTIONS,
  ON_BEHALF_OPTIONS,
  BUYER_ROLE_OPTIONS,
  OWNER_TIMELINE_OPTIONS,
  INDIVIDUAL_FUNDING_SOURCE_OPTIONS,
  USES_BANK_FINANCE_OPTIONS,
  MAX_EQUITY_TODAY_OPTIONS
} from '@/lib/signup-field-options';

interface BuyerFieldsProps {
  form: UseFormReturn<SignupFormData>;
  watch: UseFormReturn<SignupFormData>['watch'];
  setValue: UseFormReturn<SignupFormData>['setValue'];
  buyerType: SignupFormData['buyerType'];
}

export const BuyerFields: React.FC<BuyerFieldsProps> = ({ form, watch, setValue, buyerType }) => {
  switch (buyerType) {
    case 'privateEquity':
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="portfolioCompanyAddon">Portfolio Company Add-on (Optional)</Label>
            <Input
              id="portfolioCompanyAddon"
              placeholder="Which portfolio company would this be an add-on to?"
              {...form.register('portfolioCompanyAddon')}
            />
            <p className="text-sm text-muted-foreground mt-1">
              If this acquisition would be an add-on to an existing portfolio company, specify which one.
            </p>
          </div>

          <div>
            <Label htmlFor="deployingCapitalNow">Active deal mandate? *</Label>
            <Select onValueChange={(value) => setValue('deployingCapitalNow', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select deployment status" />
              </SelectTrigger>
              <SelectContent>
                {DEPLOYING_CAPITAL_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              Lets us prioritize buyers who are ready to move on the right opportunity.
            </p>
          </div>

          {/* Existing PE fields */}
          <div>
            <Label htmlFor="fundSize">Fund Size</Label>
            <Input
              id="fundSize"
              placeholder="e.g., $100M - $500M"
              {...form.register('fundSize')}
            />
          </div>
          <div>
            <Label htmlFor="investmentSize">Investment Size</Label>
            <Input
              id="investmentSize"
              placeholder="e.g., $10M - $50M"
              {...form.register('investmentSize')}
            />
          </div>
          <div>
            <Label htmlFor="aum">Assets Under Management</Label>
            <Input
              id="aum"
              placeholder="e.g., $500M - $1B"
              {...form.register('aum')}
            />
          </div>
        </div>
      );

    case 'corporate':
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="owningBusinessUnit">Owning Business Unit / Brand (Optional)</Label>
            <Input
              id="owningBusinessUnit"
              placeholder="Which business unit would own this acquisition?"
              {...form.register('owningBusinessUnit')}
            />
            <p className="text-sm text-muted-foreground mt-1">
              The specific division or brand that would integrate this acquisition.
            </p>
          </div>

          <div>
            <Label htmlFor="dealSizeBand">Deal Size (EV) *</Label>
            <Select onValueChange={(value) => setValue('dealSizeBand', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select deal size range" />
              </SelectTrigger>
              <SelectContent>
                {DEAL_SIZE_BAND_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Integration Plan (Optional)</Label>
            <MultiSelect
              options={INTEGRATION_PLAN_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }))}
              selected={watch('integrationPlan') || []}
              onSelectedChange={(selected) => setValue('integrationPlan', selected)}
              placeholder="Select integration approaches"
            />
            <p className="text-sm text-muted-foreground mt-1">
              How would you integrate this acquisition into your business?
            </p>
          </div>

          <div>
            <Label htmlFor="corpdevIntent">Speed/Intent (Optional)</Label>
            <Select onValueChange={(value) => setValue('corpdevIntent', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select your current intent" />
              </SelectTrigger>
              <SelectContent>
                {CORPDEV_INTENT_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="estimatedRevenue">Estimated Revenue</Label>
            <Input
              id="estimatedRevenue"
              placeholder="e.g., $100M - $500M"
              {...form.register('estimatedRevenue')}
            />
          </div>
        </div>
      );

    case 'familyOffice':
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="discretionType">Your role in the deal decision *</Label>
            <Select onValueChange={(value) => setValue('discretionType', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select decision authority" />
              </SelectTrigger>
              <SelectContent>
                {DISCRETION_TYPE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              Helps us route introductions to the right person at your firm.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="permanentCapital"
              checked={watch('permanentCapital') || false}
              onCheckedChange={(checked) => setValue('permanentCapital', checked as boolean)}
            />
            <Label htmlFor="permanentCapital">Permanent Capital</Label>
            <p className="text-sm text-muted-foreground">
              Check if you have permanent capital structure
            </p>
          </div>

          <div>
            <Label>Operating Company Targets (Optional)</Label>
            <MultiSelect
              options={[]}
              selected={watch('operatingCompanyTargets') || []}
              onSelectedChange={(selected) => setValue('operatingCompanyTargets', selected)}
              placeholder="Add operating companies this would add onto"
              maxSelected={3}
            />
            <p className="text-sm text-muted-foreground mt-1">
              If you have an operating company this would add onto, name it (max 3).
            </p>
          </div>

          {/* Existing Family Office fields */}
          <div>
            <Label htmlFor="fundSize">Fund Size</Label>
            <Input
              id="fundSize"
              placeholder="e.g., $50M - $100M"
              {...form.register('fundSize')}
            />
          </div>
          <div>
            <Label htmlFor="investmentSize">Investment Size</Label>
            <Input
              id="investmentSize"
              placeholder="e.g., $5M - $25M"
              {...form.register('investmentSize')}
            />
          </div>
          <div>
            <Label htmlFor="aum">Assets Under Management</Label>
            <Input
              id="aum"
              placeholder="e.g., $100M - $500M"
              {...form.register('aum')}
            />
          </div>
        </div>
      );

    case 'independentSponsor':
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="committedEquityBand">Committed Equity Available Today *</Label>
            <Select onValueChange={(value) => setValue('committedEquityBand', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select equity available" />
              </SelectTrigger>
              <SelectContent>
                {COMMITTED_EQUITY_BAND_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              How much equity do you have committed and available today?
            </p>
          </div>

          <div>
            <Label>Source of Equity *</Label>
            <MultiSelect
              options={EQUITY_SOURCE_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }))}
              selected={watch('equitySource') || []}
              onSelectedChange={(selected) => setValue('equitySource', selected)}
              placeholder="Select all that apply"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Where does your equity come from? Select all that apply.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="flexSubXmEbitda"
              checked={watch('flexSubXmEbitda') === true}
              onCheckedChange={(checked) => setValue('flexSubXmEbitda', checked === true)}
            />
            <Label htmlFor="flexSubXmEbitda">Flexible on size? *</Label>
            <p className="text-sm text-muted-foreground">
              Can you pursue opportunities with lower EBITDA?
            </p>
          </div>

          <div>
            <Label htmlFor="backersSummary">Representative Backers (Optional)</Label>
            <Input
              id="backersSummary"
              placeholder="e.g., Smith Capital; Oak Family Office"
              {...form.register('backersSummary')}
            />
            <p className="text-sm text-muted-foreground mt-1">
              One line summary of your key backers or investors.
            </p>
          </div>

          <div>
            <Label htmlFor="deploymentTiming">Readiness Window (Optional)</Label>
            <Select onValueChange={(value) => setValue('deploymentTiming', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select readiness timeline" />
              </SelectTrigger>
              <SelectContent>
                {DEPLOYMENT_TIMING_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case 'searchFund':
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="searchType">Search Type *</Label>
            <Select onValueChange={(value) => setValue('searchType', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select search type" />
              </SelectTrigger>
              <SelectContent>
                {SEARCH_TYPE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              Are you running a traditional search fund with committed investors or self-funded?
            </p>
          </div>

          <div>
            <Label htmlFor="acqEquityBand">Equity Available for Acquisition at Close *</Label>
            <Select onValueChange={(value) => setValue('acqEquityBand', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select equity available" />
              </SelectTrigger>
              <SelectContent>
                {ACQ_EQUITY_BAND_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Financing Plan *</Label>
            <MultiSelect
              options={FINANCING_PLAN_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }))}
              selected={watch('financingPlan') || []}
              onSelectedChange={(selected) => setValue('financingPlan', selected)}
              placeholder="Select all that apply"
            />
            <p className="text-sm text-muted-foreground mt-1">
              What financing structures are you considering? Select all that apply.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="flexSub2mEbitda"
              checked={watch('flexSub2mEbitda') === true}
              onCheckedChange={(checked) => setValue('flexSub2mEbitda', checked === true)}
            />
            <Label htmlFor="flexSub2mEbitda">Flexible on size? (can pursue less than $2M EBITDA) *</Label>
          </div>

          <div>
            <Label htmlFor="anchorInvestorsSummary">Anchor Investors / Committed Backers (Optional)</Label>
            <Input
              id="anchorInvestorsSummary"
              placeholder="e.g., XYZ Capital; ABC Family Office"
              {...form.register('anchorInvestorsSummary')}
            />
            <p className="text-sm text-muted-foreground mt-1">
              One line summary of your committed investors or backers.
            </p>
          </div>

          <div>
            <Label htmlFor="searchStage">Stage of Search (Optional)</Label>
            <Select onValueChange={(value) => setValue('searchStage', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select current stage" />
              </SelectTrigger>
              <SelectContent>
                {SEARCH_STAGE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case 'advisor':
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="onBehalfOfBuyer">Are you inquiring on behalf of a capitalized buyer with discretion? *</Label>
            <Select onValueChange={(value) => setValue('onBehalfOfBuyer', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select yes or no" />
              </SelectTrigger>
              <SelectContent>
                {ON_BEHALF_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {watch('onBehalfOfBuyer') === 'yes' && (
            <>
              <div>
                <Label htmlFor="buyerRole">Buyer Role *</Label>
                <Select onValueChange={(value) => setValue('buyerRole', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select buyer role" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUYER_ROLE_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="buyerOrgUrl">Buyer Organization Website *</Label>
                <Input
                  id="buyerOrgUrl"
                  type="url"
                  placeholder="https://example.com"
                  {...form.register('buyerOrgUrl')}
                />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="mandateBlurb">Mandate in One Line (≤140 chars, Optional)</Label>
            <Textarea
              id="mandateBlurb"
              placeholder="Brief description of your mandate or focus"
              maxLength={140}
              {...form.register('mandateBlurb')}
            />
          </div>
        </div>
      );

    case 'businessOwner':
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="ownerIntent">Why are you here? (≤140 chars) *</Label>
            <Textarea
              id="ownerIntent"
              placeholder="e.g., Valuation, Open to intros"
              maxLength={140}
              {...form.register('ownerIntent')}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Brief explanation of what you're looking for.
            </p>
          </div>

          <div>
            <Label htmlFor="ownerTimeline">Timeline *</Label>
            <Select onValueChange={(value) => setValue('ownerTimeline', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select timeline" />
              </SelectTrigger>
              <SelectContent>
                {OWNER_TIMELINE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case 'individual':
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="fundingSource">Funding Source *</Label>
            <Select onValueChange={(value) => setValue('fundingSource', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select funding source" />
              </SelectTrigger>
              <SelectContent>
                {INDIVIDUAL_FUNDING_SOURCE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="needsLoan">Do you need a loan? *</Label>
            <Select onValueChange={(value) => setValue('needsLoan', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select yes or no" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="usesBankFinance">Will you use SBA/bank financing?</Label>
            <Select onValueChange={(value) => setValue('usesBankFinance', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select yes, no, or not sure" />
              </SelectTrigger>
              <SelectContent>
                {USES_BANK_FINANCE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="maxEquityTodayBand">Max Equity You Can Commit Today (Optional)</Label>
            <Select onValueChange={(value) => setValue('maxEquityTodayBand', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select equity range" />
              </SelectTrigger>
              <SelectContent>
                {MAX_EQUITY_TODAY_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="idealTarget">Ideal Target *</Label>
            <Textarea
              id="idealTarget"
              placeholder="Describe your ideal acquisition target"
              {...form.register('idealTarget')}
            />
          </div>
        </div>
      );

    default:
      return null;
  }
};
