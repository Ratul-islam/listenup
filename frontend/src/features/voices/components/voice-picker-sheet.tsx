import type { ReactNode } from 'react';

import { ActionSheet } from '@/components/ui/action-sheet';
import { LANGS, type Lang } from '@/lib/languages';

import type { Voice } from '../api/voices.api';
import { VoiceList } from './voice-list';

interface VoicePickerSheetProps {
  /** The document it's picked for: a voice translation also offers its speaker's voice */
  documentId?: string;
  visible: boolean;
  onClose: () => void;
  /** Languages to offer; all when omitted */
  languages?: readonly Lang[];
  /** The language tab to open on */
  initialLanguage?: Lang;
  selectedIds: string[];
  onSelect: (voice: Voice) => void;
  title?: string;
  /** Leave out the listener's own voice */
  builtInOnly?: boolean;
  /** Under the voices, e.g. the way to the characters' voices */
  footer?: ReactNode;
}

/** The voice list in a sheet (from the player and Studio): tabs per language and level, tap to choose, ▶ to hear */
export function VoicePickerSheet({ visible, onClose, languages = LANGS, initialLanguage, selectedIds, onSelect, title = 'Choose a voice', builtInOnly, footer, documentId }: VoicePickerSheetProps) {
  return (
    <ActionSheet visible={visible} onClose={onClose} title={title}>
      {visible ? (
        <VoiceList
          languages={languages.length ? languages : LANGS}
          initialLanguage={initialLanguage}
          selectedIds={selectedIds}
          onSelect={onSelect}
          builtInOnly={builtInOnly}
          maxListHeight={440}
          bottomInset={8}
          documentId={documentId}
        />
      ) : null}
      {footer}
    </ActionSheet>
  );
}
