import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const ONBOARDING_KEY = 'onboarding_completed';

export const useOnboarding = () => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { user, authChecked } = useAuth();

  useEffect(() => {
    const checkOnboardingStatus = () => {
      // Don't check anything if auth isn't ready or no user
      if (!authChecked || !user || !user.email_verified || user.approval_status !== 'approved') {
        setShowOnboarding(false);
        return;
      }

      // Check localStorage first (instant, reliable)
      const completedInStorage = localStorage.getItem(ONBOARDING_KEY) === 'true';

      // Check user object (already loaded, no extra DB call)
      const completedInProfile = user.onboarding_completed === true;

      // If completed in either place, don't show
      if (completedInStorage || completedInProfile) {
        setShowOnboarding(false);

        // Sync localStorage if needed (background operation)
        if (!completedInStorage && completedInProfile) {
          localStorage.setItem(ONBOARDING_KEY, 'true');
        }
        return;
      }

      // Only show onboarding if both are false and user is ready
      setShowOnboarding(true);
    };

    checkOnboardingStatus();
  }, [user, authChecked]);

  const completeOnboarding = async () => {
    // 1. Immediate localStorage update (never fails, instant UI update)
    localStorage.setItem(ONBOARDING_KEY, 'true');

    // 2. Immediate UI update (don't wait for anything)
    setShowOnboarding(false);

    // 3. Background database sync (non-blocking, can fail silently)
    if (user?.id) {
      setTimeout(async () => {
        try {
          await supabase
            .from('profiles')
            .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
            .eq('id', user.id);
        } catch (error) {
          console.warn('⚠️ Failed to sync onboarding to database (non-critical):', error);
          // Don't show error to user - localStorage is source of truth
        }
      }, 100);
    }
  };

  const shouldShowOnboarding =
    showOnboarding && user && user.email_verified && user.approval_status === 'approved';

  return {
    showOnboarding,
    completeOnboarding,
    isLoading: false, // Never blocks UI
    shouldShowOnboarding,
  };
};
