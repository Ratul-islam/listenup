import type { DocumentStatus, DocumentSummary } from '@/features/library/types';
import { api } from '@/lib/api/client';
import type { Lang } from '@/lib/languages';

/** A free classic in Explore */
export interface CatalogItem {
  id: string;
  title: string;
  /** The title in English, for titles written in another script */
  englishTitle: string | null;
  author: string;
  language: Lang;
  blurb: string;
  /** About how long it is at 1x */
  minutes: number;
  /** Where the text comes from, for the credit line */
  source: { name: string; url: string };
  /** Already on the listener's shelf */
  documentId: string | null;
  status: DocumentStatus | null;
}

export const catalogApi = {
  list: () => api.get<{ items: CatalogItem[] }>('/catalog', { auth: true }).then((r) => r.data.items),
  /** Puts a title on the shelf; adding it again returns the same document */
  add: (id: string) => api.post<{ document: DocumentSummary }>('/documents', { from: 'catalog', id }, { auth: true }).then((r) => r.data.document),
};
