import type { RefObject, UIEvent } from "react";
import { LOG_ROW_H } from "../../app/constants";
import { highlightText, levelClass, type ParsedLog } from "./logParsing";

type Props = {
  scrollRef: RefObject<HTMLDivElement>;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  pretty: boolean;
  lines: string[];
  displayIndexes: number[];
  visible: number[];
  startIndex: number;
  totalHeight: number;
  getParsed: (line: string) => ParsedLog;
  term: string;
  matchSet: Set<number>;
  currentLine: number;
  selected: number | null;
  onToggleSelect: (index: number) => void;
};

export function LogRows({
  scrollRef,
  onScroll,
  pretty,
  lines,
  displayIndexes,
  visible,
  startIndex,
  totalHeight,
  getParsed,
  term,
  matchSet,
  currentLine,
  selected,
  onToggleSelect
}: Props) {
  return (
    <div className={`logs-vscroll ${pretty ? "" : "logs-raw-scroll"}`} ref={scrollRef} onScroll={onScroll}>
      <div className="logs-vspace" style={{ height: totalHeight }}>
        <div className="logs-vrows" style={{ transform: `translateY(${startIndex * LOG_ROW_H}px)` }}>
          {visible.map((position) => {
            const index = displayIndexes[position];
            const isMatch = matchSet.has(index);
            const isCurrent = index === currentLine;
            if (pretty) {
              const entry = getParsed(lines[index]);
              const isJson = Boolean(entry.json);
              return (
                <div
                  key={index}
                  className={`log-vrow ${levelClass(entry.level)}${isMatch ? " is-match" : ""}${isCurrent ? " is-current" : ""}${selected === index ? " is-selected" : ""}${isJson ? " clickable" : ""}`}
                  style={{ height: LOG_ROW_H }}
                  onClick={() => onToggleSelect(index)}
                >
                  {entry.time && <span className="log-time">{entry.time}</span>}
                  {entry.level && <span className={`log-level ${levelClass(entry.level)}`}>{entry.level}</span>}
                  <span className="log-message">{term ? highlightText(entry.message, term) : entry.message}</span>
                  {entry.source && <span className="log-source">{entry.source}</span>}
                </div>
              );
            }
            const line = lines[index];
            return (
              <div
                key={index}
                className={`log-vrow log-raw-row${isMatch ? " is-match" : ""}${isCurrent ? " is-current" : ""}${selected === index ? " is-selected" : ""}`}
                style={{ height: LOG_ROW_H }}
                onClick={() => onToggleSelect(index)}
              >
                <span className="log-raw-message">{term ? highlightText(line, term) : line}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
