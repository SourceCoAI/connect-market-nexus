import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type MFAStatus = 'disabled' | 'enrolled' | 'verified';

interface MFAFactor {
  id: string;
  friendly_name?: string;
  factor_type: 'totp';
  status: 'unverified' | 'verified';
  created_at: string;
}

interface EnrollResult {
  id: string;
  type: 'totp';
  totp: {
    qr_code: string; // data URI
    secret: string;
    uri: string;
  };
}

export function useMFA() {
  const [status, setStatus] = useState<MFAStatus>('disabled');
  const [factors, setFactors] = useState<MFAFactor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFactors = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: mfaError } = await supabase.auth.mfa.listFactors();
      if (mfaError) throw mfaError;

      const totpFactors = (data?.totp || []) as MFAFactor[];
      setFactors(totpFactors);

      const verifiedFactor = totpFactors.find((f) => f.status === 'verified');
      if (verifiedFactor) {
        setStatus('enrolled');
      } else {
        setStatus('disabled');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch MFA status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFactors();
  }, [fetchFactors]);

  const enroll = async (friendlyName?: string): Promise<EnrollResult | null> => {
    try {
      setError(null);
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: friendlyName || 'SourceCo Authenticator',
      });
      if (enrollError) throw enrollError;
      return data as EnrollResult;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start MFA enrollment');
      return null;
    }
  };

  const verify = async (factorId: string, code: string): Promise<boolean> => {
    try {
      setError(null);

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      });
      if (verifyError) throw verifyError;

      // Refresh factors
      await fetchFactors();
      setStatus('verified');
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid verification code');
      return false;
    }
  };

  const unenroll = async (factorId: string): Promise<boolean> => {
    try {
      setError(null);
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId,
      });
      if (unenrollError) throw unenrollError;

      await fetchFactors();
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to disable MFA');
      return false;
    }
  };

  const challengeAndVerify = async (code: string): Promise<boolean> => {
    const verifiedFactor = factors.find((f) => f.status === 'verified');
    if (!verifiedFactor) {
      setError('No MFA factor enrolled');
      return false;
    }
    return verify(verifiedFactor.id, code);
  };

  const getAssuranceLevel = async (): Promise<{
    currentLevel: string;
    nextLevel: string | null;
    currentAuthenticationMethods: Array<{ method: string; timestamp: number }>;
  }> => {
    const { data, error: alError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (alError) throw alError;
    return {
      currentLevel: data.currentLevel ?? 'aal1',
      nextLevel: data.nextLevel ?? null,
      currentAuthenticationMethods: data.currentAuthenticationMethods,
    };
  };

  return {
    status,
    factors,
    isLoading,
    error,
    enroll,
    verify,
    unenroll,
    challengeAndVerify,
    getAssuranceLevel,
    refresh: fetchFactors,
  };
}

/**
 * Lightweight hook to check if MFA challenge is needed after login.
 * Returns true if user has MFA enrolled but current session is AAL1 (needs challenge).
 */
export function useMFAChallengeRequired() {
  const [needsChallenge, setNeedsChallenge] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error) throw error;

        if (!active) return;

        // User has MFA enrolled (nextLevel is aal2) but current session is aal1
        if (data.currentLevel === 'aal1' && data.nextLevel === 'aal2') {
          setNeedsChallenge(true);
        } else {
          setNeedsChallenge(false);
        }
      } catch {
        if (active) setNeedsChallenge(false);
      } finally {
        if (active) setIsChecking(false);
      }
    };
    check();
    return () => {
      active = false;
    };
  }, []);

  return { needsChallenge, isChecking };
}
