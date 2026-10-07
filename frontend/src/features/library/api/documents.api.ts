import { File, UploadType } from 'expo-file-system';

import { ApiError } from '@/lib/api/api-error';
import { api } from '@/lib/api/client';
import type { Lang } from '@/lib/languages';

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

/** Language picked at import; "auto" lets the server detect it */
export type ImportLanguage = Lang | 'auto';

export const documentsApi = {
  /**
   * The Soundshelf, or Studio's scripts (`view: 'scripts'`). `folder`: "root" for loose
   * items, a folder id for its contents; omit to search everything.
   */
  list: (params: { view?: 'shelf' | 'scripts'; category: Category; q?: string; sort: SortOrder; folder?: string }) => {
    const query = new URLSearchParams({
      view: params.view ?? 'shelf',
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
  upload: async (file: PickedFile, language: ImportLanguage = 'auto', script = false) => {
    const source = new File(file.uri);
    const { data: ticket } = await api.post<UploadTicket>('/documents/uploads', { fileName: file.name, size: source.size }, { auth: true });
    const sent = await source.upload(ticket.url, { httpMethod: 'PUT', uploadType: UploadType.BINARY_CONTENT, headers: ticket.headers });
    if (sent.status < 200 || sent.status >= 300) {
      throw new ApiError("The upload didn't go through. Check your connection and try again.", sent.status, 'UPLOAD_FAILED');
    }
    const { data } = await api.post<{ document: DocumentSummary }>(
      '/documents',
      { from: 'upload', uploadId: ticket.uploadId, fileName: file.name, language, script },
      { auth: true },
    );
    return data.document;
  },

  /** Text of any length up to the limit; the server splits it into parts */
  fromText: (body: { title?: string; text: string; language?: ImportLanguage; script?: boolean }) =>
    api.post<{ document: DocumentSummary }>('/documents', { from: 'text', ...body }, { auth: true }).then((r) => r.data.document),

  fromUrl: (url: string, language: ImportLanguage = 'auto', script = false) =>
    api.post<{ document: DocumentSummary }>('/documents', { from: 'url', url, language, script }, { auth: true }).then((r) => r.data.document),

  /** Today's digest (one a day; asking again returns it) */
  digest: (day: string) =>
    api.post<{ document: DocumentSummary }>('/documents', { from: 'digest', day }, { auth: true, timeoutMs: 120_000 }).then((r) => r.data.document),

  rename: (id: string, title: string) =>
    api.patch<{ document: DocumentSummary }>(`/documents/${id}`, { title }, { auth: true }).then((r) => r.data.document),

  /** To Studio as a script, or back onto the Soundshelf */
  setScript: (id: string, script: boolean) =>
    api.patch<{ document: DocumentSummary }>(`/documents/${id}`, { script }, { auth: true }).then((r) => r.data.document),

  /** Into a folder, or null for back onto the shelf */
  move: (id: string, folderId: string | null) =>
    api.patch<{ document: DocumentSummary }>(`/documents/${id}`, { folderId }, { auth: true }).then((r) => r.data.document),

  /** Reads the document again: with OCR, and/or changing whether citations and links are read */
  reprocess: (id: string, ocr: boolean, keepClutter?: boolean) =>
    api.post<{ document: DocumentSummary }>(`/documents/${id}/reprocess`, { ocr, keepClutter }, { auth: true }).then((r) => r.data.document),

  /** A translated copy, which appears on the shelf when it's ready */
  translate: (id: string, language: Lang) =>
    api.post<{ document: DocumentSummary }>(`/documents/${id}/translations`, { language }, { auth: true }).then((r) => r.data.document),

  remove: (id: string) => api.delete<null>(`/documents/${id}`, { auth: true }),

  /** The document as parts, with which are voiced in this voice, and the listener's pronunciations */
  script: (id: string, voiceId?: string) =>
    api.get<ReaderData>(`/documents/${id}/script${voiceId ? `?voiceId=${encodeURIComponent(voiceId)}` : ''}`, { auth: true }).then(data),
};
