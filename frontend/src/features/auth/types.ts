export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  plan: 'free' | 'plus' | 'pro';
  createdAt: string;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  /** Seconds */
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  /** Signed in to a closed account within its grace period, which reopened it */
  restored?: boolean;
}

export type OAuthProvider = 'google';
