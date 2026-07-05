import { useEffect, useRef, useState } from "react";
import { emptyLevelCounts } from "../../app/constants";
import type { LogLevelFilter } from "../../app/types";
import { levelBucket, type ParsedLog } from "./logParsing";

// Cuenta las lineas por nivel de forma incremental y por lotes (troceada con
// setTimeout) para no bloquear el hilo con logs grandes. Reaprovecha el conteo
// previo si las lineas nuevas son una continuacion (append) del ultimo calculo.
export function useLevelCounts(
  lines: string[],
  pretty: boolean,
  getParsed: (line: string) => ParsedLog
): { levelCounts: Record<LogLevelFilter, number>; levelCountsReady: boolean } {
  const [levelCounts, setLevelCounts] = useState<Record<LogLevelFilter, number>>(() => emptyLevelCounts());
  const [levelCountsReady, setLevelCountsReady] = useState(true);
  const levelCountRef = useRef<{
    length: number;
    first: string;
    last: string;
    counts: Record<LogLevelFilter, number>;
  } | null>(null);

  useEffect(() => {
    if (!pretty) {
      setLevelCounts(emptyLevelCounts());
      setLevelCountsReady(true);
      levelCountRef.current = null;
      return;
    }

    let cancelled = false;
    const previous = levelCountRef.current;
    const canContinue =
      previous &&
      previous.length > 0 &&
      previous.length <= lines.length &&
      lines[0] === previous.first &&
      lines[previous.length - 1] === previous.last;
    const counts = canContinue ? { ...previous.counts } : emptyLevelCounts();
    const first = lines[0] ?? "";
    let index = 0;
    let timer = 0;

    if (canContinue) index = previous.length;
    setLevelCounts({ ...counts });
    setLevelCountsReady(index >= lines.length);

    const step = () => {
      const limit = Math.min(lines.length, index + 1200);
      for (; index < limit; index++) {
        counts[levelBucket(getParsed(lines[index]).level)]++;
      }
      if (cancelled) return;

      levelCountRef.current = {
        length: index,
        first,
        last: lines[index - 1] ?? "",
        counts: { ...counts }
      };
      setLevelCounts({ ...counts });
      if (index < lines.length) {
        timer = window.setTimeout(step, 0);
      } else {
        setLevelCountsReady(true);
      }
    };

    timer = window.setTimeout(step, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lines, pretty, getParsed]);

  return { levelCounts, levelCountsReady };
}
