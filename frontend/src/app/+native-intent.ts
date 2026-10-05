/** Content shared from another app ("Share to ListenUp") opens the import-from-share screen */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (new URL(path).hostname === 'expo-sharing') return '/share';
    return path;
  } catch {
    return path;
  }
}
