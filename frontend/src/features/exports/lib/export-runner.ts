import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';

import { ApiError, getErrorMessage } from '@/lib/api/api-error';
import { queryClient } from '@/lib/query-client';

import { exportsApi, type AudioExport } from '../api/exports.api';
import { saveToFolder, type SaveFile } from './save-to-folder';

export type SubtitleChoice = 'srt' | 'shortSrt' | 'wordsSrt' | 'vtt' | 'off';

/** What's saved next to the MP3, picked before it's made */
export interface ExportFiles {
  subtitles: SubtitleChoice;
  withText: boolean;
}

/** An MP3 the server is making, to save as soon as it's ready */
export interface ExportRequest extends ExportFiles {
  documentId: string;
  title: string;
  voiceId?: string;
}

export type ExportJob =
  | { phase: 'making'; done: number; total: number }
  | { phase: 'saving' }
  | { phase: 'saved'; folder: string }
  | { phase: 'failed'; error: string };

interface ExportState {
  /** Exports followed in this session, by document */
  jobs: Record<string, ExportJob>;
  /** A message for the toast host, shown once */
  notice: { variant: 'success' | 'danger'; label: string; description?: string } | null;
}

export const useExportStore = create<ExportState>()(() => ({ jobs: {}, notice: null }));

/** The export's status query, shared by the panel and the runner */
export const exportKey = (documentId: string, voiceId?: string) => ['export', documentId, voiceId] as const;

const POLL_MS = 3000;
const MAX_WAIT_MS = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Exports the app was closed during; the server kept going, and they're saved on the next launch
const pendingFile = () => new File(Paths.document, 'exports-pending.json');

function readPending(): ExportRequest[] {
  try {
    const file = pendingFile();
    return file.exists ? (JSON.parse(file.textSync()) as ExportRequest[]) : [];
  } catch {
    return [];
  }
}

function markPending(request: ExportRequest, pending: boolean) {
  const rest = readPending().filter((r) => r.documentId !== request.documentId);
  pendingFile().write(JSON.stringify(pending ? [...rest, request] : rest));
}

function setJob(documentId: string, job: ExportJob) {
  useExportStore.setState((s) => ({ jobs: { ...s.jobs, [documentId]: job } }));
}

/** A ready MP3 saved by hand from the panel */
export const noteSaved = (documentId: string, folder: string) => setJob(documentId, { phase: 'saved', folder });

/** The files to save for a ready export: the MP3, then the subtitles and the script if picked */
export function filesFor(exp: AudioExport, { subtitles, withText }: ExportFiles): SaveFile[] {
  const subtitleUrl = subtitles !== 'off' ? exp.subtitles?.[subtitles] : null;
  return [
    { url: exp.url!, ext: 'mp3' },
    ...(subtitleUrl ? [{ url: subtitleUrl, ext: subtitles === 'vtt' ? 'vtt' : 'srt' }] : []),
    ...(withText && exp.transcript ? [{ url: exp.transcript, ext: 'txt' }] : []),
  ];
}

/** The export's status, waiting out a lost connection (or a phone that slept) */
async function statusOf({ documentId, voiceId }: ExportRequest) {
  for (let wait = POLL_MS; ; wait = Math.min(wait * 2, MAX_WAIT_MS)) {
    try {
      return await exportsApi.status(documentId, voiceId);
    } catch (e) {
      if (!(e instanceof ApiError && e.isNetworkError)) throw e;
      await sleep(wait);
    }
  }
}

const inFlight = new Map<string, Promise<void>>();

export const isFollowing = (documentId: string) => inFlight.has(documentId);

/**
 * Follows an MP3 the server is making and saves it to the listener's folder
 * the moment it's ready, wherever they are in the app. If the app is closed
 * first, it's picked up on the next launch. Safe to call twice.
 */
export function saveWhenReady(request: ExportRequest, current?: AudioExport) {
  let pending = inFlight.get(request.documentId);
  if (!pending) {
    markPending(request, true);
    pending = follow(request, current).finally(() => {
      inFlight.delete(request.documentId);
      markPending(request, false);
    });
    inFlight.set(request.documentId, pending);
  }
  return pending;
}

/** Picks up exports the app was closed during */
export function resumeExports() {
  for (const request of readPending()) void saveWhenReady(request);
}

async function follow(request: ExportRequest, current?: AudioExport) {
  const { documentId, voiceId, title } = request;
  const notify = (notice: ExportState['notice']) => useExportStore.setState({ notice });

  let exp: AudioExport;
  try {
    exp = current ?? (await statusOf(request));
    while (exp.status === 'RUNNING') {
      queryClient.setQueryData(exportKey(documentId, voiceId), exp);
      setJob(documentId, { phase: 'making', done: exp.chunksDone ?? 0, total: Math.max(exp.chunkCount ?? 1, 1) });
      await sleep(POLL_MS);
      exp = await statusOf(request);
    }
    queryClient.setQueryData(exportKey(documentId, voiceId), exp);
    if (exp.status === 'FAILED') throw new Error(exp.error ?? "Couldn't finish the MP3. Try again in a moment.");
  } catch (e) {
    setJob(documentId, { phase: 'failed', error: getErrorMessage(e) });
    notify({ variant: 'danger', label: `Couldn't make the MP3 of “${title}”`, description: getErrorMessage(e) });
    return;
  }
  // Replaced by a newer export, or the script changed meanwhile: nothing to save, and the panel says what to do
  if (exp.status !== 'READY' || !exp.upToDate || !exp.url) {
    useExportStore.setState((s) => {
      const { [documentId]: _done, ...jobs } = s.jobs;
      return { jobs };
    });
    return;
  }

  setJob(documentId, { phase: 'saving' });
  try {
    const files = filesFor(exp, request);
    const folder = await saveToFolder(files, title, { ask: false });
    setJob(documentId, { phase: 'saved', folder });
    notify({
      variant: 'success',
      label: files.length > 1 ? 'MP3 and subtitles saved' : 'MP3 saved',
      description: `“${title}” is in ${folder}.`,
    });
  } catch (e) {
    setJob(documentId, { phase: 'failed', error: getErrorMessage(e) });
    notify({ variant: 'danger', label: `Couldn't save the MP3 of “${title}”`, description: getErrorMessage(e) });
  }
}
