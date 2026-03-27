import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User as AppUser, TeamRole } from '@/types';
import { createUserObject } from '@/lib/auth-helpers';
import { selfHealProfile } from '@/lib/profile-self-heal';
import { processUrl } from '@/lib/url-utils';
import { standardizeCategories, standardizeLocations } from '@/lib/standardization';

const VISITOR_ID_KEY = 'sourceco_visitor_id';

// Ultra-simple auth state - no caching, no localStorage interference, no managers
export function useNuclearAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [teamRole, setTeamRole] = useState<TeamRole | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Load profile and set user state (does NOT control isLoading)
    const loadProfile = async (sessionUserId: string) => {
      try {
        const { data: fetchedProfile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', sessionUserId)
          .single();

        // Self-healing: if profile missing, create one from auth metadata
        let profile: typeof fetchedProfile = fetchedProfile;
        if (!fetchedProfile && (profileError?.code === 'PGRST116' || !profileError)) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.user) {
            profile = (await selfHealProfile(session.user)) as typeof fetchedProfile;
          }
        }

        if (profile && isMounted) {
          const appUser = createUserObject(profile);

          // Fetch team role from user_roles table (admin panel access control)
          if (appUser.is_admin) {
            try {
              const { data: roleData } = await supabase.rpc('get_my_role');
              const role = (roleData as TeamRole) || null;
              if (isMounted) {
                setTeamRole(role);
                appUser.team_role = role ?? undefined;
              }
            } catch {
              // Non-critical: default to null
            }
          } else {
            if (isMounted) setTeamRole(null);
          }

          if (isMounted) setUser(appUser);

          // Link journey AND session to user (fire-and-forget)
          const visitorId = localStorage.getItem(VISITOR_ID_KEY);
          const currentSessionId = sessionStorage.getItem('session_id');

          if (visitorId) {
            supabase
              .rpc('link_journey_to_user', {
                p_visitor_id: visitorId,
                p_user_id: sessionUserId,
              })
              .then(({ error: linkError }) => {
                if (linkError) console.error('Failed to link journey:', linkError);
              });
          }

          if (currentSessionId) {
            supabase
              .from('user_sessions')
              .update({
                user_id: sessionUserId,
                last_active_at: new Date().toISOString(),
              })
              .eq('session_id', currentSessionId)
              .is('user_id', null)
              .then(({ error: mergeError }) => {
                if (mergeError) console.error('Failed to merge session:', mergeError);
              });
          }
        }
      } catch (error) {
        console.error('Profile load error:', error);
      }
    };

    // Listener for ONGOING auth changes — does NOT control isLoading
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setTeamRole(null);
        // Don't touch isLoading here — only initial load controls it
      } else if (event === 'SIGNED_IN' && session?.user) {
        // Defer to avoid Supabase deadlock
        setTimeout(() => {
          if (isMounted) loadProfile(session.user.id);
        }, 0);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Silently refresh profile on token refresh
        setTimeout(() => {
          if (isMounted) loadProfile(session.user.id);
        }, 0);
      }
    });

    // INITIAL load — this is the ONLY place that controls isLoading
    const initializeAuth = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (error) throw error;
        if (!isMounted) return;

        if (session?.user) {
          await loadProfile(session.user.id);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Session check error:', error);
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setAuthChecked(true);
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Simple auth actions — wrapped in useCallback to stabilize references
  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    try {
      setIsLoading(true);

      const { cleanupAuthState } = await import('@/lib/auth-cleanup');
      cleanupAuthState();

      try {
        const { error } = await supabase.auth.signOut({ scope: 'global' });
        if (error) console.warn('Supabase logout warning:', error);
      } catch (signOutError) {
        console.warn('Supabase signOut failed, continuing with cleanup:', signOutError);
      }

      // Clear state after signOut to avoid session/state mismatch
      setUser(null);
      setTeamRole(null);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
      setUser(null);
      setTeamRole(null);
      window.location.href = '/login';
    }
  }, []);

  const signup = useCallback(async (userData: Partial<AppUser>, password: string) => {
    if (!userData.email) throw new Error('Email is required');

    const websiteNormalized =
      userData.website && userData.website.trim() !== '' ? processUrl(userData.website) : '';

    const visitorId = localStorage.getItem(VISITOR_ID_KEY);

    const { data, error } = await supabase.auth.signUp({
      email: userData.email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          visitor_id: visitorId || null,
          first_name: userData.first_name || '',
          last_name: userData.last_name || '',
          company: userData.company || '',
          website: websiteNormalized,
          phone_number: userData.phone_number || '',
          buyer_type: userData.buyer_type || 'corporate',
          linkedin_profile: userData.linkedin_profile || '',
          ideal_target_description: userData.ideal_target_description || '',
          business_categories: Array.isArray(userData.business_categories)
            ? standardizeCategories(userData.business_categories)
            : [],
          target_locations: Array.isArray(userData.target_locations)
            ? standardizeLocations(userData.target_locations)
            : [],
          revenue_range_min: userData.revenue_range_min || '',
          revenue_range_max: userData.revenue_range_max || '',
          specific_business_search: userData.specific_business_search || '',
          job_title: userData.job_title || '',
          estimated_revenue: userData.estimated_revenue || '',
          fund_size: userData.fund_size || '',
          investment_size: Array.isArray(userData.investment_size)
            ? userData.investment_size
            : userData.investment_size
              ? [userData.investment_size as string]
              : [],
          aum: userData.aum || '',
          is_funded: userData.is_funded || '',
          funded_by: userData.funded_by || '',
          target_company_size: userData.target_company_size || '',
          funding_source: userData.funding_source || '',
          needs_loan: userData.needs_loan || '',
          ideal_target: userData.ideal_target || '',
          deploying_capital_now: userData.deploying_capital_now || '',
          owning_business_unit: userData.owning_business_unit || '',
          deal_size_band: userData.deal_size_band || '',
          integration_plan: Array.isArray(userData.integration_plan)
            ? userData.integration_plan
            : [],
          corpdev_intent: userData.corpdev_intent || '',
          discretion_type: userData.discretion_type || '',
          committed_equity_band: userData.committed_equity_band || '',
          equity_source: Array.isArray(userData.equity_source) ? userData.equity_source : [],
          deployment_timing: userData.deployment_timing || '',
          target_deal_size_min:
            typeof userData.target_deal_size_min === 'number'
              ? userData.target_deal_size_min
              : userData.target_deal_size_min
                ? Number(userData.target_deal_size_min)
                : null,
          target_deal_size_max:
            typeof userData.target_deal_size_max === 'number'
              ? userData.target_deal_size_max
              : userData.target_deal_size_max
                ? Number(userData.target_deal_size_max)
                : null,
          geographic_focus: Array.isArray(userData.geographic_focus)
            ? standardizeLocations(userData.geographic_focus)
            : [],
          industry_expertise: Array.isArray(userData.industry_expertise)
            ? standardizeCategories(userData.industry_expertise)
            : [],
          deal_structure_preference: userData.deal_structure_preference || '',
          permanent_capital: userData.permanent_capital || null,
          operating_company_targets: Array.isArray(userData.operating_company_targets)
            ? userData.operating_company_targets
            : [],
          flex_subxm_ebitda: userData.flex_subxm_ebitda || null,
          search_type: userData.search_type || '',
          acq_equity_band: userData.acq_equity_band || '',
          financing_plan: Array.isArray(userData.financing_plan) ? userData.financing_plan : [],
          search_stage: userData.search_stage || '',
          flex_sub2m_ebitda: userData.flex_sub2m_ebitda || null,
          on_behalf_of_buyer: userData.on_behalf_of_buyer || '',
          buyer_role: userData.buyer_role || '',
          buyer_org_url: userData.buyer_org_url || '',
          owner_timeline: userData.owner_timeline || '',
          owner_intent: userData.owner_intent || '',
          uses_bank_finance: userData.uses_bank_finance || '',
          max_equity_today_band: userData.max_equity_today_band || '',
          mandate_blurb: userData.mandate_blurb || '',
          portfolio_company_addon: userData.portfolio_company_addon || '',
          backers_summary: userData.backers_summary || '',
          anchor_investors_summary: userData.anchor_investors_summary || '',
          deal_intent: userData.deal_intent || '',
          exclusions: Array.isArray(userData.exclusions)
            ? userData.exclusions
            : typeof userData.exclusions === 'string' && userData.exclusions
              ? (userData.exclusions as string)
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
          include_keywords: Array.isArray(userData.include_keywords)
            ? userData.include_keywords
            : typeof userData.include_keywords === 'string' && userData.include_keywords
              ? (userData.include_keywords as string)
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
          referral_source: userData.referral_source || '',
          referral_source_detail: userData.referral_source_detail || '',
          deal_sourcing_methods: Array.isArray(userData.deal_sourcing_methods)
            ? userData.deal_sourcing_methods
            : [],
          target_acquisition_volume: userData.target_acquisition_volume || '',
        },
      },
    });

    if (error) throw error;

    if (data.user) {
      const userName = `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'there';

      // Send welcome email + admin notification via user-journey-notifications
      const welcomeEmailPromise = supabase.functions
        .invoke('user-journey-notifications', {
          body: {
            event_type: 'user_created',
            user_id: data.user.id,
            user_email: userData.email,
            user_name: userName,
            metadata: { company: userData.company || '' },
          },
        })
        .catch((err) => {
          console.warn('Welcome email failed but user creation succeeded:', err);
        });

      const adminNotificationPromise = supabase.functions
        .invoke('enhanced-admin-notification', {
          body: {
            first_name: userData.first_name || '',
            last_name: userData.last_name || '',
            email: userData.email,
            company: userData.company || '',
          },
        })
        .catch((err) => {
          console.warn('Admin notification failed but user creation succeeded:', err);
        });

      const firmCreationPromise = supabase.functions
        .invoke('auto-create-firm-on-signup', {
          body: {
            userId: data.user.id,
            company: userData.company || '',
          },
        })
        .catch((err) => {
          console.warn(
            'Firm creation at signup failed (will retry on pending-approval page):',
            err,
          );
        });

      const scoringPromise = supabase.functions
        .invoke('calculate-buyer-quality-score', {
          body: { profile_id: data.user.id, self_score: true },
        })
        .catch((err) => {
          console.warn('Buyer scoring failed (will be scored later):', err);
        });

      await Promise.allSettled([
        welcomeEmailPromise,
        adminNotificationPromise,
        firmCreationPromise,
        scoringPromise,
      ]);
    }
  }, []);

  const updateUserProfile = useCallback(
    async (data: Partial<AppUser>) => {
      if (!user) throw new Error('No user logged in');

      const normalizedWebsite =
        data.website && data.website.trim() !== '' ? processUrl(data.website) : undefined;

      const { investment_size, ...restData } = data;

      let preparedInvestmentSize: string[] | undefined = undefined;
      if (Array.isArray(investment_size)) {
        preparedInvestmentSize = investment_size;
      } else if (typeof investment_size === 'string' && investment_size.trim() !== '') {
        const trimmed = investment_size.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            preparedInvestmentSize = JSON.parse(trimmed);
          } catch {
            preparedInvestmentSize = [trimmed];
          }
        } else {
          preparedInvestmentSize = [trimmed];
        }
      }

      const dbPayload: Record<string, unknown> = {
        ...restData,
        ...(normalizedWebsite !== undefined ? { website: normalizedWebsite } : {}),
        ...(preparedInvestmentSize !== undefined
          ? { investment_size: preparedInvestmentSize }
          : {}),
      };

      const PRIVILEGED_FIELDS = [
        'is_admin',
        'approval_status',
        'email_verified',
        'role',
        'id',
        'email',
        'company',
        'buyer_type',
      ];
      for (const field of PRIVILEGED_FIELDS) {
        delete dbPayload[field];
      }

      const { error } = await supabase.from('profiles').update(dbPayload).eq('id', user.id);

      if (error) throw error;

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (session?.user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        if (profileError) throw profileError;

        if (profile) {
          const updatedUser = createUserObject(profile);
          setUser(updatedUser);
        }
      }
    },
    [user],
  );

  const refreshUserProfile = useCallback(async () => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (session?.user) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      if (profileError) throw profileError;
      if (profile) {
        const updatedUser = createUserObject(profile);
        setUser(updatedUser);
      }
    }
  }, []);

  const isAdmin = user?.is_admin === true;
  const isBuyer = user?.role === 'buyer';

  return useMemo(
    () => ({
      user,
      login,
      logout,
      signup,
      updateUserProfile,
      refreshUserProfile,
      isLoading,
      isAdmin,
      isBuyer,
      authChecked,
      teamRole,
    }),
    [
      user,
      login,
      logout,
      signup,
      updateUserProfile,
      refreshUserProfile,
      isLoading,
      isAdmin,
      isBuyer,
      authChecked,
      teamRole,
    ],
  );
}
