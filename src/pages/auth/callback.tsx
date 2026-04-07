import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useVerificationSuccessEmail } from '@/hooks/auth/use-verification-success-email';
import { selfHealProfile } from '@/lib/profile-self-heal';
import type { User as SupabaseUser } from '@supabase/supabase-js';

/**
 * Parse auth tokens from the URL hash fragment.
 * Returns null if no access_token is found.
 */
function parseHashTokens(): { access_token: string; refresh_token: string } | null {
  const hash = window.location.hash.substring(1); // remove leading #
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

/**
 * Get PKCE code from query string.
 */
function getPKCECode(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('code');
}

export default function AuthCallback() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { sendVerificationSuccessEmail } = useVerificationSuccessEmail();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        let authUser: SupabaseUser | null = null;

        const hashTokens = parseHashTokens();
        const pkceCode = getPKCECode();

        if (hashTokens) {
          // Clear any existing local session to avoid conflicts
          await supabase.auth.signOut({ scope: 'local' });

          // Directly set the session using the tokens from the URL hash
          const { data, error: setSessionError } = await supabase.auth.setSession({
            access_token: hashTokens.access_token,
            refresh_token: hashTokens.refresh_token,
          });
          if (setSessionError) throw setSessionError;
          authUser = data.user;
        } else if (pkceCode) {
          // Clear any existing local session to avoid conflicts
          await supabase.auth.signOut({ scope: 'local' });

          // Exchange the PKCE code for a session
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(pkceCode);
          if (exchangeError) throw exchangeError;
          authUser = data.user;
        } else {
          // No tokens in URL - just check the existing session
          const { data: { user }, error: getUserError } = await supabase.auth.getUser();
          if (getUserError) throw getUserError;
          authUser = user;
        }

        if (authUser) {
          // Get latest profile data
          const { data: fetchedProfile, error: profileError } = await supabase
            .from('profiles')
            .select('email_verified, approval_status, is_admin, first_name, last_name, email')
            .eq('id', authUser.id)
            .single();

          // Self-healing: if profile missing, create one from auth metadata
          const profile =
            !fetchedProfile && (profileError?.code === 'PGRST116' || !profileError)
              ? await selfHealProfile(
                  authUser,
                  'email_verified, approval_status, is_admin, first_name, last_name, email',
                )
              : fetchedProfile;

          // Check if this is a fresh email verification
          const emailConfirmed = !!authUser.email_confirmed_at;

          // Send verification success email if user just verified their email
          if (emailConfirmed && profile) {
            try {
              await sendVerificationSuccessEmail({
                email: profile.email as string,
                firstName: (profile.first_name || '') as string,
                lastName: (profile.last_name || '') as string,
              });
            } catch (emailError) {
              console.error('Failed to send verification success email:', emailError);
            }

            // Also send branded email_verified notification
            const userName =
              `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'there';
            supabase.functions
              .invoke('user-journey-notifications', {
                body: {
                  event_type: 'email_verified',
                  user_id: authUser.id,
                  user_email: profile.email as string,
                  user_name: userName,
                },
              })
              .catch((err) => {
                console.error('Failed to send email_verified journey notification:', err);
              });
          }

          if (emailConfirmed && profile?.approval_status === 'approved') {
            navigate(profile.is_admin ? '/admin' : '/');
          } else {
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
        <Button onClick={() => navigate('/login')}>Back to Login</Button>
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
