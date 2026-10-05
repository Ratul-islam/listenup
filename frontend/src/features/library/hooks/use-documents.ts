import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { playbackApi } from '@/features/player/api/playback.api';
import type { Lang } from '@/lib/languages';

import { documentsApi, type ImportLanguage, type PickedFile } from '../api/documents.api';
import type { Category, DocumentList, SortOrder } from '../types';

export const documentsKey = ['documents'] as const;

const isBusy = (list?: DocumentList) => list?.items.some((d) => d.status === 'PENDING' || d.status === 'PROCESSING');

/** Library list; polls while imports are still being prepared */
export function useDocuments(params: { category: Category; q?: string; sort: SortOrder; folder?: string }) {
  return useQuery({
    queryKey: [...documentsKey, params],
    queryFn: () => documentsApi.list(params),
    placeholderData: (prev) => prev,
    refetchInterval: (query) => (isBusy(query.state.data) ? 2500 : false),
  });
}

export function useListeningStats() {
  return useQuery({ queryKey: ['stats'], queryFn: playbackApi.stats, staleTime: 60_000 });
}

/** Documents and folder item counts both change when documents do */
export function useInvalidateDocuments() {
  const client = useQueryClient();
  return () => Promise.all([client.invalidateQueries({ queryKey: documentsKey }), client.invalidateQueries({ queryKey: ['folders'] })]);
}

export function useImportFile() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: ({ file, language }: { file: PickedFile; language?: ImportLanguage }) => documentsApi.upload(file, language),
    onSuccess: invalidate,
  });
}

export function useImportText() {
  const invalidate = useInvalidateDocuments();
  return useMutation({ mutationFn: documentsApi.fromText, onSuccess: invalidate });
}

export function useImportUrl() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: ({ url, language }: { url: string; language?: ImportLanguage }) => documentsApi.fromUrl(url, language),
    onSuccess: invalidate,
  });
}

export function useRenameDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({ mutationFn: ({ id, title }: { id: string; title: string }) => documentsApi.rename(id, title), onSuccess: invalidate });
}

export function useReprocessDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: ({ id, ocr, keepClutter }: { id: string; ocr: boolean; keepClutter?: boolean }) => documentsApi.reprocess(id, ocr, keepClutter),
    onSuccess: invalidate,
  });
}

export function useTranslateDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({ mutationFn: ({ id, language }: { id: string; language: Lang }) => documentsApi.translate(id, language), onSuccess: invalidate });
}

export function useDeleteDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({ mutationFn: (id: string) => documentsApi.remove(id), onSuccess: invalidate });
}
