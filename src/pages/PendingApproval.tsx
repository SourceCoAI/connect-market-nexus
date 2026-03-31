import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Mail,
  CheckCircle,
  Clock,
  LogOut,
  Loader2,
  Info,
  RefreshCw,
  Shield,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cleanupAuthState } from '@/lib/auth-helpers';
import { APP_CONFIG } from '@/config/app';
import { useBuyerNdaStatus } from '@/hooks/admin/use-pandadoc';
import { PandaDocSigningPanel } from '@/components/pandadoc/PandaDocSigningPanel';

const PendingApproval = () => {
  const navigate = useNavigate();
  const { user, isLoading, refreshUserProfile } = useAuth();
  const [isResending, setIsResending] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [checkCooldown, setCheckCooldown] = useState(false);
  const [ndaEmbedSrc, setNdaEmbedSrc] = useState<string | null>(null);
  const [ndaLoading, setNdaLoading] = useState(false);
  const [ndaError, setNdaError] = useState<string | null>(null);
  const [ndaSigned, setNdaSigned] = useState(false);

  const { data: ndaStatus, refetch: refetchNdaStatus } = useBuyerNdaStatus(user?.id);
  const [firmCreationAttempted, setFirmCreationAttempted] = useState(false);

  // Fallback: if firm doesn't exist yet (e.g., signup edge function failed), create it now.
  // Only marks as attempted on success so it can retry on failure.
  useEffect(() => {
    if (!user || firmCreationAttempted) return;
    if (ndaStatus === undefined) return; // Still loading
    if (ndaStatus?.hasFirm) return; // Firm already exists

    supabase.functions
      .invoke('auto-create-firm-on-signup', {
        body: { userId: user.id, company: user.company || '' },
      })
      .then(({ error }) => {
        if (!error) {
          setFirmCreationAttempted(true);
          refetchNdaStatus();
        } else {
          console.warn('Fallback firm creation failed:', error);
        }
      })
      .catch((err) => {
        console.warn('Fallback firm creation error:', err);
      });
  }, [user, ndaStatus, firmCreationAttempted, refetchNdaStatus]);

  // Fetch NDA embed src when buyer has a firm but hasn't signed
  useEffect(() => {
    let cancelled = false;

    const fetchNdaEmbed = async () => {
      if (!user || !ndaStatus?.hasFirm || ndaStatus?.ndaSigned || !ndaStatus?.firmId) return;
      if (ndaEmbedSrc || ndaLoading) return;

      setNdaLoading(true);
      try {
        const { data, error: fnError } = await supabase.functions.invoke('get-buyer-nda-embed');

        if (cancelled) return;

        if (fnError) {
          setNdaError('Failed to prepare NDA signing form');
          console.error('PandaDoc error:', fnError);
        } else if (data?.embedUrl) {
          setNdaEmbedSrc(data.embedUrl);
        } else if (data?.ndaSigned) {
          setNdaSigned(true);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setNdaError(err instanceof Error ? err.message : 'Something went wrong');
        }
      } finally {
        if (!cancelled) setNdaLoading(false);
      }
    };

    fetchNdaEmbed();
    return () => {
      cancelled = true;
    };
  }, [user, ndaStatus, ndaEmbedSrc, ndaLoading]);

  // Auto-poll approval status every 30s
  useEffect(() => {
    if (user?.approval_status === 'approved' || user?.approval_status === 'rejected') return;
    const interval = setInterval(() => {
      refreshUserProfile().catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [user?.approval_status, refreshUserProfile]);

  // Handle navigation for approved users (skip redirect if NDA signing is pending)
  useEffect(() => {
    if (user?.approval_status === 'approved') {
      if (ndaStatus?.hasFirm && !ndaStatus?.ndaSigned && !ndaSigned) {
        return; // Stay on page for NDA signing
      }
      navigate('/', { replace: true });
    }
  }, [user?.approval_status, ndaStatus?.hasFirm, ndaStatus?.ndaSigned, ndaSigned, navigate]);

  // Show loading while auth is being determined
  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/30">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-16 w-16 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading your account...</p>
        </div>
      </div>
    );
  }

  const handleResendVerification = async () => {
    if (user.email_verified) {
      toast({
        title: 'Email already verified',
        description: 'Your email is already verified. No need to resend.',
      });
      return;
    }

    setIsResending(true);

    try {
      // Resending verification email
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
        options: {
          emailRedirectTo: `${window.location.origin}/pending-approval`,
        },
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

      toast({
        title: 'Email sent',
        description:
          "We've sent another verification email to your inbox. Please check your spam folder if you don't see it.",
      });
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Failed to resend email',
        description:
          error instanceof Error ? error.message : 'Please try again later or contact support.',
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      // Logging out
      await cleanupAuthState();
      await supabase.auth.signOut({ scope: 'global' });
      navigate('/login', { replace: true });
    } catch (error) {
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
      toast({
        title: 'Status checked',
        description: 'Your account status has been refreshed.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to check status',
        description: 'Please try again.',
      });
    } finally {
      setIsCheckingStatus(false);
      setCheckCooldown(true);
      setTimeout(() => setCheckCooldown(false), 10000);
    }
  };

  const getUIState = () => {
    if (user?.approval_status === 'rejected') {
      return 'rejected';
    } else if (user?.email_verified) {
      return 'approved_pending';
    } else {
      return 'email_not_verified';
    }
  };

  const uiState = getUIState();

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/30">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center space-y-3">
          <div className="flex items-center">
            <img
              src="/lovable-uploads/b879fa06-6a99-4263-b973-b9ced4404acb.png"
              alt="SourceCo Logo"
              className="h-10 w-10 mr-3"
            />
            <div className="text-center">
              <h1 className="text-2xl font-bold">SourceCo</h1>
              <p className="text-lg text-muted-foreground font-light">Marketplace</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <div className="flex justify-center mb-4">
              <div
                className={`p-3 rounded-full ${
                  uiState === 'rejected'
                    ? 'bg-destructive/10'
                    : uiState === 'approved_pending'
                      ? 'bg-green-100'
                      : 'bg-primary/10'
                }`}
              >
                {uiState === 'rejected' ? (
                  <XCircle className="h-8 w-8 text-destructive" />
                ) : uiState === 'approved_pending' ? (
                  <CheckCircle className="h-8 w-8 text-green-600" />
                ) : (
                  <Mail className="h-8 w-8 text-primary" />
                )}
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-center">
              {uiState === 'rejected'
                ? 'Application Not Approved'
                : uiState === 'approved_pending'
                  ? "You're in the queue — sign your NDA for immediate access"
                  : 'Almost there — verify your email to continue'}
            </CardTitle>
            <CardDescription className="text-center">
              {uiState === 'rejected'
                ? 'Unfortunately, your application was not approved at this time'
                : uiState === 'approved_pending'
                  ? "Our team reviews applications same day. Sign your NDA now so you have immediate access the moment you're cleared."
                  : `We've sent a verification link to ${user.email}. Click it to continue — check your spam folder if you don't see it within a few minutes.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {uiState === 'rejected' ? (
              <>
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
                  <div className="flex gap-3 items-center">
                    <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                    <p className="text-sm text-destructive">
                      Your application did not meet our current criteria. If you believe this was in
                      error, please reach out to our team.
                    </p>
                  </div>
                </div>
                <div className="bg-muted/50 border border-border rounded-md p-4">
                  <div className="flex gap-3 items-start">
                    <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">What can you do?</p>
                      <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                        <li>Contact our team for more details about the decision</li>
                        <li>Update your profile and reapply in the future</li>
                        <li>Reach out if your circumstances have changed</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            ) : uiState === 'approved_pending' ? (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
                  <div className="flex gap-3 items-start">
                    <Clock className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-amber-800 text-sm font-medium">
                        Sign your NDA to unlock the full deal pipeline
                      </p>
                      <p className="text-amber-700 text-xs mt-1">
                        One signature covers every deal on SourceCo — now and in the future. The
                        sooner it's signed, the sooner you're in.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Submitted Information Summary */}
                <div className="bg-muted/40 border border-border rounded-md p-4 space-y-2">
                  <h4 className="text-sm font-medium">Submitted Information</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">
                      {user.first_name} {user.last_name}
                    </span>
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium truncate">{user.email}</span>
                    {user.company && (
                      <>
                        <span className="text-muted-foreground">Company</span>
                        <span className="font-medium">{user.company}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Buyer Type</span>
                    <span className="font-medium capitalize">
                      {user.buyer_type?.replace(/([A-Z])/g, ' $1').trim() || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Estimated Review Timeline */}
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <div className="flex gap-3 items-start">
                    <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Estimated Review Time</p>
                      <p className="text-xs text-blue-700 mt-1">
                        Most applications are reviewed within <strong>1 business day</strong>. You
                        will receive an email notification as soon as your account is approved.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Application Progress Timeline */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-center">Application Progress</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Account Created</p>
                        <p className="text-xs text-muted-foreground">
                          Your account has been successfully created
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Email Verified</p>
                        <p className="text-xs text-muted-foreground">
                          Your email address has been confirmed
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Admin Review</p>
                        <p className="text-xs text-muted-foreground">
                          Pending approval from our team
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* NDA Signing Section — shows when firm exists and NDA unsigned */}
                {ndaStatus?.hasFirm && !ndaStatus?.ndaSigned && !ndaSigned && (
                  <div className="space-y-4 pt-2">
                    <div className="text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <Shield className="h-4 w-4 text-primary" />
                        <h4 className="text-sm font-semibold">Sign your NDA</h4>
                      </div>
                    </div>

                    {/* NDA Education Cards */}
                    <div className="bg-muted/40 border border-border rounded-md p-4">
                      <h5 className="text-xs font-semibold mb-1">What your NDA unlocks</h5>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Every deal on SourceCo is live, real, and confidential — actual financials,
                        real business names, real owner details that sellers have shared with us
                        under strict access controls. Your NDA opens the door to all of it.
                      </p>
                    </div>

                    <div className="bg-muted/40 border border-border rounded-md p-4">
                      <h5 className="text-xs font-semibold mb-1">What you're agreeing to</h5>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        You agree to keep deal details confidential and only use them to evaluate a
                        potential acquisition. One signature covers every deal on SourceCo — you'll
                        never be asked to sign another one.
                      </p>
                    </div>

                    {ndaLoading && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <span className="text-xs text-muted-foreground ml-2">
                          Loading signing form...
                        </span>
                      </div>
                    )}
                    {ndaError && (
                      <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4 text-center space-y-3">
                        <p className="text-xs text-destructive">{ndaError}</p>
                        <div className="flex flex-col items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setNdaError(null);
                              setNdaEmbedSrc(null);
                            }}
                            className="gap-1.5"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Try Again
                          </Button>
                          <p className="text-[11px] text-muted-foreground">
                            Still having trouble?{' '}
                            <a
                              href={`mailto:${APP_CONFIG.adminEmail}`}
                              className="text-primary hover:underline"
                            >
                              Contact support
                            </a>
                          </p>
                        </div>
                      </div>
                    )}
                    {ndaEmbedSrc && (
                      <PandaDocSigningPanel
                        embedUrl={ndaEmbedSrc}
                        onCompleted={() => setNdaSigned(true)}
                        title=""
                        description=""
                      />
                    )}

                    <p className="text-[11px] text-muted-foreground text-center">
                      Questions about the NDA? Email{' '}
                      <a
                        href={`mailto:${APP_CONFIG.adminEmail}`}
                        className="text-primary hover:underline"
                      >
                        {APP_CONFIG.adminEmail}
                      </a>{' '}
                      — a small percentage of buyers request modifications and we're happy to
                      discuss.
                    </p>
                  </div>
                )}
                {(ndaStatus?.ndaSigned || ndaSigned) && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-4 text-center space-y-1">
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <p className="text-sm font-semibold text-green-800">
                        NDA signed. You're ready.
                      </p>
                    </div>
                    <p className="text-xs text-green-700">
                      The moment your account is approved, you'll have full access to every deal in
                      the pipeline — real financials, owner details, and the ability to request
                      introductions. We'll email you the second you're cleared.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Progress Timeline */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-center">Account Setup Progress</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Account Created</p>
                        <p className="text-xs text-muted-foreground">
                          Your account has been created
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
                        <Mail className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Email Verification</p>
                        <p className="text-xs text-muted-foreground">
                          Check your inbox and click the verification link
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-muted-foreground">Admin Approval</p>
                        <p className="text-xs text-muted-foreground">Final review by our team</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-md p-4">
                  <div className="flex gap-3 items-start">
                    <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">After you verify:</p>
                      <ol className="text-xs text-muted-foreground mt-2 space-y-1 list-decimal list-inside">
                        <li>Our team reviews your application — usually same day</li>
                        <li>You'll sign a single NDA that covers every deal on the platform</li>
                        <li>Full access to off-market deals the moment you're cleared</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="bg-muted/40 border border-border rounded-md p-4">
                  <h4 className="text-sm font-medium mb-2">What you're getting access to</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    SourceCo works exclusively with off-market, founder-led businesses. Every deal
                    in the pipeline has been sourced, qualified, and reviewed by our team before it
                    reaches you. You're not browsing a listing aggregator — you're accessing curated
                    deal flow.
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    Want deals sourced directly for your specific thesis?{' '}
                    <a
                      href="https://www.sourcecodeals.com/private-equity"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Learn about our retained search →
                    </a>
                  </p>
                </div>
              </>
            )}

            <div className="text-sm text-center text-muted-foreground">
              {uiState === 'rejected'
                ? 'You can create a new account or contact our team to discuss your options.'
                : uiState === 'approved_pending'
                  ? "We aim to review all applications within one business day. Signing your NDA now means you'll have full access the moment you're approved."
                  : 'After verification, our team will review your application — usually within one business day.'}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            {uiState === 'approved_pending' && (
              <Button
                onClick={handleCheckStatus}
                disabled={isCheckingStatus || checkCooldown}
                className="w-full"
              >
                {isCheckingStatus ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Check Approval Status
                  </>
                )}
              </Button>
            )}
            {uiState !== 'approved_pending' && (
              <Button onClick={handleResendVerification} disabled={isResending} className="w-full">
                {isResending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Resend Verification Email'
                )}
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full flex items-center gap-2"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing out...
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </>
              )}
            </Button>
            <div className="bg-muted/30 border border-border rounded-md p-3 text-center">
              <p className="text-xs text-muted-foreground">
                Questions? Reach out to our team at{' '}
                <a
                  href={`mailto:${APP_CONFIG.adminEmail}`}
                  className="text-primary font-medium hover:underline"
                >
                  {APP_CONFIG.adminEmail}
                </a>
              </p>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default PendingApproval;
