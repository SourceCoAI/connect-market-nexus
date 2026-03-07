import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface FormData {
  name: string;
  email: string;
  company: string;
  phone: string;
  role: string;
  message: string;
}

export function useDealLandingFormSubmit(listingId: string) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (formData: FormData) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        setError('Please enter a valid email address.');
        return;
      }

      // Validate message length
      if (formData.message && formData.message.length > 2000) {
        setError('Message must be under 2000 characters.');
        return;
      }
      // Audit P2: Check for duplicate connection request by email + listing
      const { data: existing } = await supabase
        .from('connection_requests')
        .select('id')
        .eq('listing_id', listingId)
        .eq('lead_email', formData.email)
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Already submitted — treat as success to avoid confusing the user
        setIsSuccess(true);
        return;
      }

      const { error: insertError } = await supabase.from('connection_requests').insert({
        listing_id: listingId,
        status: 'pending',
        lead_name: formData.name,
        lead_email: formData.email,
        lead_company: formData.company,
        lead_phone: formData.phone,
        lead_role: formData.role,
        user_message: formData.message,
        source: 'landing_page',
      });

      if (insertError) throw insertError;

      setIsSuccess(true);
    } catch (err) {
      console.error('Form submission error:', err);
      setError('Oops! Something went wrong while submitting the form.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submit, isSubmitting, isSuccess, error };
}
