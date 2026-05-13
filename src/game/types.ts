export type TrackRole = "auto" | "player" | "mute";

export type PlayMode = "single" | "chord" | "spark";

export type Difficulty = "easy" | "normal" | "hard";

export type Judgement = "Perfect" | "Great" | "Good" | "Miss";

export type GameNoteType = "tap" | "hold" | "chord";

export type GameNotePlaybackMode = "normal" | "phrase";

export type GameNotePlaybackEvent = {
  offset: number;
  duration: number;
  midiNotes: number[];
  velocity: number;
};

export type TimingSettings = {
  noteVisualOffsetMs: number;
  inputJudgeOffsetMs: number;
  audioScheduleLookAheadMs: number;
};

export type BackingAudioFile = {
  name: string;
  url: string;
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

export type PlayablePartKind = "recommended" | "lead" | "piano" | "guitar" | "strings" | "bass" | "single";

export type PlayablePart = {
  id: string;
  title: string;
  trackIds: string[];
  primaryTrackId: string;
  kind: PlayablePartKind;
  noteCount: number;
  density: number;
  rangeText: string;
  recommendationScore: number;
};

export type ParsedMidiFile = {
  name: string;
  bpm: number;
  duration: number;
  trackCount: number;
  tracks: MidiTrackInfo[];
  playableParts: PlayablePart[];
};

export type GameNote = {
  id: string;
  time: number;
  duration: number;
  type: GameNoteType;
  midiNotes: number[];
  playbackEvents: GameNotePlaybackEvent[];
  label: string;
  lane: number;
  velocity: number;
  playbackMode?: GameNotePlaybackMode;
  phraseOffsets?: number[];
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
