import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { AuthLayout } from '@/components/layout/AuthLayout';
import bradDaughertyImage from '@/assets/brad-daugherty.png';
import sfcLogo from '@/assets/sfc-logo.png';

const Welcome = () => {
  const { user, authChecked } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect authenticated users away
  useEffect(() => {
    if (authChecked && user) {
      const redirectPath = user.is_admin ? '/admin' : '/';
      navigate(redirectPath, { replace: true });
    }
  }, [user, authChecked, navigate]);

  const rightContent = (
    <div className="space-y-8 pr-8">
      {/* Welcome Header */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Welcome to SourceCo
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          SourceCo is a private marketplace connecting qualified acquirers with off-market business
          opportunities in the $1M-$50M revenue range.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We source deals directly from owners considering an exit - before they go to brokers or
          public listings. Whether you're looking to acquire a company or exploring what your
          business might be worth, our network provides access without the noise.
        </p>
      </div>

      {/* Testimonial */}
      <Card className="bg-background/80 border border-border/50 shadow-sm">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start space-x-3">
            <div className="w-9 h-9 rounded-full overflow-hidden bg-muted flex-shrink-0">
              <img
                src={bradDaughertyImage}
                alt="Brad Daughterty"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-2 flex-1 relative">
              <blockquote className="text-xs text-foreground leading-relaxed italic">
                "SourceCo's technology-driven sourcing process consistently delivered a robust
                pipeline of qualified opportunities, resulting in multiple LOIs and a closed deal
                with more to come."
              </blockquote>
              <div className="space-y-0.5">
                <div className="text-xs font-medium text-foreground">Brad Daughterty</div>
                <div className="text-[11px] text-muted-foreground">
                  CFO,{' '}
                  <a
                    href="https://sportsfacilities.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    Sports Facilities Companies
                  </a>
                </div>
              </div>
              <div className="absolute bottom-0 right-0">
                <img
                  src={sfcLogo}
                  alt="Sports Facilities Companies"
                  className="h-5 w-auto opacity-60"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Value Props */}
      <div className="space-y-3 text-xs text-muted-foreground">
        <div className="flex items-center space-x-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
          <span>2,000+ business owners in our network</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
          <span>$1M - $50M+ revenue companies</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
          <span>Direct owner conversations, no brokers</span>
        </div>
      </div>
    </div>
  );

  return (
    <AuthLayout rightContent={rightContent}>
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground leading-tight">
            Access Off-Market Businesses Before They Go to Market
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
            SourceCo sources deals directly from owners in the $1M–$50M revenue range — before they
            engage a broker or list publicly. Qualified buyers get exclusive, early access.
          </p>
        </div>

        {/* Persona Selection Cards */}
        <div className="space-y-3">
          {/* Buyer Card */}
          <Link to={`/signup${location.search}`} className="group block">
            <Card className="border border-border/60 hover:border-primary/30 hover:shadow-md transition-all duration-200 cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      I'm Looking to Acquire
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                      Curated deal flow from 2,000+ business owners — verified financials, complete
                      data rooms, no auction process. Apply for access and we'll review your profile
                      within one business day.
                    </p>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    <div className="w-7 h-7 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Seller Card */}
          <Link to={`/sell${location.search}`} className="group block">
            <Card className="border border-border/60 hover:border-primary/30 hover:shadow-md transition-all duration-200 cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      I'm a Business Owner
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                      Explore your options confidentially. Connect with vetted buyers who understand
                      your industry and can close.
                    </p>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    <div className="w-7 h-7 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Process Preview */}
        <div className="text-xs text-muted-foreground border border-border/40 rounded-md px-4 py-3">
          <span className="font-medium text-foreground">How it works: </span>
          Apply → Verify your email → Admin review → Sign NDA → Browse deals → Request access
        </div>

        {/* Bottom Link */}
        <div className="text-xs text-muted-foreground">
          Already have an account?{' '}
          <Link
            to={`/login${location.search}`}
            className="text-primary font-medium hover:underline"
          >
            Sign in
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Welcome;
