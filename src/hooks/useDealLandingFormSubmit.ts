import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface FormData {
  name: string;
  email: string;
  company: string;
  phone: string;
  role: string;
  message: string;
}

// H-14 FIX: Simple client-side rate limiter for anonymous form submissions.
// Prevents rapid-fire submissions from the same browser session.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_SUBMISSIONS_PER_WINDOW = 3;

export function useDealLandingFormSubmit(listingId: string) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submissionTimestamps = useRef<number[]>([]);

  const submit = async (formData: FormData) => {
    setIsSubmitting(true);
    setError(null);

    // H-14 FIX: Rate limit check
    const now = Date.now();
    submissionTimestamps.current = submissionTimestamps.current.filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS,
    );
    if (submissionTimestamps.current.length >= MAX_SUBMISSIONS_PER_WINDOW) {
      setError('Too many submissions. Please wait a minute before trying again.');
      setIsSubmitting(false);
      return;
    }
    submissionTimestamps.current.push(now);

    try {
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

      // H-13 FIX: Trigger admin email notification for anonymous landing page submissions.
      // Previously only marketplace (authenticated) submissions triggered notifications.
      try {
        await supabase.functions.invoke('send-connection-notification', {
          body: {
            type: 'admin_notification',
            connectionRequestId: null,
            leadName: formData.name,
            leadEmail: formData.email,
            leadCompany: formData.company,
            leadPhone: formData.phone,
            leadRole: formData.role,
            message: formData.message,
            listingId,
            source: 'landing_page',
          },
        });
      } catch (notifyErr) {
        // Don't fail the submission if notification fails
        console.error('Admin notification failed:', notifyErr);
      }

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
