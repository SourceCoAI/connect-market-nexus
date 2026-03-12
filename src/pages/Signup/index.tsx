import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import bradDaughertyImage from '@/assets/brad-daugherty.png';
import sfcLogo from '@/assets/sfc-logo.png';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { StepIndicator } from '@/components/ui/step-indicator';
import { ArrowLeft } from 'lucide-react';
import { ReferralSourceStep } from '@/components/auth/ReferralSourceStep';

import { INITIAL_FORM_DATA, STEPS } from './types';
import type { SignupFormData } from './types';
import { validateStep } from './useSignupValidation';
import { useSignupSubmit } from './useSignupSubmit';
import { SignupStepAccount } from './SignupStepAccount';
import { SignupStepPersonal } from './SignupStepPersonal';
import { SignupStepBuyerType } from './SignupStepBuyerType';
import { SignupStepBuyerProfile } from './SignupStepBuyerProfile';

const DRAFT_KEY = 'sourceco_signup_draft';
const DRAFT_STEP_KEY = 'sourceco_signup_step';

/** Fields that should never be persisted to localStorage */
const SENSITIVE_FIELDS = new Set(['password', 'confirmPassword']);

function loadDraft(): Partial<SignupFormData> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft(data: SignupFormData, step: number) {
  try {
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (!SENSITIVE_FIELDS.has(k)) safe[k] = v;
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(safe));
    localStorage.setItem(DRAFT_STEP_KEY, String(step));
  } catch {
    /* quota exceeded — ignore */
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(DRAFT_STEP_KEY);
}

