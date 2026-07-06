import { useCallback, useState } from "react";
import type { ConfirmDialogState, DetailDialog, InputDialogState } from "../app/types";

export function useDialogs() {
  const [detailDialog, setDetailDialog] = useState<DetailDialog | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [inputDialog, setInputDialog] = useState<InputDialogState | null>(null);

  const requestConfirm = useCallback((message: string) => new Promise<boolean>((resolve) => setConfirmDialog({ message, resolve })), []);

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
