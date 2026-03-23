import { useState, useEffect, type FormEvent } from 'react';
import { Bell, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface EmailCaptureProps {
  listingId: string;
}

/**
 * GAP 12: Lightweight email capture for non-submitters.
 * Shows a slide-up bar after the user has scrolled 60% of the page,
 * capturing just an email for deal alerts with minimal friction.
 */
export default function EmailCapture({ listingId }: EmailCaptureProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Show after scrolling 60% of the page
  useEffect(() => {
    // Check if already dismissed or submitted in this session
    try {
      if (sessionStorage.getItem('sourceco_email_capture_dismissed')) {
        setIsDismissed(true);
        return;
      }
    } catch {
      /* ignore storage errors */
    }

    const handleScroll = () => {
      const scrollPercent =
        (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
      if (scrollPercent > 60 && !isDismissed && !isSubmitted) {
        setIsVisible(true);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isDismissed, isSubmitted]);

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsVisible(false);
    try {
      sessionStorage.setItem('sourceco_email_capture_dismissed', 'true');
    } catch {
      /* ignore */
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await supabase.from('connection_requests').insert({
        listing_id: listingId,
        status: 'pending',
        lead_email: email,
        lead_name: name || email.split('@')[0] || '',
        lead_role: 'Email Capture',
        user_message: 'Signed up for deal alerts via landing page email capture',
        source: 'landing_page_email_capture',
      });
      setIsSubmitted(true);
      try {
        sessionStorage.setItem('sourceco_email_capture_dismissed', 'true');
      } catch {
        /* ignore */
      }
    } catch {
      // Silently fail — non-critical
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isVisible || isDismissed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 animate-in slide-in-from-bottom duration-300">
      <div className="bg-[#1A1A1A] border-t border-[#C9A84C]/30">
        <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-3">
          {isSubmitted ? (
            <p className="text-center text-white text-[14px] font-['Inter',system-ui,sans-serif] py-1">
              Thanks! Our team will follow up with you shortly about relevant opportunities.
            </p>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="flex items-center gap-2 flex-shrink-0">
                <Bell className="w-4 h-4 text-[#C9A84C]" />
                <span className="text-white text-[14px] font-medium font-['Inter',system-ui,sans-serif]">
                  Get notified about deals like this
                </span>
              </div>
              <form onSubmit={handleSubmit} className="flex gap-2 w-full sm:w-auto flex-1">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name"
                  className="w-[120px] sm:w-[140px] bg-white/10 border border-white/20 rounded px-3 py-2 text-[14px] text-white placeholder:text-white/50 focus:outline-none focus:border-[#C9A84C] font-['Inter',system-ui,sans-serif]"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email"
                  required
                  className="flex-1 sm:min-w-[200px] bg-white/10 border border-white/20 rounded px-3 py-2 text-[14px] text-white placeholder:text-white/50 focus:outline-none focus:border-[#C9A84C] font-['Inter',system-ui,sans-serif]"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-[#C9A84C] text-[#1A1A1A] font-semibold text-[14px] px-4 py-2 rounded hover:bg-[#b8963e] transition-colors disabled:opacity-60 flex-shrink-0 font-['Inter',system-ui,sans-serif]"
                >
                  {isSubmitting ? '...' : 'Subscribe'}
                </button>
              </form>
              <button
                onClick={handleDismiss}
                className="text-white/50 hover:text-white transition-colors p-1 flex-shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
