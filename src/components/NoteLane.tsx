import type { CSSProperties } from "react";
import type { GameNote, Judgement } from "../game/types";
import { getUpcomingNotes } from "../game/GameEngine";

export type HitEffect = {
  id: string;
  lane: number;
  judgement: Exclude<Judgement, "Miss">;
};

export type LanePressEffect = {
  id: string;
  lane: number;
};

type NoteLaneProps = {
  notes: GameNote[];
  laneLabels: string[];
  currentTime: number;
  noteStates: Record<string, "pending" | "hit" | "miss">;
  visualOffsetMs: number;
  hitEffects: HitEffect[];
  lanePressEffects: LanePressEffect[];
};

const APPROACH_SECONDS = 2.4;
const NOTE_HEIGHT_PX = 38;

export function NoteLane({ notes, laneLabels, currentTime, noteStates, visualOffsetMs, hitEffects, lanePressEffects }: NoteLaneProps) {
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
      {lanePressEffects.map((effect) => {
        const lane = Math.min(laneLabels.length - 1, Math.max(0, effect.lane));
        return (
          <div
            className="lane-press-flash"
            key={effect.id}
            style={
              {
                "--hit-lane-left": `${laneWidth * lane}%`,
                "--hit-lane-width": `${laneWidth}%`,
              } as CSSProperties
            }
            aria-hidden="true"
          />
        );
      })}
      {visibleNotes.map((note) => {
        const state = noteStates[note.id] ?? "pending";
        if (state !== "pending") return null;

        const isPhrase = note.playbackMode === "phrase" && (note.phraseOffsets?.length ?? 0) > 1;
        const y = timeToYPercent(note.time + visualOffsetMs / 1000, currentTime);
        const holdEndY = timeToYPercent(note.time + note.duration + visualOffsetMs / 1000, currentTime);
        const holdTop = Math.min(y, holdEndY);
        const holdHeight = Math.max(8, Math.abs(y - holdEndY));
        const phraseHeight = Math.min(96, Math.max(NOTE_HEIGHT_PX, NOTE_HEIGHT_PX + note.duration * 24));
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
                minHeight: isPhrase ? phraseHeight : NOTE_HEIGHT_PX,
              };

        return (
          <div
            className={`falling-note ${note.type} ${isPhrase ? "phrase" : ""}`}
            key={note.id}
            style={noteStyle}
          >
            {note.type === "hold" ? <i className="note-just-mark" aria-hidden="true" /> : null}
            {isPhrase ? <PhraseTicks note={note} /> : null}
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

function PhraseTicks({ note }: { note: GameNote }) {
  const visibleOffsets = (note.phraseOffsets ?? [])
    .filter((offset) => offset > 0.02 && offset < note.duration - 0.02)
    .slice(0, 10);

  if (visibleOffsets.length === 0) return null;

  return (
    <i className="phrase-ticks" aria-hidden="true">
      {visibleOffsets.map((offset, index) => (
        <b
          className="phrase-tick"
          key={`${note.id}-tick-${index}-${offset}`}
          style={{ top: `${Math.min(88, Math.max(12, (offset / Math.max(note.duration, 0.01)) * 100))}%` }}
        />
      ))}
    </i>
  );
}

function timeToYPercent(targetTime: number, currentTime: number): number {
  const untilHit = targetTime - currentTime;
  const progress = 1 - untilHit / APPROACH_SECONDS;
  return Math.max(-12, Math.min(108, progress * 86 + 4));
}
