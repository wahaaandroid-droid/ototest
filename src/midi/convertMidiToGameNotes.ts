import type { Difficulty, GameChart, GameNote, GameNotePlaybackEvent, MidiTrackInfo, ParsedNote } from "../game/types";
import { detectChordLabel, groupNotesByStartTime } from "./detectChords";

const HOLD_THRESHOLD_SECONDS = 0.65;
const CHORD_GROUP_WINDOW_MS = 80;
const SINGLE_LANE_LABELS = ["Low", "Mid", "High", "Top"];
const CHORD_MODE_BASE_MIN_LANES = 4;
const CHORD_MODE_MELODY_MIN_LANES = 6;
const CHORD_MODE_MAX_LANES = 6;
const CHORD_MELODY_LANE_LABELS = ["Melody 1", "Melody 2", "Melody 3", "Melody 4"];

type DifficultyProfile = {
  chordGroupWindowMs: number;
  bundleMaxSpanSeconds: number;
  bundleMaxGapSeconds: number;
  bundleMaxEvents: number;
  minInputGapSeconds: number;
};

const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: {
    chordGroupWindowMs: 140,
    bundleMaxSpanSeconds: 1.5,
    bundleMaxGapSeconds: 0.72,
    bundleMaxEvents: 5,
    minInputGapSeconds: 0.35,
  },
  normal: {
    chordGroupWindowMs: 100,
    bundleMaxSpanSeconds: 1,
    bundleMaxGapSeconds: 0.56,
    bundleMaxEvents: 3,
    minInputGapSeconds: 0.22,
  },
  hard: {
    chordGroupWindowMs: CHORD_GROUP_WINDOW_MS,
    bundleMaxSpanSeconds: 0,
    bundleMaxGapSeconds: 0,
    bundleMaxEvents: 1,
    minInputGapSeconds: 0,
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
        playbackEvents: [buildPlaybackEvent([note.midi], 0, note.duration, note.velocity)],
        label: isHold ? "Hold" : SINGLE_LANE_LABELS[lane],
        lane,
        velocity: note.velocity,
      };
    })
    .sort((a, b) => a.time - b.time);

  const spreadNotes = spreadDenseSingleLanes(rawNotes);
  const notes = bundleNotesForDifficulty(spreadNotes, DIFFICULTY_PROFILES[difficulty]);

  return {
    notes,
    laneLabels: SINGLE_LANE_LABELS,
    mode: "single",
    difficulty,
  };
}

export function convertMidiTrackToChordChart(track: MidiTrackInfo, difficulty: Difficulty): GameChart {
  const profile = DIFFICULTY_PROFILES[difficulty];
  const trackRange = buildTrackRange(track.notes);
  const groups = groupNotesByStartTime(track.notes, profile.chordGroupWindowMs)
    .filter((group) => group.length > 0)
    .map((group, index) => buildChordCandidate(group, track.index, index, trackRange));

  const counts = new Map<string, number>();
  for (const note of groups) {
    counts.set(note.label, (counts.get(note.label) ?? 0) + 1);
  }

  const rankedLabels = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
  const hasOverflow = rankedLabels.length > CHORD_MODE_MAX_LANES;
  const laneLabels = hasOverflow ? [...rankedLabels.slice(0, 5), "Other"] : rankedLabels.slice(0, 6);
  const hasMelodyNotes = groups.some((note) => note.type !== "chord");
  const minimumLaneCount = hasMelodyNotes ? CHORD_MODE_MELODY_MIN_LANES : CHORD_MODE_BASE_MIN_LANES;
  const safeLaneLabels = padChordLaneLabels(laneLabels.length > 0 ? laneLabels : ["C"], minimumLaneCount);

  const mappedNotes = groups.map((note) => {
    const knownLane = safeLaneLabels.includes(note.label) ? safeLaneLabels.indexOf(note.label) : safeLaneLabels.indexOf("Other");
    const lane = note.type === "chord" ? knownLane : laneForMidiAcrossLanes(note.midiNotes[0], trackRange, safeLaneLabels.length);
    return {
      ...note,
      label: note.type === "chord" && lane === safeLaneLabels.indexOf("Other") && !safeLaneLabels.includes(note.label) ? "Other" : note.label,
      lane: Math.max(0, lane),
    };
  });
  const scatteredNotes = spreadChordMelodyLanes(mappedNotes, safeLaneLabels.length);
  const notes = bundleNotesForDifficulty(scatteredNotes, profile);

  return {
    notes,
    laneLabels: safeLaneLabels,
    mode: "chord",
    difficulty,
  };
}

