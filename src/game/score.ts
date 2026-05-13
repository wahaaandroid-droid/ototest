import type { GameResult, Judgement, ScoreStats } from "./types";

export const BASE_SCORE: Record<Judgement, number> = {
  Perfect: 1000,
  Great: 700,
  Good: 400,
  Miss: 0,
};

export function createInitialScore(): ScoreStats {
  return {
    score: 0,
    combo: 0,
    maxCombo: 0,
    Perfect: 0,
    Great: 0,
    Good: 0,
    Miss: 0,
  };
}

export function applyJudgement(stats: ScoreStats, judgement: Judgement): ScoreStats {
  const nextCombo = judgement === "Miss" ? 0 : stats.combo + 1;
  const comboMultiplier = judgement === "Miss" ? 1 : 1 + Math.min(stats.combo, 50) * 0.01;

  return {
    ...stats,
    score: stats.score + Math.round(BASE_SCORE[judgement] * comboMultiplier),
    combo: nextCombo,
    maxCombo: Math.max(stats.maxCombo, nextCombo),
    [judgement]: stats[judgement] + 1,
  };
}

export function buildResult(stats: ScoreStats, totalNotes: number): GameResult {
  const hitRate = totalNotes === 0 ? 0 : (stats.Perfect + stats.Great * 0.8 + stats.Good * 0.5) / totalNotes;
  let rank = "D";
  if (hitRate >= 0.98) rank = "S";
  else if (hitRate >= 0.9) rank = "A";
  else if (hitRate >= 0.78) rank = "B";
  else if (hitRate >= 0.62) rank = "C";

  return {
    ...stats,
    rank,
    totalNotes,
  };
}
