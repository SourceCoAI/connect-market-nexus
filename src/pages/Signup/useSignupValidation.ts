import { isValidUrlFormat, isValidLinkedInFormat } from '@/lib/url-utils';
import { parseCurrency } from '@/lib/currency-utils';
import { REVENUE_RANGES } from '@/lib/currency-ranges';
import type { SignupFormData } from './types';

export function validateStep(currentStep: number, formData: SignupFormData): string[] {
  const errors: string[] = [];

  switch (currentStep) {
    case 0: {
      if (!formData.email) errors.push('Email is required');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
        errors.push('Please enter a valid email address');
      if (!formData.password) errors.push('Password is required');
      else if (formData.password.length < 8) errors.push('Password must be at least 8 characters');
      if (formData.password !== formData.confirmPassword) errors.push('Passwords do not match');
      break;
    }
    case 1: {
      if (!formData.firstName) errors.push('First name is required');
      if (!formData.lastName) errors.push('Last name is required');
      if (!formData.company) errors.push('Company name is required');
      if (!formData.phoneNumber) errors.push('Phone number is required');
      if (!formData.website && !formData.linkedinProfile)
        errors.push('Please provide at least a website or LinkedIn profile so we can verify your credibility');
      if (formData.website && !isValidUrlFormat(formData.website))
        errors.push('Please enter a valid website URL');
      if (formData.linkedinProfile && !isValidLinkedInFormat(formData.linkedinProfile))
        errors.push('Please enter a valid LinkedIn URL');
      break;
    }
    case 2:
      break; // Referral source - optional
    case 3: {
      if (!formData.buyerType) {
        errors.push('Please select a buyer type');
        break;
      }
      switch (formData.buyerType) {
        case 'corporate':
          if (!formData.estimatedRevenue) errors.push('Estimated revenue is required');
          if (!formData.dealSizeBand) errors.push('Deal size (EV) is required');
          break;
        case 'privateEquity':
          if (!formData.fundSize) errors.push('Fund size is required');
          if (!formData.deployingCapitalNow) errors.push('Deploying capital status is required');
          break;
        case 'familyOffice':
          if (!formData.fundSize) errors.push('Fund size is required');
          if (!formData.discretionType) errors.push('Decision authority is required');
          break;
        case 'searchFund':
          if (!formData.searchType) errors.push('Search type is required');
          if (!formData.acqEquityBand) errors.push('Equity available for acquisition is required');
          if (!formData.financingPlan || formData.financingPlan.length === 0)
            errors.push('At least one financing plan option is required');
          if (formData.flexSub2mEbitda === undefined)
            errors.push("Please specify if you're flexible on size");
          break;
        case 'individual':
          if (!formData.fundingSource) errors.push('Funding source is required');
          if (!formData.usesBank) errors.push("Please specify if you'll use SBA/bank financing");
          break;
        case 'independentSponsor':
          if (!formData.committedEquityBand) errors.push('Committed equity amount is required');
          if (!formData.equitySource || formData.equitySource.length === 0)
            errors.push('At least one equity source is required');
          if (formData.flexSubxmEbitda === undefined)
            errors.push("Please specify if you're flexible on size");
          break;
        case 'advisor':
          if (!formData.onBehalfOfBuyer)
            errors.push("Please specify if you're representing a buyer");
          if (formData.onBehalfOfBuyer === 'yes') {
            if (!formData.buyerRole) errors.push('Buyer role is required');
            if (!formData.buyerOrgUrl) errors.push('Buyer organization website is required');
            else if (!isValidUrlFormat(formData.buyerOrgUrl))
              errors.push('Please enter a valid buyer organization website');
          }
          if (formData.onBehalfOfBuyer === 'no') {
            if (!formData.mandateBlurb?.trim())
              errors.push('Please describe your sourcing mandate');
          }
          break;
        case 'businessOwner':
          if (!formData.ownerIntent) errors.push("Please describe why you're here");
          break;
      }
      break;
    }
    case 4: {
      // Step 4 is fully optional — buyers can complete their profile after approval.
      // Only validate fields that the user has started filling in.
      const hasAnyProfileData =
        formData.idealTargetDescription.trim() ||
        formData.businessCategories.length > 0 ||
        formData.targetLocations.length > 0;
      if (!hasAnyProfileData) break; // Allow empty submission (skip)
      if (formData.idealTargetDescription.trim() && formData.idealTargetDescription.length < 10)
        errors.push('Please provide at least 10 characters describing your ideal targets');
      if (formData.idealTargetDescription.trim() && formData.businessCategories.length === 0)
        errors.push('Please select at least one business category');
      if (formData.idealTargetDescription.trim() && formData.targetLocations.length === 0)
        errors.push('Please select at least one target location');
      if (formData.revenueRangeMin && formData.revenueRangeMax) {
        const minIdx = REVENUE_RANGES.findIndex((r) => r.value === formData.revenueRangeMin);
        const maxIdx = REVENUE_RANGES.findIndex((r) => r.value === formData.revenueRangeMax);
        if (minIdx !== -1 && maxIdx !== -1 && minIdx >= maxIdx)
          errors.push('Maximum revenue must be greater than minimum revenue');
      }
      if (formData.buyerType === 'independentSponsor') {
        if (formData.targetDealSizeMin && formData.targetDealSizeMax) {
          const min = parseCurrency(formData.targetDealSizeMin);
          const max = parseCurrency(formData.targetDealSizeMax);
          if (min >= max) errors.push('Maximum deal size must be greater than minimum deal size');
        }
      }
      break;
    }
  }

  return errors;
}