function buildChordCandidate(
  group: ParsedNote[],
  trackIndex: number,
  groupIndex: number,
  trackRange: { min: number; max: number },
): GameNote {
  const sorted = [...group].sort((a, b) => a.midi - b.midi);
  const midiNotes = sorted.map((note) => note.midi);
  const starts = sorted.map((note) => note.time);
  const durations = sorted.map((note) => note.duration);
  const velocities = sorted.map((note) => note.velocity);
  const label = midiNotes.length >= 3 ? detectChordLabel(midiNotes) : SINGLE_LANE_LABELS[laneForMidi(midiNotes[0], trackRange)];

  return {
    id: `chord-${trackIndex}-${groupIndex}`,
    time: Math.min(...starts),
    duration: Math.max(...durations),
    type: midiNotes.length >= 3 ? "chord" : Math.max(...durations) >= HOLD_THRESHOLD_SECONDS ? "hold" : "tap",
    midiNotes,
    playbackEvents: [buildPlaybackEvent(midiNotes, 0, Math.max(...durations), velocities.reduce((sum, velocity) => sum + velocity, 0) / velocities.length)],
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

function laneForMidiAcrossLanes(midi: number, range: { min: number; max: number }, laneCount: number): number {
  if (laneCount <= 1) return 0;
  if (laneCount <= 4) return Math.min(laneCount - 1, laneForMidi(midi, range));

  const span = Math.max(1, range.max - range.min + 1);
  const rangeLane = Math.min(laneCount - 1, Math.max(0, Math.floor(((midi - range.min) / span) * laneCount)));
  const pitchLane = midi % laneCount;
  return Math.min(laneCount - 1, Math.max(0, Math.round(rangeLane * 0.72 + pitchLane * 0.28)));
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

function spreadChordMelodyLanes(notes: GameNote[], laneCount: number): GameNote[] {
  if (laneCount <= 1) return notes;

  const recentByLane = Array.from({ length: laneCount }, () => -999);
  let previousLane = -1;
  let repeatCount = 0;

  return notes.map((note) => {
    let lane = note.lane;
    if (lane === previousLane) {
      repeatCount += 1;
    } else {
      repeatCount = 0;
    }

    if (note.type !== "chord") {
      const tooClose = note.time - recentByLane[lane] < 0.22;
      if (tooClose || repeatCount >= 2) {
        lane = chooseFreshLane(lane, recentByLane, note.time, laneCount, note.midiNotes[0]);
      }
    }

    recentByLane[lane] = note.time;
    previousLane = lane;
    return {
      ...note,
      lane,
    };
  });
}

function chooseFreshLane(currentLane: number, recentByLane: number[], time: number, laneCount: number, midi: number): number {
  const candidates = Array.from({ length: laneCount }, (_, lane) => lane)
    .filter((lane) => lane !== currentLane)
    .sort((a, b) => {
      const freshness = recentByLane[a] - recentByLane[b];
      if (freshness !== 0) return freshness;
      return Math.abs((midi % laneCount) - a) - Math.abs((midi % laneCount) - b);
    });

  return candidates.find((lane) => time - recentByLane[lane] >= 0.16) ?? candidates[0] ?? currentLane;
}

function padChordLaneLabels(labels: string[], minimumLaneCount: number): string[] {
  const padded = labels.slice(0, CHORD_MODE_MAX_LANES);
  for (const label of CHORD_MELODY_LANE_LABELS) {
    if (padded.length >= minimumLaneCount) break;
    if (!padded.includes(label)) padded.push(label);
  }
  return padded;
}

function buildPlaybackEvent(midiNotes: number[], offset: number, duration: number, velocity: number): GameNotePlaybackEvent {
  return {
    offset,
    duration,
    midiNotes,
    velocity,
  };
}

function bundleNotesForDifficulty(notes: GameNote[], profile: DifficultyProfile): GameNote[] {
  if (profile.bundleMaxEvents <= 1 && profile.minInputGapSeconds <= 0) return notes;

  const bundles: GameNote[][] = [];
  let current: GameNote[] = [];

  for (const note of notes) {
    const first = current[0];
    const previous = current[current.length - 1];
    const isInsideMinimumInputGap = Boolean(first) && note.time - first.time < profile.minInputGapSeconds;
    const canBundle =
      isInsideMinimumInputGap ||
      (first &&
        previous &&
        current.length < profile.bundleMaxEvents &&
        note.time - first.time <= profile.bundleMaxSpanSeconds &&
        note.time - previous.time <= profile.bundleMaxGapSeconds);

    if (!first || canBundle) {
      current.push(note);
    } else {
      bundles.push(current);
      current = [note];
    }
  }

  if (current.length > 0) bundles.push(current);
  return bundles.map((bundle, index) => buildBundledNote(bundle, index));
}

function buildBundledNote(bundle: GameNote[], index: number): GameNote {
  if (bundle.length === 1) return bundle[0];

  const start = bundle[0].time;
  const playbackEvents = bundle
    .flatMap((note) =>
      note.playbackEvents.map((event) => ({
        ...event,
        offset: note.time - start + event.offset,
      })),
    )
    .sort((a, b) => a.offset - b.offset);
  const endTime = Math.max(...playbackEvents.map((event) => event.offset + event.duration));
  const midiNotes = playbackEvents.flatMap((event) => event.midiNotes);
  const velocity = playbackEvents.reduce((sum, event) => sum + event.velocity, 0) / playbackEvents.length;

  return {
    id: `${bundle[0].id}-bundle-${index}`,
    time: start,
    duration: Math.max(0.24, endTime),
    type: "chord",
    midiNotes,
    playbackEvents,
    label: `${bundle[0].label} x${bundle.length}`,
    lane: bundle[0].lane,
    velocity,
  };
}
