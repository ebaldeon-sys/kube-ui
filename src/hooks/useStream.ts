import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { StreamOwner, TabRunState, TabSession } from "../app/types";

export function useStream(setTabs: Dispatch<SetStateAction<TabSession[]>>) {
  const [streamOwner, setStreamOwner] = useState<StreamOwner | null>(null);
  const stopStreamRef = useRef<(() => void) | null>(null);
  const logBufferRef = useRef("");
  const logFlushTimerRef = useRef<number | null>(null);
  const streamOwnerRef = useRef<StreamOwner | null>(null);

  const setCurrentStreamOwner = useCallback((owner: StreamOwner | null) => {
    streamOwnerRef.current = owner;
    setStreamOwner(owner);
  }, []);

  const stopStream = useCallback(
    (opts?: { tabId?: string; state?: TabRunState; label?: string }) => {
      const owner = streamOwnerRef.current;
      if (opts?.tabId && owner && owner.tabId !== opts.tabId) return false;
      if (logFlushTimerRef.current != null) {
        window.clearTimeout(logFlushTimerRef.current);
        logFlushTimerRef.current = null;
      }
      logBufferRef.current = "";
      const hadStream = Boolean(stopStreamRef.current);
      if (stopStreamRef.current) {
        stopStreamRef.current();
        stopStreamRef.current = null;
      }
      setCurrentStreamOwner(null);

      const targetTabId = owner?.tabId ?? opts?.tabId;
      if ((hadStream || owner) && targetTabId) {
        setTabs((current) =>
          current.map((tab) =>
            tab.id === targetTabId && tab.loading
              ? { ...tab, loading: false, runState: opts?.state ?? "stopped", runLabel: opts?.label ?? "Detenido" }
              : tab
          )
        );
      }
      return hadStream || Boolean(owner);
    },
    [setCurrentStreamOwner, setTabs]
  );

  return {
    streamOwner,
    streamOwnerRef,
    stopStreamRef,
    logBufferRef,
    logFlushTimerRef,
    setCurrentStreamOwner,
    stopStream
  };
}
