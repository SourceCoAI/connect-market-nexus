import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { APP_CONFIG } from '@/config/app';

export function EmailTestButton() {
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const testRecipient = user?.email ?? APP_CONFIG.adminEmail;

  const sendTestEmail = async () => {
    setIsSending(true);

    try {
      const { error } = await supabase.functions.invoke('send-user-notification', {
        body: {
          email: testRecipient,
          subject: 'Test Email - Connection Request Approved',
          message: `This is a test email from the EmailTestButton component.\n\nIf you received this, the email delivery pipeline is working correctly.`,
          type: 'connection_approved',
          fromEmail: APP_CONFIG.adminEmail,
        },
      });

      if (error) {
        toast({
          title: 'Error',
          description: `Failed to send test email: ${error.message}`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Success',
          description: `Test email sent to ${testRecipient}`,
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send test email',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Button onClick={sendTestEmail} disabled={isSending} variant="outline" size="sm">
      {isSending ? 'Sending...' : 'Send Test Email'}
    </Button>
  );
}
