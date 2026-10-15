import { useToast } from 'heroui-native';
import { useEffect } from 'react';

import { useExportStore } from '../lib/export-runner';

/** Says when an MP3 made in the background has been saved (or couldn't be), wherever the listener is */
export function ExportNotices() {
  const { toast } = useToast();
  const notice = useExportStore((s) => s.notice);

  useEffect(() => {
    if (!notice) return;
    toast.show(notice);
    useExportStore.setState({ notice: null });
  }, [notice, toast]);

  return null;
}
