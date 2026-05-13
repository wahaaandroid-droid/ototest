import type { MidiTrackInfo } from "../game/types";

export type InstrumentPreset = {
  id: string;
  label: string;
  variableName: string;
  url: string;
  family: "piano" | "guitar" | "bass" | "strings" | "drum";
  strum: boolean;
};

export type DrumPreset = {
  variableName: string;
  url: string;
};

const SOUND_BASE = "https://surikov.github.io/webaudiofontdata/sound";

export const PIANO_PRESET: InstrumentPreset = {
  id: "piano",
  label: "Piano",
  variableName: "_tone_0000_JCLive_sf2_file",
  url: `${SOUND_BASE}/0000_JCLive_sf2_file.js`,
  family: "piano",
  strum: false,
};

const PRESETS = {
  electricPiano: {
    id: "electric-piano",
    label: "Electric Piano",
    variableName: "_tone_0040_JCLive_sf2_file",
    url: `${SOUND_BASE}/0040_JCLive_sf2_file.js`,
    family: "piano",
    strum: false,
  },
  guitar: {
    id: "guitar",
    label: "Guitar",
    variableName: "_tone_0240_Aspirin_sf2_file",
    url: `${SOUND_BASE}/0240_Aspirin_sf2_file.js`,
    family: "guitar",
    strum: true,
  },
  electricGuitar: {
    id: "electric-guitar",
    label: "Clean Guitar",
    variableName: "_tone_0270_Aspirin_sf2_file",
    url: `${SOUND_BASE}/0270_Aspirin_sf2_file.js`,
    family: "guitar",
    strum: true,
  },
  bass: {
    id: "bass",
    label: "Bass",
    variableName: "_tone_0320_Aspirin_sf2_file",
    url: `${SOUND_BASE}/0320_Aspirin_sf2_file.js`,
    family: "bass",
    strum: false,
  },
  strings: {
    id: "strings",
    label: "Strings",
    variableName: "_tone_0480_Aspirin_sf2_file",
    url: `${SOUND_BASE}/0480_Aspirin_sf2_file.js`,
    family: "strings",
    strum: false,
  },
} satisfies Record<string, InstrumentPreset>;

export const DRUM_PRESETS: Record<string, DrumPreset> = {
  kick: {
    variableName: "_drum_35_0_Chaos_sf2_file",
    url: `${SOUND_BASE}/12835_0_Chaos_sf2_file.js`,
  },
  snare: {
    variableName: "_drum_38_0_Chaos_sf2_file",
    url: `${SOUND_BASE}/12838_0_Chaos_sf2_file.js`,
  },
  closedHat: {
    variableName: "_drum_42_0_Chaos_sf2_file",
    url: `${SOUND_BASE}/12842_0_Chaos_sf2_file.js`,
  },
  openHat: {
    variableName: "_drum_46_0_Chaos_sf2_file",
    url: `${SOUND_BASE}/12846_0_Chaos_sf2_file.js`,
  },
  tom: {
    variableName: "_drum_45_0_Chaos_sf2_file",
    url: `${SOUND_BASE}/12845_0_Chaos_sf2_file.js`,
  },
  crash: {
    variableName: "_drum_49_0_Chaos_sf2_file",
    url: `${SOUND_BASE}/12849_0_Chaos_sf2_file.js`,
  },
};

export function mapInstrument(track: Pick<MidiTrackInfo, "instrumentName" | "instrumentNumber" | "isDrum">): InstrumentPreset {
  if (track.isDrum) {
    return {
      id: "drum-kit",
      label: "Drum Kit",
      variableName: DRUM_PRESETS.closedHat.variableName,
      url: DRUM_PRESETS.closedHat.url,
      family: "drum",
      strum: false,
    };
  }

  const program = track.instrumentNumber;
  const name = track.instrumentName.toLowerCase();

  if (name.includes("guitar") || (program !== null && program >= 24 && program <= 31)) {
    return name.includes("electric") || (program !== null && program >= 27)
      ? PRESETS.electricGuitar
      : PRESETS.guitar;
  }
  if (name.includes("bass") || (program !== null && program >= 32 && program <= 39)) return PRESETS.bass;
  if (name.includes("string") || name.includes("ensemble") || (program !== null && program >= 40 && program <= 51)) {
    return PRESETS.strings;
  }
  if (name.includes("electric piano") || (program !== null && program >= 4 && program <= 7)) return PRESETS.electricPiano;

  return PIANO_PRESET;
}

export function drumPresetForMidi(midi: number): DrumPreset {
  if (midi === 35 || midi === 36) return DRUM_PRESETS.kick;
  if (midi === 38 || midi === 40) return DRUM_PRESETS.snare;
  if (midi === 46) return DRUM_PRESETS.openHat;
  if (midi >= 41 && midi <= 48) return DRUM_PRESETS.tom;
  if (midi >= 49 && midi <= 57) return DRUM_PRESETS.crash;
  return DRUM_PRESETS.closedHat;
}
