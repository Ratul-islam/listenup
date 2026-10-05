import { ScrollView } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { LANGS, type Lang } from '@/lib/languages';

import type { Voice } from '../api/voices.api';
import { VoiceList } from './voice-list';

interface VoicePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Languages to offer; all when omitted */
  languages?: readonly Lang[];
  selectedIds: string[];
  onSelect: (voice: Voice) => void;
  title?: string;
}

/** The voice list in a sheet (from the player): tabs per language, tap to choose, ▶ to hear */
export function VoicePickerSheet({ visible, onClose, languages = LANGS, selectedIds, onSelect, title = 'Choose a voice' }: VoicePickerSheetProps) {
  return (
    <ActionSheet visible={visible} onClose={onClose} title={title}>
      {visible ? (
        <ScrollView style={{ maxHeight: 560 }} contentContainerClassName="pb-2" showsVerticalScrollIndicator={false}>
          <VoiceList languages={languages.length ? languages : LANGS} selectedIds={selectedIds} onSelect={onSelect} />
        </ScrollView>
      ) : null}
    </ActionSheet>
  );
}