const Signup = () => {
  const { isLoading } = useAuth();
  const [searchParams] = useSearchParams();

  // GAP 16+18: Capture deal context from URL params or localStorage
  const dealContext = useMemo(() => {
    const fromDealParam = searchParams.get('from_deal');
    const firstDeal = (() => {
      try {
        return localStorage.getItem('sourceco_first_deal_viewed');
      } catch {
        return null;
      }
    })();
    const lastDeal = (() => {
      try {
        return localStorage.getItem('sourceco_last_deal_viewed');
      } catch {
        return null;
      }
    })();
    const lastDealTitle = (() => {
      try {
        return localStorage.getItem('sourceco_last_deal_title');
      } catch {
        return null;
      }
    })();

    return {
      from_deal_id: fromDealParam || lastDeal || null,
      first_deal_viewed: firstDeal || null,
      deal_title: lastDealTitle || null,
      is_landing_page_referral: !!(fromDealParam || lastDeal),
    };
  }, [searchParams]);

  const [currentStep, setCurrentStep] = useState(() => {
    // Always start at step 0 so the user re-enters their password
    // (passwords are never persisted to the draft for security)
    return 0;
  });
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<SignupFormData>(() => {
    const draft = loadDraft();
    const base = draft ? { ...INITIAL_FORM_DATA, ...draft } : INITIAL_FORM_DATA;

    // GAP 17: Auto-populate from URL params (landing page can pass name, email, phone, company)
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('name') && !base.firstName) {
        const nameParts = (params.get('name') || '').split(' ');
        base.firstName = base.firstName || nameParts[0] || '';
        base.lastName = base.lastName || nameParts.slice(1).join(' ') || '';
      }
      if (params.get('email') && !base.email) base.email = params.get('email') || '';
      if (params.get('phone') && !base.phoneNumber) base.phoneNumber = params.get('phone') || '';
      if (params.get('company') && !base.company) base.company = params.get('company') || '';
    } catch {
      /* ignore */
    }

    return base;
  });

  // Persist draft on every change (passwords excluded)
  useEffect(() => {
    saveDraft(formData, currentStep);
  }, [formData, currentStep]);

  // GAP 16: Persist deal context to draft for use during signup submission
  useEffect(() => {
    if (dealContext.from_deal_id) {
      try {
        localStorage.setItem('sourceco_signup_deal_context', JSON.stringify(dealContext));
      } catch {
        /* ignore */
      }
    }
  }, [dealContext]);

  const { handleSubmit: doSubmit } = useSignupSubmit(formData);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const doValidation = (): boolean => {
    const errors = validateStep(currentStep, formData);
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleNext = () => {
    if (doValidation()) setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrevious = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doValidation()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setIsSubmitting(true);
    try {
      await doSubmit();
      clearDraft();
    } catch (error: unknown) {
      console.error('Signup error:', error);
      let errorMessage = 'An unexpected error occurred. Please try again.';
      if ((error as Error).message?.includes('User already registered'))
        errorMessage = 'An account with this email already exists.';
      else if ((error as Error).message?.includes('Password'))
        errorMessage = 'Password requirements not met.';
      else if ((error as Error).message?.includes('Email')) errorMessage = 'Invalid email address.';
      else if ((error as Error).message) errorMessage = (error as Error).message;
      toast({ variant: 'destructive', title: 'Signup failed', description: errorMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return <SignupStepAccount formData={formData} onChange={handleInputChange} />;
      case 1:
        return <SignupStepPersonal formData={formData} onChange={handleInputChange} />;
      case 2:
        return (
          <ReferralSourceStep
            referralSource={formData.referralSource || ''}
            referralSourceDetail={formData.referralSourceDetail || ''}
            dealSourcingMethods={formData.dealSourcingMethods || []}
            targetAcquisitionVolume={formData.targetAcquisitionVolume || ''}
            onSourceChange={(source) => setFormData((p) => ({ ...p, referralSource: source }))}
            onDetailChange={(detail) =>
              setFormData((p) => ({ ...p, referralSourceDetail: detail }))
            }
            onDealSourcingMethodsChange={(methods) =>
              setFormData((p) => ({ ...p, dealSourcingMethods: methods }))
            }
            onTargetAcquisitionVolumeChange={(volume) =>
              setFormData((p) => ({ ...p, targetAcquisitionVolume: volume }))
            }
          />
        );
      case 3:
        return (
          <SignupStepBuyerType
            formData={formData}
            setFormData={setFormData}
            onChange={handleInputChange}
          />
        );
      case 4:
        return <SignupStepBuyerProfile formData={formData} setFormData={setFormData} />;
      default:
        return null;
    }
  };

  const rightContent = (
    <div className="space-y-8 pr-8">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Welcome to SourceCo
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Stop wasting time on unqualified opportunities. Access pre-vetted businesses with verified
          financials and motivated sellers ready to transact.
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Join our network of acquirers who source deals directly from owners, before they go to
          brokers or public listings.
        </p>
      </div>
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
      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center space-x-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
          <span>Break free from broker gatekeepers</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
          <span>Connect directly with motivated sellers</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
          <span>Transform reactive to proactive sourcing</span>
        </div>
      </div>
    </div>
  );

  return (
    <AuthLayout
      rightContent={rightContent}
      showBackLink
      backLinkTo="/welcome"
      backLinkText="Back to selection"
    >
      <Card className="border-0 shadow-none bg-transparent">
        <CardHeader className="space-y-4 pb-6 px-0">
          <div>
            <CardTitle className="text-xl font-semibold tracking-tight">
              Create your account
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              {STEPS[currentStep]}
            </CardDescription>
          </div>
          <StepIndicator currentStep={currentStep} totalSteps={STEPS.length} />
        </CardHeader>
        <CardContent className="px-0">
          {/* GAP 16: Show deal context banner when arriving from a landing page */}
          {dealContext.is_landing_page_referral && dealContext.deal_title && currentStep === 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-6">
              <p className="text-xs text-muted-foreground font-['Inter',system-ui,sans-serif]">
                Sign up to receive full details on{' '}
                <span className="font-semibold text-foreground">{dealContext.deal_title}</span> and
                access 50+ additional off-market deals.
              </p>
            </div>
          )}
          {validationErrors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg mb-6">
              <ul className="list-disc pl-4 space-y-1 text-sm">
                {validationErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            {renderStepContent()}
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 pt-6 px-0">
          <div className="w-full space-y-3">
            {currentStep === STEPS.length - 1 ? (
              <>
                <Button
                  type="submit"
                  onClick={handleSubmit}
                  disabled={isLoading || isSubmitting}
                  className="w-full text-sm font-medium"
                >
                  {isLoading || isSubmitting ? 'Creating account...' : 'Create account'}
                </Button>
                <button
                  type="button"
                  onClick={(e) => {
                    setFormData((p) => ({
                      ...p,
                      idealTargetDescription: '',
                      businessCategories: [],
                      targetLocations: [],
                    }));
                    handleSubmit(e as unknown as React.FormEvent);
                  }}
                  disabled={isLoading || isSubmitting}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip — complete after approval
                </button>
              </>
            ) : currentStep === 2 ? (
              <>
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={isLoading || isSubmitting}
                  className="w-full text-sm font-medium"
                >
                  Continue
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setFormData((p) => ({
                      ...p,
                      referralSource: '',
                      referralSourceDetail: '',
                      dealSourcingMethods: [],
                      targetAcquisitionVolume: '',
                    }));
                    setCurrentStep((p) => p + 1);
                  }}
                  disabled={isLoading || isSubmitting}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip this step
                </button>
              </>
            ) : (
              <Button
                type="button"
                onClick={handleNext}
                disabled={isLoading || isSubmitting}
                className="w-full text-sm font-medium"
              >
                Continue
              </Button>
            )}
            {currentStep > 0 && (
              <button
                type="button"
                onClick={handlePrevious}
                disabled={isLoading || isSubmitting}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to previous step
              </button>
            )}
          </div>
          <div className="text-xs text-center text-muted-foreground">
            <span>Already have an account? </span>
            <Link
              to="/login"
              className="text-primary font-medium hover:underline transition-colors"
            >
              Sign in
            </Link>
          </div>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
};

export default Signup;
