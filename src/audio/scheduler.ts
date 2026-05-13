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
  private scheduled = new Set<string>();
  private voices: ActiveVoice[] = [];
  private running = false;

  constructor(options: SchedulerOptions) {
    this.audio = options.audio;
    this.tracks = options.tracks;
    this.timing = options.timing;
  }

  async start(offsetSeconds = 0): Promise<void> {
    this.stop();
    await Promise.all(this.tracks.filter((track) => track.role === "auto").map((track) => this.audio.preloadTrack(track)));
    this.running = true;
    this.offsetSeconds = offsetSeconds;
    this.startPerfMs = performance.now() - offsetSeconds * 1000;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.voices.forEach((voice) => voice.stop());
    this.voices = [];
    this.scheduled.clear();
  }

  private tick = (): void => {
    if (!this.running) return;

    const elapsed = (performance.now() - this.startPerfMs) / 1000;
    const lookAhead = Math.max(0.08, this.timing.audioScheduleLookAheadMs / 1000);
    const contextNow = this.audio.context.currentTime;

    for (const track of this.tracks) {
      if (track.role !== "auto") continue;

      for (const note of track.notes) {
        const scheduleKey = `${track.index}:${note.id}`;
        if (this.scheduled.has(scheduleKey)) continue;
        if (note.time < this.offsetSeconds - 0.02) {
          this.scheduled.add(scheduleKey);
          continue;
        }
        if (note.time <= elapsed + lookAhead) {
          this.scheduled.add(scheduleKey);
          const when = contextNow + Math.max(0.015, note.time - elapsed);
          void this.audio.playMidiNotes([note.midi], track, when, note.duration, note.velocity).then((voices) => {
            this.voices.push(...voices);
          });
        }
      }
    }

    this.rafId = requestAnimationFrame(this.tick);
  };
}
