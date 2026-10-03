import { create } from 'zustand';

import { audioEngine } from '@/features/player/engine/audio-engine';
import { ApiError } from '@/lib/api/api-error';
import { registerAuthHandlers } from '@/lib/api/client';
import { queryClient } from '@/lib/query-client';
import { secureStorage } from '@/lib/storage/secure-storage';

import { authApi } from '../api/auth.api';
import { signOutOfGoogle } from '../lib/google-sign-in';
import type { AuthSession, User } from '../types';

const REFRESH_TOKEN_KEY = 'auth.refreshToken';
const USER_KEY = 'auth.user';

type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  /** Kept in memory only; the refresh token lives in secure storage */
  accessToken: string | null;
}

interface AuthActions {
  /** Restore the session on app start */
  hydrate: () => Promise<void>;
  setSession: (session: AuthSession) => Promise<void>;
  setUser: (user: User) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState & AuthActions>()((set) => ({
  status: 'loading',
  user: null,
  accessToken: null,

  hydrate: async () => {
    const [refreshToken, cachedUser] = await Promise.all([
      secureStorage.get(REFRESH_TOKEN_KEY),
      secureStorage.get(USER_KEY),
    ]);
    if (!refreshToken) {
      set({ status: 'signedOut' });
      return;
    }

    try {
      await refreshAccessToken();
    } catch {
      // Offline at launch: let the user in with the cached profile; the next
      // API call refreshes the session once the server is reachable.
      if (cachedUser) {
        set({ status: 'signedIn', user: JSON.parse(cachedUser) as User, accessToken: null });
      } else {
        set({ status: 'signedOut' });
      }
    }
  },

  setSession: persistSession,

  setUser: (user) => {
    set({ user });
    void secureStorage.set(USER_KEY, JSON.stringify(user));
  },

  signOut: async () => {
    const refreshToken = await secureStorage.get(REFRESH_TOKEN_KEY);
    await clearSession();
    // Best effort: the local session is already gone either way
    if (refreshToken) authApi.logout(refreshToken).catch(() => {});
    signOutOfGoogle().catch(() => {});
  },
}));

async function persistSession(session: AuthSession) {
  await Promise.all([
    secureStorage.set(REFRESH_TOKEN_KEY, session.refreshToken),
    secureStorage.set(USER_KEY, JSON.stringify(session.user)),
  ]);
  useAuthStore.setState({ status: 'signedIn', user: session.user, accessToken: session.accessToken });
}

async function clearSession() {
  void audioEngine.close();
  await Promise.all([secureStorage.remove(REFRESH_TOKEN_KEY), secureStorage.remove(USER_KEY)]);
  useAuthStore.setState({ status: 'signedOut', user: null, accessToken: null });
  queryClient.clear();
}

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Exchanges the stored refresh token for a new pair. Calls are de-duplicated:
 * the server treats a refresh token used twice as stolen and ends the session,
 * so parallel requests must share one refresh.
 *
 * Resolves null when the session is over; throws on network failure so the
 * session survives being offline.
 */
export function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    try {
      const refreshToken = await secureStorage.get(REFRESH_TOKEN_KEY);
      if (!refreshToken) {
        await clearSession();
        return null;
      }
      const session = await authApi.refresh(refreshToken);
      await persistSession(session);
      return session.accessToken;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await clearSession();
        return null;
      }
      throw error;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

registerAuthHandlers({
  getAccessToken: () => useAuthStore.getState().accessToken,
  refreshAccessToken,
});
