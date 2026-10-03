import { File, UploadType } from 'expo-file-system';

import { ApiError } from '@/lib/api/api-error';
import { api } from '@/lib/api/client';

import type { Category, DocumentList, DocumentSummary, ReaderData, SortOrder } from '../types';

const data = <T>(r: { data: T }) => r.data;

interface UploadTicket {
  uploadId: string;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

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

  /**
   * Direct upload: the API hands out a link that accepts exactly this file, the
   * file goes straight to storage (natively streamed, so large PDFs never sit in
   * JS memory, and the API's 4.5 MB body limit on Vercel doesn't apply), then
   * the API is told it's there and starts reading it.
   */
  upload: async (file: PickedFile) => {
    const source = new File(file.uri);
    const { data: ticket } = await api.post<UploadTicket>('/documents/uploads', { fileName: file.name, size: source.size }, { auth: true });
    const sent = await source.upload(ticket.url, { httpMethod: 'PUT', uploadType: UploadType.BINARY_CONTENT, headers: ticket.headers });
    if (sent.status < 200 || sent.status >= 300) {
      throw new ApiError("The upload didn't go through. Check your connection and try again.", sent.status, 'UPLOAD_FAILED');
    }
    const { data } = await api.post<{ document: DocumentSummary }>(`/documents/uploads/${ticket.uploadId}/complete`, { fileName: file.name }, { auth: true });
    return data.document;
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
