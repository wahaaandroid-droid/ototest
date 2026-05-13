import type { Difficulty, GameChart, GameNote, MidiTrackInfo, ParsedNote } from "../game/types";
import { detectChordLabel, groupNotesByStartTime } from "./detectChords";

const HOLD_THRESHOLD_SECONDS = 0.65;
const CHORD_GROUP_WINDOW_MS = 80;
const SINGLE_LANE_LABELS = ["Low", "Mid", "High", "Top"];

type DifficultyProfile = {
  chordGroupWindowMs: number;
  minGlobalGapSeconds: number;
  minLaneGapSeconds: number;
};

const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: {
    chordGroupWindowMs: 140,
    minGlobalGapSeconds: 0.18,
    minLaneGapSeconds: 0.32,
  },
  normal: {
    chordGroupWindowMs: 100,
    minGlobalGapSeconds: 0.09,
    minLaneGapSeconds: 0.2,
  },
  hard: {
    chordGroupWindowMs: CHORD_GROUP_WINDOW_MS,
    minGlobalGapSeconds: 0,
    minLaneGapSeconds: 0,
  },
};

export function convertMidiTrackToSingleChart(track: MidiTrackInfo, difficulty: Difficulty): GameChart {
  const range = buildTrackRange(track.notes);
  const rawNotes: GameNote[] = track.notes
    .filter((note) => note.duration > 0)
    .map((note, index) => {
      const isHold = note.duration >= HOLD_THRESHOLD_SECONDS;
      const lane = laneForMidi(note.midi, range);
      return {
        id: `single-${track.index}-${index}`,
        time: note.time,
        duration: note.duration,
        type: isHold ? ("hold" as const) : ("tap" as const),
        midiNotes: [note.midi],
        label: isHold ? "Hold" : SINGLE_LANE_LABELS[lane],
        lane,
        velocity: note.velocity,
      };
    })
    .sort((a, b) => a.time - b.time);

  const spreadNotes = spreadDenseSingleLanes(rawNotes);
  const notes = thinNotesForDifficulty(spreadNotes, DIFFICULTY_PROFILES[difficulty]);

  return {
    notes,
    laneLabels: SINGLE_LANE_LABELS,
    mode: "single",
    difficulty,
  };
}

export function convertMidiTrackToChordChart(track: MidiTrackInfo, difficulty: Difficulty): GameChart {
  const profile = DIFFICULTY_PROFILES[difficulty];
  const groups = groupNotesByStartTime(track.notes, profile.chordGroupWindowMs)
    .filter((group) => group.length > 0)
    .map((group, index) => buildChordCandidate(group, track.index, index));

  const counts = new Map<string, number>();
  for (const note of groups) {
    counts.set(note.label, (counts.get(note.label) ?? 0) + 1);
  }

  const rankedLabels = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
  const hasOverflow = rankedLabels.length > 6;
  const laneLabels = hasOverflow ? [...rankedLabels.slice(0, 5), "Other"] : rankedLabels.slice(0, 6);
  const safeLaneLabels = laneLabels.length > 0 ? laneLabels : ["C"];

  const mappedNotes = groups.map((note) => {
    const lane = safeLaneLabels.includes(note.label) ? safeLaneLabels.indexOf(note.label) : safeLaneLabels.indexOf("Other");
    return {
      ...note,
      label: lane === safeLaneLabels.indexOf("Other") && !safeLaneLabels.includes(note.label) ? "Other" : note.label,
      lane: Math.max(0, lane),
    };
  });
  const notes = thinNotesForDifficulty(mappedNotes, profile);

  return {
    notes,
    laneLabels: safeLaneLabels,
    mode: "chord",
    difficulty,
  };
}

function buildChordCandidate(group: ParsedNote[], trackIndex: number, groupIndex: number): GameNote {
  const sorted = [...group].sort((a, b) => a.midi - b.midi);
  const midiNotes = sorted.map((note) => note.midi);
  const starts = sorted.map((note) => note.time);
  const durations = sorted.map((note) => note.duration);
  const velocities = sorted.map((note) => note.velocity);
  const label = midiNotes.length >= 3 ? detectChordLabel(midiNotes) : SINGLE_LANE_LABELS[laneForMidi(midiNotes[0], buildTrackRange(sorted))];

  return {
    id: `chord-${trackIndex}-${groupIndex}`,
    time: Math.min(...starts),
    duration: Math.max(...durations),
    type: midiNotes.length >= 3 ? "chord" : Math.max(...durations) >= HOLD_THRESHOLD_SECONDS ? "hold" : "tap",
    midiNotes,
    label,
    lane: 0,
    velocity: velocities.reduce((sum, velocity) => sum + velocity, 0) / velocities.length,
  };
}

function buildTrackRange(notes: Pick<ParsedNote, "midi">[]): { min: number; max: number } {
  if (notes.length === 0) return { min: 48, max: 84 };
  return {
    min: Math.min(...notes.map((note) => note.midi)),
    max: Math.max(...notes.map((note) => note.midi)),
  };
}

function laneForMidi(midi: number, range: { min: number; max: number }): number {
  const span = Math.max(1, range.max - range.min + 1);
  const rangeLane = Math.min(3, Math.max(0, Math.floor(((midi - range.min) / span) * 4)));
  const pitchColor = [0, 1, 1, 2, 2, 3, 3, 0, 1, 2, 3, 0][midi % 12];
  return Math.min(3, Math.max(0, Math.round(rangeLane * 0.68 + pitchColor * 0.32)));
}

function spreadDenseSingleLanes(notes: GameNote[]): GameNote[] {
  const recentByLane = [-999, -999, -999, -999];
  let previousLane = -1;
  let repeatCount = 0;

  return notes.map((note) => {
    let lane = note.lane;
    const tooClose = note.time - recentByLane[lane] < 0.22;
    if (lane === previousLane) {
      repeatCount += 1;
    } else {
      repeatCount = 0;
    }

    if (tooClose || repeatCount >= 2) {
      const direction = note.midiNotes[0] % 2 === 0 ? 1 : -1;
      for (let step = 1; step <= 3; step += 1) {
        const candidate = Math.min(3, Math.max(0, lane + direction * step));
        if (candidate !== lane && note.time - recentByLane[candidate] >= 0.16) {
          lane = candidate;
          break;
        }
      }
    }

    recentByLane[lane] = note.time;
    previousLane = lane;
    return {
      ...note,
      lane,
      label: note.type === "hold" ? "Hold" : SINGLE_LANE_LABELS[lane],
    };
  });
}

function thinNotesForDifficulty(notes: GameNote[], profile: DifficultyProfile): GameNote[] {
  if (profile.minGlobalGapSeconds <= 0 && profile.minLaneGapSeconds <= 0) return notes;

  const accepted: GameNote[] = [];
  const lastByLane = new Map<number, number>();
  let lastGlobal = -999;

  for (const note of notes) {
    const lastLaneTime = lastByLane.get(note.lane) ?? -999;
    const laneGap = note.time - lastLaneTime;
    const globalGap = note.time - lastGlobal;
    const keepForHold = note.type === "hold" && laneGap >= profile.minLaneGapSeconds * 0.55;

    if (keepForHold || (laneGap >= profile.minLaneGapSeconds && globalGap >= profile.minGlobalGapSeconds)) {
      accepted.push(note);
      lastByLane.set(note.lane, note.time);
      lastGlobal = note.time;
    }
  }

  return accepted;
}
