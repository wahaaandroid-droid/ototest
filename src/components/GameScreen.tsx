import { useEffect, useMemo, useRef, useState } from "react";
import { AutoAccompanimentScheduler } from "../audio/scheduler";
import type { ActiveVoice, WebAudioFontEngine } from "../audio/webAudioFontPlayer";
import { judgeTiming, MISS_GRACE_MS } from "../game/judge";
import { applyJudgement, buildResult, createInitialScore } from "../game/score";
import type { GameChart, GameNote, GameResult, Judgement, MidiTrackInfo, ParsedMidiFile, ScoreStats, TimingSettings } from "../game/types";
import { formatDuration } from "../utils/format";
import { ChordButtons } from "./ChordButtons";
import { NoteLane, type HitEffect, type LanePressEffect } from "./NoteLane";

type GameScreenProps = {
  midi: ParsedMidiFile;
  chart: GameChart;
  playerTrack: MidiTrackInfo;
  audio: WebAudioFontEngine;
  timing: TimingSettings;
  onFinish: (result: GameResult) => void;
  onBack: () => void;
};

type RunState = "ready" | "loading" | "countdown" | "playing" | "paused" | "finished";

type NoteState = "pending" | "hit" | "miss";
type TimingDirection = "FAST" | "SLOW";
type LastJudgeFeedback = {
  judgement: Judgement | "Ready";
  timingDirection: TimingDirection | null;
  deltaMs: number | null;
};

const KEYBOARD_LABELS = ["A", "S", "D", "F", "J", "K", "L", ";"];
const COUNTDOWN_STEPS = ["3", "2", "1", "Go"] as const;
const COUNTDOWN_STEP_MS = 520;
const LANE_PRESS_EFFECT_MS = 220;
const FAR_MISS_DIRECTION_LIMIT_MS = 1000;

