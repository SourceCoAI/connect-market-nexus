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
  FileSignature,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cleanupAuthState } from '@/lib/auth-helpers';
import { APP_CONFIG } from '@/config/app';
import { useMyAgreementStatus } from '@/hooks/use-agreement-status';
import { AgreementSigningModal } from '@/components/pandadoc/AgreementSigningModal';

const PendingApproval = () => {
  const navigate = useNavigate();
  const { user, isLoading, refreshUserProfile } = useAuth();
  const [isResending, setIsResending] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [checkCooldown, setCheckCooldown] = useState(false);
  const [signingOpen, setSigningOpen] = useState(false);
  const [signingType, setSigningType] = useState<'nda' | 'fee_agreement'>('nda');

  const { data: agreementStatus } = useMyAgreementStatus(!!user);
  const hasAnyAgreement = agreementStatus?.fee_covered;

  // Auto-poll approval status every 30s
  useEffect(() => {
    if (user?.approval_status === 'approved' || user?.approval_status === 'rejected') return;
    const interval = setInterval(() => {
      refreshUserProfile().catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [user?.approval_status, refreshUserProfile]);

  // Handle navigation for approved users
  useEffect(() => {
    if (user?.approval_status === 'approved') {
      if (!hasAnyAgreement) {
        return; // Stay on page for agreement signing
      }
      navigate('/', { replace: true });
    }
  }, [user?.approval_status, hasAnyAgreement, navigate]);

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
      toast({ title: 'Email already verified', description: 'Your email is already verified.' });
      return;
    }
    setIsResending(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
        options: { emailRedirectTo: `${window.location.origin}/pending-approval` },
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

  const openSigning = (type: 'nda' | 'fee_agreement') => {
    setSigningType(type);
    setSigningOpen(true);
  };

  const getUIState = () => {
    if (user?.approval_status === 'rejected') return 'rejected';
    else if (user?.email_verified) return 'approved_pending';
    else return 'email_not_verified';
  };

  const uiState = getUIState();

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/30">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center space-y-3">
          <div className="flex items-center">
            <img src="/lovable-uploads/b879fa06-6a99-4263-b973-b9ced4404acb.png" alt="SourceCo Logo" className="h-10 w-10 mr-3" />
            <div className="text-center">
              <h1 className="text-2xl font-bold">SourceCo</h1>
              <p className="text-lg text-muted-foreground font-light">Marketplace</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <div className="flex justify-center mb-4">
              <div className={`p-3 rounded-full ${uiState === 'rejected' ? 'bg-destructive/10' : uiState === 'approved_pending' ? 'bg-green-100' : 'bg-primary/10'}`}>
                {uiState === 'rejected' ? <XCircle className="h-8 w-8 text-destructive" /> : uiState === 'approved_pending' ? <CheckCircle className="h-8 w-8 text-green-600" /> : <Mail className="h-8 w-8 text-primary" />}
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-center">
              {uiState === 'rejected' ? 'Application Not Approved' : uiState === 'approved_pending' ? "You're in the queue — sign an agreement for immediate access" : 'Almost there — verify your email to continue'}
            </CardTitle>
            <CardDescription className="text-center">
              {uiState === 'rejected' ? 'Unfortunately, your application was not approved at this time' : uiState === 'approved_pending' ? "Our team reviews applications same day. Sign an NDA or Fee Agreement now so you have immediate access the moment you're cleared." : `We've sent a verification link to ${user.email}. Click it to continue — check your spam folder if you don't see it within a few minutes.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {uiState === 'rejected' ? (
              <>
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
                  <div className="flex gap-3 items-center">
                    <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                    <p className="text-sm text-destructive">Your application did not meet our current criteria.</p>
                  </div>
                </div>
                <div className="bg-muted/50 border border-border rounded-md p-4">
                  <div className="flex gap-3 items-start">
                    <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">What can you do?</p>
                      <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                        <li>Contact our team for more details</li>
                        <li>Update your profile and reapply</li>
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
                      <p className="text-amber-800 text-sm font-medium">Sign an agreement to unlock the full deal pipeline</p>
                      <p className="text-amber-700 text-xs mt-1">One signature covers every deal on SourceCo — now and in the future.</p>
                    </div>
                  </div>
                </div>

                {/* Submitted Info */}
                <div className="bg-muted/40 border border-border rounded-md p-4 space-y-2">
                  <h4 className="text-sm font-medium">Submitted Information</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{user.first_name} {user.last_name}</span>
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium truncate">{user.email}</span>
                    {user.company && (<><span className="text-muted-foreground">Company</span><span className="font-medium">{user.company}</span></>)}
                    <span className="text-muted-foreground">Buyer Type</span>
                    <span className="font-medium capitalize">{user.buyer_type?.replace(/([A-Z])/g, ' $1').trim() || 'N/A'}</span>
                  </div>
                </div>

                {/* Review Timeline */}
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <div className="flex gap-3 items-start">
                    <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Estimated Review Time</p>
                      <p className="text-xs text-blue-700 mt-1">Most applications are reviewed within <strong>1 business day</strong>.</p>
                    </div>
                  </div>
                </div>

                {/* Progress */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-center">Application Progress</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center"><CheckCircle className="w-4 h-4 text-white" /></div>
                      <div className="flex-1"><p className="text-sm font-medium">Account Created</p><p className="text-xs text-muted-foreground">Your account has been successfully created</p></div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center"><CheckCircle className="w-4 h-4 text-white" /></div>
                      <div className="flex-1"><p className="text-sm font-medium">Email Verified</p><p className="text-xs text-muted-foreground">Your email address has been confirmed</p></div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center"><Clock className="w-4 h-4 text-white" /></div>
                      <div className="flex-1"><p className="text-sm font-medium">Admin Review</p><p className="text-xs text-muted-foreground">Pending approval from our team</p></div>
                    </div>
                  </div>
                </div>

                {/* Agreement Signing Section — email-based */}
                {!hasAnyAgreement && (
                  <div className="space-y-4 pt-2">
                    <div className="text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <Shield className="h-4 w-4 text-primary" />
                        <h4 className="text-sm font-semibold">Sign an Agreement</h4>
                      </div>
                    </div>

                    <div className="bg-muted/40 border border-border rounded-md p-4">
                      <h5 className="text-xs font-semibold mb-1">What your agreement unlocks</h5>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Every deal on SourceCo is live, real, and confidential — actual financials, real business names, real owner details. Your agreement opens the door to all of it.
                      </p>
                    </div>

                    <div className="bg-muted/40 border border-border rounded-md p-4">
                      <h5 className="text-xs font-semibold mb-1">What you're agreeing to</h5>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        You agree to keep deal details confidential and only use them to evaluate a potential acquisition. One signature covers every deal on SourceCo.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Button
                        className="w-full"
                        onClick={() => openSigning('nda')}
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        Request NDA via Email
                      </Button>

                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => openSigning('fee_agreement')}
                      >
                        <FileSignature className="h-4 w-4 mr-2" />
                        Request Fee Agreement via Email
                      </Button>
                    </div>

                    <p className="text-[11px] text-muted-foreground text-center">
                      Questions? Email{' '}
                      <a href={`mailto:${APP_CONFIG.adminEmail}`} className="text-primary hover:underline">{APP_CONFIG.adminEmail}</a>
                    </p>
                  </div>
                )}
                {hasAnyAgreement && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-4 text-center space-y-1">
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <p className="text-sm font-semibold text-green-800">Agreement signed. You're ready.</p>
                    </div>
                    <p className="text-xs text-green-700">The moment your account is approved, you'll have full access.</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-center">Account Setup Progress</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center"><CheckCircle className="w-4 h-4 text-white" /></div>
                      <div className="flex-1"><p className="text-sm font-medium">Account Created</p><p className="text-xs text-muted-foreground">Your account has been created</p></div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center"><Mail className="w-4 h-4 text-white" /></div>
                      <div className="flex-1"><p className="text-sm font-medium">Email Verification</p><p className="text-xs text-muted-foreground">Check your inbox and click the verification link</p></div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center"><Clock className="w-4 h-4 text-muted-foreground" /></div>
                      <div className="flex-1"><p className="text-sm font-medium text-muted-foreground">Admin Approval</p><p className="text-xs text-muted-foreground">Final review by our team</p></div>
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
                        <li>You'll sign an agreement (NDA or Fee Agreement) that covers every deal</li>
                        <li>Full access to off-market deals the moment you're cleared</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="bg-muted/40 border border-border rounded-md p-4">
                  <h4 className="text-sm font-medium mb-2">What you're getting access to</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    SourceCo works exclusively with off-market, founder-led businesses. Every deal has been sourced, qualified, and reviewed by our team before it reaches you.
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    Want deals sourced directly for your specific thesis?{' '}
                    <a href="https://www.sourcecodeals.com/private-equity" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Learn about our retained search →</a>
                  </p>
                </div>
              </>
            )}

            <div className="text-sm text-center text-muted-foreground">
              {uiState === 'rejected' ? 'You can create a new account or contact our team.' : uiState === 'approved_pending' ? "We aim to review all applications within one business day." : 'After verification, our team will review your application.'}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            {uiState === 'approved_pending' && (
              <Button onClick={handleCheckStatus} disabled={isCheckingStatus || checkCooldown} className="w-full">
                {isCheckingStatus ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking...</>) : (<><RefreshCw className="mr-2 h-4 w-4" />Check Approval Status</>)}
              </Button>
            )}
            {uiState !== 'approved_pending' && (
              <Button onClick={handleResendVerification} disabled={isResending} className="w-full">
                {isResending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>) : 'Resend Verification Email'}
              </Button>
            )}
            <Button variant="outline" className="w-full flex items-center gap-2" onClick={handleLogout} disabled={isLoggingOut}>
              {isLoggingOut ? (<><Loader2 className="h-4 w-4 animate-spin" />Signing out...</>) : (<><LogOut className="h-4 w-4" />Sign out</>)}
            </Button>
            <div className="bg-muted/30 border border-border rounded-md p-3 text-center">
              <p className="text-xs text-muted-foreground">
                Questions? Reach out at{' '}
                <a href={`mailto:${APP_CONFIG.adminEmail}`} className="text-primary font-medium hover:underline">{APP_CONFIG.adminEmail}</a>
              </p>
            </div>
          </CardFooter>
        </Card>
      </div>

      <AgreementSigningModal
        open={signingOpen}
        onOpenChange={setSigningOpen}
        documentType={signingType}
      />
    </div>
  );
};

export default PendingApproval;
