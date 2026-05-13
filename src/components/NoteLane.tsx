import type { CSSProperties } from "react";
import type { GameNote } from "../game/types";
import { getUpcomingNotes } from "../game/GameEngine";

type NoteLaneProps = {
  notes: GameNote[];
  laneLabels: string[];
  currentTime: number;
  noteStates: Record<string, "pending" | "hit" | "miss">;
  visualOffsetMs: number;
};

const APPROACH_SECONDS = 2.4;

export function NoteLane({ notes, laneLabels, currentTime, noteStates, visualOffsetMs }: NoteLaneProps) {
  const visibleNotes = getUpcomingNotes(notes, currentTime - visualOffsetMs / 1000, APPROACH_SECONDS);

  return (
    <div className="lane-stage" style={{ "--lane-count": laneLabels.length } as CSSProperties}>
      <div className="lane-labels">
        {laneLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="hit-line" aria-hidden="true" />
      {laneLabels.map((label, index) => (
        <div className="lane-column" key={label} style={{ left: `${(100 / laneLabels.length) * index}%` }} />
      ))}
      {visibleNotes.map((note) => {
        const state = noteStates[note.id] ?? "pending";
        if (state !== "pending") return null;

        const adjustedTime = note.time + visualOffsetMs / 1000;
        const untilHit = adjustedTime - currentTime;
        const progress = 1 - untilHit / APPROACH_SECONDS;
        const y = Math.max(-10, Math.min(104, progress * 86 + 4));
        const laneWidth = 100 / laneLabels.length;
        const holdHeight = note.type === "hold" ? Math.min(36, Math.max(12, (note.duration / APPROACH_SECONDS) * 78)) : 0;

        return (
          <div
            className={`falling-note ${note.type}`}
            key={note.id}
            style={{
              left: `calc(${laneWidth * note.lane}% + 6px)`,
              width: `calc(${laneWidth}% - 12px)`,
              top: `${y}%`,
              height: note.type === "hold" ? `${holdHeight}%` : undefined,
            }}
          >
            <span>{note.label}</span>
          </div>
        );
      })}
    </div>
  );
}
