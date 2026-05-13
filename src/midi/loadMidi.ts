import { Midi } from "@tonejs/midi";
import type { MidiTrackInfo, ParsedMidiFile, ParsedNote, TrackRole } from "../game/types";

export async function loadMidiFile(file: File): Promise<ParsedMidiFile> {
  const buffer = await file.arrayBuffer();
  return parseMidiBuffer(buffer, file.name.replace(/\.(mid|midi)$/i, ""));
}

export async function loadMidiFromUrl(url: string, fallbackName = "Sample MIDI"): Promise<ParsedMidiFile> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} を読み込めませんでした。`);
  }

  const buffer = await response.arrayBuffer();
  return parseMidiBuffer(buffer, fallbackName);
}

export function parseMidiBuffer(buffer: ArrayBuffer, fallbackName: string): ParsedMidiFile {
  const midi = new Midi(buffer);
  const anyMidi = midi as unknown as { duration?: number; name?: string; header?: { name?: string } };
  const tempos = midi.header.tempos;
  const bpm = Math.round(tempos[0]?.bpm ?? 120);
  const tracks = midi.tracks.map((track, index) => {
    const anyTrack = track as unknown as {
      channel?: number;
      instrument?: {
        name?: string;
        number?: number;
        percussion?: boolean;
      };
    };

    const notes: ParsedNote[] = track.notes.map((note, noteIndex) => ({
      id: `t${index}-n${noteIndex}`,
      time: note.time,
      duration: Math.max(0.04, note.duration),
      midi: note.midi,
      name: note.name,
      velocity: clamp(note.velocity, 0.15, 1),
    }));

    const instrumentNumber = typeof anyTrack.instrument?.number === "number" ? anyTrack.instrument.number : null;
    const channel = typeof anyTrack.channel === "number" ? anyTrack.channel : null;
    const isDrum = Boolean(anyTrack.instrument?.percussion) || channel === 9;

    return {
      id: `track-${index}`,
      index,
      name: track.name || `Track ${index + 1}`,
      instrumentName: anyTrack.instrument?.name || (isDrum ? "Drums" : "Unknown"),
      instrumentNumber,
      channel,
      isDrum,
      notes,
      noteCount: notes.length,
      rangeText: buildRangeText(notes),
      role: "auto" as TrackRole,
    };
  });

  const playerIndex = findSuggestedPlayerTrackIndex(tracks);
  const tracksWithRoles = tracks.map((track, index) => ({
    ...track,
    role: index === playerIndex ? "player" : "auto",
  }));

  const durationFromNotes = Math.max(0, ...tracks.flatMap((track) => track.notes.map((note) => note.time + note.duration)));
  const duration = Math.max(anyMidi.duration ?? 0, durationFromNotes);
  const title = anyMidi.name || anyMidi.header?.name || fallbackName || "Untitled MIDI";

  return {
    name: title,
    bpm,
    duration,
    trackCount: tracks.length,
    tracks: tracksWithRoles,
  };
}

function findSuggestedPlayerTrackIndex(tracks: MidiTrackInfo[]): number {
  const melodicTracks = tracks
    .filter((track) => track.noteCount > 0 && !track.isDrum)
    .sort((a, b) => {
      const aScore = scorePlayerCandidate(a);
      const bScore = scorePlayerCandidate(b);
      return bScore - aScore;
    });

  return melodicTracks[0]?.index ?? tracks.find((track) => track.noteCount > 0)?.index ?? 0;
}

function scorePlayerCandidate(track: MidiTrackInfo): number {
  const name = `${track.name} ${track.instrumentName}`.toLowerCase();
  let score = Math.min(track.noteCount, 1200) / 20;
  if (name.includes("guitar")) score += 35;
  if (name.includes("lead") || name.includes("melody") || name.includes("vocal")) score += 30;
  if (name.includes("piano")) score += 16;
  if (name.includes("bass")) score -= 12;
  if (track.rangeText.includes("-")) score += 4;
  return score;
}

function buildRangeText(notes: ParsedNote[]): string {
  if (notes.length === 0) return "-";
  const min = Math.min(...notes.map((note) => note.midi));
  const max = Math.max(...notes.map((note) => note.midi));
  return `${midiToNoteName(min)} - ${midiToNoteName(max)}`;
}

function midiToNoteName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(midi / 12) - 1;
  return `${names[midi % 12]}${octave}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
