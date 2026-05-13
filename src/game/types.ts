export type TrackRole = "auto" | "player" | "mute";

export type PlayMode = "single" | "chord";

export type Difficulty = "easy" | "normal" | "hard";

export type Judgement = "Perfect" | "Great" | "Good" | "Miss";

export type GameNoteType = "tap" | "hold" | "chord";

export type TimingSettings = {
  noteVisualOffsetMs: number;
  inputJudgeOffsetMs: number;
  audioScheduleLookAheadMs: number;
};

export type ParsedNote = {
  id: string;
  time: number;
  duration: number;
  midi: number;
  name: string;
  velocity: number;
};

export type MidiTrackInfo = {
  id: string;
  index: number;
  name: string;
  instrumentName: string;
  instrumentNumber: number | null;
  channel: number | null;
  isDrum: boolean;
  notes: ParsedNote[];
  noteCount: number;
  rangeText: string;
  role: TrackRole;
};

export type ParsedMidiFile = {
  name: string;
  bpm: number;
  duration: number;
  trackCount: number;
  tracks: MidiTrackInfo[];
};

export type GameNote = {
  id: string;
  time: number;
  duration: number;
  type: GameNoteType;
  midiNotes: number[];
  label: string;
  lane: number;
  velocity: number;
};

export type GameChart = {
  notes: GameNote[];
  laneLabels: string[];
  mode: PlayMode;
  difficulty: Difficulty;
};

export type ScoreStats = {
  score: number;
  combo: number;
  maxCombo: number;
  Perfect: number;
  Great: number;
  Good: number;
  Miss: number;
};

export type GameResult = ScoreStats & {
  rank: string;
  totalNotes: number;
};
