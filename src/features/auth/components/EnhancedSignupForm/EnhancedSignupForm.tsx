import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSignupForm, STEPS } from './useSignupForm';
import { FormSteps } from './FormSteps';

export const EnhancedSignupForm: React.FC = () => {
  const {
    form,
    watch,
    setValue,
    handleSubmit,
    errors,
    buyerType,
    currentStep,
    setCurrentStep,
    isLoading,
    onSubmit,
    canProceed
  } = useSignupForm();

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Apply for Access to the SourceCo Deal Pipeline</CardTitle>
        <CardDescription>
          Off-market, founder-led businesses. $500K–$10M EBITDA. Reviewed by our team before they reach you.
        </CardDescription>
        <CardDescription>
          Step {currentStep + 1} of {STEPS.length}: {STEPS[currentStep]}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <FormSteps
            currentStep={currentStep}
            form={form}
            watch={watch}
            setValue={setValue}
            errors={errors}
            buyerType={buyerType}
          />

          <div className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
            >
              Back
            </Button>

            {currentStep < STEPS.length - 1 ? (
              <Button
                type="button"
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={!canProceed()}
              >
                Continue
              </Button>
            ) : (
              <Button type="submit" disabled={isLoading || !canProceed()}>
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
