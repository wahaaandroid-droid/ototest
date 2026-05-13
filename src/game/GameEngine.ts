import type { Difficulty, GameChart, GameNote, PlayMode } from "./types";
import { convertMidiTrackToChordChart, convertMidiTrackToSingleChart } from "../midi/convertMidiToGameNotes";
import type { MidiTrackInfo } from "./types";

export function buildGameChart(track: MidiTrackInfo, mode: PlayMode, difficulty: Difficulty): GameChart {
  if (mode === "spark") {
    const chart = convertMidiTrackToSingleChart(track, difficulty);
    return {
      ...chart,
      mode: "spark",
      laneLabels: ["Shan 1", "Shan 2", "Shan 3", "Shan 4"],
      notes: chart.notes.map((note) => ({
        ...note,
        type: "tap",
        label: note.playbackMode === "phrase" ? `Shan x${note.playbackEvents.length}` : "Shan",
      })),
    };
  }

  if (mode === "chord") {
    return convertMidiTrackToChordChart(track, difficulty);
  }

  return convertMidiTrackToSingleChart(track, difficulty);
}

export function getUpcomingNotes(notes: GameNote[], currentTime: number, approachTime: number): GameNote[] {
  return notes.filter((note) => note.time >= currentTime - 0.35 && note.time <= currentTime + approachTime + 0.5);
}
