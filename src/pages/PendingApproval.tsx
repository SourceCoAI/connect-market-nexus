import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Mail,
  CheckCircle,
  Clock,
  LogOut,
  Loader2,
  
  RefreshCw,
  Shield,
  XCircle,
  FileText,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cleanupAuthState } from '@/lib/auth-helpers';
import { APP_CONFIG } from '@/config/app';
import { useMyAgreementStatus } from '@/hooks/use-agreement-status';
import { sendAgreementEmail } from '@/lib/agreement-email';

const PendingApproval = () => {
  const navigate = useNavigate();
  const { user, isLoading, refreshUserProfile } = useAuth();
  const [isResending, setIsResending] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [checkCooldown, setCheckCooldown] = useState(false);
  const [isRequestingDocs, setIsRequestingDocs] = useState(false);
  const [docCooldown, setDocCooldown] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isFinalizingVerification, setIsFinalizingVerification] = useState(false);
  const [authConfirmedVerified, setAuthConfirmedVerified] = useState(false);

  const { data: agreementStatus } = useMyAgreementStatus(!!user);
  const hasAnyAgreement = agreementStatus?.fee_covered;

  useEffect(() => {
    if (user?.approval_status === 'approved' || user?.approval_status === 'rejected') return;
    const interval = setInterval(() => {
      refreshUserProfile().catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [user?.approval_status, refreshUserProfile]);

  useEffect(() => {
    if (user?.approval_status === 'approved') {
      navigate('/', { replace: true });
    }
  }, [user?.approval_status, authConfirmedVerified, navigate]);

  useEffect(() => {
    let cancelled = false;

    const reconcileVerificationState = async () => {
      // If profile already says verified or user is rejected, nothing to do
      if (!user || user.email_verified || user.approval_status === 'rejected') {
        setIsFinalizingVerification(false);
        return;
      }

      // Check the actual auth state — is the email really confirmed?
      const {
        data: { user: authUser },
        error,
      } = await supabase.auth.getUser();

      if (cancelled || error || !authUser?.email_confirmed_at) {
        setIsFinalizingVerification(false);
        return;
      }

      // Auth confirms email is verified — record this truth
      setAuthConfirmedVerified(true);

      // Auth says verified but profile is stale — show finalizing state
      console.info('[PendingApproval] Auth confirmed but profile stale — reconciling...');
      setIsFinalizingVerification(true);

      try {
        for (let attempt = 1; attempt <= 5; attempt += 1) {
          await refreshUserProfile();
          if (cancelled) return;

          // Check if refresh picked up the new value
          // (user object will re-render and trigger this effect again if changed)
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
          console.info(`[PendingApproval] Reconcile attempt ${attempt}/5`);
        }
      } catch (reconcileError) {
        console.error('Failed to reconcile verification state:', reconcileError);
      } finally {
        if (!cancelled) {
          setIsFinalizingVerification(false);
        }
      }
    };

    void reconcileVerificationState();

    return () => {
      cancelled = true;
    };
  }, [user?.email_verified, user?.approval_status, refreshUserProfile]);

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 text-muted-foreground animate-spin" />
          <p className="text-sm text-muted-foreground">Loading your account...</p>
        </div>
      </div>
    );
  }

  if (isFinalizingVerification) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <Logo />
          <div className="space-y-3">
            <div className="inline-flex p-3 rounded-full bg-primary/10">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground">Finalizing your verification</h1>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Your email is confirmed. We’re syncing your account status now.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleResendVerification = async () => {
    if (user.email_verified) {
      toast({ title: 'Email already verified', description: 'Your email is already verified.' });
      return;
    }
    setIsResending(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (resendError) {
        if (resendError.message?.includes('rate limit')) {
          throw new Error('Please wait a moment before requesting another verification email.');
        } else if (resendError.message?.includes('already verified')) {
          window.location.reload();
          return;
        } else {
          throw new Error(resendError.message || 'Failed to resend verification email');
        }
      }
      toast({ title: 'Email sent', description: "We've sent another verification email to your inbox." });
    } catch (error: unknown) {
      toast({ variant: 'destructive', title: 'Failed to resend email', description: error instanceof Error ? error.message : 'Please try again later.' });
    } finally {
      setIsResending(false);
    }
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await cleanupAuthState();
      await supabase.auth.signOut({ scope: 'global' });
      navigate('/login', { replace: true });
    } catch {
      navigate('/login', { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleCheckStatus = async () => {
    if (checkCooldown) return;
    setIsCheckingStatus(true);
    try {
      await refreshUserProfile();
      toast({ title: 'Status checked', description: 'Your account status has been refreshed.' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed to check status', description: 'Please try again.' });
    } finally {
      setIsCheckingStatus(false);
      setCheckCooldown(true);
      setTimeout(() => setCheckCooldown(false), 10000);
    }
  };

  const handleRequestBothDocuments = async () => {
    setIsRequestingDocs(true);
    try {
      const [ndaResult, feeResult] = await Promise.all([
        sendAgreementEmail({ documentType: 'nda' }),
        sendAgreementEmail({ documentType: 'fee_agreement' }),
      ]);
      const firstError = ndaResult.error || feeResult.error;
      if (firstError) {
        toast({ variant: 'destructive', title: 'Failed to send documents', description: firstError });
      } else {
        toast({ title: 'Documents sent', description: 'Check your email for the NDA and Fee Agreement.' });
        setDocCooldown(true);
        setCooldownSeconds(120);
        const interval = setInterval(() => {
          setCooldownSeconds(prev => {
            if (prev <= 1) {
              clearInterval(interval);
              setDocCooldown(false);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Something went wrong', description: 'Please try again.' });
    } finally {
      setIsRequestingDocs(false);
    }
  };

  const getUIState = () => {
    if (user?.approval_status === 'rejected') return 'rejected';
    // If profile says verified OR auth has confirmed verified, show the
    // "Application received" screen — never show "Verify your email" to
    // a user whose email is already confirmed in Auth.
    if (user?.email_verified || authConfirmedVerified) return 'approved_pending';
    return 'email_not_verified';
  };

  const uiState = getUIState();

  // ---------- REJECTED ----------
  if (uiState === 'rejected') {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-md space-y-8 text-center">
          <Logo />
          <div className="space-y-3">
            <div className="inline-flex p-3 rounded-full bg-destructive/10">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground">Application not approved</h1>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Your application did not meet our current criteria. Contact our team for more details or to discuss next steps.
            </p>
          </div>
          <div className="space-y-3">
            <Button asChild className="w-full">
              <a href={`mailto:${APP_CONFIG.adminEmail}`}>Contact our team</a>
            </Button>
            <Button variant="ghost" onClick={handleLogout} disabled={isLoggingOut} className="w-full text-muted-foreground">
              {isLoggingOut ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Signing out...</> : <><LogOut className="h-4 w-4 mr-2" />Sign out</>}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- EMAIL NOT VERIFIED ----------
  if (uiState === 'email_not_verified') {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-md space-y-8 text-center">
          <Logo />
          <div className="space-y-3">
            <div className="inline-flex p-3 rounded-full bg-primary/10">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground">Verify your email</h1>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              We sent a verification link to <strong>{user.email}</strong>. Click it to continue. Check your spam folder if you don't see it within a few minutes.
            </p>
          </div>

          {/* What happens next */}
          <div className="border border-border rounded-xl p-5 text-left space-y-3">
            <p className="text-sm font-medium text-foreground">After you verify</p>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Our team reviews your application, usually same day</li>
              <li>Sign a Fee Agreement via email</li>
              <li>Browse deals and request introductions</li>
            </ol>
          </div>

          <div className="space-y-3">
            <Button onClick={handleResendVerification} disabled={isResending} className="w-full">
              {isResending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending...</> : 'Resend verification email'}
            </Button>
            <Button variant="ghost" onClick={handleLogout} disabled={isLoggingOut} className="w-full text-muted-foreground">
              {isLoggingOut ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Signing out...</> : <><LogOut className="h-4 w-4 mr-2" />Sign out</>}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- APPROVED PENDING (two-column) ----------
  return (
    <div className="flex items-center justify-center min-h-screen px-4 py-12">
      <div className="w-full max-w-3xl space-y-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <Logo />
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground mt-6">Application received</h1>
          <p className="text-base text-muted-foreground max-w-lg mx-auto">
            A team member will review your profile and approve access, usually within a few hours.
          </p>
        </div>

        {/* Two-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* LEFT: Status */}
          <div className="space-y-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your status</h2>

            {/* Progress steps */}
            <div className="space-y-0">
              <StatusStep icon={<CheckCircle className="h-4 w-4 text-white" />} bg="bg-emerald-500" label="Account created" done />
              <StatusStep icon={<CheckCircle className="h-4 w-4 text-white" />} bg="bg-emerald-500" label="Email verified" done />
              <StatusStep icon={<Clock className="h-3.5 w-3.5 text-white" />} bg="bg-amber-500" label="Admin review" sublabel="Usually a few hours" />
              <StatusStep icon={<CheckCircle className="h-3.5 w-3.5 text-muted-foreground/40" />} bg="bg-muted" label="Access granted" sublabel="After approval" last />
            </div>

            {/* User details */}
            <div className="border-t border-border pt-5">
              <dl className="space-y-2 text-sm">
                <DetailRow label="Name" value={`${user.first_name} ${user.last_name}`} />
                <DetailRow label="Email" value={user.email} />
                {user.company && <DetailRow label="Company" value={user.company} />}
                <DetailRow label="Type" value={user.buyer_type?.replace(/([A-Z])/g, ' $1').trim() || 'N/A'} />
              </dl>
            </div>
          </div>

          {/* RIGHT: Action panel */}
          <div className="rounded-xl border border-border bg-muted/30 p-6 space-y-5">
            {hasAnyAgreement ? (
              /* Signed state */
              <div className="flex flex-col items-center justify-center text-center h-full space-y-4 py-4">
                <div className="inline-flex p-3 rounded-full bg-emerald-100">
                  <CheckCircle className="h-8 w-8 text-emerald-600" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">Documents signed</p>
                  <p className="text-sm text-muted-foreground">
                    Once approved, you can browse deals and request introductions.
                  </p>
                </div>
              </div>
            ) : (
              /* Unsigned state */
              <>
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-foreground">Get ahead while you wait</h2>
                  <p className="text-sm text-muted-foreground">
                    Sign your documents now so you have instant access the moment you're approved.
                  </p>
                </div>

                {/* Document items */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Shield className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">NDA</p>
                      <p className="text-xs text-muted-foreground">Protects the confidential information we share with you</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Fee Agreement</p>
                      <p className="text-xs text-muted-foreground">Only applies if you close a deal sourced through SourceCo. No upfront cost.</p>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full bg-[#0E101A] hover:bg-[#0E101A]/90 text-white"
                  onClick={handleRequestBothDocuments}
                  disabled={isRequestingDocs || docCooldown}
                >
                  {isRequestingDocs ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                  ) : docCooldown ? (
                    <><CheckCircle className="h-4 w-4 mr-2" />Documents requested — request again in {Math.floor(cooldownSeconds / 60)}:{(cooldownSeconds % 60).toString().padStart(2, '0')}</>
                  ) : (
                    <><Mail className="h-4 w-4 mr-2" />Request Documents via Email</>
                  )}
                </Button>

                <p className="text-[11px] text-muted-foreground text-center">
                  {docCooldown
                    ? 'Check your email for the NDA and Fee Agreement.'
                    : 'One signature covers every deal, now and in the future.'}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCheckStatus}
              disabled={isCheckingStatus || checkCooldown}
              className="text-muted-foreground"
            >
              {isCheckingStatus ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              Check status
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="text-muted-foreground"
            >
              {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <LogOut className="h-4 w-4 mr-1.5" />}
              Sign out
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Questions?{' '}
            <a href={`mailto:${APP_CONFIG.adminEmail}`} className="text-primary hover:underline">{APP_CONFIG.adminEmail}</a>
          </p>
        </div>
      </div>
    </div>
  );
};

// ---------- Sub-components ----------

function Logo() {
  return (
    <div className="flex items-center justify-center gap-3">
      <img src="/lovable-uploads/b879fa06-6a99-4263-b973-b9ced4404acb.png" alt="SourceCo" className="h-9 w-9" />
      <div className="text-left">
        <p className="text-lg font-semibold text-foreground leading-tight">SourceCo</p>
        <p className="text-sm text-muted-foreground leading-tight">Marketplace</p>
      </div>
    </div>
  );
}

function StatusStep({ icon, bg, label, sublabel, done, last }: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  sublabel?: string;
  done?: boolean;
  last?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      {/* Dot + connector line */}
      <div className="flex flex-col items-center">
        <div className={`w-6 h-6 rounded-full ${bg} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        {!last && (
          <div className={`w-px h-6 ${done ? 'bg-emerald-300' : 'bg-border'}`} />
        )}
      </div>
      {/* Text */}
      <div className={`pb-4 ${last ? '' : ''}`}>
        <p className={`text-sm font-medium ${done ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</p>
        {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="font-medium text-foreground text-right truncate">{value}</dd>
    </div>
  );
}

export default PendingApproval;
