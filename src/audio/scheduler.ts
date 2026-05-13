import type { MidiTrackInfo, TimingSettings } from "../game/types";
import { WebAudioFontEngine, type ActiveVoice } from "./webAudioFontPlayer";

type SchedulerOptions = {
  audio: WebAudioFontEngine;
  tracks: MidiTrackInfo[];
  timing: TimingSettings;
};

export class AutoAccompanimentScheduler {
  private audio: WebAudioFontEngine;
  private tracks: MidiTrackInfo[];
  private timing: TimingSettings;
  private startPerfMs = 0;
  private offsetSeconds = 0;
  private rafId: number | null = null;
  private cursors = new Map<string, number>();
  private voices: ActiveVoice[] = [];
  private running = false;
  private preloaded = false;

  constructor(options: SchedulerOptions) {
    this.audio = options.audio;
    this.tracks = options.tracks.map((track) => ({
      ...track,
      notes: [...track.notes].sort((a, b) => a.time - b.time),
    }));
    this.timing = options.timing;
  }

  async start(offsetSeconds = 0): Promise<void> {
    await this.preload();
    this.startPrepared(offsetSeconds);
  }

  startPrepared(offsetSeconds = 0): void {
    this.stop();
    this.running = true;
    this.offsetSeconds = offsetSeconds;
    this.startPerfMs = performance.now() - offsetSeconds * 1000;
    this.resetCursors(offsetSeconds);
    this.tick();
  }

  async preload(): Promise<void> {
    if (this.preloaded) return;
    await Promise.all(this.tracks.filter((track) => track.role === "auto").map((track) => this.audio.preloadTrack(track)));
    this.preloaded = true;
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.voices.forEach((voice) => voice.stop());
    this.voices = [];
    this.cursors.clear();
  }

  private tick = (): void => {
    if (!this.running) return;

    const elapsed = (performance.now() - this.startPerfMs) / 1000;
    const lookAhead = Math.max(0.08, this.timing.audioScheduleLookAheadMs / 1000);
    const contextNow = this.audio.context.currentTime;

    for (const track of this.tracks) {
      if (track.role !== "auto") continue;

      let cursor = this.cursors.get(track.id) ?? 0;
      while (cursor < track.notes.length) {
        const note = track.notes[cursor];
        if (note.time > elapsed + lookAhead) break;

        cursor += 1;
        if (note.time <= elapsed + lookAhead) {
          const when = contextNow + Math.max(0.015, note.time - elapsed);
          void this.audio.playMidiNotes([note.midi], track, when, note.duration, note.velocity).then((voices) => {
            this.voices.push(...voices);
          });
        }
      }
      this.cursors.set(track.id, cursor);
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  private resetCursors(offsetSeconds: number): void {
    this.cursors.clear();

    for (const track of this.tracks) {
      if (track.role !== "auto") continue;
      let cursor = 0;
      while (cursor < track.notes.length && track.notes[cursor].time < offsetSeconds - 0.02) {
        cursor += 1;
      }
      this.cursors.set(track.id, cursor);
    }
  }
}
