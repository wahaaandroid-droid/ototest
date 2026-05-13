import type { Judgement } from "./types";

export const JUDGE_WINDOWS_MS = {
  Perfect: 50,
  Great: 100,
  Good: 160,
};

export const MISS_GRACE_MS = 190;

export function judgeTiming(deltaMs: number): Judgement {
  const diff = Math.abs(deltaMs);
  if (diff <= JUDGE_WINDOWS_MS.Perfect) return "Perfect";
  if (diff <= JUDGE_WINDOWS_MS.Great) return "Great";
  if (diff <= JUDGE_WINDOWS_MS.Good) return "Good";
  return "Miss";
}
