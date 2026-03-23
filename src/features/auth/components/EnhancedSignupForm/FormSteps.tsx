import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { type SignupFormData } from '@/features/auth';
import {
  BUYER_TYPE_OPTIONS,
  DEAL_INTENT_OPTIONS
} from '@/lib/signup-field-options';
import { BuyerFields } from './BuyerFields';

interface FormStepsProps {
  currentStep: number;
  form: UseFormReturn<SignupFormData>;
  watch: UseFormReturn<SignupFormData>['watch'];
  setValue: UseFormReturn<SignupFormData>['setValue'];
  errors: UseFormReturn<SignupFormData>['formState']['errors'];
  buyerType: SignupFormData['buyerType'];
}

export const FormSteps: React.FC<FormStepsProps> = ({ currentStep, form, watch, setValue, errors, buyerType }) => {
  switch (currentStep) {
    case 0:
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="email">Work Email *</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              {...form.register('email')}
              className={errors.email ? 'border-destructive' : ''}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Please use your work email address (personal emails are allowed)
            </p>
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="password">Password *</Label>
            <Input
              id="password"
              type="password"
              placeholder="Create a secure password"
              {...form.register('password')}
              className={errors.password ? 'border-destructive' : ''}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
        </div>
      );

    case 1:
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                placeholder="John"
                {...form.register('firstName')}
                className={errors.firstName ? 'border-destructive' : ''}
              />
              {errors.firstName && (
                <p className="text-sm text-destructive">{errors.firstName.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                placeholder="Smith"
                {...form.register('lastName')}
                className={errors.lastName ? 'border-destructive' : ''}
              />
              {errors.lastName && (
                <p className="text-sm text-destructive">{errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="company">Company *</Label>
            <Input
              id="company"
              placeholder="Acme Capital Partners"
              {...form.register('company')}
              className={errors.company ? 'border-destructive' : ''}
            />
            {errors.company && (
              <p className="text-sm text-destructive">{errors.company.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="jobTitle">Job Title (Optional)</Label>
            <Input
              id="jobTitle"
              placeholder="Partner, Managing Director, etc."
              {...form.register('jobTitle')}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Helps with quick triage: Analyst/Associate vs Partner/M&A Director
            </p>
          </div>

          <div>
            <Label htmlFor="phone_number">Phone Number</Label>
            <Input
              id="phone_number"
              placeholder="+1 (555) 123-4567"
              {...form.register('phone_number')}
            />
          </div>

          <div>
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              placeholder="https://company.com"
              {...form.register('website')}
            />
          </div>

          <div>
            <Label htmlFor="linkedinProfile">LinkedIn Profile</Label>
            <Input
              id="linkedinProfile"
              type="url"
              placeholder="https://linkedin.com/in/yourprofile"
              {...form.register('linkedinProfile')}
            />
          </div>
        </div>
      );

    case 2:
      return (
        <div className="space-y-6">
          <div className="mb-4">
            <h3 className="text-lg font-medium">Tell us about your mandate</h3>
            <p className="text-sm text-muted-foreground mt-1">
              We use this to match you to relevant deals and prioritize your application. The more specific you are, the faster we can clear you.
            </p>
          </div>
          <div>
            <Label htmlFor="buyerType">Buyer Type *</Label>
            <Select onValueChange={(value) => setValue('buyerType', value as SignupFormData['buyerType'])}>
              <SelectTrigger>
                <SelectValue placeholder="Select your buyer type" />
              </SelectTrigger>
              <SelectContent>
                {BUYER_TYPE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-sm text-muted-foreground">{option.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.buyerType && (
              <p className="text-sm text-destructive">{errors.buyerType.message}</p>
            )}
          </div>

          {buyerType && (
            <div className="border-t pt-6">
              <h3 className="text-lg font-medium mb-4">
                {BUYER_TYPE_OPTIONS.find(opt => opt.value === buyerType)?.label} Details
              </h3>
              <BuyerFields form={form} watch={watch} setValue={setValue} buyerType={buyerType} />
            </div>
          )}
        </div>
      );

    case 3:
      return (
        <div className="space-y-4">
          <Alert>
            <AlertDescription>
              Complete your profile with investment criteria and target preferences.
              All fields in this section are optional but help us show you more relevant deals.
            </AlertDescription>
          </Alert>

          <div>
            <Label htmlFor="idealTargetDescription">Ideal Target Description</Label>
            <Textarea
              id="idealTargetDescription"
              placeholder="Describe your ideal acquisition target..."
              rows={3}
              {...form.register('idealTargetDescription')}
            />
          </div>

          <div>
            <Label htmlFor="specificBusinessSearch">Specific Business Requirements</Label>
            <Textarea
              id="specificBusinessSearch"
              placeholder="1–2 must-haves only (e.g., non-union, 60% recurring)"
              rows={2}
              {...form.register('specificBusinessSearch')}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Hint: "1–2 must-haves only (e.g., non-union, 60% recurring)."
            </p>
          </div>

          {/* New Step 4 fields */}

          <div>
            <Label htmlFor="dealIntent">Deal Intent</Label>
            <div className="space-y-2">
              {DEAL_INTENT_OPTIONS.map(option => (
                <div key={option.value} className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id={`dealIntent-${option.value}`}
                    value={option.value}
                    {...form.register('dealIntent')}
                    className="h-4 w-4"
                  />
                  <Label htmlFor={`dealIntent-${option.value}`} className="text-sm font-normal">
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              What type of deals are you primarily focused on pursuing?
            </p>
          </div>

          <div>
            <Label htmlFor="exclusions">Hard Exclusions</Label>
            <Textarea
              id="exclusions"
              placeholder="e.g., unionized, DTC, heavy CapEx"
              rows={2}
              value={watch('exclusions') ? watch('exclusions')?.join(', ') : ''}
              onChange={(e) => setValue('exclusions', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
            />
            <p className="text-sm text-muted-foreground mt-1">
              e.g., unionized, DTC, heavy CapEx.
            </p>
          </div>

          <div>
            <Label htmlFor="includeKeywords">Keywords (optional)</Label>
            <Textarea
              id="includeKeywords"
              placeholder="e.g., route-based, B2B services"
              rows={2}
              value={watch('includeKeywords') ? watch('includeKeywords')?.join(', ') : ''}
              onChange={(e) => {
                const keywords = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                setValue('includeKeywords', keywords.slice(0, 5)); // max 5
              }}
            />
            <p className="text-sm text-muted-foreground mt-1">
              2–5 keywords you care about (e.g., 'route-based', 'B2B services').
            </p>
          </div>
        </div>
      );

    default:
      return null;
  }
};
