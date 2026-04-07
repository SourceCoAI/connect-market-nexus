import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Mail, ArrowRight, Clock, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { CountdownTimer } from '@/components/ui/countdown-timer';
import { APP_CONFIG } from '@/config/app';

const SignupSuccess = () => {
  const [searchParams] = useSearchParams();
  const [isResending, setIsResending] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [rateLimitRemaining, setRateLimitRemaining] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const email = searchParams.get('email') || '';

  useEffect(() => {
    // Check if email is already verified (rare but possible)
    const checkEmailStatus = async () => {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (user?.email_confirmed_at) {
          setEmailVerified(true);
        }
      } catch (error) {
        // Ignore - user not logged in yet
      }
    };

    checkEmailStatus();
  }, []);

  const handleResendVerification = async () => {
    if (!email) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No email address found. Please try signing up again.',
      });
      return;
    }

    setIsResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      toast({
        title: 'Email sent!',
        description: "We've sent another verification email. If you don't receive it, your email may already be verified - try logging in.",
      });
    } catch (error: unknown) {
      console.error('Resend verification error:', error);

      setAttemptCount((prev) => prev + 1);

      let errorMessage = 'Failed to resend verification email. Please try again.';
      let waitTime = 60; // Default 60 seconds

      if ((error as Error).message?.includes('already verified')) {
        errorMessage = 'Your email is already verified! You can now log in.';
        setEmailVerified(true);
      } else if (
        (error as Error).message?.includes('rate limit') ||
        (error as Error).message?.includes('too many requests')
      ) {
        // Parse rate limit time from error message if possible
        const timeMatch = (error as Error).message.match(/(\d+)\s*(second|minute)/i);
        if (timeMatch) {
          const time = parseInt(timeMatch[1]);
          waitTime = timeMatch[2].toLowerCase() === 'minute' ? time * 60 : time;
        }

        setRateLimitRemaining(waitTime);
        errorMessage = `Please wait ${waitTime} seconds before requesting another email.`;

        if (attemptCount > 0) {
          errorMessage += ` This is attempt ${attemptCount + 1}.`;
        }
      }

      toast({
        variant: (error as Error).message?.includes('already verified') ? 'default' : 'destructive',
        title: (error as Error).message?.includes('already verified')
          ? 'Already verified'
          : 'Rate Limited',
        description: errorMessage,
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <Card className="border-0 shadow-lg">
          <CardHeader className="text-center space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-4">
                <CheckCircle className="h-12 w-12 text-primary" />
              </div>
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-center">
                Account Created Successfully!
              </CardTitle>
              <CardDescription className="text-center mt-2">
                Welcome to the marketplace! Here's what happens next:
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Progress Steps */}
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="rounded-full bg-primary p-1.5">
                  <CheckCircle className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">Account Created</p>
                  <p className="text-xs text-muted-foreground">✓ Completed</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className={`rounded-full p-1.5 ${emailVerified ? 'bg-primary' : 'bg-muted'}`}>
                  <Mail
                    className={`h-4 w-4 ${emailVerified ? 'text-primary-foreground' : 'text-muted-foreground'}`}
                  />
                </div>
                <div>
                  <p className="font-medium text-sm">Email Verification</p>
                  <p className="text-xs text-muted-foreground">
                    {emailVerified ? '✓ Verified' : 'Check your email inbox'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="rounded-full bg-muted p-1.5">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">Admin Approval</p>
                  <p className="text-xs text-muted-foreground">Typically within 24 hours</p>
                </div>
              </div>
            </div>

            {/* What's Next Section */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-primary" />
                <p className="font-medium text-sm">What happens next?</p>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong>1. Check your email</strong> - Click the verification link we sent to{' '}
                  {email}
                </p>
                <p>
                  <strong>2. Admin review</strong> - Our team will approve your account (usually
                  within 24 hours)
                </p>
                <p>
                  <strong>3. Get notified</strong> - You'll receive an email when your account is
                  approved
                </p>
                <p>
                  <strong>4. Start browsing</strong> - Access thousands of business listings once
                  approved
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              {!emailVerified && (
                <div className="space-y-2">
                  <Button
                    onClick={handleResendVerification}
                    disabled={isResending || rateLimitRemaining > 0}
                    variant="outline"
                    className="w-full"
                  >
                    {isResending ? (
                      <>
                        <Clock className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : rateLimitRemaining > 0 ? (
                      <>
                        <Clock className="h-4 w-4 mr-2" />
                        Resend Email{' '}
                        <CountdownTimer seconds={rateLimitRemaining} variant="compact" />
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        Resend Verification Email
                        {attemptCount > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (Attempt {attemptCount + 1})
                          </span>
                        )}
                      </>
                    )}
                  </Button>

                  {rateLimitRemaining > 0 && (
                    <CountdownTimer
                      seconds={rateLimitRemaining}
                      onComplete={() => setRateLimitRemaining(0)}
                      className="justify-center text-center p-2 bg-muted/30 rounded-md"
                    />
                  )}

                  {attemptCount > 1 && (
                    <div className="text-xs text-muted-foreground text-center p-2 bg-amber-50 dark:bg-amber-950/20 rounded-md">
                      💡 <strong>Tip:</strong> Check your spam folder. If you still don't receive
                      an email, your account may already be verified -{' '}
                      <Link to="/login" className="text-primary hover:underline">
                        try logging in
                      </Link>
                      .
                    </div>
                  )}
                </div>
              )}

              <Link to="/login" className="block">
                <Button className="w-full">
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {emailVerified ? 'Continue to Login' : "I'll verify later - Take me to Login"}
                </Button>
              </Link>
            </div>

            {/* Support */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                Need help? Contact us at{' '}
                <a
                  href={`mailto:${APP_CONFIG.adminEmail}`}
                  className="text-primary hover:underline"
                >
                  {APP_CONFIG.adminEmail}
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SignupSuccess;
