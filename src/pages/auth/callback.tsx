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

function parseHashTokens(): { access_token: string; refresh_token: string } | null {
  if (!CAPTURED_HASH) return null;
  const params = new URLSearchParams(CAPTURED_HASH);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

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
      const profileColumns = 'email_verified, approval_status, is_admin, first_name, last_name, email';

      const fetchProfile = async (authUser: SupabaseUser): Promise<Record<string, unknown> | null> => {
        const { data: fetchedProfile, error: profileError } = await supabase
          .from('profiles')
          .select(profileColumns)
          .eq('id', authUser.id)
          .single();

        if (!fetchedProfile && (profileError?.code === 'PGRST116' || !profileError)) {
          return selfHealProfile(authUser, profileColumns);
        }

        if (profileError) throw profileError;
        return fetchedProfile as Record<string, unknown>;
      };

      try {
        let authUser: SupabaseUser | null = null;

        const hashTokens = parseHashTokens();
        const pkceCode = getPKCECode();

        if (hashTokens) {
          const { data, error: setSessionError } = await supabase.auth.setSession({
            access_token: hashTokens.access_token,
            refresh_token: hashTokens.refresh_token,
          });
          if (setSessionError) throw setSessionError;
          authUser = data.user;
        } else if (pkceCode) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(pkceCode);
          if (exchangeError) throw exchangeError;
          authUser = data.user;
        } else {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
          authUser = session?.user ?? null;
        }

        if (authUser) {
          const emailConfirmed = !!authUser.email_confirmed_at;
          let profile = await fetchProfile(authUser);

          console.info('[auth/callback] Session resolved', {
            userId: authUser.id,
            emailConfirmed,
            profileEmailVerified: profile?.email_verified,
            approvalStatus: profile?.approval_status,
          });

          // Wait for DB trigger sync if auth says verified but profile hasn't caught up
          if (emailConfirmed && !profile?.email_verified) {
            console.info('[auth/callback] Profile not yet synced, retrying...');
            for (let attempt = 1; attempt <= 5; attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
              profile = await fetchProfile(authUser);
              console.info(`[auth/callback] Retry ${attempt}/5: profile.email_verified=${profile?.email_verified}`);
              if (profile?.email_verified) break;
            }

            if (!profile?.email_verified) {
              console.warn('[auth/callback] Profile still not synced after 5 retries. Auth says verified, profile says false.');
            }
          }

          // Route decision
          if (emailConfirmed && profile?.approval_status === 'approved') {
            // Check if this is a portal magic link redirect
            const hashParams = new URLSearchParams(CAPTURED_HASH);
            const redirectTo = hashParams.get('redirect_to') || hashParams.get('redirect_url') || hashParams.get('redirectTo');
            const searchParams = new URLSearchParams(CAPTURED_SEARCH);
            const redirectParam = searchParams.get('redirect_to') || searchParams.get('redirect') || searchParams.get('next');
            const portalRedirect = [redirectTo, redirectParam]
              .find((url) => url && url.startsWith('/portal/'));

            if (portalRedirect) {
              navigate(portalRedirect);
            } else {
              navigate(profile.is_admin ? '/admin' : '/');
            }
          } else {
            navigate('/pending-approval');
          }

          // Fire-and-forget: send verification success email ONLY if profile is confirmed synced
          if (emailConfirmed && profile?.email_verified && profile) {
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
          setIsConsumedLink(true);
          setIsLoading(false);
          return;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Authentication failed';
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
  }, [navigate, sendVerificationSuccessEmail]);

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
