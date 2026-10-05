import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { ReaderChunk } from '@/features/library/types';
import type { VoiceTier } from '@/features/voices/api/voices.api';
import { api } from '@/lib/api/client';
import { phoneVoice } from '@/modules/phone-voice';

interface VoiceNoteFile {
  url: string;
  durationMs: number;
  mimeType: string;
  fileName: string;
}

const safeName = (text: string, ext: string) => {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
  return `ListenUp – ${words.replace(/[\\/:*?"<>|]/g, '').slice(0, 60).trim() || 'voice note'}.${ext}`;
};

/** A fresh cache folder per note, so the shared file keeps its friendly name */
function noteFolder() {
  const dir = new Directory(Paths.cache, 'voice-notes', String(Date.now()));
  dir.create({ intermediates: true });
  return dir;
}

/**
 * Voices part of a chunk (with its emotions) and opens the share sheet, e.g. to
 * send it on WhatsApp. Phone voices are voiced right here on the device.
 */
export async function shareVoiceNote(opts: {
  documentId: string;
  chunk: ReaderChunk;
  range: { start: number; end: number };
  tier: VoiceTier;
  voiceId: string | null;
}) {
  const { documentId, chunk, range, tier, voiceId } = opts;
  const text = chunk.text.slice(range.start, range.end);
  let file: File;
  let mimeType: string;

  if (tier === 'phone') {
    const clip = await phoneVoice.synthesize(text.trim(), chunk.language);
    file = new File(noteFolder(), safeName(text, 'wav'));
    new File(clip.uri).copy(file);
    mimeType = 'audio/wav';
  } else {
    const { data } = await api.post<VoiceNoteFile>(
      `/playback/${documentId}/voice-notes`,
      { chunkIndex: chunk.index, start: range.start, end: range.end, voiceId: voiceId ?? undefined },
      { auth: true, timeoutMs: 60_000 },
    );
    file = await File.downloadFileAsync(data.url, new File(noteFolder(), data.fileName));
    mimeType = data.mimeType;
  }

  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Send voice note' });
}
