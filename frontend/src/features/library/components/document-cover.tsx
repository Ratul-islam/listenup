import { BookCover } from '@/features/explore/components/book-cover';

import { kindMeta } from '../lib/kind-meta';
import type { DocumentSummary } from '../types';

/**
 * A shelf item's cover, in its own colour so every item looks like itself. A
 * large one carries the title, like Explore's books. A small one, which sits
 * beside the title, carries the mark of what it is instead (a book, an
 * article, a note, a scan). A check in the corner once it's been heard.
 */
export function DocumentCover({ document: doc, width }: { document: DocumentSummary; width: number }) {
  const Icon = kindMeta[doc.kind].icon;
  return (
    <BookCover
      item={{ id: doc.id, title: doc.title, author: doc.author ?? '' }}
      width={width}
      added={!!doc.progress?.completedAt}
      // The mark keeps its share of the cover at any size (the shelf's rows, the mini player)
      glyph={<Icon size={Math.round(width * 0.33)} color="rgba(255, 255, 255, 0.92)" strokeWidth={2} />}
    />
  );
}
