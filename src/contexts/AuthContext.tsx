import React, { createContext, useContext, useMemo } from 'react';
import { User as AppUser, TeamRole } from '@/types';
import { useNuclearAuth } from '@/hooks/use-nuclear-auth';

interface AuthContextType {
  user: AppUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signup: (userData: Partial<AppUser>, password: string) => Promise<void>;
  updateUserProfile: (data: Partial<AppUser>) => Promise<void>;
  refreshUserProfile: () => Promise<void>;
  isLoading: boolean;
  isAdmin: boolean;
  isBuyer: boolean;
  authChecked: boolean;
  /** Internal team role from user_roles table (owner/admin/moderator/viewer). */
  teamRole: TeamRole | null;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useNuclearAuth();

  const value = useMemo<AuthContextType>(
    () => ({
      user: auth.user,
      login: auth.login,
      logout: auth.logout,
      signup: auth.signup,
      updateUserProfile: auth.updateUserProfile,
      refreshUserProfile: auth.refreshUserProfile,
      isLoading: auth.isLoading,
      isAdmin: auth.isAdmin,
      isBuyer: auth.isBuyer,
      authChecked: auth.authChecked,
      teamRole: auth.teamRole,
    }),
    [
      auth.user,
      auth.login,
      auth.logout,
      auth.signup,
      auth.updateUserProfile,
      auth.refreshUserProfile,
      auth.isLoading,
      auth.isAdmin,
      auth.isBuyer,
      auth.authChecked,
      auth.teamRole,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