export function GameScreen({ midi, chart, playerTrack, audio, timing, onFinish, onBack }: GameScreenProps) {
  const [runState, setRunState] = useState<RunState>("ready");
  const [currentTime, setCurrentTime] = useState(0);
  const [stats, setStats] = useState<ScoreStats>(() => createInitialScore());
  const [noteStates, setNoteStates] = useState<Record<string, NoteState>>(() => buildInitialNoteStates(chart.notes));
  const [lastJudgeFeedback, setLastJudgeFeedback] = useState<LastJudgeFeedback>({
    judgement: "Ready",
    timingDirection: null,
    deltaMs: null,
  });
  const [audioError, setAudioError] = useState<string | null>(null);
  const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);
  const [lanePressEffects, setLanePressEffects] = useState<LanePressEffect[]>([]);
  const [countdownLabel, setCountdownLabel] = useState<string | null>(null);

  const schedulerRef = useRef<AutoAccompanimentScheduler | null>(null);
  const startedAtRef = useRef(0);
  const pausedAtRef = useRef(0);
  const currentTimeRef = useRef(0);
  const statsRef = useRef<ScoreStats>(createInitialScore());
  const noteStatesRef = useRef<Record<string, NoteState>>(buildInitialNoteStates(chart.notes));
  const animationRef = useRef<number | null>(null);
  const activeHoldsRef = useRef<Map<number, ActiveVoice[]>>(new Map());
  const finishedRef = useRef(false);
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const runStateRef = useRef<RunState>("ready");
  const hitEffectCounterRef = useRef(0);
  const hitEffectTimersRef = useRef<Set<number>>(new Set());
  const lanePressEffectCounterRef = useRef(0);
  const lanePressEffectTimersRef = useRef<Set<number>>(new Set());
  const countdownTimersRef = useRef<Set<number>>(new Set());
  const startTokenRef = useRef(0);
  const mountedRef = useRef(true);

  const remaining = Math.max(0, midi.duration - currentTime);
  const playableNotes = chart.notes.length;
  const trackRoles = useMemo(
    () =>
      midi.tracks.map((track) => ({
        ...track,
        role: track.id === playerTrack.id ? "player" : track.role,
      })),
    [midi.tracks, playerTrack.id],
  );

  useEffect(() => {
    runStateRef.current = runState;
  }, [runState]);

  useEffect(() => {
    mountedRef.current = true;

    const handleKeyDown = (event: KeyboardEvent) => {
      const lane = keyToLane(event.key, chart.laneLabels.length);
      if (lane === null || pressedKeysRef.current.has(event.key.toLowerCase())) return;
      event.preventDefault();
      pressedKeysRef.current.add(event.key.toLowerCase());
      handleLanePress(lane);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      const lane = keyToLane(event.key, chart.laneLabels.length);
      if (lane === null) return;
      event.preventDefault();
      pressedKeysRef.current.delete(event.key.toLowerCase());
      handleLaneRelease(lane);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      mountedRef.current = false;
      startTokenRef.current += 1;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      schedulerRef.current?.stop();
      activeHoldsRef.current.forEach((voices) => voices.forEach((voice) => voice.stop()));
      activeHoldsRef.current.clear();
      clearHitEffectTimers();
      clearLanePressEffectTimers();
      clearCountdownTimers();
    };
  }, []);

  async function startGame(offset = 0) {
    const token = startTokenRef.current + 1;
    startTokenRef.current = token;
    setAudioError(null);
    setRunState("loading");
    setCountdownLabel(null);
    currentTimeRef.current = offset;
    setCurrentTime(offset);
    if (offset === 0) {
      clearHitEffectTimers();
      clearLanePressEffectTimers();
      setHitEffects([]);
      setLanePressEffects([]);
      setJudgeFeedback("Ready", null);
    }

    try {
      await audio.preloadTrack(playerTrack);
      schedulerRef.current = new AutoAccompanimentScheduler({ audio, tracks: trackRoles, timing });
      await schedulerRef.current.preload();
      const shouldStart = await runCountdown(token);
      if (!shouldStart) return;
      schedulerRef.current.startPrepared(offset);
      startedAtRef.current = performance.now() - offset * 1000;
      pausedAtRef.current = 0;
      finishedRef.current = false;
      setRunState("playing");
      setCountdownLabel(null);
      animate();
    } catch (error) {
      if (token !== startTokenRef.current || !mountedRef.current) return;
      setRunState(offset > 0 ? "paused" : "ready");
      setAudioError(error instanceof Error ? error.message : "音源の初期化に失敗しました。");
    }
  }

  async function runCountdown(token: number): Promise<boolean> {
    setCountdownLabel(COUNTDOWN_STEPS[0]);
    setRunState("countdown");

    for (const step of COUNTDOWN_STEPS) {
      if (token !== startTokenRef.current || !mountedRef.current) return false;
      setCountdownLabel(step);
      await waitCountdownStep(COUNTDOWN_STEP_MS);
    }

    if (token !== startTokenRef.current || !mountedRef.current) return false;
    return true;
  }

  function waitCountdownStep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        countdownTimersRef.current.delete(timer);
        resolve();
      }, ms);
      countdownTimersRef.current.add(timer);
    });
  }

  function pauseGame() {
    if (runState !== "playing") return;
    pausedAtRef.current = currentTimeRef.current;
    schedulerRef.current?.stop();
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    setRunState("paused");
  }

  function resumeGame() {
    void startGame(pausedAtRef.current);
  }

  function animate() {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);

    const frame = () => {
      const elapsed = (performance.now() - startedAtRef.current) / 1000;
      currentTimeRef.current = elapsed;
      setCurrentTime(elapsed);
      markLateMisses(elapsed);

      if (!finishedRef.current && elapsed >= midi.duration + 1.1) {
        finishGame();
        return;
      }

      animationRef.current = requestAnimationFrame(frame);
    };

    animationRef.current = requestAnimationFrame(frame);
  }

  function handleLanePress(lane: number) {
    if (runStateRef.current !== "playing") return;

    showLanePressEffect(lane);
    const inputTime = currentTimeRef.current + timing.inputJudgeOffsetMs / 1000;
    const candidate = findCandidateNote(chart.notes, noteStatesRef.current, lane, inputTime);
    if (!candidate) {
      const nearest = findNearestLaneNote(chart.notes, lane, inputTime);
      const nearestDeltaMs = nearest ? notePlaybackDeltaMs(nearest, inputTime) : null;
      setJudgeFeedback("Miss", nearestDeltaMs !== null && Math.abs(nearestDeltaMs) <= FAR_MISS_DIRECTION_LIMIT_MS ? nearestDeltaMs : null);
      playLaneFeedback(lane, inputTime, nearest ?? undefined);
      return;
    }

    const deltaMs = (inputTime - candidate.time) * 1000;
    const judgement = judgeTiming(deltaMs);
    if (judgement === "Miss") {
      markNote(candidate, "miss", "Miss", deltaMs);
      playLaneFeedback(lane, inputTime, candidate);
      return;
    }

    markNote(candidate, "hit", judgement, deltaMs);
    handleLaneRelease(lane);
    void audio.playGameNote(candidate, playerTrack).then((voices) => {
      if (candidate.type === "hold") activeHoldsRef.current.set(lane, voices);
    });
  }

  function playLaneFeedback(lane: number, inputTime: number, preferredNote?: GameNote) {
    const source = preferredNote ?? findNearestLaneNote(chart.notes, lane, inputTime);
    if (!source) return;
    void audio.playGameNote(buildFeedbackNote(source, inputTime), playerTrack);
  }

  function handleLaneRelease(lane: number) {
    const voices = activeHoldsRef.current.get(lane);
    if (!voices) return;
    voices.forEach((voice) => voice.stop());
    activeHoldsRef.current.delete(lane);
  }

  function markNote(note: GameNote, state: NoteState, judgement: Judgement, deltaMs: number | null = null) {
    if (noteStatesRef.current[note.id] !== "pending") return;
    noteStatesRef.current = {
      ...noteStatesRef.current,
      [note.id]: state,
    };
    statsRef.current = applyJudgement(statsRef.current, judgement);
    setNoteStates(noteStatesRef.current);
    setStats(statsRef.current);
    setJudgeFeedback(judgement, deltaMs);
    if (state === "hit" && judgement !== "Miss") {
      showHitEffect(note, judgement);
    }
  }

  function setJudgeFeedback(judgement: Judgement | "Ready", deltaMs: number | null) {
    setLastJudgeFeedback({
      judgement,
      deltaMs,
      timingDirection: buildTimingDirection(judgement, deltaMs),
    });
  }

  function showHitEffect(note: GameNote, judgement: Exclude<Judgement, "Miss">) {
    const id = `hit-${note.id}-${hitEffectCounterRef.current}`;
    hitEffectCounterRef.current += 1;
    const effect: HitEffect = {
      id,
      lane: note.lane,
      judgement,
    };
    setHitEffects((current) => [...current.slice(-12), effect]);

    const timer = window.setTimeout(() => {
      hitEffectTimersRef.current.delete(timer);
      setHitEffects((current) => current.filter((item) => item.id !== id));
    }, 620);
    hitEffectTimersRef.current.add(timer);
  }

  function showLanePressEffect(lane: number) {
    const id = `press-${lane}-${lanePressEffectCounterRef.current}`;
    lanePressEffectCounterRef.current += 1;
    const effect: LanePressEffect = {
      id,
      lane,
    };
    setLanePressEffects((current) => [...current.slice(-10), effect]);

    const timer = window.setTimeout(() => {
      lanePressEffectTimersRef.current.delete(timer);
      setLanePressEffects((current) => current.filter((item) => item.id !== id));
    }, LANE_PRESS_EFFECT_MS);
    lanePressEffectTimersRef.current.add(timer);
  }

  function clearHitEffectTimers() {
    hitEffectTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    hitEffectTimersRef.current.clear();
  }

  function clearLanePressEffectTimers() {
    lanePressEffectTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    lanePressEffectTimersRef.current.clear();
  }

  function clearCountdownTimers() {
    countdownTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    countdownTimersRef.current.clear();
  }

  function markLateMisses(elapsed: number) {
    let changed = false;
    let nextStates = noteStatesRef.current;
    let nextStats = statsRef.current;

    for (const note of chart.notes) {
      if (nextStates[note.id] !== "pending") continue;
      if ((elapsed - note.time) * 1000 > MISS_GRACE_MS) {
        nextStates = {
          ...nextStates,
          [note.id]: "miss",
        };
        nextStats = applyJudgement(nextStats, "Miss");
        changed = true;
      }
    }

    if (changed) {
      noteStatesRef.current = nextStates;
      statsRef.current = nextStats;
      setNoteStates(nextStates);
      setStats(nextStats);
      setJudgeFeedback("Miss", null);
    }
  }

  function finishGame() {
    finishedRef.current = true;
    startTokenRef.current += 1;
    clearCountdownTimers();
    schedulerRef.current?.stop();
    audio.stopAll();
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    setRunState("finished");
    onFinish(buildResult(statsRef.current, playableNotes));
  }

  return (
    <main className="game-screen">
      <header className="game-hud">
        <button className="ghost-button" type="button" onClick={onBack}>
          終了
        </button>
        <HudMetric label="Score" value={String(stats.score)} />
        <HudMetric label="Combo" value={String(stats.combo)} />
        <HudMetric label="Time" value={formatDuration(remaining)} />
        <button
          className="ghost-button"
          type="button"
          onClick={runState === "playing" ? pauseGame : resumeGame}
          disabled={runState === "loading" || runState === "countdown"}
        >
          {runState === "playing" ? "Pause" : "Play"}
        </button>
      </header>

      <section className="judge-strip">
        <div className="judge-main">
          <span className={`judge-text ${lastJudgeFeedback.judgement.toLowerCase()}`}>{lastJudgeFeedback.judgement}</span>
          {lastJudgeFeedback.timingDirection ? (
            <span className={`judge-direction ${lastJudgeFeedback.timingDirection.toLowerCase()}`}>
              {lastJudgeFeedback.timingDirection}
              {lastJudgeFeedback.deltaMs !== null ? <small>{Math.round(Math.abs(lastJudgeFeedback.deltaMs))}ms</small> : null}
            </span>
          ) : null}
        </div>
        <span className="judge-track">{playerTrack.name}</span>
      </section>

      <NoteLane
        notes={chart.notes}
        laneLabels={chart.laneLabels}
        currentTime={currentTime}
        noteStates={noteStates}
        visualOffsetMs={timing.noteVisualOffsetMs}
        hitEffects={hitEffects}
        lanePressEffects={lanePressEffects}
      />

      {runState === "ready" || runState === "loading" ? (
        <div className="ready-overlay">
          <button className="primary-button" type="button" onClick={() => void startGame()} disabled={runState === "loading"}>
            {runState === "loading" ? "音源準備中..." : "Start"}
          </button>
          {audioError && <p className="error-text">{audioError}</p>}
        </div>
      ) : null}

      {runState === "paused" ? (
        <div className="ready-overlay">
          <button className="primary-button" type="button" onClick={resumeGame}>
            Resume
          </button>
        </div>
      ) : null}

      {runState === "countdown" ? (
        <div className="ready-overlay countdown-overlay" aria-live="polite">
          <strong>{countdownLabel}</strong>
        </div>
      ) : null}

      <ChordButtons
        labels={chart.laneLabels}
        keyboardLabels={KEYBOARD_LABELS}
        disabled={runState !== "playing"}
        onPress={handleLanePress}
        onRelease={handleLaneRelease}
      />
    </main>
  );
}

function HudMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="hud-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildInitialNoteStates(notes: GameNote[]): Record<string, NoteState> {
  return Object.fromEntries(notes.map((note) => [note.id, "pending" as NoteState]));
}

function findCandidateNote(notes: GameNote[], states: Record<string, NoteState>, lane: number, inputTime: number): GameNote | null {
  let best: GameNote | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const note of notes) {
    if (states[note.id] !== "pending" || note.lane !== lane) continue;
    const diff = Math.abs(note.time - inputTime);
    if (diff < bestDiff) {
      best = note;
      bestDiff = diff;
    }
  }

  return bestDiff <= 0.28 ? best : null;
}

function findNearestLaneNote(notes: GameNote[], lane: number, inputTime: number): GameNote | null {
  let best: GameNote | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const note of notes) {
    if (note.lane !== lane) continue;
    const diff = notePlaybackDistance(note, inputTime);
    if (diff < bestDiff) {
      best = note;
      bestDiff = diff;
    }
  }

  return best;
}

function notePlaybackDistance(note: GameNote, inputTime: number): number {
  return Math.abs(notePlaybackDeltaMs(note, inputTime) / 1000);
}

function notePlaybackDeltaMs(note: GameNote, inputTime: number): number {
  if (note.playbackEvents.length === 0) return (inputTime - note.time) * 1000;
  return note.playbackEvents.reduce((bestDelta, event) => {
    const delta = (inputTime - (note.time + event.offset)) * 1000;
    return Math.abs(delta) < Math.abs(bestDelta) ? delta : bestDelta;
  }, Number.POSITIVE_INFINITY);
}

