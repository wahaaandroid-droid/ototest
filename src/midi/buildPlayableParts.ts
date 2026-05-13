import type { MidiTrackInfo, ParsedNote, PlayablePart, PlayablePartKind } from "../game/types";

type ScoredTrack = {
  track: MidiTrackInfo;
  score: number;
};

const PART_TITLES: Record<Exclude<PlayablePartKind, "recommended" | "single">, string> = {
  lead: "Lead",
  piano: "Piano / Keys",
  guitar: "Guitar",
  strings: "Strings / Synth",
  bass: "Bass",
};

const PART_LIMITS: Record<Exclude<PlayablePartKind, "recommended" | "single">, number> = {
  lead: 4,
  piano: 4,
  guitar: 4,
  strings: 4,
  bass: 2,
};

export function buildPlayableParts(tracks: MidiTrackInfo[], duration: number): PlayablePart[] {
  const candidates = tracks
    .filter((track) => track.noteCount > 0 && !track.isDrum)
    .map((track) => ({ track, score: scorePlayerCandidate(track) }))
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return [];
  }

  const parts: PlayablePart[] = [];
  const top = candidates[0];
  const topKind = classifyPlayableKind(top.track);
  const recommendedTracks = selectRecommendedTracks(candidates, topKind);
  parts.push(createPart("recommended", "Recommended", recommendedTracks, duration));

  const groupedKinds: Array<Exclude<PlayablePartKind, "recommended" | "single">> = ["lead", "piano", "guitar", "strings", "bass"];
  const categoryParts = groupedKinds
    .map((kind) => {
      const group = candidates
        .filter(({ track }) => classifyPlayableKind(track) === kind)
        .slice(0, PART_LIMITS[kind]);
      return group.length > 0 ? createPart(kind, PART_TITLES[kind], group, duration) : null;
    })
    .filter((part): part is PlayablePart => Boolean(part))
    .sort((a, b) => b.recommendationScore - a.recommendationScore);

  for (const part of categoryParts) {
    addUniquePart(parts, part);
  }

  for (const candidate of candidates.slice(0, 8)) {
    const title = candidate.track.name === candidate.track.instrumentName ? candidate.track.name : `${candidate.track.name} / ${candidate.track.instrumentName}`;
    addUniquePart(parts, createPart("single", title, [candidate], duration));
    if (parts.length >= 9) break;
  }

  return parts.sort((a, b) => {
    if (a.kind === "recommended") return -1;
    if (b.kind === "recommended") return 1;
    return b.recommendationScore - a.recommendationScore;
  });
}

export function scorePlayerCandidate(track: MidiTrackInfo): number {
  const name = `${track.name} ${track.instrumentName}`.toLowerCase();
  let score = Math.min(track.noteCount, 1400) / 20;
  const density = estimateDensity(track.notes);

  if (name.includes("guitar")) score += 35;
  if (name.includes("lead") || name.includes("melody") || name.includes("vocal") || name.includes("main")) score += 34;
  if (name.includes("piano") || name.includes("keyboard") || name.includes("keys")) score += 18;
  if (name.includes("strings") || name.includes("string") || name.includes("synth")) score += 10;
  if (name.includes("bass")) score -= 12;
  if (track.rangeText.includes("-")) score += 4;
  if (density > 10) score -= 14;
  if (density > 18) score -= 18;
  return score;
}

function classifyPlayableKind(track: MidiTrackInfo): Exclude<PlayablePartKind, "recommended" | "single"> {
  const label = `${track.name} ${track.instrumentName}`.toLowerCase();
  const program = track.instrumentNumber;

  if (label.includes("bass") || inRange(program, 32, 39)) return "bass";
  if (label.includes("guitar") || inRange(program, 24, 31)) return "guitar";
  if (
    label.includes("piano") ||
    label.includes("keyboard") ||
    label.includes("keys") ||
    label.includes("organ") ||
    label.includes("harpsichord") ||
    inRange(program, 0, 23)
  ) {
    return "piano";
  }
  if (
    label.includes("string") ||
    label.includes("synth") ||
    label.includes("pad") ||
    label.includes("choir") ||
    label.includes("voice") ||
    inRange(program, 40, 55) ||
    inRange(program, 80, 95)
  ) {
    return "strings";
  }

  return "lead";
}

function selectRecommendedTracks(candidates: ScoredTrack[], kind: Exclude<PlayablePartKind, "recommended" | "single">): ScoredTrack[] {
  const top = candidates[0];
  const compatible = candidates.filter(({ track }) => classifyPlayableKind(track) === kind);
  const limit = kind === "bass" ? 1 : 3;
  const selected = compatible.slice(0, limit);
  return selected.some(({ track }) => track.id === top.track.id) ? selected : [top, ...selected].slice(0, limit);
}

function createPart(kind: PlayablePartKind, title: string, scoredTracks: ScoredTrack[], duration: number): PlayablePart {
  const ordered = [...scoredTracks].sort((a, b) => b.score - a.score);
  const tracks = ordered.map(({ track }) => track);
  const allNotes = tracks.flatMap((track) => track.notes);
  const primary = ordered[0];
  const recommendationScore = ordered.reduce((total, entry, index) => total + entry.score * (index === 0 ? 1.15 : 0.72), 0);

  return {
    id: `${kind}-${tracks.map((track) => track.id.replace("track-", "")).join("-")}`,
    title,
    trackIds: tracks.map((track) => track.id),
    primaryTrackId: primary.track.id,
    kind,
    noteCount: allNotes.length,
    density: allNotes.length / Math.max(duration, 1),
    rangeText: buildRangeText(allNotes),
    recommendationScore,
  };
}

function addUniquePart(parts: PlayablePart[], part: PlayablePart) {
  const signature = buildTrackSignature(part.trackIds);
  if (parts.some((existing) => buildTrackSignature(existing.trackIds) === signature)) return;
  parts.push(part);
}

function buildTrackSignature(trackIds: string[]) {
  return [...trackIds].sort().join("|");
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

function estimateDensity(notes: ParsedNote[]): number {
  if (notes.length < 2) return notes.length;
  const start = notes[0].time;
  const end = Math.max(...notes.map((note) => note.time + note.duration));
  return notes.length / Math.max(end - start, 1);
}

function inRange(value: number | null, min: number, max: number): boolean {
  return typeof value === "number" && value >= min && value <= max;
}
