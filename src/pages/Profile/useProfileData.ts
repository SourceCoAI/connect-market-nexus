import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@/types';
import { standardizeCategories, standardizeLocations } from '@/lib/standardization';
import {
  processUrl,
  isValidUrlFormat,
  isValidLinkedInFormat,
  processLinkedInUrl,
} from '@/lib/url-utils';
import type { ProfileFormData } from './types';

export function useProfileData() {
  const { user, updateUserProfile } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [formData, setFormData] = useState<ProfileFormData>({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    company: user?.company || '',
    website: user?.website || '',
    linkedin_profile: user?.linkedin_profile || '',
    phone_number: user?.phone_number || '',
    buyer_type: user?.buyer_type || 'corporate',
    bio: user?.bio || '',
    ideal_target_description: user?.ideal_target_description || '',
    business_categories: user?.business_categories || [],
    target_locations: Array.isArray(user?.target_locations) ? user.target_locations : [],
    revenue_range_min: user?.revenue_range_min || undefined,
    revenue_range_max: user?.revenue_range_max || undefined,
    specific_business_search: user?.specific_business_search || '',
    investment_size: Array.isArray(user?.investment_size)
      ? user.investment_size
      : user?.investment_size
        ? [user.investment_size]
        : [],
    fund_size: user?.fund_size || '',
    aum: user?.aum || '',
    estimated_revenue: user?.estimated_revenue || '',
    is_funded: user?.is_funded || '',
    funded_by: user?.funded_by || '',
    target_company_size: user?.target_company_size || '',
    funding_source: user?.funding_source || '',
    needs_loan: user?.needs_loan || '',
    ideal_target: user?.ideal_target || '',
    job_title: user?.job_title || '',
    deploying_capital_now: user?.deploying_capital_now || '',
    owning_business_unit: user?.owning_business_unit || '',
    deal_size_band: user?.deal_size_band || '',
    buyer_org_url: user?.buyer_org_url || '',
    integration_plan: user?.integration_plan || [],
    corpdev_intent: user?.corpdev_intent || '',
    discretion_type: user?.discretion_type || '',
    committed_equity_band: user?.committed_equity_band || '',
    equity_source: user?.equity_source || [],
    deployment_timing: user?.deployment_timing || '',
    target_deal_size_min: user?.target_deal_size_min ?? undefined,
    target_deal_size_max: user?.target_deal_size_max ?? undefined,
    geographic_focus: user?.geographic_focus || [],
    industry_expertise: user?.industry_expertise || [],
    deal_structure_preference: user?.deal_structure_preference || '',
    permanent_capital: user?.permanent_capital || false,
    operating_company_targets: user?.operating_company_targets || [],
    flex_subxm_ebitda: user?.flex_subxm_ebitda || false,
    search_type: user?.search_type || '',
    acq_equity_band: user?.acq_equity_band || '',
    financing_plan: user?.financing_plan || [],
    search_stage: user?.search_stage || '',
    flex_sub2m_ebitda: user?.flex_sub2m_ebitda || false,
    on_behalf_of_buyer: user?.on_behalf_of_buyer || '',
    buyer_role: user?.buyer_role || '',
    owner_timeline: user?.owner_timeline || '',
    owner_intent: user?.owner_intent || '',
    uses_bank_finance: user?.uses_bank_finance || '',
    max_equity_today_band: user?.max_equity_today_band || '',
    mandate_blurb: user?.mandate_blurb || '',
    portfolio_company_addon: user?.portfolio_company_addon || '',
    backers_summary: user?.backers_summary || '',
    anchor_investors_summary: user?.anchor_investors_summary || '',
    deal_intent: user?.deal_intent || '',
    exclusions: user?.exclusions || [],
    include_keywords: user?.include_keywords || [],
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (value: string | string[] | boolean, name: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLocationChange = (values: string[]) => {
    setFormData((prev) => ({ ...prev, target_locations: values }));
  };

  const handleProfileUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    if (formData.website && !isValidUrlFormat(formData.website)) {
      toast({
        variant: 'destructive',
        title: 'Invalid website',
        description: 'Please enter a valid website URL (e.g., example.com)',
      });
      return;
    }
    if (formData.linkedin_profile && !isValidLinkedInFormat(formData.linkedin_profile)) {
      toast({
        variant: 'destructive',
        title: 'Invalid LinkedIn URL',
        description: 'Please enter a valid LinkedIn URL (e.g., linkedin.com/in/yourname)',
      });
      return;
    }
    if (formData.buyer_org_url && !isValidUrlFormat(formData.buyer_org_url)) {
      toast({
        variant: 'destructive',
        title: 'Invalid organization URL',
        description: 'Please enter a valid URL (e.g., company.com)',
      });
      return;
    }

    setIsLoading(true);
    try {
      const normalizedData = {
        ...formData,
        website: formData.website ? processUrl(formData.website) : formData.website,
        linkedin_profile: formData.linkedin_profile
          ? processLinkedInUrl(formData.linkedin_profile)
          : formData.linkedin_profile,
        buyer_org_url: formData.buyer_org_url
          ? processUrl(formData.buyer_org_url)
          : formData.buyer_org_url,
        flex_subxm_ebitda: formData.flex_subxm_ebitda ?? null,
        revenue_range_min: formData.revenue_range_min || null,
        revenue_range_max: formData.revenue_range_max || null,
        business_categories: formData.business_categories
          ? standardizeCategories(formData.business_categories)
          : [],
        target_locations: formData.target_locations
          ? standardizeLocations(
              Array.isArray(formData.target_locations)
                ? formData.target_locations
                : [formData.target_locations],
            )
          : [],
      };

      await updateUserProfile(normalizedData as Partial<User>);
      toast({
        title: 'Profile updated',
        description: 'Your profile information has been successfully updated.',
      });
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description:
          (error as Error).message || 'Something went wrong while updating your profile.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError("New passwords don't match");
      return;
    }
    if (passwordData.newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    if (!passwordData.currentPassword) {
      setPasswordError('Please enter your current password');
      return;
    }

    setIsLoading(true);
    try {
      // Verify current password before allowing update
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: passwordData.currentPassword,
      });
      if (signInError) {
        setPasswordError('Current password is incorrect');
        setIsLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: passwordData.newPassword });
      if (error) throw error;
      await supabase.auth.signOut({ scope: 'others' });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordSuccess('Password updated successfully. Other sessions have been signed out.');
      toast({
        title: 'Password updated',
        description: 'Your password has been changed. All other sessions have been signed out.',
      });
    } catch (error: unknown) {
      console.error('Password update error:', error);
      setPasswordError((error as Error).message || 'Failed to update password');
      toast({
        variant: 'destructive',
        title: 'Password update failed',
        description:
          (error as Error).message || 'Something went wrong while updating your password.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    user,
    isLoading,
    formData,
    setFormData,
    passwordData,
    setPasswordData,
    passwordError,
    passwordSuccess,
    handleInputChange,
    handleSelectChange,
    handleLocationChange,
    handleProfileUpdate,
    handlePasswordChange,
  };
}
