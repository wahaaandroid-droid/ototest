/// <reference types="vite/client" />

declare global {
  type WebAudioFontPreset = Record<string, unknown>;

  type WebAudioFontEnvelope = {
    cancel?: () => void;
  };

  type WebAudioFontLoader = {
    decodeAfterLoading: (audioContext: AudioContext, variableName: string) => void;
    waitLoad: (callback: () => void) => void;
  };

  type WebAudioFontPlayerInstance = {
    loader: WebAudioFontLoader;
    queueWaveTable: (
      audioContext: AudioContext,
      target: AudioNode,
      preset: WebAudioFontPreset,
      when: number,
      pitch: number,
      duration: number,
      volume?: number,
    ) => WebAudioFontEnvelope;
    cancelQueue: (audioContext: AudioContext) => void;
  };

  interface Window {
    WebAudioFontPlayer?: new () => WebAudioFontPlayerInstance;
    [key: string]: unknown;
  }
}

export {};
