import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { DealAlertsTab } from '@/components/deal-alerts/DealAlertsTab';
import { useProfileData } from './useProfileData';
import { ProfileForm } from './ProfileForm';
import { ProfileSecurity } from './ProfileSecurity';
import { ProfileDocuments } from './ProfileDocuments';
import { ProfileTeamMembers } from './ProfileTeamMembers';

const VALID_TABS = ['profile', 'documents', 'deal-alerts', 'team', 'security'];

const Profile = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = VALID_TABS.includes(searchParams.get('tab') || '') ? searchParams.get('tab')! : 'profile';
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
    setSearchParams(value === 'profile' ? {} : { tab: value }, { replace: true });
  }, [setSearchParams]);

  const {
    user,
    isLoading,
    formData,
    setFormData,
    passwordData,
    setPasswordData,
    passwordError,
    passwordSuccess,
    handleInputChange,
    handleSelectChange,
    handleLocationChange,
    handleProfileUpdate,
    handlePasswordChange,
  } = useProfileData();

  if (!user) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6">My Profile</h1>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="profile">
            <span className="sm:hidden">Profile</span>
            <span className="hidden sm:inline">Profile Information</span>
          </TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="deal-alerts">
            <span className="sm:hidden">Alerts</span>
            <span className="hidden sm:inline">Deal Alerts</span>
          </TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileForm
            user={user}
            formData={formData}
            isLoading={isLoading}
            onInputChange={handleInputChange}
            onSelectChange={handleSelectChange}
            onLocationChange={handleLocationChange}
            onSetFormData={setFormData}
            onSubmit={handleProfileUpdate}
          />
        </TabsContent>

        <TabsContent value="documents">
          <ProfileDocuments />
        </TabsContent>

        <TabsContent value="deal-alerts">
          <DealAlertsTab />
        </TabsContent>

        <TabsContent value="team">
          <ProfileTeamMembers />
        </TabsContent>

        <TabsContent value="security">
          <ProfileSecurity
            isLoading={isLoading}
            passwordData={passwordData}
            passwordError={passwordError}
            passwordSuccess={passwordSuccess}
            onPasswordDataChange={setPasswordData}
            onSubmit={handlePasswordChange}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Profile;
