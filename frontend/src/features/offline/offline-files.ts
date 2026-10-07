import { Directory, File, Paths } from 'expo-file-system';
import { create } from 'zustand';

import type { ReaderChunk, ReaderData } from '@/features/library/types';
import { pronounce, speakable } from '@/features/pronunciations/lib/pronounce';
import type { Lang } from '@/lib/languages';

/** What's saved for one downloaded document, next to its clips */
export interface OfflineManifest {
  documentId: string;
  /** The server's fingerprint of the audio; a different one means the download is out of date */
  renderKey: string;
  /** The voice each language used when downloaded */
  voices: Record<Lang, string>;
  /** Everything the player needs to open the document without a connection */
  reader: ReaderData;
  clips: { index: number; voiceId: string; durationMs: number; file: string }[];
  sizeBytes: number;
  savedAt: string;
}

export interface DownloadProgress {
  phase: 'preparing' | 'downloading';
  done: number;
  total: number;
}

const root = () => new Directory(Paths.document, 'offline');
// Downloads started but not finished (e.g. the app was closed); they resume on the next launch
const pendingFile = () => new File(Paths.document, 'offline-pending.json');

function readPending(): string[] {
  try {
    const file = pendingFile();
    return file.exists ? (JSON.parse(file.textSync()) as string[]) : [];
  } catch {
    return [];
  }
}
export const documentDir = (documentId: string) => new Directory(root(), documentId);
const manifestFile = (documentId: string) => new File(documentDir(documentId), 'manifest.json');

function readManifest(documentId: string): OfflineManifest | null {
  try {
    const file = manifestFile(documentId);
    return file.exists ? (JSON.parse(file.textSync()) as OfflineManifest) : null;
  } catch {
    return null;
  }
}

function readAll() {
  const dir = root();
  if (!dir.exists) return {};
  const entries: Record<string, OfflineManifest> = {};
  for (const entry of dir.list()) {
    if (!(entry instanceof Directory)) continue;
    const manifest = readManifest(entry.name);
    if (manifest) entries[manifest.documentId] = manifest;
  }
  return entries;
}

interface OfflineState {
  downloads: Record<string, OfflineManifest>;
  /** Downloads in progress, by document */
  progress: Record<string, DownloadProgress>;
}

export const useOfflineStore = create<OfflineState>()(() => ({ downloads: readAll(), progress: {} }));

export const offlineFiles = {
  get: (documentId: string) => useOfflineStore.getState().downloads[documentId] ?? null,

  save(manifest: OfflineManifest) {
    manifestFile(manifest.documentId).write(JSON.stringify(manifest));
    useOfflineStore.setState((s) => ({ downloads: { ...s.downloads, [manifest.documentId]: manifest } }));
  },

  remove(documentId: string) {
    const dir = documentDir(documentId);
    if (dir.exists) dir.delete();
    useOfflineStore.setState((s) => {
      const { [documentId]: _removed, ...rest } = s.downloads;
      return { downloads: rest };
    });
  },

  removeAll() {
    const dir = root();
    if (dir.exists) dir.delete();
    useOfflineStore.setState({ downloads: {} });
  },

  pending: readPending,

  markPending(documentId: string, pending: boolean) {
    const ids = new Set(readPending());
    if (pending) ids.add(documentId);
    else ids.delete(documentId);
    pendingFile().write(JSON.stringify([...ids]));
  },

  setProgress(documentId: string, progress: DownloadProgress | null) {
    useOfflineStore.setState((s) => {
      const { [documentId]: _old, ...rest } = s.progress;
      return { progress: progress ? { ...rest, [documentId]: progress } : rest };
    });
  },

  /** The downloaded file for a chunk, if it still matches what would play (same voice and emotions) */
  /** The downloaded audio for a part, if it still says exactly what the part says now */
  clipFor(documentId: string, chunk: ReaderChunk, voiceId: string) {
    const manifest = useOfflineStore.getState().downloads[documentId];
    const clip = manifest?.clips.find((c) => c.index === chunk.index && c.voiceId === voiceId);
    if (!manifest || !clip) return null;
    const saved = manifest.reader.chunks.find((c) => c.index === chunk.index);
    if (!saved || saved.text !== chunk.text || (saved.take ?? 0) !== (chunk.take ?? 0)) return null;
    if (JSON.stringify(saved.expressions) !== JSON.stringify(chunk.expressions)) return null;
    // A pronunciation added or changed since the download changes how this part sounds
    if (pronounce(saved.text, manifest.reader.pronunciations ?? []) !== speakable(chunk.text)) return null;
    const file = new File(documentDir(documentId), clip.file);
    return file.exists ? { uri: file.uri, durationMs: clip.durationMs } : null;
  },
};
