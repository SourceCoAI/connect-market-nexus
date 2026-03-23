import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface DataQualityAlert {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  action?: string;
  actionUrl?: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
}

interface DataQualityMetrics {
  totalUsers: number;
  incompleteProfiles: number;
  missingCriticalFields: number;
  recentSignupsWithIssues: number;
  formDropOffRate: number;
  validationErrorRate: number;
  onboardingCompletionRate: number;
  dataCompletenessScore: number;
}

export const useDataQualityMonitor = () => {
  const { isAdmin } = useAuth();
  const [metrics, setMetrics] = useState<DataQualityMetrics | null>(null);
  const [alerts, setAlerts] = useState<DataQualityAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isAdmin) {
      loadDataQualityMetrics();
      const interval = setInterval(loadDataQualityMetrics, 300000); // 5 minutes
      return () => clearInterval(interval);
    }
  }, [isAdmin]);

  const loadDataQualityMetrics = async () => {
    if (!isAdmin) return;

    try {
      setIsLoading(true);

      // Get all profiles for analysis
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .is('deleted_at', null);

      if (profilesError) throw profilesError;

      // Get registration funnel data for drop-off analysis
      const { data: funnelData, error: funnelError } = await supabase
        .from('registration_funnel')
        .select('*')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (funnelError) throw funnelError;

      const calculatedMetrics = calculateMetrics(
        (profiles as unknown as (Record<string, unknown> & {
          created_at: string;
          onboarding_completed?: boolean;
        })[]) || [],
        (funnelData || []) as (Record<string, unknown> & {
          session_id: string;
          step_name?: string;
          drop_off_reason?: string;
        })[],
      );
      setMetrics(calculatedMetrics);

      const generatedAlerts = generateAlerts(calculatedMetrics);
      setAlerts(generatedAlerts);
    } catch (error) {
      console.error('Error loading data quality metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateMetrics = (
    profiles: (Record<string, unknown> & { created_at: string; onboarding_completed?: boolean })[],
    funnelData: (Record<string, unknown> & {
      session_id: string;
      step_name?: string;
      drop_off_reason?: string;
    })[],
  ): DataQualityMetrics => {
    const totalUsers = profiles.length;
    const recentUsers = profiles.filter(
      (p) => new Date(p.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    );

    // Critical fields that should be completed
    const criticalFields = [
      'first_name',
      'last_name',
      'company',
      'buyer_type',
      'ideal_target_description',
      'phone_number',
    ];

    const incompleteProfiles = profiles.filter((profile) => {
      return criticalFields.some((field) => !profile[field] || profile[field] === '');
    }).length;

    const missingCriticalFields = profiles.reduce((total, profile) => {
      const missingCount = criticalFields.filter(
        (field) => !profile[field] || profile[field] === '',
      ).length;
      return total + missingCount;
    }, 0);

    const recentSignupsWithIssues = recentUsers.filter((profile) => {
      const hasIssues = criticalFields.some((field) => !profile[field] || profile[field] === '');
      return hasIssues || !profile.onboarding_completed;
    }).length;

    // Calculate drop-off rate from funnel data
    const totalSessions = new Set(funnelData.map((f) => f.session_id)).size;
    const completedSessions = funnelData.filter((f) => f.step_name === 'completed').length;
    const formDropOffRate =
      totalSessions > 0 ? ((totalSessions - completedSessions) / totalSessions) * 100 : 0;

    // Calculate validation error rate (mock for now)
    const validationErrors = funnelData.filter((f) =>
      f.drop_off_reason?.includes('validation'),
    ).length;
    const validationErrorRate = totalSessions > 0 ? (validationErrors / totalSessions) * 100 : 0;

    // Calculate onboarding completion rate
    const onboardingCompleted = profiles.filter((p) => p.onboarding_completed).length;
    const onboardingCompletionRate = totalUsers > 0 ? (onboardingCompleted / totalUsers) * 100 : 0;

    // Calculate overall data completeness score
    const totalPossibleFields = totalUsers * criticalFields.length;
    const completedFields = totalPossibleFields - missingCriticalFields;
    const dataCompletenessScore =
      totalPossibleFields > 0 ? (completedFields / totalPossibleFields) * 100 : 0;

    return {
      totalUsers,
      incompleteProfiles,
      missingCriticalFields,
      recentSignupsWithIssues,
      formDropOffRate,
      validationErrorRate,
      onboardingCompletionRate,
      dataCompletenessScore,
    };
  };

  const generateAlerts = (metrics: DataQualityMetrics): DataQualityAlert[] => {
    const alerts: DataQualityAlert[] = [];

    // High drop-off rate alert
    if (metrics.formDropOffRate > 30) {
      alerts.push({
        id: 'high-dropout',
        type: 'error',
        title: 'High Form Drop-off Rate',
        message: `${Math.round(metrics.formDropOffRate)}% of users are dropping off during signup`,
        action: 'Review Signup Flow',
        actionUrl: '/admin/analytics',
        priority: 'high',
        createdAt: new Date(),
      });
    }

    // Low data completeness alert
    if (metrics.dataCompletenessScore < 70) {
      alerts.push({
        id: 'low-completeness',
        type: 'warning',
        title: 'Low Data Completeness',
        message: `Only ${Math.round(metrics.dataCompletenessScore)}% of profile data is complete`,
        action: 'Launch Recovery Campaign',
        actionUrl: '/admin/marketplace/users',
        priority: 'medium',
        createdAt: new Date(),
      });
    }

    // Many incomplete profiles alert
    if (metrics.incompleteProfiles > 10) {
      alerts.push({
        id: 'incomplete-profiles',
        type: 'warning',
        title: 'Incomplete User Profiles',
        message: `${metrics.incompleteProfiles} users have incomplete profiles`,
        action: 'Send Recovery Emails',
        actionUrl: '/admin/marketplace/users',
        priority: 'medium',
        createdAt: new Date(),
      });
    }

    // Low onboarding completion alert
    if (metrics.onboardingCompletionRate < 80) {
      alerts.push({
        id: 'low-onboarding',
        type: 'info',
        title: 'Onboarding Completion Opportunity',
        message: `${Math.round(100 - metrics.onboardingCompletionRate)}% of users haven't completed onboarding`,
        action: 'Improve Onboarding Flow',
        priority: 'low',
        createdAt: new Date(),
      });
    }

    return alerts.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  };

  const dismissAlert = (alertId: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  };

  const triggerDataRecoveryCampaign = async (userIds: string[]) => {
    try {
      const { error } = await supabase.functions.invoke('send-data-recovery-email', {
        body: { userIds },
      });

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error('Error triggering data recovery campaign:', error);
      return { success: false, error };
    }
  };

  return {
    metrics,
    alerts,
    isLoading,
    dismissAlert,
    triggerDataRecoveryCampaign,
    refreshMetrics: loadDataQualityMetrics,
  };
};
