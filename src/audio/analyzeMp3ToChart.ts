import type { GameChart, GameNote } from "../game/types";

const LANE_LABELS = ["Shan 1", "Shan 2", "Shan 3", "Shan 4"];

type OnsetCandidate = {
  time: number;
  strength: number;
  rms: number;
};

export type Mp3SparkAnalysis = {
  chart: GameChart;
  duration: number;
};

export async function analyzeMp3ToSparkChart(file: File): Promise<Mp3SparkAnalysis> {
  const buffer = await decodeAudioFile(file);
  const candidates = detectOnsets(buffer);
  const selected = selectPlayableOnsets(candidates, buffer.duration);
  const notes = selected.length > 0 ? buildNotes(selected) : buildFallbackNotes(buffer.duration);
  const duration = buffer.duration;
  await closeDecodeContext(buffer);

  return {
    duration,
    chart: {
      notes,
      laneLabels: LANE_LABELS,
      mode: "spark",
      difficulty: "normal",
    },
  };
}

async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioContextClass();
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
  audioContextByBuffer.set(audioBuffer, context);
  return audioBuffer;
}

const audioContextByBuffer = new WeakMap<AudioBuffer, AudioContext>();

async function closeDecodeContext(buffer: AudioBuffer): Promise<void> {
  const context = audioContextByBuffer.get(buffer);
  if (!context || context.state === "closed") return;
  await context.close();
}

function detectOnsets(buffer: AudioBuffer): OnsetCandidate[] {
  const hopSize = Math.max(768, Math.floor(buffer.sampleRate * 0.045));
  const windowSize = hopSize * 2;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const frameCount = Math.max(0, Math.floor((buffer.length - windowSize) / hopSize));
  const rmsValues: number[] = [];

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hopSize;
    let sum = 0;
    let samples = 0;

    for (const channel of channels) {
      for (let index = 0; index < windowSize; index += 2) {
        const value = channel[start + index] ?? 0;
        sum += value * value;
        samples += 1;
      }
    }

    rmsValues.push(Math.sqrt(sum / Math.max(samples, 1)));
  }

  const fluxValues = rmsValues.map((rms, index) => Math.max(0, rms - (rmsValues[index - 1] ?? rms)));
  const rmsMean = mean(rmsValues);
  const fluxMean = mean(fluxValues);
  const fluxStd = standardDeviation(fluxValues, fluxMean);
  const threshold = fluxMean + fluxStd * 0.72;
  const candidates: OnsetCandidate[] = [];

  for (let index = 2; index < fluxValues.length - 2; index += 1) {
    const flux = fluxValues[index];
    const time = (index * hopSize) / buffer.sampleRate;
    if (time < 0.35 || time > buffer.duration - 0.2) continue;
    if (rmsValues[index] < rmsMean * 0.65) continue;
    if (flux < threshold) continue;
    if (flux < fluxValues[index - 1] || flux < fluxValues[index + 1]) continue;

    candidates.push({
      time,
      strength: flux * 1.6 + rmsValues[index] * 0.55,
      rms: rmsValues[index],
    });
  }

  if (candidates.length >= 8) return candidates;

  return buildRmsPeakCandidates(rmsValues, hopSize, buffer.sampleRate, buffer.duration);
}

function buildRmsPeakCandidates(rmsValues: number[], hopSize: number, sampleRate: number, duration: number): OnsetCandidate[] {
  const rmsMean = mean(rmsValues);
  const candidates: OnsetCandidate[] = [];

  for (let index = 2; index < rmsValues.length - 2; index += 1) {
    const rms = rmsValues[index];
    const time = (index * hopSize) / sampleRate;
    if (time < 0.35 || time > duration - 0.2) continue;
    if (rms < rmsMean * 1.08) continue;
    if (rms < rmsValues[index - 1] || rms < rmsValues[index + 1]) continue;
    candidates.push({ time, strength: rms, rms });
  }

  return candidates;
}

function selectPlayableOnsets(candidates: OnsetCandidate[], duration: number): OnsetCandidate[] {
  const targetCount = clamp(Math.round(duration * 2.25), 48, 720);
  const minGap = duration > 180 ? 0.22 : 0.18;
  const sortedByStrength = [...candidates].sort((a, b) => b.strength - a.strength);
  const selected: OnsetCandidate[] = [];

  for (const candidate of sortedByStrength) {
    if (selected.length >= targetCount) break;
    if (selected.some((item) => Math.abs(item.time - candidate.time) < minGap)) continue;
    selected.push(candidate);
  }

  const minimumUsefulCount = Math.min(36, Math.max(12, Math.floor(duration * 0.35)));
  if (selected.length >= minimumUsefulCount) {
    return selected.sort((a, b) => a.time - b.time);
  }

  return mergeFallbackGrid(selected, duration, minGap).sort((a, b) => a.time - b.time);
}

function mergeFallbackGrid(selected: OnsetCandidate[], duration: number, minGap: number): OnsetCandidate[] {
  const merged = [...selected];
  const step = duration > 140 ? 0.5 : 0.42;

  for (let time = 0.65; time < duration - 0.4; time += step) {
    if (merged.some((item) => Math.abs(item.time - time) < minGap)) continue;
    merged.push({ time, strength: 0.28, rms: 0.28 });
  }

  return merged;
}

function buildFallbackNotes(duration: number): GameNote[] {
  const fallbackCandidates: OnsetCandidate[] = [];
  for (let time = 0.7; time < duration - 0.5; time += 0.5) {
    fallbackCandidates.push({ time, strength: 0.3, rms: 0.3 });
  }
  return buildNotes(fallbackCandidates);
}

function buildNotes(candidates: OnsetCandidate[]): GameNote[] {
  let previousLane = -1;

  return candidates.map((candidate, index) => {
    let lane = Math.abs(Math.floor(candidate.strength * 997 + index)) % LANE_LABELS.length;
    if (lane === previousLane) lane = (lane + 1 + (index % (LANE_LABELS.length - 1))) % LANE_LABELS.length;
    previousLane = lane;

    const midi = 76 + lane * 2;
    return {
      id: `mp3-spark-${index}`,
      time: candidate.time,
      duration: 0.16,
      type: "tap",
      midiNotes: [midi],
      playbackEvents: [
        {
          offset: 0,
          duration: 0.16,
          midiNotes: [midi],
          velocity: clamp(candidate.rms * 5, 0.42, 1),
        },
      ],
      label: "Shan",
      lane,
      velocity: clamp(candidate.rms * 5, 0.42, 1),
    };
  });
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], average: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
