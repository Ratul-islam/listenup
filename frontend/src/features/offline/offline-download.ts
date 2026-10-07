import { File } from 'expo-file-system';

import { documentsApi } from '@/features/library/api/documents.api';
import type { DocumentSummary } from '@/features/library/types';
import { ApiError } from '@/lib/api/api-error';
import { api } from '@/lib/api/client';
import type { Lang } from '@/lib/languages';

import { documentDir, offlineFiles } from './offline-files';

interface OfflineStatus {
  status: 'NONE' | 'RUNNING' | 'READY' | 'FAILED';
  upToDate?: boolean;
  chunksDone?: number;
  chunkCount?: number;
  error?: string | null;
}

interface Manifest {
  renderKey: string;
  voices: Record<Lang, string>;
  clips: { index: number; voiceId: string; durationMs: number; mimeType: string; url: string }[];
}

const POLL_MS = 3000;
const DOWNLOAD_CONCURRENCY = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const voiceQuery = (voiceId?: string) => (voiceId ? `?voiceId=${encodeURIComponent(voiceId)}` : '');

export const offlineApi = {
  status: (documentId: string, voiceId?: string) =>
    api.get<{ offline: OfflineStatus }>(`/documents/${documentId}/offline${voiceQuery(voiceId)}`, { auth: true }).then((r) => r.data.offline),
  start: (documentId: string, voiceId?: string) =>
    api.post<{ offline: OfflineStatus }>(`/documents/${documentId}/offline`, { voiceId }, { auth: true }).then((r) => r.data.offline),
  manifest: (documentId: string, voiceId?: string) =>
    api.get<Manifest>(`/documents/${documentId}/offline/manifest${voiceQuery(voiceId)}`, { auth: true }).then((r) => r.data),
};

const inFlight = new Map<string, Promise<void>>();

/**
 * Picks up downloads the app was closed in the middle of. The server keeps
 * voicing while the app is closed, so most of the work is usually done.
 */
export async function resumeDownloads() {
  for (const id of offlineFiles.pending()) {
    try {
      const document = await documentsApi.get(id);
      void downloadForOffline(document).catch(() => {});
    } catch (e) {
      // Gone, or no connection yet: forget it if it's gone, otherwise try next launch
      if (e instanceof ApiError && e.status === 404) offlineFiles.markPending(id, false);
    }
  }
}

/**
 * Saves a document for offline listening (Plus and up): the server voices any
 * missing parts, then every clip and the reader data are downloaded into the
 * app's storage. Progress shows in the offline store. Safe to call twice.
 */
export function downloadForOffline(document: DocumentSummary) {
  let pending = inFlight.get(document.id);
  if (!pending) {
    offlineFiles.markPending(document.id, true);
    pending = run(document).finally(() => {
      inFlight.delete(document.id);
      offlineFiles.markPending(document.id, false);
      offlineFiles.setProgress(document.id, null);
    });
    inFlight.set(document.id, pending);
  }
  return pending;
}

async function run(document: DocumentSummary) {
  const voiceId = document.progress?.voiceId ?? undefined;

  // 1. The server voices whatever is missing
  let status = await offlineApi.start(document.id, voiceId);
  while (status.status === 'RUNNING') {
    offlineFiles.setProgress(document.id, { phase: 'preparing', done: status.chunksDone ?? 0, total: status.chunkCount ?? 1 });
    await sleep(POLL_MS);
    status = await offlineApi.status(document.id, voiceId);
  }
  if (status.status === 'FAILED') throw new ApiError(status.error ?? "Couldn't prepare the download.", 500, 'OFFLINE_FAILED');

  // 2. The clips and reader data come down to the phone
  const [reader, manifest] = await Promise.all([documentsApi.script(document.id, voiceId), offlineApi.manifest(document.id, voiceId)]);
  const dir = documentDir(document.id);
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });

  let done = 0;
  let next = 0;
  let sizeBytes = 0;
  const total = manifest.clips.length;
  offlineFiles.setProgress(document.id, { phase: 'downloading', done, total });
  const worker = async () => {
    while (next < total) {
      const clip = manifest.clips[next++];
      const file = await File.downloadFileAsync(clip.url, new File(dir, `${clip.index}.mp3`));
      sizeBytes += file.size ?? 0;
      offlineFiles.setProgress(document.id, { phase: 'downloading', done: ++done, total });
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, total) }, worker));
  } catch (e) {
    if (dir.exists) dir.delete();
    throw e;
  }

  offlineFiles.save({
    documentId: document.id,
    renderKey: manifest.renderKey,
    voices: manifest.voices,
    reader,
    clips: manifest.clips.map((c) => ({ index: c.index, voiceId: c.voiceId, durationMs: c.durationMs, file: `${c.index}.mp3` })),
    sizeBytes,
    savedAt: new Date().toISOString(),
  });
}
