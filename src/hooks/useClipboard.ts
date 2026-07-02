import { useCallback, useEffect, useRef, useState } from "react";
import { unknownMessage } from "../kubectl/format";

export function useClipboard(onError: (message: string) => void) {
  const [toastMessage, setToastMessage] = useState("");
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage("");
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  const copyToClipboard = useCallback(
    async (text: string, label = "Texto") => {
      if (!text.trim()) return;
      try {
        await window.kubeui.writeClipboard(text);
        showToast(`${label} copiado al portapapeles.`);
      } catch (error) {
        onError(`No se pudo copiar: ${unknownMessage(error)}`);
      }
    },
    [onError, showToast]
  );

  useEffect(
    () => () => {
      if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
    },
    []
  );

  return { toastMessage, copyToClipboard };
}
