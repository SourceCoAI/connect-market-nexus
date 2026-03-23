import { useAuth } from '@/contexts/AuthContext';
import {
  type ProtectedAuthContextType,
  type SignupFlowState,
  SIGNUP_FLOW_STATES,
  validateSignupStateTransition,
} from '../types/auth.types';

export const useProtectedAuth = (): ProtectedAuthContextType => {
  const context = useAuth();

  // Protected signup flow state management
  const signupFlowState: SignupFlowState = SIGNUP_FLOW_STATES.IDLE; // This would be managed in context

  const transitionSignupState = (newState: SignupFlowState) => {
    try {
      validateSignupStateTransition(signupFlowState, newState);
      // Update state in context
      // Debug log removed
    } catch (error) {
      console.error('Invalid signup state transition:', error);
      throw error;
    }
  };

  return {
    user: context.user,
    login: context.login,
    logout: context.logout,
    signup: context.signup,
    updateUserProfile: context.updateUserProfile,
    refreshUserProfile: context.refreshUserProfile,
    isLoading: context.isLoading,
    isAdmin: context.isAdmin,
    isBuyer: context.isBuyer,
    authChecked: context.authChecked,
    signupFlowState,
    transitionSignupState,
  };
};
