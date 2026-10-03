import { api } from '@/lib/api/client';

import type { AuthSession, OAuthProvider } from '../types';

interface Credentials {
  email: string;
  password: string;
}

interface EmailCode {
  email: string;
  otp: string;
}

const data = <T>(result: { data: T }) => result.data;

export const authApi = {
  register: (body: Credentials & { name?: string }) => api.post<null>('/auth/register', body),

  verifyEmail: (body: EmailCode) => api.post<AuthSession>('/auth/verify-email', body).then(data),

  resendVerification: (email: string) => api.post<null>('/auth/resend-verification', { email }),

  login: (body: Credentials) => api.post<AuthSession>('/auth/login', body).then(data),

  refresh: (refreshToken: string) =>
    api.post<AuthSession>('/auth/refresh', { refreshToken }).then(data),

  logout: (refreshToken: string) => api.post<null>('/auth/logout', { refreshToken }),

  logoutAll: () => api.post<null>('/auth/logout-all', undefined, { auth: true }),

  forgotPassword: (email: string) => api.post<null>('/auth/password/forgot', { email }),

  verifyResetCode: (body: EmailCode) =>
    api.post<{ resetToken: string }>('/auth/password/verify-otp', body).then(data),

  resetPassword: (body: { resetToken: string; password: string }) =>
    api.post<null>('/auth/password/reset', body),

  oauth: (provider: OAuthProvider, token: string) =>
    api.post<AuthSession>(`/auth/oauth/${provider}`, { token }).then(data),
};
