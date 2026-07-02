import { useCallback, useState } from "react";
import type { DetailDialog } from "../app/types";

export function useDialogs() {
  const [detailDialog, setDetailDialog] = useState<DetailDialog | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; resolve: (value: boolean) => void } | null>(null);
  const [inputDialog, setInputDialog] = useState<{ message: string; value: string; resolve: (value: string | null) => void } | null>(null);

  const requestConfirm = useCallback(
    (message: string) => new Promise<boolean>((resolve) => setConfirmDialog({ message, resolve })),
    []
  );

  const requestInput = useCallback(
    (message: string, initial: string) => new Promise<string | null>((resolve) => setInputDialog({ message, value: initial, resolve })),
    []
  );

  return {
    detailDialog,
    setDetailDialog,
    confirmDialog,
    setConfirmDialog,
    inputDialog,
    setInputDialog,
    requestConfirm,
    requestInput
  };
}
