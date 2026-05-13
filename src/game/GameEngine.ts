import type { GameChart, GameNote, PlayMode } from "./types";
import { convertMidiTrackToChordChart, convertMidiTrackToSingleChart } from "../midi/convertMidiToGameNotes";
import type { MidiTrackInfo } from "./types";

export function buildGameChart(track: MidiTrackInfo, mode: PlayMode): GameChart {
  if (mode === "chord") {
    return convertMidiTrackToChordChart(track);
  }

  return convertMidiTrackToSingleChart(track);
}

export function getUpcomingNotes(notes: GameNote[], currentTime: number, approachTime: number): GameNote[] {
  return notes.filter((note) => note.time >= currentTime - 0.35 && note.time <= currentTime + approachTime + 0.5);
}
