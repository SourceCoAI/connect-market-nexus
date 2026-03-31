import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnhancedCurrencyInput } from "@/components/ui/enhanced-currency-input";
import { InvestmentSizeSelect } from "@/components/ui/investment-size-select";
import { ChipInput } from "@/components/ui/chip-input";
import { FIELD_HELPERS } from "@/lib/field-helpers";
import {
  DEPLOYING_CAPITAL_OPTIONS, DEAL_SIZE_BAND_OPTIONS, INTEGRATION_PLAN_OPTIONS,
  CORPDEV_INTENT_OPTIONS, DISCRETION_TYPE_OPTIONS, COMMITTED_EQUITY_BAND_OPTIONS,
  EQUITY_SOURCE_OPTIONS, DEPLOYMENT_TIMING_OPTIONS, SEARCH_TYPE_OPTIONS,
  ACQ_EQUITY_BAND_OPTIONS, FINANCING_PLAN_OPTIONS, SEARCH_STAGE_OPTIONS,
  ON_BEHALF_OPTIONS, BUYER_ROLE_OPTIONS, OWNER_TIMELINE_OPTIONS,
  INDIVIDUAL_FUNDING_SOURCE_OPTIONS, USES_BANK_FINANCE_OPTIONS, MAX_EQUITY_TODAY_OPTIONS,
} from "@/lib/signup-field-options";
import type { SignupFormData } from "./types";
import { BUYER_TYPE_OPTIONS } from "./types";
import { BuyerType } from "@/types";

