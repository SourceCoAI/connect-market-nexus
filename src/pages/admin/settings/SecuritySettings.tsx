import { MFAEnrollment } from '@/components/admin/MFAEnrollment';
import { useAuth } from '@/contexts/AuthContext';

export default function SecuritySettings() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Security Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage authentication and security for your admin account.
        </p>
      </div>

      <MFAEnrollment />

      <div className="text-xs text-muted-foreground border-t pt-4">
        <p>Signed in as: {user?.email}</p>
        <p>
          Admin accounts with MFA enabled will be prompted for a verification code on each sign-in.
        </p>
      </div>
    </div>
  );
}
