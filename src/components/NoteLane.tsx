import type { CSSProperties } from "react";
import type { GameNote, Judgement } from "../game/types";
import { getUpcomingNotes } from "../game/GameEngine";

export type HitEffect = {
  id: string;
  lane: number;
  judgement: Exclude<Judgement, "Miss">;
};

type NoteLaneProps = {
  notes: GameNote[];
  laneLabels: string[];
  currentTime: number;
  noteStates: Record<string, "pending" | "hit" | "miss">;
  visualOffsetMs: number;
  hitEffects: HitEffect[];
};

const APPROACH_SECONDS = 2.4;
const NOTE_HEIGHT_PX = 38;

export function NoteLane({ notes, laneLabels, currentTime, noteStates, visualOffsetMs, hitEffects }: NoteLaneProps) {
  const visibleNotes = getUpcomingNotes(notes, currentTime - visualOffsetMs / 1000, APPROACH_SECONDS);
  const laneWidth = 100 / laneLabels.length;

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

        const y = timeToYPercent(note.time + visualOffsetMs / 1000, currentTime);
        const holdEndY = timeToYPercent(note.time + note.duration + visualOffsetMs / 1000, currentTime);
        const holdTop = Math.min(y, holdEndY);
        const holdHeight = Math.max(8, Math.abs(y - holdEndY));
        const noteStyle =
          note.type === "hold"
            ? {
                left: `calc(${laneWidth * note.lane}% + 6px)`,
                width: `calc(${laneWidth}% - 12px)`,
                top: `${holdTop}%`,
                height: `${holdHeight}%`,
              }
            : {
                left: `calc(${laneWidth * note.lane}% + 6px)`,
                width: `calc(${laneWidth}% - 12px)`,
                top: `${y}%`,
                minHeight: NOTE_HEIGHT_PX,
              };

        return (
          <div
            className={`falling-note ${note.type}`}
            key={note.id}
            style={noteStyle}
          >
            {note.type === "hold" ? <i className="note-just-mark" aria-hidden="true" /> : null}
            <span>{note.label}</span>
          </div>
        );
      })}
      {hitEffects.map((effect) => {
        const lane = Math.min(laneLabels.length - 1, Math.max(0, effect.lane));
        return (
          <div
            className={`hit-burst ${effect.judgement.toLowerCase()}`}
            key={effect.id}
            style={
              {
                "--hit-lane-left": `${laneWidth * lane}%`,
                "--hit-lane-width": `${laneWidth}%`,
              } as CSSProperties
            }
            aria-hidden="true"
          >
            <span>{effect.judgement}</span>
          </div>
        );
      })}
    </div>
  );
}

function timeToYPercent(targetTime: number, currentTime: number): number {
  const untilHit = targetTime - currentTime;
  const progress = 1 - untilHit / APPROACH_SECONDS;
  return Math.max(-12, Math.min(108, progress * 86 + 4));
}
