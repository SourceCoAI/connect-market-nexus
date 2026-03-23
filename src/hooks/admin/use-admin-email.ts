import { User } from '@/types';
import { AdminConnectionRequest } from '@/types/admin';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const MARKETPLACE_URL = import.meta.env.VITE_MARKETPLACE_URL || window.location.origin;
import { useEmailDeliveryMonitoring } from './use-email-delivery-monitoring';

/**
 * Hook for sending email notifications from admin actions
 */
export function useAdminEmail() {
  const { toast } = useToast();
  const { trackEmailDelivery } = useEmailDeliveryMonitoring();
  /**
   * Send an email notification to a user when their account is approved
   */
  const sendUserApprovalEmail = async (user: User) => {
    const correlationId = `approval-${user.id}-${Date.now()}`;
    const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'there';

    try {
      const { data, error } = await supabase.functions.invoke('user-journey-notifications', {
        body: {
          event_type: 'profile_approved',
          user_id: user.id,
          user_email: user.email,
          user_name: userName,
        },
      });

      if (error) {
        trackEmailDelivery(correlationId, {
          success: false,
          error: error.message || 'Failed to send approval email',
        });
        throw error;
      }

      trackEmailDelivery(correlationId, {
        success: true,
        messageId: data?.messageId,
      });

      toast({
        title: 'Email sent',
        description: `Approval email sent to ${user.email}`,
      });

      return true;
    } catch (error) {
      trackEmailDelivery(correlationId, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      toast({
        variant: 'destructive',
        title: 'Email failed',
        description: 'Failed to send approval email. Please try again.',
      });
      throw error;
    }
  };

  /**
   * Send an email notification to a user when their account is rejected
   */
  const sendUserRejectionEmail = async (user: User, reason?: string) => {
    const correlationId = `rejection-${user.id}-${Date.now()}`;
    const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'there';

    try {
      const { data, error } = await supabase.functions.invoke('user-journey-notifications', {
        body: {
          event_type: 'profile_rejected',
          user_id: user.id,
          user_email: user.email,
          user_name: userName,
          metadata: { rejection_reason: reason || 'Application did not meet our criteria' },
        },
      });

      if (error) {
        trackEmailDelivery(correlationId, {
          success: false,
          error: error.message || 'Failed to send rejection email',
        });
        throw error;
      }

      trackEmailDelivery(correlationId, {
        success: true,
        messageId: data?.messageId,
      });

      toast({
        title: 'Email sent',
        description: `Rejection email sent to ${user.email}`,
      });

      return true;
    } catch (error) {
      trackEmailDelivery(correlationId, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      toast({
        variant: 'destructive',
        title: 'Email failed',
        description: 'Failed to send rejection email. Please try again.',
      });
      throw error;
    }
  };

  /**
   * Send an email notification to a user when their connection request is approved
   */
  const sendConnectionApprovalEmail = async (request: AdminConnectionRequest) => {
    if (!request.user || !request.listing) {
      console.error('Cannot send connection approval email: missing user or listing data');
      return false;
    }

    try {
      // Include the original message for context
      const originalMessage = request.user_message
        ? `\n\nYour original message:\n"${request.user_message}"\n`
        : '';

      const notificationPayload = {
        email: request.user.email,
        subject: 'Connection Request Approved!',
        message: `Great news! Your connection request for "${request.listing.title}" has been approved.${originalMessage}\nYou can now proceed with your due diligence process. The seller's contact information and additional details will be shared with you shortly.\n\nIf you have any questions about next steps, please contact our support team.`,
        type: 'success',
        actionUrl: `${MARKETPLACE_URL}/listing/${request.listing_id}`,
        actionText: 'View Listing',
      };

      const { data, error } = await supabase.functions.invoke('send-user-notification', {
        body: notificationPayload,
      });

      if (error) {
        console.error('Error sending connection approval notification:', error);
        return false;
      }

      if (data && !data.success) {
        console.error('Failed to send connection approval email:', data.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to send connection approval email:', error);
      return false;
    }
  };

  /**
   * Send an email notification to a user when their connection request is rejected
   */
  const sendConnectionRejectionEmail = async (request: AdminConnectionRequest) => {
    if (!request.user || !request.listing) {
      console.error('Cannot send connection rejection email: missing user or listing data');
      return false;
    }

    try {
      // Include the original message for context
      const originalMessage = request.user_message
        ? `\nYour original message:\n"${request.user_message}"\n\n`
        : '\n';

      const notificationPayload = {
        email: request.user.email,
        subject: 'Connection Request Update',
        message: `Thank you for your interest in "${request.listing.title}". After careful consideration, we are unable to approve your connection request at this time.${originalMessage}${request.admin_comment ? `Admin note: ${request.admin_comment}\n\n` : ''}We encourage you to continue exploring other opportunities on our marketplace that might be a better fit for your investment criteria.`,
        type: 'warning',
        actionUrl: `${MARKETPLACE_URL}/marketplace`,
        actionText: 'Browse Other Listings',
      };

      const { data, error } = await supabase.functions.invoke('send-user-notification', {
        body: notificationPayload,
      });

      if (error) {
        console.error('Error sending connection rejection notification:', error);
        return false;
      }

      if (data && !data.success) {
        console.error('Failed to send connection rejection email:', data.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to send connection rejection email:', error);
      return false;
    }
  };

  /**
   * Send an email notification to admins when a new connection request is submitted
   */
  const sendAdminConnectionRequestEmail = async (request: AdminConnectionRequest) => {
    if (!request.user || !request.listing) {
      console.error('Cannot send admin notification: missing user or listing data');
      return false;
    }

    try {
      // Format buyer name
      const buyerName = `${request.user.first_name} ${request.user.last_name}`.trim();

      // Format timestamp
      const timestamp =
        new Date(request.created_at).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'UTC',
          hour12: false,
        }) + ' UTC';

      const notificationPayload = {
        type: 'new_request',
        listing: {
          title: request.listing.title || 'Unknown Listing',
          category: request.listing.category || 'Uncategorized',
          location: request.listing.location || 'Unknown Location',
        },
        buyer: {
          name: buyerName,
          email: request.user.email,
          company: request.user.company,
        },
        timestamp: timestamp,
        message: request.user_message, // Include the user's message
      };

      const { data, error } = await supabase.functions.invoke('send-connection-notification', {
        body: JSON.stringify(notificationPayload),
      });

      if (error) {
        console.error('Error sending admin notification:', error);
        return false;
      }

      if (data && !data.success) {
        console.error('Failed to send admin notification:', data.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to send admin notification:', error);
      return false;
    }
  };

  /**
   * Send a custom approval email - ONLY EMAIL, NO DATABASE UPDATES
   * Database updates are handled by UserActions component
   */
  const sendCustomApprovalEmail = async (
    user: User,
    options: {
      subject: string;
      message: string;
      customSignatureHtml?: string;
      customSignatureText?: string;
    },
  ) => {
    const correlationId = `custom-approval-${user.id}-${Date.now()}`;

    try {
      // Get current admin user info first
      const {
        data: { user: currentUser },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !currentUser) {
        throw new Error('Authentication required. Please refresh and try again.');
      }

      const { data: adminProfile, error: profileError } = await supabase
        .from('profiles')
        .select('email, first_name, last_name')
        .eq('id', currentUser.id)
        .single();

      if (profileError || !adminProfile) {
        throw new Error('Admin profile not found. Please contact support.');
      }

      const adminName =
        adminProfile.first_name && adminProfile.last_name
          ? `${adminProfile.first_name} ${adminProfile.last_name}`
          : adminProfile.email;

      // Send email only - no database updates
      const requestPayload = {
        userId: user.id,
        userEmail: user.email,
        subject: options.subject,
        message: options.message,
        adminId: currentUser.id,
        adminEmail: adminProfile.email,
        adminName: adminName,
        customSignatureHtml: options.customSignatureHtml,
        customSignatureText: options.customSignatureText,
      };

      const { data, error } = await supabase.functions.invoke('send-approval-email', {
        body: requestPayload,
      });

      if (error || (data && !data.success)) {
        trackEmailDelivery(correlationId, {
          success: false,
          error: error?.message || data?.message || 'Failed to send email',
        });
        throw new Error(error?.message || data?.message || 'Failed to send email');
      }

      trackEmailDelivery(correlationId, {
        success: true,
        messageId: data?.messageId,
        emailProvider: data?.emailProvider,
      });

      return true;
    } catch (error) {
      trackEmailDelivery(correlationId, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  };

  return {
    sendUserApprovalEmail,
    sendUserRejectionEmail,
    sendConnectionApprovalEmail,
    sendConnectionRejectionEmail,
    sendAdminConnectionRequestEmail,
    sendCustomApprovalEmail,
  };
}
