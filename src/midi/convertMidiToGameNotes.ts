import type { GameChart, GameNote, MidiTrackInfo, ParsedNote } from "../game/types";
import { detectChordLabel, groupNotesByStartTime } from "./detectChords";

const HOLD_THRESHOLD_SECONDS = 0.65;
const CHORD_GROUP_WINDOW_MS = 80;

export function convertMidiTrackToSingleChart(track: MidiTrackInfo): GameChart {
  const notes: GameNote[] = track.notes
    .filter((note) => note.duration > 0)
    .map((note, index) => {
      const isHold = note.duration >= HOLD_THRESHOLD_SECONDS;
      return {
        id: `single-${track.index}-${index}`,
        time: note.time,
        duration: note.duration,
        type: isHold ? ("hold" as const) : ("tap" as const),
        midiNotes: [note.midi],
        label: isHold ? "Hold" : laneLabelForMidi(note.midi),
        lane: isHold ? 3 : laneForMidi(note.midi),
        velocity: note.velocity,
      };
    })
    .sort((a, b) => a.time - b.time);

  return {
    notes,
    laneLabels: ["Low", "Mid", "High", "Hold"],
    mode: "single",
  };
}

export function convertMidiTrackToChordChart(track: MidiTrackInfo): GameChart {
  const groups = groupNotesByStartTime(track.notes, CHORD_GROUP_WINDOW_MS)
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

  const notes = groups.map((note) => {
    const lane = safeLaneLabels.includes(note.label) ? safeLaneLabels.indexOf(note.label) : safeLaneLabels.indexOf("Other");
    return {
      ...note,
      label: lane === safeLaneLabels.indexOf("Other") && !safeLaneLabels.includes(note.label) ? "Other" : note.label,
      lane: Math.max(0, lane),
    };
  });

  return {
    notes,
    laneLabels: safeLaneLabels,
    mode: "chord",
  };
}

function buildChordCandidate(group: ParsedNote[], trackIndex: number, groupIndex: number): GameNote {
  const sorted = [...group].sort((a, b) => a.midi - b.midi);
  const midiNotes = sorted.map((note) => note.midi);
  const starts = sorted.map((note) => note.time);
  const durations = sorted.map((note) => note.duration);
  const velocities = sorted.map((note) => note.velocity);
  const label = midiNotes.length >= 3 ? detectChordLabel(midiNotes) : laneLabelForMidi(midiNotes[0]);

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

function laneForMidi(midi: number): number {
  if (midi < 55) return 0;
  if (midi < 67) return 1;
  return 2;
}

function laneLabelForMidi(midi: number): string {
  return ["Low", "Mid", "High"][laneForMidi(midi)];
}
