import type { GameNote, MidiTrackInfo } from "../game/types";
import { drumPresetForMidi, mapInstrument, PIANO_PRESET, type DrumPreset, type InstrumentPreset } from "./instrumentMapper";

const PLAYER_URL = "https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js";
const RELEASE_SECONDS = 0.12;

export type ActiveVoice = {
  stop: () => void;
};

type ScriptStatus = "loading" | "ready" | "failed";

const scriptCache = new Map<string, Promise<void>>();
const presetStatus = new Map<string, ScriptStatus>();

export class WebAudioFontEngine {
  private audioContext: AudioContext | null = null;
  private player: WebAudioFontPlayerInstance | null = null;
  private masterGain: GainNode | null = null;

  get context(): AudioContext {
    return this.ensureContext();
  }

  async resume(): Promise<void> {
    const context = this.ensureContext();
    if (context.state !== "running") {
      await context.resume();
    }
    await this.ensurePlayer();
  }

  async preloadTrack(track: MidiTrackInfo): Promise<void> {
    await this.resume();
    const preset = mapInstrument(track);
    if (track.isDrum) {
      await Promise.all([
        this.loadDrumPreset(drumPresetForMidi(36)),
        this.loadDrumPreset(drumPresetForMidi(38)),
        this.loadDrumPreset(drumPresetForMidi(42)),
        this.loadDrumPreset(drumPresetForMidi(46)),
      ]);
      return;
    }

    await this.loadInstrumentPreset(preset);
  }

  async playGameNote(note: GameNote, track: MidiTrackInfo, when = 0): Promise<ActiveVoice[]> {
    const duration = note.type === "tap" ? Math.min(Math.max(note.duration, 0.28), 2.2) : Math.max(note.duration, 0.45);
    return this.playMidiNotes(note.midiNotes, track, when, duration, note.velocity);
  }

  async playMidiNotes(
    midiNotes: number[],
    track: MidiTrackInfo,
    when = 0,
    duration = 0.55,
    velocity = 0.75,
  ): Promise<ActiveVoice[]> {
    await this.resume();
    const context = this.ensureContext();
    const player = await this.ensurePlayer();
    const targetTime = Math.max(context.currentTime + 0.005, when);
    const voices: ActiveVoice[] = [];
    const preset = mapInstrument(track);

    if (track.isDrum) {
      for (const midi of midiNotes) {
        const drum = await this.loadDrumPreset(drumPresetForMidi(midi));
        voices.push(this.queuePreset(player, drum, midi, targetTime, 0.45, velocity));
      }
      return voices;
    }

    const loadedPreset = await this.loadInstrumentPreset(preset);
    const sorted = [...midiNotes].sort((a, b) => a - b);
    const strumStep = preset.strum && sorted.length > 1 ? 0.024 : 0;

    sorted.forEach((midi, index) => {
      voices.push(this.queuePreset(player, loadedPreset, midi, targetTime + index * strumStep, duration, velocity));
    });

    return voices;
  }

  stopAll(): void {
    if (this.audioContext && this.player) {
      this.player.cancelQueue(this.audioContext);
    }
  }

  async previewTrack(track: MidiTrackInfo, seconds = 7): Promise<void> {
    await this.preloadTrack(track);
    this.stopAll();
    const context = this.ensureContext();
    const previewStart = track.notes.find((note) => note.time >= 0)?.time ?? 0;
    const previewNotes = track.notes
      .filter((note) => note.time >= previewStart && note.time <= previewStart + seconds)
      .slice(0, 120);

    for (const note of previewNotes) {
      const when = context.currentTime + Math.max(0.02, note.time - previewStart);
      void this.playMidiNotes([note.midi], track, when, Math.min(note.duration, 1.8), note.velocity * 0.9);
    }
  }

  private ensureContext(): AudioContext {
    if (!this.audioContext) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextClass();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.82;
      this.masterGain.connect(this.audioContext.destination);
    }

    return this.audioContext;
  }

  private async ensurePlayer(): Promise<WebAudioFontPlayerInstance> {
    if (this.player) return this.player;
    await loadScript(PLAYER_URL);

    if (!window.WebAudioFontPlayer) {
      throw new Error("WebAudioFont Player を初期化できませんでした。");
    }

    this.player = new window.WebAudioFontPlayer();
    return this.player;
  }

  private async loadInstrumentPreset(preset: InstrumentPreset): Promise<WebAudioFontPreset> {
    try {
      return await this.loadPreset(preset.variableName, preset.url);
    } catch (error) {
      if (preset.id !== PIANO_PRESET.id) {
        return this.loadPreset(PIANO_PRESET.variableName, PIANO_PRESET.url);
      }
      throw error;
    }
  }

  private async loadDrumPreset(preset: DrumPreset): Promise<WebAudioFontPreset> {
    try {
      return await this.loadPreset(preset.variableName, preset.url);
    } catch {
      return this.loadPreset(PIANO_PRESET.variableName, PIANO_PRESET.url);
    }
  }

  private async loadPreset(variableName: string, url: string): Promise<WebAudioFontPreset> {
    const context = this.ensureContext();
    const player = await this.ensurePlayer();

    if (!window[variableName]) {
      presetStatus.set(variableName, "loading");
      await loadScript(url);
    }

    const preset = window[variableName] as WebAudioFontPreset | undefined;
    if (!preset) {
      presetStatus.set(variableName, "failed");
      throw new Error(`${variableName} を読み込めませんでした。`);
    }

    if (presetStatus.get(variableName) !== "ready") {
      player.loader.decodeAfterLoading(context, variableName);
      await waitForWebAudioFontLoad(player);
      presetStatus.set(variableName, "ready");
    }

    return preset;
  }

  private queuePreset(
    player: WebAudioFontPlayerInstance,
    preset: WebAudioFontPreset,
    midi: number,
    when: number,
    duration: number,
    velocity: number,
  ): ActiveVoice {
    const context = this.ensureContext();
    const noteGain = context.createGain();
    noteGain.gain.setValueAtTime(clamp(velocity, 0.08, 1), when);
    noteGain.connect(this.masterGain ?? context.destination);
    const envelope = player.queueWaveTable(context, noteGain, preset, when, midi, Math.max(duration, 0.08), 1);

    return {
      stop: () => {
        const now = context.currentTime;
        noteGain.gain.cancelScheduledValues(now);
        noteGain.gain.setValueAtTime(noteGain.gain.value, now);
        noteGain.gain.linearRampToValueAtTime(0.0001, now + RELEASE_SECONDS);
        window.setTimeout(() => {
          envelope.cancel?.();
          noteGain.disconnect();
        }, RELEASE_SECONDS * 1000 + 40);
      },
    };
  }
}

function loadScript(url: string): Promise<void> {
  const cached = scriptCache.get(url);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-webaudiofont="${url}"]`);
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script = existing ?? document.createElement("script");
    script.src = url;
    script.async = true;
    script.dataset.webaudiofont = url;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error(`${url} の読み込みに失敗しました。`)));
    if (!existing) document.head.appendChild(script);
  });

  scriptCache.set(url, promise);
  return promise;
}

function waitForWebAudioFontLoad(player: WebAudioFontPlayerInstance): Promise<void> {
  return new Promise((resolve) => {
    player.loader.waitLoad(resolve);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
