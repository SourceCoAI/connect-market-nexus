/**
 * Dedicated /admin-login entry point for internal SourceCo team members.
 *
 * Identical auth flow as /login but branded for internal use and redirects
 * directly to /admin on success.
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { AlertCircle, Eye, EyeOff, Shield } from 'lucide-react';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, isLoading, authChecked, login } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (authChecked && user) {
      if (user.is_admin) {
        navigate('/admin', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    }
  }, [user, authChecked, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    if (!email.trim() || !password) {
      setError('Email and password are required');
      setIsSubmitting(false);
      return;
    }

    try {
      await login(email, password);
      toast({
        title: 'Welcome back',
        description: 'Redirecting to admin panel...',
      });
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to sign in');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!authChecked && isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-12 h-12 border-4 border-t-slate-800 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="w-full py-6 px-4">
        <div className="max-w-5xl mx-auto flex justify-center">
          <Link to="/welcome" className="flex items-center space-x-2">
            <img
              src="/lovable-uploads/b879fa06-6a99-4263-b973-b9ced4404acb.png"
              alt="SourceCo Logo"
              className="h-8 w-8"
            />
            <div className="flex items-baseline">
              <span className="text-xl font-semibold tracking-tight">SourceCo</span>
              <span className="text-sm text-muted-foreground font-light ml-1.5">Admin</span>
            </div>
          </Link>
        </div>
      </header>

      {/* Login card */}
      <div className="flex-1 flex items-start justify-center pt-8 px-4">
        <div className="w-full max-w-md">
          <Card className="border-none shadow-lg">
            <CardHeader className="space-y-1">
              <div className="flex justify-center mb-2">
                <div className="p-2.5 rounded-full bg-slate-100">
                  <Shield className="h-6 w-6 text-slate-700" />
                </div>
              </div>
              <CardTitle className="text-xl font-semibold text-center">
                Internal Team Login
              </CardTitle>
              <CardDescription className="text-xs text-center">
                Sign in with your SourceCo team credentials
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-destructive/15 p-3 rounded-md flex items-start gap-2 text-xs text-destructive">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>{error}</div>
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="admin-email" className="text-xs font-medium">
                    Email
                  </label>
                  <Input
                    id="admin-email"
                    type="email"
                    placeholder="you@sourcecodeals.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="admin-password" className="text-xs font-medium">
                      Password
                    </label>
                    <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="--------"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isSubmitting}
                      className="text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? 'Signing in...' : 'Sign in to Admin'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-xs text-center text-muted-foreground mt-6">
            Not a team member?{' '}
            <Link to="/login" className="text-primary font-medium hover:underline">
              Buyer login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
