import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

const FOLDER_KEY = 'settings.exportFolder';

/** Thrown when the listener closes the folder picker */
export class FolderPickCancelled extends Error {}

const baseName = (title: string) => title.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'ListenUp audio';

/** "Title", or "Title (2)" etc., so none of the files about to be saved replace one already there */
function freeBase(dir: Directory, title: string, extensions: string[]) {
  const taken = new Set(dir.list().map((entry) => entry.name));
  const base = baseName(title);
  let name = base;
  for (let n = 2; extensions.some((ext) => taken.has(`${name}.${ext}`)); n++) name = `${base} (${n})`;
  return name;
}

async function pickFolder() {
  try {
    const dir = await Directory.pickDirectoryAsync();
    // Android keeps the permission, so later saves go straight there
    SecureStore.setItem(FOLDER_KEY, dir.uri);
    return dir;
  } catch (e) {
    if (/cancel/i.test(String((e as Error)?.message ?? e))) throw new FolderPickCancelled();
    throw e;
  }
}

/** The folder picked last time, if it's still there and writable */
function savedFolder() {
  try {
    const uri = SecureStore.getItem(FOLDER_KEY);
    const dir = uri ? new Directory(uri) : null;
    return dir?.exists ? dir : null;
  } catch {
    return null;
  }
}

export const savedFolderName = () => savedFolder()?.name ?? null;

/** A file to save: its link and extension ("mp3", "srt", "vtt") */
export interface SaveFile {
  url: string;
  ext: string;
}

/**
 * Downloads files (an MP3, and its subtitles) and saves them side by side
 * under one name in the listener's chosen folder, asking for the folder the
 * first time (or when `chooseFolder` is set). Downloads go to the cache first
 * and are copied natively, so big files never sit in JS memory.
 */
export async function saveToFolder(files: SaveFile[], title: string, { chooseFolder = false } = {}) {
  const dir = (!chooseFolder && savedFolder()) || (await pickFolder());
  const base = freeBase(dir, title, files.map((f) => f.ext));

  // Copying a file into a folder names the copy after the file, so download it under the final name.
  // (Don't pre-create the target and copy with overwrite: Android deletes the target first, then can't write it.)
  const cache = new Directory(Paths.cache, 'exports', String(Date.now()));
  cache.create({ intermediates: true });
  try {
    for (const file of files) {
      const downloaded = await File.downloadFileAsync(file.url, new File(cache, `${base}.${file.ext}`));
      await downloaded.copy(dir);
    }
  } finally {
    cache.delete();
  }
  return dir.name;
}
