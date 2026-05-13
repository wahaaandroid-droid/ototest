const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const FRIENDLY_ROOTS = new Set(["C", "D", "E", "F", "G", "A", "B"]);

type ChordPattern = {
  suffix: string;
  intervals: number[];
};

const PATTERNS: ChordPattern[] = [
  { suffix: "maj7", intervals: [0, 4, 7, 11] },
  { suffix: "7", intervals: [0, 4, 7, 10] },
  { suffix: "", intervals: [0, 4, 7] },
  { suffix: "m", intervals: [0, 3, 7] },
];

export function detectChordLabel(midiNotes: number[]): string {
  if (midiNotes.length === 0) return "-";

  const pitchClasses = [...new Set(midiNotes.map((note) => normalizePitchClass(note)))].sort((a, b) => a - b);
  if (pitchClasses.length < 3) {
    return NOTE_NAMES[pitchClasses[0]];
  }

  for (const root of pitchClasses) {
    for (const pattern of PATTERNS) {
      if (pattern.intervals.every((interval) => pitchClasses.includes((root + interval) % 12))) {
        const rootName = NOTE_NAMES[root];
        if (FRIENDLY_ROOTS.has(rootName)) return `${rootName}${pattern.suffix}`;
      }
    }
  }

  const bass = normalizePitchClass(Math.min(...midiNotes));
  return NOTE_NAMES[bass];
}

export function groupNotesByStartTime<T extends { time: number }>(notes: T[], windowMs = 80): T[][] {
  const sorted = [...notes].sort((a, b) => a.time - b.time);
  const groups: T[][] = [];
  const windowSeconds = windowMs / 1000;

  for (const note of sorted) {
    const current = groups[groups.length - 1];
    if (!current || Math.abs(note.time - current[0].time) > windowSeconds) {
      groups.push([note]);
    } else {
      current.push(note);
    }
  }

  return groups;
}

function normalizePitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}
