import { api } from '@/lib/api/client';

import type { User } from '@/features/auth/types';

export const userApi = {
  me: () => api.get<{ user: User }>('/users/me', { auth: true }).then((r) => r.data.user),
  updateMe: (body: { name: string }) =>
    api.patch<{ user: User }>('/users/me', body, { auth: true }).then((r) => r.data.user),
};
