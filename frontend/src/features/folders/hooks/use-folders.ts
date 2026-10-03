import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { documentsApi } from '@/features/library/api/documents.api';
import { documentsKey } from '@/features/library/hooks/use-documents';

import { foldersApi } from '../api/folders.api';

export const foldersKey = ['folders'] as const;

export function useFolders() {
  return useQuery({ queryKey: foldersKey, queryFn: foldersApi.list });
}

export function useFolder(id: string) {
  return useQuery({ queryKey: [...foldersKey, id], queryFn: () => foldersApi.get(id) });
}

/** Folder changes also change what the shelf lists, so both refresh */
function useInvalidate() {
  const client = useQueryClient();
  return () => Promise.all([client.invalidateQueries({ queryKey: foldersKey }), client.invalidateQueries({ queryKey: documentsKey })]);
}

export function useCreateFolder() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: foldersApi.create, onSuccess: invalidate });
}

export function useRenameFolder() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => foldersApi.rename(id, name), onSuccess: invalidate });
}

export function useDeleteFolder() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: foldersApi.remove, onSuccess: invalidate });
}

export function useMoveDocument() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) => documentsApi.move(id, folderId),
    onSuccess: invalidate,
  });
}
