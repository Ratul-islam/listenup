import { useMutation } from '@tanstack/react-query';
import { useToast } from 'heroui-native';

import { haptics } from '@/lib/haptics';

import { authApi } from '../api/auth.api';
import { getGoogleIdToken } from '../lib/google-sign-in';
import { useAuthStore } from '../store/auth.store';
import type { AuthSession } from '../types';

function useStartSession() {
  const setSession = useAuthStore((s) => s.setSession);
  const { toast } = useToast();
  return async (session: AuthSession) => {
    haptics.success();
    await setSession(session);
    if (session.restored) toast.show({ variant: 'success', label: 'Welcome back', description: 'Your account has been restored.' });
  };
}

export function useSignIn() {
  const startSession = useStartSession();
  return useMutation({ mutationFn: authApi.login, onSuccess: startSession, onError: haptics.error });
}

export function useSignUp() {
  return useMutation({ mutationFn: authApi.register, onError: haptics.error });
}

export function useVerifyEmail() {
  const startSession = useStartSession();
  return useMutation({ mutationFn: authApi.verifyEmail, onSuccess: startSession, onError: haptics.error });
}

export function useResendVerification() {
  return useMutation({ mutationFn: authApi.resendVerification });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: authApi.forgotPassword, onError: haptics.error });
}

export function useVerifyResetCode() {
  return useMutation({ mutationFn: authApi.verifyResetCode, onError: haptics.error });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: haptics.success,
    onError: haptics.error,
  });
}

export function useGoogleSignIn() {
  const startSession = useStartSession();
  return useMutation({
    mutationFn: async () => {
      const idToken = await getGoogleIdToken();
      // null = the user closed the account picker
      return idToken ? authApi.oauth('google', idToken) : null;
    },
    onSuccess: async (session) => {
      if (session) await startSession(session);
    },
    onError: haptics.error,
  });
}

export function useSignOut() {
  const signOut = useAuthStore((s) => s.signOut);
  return useMutation({ mutationFn: signOut });
}
