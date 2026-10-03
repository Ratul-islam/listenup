import { BookOpen, FileText, Globe, Image as ImageIcon, NotebookPen, type LucideIcon } from 'lucide-react-native';

import type { Category, DocumentKind, DocumentSummary } from '../types';

/** What each kind of document is called, and the icon that tells them apart */
export const kindMeta: Record<DocumentKind, { label: string; icon: LucideIcon }> = {
  PDF: { label: 'PDF', icon: BookOpen },
  EPUB: { label: 'Book', icon: BookOpen },
  DOCX: { label: 'Word document', icon: FileText },
  WEB: { label: 'Article', icon: Globe },
  TEXT: { label: 'Note', icon: NotebookPen },
  MARKDOWN: { label: 'Note', icon: NotebookPen },
  IMAGE: { label: 'Scan', icon: ImageIcon },
};

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'books', label: 'Books' },
  { id: 'articles', label: 'Articles' },
  { id: 'notes', label: 'Notes' },
  { id: 'scans', label: 'Scans' },
];

export const sourceHost = (doc: DocumentSummary) => {
  if (!doc.sourceUrl) return null;
  try {
    return new URL(doc.sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};
