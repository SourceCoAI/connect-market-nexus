import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useVerificationSuccessEmail } from '@/hooks/auth/use-verification-success-email';
import { selfHealProfile } from '@/lib/profile-self-heal';
import type { User as SupabaseUser } from '@supabase/supabase-js';

// CRITICAL: Capture URL fragments at MODULE LOAD TIME, before the Supabase
// client's async _initialize() can consume and clear them via history.replaceState().
const CAPTURED_HASH = window.location.hash.substring(1);
const CAPTURED_SEARCH = window.location.search;

/**
 * Parse auth tokens from the captured URL hash fragment.
 */
function parseHashTokens(): { access_token: string; refresh_token: string } | null {
  if (!CAPTURED_HASH) return null;
  const params = new URLSearchParams(CAPTURED_HASH);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

/**
 * Get PKCE code from captured query string.
 */
function getPKCECode(): string | null {
  const params = new URLSearchParams(CAPTURED_SEARCH);
  return params.get('code');
}

export default function AuthCallback() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConsumedLink, setIsConsumedLink] = useState(false);
  const navigate = useNavigate();
  const { sendVerificationSuccessEmail } = useVerificationSuccessEmail();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        let authUser: SupabaseUser | null = null;

        const hashTokens = parseHashTokens();
        const pkceCode = getPKCECode();

        if (hashTokens) {
          // Directly set the session using tokens from the URL hash.
          // DO NOT call signOut first — that destroys the session Supabase just created.
          const { data, error: setSessionError } = await supabase.auth.setSession({
            access_token: hashTokens.access_token,
            refresh_token: hashTokens.refresh_token,
          });
          if (setSessionError) throw setSessionError;
          authUser = data.user;
        } else if (pkceCode) {
          // Exchange the PKCE code for a session — no signOut first.
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(pkceCode);
          if (exchangeError) throw exchangeError;
          authUser = data.user;
        } else {
          // No tokens in URL — Supabase may have already consumed them and
          // established a session automatically. Check the existing session.
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
          authUser = session?.user ?? null;
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

          // Navigate FIRST, then fire emails in the background
          const emailConfirmed = !!authUser.email_confirmed_at;

          // Sync profiles.email_verified with auth.users.email_confirmed_at
          if (emailConfirmed) {
            await supabase
              .from('profiles')
              .update({ email_verified: true })
              .eq('id', authUser.id)
              .eq('email_verified', false);
          }

          if (emailConfirmed && profile?.approval_status === 'approved') {
            navigate(profile.is_admin ? '/admin' : '/');
          } else {
            navigate('/pending-approval');
          }

          // Fire-and-forget: send verification success email + journey notification
          if (emailConfirmed && profile) {
            sendVerificationSuccessEmail({
              email: profile.email as string,
              firstName: (profile.first_name || '') as string,
              lastName: (profile.last_name || '') as string,
            }).catch((emailError) => {
              console.error('Failed to send verification success email:', emailError);
            });

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
        } else {
          // No user found at all — the link may have already been consumed
          setIsConsumedLink(true);
          setIsLoading(false);
          return;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Authentication failed';
        // If the error indicates an expired/consumed token, show friendly UI
        if (
          message.includes('expired') ||
          message.includes('invalid') ||
          message.includes('already been used') ||
          message.includes('flow_state_not_found')
        ) {
          setIsConsumedLink(true);
        } else {
          setError(message);
        }
      } finally {
        setIsLoading(false);
      }
    };

    handleCallback();
  }, [navigate]);

  if (isConsumedLink) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-center max-w-md space-y-4">
          <h1 className="text-2xl font-bold">Verification link already used</h1>
          <p className="text-muted-foreground">
            This verification link has already been processed. Your email may already be verified.
          </p>
          <Link to="/login">
            <Button className="w-full">Go to Login</Button>
          </Link>
        </div>
      </div>
    );
  }

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
