import { Directory, File, Paths } from 'expo-file-system';

import { api } from '@/lib/api/client';

import type { Category, DocumentList, DocumentSummary, ReaderData, SortOrder } from '../types';

const data = <T>(r: { data: T }) => r.data;

export interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string | null;
}

export const documentsApi = {
  /** `folder`: "root" for loose items, a folder id for its contents; omit to search everything */
  list: (params: { category: Category; q?: string; sort: SortOrder; folder?: string }) => {
    const query = new URLSearchParams({
      category: params.category,
      sort: params.sort,
      ...(params.q && { q: params.q }),
      ...(params.folder && { folder: params.folder }),
    });
    return api.get<DocumentList>(`/documents?${query}`, { auth: true }).then(data);
  },

  get: (id: string) => api.get<{ document: DocumentSummary }>(`/documents/${id}`, { auth: true }).then((r) => r.data.document),

  upload: async (file: PickedFile) => {
    // The global fetch is expo/fetch, which can't send React Native's { uri, name, type }
    // descriptors, only expo-file-system Files. A File is named after its path and pickers
    // cache under random names, so stage a copy under the original name (the server reads
    // the type and title from it).
    const dir = new Directory(Paths.cache, 'uploads', String(Date.now()));
    dir.create({ intermediates: true });
    try {
      const staged = new File(dir, file.name.replace(/[/\\\0]/g, '_') || 'upload');
      await new File(file.uri).copy(staged);
      const form = new FormData();
      form.append('file', staged);
      const res = await api.upload<{ document: DocumentSummary }>('/documents/upload', form, { auth: true });
      return res.data.document;
    } finally {
      dir.delete();
    }
  },

  fromText: (body: { title?: string; text: string }) =>
    api.post<{ document: DocumentSummary }>('/documents/text', body, { auth: true }).then((r) => r.data.document),

  fromUrl: (url: string) =>
    api.post<{ document: DocumentSummary }>('/documents/url', { url }, { auth: true }).then((r) => r.data.document),

  rename: (id: string, title: string) =>
    api.patch<{ document: DocumentSummary }>(`/documents/${id}`, { title }, { auth: true }).then((r) => r.data.document),

  /** Into a folder, or null for back onto the shelf */
  move: (id: string, folderId: string | null) =>
    api.patch<{ document: DocumentSummary }>(`/documents/${id}`, { folderId }, { auth: true }).then((r) => r.data.document),

  reprocess: (id: string, ocr: boolean) =>
    api.post<{ document: DocumentSummary }>(`/documents/${id}/reprocess`, { ocr }, { auth: true }).then((r) => r.data.document),

  remove: (id: string) => api.delete<null>(`/documents/${id}`, { auth: true }),

  reader: (id: string, voiceId?: string) =>
    api.get<ReaderData>(`/documents/${id}/reader${voiceId ? `?voiceId=${encodeURIComponent(voiceId)}` : ''}`, { auth: true }).then(data),
};