interface Props {
  formData: SignupFormData;
  setFormData: React.Dispatch<React.SetStateAction<SignupFormData>>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function SignupStepBuyerType({ formData, setFormData, onChange }: Props) {
  const handleBuyerTypeChange = (value: string) => {
    setFormData((prev) => ({
      ...prev, buyerType: value as BuyerType,
      // Reset all buyer-type-specific fields when switching types
      estimatedRevenue: "", fundSize: "", investmentSize: [] as string[], aum: "",
      isFunded: "", fundedBy: "", targetCompanySize: "", fundingSource: "",
      needsLoan: "", idealTarget: "", targetDealSizeMin: "", targetDealSizeMax: "",
      // Corporate
      owningBusinessUnit: "", dealSizeBand: "", integrationPlan: [] as string[], corpdevIntent: "",
      // PE
      portfolioCompanyAddon: "", deployingCapitalNow: "",
      // Family Office
      discretionType: "", permanentCapital: false, operatingCompanyTargets: [] as string[],
      // Search Fund
      searchType: "", acqEquityBand: "", financingPlan: [] as string[],
      flexSub2mEbitda: undefined, anchorInvestorsSummary: "", searchStage: "",
      // Individual
      usesBank: "", maxEquityToday: "",
      // Independent Sponsor
      committedEquityBand: "", equitySource: [] as string[],
      flexSubxmEbitda: undefined, backersSummary: "", deploymentTiming: "",
      // Advisor
      onBehalfOfBuyer: "", buyerRole: "", buyerOrgUrl: "", mandateBlurb: "",
      // Business Owner
      ownerIntent: "", ownerTimeline: "",
    }));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="buyerType" className="text-xs text-muted-foreground">Type of Buyer</Label>
        <Select onValueChange={handleBuyerTypeChange} value={formData.buyerType}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent>
            {BUYER_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {formData.buyerType === "corporate" && (
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Estimated Revenue</Label>
            <EnhancedCurrencyInput value={formData.estimatedRevenue} onChange={(value) => setFormData(p => ({ ...p, estimatedRevenue: value }))} fieldType="revenue" currencyMode="millions" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Business Unit</Label>
            <Input id="owningBusinessUnit" name="owningBusinessUnit" placeholder="e.g., Digital Services Division" value={formData.owningBusinessUnit || ""} onChange={onChange} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Deal Size (EV)</Label>
            <Select value={formData.dealSizeBand || ""} onValueChange={(v) => setFormData(p => ({ ...p, dealSizeBand: v }))}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{DEAL_SIZE_BAND_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Integration Plan</Label>
            <div className="grid grid-cols-2 gap-2">
              {INTEGRATION_PLAN_OPTIONS.map(o => (
                <div key={o.value} className="flex items-center space-x-2">
                  <Checkbox id={`integration-${o.value}`} checked={(formData.integrationPlan || []).includes(o.value)} onCheckedChange={(checked) => { const c = formData.integrationPlan || []; setFormData(p => ({ ...p, integrationPlan: checked ? [...c, o.value] : c.filter(i => i !== o.value) })); }} />
                  <Label htmlFor={`integration-${o.value}`} className="text-xs font-normal">{o.label}</Label>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Speed/Intent</Label>
            <Select value={formData.corpdevIntent || ""} onValueChange={(v) => setFormData(p => ({ ...p, corpdevIntent: v }))}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{CORPDEV_INTENT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )}

      {formData.buyerType === "privateEquity" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Fund Size</Label>
            <EnhancedCurrencyInput value={formData.fundSize} onChange={(v) => setFormData(p => ({ ...p, fundSize: v }))} fieldType="fund" currencyMode="millions" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{FIELD_HELPERS.investmentSize.label}</Label>
            <InvestmentSizeSelect value={formData.investmentSize} onValueChange={(v) => setFormData(p => ({ ...p, investmentSize: v }))} placeholder="Select investment size ranges..." multiSelect={true} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Assets Under Management</Label>
            <EnhancedCurrencyInput value={formData.aum} onChange={(v) => setFormData(p => ({ ...p, aum: v }))} fieldType="aum" currencyMode="millions" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Portfolio company add-on</Label>
            <Input id="portfolioCompanyAddon" name="portfolioCompanyAddon" placeholder="e.g., ABC Manufacturing Co." value={formData.portfolioCompanyAddon || ""} onChange={onChange} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Deploying capital now?</Label>
            <Select value={formData.deployingCapitalNow || ""} onValueChange={(v) => setFormData(p => ({ ...p, deployingCapitalNow: v }))}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{DEPLOYING_CAPITAL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )}

      {formData.buyerType === "familyOffice" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Fund Size</Label>
            <EnhancedCurrencyInput value={formData.fundSize} onChange={(v) => setFormData(p => ({ ...p, fundSize: v }))} fieldType="fund" currencyMode="millions" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{FIELD_HELPERS.investmentSize.label}</Label>
            <InvestmentSizeSelect value={formData.investmentSize} onValueChange={(v) => setFormData(p => ({ ...p, investmentSize: v }))} placeholder="Select investment size ranges..." multiSelect={true} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Assets Under Management</Label>
            <EnhancedCurrencyInput value={formData.aum} onChange={(v) => setFormData(p => ({ ...p, aum: v }))} fieldType="aum" currencyMode="millions" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Decision authority</Label>
            <Select value={formData.discretionType || ""} onValueChange={(v) => setFormData(p => ({ ...p, discretionType: v }))}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{DISCRETION_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="permanentCapital" checked={formData.permanentCapital || false} onCheckedChange={(checked) => setFormData(p => ({ ...p, permanentCapital: checked as boolean }))} />
            <Label htmlFor="permanentCapital" className="text-xs font-normal">Permanent capital</Label>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Operating company add-ons</Label>
            <ChipInput value={formData.operatingCompanyTargets || []} onChange={(companies) => setFormData(p => ({ ...p, operatingCompanyTargets: companies.slice(0, 3) }))} placeholder="Enter company name and press Enter" />
          </div>
        </div>
      )}

      {formData.buyerType === "searchFund" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Search type</Label>
            <Select value={formData.searchType || ""} onValueChange={(v) => setFormData(p => ({ ...p, searchType: v }))}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{SEARCH_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Equity available at close</Label>
            <Select value={formData.acqEquityBand || ""} onValueChange={(v) => setFormData(p => ({ ...p, acqEquityBand: v }))}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{ACQ_EQUITY_BAND_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Financing plan</Label>
            <div className="grid grid-cols-2 gap-2">
              {FINANCING_PLAN_OPTIONS.map(o => (
                <div key={o.value} className="flex items-center space-x-2">
                  <Checkbox id={`financing-${o.value}`} checked={(formData.financingPlan || []).includes(o.value)} onCheckedChange={(checked) => { const c = formData.financingPlan || []; setFormData(p => ({ ...p, financingPlan: checked ? [...c, o.value] : c.filter(i => i !== o.value) })); }} />
                  <Label htmlFor={`financing-${o.value}`} className="text-xs font-normal">{o.label}</Label>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="flexSub2mEbitda" checked={formData.flexSub2mEbitda || false} onCheckedChange={(checked) => setFormData(p => ({ ...p, flexSub2mEbitda: checked as boolean }))} />
            <Label htmlFor="flexSub2mEbitda" className="text-xs font-normal">Flexible on size? (can pursue &lt; $2M EBITDA)</Label>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Anchor investors / backers</Label>
            <Input id="anchorInvestorsSummary" name="anchorInvestorsSummary" placeholder="e.g., XYZ Capital; ABC Family Office" value={formData.anchorInvestorsSummary || ""} onChange={onChange} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Stage of search</Label>
            <Select value={formData.searchStage || ""} onValueChange={(v) => setFormData(p => ({ ...p, searchStage: v }))}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{SEARCH_STAGE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )}

      {formData.buyerType === "individual" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Funding source</Label>
            <Select value={formData.fundingSource} onValueChange={(v) => setFormData(p => ({ ...p, fundingSource: v }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{INDIVIDUAL_FUNDING_SOURCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Will you use SBA/bank financing?</Label>
            <Select value={formData.usesBank || ""} onValueChange={(v) => setFormData(p => ({ ...p, usesBank: v }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{USES_BANK_FINANCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Max equity you can commit today</Label>
            <Select value={formData.maxEquityToday || ""} onValueChange={(v) => setFormData(p => ({ ...p, maxEquityToday: v }))}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{MAX_EQUITY_TODAY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )}

      {formData.buyerType === "independentSponsor" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Committed equity available</Label>
            <Select value={formData.committedEquityBand || ""} onValueChange={(v) => setFormData(p => ({ ...p, committedEquityBand: v }))}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{COMMITTED_EQUITY_BAND_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Source of equity</Label>
            <div className="grid grid-cols-2 gap-2">
              {EQUITY_SOURCE_OPTIONS.map(o => (
                <div key={o.value} className="flex items-center space-x-2">
                  <Checkbox id={`equity-source-${o.value}`} checked={(formData.equitySource || []).includes(o.value)} onCheckedChange={(checked) => { const c = formData.equitySource || []; setFormData(p => ({ ...p, equitySource: checked ? [...c, o.value] : c.filter(i => i !== o.value) })); }} />
                  <Label htmlFor={`equity-source-${o.value}`} className="text-xs font-normal">{o.label}</Label>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="flexSubxmEbitda" checked={formData.flexSubxmEbitda || false} onCheckedChange={(checked) => setFormData(p => ({ ...p, flexSubxmEbitda: checked as boolean }))} />
            <Label htmlFor="flexSubxmEbitda" className="text-xs font-normal">Flexible on size?</Label>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Representative backers</Label>
            <Input id="backersSummary" name="backersSummary" placeholder="e.g., Smith Capital; Oak Family Office" value={formData.backersSummary || ""} onChange={onChange} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Readiness window</Label>
            <Select value={formData.deploymentTiming || ""} onValueChange={(v) => setFormData(p => ({ ...p, deploymentTiming: v }))}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{DEPLOYMENT_TIMING_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )}

      {formData.buyerType === "advisor" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Inquiring on behalf of a capitalized buyer?</Label>
            <Select value={formData.onBehalfOfBuyer || ""} onValueChange={(v) => setFormData(p => ({ ...p, onBehalfOfBuyer: v }))}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{ON_BEHALF_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {formData.onBehalfOfBuyer === "yes" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Buyer role</Label>
                <Select value={formData.buyerRole || ""} onValueChange={(v) => setFormData(p => ({ ...p, buyerRole: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{BUYER_ROLE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Buyer organization website</Label>
                <Input id="buyerOrgUrl" name="buyerOrgUrl" type="url" placeholder="https://www.buyercompany.com" value={formData.buyerOrgUrl || ""} onChange={onChange} />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Mandate in one line ({"\u2264"}140 chars)</Label>
            <Input id="mandateBlurb" name="mandateBlurb" placeholder="e.g., Lower middle market tech services add-ons for PE portfolio" maxLength={140} value={formData.mandateBlurb || ""} onChange={onChange} />
          </div>
        </div>
      )}

      {formData.buyerType === "businessOwner" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Why are you here? ({"\u2264"}140 chars)</Label>
            <Input id="ownerIntent" name="ownerIntent" placeholder="e.g., &quot;Valuation&quot;, &quot;Open to intros&quot;" maxLength={140} value={formData.ownerIntent || ""} onChange={onChange} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Timeline</Label>
            <Select value={formData.ownerTimeline || ""} onValueChange={(v) => setFormData(p => ({ ...p, ownerTimeline: v }))}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{OWNER_TIMELINE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
