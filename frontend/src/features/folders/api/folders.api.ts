import { api } from '@/lib/api/client';

export interface Folder {
  id: string;
  name: string;
  itemCount: number;
  createdAt: string;
}

export const foldersApi = {
  list: () => api.get<{ folders: Folder[] }>('/folders', { auth: true }).then((r) => r.data.folders),
  get: (id: string) => api.get<{ folder: Folder }>(`/folders/${id}`, { auth: true }).then((r) => r.data.folder),
  create: (name: string) => api.post<{ folder: Folder }>('/folders', { name }, { auth: true }).then((r) => r.data.folder),
  rename: (id: string, name: string) => api.patch<{ folder: Folder }>(`/folders/${id}`, { name }, { auth: true }).then((r) => r.data.folder),
  remove: (id: string) => api.delete<null>(`/folders/${id}`, { auth: true }),
};
