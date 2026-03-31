import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signupFormSchema, type SignupFormData, useProtectedAuth } from '@/features/auth';

export const STEPS = [
  'Account Information',
  'Personal Details',
  'Buyer Profile',
  'Investment Criteria',
];

export const useSignupForm = () => {
  const { signup, isLoading } = useProtectedAuth();
  const [currentStep, setCurrentStep] = useState(0);

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupFormSchema as unknown as Parameters<typeof zodResolver>[0]),
    defaultValues: {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      company: '',
      buyerType: 'privateEquity',
    },
  });

  const {
    watch,
    setValue,
    handleSubmit,
    formState: { errors },
  } = form;
  const buyerType = watch('buyerType');

  const onSubmit = async (data: SignupFormData) => {
    try {
      // Transform data to match User interface
      const userData = {
        email: data.email,
        first_name: data.firstName,
        last_name: data.lastName,
        company: data.company,
        website: data.website || '',
        phone_number: data.phone_number || '',
        linkedin_profile: data.linkedinProfile || '',
        buyer_type: data.buyerType,
        ideal_target_description: data.idealTargetDescription,
        business_categories: data.businessCategories,
        target_locations: data.targetLocations,
        revenue_range_min: data.revenueRangeMin,
        revenue_range_max: data.revenueRangeMax,
        specific_business_search: data.specificBusinessSearch,

        // Common fields
        job_title: data.jobTitle,

        // Buyer-specific fields
        estimated_revenue: data.estimatedRevenue,
        fund_size: data.fundSize,
        investment_size: data.investmentSize,
        aum: data.aum,
        is_funded: data.isFunded,
        funded_by: data.fundedBy,
        target_company_size: data.targetCompanySize,
        funding_source: data.fundingSource,
        needs_loan: data.needsLoan,
        ideal_target: data.idealTarget,

        // New PE fields
        portfolio_company_addon: data.portfolioCompanyAddon,
        deploying_capital_now: data.deployingCapitalNow,

        // Corporate fields
        owning_business_unit: data.owningBusinessUnit,
        deal_size_band: data.dealSizeBand,
        integration_plan: data.integrationPlan,
        corpdev_intent: data.corpdevIntent,

        // Family Office fields
        discretion_type: data.discretionType,
        permanent_capital: data.permanentCapital,
        operating_company_targets: data.operatingCompanyTargets,

        // Independent Sponsor fields
        committed_equity_band: data.committedEquityBand,
        equity_source: data.equitySource,
        flex_subxm_ebitda: data.flexSubXmEbitda,
        backers_summary: data.backersSummary,
        deployment_timing: data.deploymentTiming,

        // Search Fund fields
        search_type: data.searchType,
        acq_equity_band: data.acqEquityBand,
        financing_plan: data.financingPlan,
        flex_sub2m_ebitda: data.flexSub2mEbitda,
        anchor_investors_summary: data.anchorInvestorsSummary,
        search_stage: data.searchStage,

        // Advisor fields
        on_behalf_of_buyer: data.onBehalfOfBuyer,
        buyer_role: data.buyerRole,
        buyer_org_url: data.buyerOrgUrl,
        mandate_blurb: data.mandateBlurb,

        // Business Owner fields
        owner_intent: data.ownerIntent,
        owner_timeline: data.ownerTimeline,

        // Individual fields
        max_equity_today_band: data.maxEquityTodayBand,
        uses_bank_finance: data.usesBankFinance,

        // New Step 4 fields
        deal_intent: data.dealIntent,
        exclusions: data.exclusions,
        include_keywords: data.includeKeywords,
      };

      await signup(userData, data.password);
    } catch (error) {
      console.error('Signup error:', error);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return watch('email') && watch('password');
      case 1:
        return watch('firstName') && watch('lastName') && watch('company');
      case 2: {
        const type = watch('buyerType');
        if (!type) return false;

        // Check buyer-specific required fields
        switch (type) {
          case 'searchFund':
            return (
              watch('searchType') &&
              watch('acqEquityBand') &&
              (watch('financingPlan')?.length ?? 0) > 0 &&
              watch('flexSub2mEbitda') !== undefined
            );
          case 'privateEquity':
            return watch('deployingCapitalNow');
          case 'corporate':
            return watch('dealSizeBand');
          case 'familyOffice':
            return watch('discretionType');
          case 'independentSponsor':
            return (
              watch('committedEquityBand') &&
              (watch('equitySource')?.length ?? 0) > 0 &&
              watch('flexSubXmEbitda') !== undefined
            );
          case 'individual':
            return watch('fundingSource') && watch('needsLoan') && watch('idealTarget');
          default:
            return true;
        }
      }
      default:
        return true;
    }
  };

  return {
    form,
    watch,
    setValue,
    handleSubmit,
    errors,
    buyerType,
    currentStep,
    setCurrentStep,
    isLoading,
    onSubmit,
    canProceed,
  };
};
