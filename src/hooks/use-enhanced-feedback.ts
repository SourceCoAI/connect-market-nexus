import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface EnhancedFeedbackData {
  message: string;
  category?: 'contact' | 'general' | 'bug' | 'feature' | 'ui' | 'other';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  pageUrl?: string;
  userAgent?: string;
  threadId?: string;
  parentMessageId?: string;
}

export interface FeedbackMessageWithUser {
  id: string;
  message: string;
  category: string;
  priority: string;
  status: string;
  page_url: string | null;
  user_agent: string | null;
  admin_response: string | null;
  thread_id: string;
  parent_message_id: string | null;
  is_internal_note: boolean;
  attachments: Record<string, unknown>[];
  read_by_user: boolean;
  read_by_admin: boolean;
  satisfaction_rating: number | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  admin_id: string | null;
  user_email: string;
  user_first_name: string;
  user_last_name: string;
  user_company: string;
  user_phone_number: string;
}

export function useEnhancedFeedback() {
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const submitFeedback = async (feedbackData: EnhancedFeedbackData) => {
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'You must be logged in to submit feedback.',
        variant: 'destructive',
      });
      throw new Error('User must be authenticated to submit feedback');
    }

    if (!feedbackData.message?.trim()) {
      toast({
        title: 'Message required',
        description: 'Please enter a message before submitting.',
        variant: 'destructive',
      });
      throw new Error('Message is required');
    }

    setIsLoading(true);

    try {
      // Use category directly without complex mapping
      const category = feedbackData.category || 'general';

      // Insert feedback into database
      const feedbackPayload = {
        user_id: user.id,
        message: feedbackData.message.trim(),
        category: category,
        priority: feedbackData.priority || 'normal',
        page_url: feedbackData.pageUrl || window?.location?.href,
        user_agent: feedbackData.userAgent || navigator?.userAgent,
        status: 'unread',
        thread_id: feedbackData.threadId || undefined,
        parent_message_id: feedbackData.parentMessageId || undefined,
      };

      const { data: feedback, error: insertError } = await supabase
        .from('feedback_messages')
        .insert(feedbackPayload)
        .select()
        .single();

      if (insertError) {
        toast({
          title: 'Submission failed',
          description: 'Failed to save your message. Please try again.',
          variant: 'destructive',
        });
        throw new Error(`Database error: ${insertError.message}`);
      }

      if (!feedback) {
        toast({
          title: 'Submission failed',
          description: 'Failed to save feedback. Please try again.',
          variant: 'destructive',
        });
        throw new Error('Failed to save feedback - no data returned');
      }

      // Get user profile for email
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', user.id)
        .single();
      if (profileError) throw profileError;

      const userName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : '';
      const userEmail = profile?.email || user.email;

      // Simple success message based on category
      const getSuccessMessage = (category: string) => {
        const messages = {
          contact: {
            title: 'Message sent!',
            description: "Thanks for reaching out! We'll get back to you soon.",
          },
          bug: {
            title: 'Bug report submitted!',
            description: "Thank you for reporting this issue. We'll investigate promptly.",
          },
          feature: {
            title: 'Feature request received!',
            description: "Thanks for the suggestion! We'll consider it for future updates.",
          },
          ui: {
            title: 'UI feedback submitted!',
            description: 'Thank you for helping us improve the user experience.',
          },
          general: {
            title: 'Feedback submitted!',
            description: "Thank you for your feedback! We'll review it soon.",
          },
          other: {
            title: 'Message received!',
            description: "Thank you for your message! We'll get back to you.",
          },
        };
        return messages[category as keyof typeof messages] || messages.general;
      };

      // Single email attempt with simple fallback
      try {
        const emailPayload = {
          to: userEmail,
          subject: `Thank you for your ${category}${userName ? `, ${userName}` : ''}`,
          content: feedbackData.message,
          feedbackId: feedback.id,
          userName: userName || undefined,
          category: category,
        };

        const { error: emailError } = await supabase.functions.invoke('send-contact-response', {
          body: emailPayload,
        });

        if (emailError) {
          console.warn('⚠️ Email delivery failed, but feedback was saved');
        }
      } catch (emailError) {
        console.warn('⚠️ Email service unavailable, but feedback was saved');
      }

      // Show success message
      const successMsg = getSuccessMessage(category);
      toast({
        title: successMsg.title,
        description: successMsg.description,
      });

      // Optional admin notification
      try {
        await supabase.functions.invoke('send-feedback-notification', {
          body: {
            feedbackId: feedback.id,
            message: feedbackData.message,
            category: category,
            priority: feedbackData.priority || 'normal',
            pageUrl: feedbackData.pageUrl,
            userAgent: feedbackData.userAgent,
            userId: user.id,
            userEmail: userEmail,
            userName: userName || userEmail,
          },
        });
      } catch (notificationError) {
        console.warn('⚠️ Admin notification failed (non-critical)');
      }

      return feedback;
    } catch (error: unknown) {
      // Generic error handling
      const message = error instanceof Error ? error.message : '';
      if (!message.includes('Database error') && !message.includes('Message is required')) {
        toast({
          title: 'Submission error',
          description: 'Something went wrong. Please try again.',
          variant: 'destructive',
        });
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const getFeedbackWithUserDetails = async (): Promise<FeedbackMessageWithUser[]> => {
    try {
      const { data: messages, error: messagesError } = await supabase
        .from('feedback_messages')
        .select('*')
        .order('created_at', { ascending: false });

      if (messagesError) {
        throw messagesError;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, company, phone_number');

      if (profilesError) {
        throw profilesError;
      }

      const result = (messages || []).map((msg) => {
        const profile = profiles?.find((p) => p.id === msg.user_id);
        const record = msg as Record<string, unknown>;
        return {
          ...msg,
          user_email: profile?.email || '',
          user_first_name: profile?.first_name || '',
          user_last_name: profile?.last_name || '',
          user_company: profile?.company || '',
          user_phone_number: profile?.phone_number || '',
          attachments: (record.attachments as unknown[]) || [],
          read_by_user: (record.read_by_user as boolean) || false,
          read_by_admin: (record.read_by_admin as boolean) || false,
          is_internal_note: (record.is_internal_note as boolean) || false,
          thread_id: (record.thread_id as string) || msg.id,
          parent_message_id: (record.parent_message_id as string | null) || null,
          satisfaction_rating: (record.satisfaction_rating as number | null) || null,
        };
      });

      return result as FeedbackMessageWithUser[];
    } catch (error) {
      console.error('❌ Error fetching feedback with user details:', error);
      return [];
    }
  };

  const getFeedbackHistory = async () => {
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('feedback_messages')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching feedback history:', error);
      return [];
    }
  };

  const markAsRead = async (messageId: string, isUser: boolean = false) => {
    try {
      const updateField = isUser ? 'read_by_user' : 'read_by_admin';
      const { error } = await supabase
        .from('feedback_messages')
        .update({ [updateField]: true })
        .eq('id', messageId);

      if (error) throw error;
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  return {
    submitFeedback,
    getFeedbackWithUserDetails,
    getFeedbackHistory,
    markAsRead,
    isLoading,
  };
}
