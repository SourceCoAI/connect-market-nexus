import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { BuyerType, User } from '@/types';
import { processUrl, processLinkedInUrl } from '@/lib/url-utils';
import { parseCurrency } from '@/lib/currency-utils';
import type { SignupFormData } from './types';

export function useSignupSubmit(formData: SignupFormData) {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async () => {
    const {
      firstName,
      lastName,
      email,
      company,
      website,
      linkedinProfile,
      phoneNumber,
      buyerType,
      estimatedRevenue,
      fundSize,
      investmentSize,
      aum,
      isFunded,
      fundedBy,
      targetCompanySize,
      fundingSource,
      needsLoan,
      idealTarget,
      idealTargetDescription,
      businessCategories,
      targetLocations,
      revenueRangeMin,
      revenueRangeMax,
      specificBusinessSearch,
      targetDealSizeMin,
      targetDealSizeMax,
    } = formData;

    const signupData: Partial<User> = {
      first_name: firstName,
      last_name: lastName,
      email,
      company,
      website: processUrl(website),
      linkedin_profile: processLinkedInUrl(linkedinProfile),
      phone_number: phoneNumber,
      buyer_type: (buyerType === 'businessOwner' ? 'searchFund' : buyerType) as BuyerType,
      ideal_target_description: idealTargetDescription,
      business_categories: businessCategories,
      target_locations: targetLocations,
      revenue_range_min: revenueRangeMin || undefined,
      revenue_range_max: revenueRangeMax || undefined,
      specific_business_search: specificBusinessSearch,
      job_title: formData.jobTitle || '',
      estimated_revenue: estimatedRevenue,
      fund_size: fundSize,
      investment_size: investmentSize || [],
      aum,
      is_funded: isFunded,
      funded_by: fundedBy,
      target_company_size: targetCompanySize,
      funding_source: fundingSource,
      needs_loan: needsLoan,
      ideal_target: idealTarget,
      deploying_capital_now: formData.deployingCapitalNow || '',
      owning_business_unit: formData.owningBusinessUnit || '',
      deal_size_band: formData.dealSizeBand || '',
      buyer_org_url: formData.buyerOrgUrl ? processUrl(formData.buyerOrgUrl) : '',
      integration_plan: formData.integrationPlan || [],
      corpdev_intent: formData.corpdevIntent || '',
      discretion_type: formData.discretionType || '',
      committed_equity_band: formData.committedEquityBand || '',
      equity_source: formData.equitySource || [],
      deployment_timing: formData.deploymentTiming || '',
      target_deal_size_min: targetDealSizeMin ? parseCurrency(targetDealSizeMin) : undefined,
      target_deal_size_max: targetDealSizeMax ? parseCurrency(targetDealSizeMax) : undefined,
      geographic_focus: targetLocations || [],
      industry_expertise: [],
      permanent_capital: formData.permanentCapital || false,
      operating_company_targets: formData.operatingCompanyTargets || [],
      flex_subxm_ebitda: formData.flexSubxmEbitda || false,
      search_type: formData.searchType || '',
      acq_equity_band: formData.acqEquityBand || '',
      financing_plan: formData.financingPlan || [],
      search_stage: formData.searchStage || '',
      flex_sub2m_ebitda: formData.flexSub2mEbitda || false,
      on_behalf_of_buyer: formData.onBehalfOfBuyer || '',
      buyer_role: formData.buyerRole || '',
      owner_timeline: formData.ownerTimeline || '',
      owner_intent: formData.ownerIntent || '',
      uses_bank_finance: formData.usesBank || '',
      max_equity_today_band: formData.maxEquityToday || '',
      mandate_blurb: formData.mandateBlurb || '',
      portfolio_company_addon: formData.portfolioCompanyAddon || '',
      backers_summary: formData.backersSummary || '',
      anchor_investors_summary: formData.anchorInvestorsSummary || '',
      deal_intent: formData.dealIntent || '',
      exclusions: formData.exclusions || [],
      include_keywords: formData.includeKeywords || [],
      referral_source: formData.referralSource || '',
      referral_source_detail: formData.referralSourceDetail || '',
      deal_sourcing_methods: formData.dealSourcingMethods || [],
      target_acquisition_volume: formData.targetAcquisitionVolume || '',
    };

    // GAP C fix: Encode deal attribution into referral_source_detail (existing column)
    // since signup_metadata/from_deal_id don't exist on profiles table
    try {
      const dealContextStr = localStorage.getItem('sourceco_signup_deal_context');
      if (dealContextStr) {
        const dealContext = JSON.parse(dealContextStr);
        const existingDetail = signupData.referral_source_detail || '';
        const dealAttribution = [
          dealContext.from_deal_id ? `deal:${dealContext.from_deal_id}` : '',
          dealContext.first_deal_viewed ? `first:${dealContext.first_deal_viewed}` : '',
          dealContext.is_landing_page_referral ? 'landing_page_referral' : '',
        ]
          .filter(Boolean)
          .join('|');
        if (dealAttribution) {
          signupData.referral_source_detail = existingDetail
            ? `${existingDetail} [${dealAttribution}]`
            : dealAttribution;
        }
        if (!signupData.referral_source) {
          signupData.referral_source = 'deal_landing_page';
        }
      }
    } catch {
      /* ignore */
    }

    await signup(signupData, formData.password);

    // Clean up deal context after successful signup
    try {
      localStorage.removeItem('sourceco_signup_deal_context');
      localStorage.removeItem('sourceco_first_deal_viewed');
      localStorage.removeItem('sourceco_last_deal_viewed');
      localStorage.removeItem('sourceco_last_deal_title');
    } catch {
      /* ignore */
    }

    toast({
      title: 'Account created successfully!',
      description: 'Please check your email to verify your account.',
    });
    navigate(`/signup-success?email=${encodeURIComponent(formData.email)}`);
  };

  return { handleSubmit };
}
