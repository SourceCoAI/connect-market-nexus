import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, isLoading, authChecked, login } = useAuth();
  const navigate = useNavigate();

  // Simple redirect if already logged in - route based on approval status
  useEffect(() => {
    if (authChecked && user) {
      let redirectPath = '/marketplace';
      if (user.is_admin) {
        redirectPath = '/admin';
      } else if (user.approval_status !== 'approved') {
        redirectPath = '/pending-approval';
      }
      navigate(redirectPath, { replace: true });
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
        description: 'You have successfully logged in.',
      });
    } catch (err: unknown) {
      // Error logged by error handler
      setError((err as Error).message || 'Failed to sign in');
      toast({
        variant: 'destructive',
        title: 'Login failed',
        description: (err as Error).message || 'Please check your credentials and try again',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Simple loading state
  if (!authChecked && isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Centered Logo Header */}
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
              <span className="text-sm text-muted-foreground font-light ml-1.5">Marketplace</span>
            </div>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 pb-12">
        <div className="max-w-md mx-auto pt-8">
          <Card className="border-none shadow-lg">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl font-semibold text-center">
                Sign in to Marketplace
              </CardTitle>
              <CardDescription className="text-xs text-center">
                Enter your email and password to access your account
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
                  <label htmlFor="email" className="text-xs font-medium">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-xs font-medium">
                      Password
                    </label>
                    <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
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
                  {isSubmitting ? 'Signing in...' : 'Sign in'}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <div className="text-xs text-center text-muted-foreground">
                <span>Don't have an account? </span>
                <Link to="/welcome" className="text-primary font-medium hover:underline">
                  Get started
                </Link>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Login;
