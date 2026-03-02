
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useVerificationSuccessEmail } from '@/hooks/auth/use-verification-success-email';
import { selfHealProfile } from '@/lib/profile-self-heal';

export default function AuthCallback() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { sendVerificationSuccessEmail } = useVerificationSuccessEmail();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // SECURITY: Use getUser() for server-side validation instead of getSession()
        // getSession() trusts the local JWT; getUser() verifies with Supabase Auth server
        const { data: { user: authUser }, error } = await supabase.auth.getUser();

        if (error) {
          throw error;
        }

        if (authUser) {
          // Get latest profile data to see if verification was successful
          const { data: fetchedProfile, error: profileError } = await supabase
            .from('profiles')
            .select('email_verified, approval_status, is_admin, first_name, last_name, email')
            .eq('id', authUser.id)
            .single();

          // Self-healing: if profile missing, create one from auth metadata
          const profile = (!fetchedProfile && (profileError?.code === 'PGRST116' || !profileError))
            ? await selfHealProfile(authUser, 'email_verified, approval_status, is_admin, first_name, last_name, email')
            : fetchedProfile;

          // Check if this is a fresh email verification (user just verified their email)
          const userJustVerified = authUser.email_confirmed_at && profile?.email_verified;
          
          // Send verification success email if user just verified their email
          if (userJustVerified && profile) {
            try {
              await sendVerificationSuccessEmail({
                email: profile.email as string,
                firstName: (profile.first_name || '') as string,
                lastName: (profile.last_name || '') as string
              });
            } catch (emailError) {
              // Don't block the flow if email fails - just log it
              console.error('Failed to send verification success email:', emailError);
            }

            // Also send branded email_verified notification via user-journey-notifications
            const userName = `${(profile.first_name || '')} ${(profile.last_name || '')}`.trim() || 'there';
            supabase.functions.invoke('user-journey-notifications', {
              body: {
                event_type: 'email_verified',
                user_id: authUser.id,
                user_email: profile.email as string,
                user_name: userName,
              },
            }).catch((err) => {
              console.error('Failed to send email_verified journey notification:', err);
            });
          }

          if (profile?.email_verified && profile?.approval_status === 'approved') {
            // Fully approved user - go to app
            navigate(profile.is_admin ? '/admin' : '/');
          } else {
            // Not fully approved yet - always go to pending approval
            // This handles both: email not verified OR email verified but waiting for admin approval
            navigate('/pending-approval');
          }
        } else {
          navigate('/login');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
      } finally {
        setIsLoading(false);
      }
    };

    handleCallback();
  }, [navigate]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 mb-4">Authentication error: {error}</div>
        <Button onClick={() => navigate('/login')}>
          Back to Login
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
        <h1 className="text-2xl font-bold mb-2">Processing authentication...</h1>
        <p className="text-muted-foreground">Please wait...</p>
      </div>
    );
  }

  return null;
}