function buildFeedbackNote(source: GameNote, inputTime: number): GameNote {
  const fallbackEvent = {
    offset: 0,
    duration: source.duration,
    midiNotes: source.midiNotes,
    velocity: source.velocity,
  };
  const event = (source.playbackEvents.length > 0 ? source.playbackEvents : [fallbackEvent]).reduce((best, next) =>
    Math.abs(source.time + next.offset - inputTime) < Math.abs(source.time + best.offset - inputTime) ? next : best,
  );
  const duration = Math.min(Math.max(event.duration, 0.18), 0.58);

  return {
    ...source,
    id: `${source.id}-feedback`,
    time: inputTime,
    duration,
    type: "tap",
    midiNotes: event.midiNotes,
    playbackEvents: [
      {
        offset: 0,
        duration,
        midiNotes: event.midiNotes,
        velocity: event.velocity,
      },
    ],
    velocity: event.velocity,
  };
}

function keyToLane(key: string, laneCount: number): number | null {
  const normalized = key.toLowerCase();
  const lane = KEYBOARD_LABELS.findIndex((label) => label.toLowerCase() === normalized);
  return lane >= 0 && lane < laneCount ? lane : null;
}

function buildTimingDirection(judgement: Judgement | "Ready", deltaMs: number | null): TimingDirection | null {
  if (judgement === "Ready" || judgement === "Perfect" || deltaMs === null || deltaMs === 0) return null;
  return deltaMs < 0 ? "FAST" : "SLOW";
}
