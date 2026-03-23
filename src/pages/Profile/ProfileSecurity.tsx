import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { OZ_ADMIN_ID } from '@/constants';
import type { ProfileSecurityProps } from './types';

export function ProfileSecurity({
  isLoading,
  passwordData,
  passwordError,
  passwordSuccess,
  onPasswordDataChange,
  onSubmit,
}: ProfileSecurityProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [isDeactivating, setIsDeactivating] = useState(false);

  const handleDeactivationRequest = async () => {
    if (!user?.id) return;

    setIsDeactivating(true);
    try {
      await supabase.functions.invoke('notify-admin-document-question', {
        body: {
          admin_id: OZ_ADMIN_ID,
          user_id: user.id,
          document_type: 'Account Deactivation Request',
          question: deactivateReason || 'No reason provided.',
        },
      });

      toast({
        title: 'Deactivation request submitted',
        description:
          'Your account deactivation request has been sent to our team. We will follow up with you shortly.',
      });

      setDeactivateDialogOpen(false);
      setDeactivateReason('');
    } catch (error: unknown) {
      console.error('Deactivation request error:', error);
      toast({
        variant: 'destructive',
        title: 'Request failed',
        description:
          (error as Error).message ||
          'Something went wrong while submitting your deactivation request. Please try again.',
      });
    } finally {
      setIsDeactivating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Update your password and security settings.</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6">
            {passwordSuccess && (
              <div className="flex items-center p-4 mb-4 text-sm text-green-800 border border-green-300 rounded-lg bg-green-50">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            {passwordError && (
              <div className="flex items-center p-4 mb-4 text-sm text-red-800 border border-red-300 rounded-lg bg-red-50">
                <AlertCircle className="w-4 h-4 mr-2" />
                <span>{passwordError}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) =>
                  onPasswordDataChange({ ...passwordData, currentPassword: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                value={passwordData.newPassword}
                onChange={(e) =>
                  onPasswordDataChange({ ...passwordData, newPassword: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) =>
                  onPasswordDataChange({ ...passwordData, confirmPassword: e.target.value })
                }
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Change Password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            Account & Privacy
          </CardTitle>
          <CardDescription>Manage your account status and privacy settings.</CardDescription>
        </CardHeader>

        <CardContent>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              If you would like to deactivate your account, you can submit a request below. Our team
              will process your request and follow up via email.
            </p>

            <Dialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive">Request Account Deactivation</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Request Account Deactivation</DialogTitle>
                  <DialogDescription className="pt-2">
                    This will deactivate your account and remove access to all deals. This action
                    cannot be undone without contacting support.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-2 py-2">
                  <Label htmlFor="deactivate-reason">Reason (optional)</Label>
                  <Textarea
                    id="deactivate-reason"
                    placeholder="Let us know why you'd like to deactivate your account..."
                    value={deactivateReason}
                    onChange={(e) => setDeactivateReason(e.target.value)}
                    rows={3}
                  />
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setDeactivateDialogOpen(false)}
                    disabled={isDeactivating}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeactivationRequest}
                    disabled={isDeactivating}
                  >
                    {isDeactivating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm Deactivation
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
