import { useEffect } from 'react';

import { useDocuments } from '@/features/library/hooks/use-documents';

import { updateHomeWidget } from './home-widget';
import type { WidgetSnapshot } from './widget-snapshot';

/**
 * Keeps the home-screen widget on the shelf's "Continue listening" item: the
 * same query as the shelf's card, refreshed as listening progress is saved.
 * Mounted while signed in; signing out clears the widget (see the auth store).
 */
export function useHomeWidgetSync() {
  const { data } = useDocuments({ category: 'all', sort: 'progress' });
  const doc = data?.items.find((d) => d.status === 'READY' && d.progress && !d.progress.completedAt) ?? null;
  const fraction = doc?.progress?.fraction ?? 0;
  const snapshot: WidgetSnapshot | null = data
    ? {
        signedIn: true,
        item: doc
          ? { id: doc.id, title: doc.title, author: doc.author, fraction, secondsLeft: Math.round(doc.estimatedDurationSec * (1 - fraction)) }
          : null,
      }
    : null;
  const key = JSON.stringify(snapshot);

  useEffect(() => {
    if (snapshot) updateHomeWidget(snapshot);
    // Redraw only when what it shows changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
